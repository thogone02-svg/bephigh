/*
 * 게시판 주소를 읽어서 글쓰기 주소를 만드는 곳.
 *
 * 네이버 카페에는 두 가지 주소 모양이 있어요.
 *   새 카페  https://cafe.naver.com/f-e/cafes/22014230/menus/31
 *   옛 카페  https://cafe.naver.com/카페이름?iframe_url=/ArticleList.nhn%3F...
 * 새 카페는 글쓰기 주소로 바로 갈 수 있어서 단추를 찾을 필요가 없습니다.
 */

const NEW_BOARD = /\/f-e\/cafes\/(\d+)\/menus\/(\d+)/;
const NEW_ANY = /\/f-e\/cafes\/(\d+)/;

/**
 * Work out what kind of board address this is.
 * @param {string} url - Board address the person pasted.
 * @returns {{ kind: 'new' | 'old', clubId?: string, menuId?: string, board: string,
 *   write: string | null }} What we can tell from it.
 */
export function readBoard(url) {
  const address = String(url ?? '');
  const board = address;
  const fresh = address.match(NEW_BOARD);

  if (fresh) {
    const [, clubId, menuId] = fresh;

    return {
      kind: 'new',
      clubId,
      menuId,
      board,
      write: `https://cafe.naver.com/f-e/cafes/${clubId}/menus/${menuId}/articles/write`,
    };
  }

  const anyNew = address.match(NEW_ANY);

  if (anyNew) {
    // 게시판 번호가 없으면 글쓰기에서 직접 골라야 해요.
    return { kind: 'new', clubId: anyNew[1], board, write: null };
  }

  return { kind: 'old', board, write: null };
}

/**
 * Build the address of one article on the new cafe.
 * @param {string} clubId - Cafe number.
 * @param {string} articleId - Article number.
 * @returns {string} Address.
 */
export const articleUrl = (clubId, articleId) =>
  `https://cafe.naver.com/f-e/cafes/${clubId}/articles/${articleId}`;

/**
 * Pull the article number out of whatever address the browser ended up on.
 * @param {string} url - Address after posting.
 * @returns {string} Article number, or an empty string.
 */
export const articleIdFrom = (url) =>
  String(url ?? '').match(/\/articles\/(\d+)/)?.[1] ??
  String(url ?? '').match(/articleid=(\d+)/i)?.[1] ??
  '';
