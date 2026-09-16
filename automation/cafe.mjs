/**
 * What Naver calls things changes now and then, so every selector the uploader
 * needs lives here. If a step stops working, this is the only file to touch.
 */

/** The editor Naver uses for writing a new article sits in an iframe. */
export const WRITE_FRAME = 'iframe#cafe_main, iframe[name="cafe_main"]';

export const SELECTORS = {
  writeButton: 'a:has-text("글쓰기"), button:has-text("글쓰기")',
  titleInput: 'textarea.textarea_input, input.textarea_input, .article_header textarea',
  bodyEditor: '.se-content .se-text-paragraph, .se-component-content, div.ProseMirror',
  submitArticle: 'a:has-text("등록"), button:has-text("등록")',
  commentBox: 'textarea#cmtinput, textarea.comment_inbox_text, .comment_inbox textarea',
  commentSubmit:
    '.btn_register:has-text("등록"), a.button:has-text("등록"), button:has-text("등록")',
  commentItem: 'li.CommentItem, .comment_list li',
  replyButton: 'a:has-text("답글"), button:has-text("답글")',
};

/**
 * Get the frame the cafe draws its pages in, falling back to the page itself.
 * @param {import('playwright').Page} page - Open page.
 * @returns {Promise<import('playwright').Frame | import('playwright').Page>} Frame to work in.
 */
export async function cafeFrame(page) {
  const handle = await page.$(WRITE_FRAME);

  if (!handle) {
    return page;
  }

  return (await handle.contentFrame()) ?? page;
}

/**
 * Type text into the article editor, keeping the line breaks.
 * @param {import('playwright').Frame | import('playwright').Page} frame - Editor frame.
 * @param {string} selector - Editor selector.
 * @param {string} text - Text to type.
 * @returns {Promise<void>} Resolves once typed.
 */
export async function typeParagraphs(frame, selector, text) {
  const editor = frame.locator(selector).first();

  await editor.click();

  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]) {
      // eslint-disable-next-line no-await-in-loop
      await frame.page().keyboard.type(lines[index], { delay: 12 });
    }

    if (index < lines.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await frame.page().keyboard.press('Enter');
    }
  }
}
