/*
 * 올리는 일을 차례대로 진행하는 쪽.
 *
 * 세 가지를 지킵니다.
 *   ① 화면을 안 건드려요. 「뒤에서 올리기」면 창을 최소화한 채로 돕니다.
 *   ② 기다리는 건 전부 여기서 해요. 페이지 안에서 기다리면 창이 내려가 있을 때
 *      크롬이 타이머를 늦춰서 멈춘 것처럼 보이거든요.
 *   ③ 진행 상황을 저장해 둬요. 크롬이 이 스크립트를 잠깐 재워도 알람으로 깨어나
 *      하던 자리에서 이어서 합니다. 간격이 몇 분씩 되니까 이게 없으면 끊겨요.
 */

import { readBoard, writeUrl, articleUrl, articleIdFrom } from './board.js';
import { act } from './page.js';
import { setWatching, caught, forget } from './watch.js';

/** 다음 단계를 깨우는 알람 이름. */
const NEXT = 'nabi-next';

/**
 * Wait a while.
 * @param {number} ms - Milliseconds.
 * @returns {Promise<void>} Resolves after the wait.
 */
const rest = (ms) =>
  new Promise((go) => {
    setTimeout(go, ms);
  });

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
 * Read what we are in the middle of.
 * @returns {Promise<Record<string, any> | null>} The run, or null when nothing is going on.
 */
async function loadRun() {
  return (await chrome.storage.session.get('run')).run ?? null;
}

/**
 * Remember what we are in the middle of.
 * @param {Record<string, any>} run - The run.
 * @returns {Promise<void>} Done.
 */
async function saveRun(run) {
  await chrome.storage.session.set({ run });
}

/**
 * Forget the run.
 * @returns {Promise<void>} Done.
 */
async function dropRun() {
  await chrome.alarms.clear(NEXT);
  await chrome.storage.session.remove('run');
}

/**
 * Do one small thing inside the cafe page, looking in every frame.
 *
 * 스마트에디터가 안쪽 틀(iframe)에 들어 있는 카페도 있어서 전부 뒤집니다.
 * @param {number} tabId - Tab to work in.
 * @param {string} what - What to do.
 * @param {string} [text] - Text to put in.
 * @returns {Promise<Record<string, any>>} What came back.
 */
async function inPage(tabId, what, text) {
  const got = await chrome.scripting
    .executeScript({
      target: { tabId, allFrames: true },
      func: act,
      args: [{ what, text: text ?? '' }],
    })
    .catch((error) => [
      { result: { ok: false, reason: `화면에 들어가지 못했어요: ${error.message}` } },
    ]);

  const answers = got.map((one) => one?.result).filter(Boolean);
  const good = answers.find((one) => one.ok);

  if (good) {
    return good;
  }

  // 안 됐으면 어느 틀에서 뭘 봤는지 전부 챙겨요. 이걸 보고 고칩니다.
  return {
    ok: false,
    reason: answers[0]?.reason ?? '화면을 못 읽었어요',
    seen: answers.slice(0, 4),
  };
}

/**
 * Keep asking until the page is ready.
 * @param {number} tabId - Tab to work in.
 * @param {string} what - Question to ask (`form?` or `comment?`).
 * @param {number} seconds - How long to keep trying.
 * @returns {Promise<Record<string, any>>} The last answer.
 */
async function waitFor(tabId, what, seconds) {
  const until = Date.now() + seconds * 1000;
  let last = { ok: false, reason: '화면이 안 떴어요' };

  while (Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop
    last = await inPage(tabId, what);

    if (last.ok) {
      return last;
    }

    // eslint-disable-next-line no-await-in-loop
    await rest(700);
  }

  return last;
}

/**
 * Go to a page and wait until it has finished loading.
 * @param {number} tabId - Tab to move.
 * @param {string} url - Where to go.
 * @returns {Promise<string>} The address we ended up on.
 */
async function goTo(tabId, url) {
  await chrome.tabs.update(tabId, { url });

  for (let tries = 0; tries < 40; tries += 1) {
    // eslint-disable-next-line no-await-in-loop
    await rest(500);

    // eslint-disable-next-line no-await-in-loop
    const tab = await chrome.tabs.get(tabId).catch(() => null);

    if (tab && tab.status === 'complete') {
      return tab.url ?? '';
    }
  }

  return (await chrome.tabs.get(tabId).catch(() => null))?.url ?? '';
}

/**
 * Is anyone signed in to naver in this browser?
 * @returns {Promise<boolean>} True when there is a login.
 */
const anyoneSignedIn = async () =>
  Boolean(
    await chrome.cookies.get({ url: 'https://www.naver.com', name: 'NID_AUT' }).catch(() => null),
  );

/** 네이버 로그인 화면. */
const LOGIN_PAGE = 'https://nid.naver.com/nidlogin.login';
/** 사람이 보안문자를 풀 때까지 기다리는 시간(분). */
const PATIENCE = 3;

/**
 * Wait until the browser has left the login page.
 * @param {number} tabId - Tab to watch.
 * @param {number} seconds - How long to wait.
 * @returns {Promise<boolean>} True once the login is done.
 */
async function leftLogin(tabId, seconds) {
  const until = Date.now() + seconds * 1000;

  while (Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop
    await rest(1500);

    // eslint-disable-next-line no-await-in-loop
    const tab = await chrome.tabs.get(tabId).catch(() => null);

    if (tab && !/nid\.naver\.com/.test(tab.url ?? '')) {
      // eslint-disable-next-line no-await-in-loop
      return Boolean(await anyoneSignedIn());
    }
  }

  return false;
}

/**
 * Bring the window up and wait for the person to finish logging in.
 *
 * 창을 내려 둔 채로 「로그인해 주세요」 해봐야 안 보여요. 그래서 올려 줍니다.
 * @param {{ tabId: number, windowId: number }} where - Where we are working.
 * @param {{ alias: string }} account - Account we need.
 * @param {(message: Record<string, any>) => void} tell - How to talk to the app.
 * @param {string} why - What to say.
 * @returns {Promise<{ ok: boolean, reason?: string, note?: string }>} Result.
 */
async function askPerson(where, account, tell, why) {
  const alias = account?.alias ?? '계정';

  await chrome.tabs.update(where.tabId, { url: LOGIN_PAGE }).catch(() => {});
  await chrome.windows
    .update(where.windowId, { state: 'normal', focused: true, drawAttention: true })
    .catch(() => {});

  tell({
    type: 'note',
    message: `${why} 방금 올라온 창에서 그 계정으로 로그인해 주세요. 끝내시면 알아서 이어서 갑니다. (${PATIENCE}분 기다려요)`,
  });

  if (!(await leftLogin(where.tabId, PATIENCE * 60))) {
    return { ok: false, reason: `${why} 창에서 로그인을 끝내신 뒤에 다시 눌러 주세요.` };
  }

  await chrome.storage.local.set({ signedAs: alias });
  await chrome.windows.update(where.windowId, { state: 'minimized' }).catch(() => {});

  return { ok: true, note: `「${alias}」 로그인이 끝나서 이어서 올려요.` };
}

/**
 * Switch to another naver account, using the saved id and password.
 *
 * 이미 그 계정으로 들어가 있으면 아무것도 안 합니다. 매번 다시 로그인하면
 * 네이버가 보안문자를 띄워서, 오히려 사람 손이 더 자주 필요해져요.
 * @param {{ tabId: number, windowId: number }} where - Where we are working.
 * @param {{ alias: string, id: string, pw: string }} account - Account to sign in as.
 * @param {(message: Record<string, any>) => void} tell - How to talk to the app.
 * @returns {Promise<{ ok: boolean, reason?: string, note?: string }>} Result.
 */
async function signIn(where, account, tell) {
  const { tabId } = where;
  const alias = account?.alias ?? '계정';
  const remembered = (await chrome.storage.local.get('signedAs')).signedAs ?? '';
  const already = await anyoneSignedIn();

  // ① 이미 그 계정으로 들어가 있으면 아무것도 안 해요. 매번 다시 로그인하면
  //    네이버가 보안문자를 띄우거든요.
  if (already && remembered === alias) {
    return { ok: true };
  }

  // ② 비밀번호를 안 넣어 두셨으면 사람이 한 번 해줘야 해요.
  if (!account?.id || !account?.pw) {
    if (already && !remembered) {
      await chrome.storage.local.set({ signedAs: alias });

      return { ok: true, note: `「${alias}」은 비밀번호가 없어서, 지금 로그인된 계정으로 올려요.` };
    }

    return askPerson(where, account, tell, `「${alias}」으로 로그인해 주세요.`);
  }

  // ③ 아이디와 비밀번호가 있으면 대신 넣어 줍니다.
  await goTo(tabId, LOGIN_PAGE);
  await rest(1200);

  await chrome.scripting
    .executeScript({
      target: { tabId },
      args: [account.id, account.pw],
      /**
       * Fill the login form and press the button.
       * @param {string} id - Naver id.
       * @param {string} pw - Password.
       */
      func: (id, pw) => {
        const set = (node, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
            node,
            value,
          );
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
    })
    .catch(() => {});

  if (await leftLogin(tabId, 15)) {
    await chrome.storage.local.set({ signedAs: alias });

    return { ok: true };
  }

  // ④ 여기까지 왔으면 보안문자나 새 기기 확인이 뜬 거예요. 사람이 해야 합니다.
  return askPerson(
    where,
    account,
    tell,
    `「${alias}」 로그인에 확인이 필요해요. 보안문자나 새 기기 확인이 뜬 것 같습니다.`,
  );
}

/**
 * Open the window we will work in.
 * @param {Record<string, any>} plan - Plan from the app.
 * @returns {Promise<{ tabId: number, windowId: number }>} Where we will work.
 */
async function openWorkplace(plan) {
  if (plan.background) {
    // 최소화한 창이라 보고 계신 화면을 안 건드려요.
    const win = await chrome.windows
      .create({ url: plan.cafeUrl, focused: false, state: 'minimized' })
      .catch(() => null);

    if (win) {
      return { tabId: win.tabs[0].id, windowId: win.id };
    }

    // 크롬이 한 번에 안 받아 주면 만들고 나서 내려요.
    const plain = await chrome.windows.create({ url: plan.cafeUrl, focused: false });

    await chrome.windows.update(plain.id, { state: 'minimized' }).catch(() => {});

    return { tabId: plain.tabs[0].id, windowId: plain.id };
  }

  const tab = await chrome.tabs.create({ url: plan.cafeUrl, active: true });

  return { tabId: tab.id, windowId: tab.windowId };
}

/**
 * Put one step up on the cafe.
 * @param {Record<string, any>} run - What we are in the middle of.
 * @returns {Promise<Record<string, any>>} Result, and what changed about the run.
 */
async function postOne(run) {
  const { plan, tabId } = run;
  const step = plan.steps[run.at];
  const board = readBoard(plan.cafeUrl);
  const accounts = plan.accounts ?? [];

  say({ type: 'doing', no: step.no, what: step.what, who: step.profile });

  // ① 이 단계를 맡은 계정으로.
  if (run.signedAs !== step.profile) {
    const done = await signIn(
      { tabId, windowId: run.windowId },
      accounts.find((one) => one.alias === step.profile),
      say,
    );

    if (!done.ok) {
      return { ok: false, reason: done.reason };
    }

    if (done.note) {
      say({ type: 'note', no: step.no, message: done.note });
    }

    run.signedAs = step.profile;
  }

  // ② 글 쓰는 화면으로. 새 카페는 주소로 바로 갈 수 있어요.
  let where = plan.cafeUrl;

  if (step.kind === 'post') {
    where = board.write ?? plan.cafeUrl;
  } else if (run.article) {
    where = run.article;
  }

  const landed = await goTo(tabId, where);

  if (/nid\.naver\.com|nidlogin/.test(landed)) {
    return { ok: false, reason: '로그인 화면으로 넘어갔어요. 열린 창에서 로그인해 주세요.' };
  }

  // ③ 주소로 글쓰기 화면을 못 만들었으면 그 페이지에서 길을 찾아요.
  //    ⓐ 글쓰기 링크 → ⓑ 페이지에 적힌 카페·게시판 번호 → ⓒ 단추 누르기 순서.
  if (step.kind === 'post' && !board.write) {
    const link = await inPage(tabId, 'write-link');

    if (link.ok) {
      await goTo(tabId, link.url);
    } else {
      const ids = await inPage(tabId, 'ids');

      if (ids.ok && ids.menuId) {
        await goTo(tabId, writeUrl(ids.clubId, ids.menuId, board.home));
      } else {
        await chrome.scripting
          .executeScript({
            target: { tabId, allFrames: true },
            /**
             * Press the 글쓰기 button.
             */
            func: () => {
              [...document.querySelectorAll('a, button, span[role="button"]')]
                .find((node) => /^글쓰기$/.test((node.textContent ?? '').replace(/\s+/g, '')))
                ?.click();
            },
          })
          .catch(() => {});

        // 단추를 누르면 그 자리에서 화면이 넘어가느라 「눌렸다」는 대답이 안 올 때가
        // 있어요. 대답 말고 글쓰기 칸이 떴는지로 판단합니다.
        await rest(3000);
      }
    }
  }

  // ④ 칸이 나올 때까지 기다렸다가 넣어요.
  if (step.kind === 'post') {
    const form = await waitFor(tabId, 'form?', 25);

    if (!form.ok) {
      const seen = await inPage(tabId, 'look');

      return {
        ok: false,
        reason: board.write
          ? '글쓰기 화면이 안 떴어요.'
          : '글쓰기 화면으로 못 들어갔어요. 게시판 주소가 .../menus/31 처럼 게시판 번호까지 있는지 봐주세요.',
        seen: seen.seen ?? [seen],
      };
    }

    const title = await inPage(tabId, 'title', step.title ?? '');

    if (!title.ok) {
      return { ok: false, reason: title.reason, seen: title.seen };
    }

    await rest(400);

    const body = await inPage(tabId, 'body', step.text ?? '');

    if (!body.ok) {
      return { ok: false, reason: body.reason, seen: body.seen };
    }
  } else {
    if (step.kind === 'reply') {
      const opened = await inPage(tabId, 'open-reply', step.replyTo ?? '');

      if (!opened.ok) {
        return { ok: false, reason: opened.reason, seen: opened.seen };
      }

      await rest(1500);
    }

    const ready = await waitFor(tabId, 'comment?', 15);

    if (!ready.ok) {
      const seen = await inPage(tabId, 'look');

      return {
        ok: false,
        reason: '댓글 칸이 안 보여요. 그 카페에서 댓글을 쓸 수 있는 계정인지 봐주세요.',
        seen: seen.seen ?? [seen],
      };
    }

    const filled = await inPage(tabId, 'comment', step.text ?? '');

    if (!filled.ok) {
      return { ok: false, reason: filled.reason, seen: filled.seen };
    }
  }

  // ⑤ 연습이면 여기까지.
  if (plan.dry) {
    await rest(1200);

    return { ok: true, dry: true };
  }

  const sent = await inPage(tabId, 'submit', step.kind === 'post' ? 'post' : 'comment');

  if (!sent.ok) {
    return { ok: false, reason: sent.reason, seen: sent.seen };
  }

  await rest(step.kind === 'post' ? 4000 : 2500);

  // ⑥ 글이 올라갔으면 그 글 주소를 챙겨 둬야 댓글을 달 수 있어요.
  if (step.kind === 'post') {
    for (let tries = 0; tries < 8; tries += 1) {
      // eslint-disable-next-line no-await-in-loop
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const id = articleIdFrom(tab?.url ?? '');

      if (id) {
        run.article = board.clubId ? articleUrl(board.clubId, id, board.home) : tab.url;

        return { ok: true };
      }

      // eslint-disable-next-line no-await-in-loop
      await rest(1500);
    }

    return {
      ok: false,
      reason: '글은 올라갔는데 글 주소를 못 읽었어요. 댓글은 그 글을 열어 두고 이어서 해주세요.',
    };
  }

  return { ok: true };
}

/**
 * Do the step we are on, then line up the next one.
 */
async function tick() {
  const run = await loadRun();

  if (!run) {
    return;
  }

  if (run.stop) {
    say({ type: 'stopped', at: run.at });
    await dropRun();

    return;
  }

  const step = run.plan.steps[run.at];
  let result;

  try {
    result = await postOne(run);
  } catch (error) {
    result = { ok: false, reason: error.message };
  }

  if (!result.ok) {
    say({ type: 'needs-you', no: step.no, message: result.reason, seen: result.seen });
    await dropRun();

    return;
  }

  say({ type: 'done-step', no: step.no, url: run.article, dry: Boolean(result.dry) });

  const next = run.plan.steps[run.at + 1];

  // 연습에서는 글을 실제로 안 올리니까 글 주소가 없어요. 댓글은 달 데가 없습니다.
  if (next && run.plan.dry && next.kind !== 'post' && !run.article) {
    say({
      type: 'finished',
      dry: true,
      message: '연습은 본문까지만 해봐요. 댓글은 글이 올라가 있어야 달 수 있어요.',
    });
    await dropRun();

    return;
  }

  if (!next) {
    say({ type: 'finished', url: run.article, dry: Boolean(run.plan.dry) });
    await dropRun();

    return;
  }

  const wait = Math.max(0, next.at - step.at);

  run.at += 1;
  await saveRun(run);

  if (wait > 0) {
    say({ type: 'waiting', no: next.no, what: next.what, seconds: wait * 60 });
    // 알람은 이 스크립트가 잠들어도 깨워 줘요.
    chrome.alarms.create(NEXT, { delayInMinutes: wait });

    return;
  }

  await tick();
}

/**
 * Look at the cafe without touching anything, so we can see what is there.
 *
 * 올리기 전에 「여기서 뭘 찾을 수 있나」를 미리 보는 쪽이에요.
 * 글쓰기 화면과, 글 하나를 열어 댓글 자리까지 봅니다.
 * @param {string} cafeUrl - Board address.
 * @returns {Promise<Record<string, any>>} What we found.
 */
async function checkCafe(cafeUrl) {
  const board = readBoard(cafeUrl);

  const win = await chrome.windows
    .create({ url: cafeUrl, focused: false, state: 'minimized' })
    .catch(() => null);

  const opened = win ?? (await chrome.windows.create({ url: cafeUrl, focused: false }));
  const tabId = opened.tabs[0].id;

  try {
    const landed = await goTo(tabId, cafeUrl);
    const seen = await inPage(tabId, 'look');
    const article = await inPage(tabId, 'first-article');

    // 주소를 어떻게 읽었고, 그 주소로 갔더니 어디에 닿았는지.
    const given = {
      주소: cafeUrl,
      읽은_카페번호: board.clubId || '(못 읽음)',
      읽은_게시판번호: board.menuId || '(못 읽음)',
      도착한_주소: landed,
      그화면에_보인_것: seen.buttons ?? seen.seen?.[0]?.buttons ?? [],
    };

    const write = {
      ok: false,
      reason:
        '주소에서 게시판 번호를 못 읽어서 글쓰기 화면을 못 만들었어요. 카페에서 그 게시판을 누른 뒤 주소창을 복사해 주세요.',
    };

    if (board.write) {
      await goTo(tabId, board.write);
      await waitFor(tabId, 'form?', 20);
      Object.assign(write, await inPage(tabId, 'check'));
    }

    let comment = {
      ok: false,
      reason:
        '그 주소에서 글 목록을 못 찾아서 댓글 자리는 못 봤어요. 게시판 주소가 맞는지 봐주세요.',
    };

    if (article.ok) {
      await goTo(tabId, article.url);
      await waitFor(tabId, 'comment?', 15);
      comment = await inPage(tabId, 'check');
    }

    return { ok: true, given, write, comment };
  } finally {
    await chrome.windows.remove(opened.id).catch(() => {});
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === NEXT) {
    tick();
  }
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type === 'nabi-ping') {
    reply({ type: 'pong', version: chrome.runtime.getManifest().version });

    return true;
  }

  if (message?.type === 'nabi-status') {
    loadRun().then((run) =>
      reply(
        run
          ? { type: 'status', at: run.at, steps: run.plan.steps, dry: Boolean(run.plan.dry) }
          : { type: 'status', at: -1, steps: [] },
      ),
    );

    return true;
  }

  if (message?.type === 'nabi-check') {
    checkCafe(message.cafeUrl)
      .then((found) => reply({ type: 'checked', ...found }))
      .catch((error) => reply({ type: 'checked', ok: false, reason: error.message }));

    return true;
  }

  if (message?.type === 'nabi-watch') {
    const turn = message.on ? setWatching(true) : setWatching(false);

    turn
      .then(() => (message.on ? forget() : Promise.resolve()))
      .then(() => reply({ type: 'watching', on: Boolean(message.on) }))
      .catch((error) => reply({ type: 'watching', on: false, message: error.message }));

    return true;
  }

  if (message?.type === 'nabi-caught') {
    caught()
      .then((all) => reply({ type: 'caught', all }))
      .catch((error) => reply({ type: 'caught', all: [], message: error.message }));

    return true;
  }

  if (message?.type === 'nabi-stop') {
    loadRun().then(async (run) => {
      if (run) {
        run.stop = true;
        await saveRun(run);
      }

      await chrome.alarms.clear(NEXT);
      reply({ type: 'ok' });
    });

    return true;
  }

  if (message?.type !== 'nabi-run') {
    return false;
  }

  loadRun().then(async (busy) => {
    if (busy) {
      reply({
        type: 'error',
        message: '이미 올리는 중이에요. 끝나거나 멈춘 뒤에 다시 눌러 주세요.',
      });

      return;
    }

    const { plan } = message;

    try {
      const { tabId, windowId } = await openWorkplace(plan);

      await saveRun({ plan, at: 0, tabId, windowId, article: '', signedAs: null, stop: false });
      reply({ type: 'started', steps: plan.steps.length, background: Boolean(plan.background) });
      tick();
    } catch (error) {
      reply({ type: 'error', message: error.message });
    }
  });

  return true;
});
