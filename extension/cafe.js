/*
 * 카페 화면에서 실제로 글과 댓글을 넣는 일을 하는 쪽.
 *
 * 네이버 카페는 화면 구조가 가끔 바뀌어요. 찾는 자리를 여기 한곳에 모아 두었으니
 * 안 되면 이 파일만 고치면 됩니다.
 */

const SELECTORS = {
  writeButton: ['a.cafe-write-btn', 'a[href*="ArticleWrite"]', '.btn_write', 'button.write'],
  titleInput: ['textarea.textarea_input', 'input.textarea_input', '.article_header textarea'],
  bodyEditor: ['.se-content .se-text-paragraph', '.se-component-content', 'div.ProseMirror'],
  submitArticle: ['.BaseButton--skinGreen', 'a.BaseButton', 'button[class*="publish"]'],
  commentBox: ['textarea#cmtinput', 'textarea.comment_inbox_text', '.comment_inbox textarea'],
  commentSubmit: ['.btn_register', 'a.button[class*="register"]', 'button[class*="register"]'],
  commentItem: ['li.CommentItem', '.comment_list li'],
  replyButton: ['.comment_info_button', 'a[class*="reply"]'],
};

/**
 * Wait until one of the given selectors shows up.
 * @param {string[]} list - Selectors to try, best first.
 * @param {number} [waitMs] - How long to keep looking.
 * @returns {Promise<Element|null>} The element, or null when it never appeared.
 */
async function find(list, waitMs = 12000) {
  const until = Date.now() + waitMs;

  while (Date.now() < until) {
    for (const selector of list) {
      const found = [...document.querySelectorAll(selector)].find(
        (node) => node.offsetParent !== null || node.getClientRects().length,
      );

      if (found) {
        return found;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((wait) => {
      setTimeout(wait, 250);
    });
  }

  return null;
}

/**
 * Find something by the words written on it, which survives class renames.
 * @param {string[]} words - Words to look for.
 * @returns {Element|null} The element.
 */
function findByText(words) {
  const clickable = [...document.querySelectorAll('a, button, span[role="button"]')];

  return (
    clickable.find((node) => {
      const text = (node.textContent ?? '').trim();

      return text.length < 16 && words.some((word) => text === word);
    }) ?? null
  );
}

/**
 * Type text the way a person would, so the editor notices every line.
 * @param {Element} target - Editor element.
 * @param {string} text - Text to enter.
 * @returns {Promise<void>} Resolves once entered.
 */
async function typeInto(target, text) {
  target.focus();
  target.click();

  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    const setter = Object.getOwnPropertyDescriptor(
      target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    ).set;

    setter.call(target, text);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));

    return;
  }

  // 스마트에디터는 붙여넣기로 넣어야 줄바꿈이 살아요.
  const data = new DataTransfer();

  data.setData('text/plain', text);
  target.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  );

  await new Promise((wait) => {
    setTimeout(wait, 600);
  });

  if (!target.textContent.trim()) {
    // 붙여넣기를 안 받는 화면이면 한 줄씩 직접 넣어요.
    target.textContent = text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Put up the article.
 * @param {{ title: string, text: string }} step - What to post.
 * @returns {Promise<{ ok: boolean, reason?: string, url?: string }>} Result.
 */
async function postArticle(step) {
  const write = (await find(SELECTORS.writeButton, 6000)) ?? findByText(['글쓰기', '글 쓰기']);

  if (!write) {
    return { ok: false, reason: '글쓰기 단추를 못 찾았어요. 그 게시판에 글 쓸 수 있는 계정인지 봐주세요.' };
  }

  write.click();
  await new Promise((wait) => {
    setTimeout(wait, 3000);
  });

  const title = await find(SELECTORS.titleInput);

  if (!title) {
    return { ok: false, reason: '제목 칸을 못 찾았어요.' };
  }

  await typeInto(title, step.title ?? '');

  const body = await find(SELECTORS.bodyEditor);

  if (!body) {
    return { ok: false, reason: '본문 칸을 못 찾았어요.' };
  }

  await typeInto(body, step.text ?? '');

  return { ok: true, ready: true };
}

/**
 * Leave a comment, or a reply under the last one.
 * @param {{ kind: string, text: string }} step - What to post.
 * @returns {Promise<{ ok: boolean, reason?: string }>} Result.
 */
async function postComment(step) {
  if (step.kind === 'reply') {
    const items = [...document.querySelectorAll(SELECTORS.commentItem.join(','))];
    const last = items[items.length - 1];
    const reply = last?.querySelector(SELECTORS.replyButton.join(',')) ?? findByText(['답글']);

    reply?.click();
    await new Promise((wait) => {
      setTimeout(wait, 900);
    });
  }

  const box = await find(SELECTORS.commentBox);

  if (!box) {
    return { ok: false, reason: '댓글 칸을 못 찾았어요.' };
  }

  await typeInto(box, step.text ?? '');

  return { ok: true, ready: true };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'nabi-do') {
    return false;
  }

  const run = message.step.kind === 'post' ? postArticle : postComment;

  run(message.step)
    .then((result) => reply(result))
    .catch((error) => reply({ ok: false, reason: error.message }));

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'nabi-submit') {
    return false;
  }

  const button =
    message.kind === 'post'
      ? (findByText(['등록', '등록하기']) ?? document.querySelector(SELECTORS.submitArticle.join(',')))
      : (document.querySelector(SELECTORS.commentSubmit.join(',')) ?? findByText(['등록']));

  if (!button) {
    reply({ ok: false, reason: '등록 단추를 못 찾았어요.' });

    return true;
  }

  button.click();
  reply({ ok: true });

  return true;
});
