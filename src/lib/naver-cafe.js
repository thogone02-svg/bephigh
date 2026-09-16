const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const API_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  Referer: 'https://m.cafe.naver.com/',
  Origin: 'https://m.cafe.naver.com',
};

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/**
 * Convert a fragment of cafe HTML into readable plain text.
 * @param {string} html - Source HTML.
 * @returns {string} Plain text with paragraph breaks preserved.
 */
export const htmlToText = (html) =>
  String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '· ')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Follow a `naver.me` short link to the real article address.
 * @param {URL} url - Short link.
 * @returns {Promise<URL>} Resolved address.
 */
const resolveShortLink = async (url) => {
  try {
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });

    return new URL(response.url);
  } catch {
    return url;
  }
};

/**
 * Extract the cafe and article identifiers from any Naver Cafe URL shape.
 * @param {string} rawUrl - URL pasted by the user.
 * @returns {Promise<{ cafeId?: string, clubUrl?: string, articleId?: string }>} Identifiers found.
 * @throws {Error} When the URL does not belong to Naver Cafe.
 */
export const parseCafeUrl = async (rawUrl) => {
  /** @type {URL} */
  let url;

  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new Error('주소 형식이 올바르지 않아요.');
  }

  if (/(^|\.)naver\.me$/.test(url.hostname)) {
    url = await resolveShortLink(url);
  }

  if (!/(^|\.)cafe\.naver\.com$/.test(url.hostname)) {
    throw new Error('네이버 카페(cafe.naver.com) 주소만 가져올 수 있어요.');
  }

  const search = url.searchParams;
  const iframe = search.get('iframe_url') ?? search.get('iframe_url_utf8') ?? '';
  const combined = `${url.pathname}?${url.search}&${decodeURIComponent(iframe)}`;

  const byQuery = {
    cafeId: combined.match(/[?&](?:clubid|cafeId|clubId)=(\d+)/i)?.[1],
    articleId: combined.match(/[?&](?:articleid|articleId)=(\d+)/i)?.[1],
  };

  // /ca-fe/cafes/12345/articles/678 and /f-e/cafes/12345/articles/678
  const numericPath = url.pathname.match(/cafes\/(\d+)\/articles\/(\d+)/);

  if (numericPath) {
    return { cafeId: numericPath[1], articleId: numericPath[2] };
  }

  // /clubUrl/articleId
  const namedPath = url.pathname.match(/^\/(?:ca-fe\/web\/)?([A-Za-z0-9_-]+)\/(\d+)/);

  if (namedPath && namedPath[1] !== 'ca-fe' && namedPath[1] !== 'f-e') {
    return { clubUrl: namedPath[1], articleId: namedPath[2] };
  }

  const clubUrl = url.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/)?.[1];

  if (byQuery.articleId) {
    return { ...byQuery, clubUrl: byQuery.cafeId ? undefined : clubUrl };
  }

  throw new Error('주소에서 글 번호를 못 찾았어요. 글을 연 상태의 주소를 넣어 주세요.');
};

/**
 * Fetch JSON from one of the public cafe endpoints.
 * @param {string} endpoint - Absolute URL.
 * @returns {Promise<any>} Parsed JSON, or `null` when the endpoint fails.
 */
const fetchJson = async (endpoint) => {
  try {
    const response = await fetch(endpoint, { headers: API_HEADERS });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Resolve the numeric cafe id from a vanity cafe address.
 * @param {string} clubUrl - Vanity address such as `mycafe`.
 * @returns {Promise<string | undefined>} Numeric cafe id.
 */
export const resolveCafeId = async (clubUrl) => {
  const data = await fetchJson(
    `https://apis.naver.com/cafe-web/cafe2/CafeInfo.json?cluburl=${encodeURIComponent(clubUrl)}`,
  );

  const result = data?.message?.result ?? data?.result ?? data;

  return result?.cafeId ? String(result.cafeId) : undefined;
};

/**
 * Group a flat comment list into threads, matching the manuscript shape.
 * Naver marks a reply with `refId` pointing at the comment it answers.
 * @param {any[]} items - Raw comment items.
 * @returns {{ index: number, thread: { by: 'commenter' | 'author', text: string }[] }[]} Threads.
 */
const toThreads = (items) => {
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item?.id ?? item?.commentId,
      parent: item?.refId ?? item?.parentId ?? null,
      writerId: item?.writer?.id ?? item?.writerId ?? '',
      isAuthor: Boolean(item?.isArticleWriter ?? item?.articleWriter),
      text: htmlToText(item?.content ?? item?.contentHtml ?? ''),
    }))
    .filter((row) => row.text);

  /** @type {Map<any, any[]>} */
  const children = new Map();

  rows.forEach((row) => {
    if (row.parent && row.parent !== row.id) {
      children.set(row.parent, [...(children.get(row.parent) ?? []), row]);
    }
  });

  return rows
    .filter((row) => !row.parent || row.parent === row.id)
    .map((root, order) => {
      const thread = [{ by: 'commenter', text: root.text }];

      (children.get(root.id) ?? []).forEach((child) => {
        const by = child.isAuthor || child.writerId === rows[0]?.writerId ? 'author' : 'commenter';

        thread.push({ by: child.isAuthor ? 'author' : by, text: child.text });
      });

      return { index: order + 1, thread };
    });
};

/**
 * Pull the comment list for an article.
 * @param {string} cafeId - Numeric cafe id.
 * @param {string} articleId - Numeric article id.
 * @returns {Promise<any[]>} Raw comment items.
 */
const fetchComments = async (cafeId, articleId) => {
  const data = await fetchJson(
    `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${cafeId}/articles/${articleId}` +
      '/comments/pages/1?requestFrom=A&orderBy=asc&page=1&size=100',
  );

  return data?.result?.comments?.items ?? data?.result?.comments ?? [];
};

/**
 * Read a Naver Cafe article through the public mobile endpoints.
 * @param {string} rawUrl - Article URL.
 * @returns {Promise<{ title: string, body: string,
 *   comments: { index: number, thread: { by: string, text: string }[] }[],
 *   cafeName: string, source: string }>} Collected article.
 * @throws {Error} When the article cannot be read.
 */
export const fetchCafeArticle = async (rawUrl) => {
  const parsed = await parseCafeUrl(rawUrl);

  const cafeId =
    parsed.cafeId ?? (parsed.clubUrl ? await resolveCafeId(parsed.clubUrl) : undefined);

  if (!cafeId || !parsed.articleId) {
    throw new Error('카페 정보를 찾지 못했어요. 게시글을 연 상태의 주소인지 확인해 주세요.');
  }

  const article = await fetchJson(
    `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${cafeId}` +
      `/articles/${parsed.articleId}?query=&useCafeId=true&requestFrom=A`,
  );

  const result = article?.result;

  if (!result?.article) {
    throw new Error(
      '주소만으로는 못 읽는 글이에요. 멤버 공개 글이거나 등급 제한이 걸린 글일 수 있어요. ' +
        '아래 수집 버튼이나 직접 붙여넣기를 써 주세요.',
    );
  }

  const inline = result.comments?.items ?? [];
  const items = inline.length ? inline : await fetchComments(cafeId, parsed.articleId);

  return {
    title: htmlToText(result.article.subject ?? ''),
    body: htmlToText(result.article.contentHtml ?? result.article.content ?? ''),
    comments: toThreads(items),
    cafeName: htmlToText(result.cafe?.name ?? result.cafeName ?? ''),
    source: String(rawUrl).trim(),
  };
};
