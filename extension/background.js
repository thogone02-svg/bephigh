/*
 * 올리는 일을 차례대로 진행하는 쪽.
 *
 * 카페 탭을 하나 열어 두고, 단계마다 그 탭에 시킵니다.
 * 계정이 바뀌어야 하면 로그인 화면으로 보내 바꾸고 이어서 합니다.
 */

import { readBoard, articleUrl, articleIdFrom } from './board.js';

/** 지금 돌고 있는 작업. 한 번에 하나만 돌려요. */
let running = null;

/**
 * Tell the app page how far it got.
 * @param {Record<string, any>} message - Progress message.
 */
const say = (message) => {
  chrome.tabs.query({}, (tabs) => {
    tabs
      .filter((tab) => /workers\.dev|localhost|127\.0\.0\.1/.test(tab.url ?? ''))
      .forEach((tab) => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
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
 * Put the cafe script into a tab, then ask it to do one thing.
 * @param {number} tabId - Tab to work in.
 * @param {Record<string, any>} message - What to do.
 * @returns {Promise<Record<string, any>>} What came back.
 */
async function ask(tabId, message) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['cafe.js'] }).catch(() => {});

  return chrome.tabs.sendMessage(tabId, message).catch((error) => ({
    ok: false,
    reason: error.message,
  }));
}

/**
 * Switch to another naver account, using the saved id and password.
 * @param {number} tabId - Tab to work in.
 * @param {{ alias: string, id: string, pw: string }} account - Account to sign in as.
 * @returns {Promise<{ ok: boolean, reason?: string }>} Result.
 */
async function signIn(tabId, account) {
  if (!account?.id || !account?.pw) {
    return {
      ok: false,
      reason: `「${account?.alias ?? '계정'}」의 아이디와 비밀번호가 없어요. 직접 그 계정으로 로그인하고 「이어서 하기」를 눌러 주세요.`,
    };
  }

  await chrome.tabs.update(tabId, { url: 'https://nid.naver.com/nidlogin.login' });
  await rest(2500);

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [account.id, account.pw],
    /**
     * @param id
     * @param pw
     */
    func: (id, pw) => {
      /**
       * @param node
       * @param value
       */
      const set = (node, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

        setter.call(node, value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const idBox = document.querySelector('#id');
      const pwBox = document.querySelector('#pw');

      if (idBox && pwBox) {
        set(idBox, id);
        set(pwBox, pw);
        document.querySelector('#log\\.login, .btn_login')?.click();
      }
    },
  });

  await rest(5000);

  return { ok: true };
}

/**
 * Run the whole plan, one step at a time.
 * @param {Record<string, any>} plan - Plan from the app.
 */
async function runPlan(plan) {
  const board = readBoard(plan.cafeUrl);
  const tab = await chrome.tabs.create({ url: plan.cafeUrl, active: true });
  const accounts = plan.accounts ?? [];
  let article = '';
  let signedAs = null;

  for (const [index, step] of plan.steps.entries()) {
    if (!running) {
      say({ type: 'stopped', at: index });

      return;
    }

    const previous = index === 0 ? 0 : plan.steps[index - 1].at;
    const waitMs = (step.at - previous) * 60 * 1000;

    if (waitMs > 0) {
      say({ type: 'waiting', no: step.no, what: step.what, seconds: waitMs / 1000 });
      // eslint-disable-next-line no-await-in-loop
      await rest(waitMs);
    }

    say({ type: 'doing', no: step.no, what: step.what, who: step.profile });

    // 이 단계를 맡은 계정으로 바꿔요.
    if (signedAs !== step.profile) {
      const account = accounts.find((a) => a.alias === step.profile);
      // eslint-disable-next-line no-await-in-loop
      const done = await signIn(tab.id, account);

      if (!done.ok) {
        say({ type: 'needs-you', no: step.no, message: done.reason });

        return;
      }

      signedAs = step.profile;
    }

    // 새 카페는 글쓰기 주소로 바로 갈 수 있어요. 단추를 찾을 필요가 없습니다.
    let goTo = plan.cafeUrl;

    if (step.kind === 'post') {
      goTo = board.write ?? plan.cafeUrl;
    } else if (article) {
      goTo = article;
    }

    // eslint-disable-next-line no-await-in-loop
    await chrome.tabs.update(tab.id, { url: goTo });
    // eslint-disable-next-line no-await-in-loop
    await rest(3500);

    // 옛 카페이거나 글쓰기 주소를 모르면 단추를 눌러서 들어가요.
    if (step.kind === 'post' && !board.write) {
      // eslint-disable-next-line no-await-in-loop
      const opened = await chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: () => {
            const write = [...document.querySelectorAll('a, button')].find((n) =>
              /^글쓰기$/.test((n.textContent ?? '').replace(/\s+/g, '')),
            );

            write?.click();

            return Boolean(write);
          },
        })
        .catch(() => [{ result: false }]);

      if (!opened?.[0]?.result) {
        say({ type: 'needs-you', no: step.no, message: '글쓰기 단추를 못 찾았어요.' });

        return;
      }

      // eslint-disable-next-line no-await-in-loop
      await rest(3000);
    }

    // eslint-disable-next-line no-await-in-loop
    const filled = await ask(tab.id, { type: 'nabi-fill', step });

    if (!filled.ok) {
      // eslint-disable-next-line no-await-in-loop
      const seen = await ask(tab.id, { type: 'nabi-look' });

      say({ type: 'needs-you', no: step.no, message: filled.reason, seen });

      return;
    }

    if (plan.dry) {
      say({ type: 'done-step', no: step.no, dry: true });
      // eslint-disable-next-line no-await-in-loop
      await rest(1500);

      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const sent = await ask(tab.id, { type: 'nabi-submit', kind: step.kind });

    if (!sent.ok) {
      say({ type: 'needs-you', no: step.no, message: sent.reason });

      return;
    }

    if (step.kind === 'post') {
      // eslint-disable-next-line no-await-in-loop
      await rest(2500);

      // eslint-disable-next-line no-await-in-loop
      const now = await chrome.tabs.get(tab.id);
      const id = articleIdFrom(now.url);

      article = id && board.clubId ? articleUrl(board.clubId, id) : now.url;

      if (!id) {
        say({
          type: 'needs-you',
          no: step.no,
          message:
            '글은 올라갔는데 글 주소를 못 읽었어요. 댓글은 그 글을 열어 두고 이어서 해주세요.',
        });

        return;
      }
    }

    say({ type: 'done-step', no: step.no, url: article });
  }

  running = null;
  say({ type: 'finished', url: article, dry: Boolean(plan.dry) });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'nabi-ping') {
    reply({ type: 'pong', version: chrome.runtime.getManifest().version });

    return true;
  }

  if (message?.type === 'nabi-stop') {
    running = null;
    reply({ type: 'ok' });

    return true;
  }

  if (message?.type !== 'nabi-run') {
    return false;
  }

  if (running) {
    reply({ type: 'error', message: '이미 올리는 중이에요. 끝나거나 멈춘 뒤에 다시 눌러 주세요.' });

    return true;
  }

  running = message.plan;
  reply({ type: 'started', steps: message.plan.steps.length });
  runPlan(message.plan).catch((error) => {
    running = null;
    say({ type: 'needs-you', message: error.message });
  });

  return true;
});
