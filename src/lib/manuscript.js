/** Speaker label used for the post author in comment threads. */
export const AUTHOR = '작성자';

const TITLE_PREFIX = /^\s*제목\s*[:：]\s*/;
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
 * Parse a manuscript file into title, body and comment threads.
 * Handles both `제목:` prefixed titles and files whose first line is the title,
 * and both `└` and `ㄴ` reply marks, inline or on their own line.
 * @param {string} raw - File contents.
 * @returns {{ title: string, body: string, comments: { index: number,
 *   thread: { by: 'commenter' | 'author', text: string }[] }[] }} Structured manuscript.
 */
export const parseManuscript = (raw) => {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map(clean);

  /** @type {{ index: number, thread: { by: 'commenter' | 'author', text: string }[] }[]} */
  const comments = [];
  /** @type {string[]} */
  const bodyLines = [];
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

      title = TITLE_PREFIX.test(text) ? text.replace(TITLE_PREFIX, '').trim() : text;

      return;
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
    body: bodyLines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    comments: comments
      .filter((comment) => comment.thread.length)
      .map((comment, order) => ({ ...comment, index: comment.index || order + 1 })),
  };
};

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
