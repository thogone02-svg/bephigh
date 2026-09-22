/*
 * 게시판 주소를 읽어서 글쓰기 주소를 만드는 곳.
 *
 * 네이버 카페 주소는 모양이 여러 가지예요.
 *   새 카페   https://cafe.naver.com/ca-fe/cafes/22014230/menus/31   ← 지금 살아 있는 주소
 *   옛 새카페 https://cafe.naver.com/f-e/cafes/22014230/menus/31    ← 이제 막혔어요
 *   옛 카페   https://cafe.naver.com/카페이름?iframe_url=/ArticleList.nhn%3Fsearch.clubid%3D...
 *   옛 카페2  https://cafe.naver.com/ArticleList.nhn?search.clubid=...&search.menuid=31
 *   짧은 주소 https://cafe.naver.com/카페이름
 *
 * 카페 번호와 게시판 번호만 알아내면 글쓰기 주소를 바로 만들 수 있어요.
 * 번호를 못 찾으면 그 페이지에서 글쓰기 링크를 찾아 들어갑니다.
 */

const NEW_BOARD = /\/(?:f-e|ca-fe)\/cafes\/(\d+)\/menus\/(\d+)/;
const NEW_ANY = /\/(?:f-e|ca-fe)\/cafes\/(\d+)/;
const CLUB = /clubid[=:]"?(\d+)/i;
const MENU = /menuid[=:]"?(\d+)/i;

/**
 * Build the write page address from the two numbers.
 *
 * 「ca-fe」 여야 합니다. 「f-e」 로 가면 네이버가 「서비스에 접속할 수 없습니다」를 줘요.
 * @param {string} clubId - Cafe number.
 * @param {string} menuId - Board number.
 * @param {string} [home] - Where the cafe lives. Only tests change this.
 * @returns {string} Address of the write page.
 */
export const writeUrl = (clubId, menuId, home = 'https://cafe.naver.com') =>
  `${home}/ca-fe/cafes/${clubId}/menus/${menuId}/articles/write`;

/**
 * Work out what kind of board address this is.
 * @param {string} url - Board address the person pasted.
 * @returns {{ kind: 'new' | 'old', clubId?: string, menuId?: string, home: string,
 *   board: string, write: string | null }} What we can tell from it.
 */
export function readBoard(url) {
  const board = String(url ?? '');
  let home = 'https://cafe.naver.com';
  let plain = board;

  try {
    home = new URL(board).origin;
  } catch {
    home = 'https://cafe.naver.com';
  }

  // 옛 주소는 게시판 번호가 %3D 처럼 꼬여 있어요. 풀어서 봅니다.
  try {
    plain = decodeURIComponent(board);
  } catch {
    plain = board;
  }

  const fresh = plain.match(NEW_BOARD);

  if (fresh) {
    const [, clubId, menuId] = fresh;

    return { kind: 'new', clubId, menuId, home, board, write: writeUrl(clubId, menuId, home) };
  }

  const clubId = plain.match(CLUB)?.[1] ?? plain.match(NEW_ANY)?.[1] ?? '';
  const menuId = plain.match(MENU)?.[1] ?? '';

  if (clubId && menuId) {
    return { kind: 'old', clubId, menuId, home, board, write: writeUrl(clubId, menuId, home) };
  }

  // 번호가 모자라면 그 페이지를 열어서 찾아야 해요.
  return { kind: 'old', clubId, menuId, home, board, write: null };
}

/**
 * Build the address of one article on the new cafe.
 * @param {string} clubId - Cafe number.
 * @param {string} articleId - Article number.
 * @param {string} [home] - Where the cafe lives. Only tests change this.
 * @returns {string} Address.
 */
export const articleUrl = (clubId, articleId, home = 'https://cafe.naver.com') =>
  `${home}/ca-fe/cafes/${clubId}/articles/${articleId}`;

/**
 * Pull the article number out of whatever address the browser ended up on.
 * @param {string} url - Address after posting.
 * @returns {string} Article number, or an empty string.
 */
export const articleIdFrom = (url) =>
  String(url ?? '').match(/\/articles\/(\d+)/)?.[1] ??
  String(url ?? '').match(/articleid=(\d+)/i)?.[1] ??
  '';
