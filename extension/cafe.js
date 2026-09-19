/*
 * 카페 화면에서 실제로 글과 댓글을 넣는 쪽.
 *
 * 네이버는 클래스 이름을 자주 바꿔요. 그래서 클래스보다 먼저
 * 「칸에 적힌 안내말」과 「단추에 쓰인 글자」로 찾습니다. 그게 훨씬 오래 갑니다.
 */

/** 클래스로도 한 번 찾아봐요. 안 맞으면 여기만 고치면 됩니다. */
const SELECTORS = {
  title: ['textarea.textarea_input', 'input.textarea_input', '.article_header textarea'],
  body: ['.se-content .se-text-paragraph', 'div.se-text-paragraph', 'div[contenteditable="true"]'],
  comment: ['textarea#cmtinput', 'textarea.comment_inbox_text', '.comment_inbox textarea'],
  commentItem: ['li.CommentItem', '.comment_list li', 'ul.comment_list > li'],
};

/**
 * Wait a while.
 * @param {number} ms - Milliseconds.
 * @returns {Promise<void>} Resolves after the wait.
 */
const rest = (ms) =>
  new Promise((wait) => {
    setTimeout(wait, ms);
  });

/**
 * Is this thing actually on screen?
 * @param {Element} node - Element to check.
 * @returns {boolean} True when visible.
 */
const onScreen = (node) =>
  Boolean(node) && (node.offsetParent !== null || node.getClientRects().length > 0);

/**
 * Look for a writing box by what its placeholder says, then by class.
 * @param {RegExp} hint - Words the placeholder should contain.
 * @param {string[]} classes - Class selectors to fall back on.
 * @param {number} [waitMs] - How long to keep looking.
 * @returns {Promise<Element|null>} The box, or null.
 */
async function findBox(hint, classes, waitMs = 15000) {
  const until = Date.now() + waitMs;

  while (Date.now() < until) {
    const boxes = [
      ...document.querySelectorAll('textarea, input[type="text"], div[contenteditable="true"]'),
    ].filter(onScreen);

    const byHint = boxes.find((node) =>
      hint.test(`${node.getAttribute('placeholder') ?? ''} ${node.getAttribute('aria-label') ?? ''}`),
    );

    if (byHint) {
      return byHint;
    }

    for (const selector of classes) {
      const found = [...document.querySelectorAll(selector)].find(onScreen);

      if (found) {
        return found;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await rest(300);
  }

  return null;
}

/**
 * Find a button by the words written on it.
 * @param {RegExp} words - Words to match.
 * @param {Element} [within] - Only look inside this.
 * @returns {Element|null} The button.
 */
function findButton(words, within = document) {
  const clickable = [
    ...within.querySelectorAll('button, a, span[role="button"], div[role="button"]'),
  ].filter(onScreen);

  return (
    clickable.find((node) => {
      const text = (node.textContent ?? '').replace(/\s+/g, '');

      return text.length > 0 && text.length <= 10 && words.test(text);
    }) ?? null
  );
}

/**
 * Put text into a box the way a person would.
 * @param {Element} box - Where to type.
 * @param {string} text - What to type.
 * @returns {Promise<boolean>} True when something went in.
 */
async function typeInto(box, text) {
  box.scrollIntoView({ block: 'center' });
  box.focus();
  box.click();
  await rest(300);

  if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
    const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;

    setter.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await rest(300);

    return box.value.trim().length > 0;
  }

  // 스마트에디터는 붙여넣기로 넣어야 줄바꿈이 살아요.
  const data = new DataTransfer();

  data.setData('text/plain', text);
  box.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
  );
  await rest(900);

  if ((box.textContent ?? '').trim()) {
    return true;
  }

  // 붙여넣기를 안 받으면 한 줄씩 직접 쳐요.
  for (const line of text.split('\n')) {
    if (line) {
      // eslint-disable-next-line no-await-in-loop
      document.execCommand('insertText', false, line);
    }

    // eslint-disable-next-line no-await-in-loop
    document.execCommand('insertParagraph');
    // eslint-disable-next-line no-await-in-loop
    await rest(40);
  }

  return (box.textContent ?? '').trim().length > 0;
}

/**
 * Fill in the article form.
 * @param {{ title: string, text: string }} step - What to post.
 * @returns {Promise<Record<string, any>>} Result.
 */
async function fillArticle(step) {
  const title = await findBox(/제목/, SELECTORS.title);

  if (!title) {
    return { ok: false, reason: '제목 칸을 못 찾았어요. 글쓰기 화면이 맞는지 봐주세요.' };
  }

  if (!(await typeInto(title, step.title ?? ''))) {
    return { ok: false, reason: '제목이 안 들어가요.' };
  }

  const body = await findBox(/내용|본문/, SELECTORS.body);

  if (!body) {
    return { ok: false, reason: '본문 칸을 못 찾았어요.' };
  }

  if (!(await typeInto(body, step.text ?? ''))) {
    return { ok: false, reason: '본문이 안 들어가요.' };
  }

  return { ok: true };
}

/**
 * Fill in the comment box, opening the reply box first when asked.
 * @param {{ kind: string, text: string }} step - What to post.
 * @returns {Promise<Record<string, any>>} Result.
 */
async function fillComment(step) {
  if (step.kind === 'reply') {
    const items = [...document.querySelectorAll(SELECTORS.commentItem.join(','))].filter(onScreen);
    const last = items[items.length - 1];
    const reply = last ? findButton(/^답글$/, last) : findButton(/^답글$/);

    reply?.click();
    await rest(1200);
  }

  const box = await findBox(/댓글/, SELECTORS.comment);

  if (!box) {
    return { ok: false, reason: '댓글 칸을 못 찾았어요. 그 카페에서 댓글을 쓸 수 있는 계정인지 봐주세요.' };
  }

  if (!(await typeInto(box, step.text ?? ''))) {
    return { ok: false, reason: '댓글이 안 들어가요.' };
  }

  return { ok: true };
}

/**
 * Press 등록.
 * @param {string} kind - `post` for an article, otherwise a comment.
 * @returns {Promise<Record<string, any>>} Result.
 */
async function submit(kind) {
  const button = findButton(/^(등록|등록하기|확인)$/);

  if (!button) {
    return { ok: false, reason: '등록 단추를 못 찾았어요.' };
  }

  button.click();
  await rest(kind === 'post' ? 4500 : 2500);

  return { ok: true, url: window.location.href };
}

/**
 * Say what is on this page, so we can tell why something did not work.
 * @returns {Record<string, any>} A short description.
 */
function look() {
  const boxes = [
    ...document.querySelectorAll('textarea, input[type="text"], div[contenteditable="true"]'),
  ]
    .filter(onScreen)
    .map((n) => `${n.tagName.toLowerCase()}[${n.getAttribute('placeholder') ?? n.className}]`)
    .slice(0, 8);

  const buttons = [...document.querySelectorAll('button, a')]
    .filter(onScreen)
    .map((n) => (n.textContent ?? '').replace(/\s+/g, ''))
    .filter((t) => t && t.length <= 8)
    .slice(0, 16);

  return { url: window.location.href, boxes, buttons };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'nabi-look') {
    reply(look());

    return true;
  }

  if (message?.type === 'nabi-fill') {
    const run = message.step.kind === 'post' ? fillArticle : fillComment;

    run(message.step)
      .then(reply)
      .catch((error) => reply({ ok: false, reason: error.message }));

    return true;
  }

  if (message?.type === 'nabi-submit') {
    submit(message.kind)
      .then(reply)
      .catch((error) => reply({ ok: false, reason: error.message }));

    return true;
  }

  return false;
});
