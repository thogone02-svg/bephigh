/** Speaker label used for the post author in comment threads. */
export const AUTHOR = '작성자';

const TITLE_PREFIX = /^\s*제목\s*[:：]\s*/;
/** 첫 줄이 「제목1:」 로 오는 모델도 있어요. 번호가 붙어도 제목으로 읽습니다. */
const ANY_TITLE = /^\s*제목\s*\d*\s*[:：]\s*/;
/** 「제목2:」 「제목3:」 은 담당자가 골라 쓸 다른 제목안이에요. */
const ALT_TITLE = /^\s*제목\s*\d+\s*[:：]\s*(\S.*)$/;
const COMMENT_HEAD = /^\s*(?:댓글\s*(\d+)|(\d+)\s*[.)])\s*[:：]?\s*(.*)$/;
const REPLY_HEAD = /^\s*[└ㄴ↳>-]\s*(.*)$/;
const AUTHOR_LABEL = new RegExp(`^(?:${AUTHOR}|글쓴이|작성자님)\\s*[:：]?\\s*`);
const COMMENTER_LABEL = /^댓글\s*\d+\s*[:：]?\s*/;
const DECORATION = /[*_`]{1,3}/g;

/**
 * Strip document formatting marks that survive a Google Docs or Word import.
 * @param {string} value - Raw line.
 * @returns {string} Clean line.
 */
const clean = (value) =>
  String(value ?? '')
    .replace(DECORATION, '')
    .replace(/\\([\\*_[\]!])/g, '$1')
    .replace(/\u00a0/g, ' ')
    .trimEnd();

/**
 * Give every comment its own number.
 *
 * 파일에 같은 번호가 두 번 나오면 화면에 댓글1이 두 개 보여서 어느 게 어느
 * 세트인지 알 수 없어요. 겹치는 번호가 있으면 처음부터 다시 매깁니다.
 * @param {{ index: number, thread: any[] }[]} comments - Parsed comments.
 * @returns {{ index: number, thread: any[] }[]} Comments with unique numbers.
 */
const renumber = (comments) => {
  const numbers = comments.map((comment, order) => comment.index || order + 1);
  const clashed = new Set(numbers).size !== numbers.length;

  return comments.map((comment, order) => ({
    ...comment,
    index: clashed ? order + 1 : numbers[order],
  }));
};

/**
 * Parse one manuscript into title, body and comment threads.
 * Handles both `제목:` prefixed titles and files whose first line is the title,
 * and both `└` and `ㄴ` reply marks, inline or on their own line.
 * @param {string} raw - One manuscript.
 * @returns {{ title: string, alts: string[], body: string, comments: { index: number,
 *   thread: { by: 'commenter' | 'author', text: string }[] }[] }} Structured manuscript.
 */
const parseOne = (raw) => {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map(clean);

  /** @type {{ index: number, thread: { by: 'commenter' | 'author', text: string }[] }[]} */
  const comments = [];
  /** @type {string[]} */
  const bodyLines = [];
  /** @type {string[]} */
  const alts = [];
  let title = '';
  let inComments = false;
  /** @type {{ by: 'commenter' | 'author', text: string } | null} */
  let turn = null;

  /**
   * Close the turn being collected and attach it to the last comment.
   */
  const flush = () => {
    if (turn && turn.text.trim() && comments.length) {
      comments[comments.length - 1].thread.push({ by: turn.by, text: turn.text.trim() });
    }

    turn = null;
  };

  lines.forEach((line) => {
    const text = line.trim();

    if (!title) {
      if (!text) {
        return;
      }

      title = ANY_TITLE.test(text) ? text.replace(ANY_TITLE, '').trim() : text;

      return;
    }

    // 제목 바로 아래에 붙은 다른 제목안. 본문이 시작되기 전까지만 봅니다.
    if (!inComments && !bodyLines.some((earlier) => earlier.trim())) {
      const another = text.match(ALT_TITLE);

      if (another) {
        alts.push(another[1].trim());

        return;
      }
    }

    const head = text.match(COMMENT_HEAD);

    if (head && !REPLY_HEAD.test(text)) {
      flush();
      inComments = true;
      comments.push({ index: Number(head[1] ?? head[2]), thread: [] });

      if (head[3]) {
        turn = { by: 'commenter', text: head[3] };
      }

      return;
    }

    if (inComments) {
      const reply = text.match(REPLY_HEAD);

      if (reply) {
        flush();

        const rest = reply[1] ?? '';
        const isAuthor = AUTHOR_LABEL.test(rest);
        const body = rest.replace(isAuthor ? AUTHOR_LABEL : COMMENTER_LABEL, '');

        turn = { by: isAuthor ? 'author' : 'commenter', text: body };

        return;
      }

      if (!text) {
        return;
      }

      if (turn) {
        turn.text = turn.text ? `${turn.text}\n${text}` : text;
      } else if (comments.length) {
        turn = { by: 'commenter', text };
      }

      return;
    }

    bodyLines.push(line);
  });

  flush();

  return {
    title,
    alts,
    body: bodyLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    comments: renumber(comments.filter((comment) => comment.thread.length)),
  };
};

/** A `제목:` line partway through a file starts the next manuscript. */
const TITLE_LINE = /^\s*제목\s*[:：]\s*\S/;

/**
 * Cut a file into the manuscripts it holds.
 *
 * 구글 문서에서 받아온 파일에는 원고가 여러 편 들어 있는 경우가 많아요.
 * 그냥 읽으면 두 번째 원고가 앞 원고의 댓글 안으로 딸려 들어갑니다.
 * @param {string} raw - File contents.
 * @returns {string[]} One string per manuscript.
 */
export const splitManuscripts = (raw) => {
  /** @type {string[][]} */
  const chunks = [];
  /** @type {string[]} */
  let current = [];

  String(raw ?? '')
    .split(/\r?\n/)
    .forEach((line) => {
      // 앞에 이미 내용이 있을 때만 새 원고로 봅니다. 파일 첫 줄은 경계가 아니에요.
      if (TITLE_LINE.test(line) && current.some((earlier) => earlier.trim())) {
        chunks.push(current);
        current = [];
      }

      current.push(line);
    });

  chunks.push(current);

  return chunks.map((chunk) => chunk.join('\n')).filter((chunk) => chunk.trim());
};

/**
 * Read every manuscript a file holds.
 * @param {string} raw - File contents.
 * @returns {ReturnType<typeof parseOne>[]} One entry per manuscript.
 */
export const parseManuscripts = (raw) =>
  splitManuscripts(raw)
    .map(parseOne)
    .filter((entry) => entry.title && (entry.body || entry.comments.length));

/**
 * Read the first manuscript a file holds.
 * @param {string} raw - File contents.
 * @returns {ReturnType<typeof parseOne>} Structured manuscript.
 */
export const parseManuscript = (raw) => parseManuscripts(raw)[0] ?? parseOne(raw);

/**
 * Render a manuscript back into the plain text that gets copied or saved.
 * @param {{ title?: string, body?: string, comments?: { index?: number,
 *   photoAt?: number, thread?: { by: string, text: string }[] }[] }} doc - Manuscript.
 * @returns {string} Text ready to paste into a cafe editor.
 */
export const renderManuscript = (doc) => {
  const { title = '', body = '', comments = [] } = doc ?? {};
  const blocks = [`제목: ${title}`, '', body, ''];

  comments.forEach((comment, order) => {
    const index = comment.index ?? order + 1;
    const label = `댓글${index}`;

    blocks.push(label);
    (comment.thread ?? []).forEach((turn, position) => {
      const who = turn.by === 'author' ? AUTHOR : label;

      blocks.push(position === 0 ? turn.text : `ㄴ ${who}\n${turn.text}`);

      if (comment.photoAt === position) {
        blocks.push('(댓글 사진 여기에 첨부해주세요)');
      }
    });
    blocks.push('');
  });

  return blocks
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Derive the keyword from a manuscript file name.
 * @param {string} fileName - File name such as `브라질리언 왁싱 모낭염.txt`.
 * @returns {string} Keyword.
 */
export const keywordFromFileName = (fileName) => {
  const NOISE = /^(원고|최종|최종본|수정|수정본|복사본|사본|초안|완료|v\d+|\d{2,8}|\(\d+\))$/i;

  return String(fileName ?? '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\((\d+)\)/g, ' ')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/v\d+$/i, ''))
    .filter((word) => word && !NOISE.test(word))
    .join(' ')
    .replace(/(원고|최종본|최종|수정본|복사본)$/, '')
    .trim();
};
