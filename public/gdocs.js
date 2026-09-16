const SCOPE = 'https://www.googleapis.com/auth/documents';
const GIS = 'https://accounts.google.com/gsi/client';
let tokenClient = null;
let accessToken = '';

/**
 * Load the Google Identity Services script once.
 * @returns {Promise<void>} Resolves when the script is ready.
 * @throws {Error} When the script cannot be loaded.
 */
const loadGis = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();

      return;
    }

    const script = document.createElement('script');

    script.src = GIS;
    script.async = true;
    /**
     *
     */
    script.onload = () => resolve();
    /**
     *
     */
    script.onerror = () => reject(new Error('구글 로그인 창을 불러오지 못했어요.'));
    document.head.append(script);
  });

/**
 * Ask Google for an access token, showing the consent window when needed.
 * @param {string} clientId - Google OAuth client id.
 * @returns {Promise<string>} Access token.
 * @throws {Error} When the user cancels or Google refuses.
 */
export const connect = async (clientId) => {
  if (!clientId) {
    throw new Error('설정에서 구글 클라이언트 ID를 먼저 넣어 주세요.');
  }

  await loadGis();

  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      /**
       * @param response
       */
      callback: (response) => {
        if (response.error) {
          reject(new Error(`구글 연결이 취소됐어요. (${response.error})`));

          return;
        }

        accessToken = response.access_token;
        resolve(accessToken);
      },
      /**
       *
       */
      error_callback: () => reject(new Error('구글 연결 창이 닫혔어요.')),
    });
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
};

/**
 * Call the Docs API.
 * @param {string} path - Path after `/v1/`.
 * @param {Record<string, any>} body - Request body.
 * @returns {Promise<any>} Parsed response.
 * @throws {Error} When Google rejects the call.
 */
const docsApi = async (path, body) => {
  const response = await fetch(`https://docs.googleapis.com/v1/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');

    if (response.status === 401 || response.status === 403) {
      throw new Error('구글 권한이 없어요. 다시 연결해 주세요.');
    }

    throw new Error(`구글 문서 오류(${response.status}) ${detail.slice(0, 160)}`);
  }

  return response.json();
};

/**
 * Create one Google Doc holding every chosen manuscript.
 * Each manuscript starts with its keyword as a heading, so the document outline
 * lists the keywords and jumping between them is one click.
 * @param {string} title - Document title.
 * @param {{ keyword: string, text: string }[]} sections - Manuscripts to write.
 * @returns {Promise<{ id: string, url: string }>} The new document.
 * @throws {Error} When Google rejects the call.
 */
export const createDoc = async (title, sections) => {
  const created = await docsApi('documents', { title });
  const id = created.documentId;
  let body = '';
  /** @type {{ start: number, end: number }[]} */
  const heads = [];

  sections.forEach(({ keyword, text }) => {
    const start = body.length;

    body += `${keyword}\n`;
    heads.push({ start, end: body.length });
    body += `${text}\n\n`;
  });

  // Text is inserted at index 1, so every offset shifts by one.
  const requests = [
    { insertText: { location: { index: 1 }, text: body } },
    ...heads.map((head) => ({
      updateParagraphStyle: {
        range: { startIndex: head.start + 1, endIndex: head.end + 1 },
        paragraphStyle: { namedStyleType: 'HEADING_1' },
        fields: 'namedStyleType',
      },
    })),
  ];

  await docsApi(`documents/${id}:batchUpdate`, { requests });

  return { id, url: `https://docs.google.com/document/d/${id}/edit` };
};
