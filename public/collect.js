/*
 * 카페 수집 버튼 (북마클릿) 소스.
 * 이 파일은 그대로 실행되지 않고, 앱이 한 줄로 압축해 즐겨찾기 주소로 만들어 줍니다.
 * 카페 글을 연 상태에서 누르면 제목·본문·댓글을 읽어 클립보드에 복사합니다.
 */
(() => {
  const pick = (root, list) => list.map((s) => root.querySelector(s)).find(Boolean);
  const text = (node) => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script,style').forEach((n) => n.remove());
    clone.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
    clone.querySelectorAll('p,div,li').forEach((n) => n.append('\n'));
    return clone.textContent
      .replace(/ /g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const frame = document.querySelector('iframe#cafe_main');
  const root = frame ? frame.contentDocument : document;
  if (!root) return alert('카페 글 화면에서 눌러 주세요.');

  const title = text(pick(root, ['.title_text', '.tit-box h3', 'h3.title_text', '.ArticleTitle']));
  const body = text(
    pick(root, ['.se-main-container', '.ContentRenderer', '#postViewArea', '.article_viewer']),
  );
  if (!title && !body) return alert('글을 못 찾았어요. 글을 연 상태에서 다시 눌러 주세요.');

  const rows = [...root.querySelectorAll('.comment_list li, .CommentItem')];
  const lines = [];
  let n = 0;
  rows.forEach((row) => {
    const content = text(pick(row, ['.text_comment', '.comment_text_view', '.comment_content']));
    if (!content) return;
    const reply =
      row.className.includes('re') ||
      row.classList.contains('comment_reply') ||
      Boolean(row.querySelector('.comment_info_reply, .re_ico'));
    const writer = text(pick(row, ['.comment_nickname', '.CommentWriterInfo .nickname']));
    if (!reply) {
      n += 1;
      lines.push('', `댓글${n}`, content);
    } else lines.push(`ㄴ ${writer || '작성자'}`, content);
  });

  const out = [`제목: ${title}`, '', body, ...lines].join('\n').trim();
  navigator.clipboard.writeText(out).then(
    () => alert(`복사했어요. 작업실의 "직접 붙여넣기"에 붙여넣어 주세요.\n\n댓글 ${n}개`),
    () => {
      window.prompt('아래 내용을 복사해 주세요', out);
    },
  );
})();
