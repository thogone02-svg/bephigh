/*
 * 컴퓨터에서 크롬을 직접 굴려서 카페에 올리는 프로그램.
 *
 * 창을 안 띄웁니다. 크롬은 뒤에서 조용히 돌아요. 보고 싶으시면 --show 를 붙이세요.
 *
 * 계정마다 크롬 프로필을 따로 둡니다. 한 번 로그인해 두면 그 폴더에 기록이
 * 남아서 다음부터는 안 물어봐요. 계정을 바꿀 때 로그아웃·로그인을 반복하지
 * 않으니 네이버가 보안문자를 덜 띄웁니다.
 *
 * 카페 화면을 보는 눈은 확장과 똑같은 파일(extension/page.js)을 씁니다.
 * 한 군데만 고치면 둘 다 고쳐져요.
 */

import { readFileSync } from 'node:fs';
import { readBoard, writeUrl, articleUrl, articleIdFrom } from '../extension/board.js';
import { act } from '../extension/page.js';
import { openAs, isLoggedIn, waitWithCountdown } from './profile.mjs';
import { findAccount, fillLogin } from './accounts.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const show = args.includes('--show');
const file = args.find((one) => !one.startsWith('--'));

if (!file) {
  console.error('쓰는 법: npm start -- "말라세지아 모낭염 업로드.json"');
  console.error('  --dry   등록만 안 누르고 나머지는 그대로 해봐요');
  console.error('  --show  크롬 창을 띄워서 되는 걸 눈으로 봐요');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(file, 'utf8'));

if (!Array.isArray(plan.steps) || !plan.steps.length) {
  console.error('업로드 파일에 올릴 단계가 없어요.');
  process.exit(1);
}

const board = readBoard(plan.cafeUrl);
const naver = /naver\.com$/i.test(new URL(plan.cafeUrl).hostname);

console.log(`\n「${plan.keyword}」 — ${plan.steps.length}단계`);
console.log(`주소: ${plan.cafeUrl}`);
console.log(
  board.write
    ? `읽음: 카페 ${board.clubId} · 게시판 ${board.menuId}`
    : '⚠ 주소에서 게시판 번호를 못 읽었어요. 글쓰기 링크를 찾아 들어가 봅니다.',
);
console.log(dry ? '연습 모드예요. 등록은 안 누릅니다.' : '진짜로 올립니다. 멈추려면 Ctrl+C.');
console.log(show ? '창을 띄워 놓고 합니다.\n' : '창 없이 뒤에서 합니다.\n');

/** 계정마다 열어 둔 크롬. 한 번 연 건 계속 씁니다. */
const browsers = new Map();

/**
 * Get the browser for one account, logging in the first time.
 * @param {string} alias - Account alias.
 * @returns {Promise<import('playwright').Page>} A page signed in as that account.
 */
async function pageFor(alias) {
  if (browsers.has(alias)) {
    return browsers.get(alias);
  }

  const context = await openAs(alias, !show);
  const page = context.pages()[0] ?? (await context.newPage());

  if (naver && !(await isLoggedIn(context))) {
    const account = findAccount(alias);

    if (!account?.id || !account?.pw) {
      console.log(`\n「${alias}」 로그인이 필요해요. 창을 띄울 테니 직접 로그인해 주세요.`);
      console.log('  (아이디·비밀번호를 accounts.json 에 넣어 두시면 다음부터는 알아서 합니다)');
      await context.close();

      const seen = await openAs(alias, false);
      const front = seen.pages()[0] ?? (await seen.newPage());

      await front.goto('https://nid.naver.com/nidlogin.login');
      await front.waitForURL((url) => !/nid\.naver\.com/.test(url.href), { timeout: 300000 });
      console.log(`  「${alias}」 로그인 됐어요. 이어서 갑니다.`);
      browsers.set(alias, front);

      return front;
    }

    console.log(`   ${alias} 로그인하는 중…`);
    await fillLogin(page, account);
    await page
      .waitForURL((url) => !/nid\.naver\.com/.test(url.href), { timeout: 120000 })
      .catch(() => {});
  }

  browsers.set(alias, page);

  return page;
}

/**
 * Do one small thing inside the cafe page, in whichever frame answers.
 * @param {import('playwright').Page} page - Open page.
 * @param {string} what - What to do.
 * @param {string} [text] - Text to put in.
 * @returns {Promise<Record<string, any>>} What came back.
 */
async function inPage(page, what, text) {
  const answers = [];

  for (const frame of page.frames()) {
    // eslint-disable-next-line no-await-in-loop
    const got = await frame.evaluate(act, { what, text: text ?? '' }).catch(() => null);

    if (got?.ok) {
      return got;
    }

    if (got) {
      answers.push(got);
    }
  }

  return {
    ok: false,
    reason: answers[0]?.reason ?? '화면을 못 읽었어요',
    seen: answers.slice(0, 3),
  };
}

/**
 * Keep asking until the page is ready.
 * @param {import('playwright').Page} page - Open page.
 * @param {string} what - Question to ask.
 * @param {number} seconds - How long to keep trying.
 * @returns {Promise<Record<string, any>>} The last answer.
 */
async function waitFor(page, what, seconds) {
  const until = Date.now() + seconds * 1000;
  let last = { ok: false, reason: '화면이 안 떴어요' };

  while (Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop
    last = await inPage(page, what);

    if (last.ok) {
      return last;
    }

    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(700);
  }

  return last;
}

/**
 * Stop with a message that says what to do about it.
 * @param {string} why - What went wrong.
 * @param {Record<string, any>} [seen] - What the page looked like.
 */
async function giveUp(why, seen) {
  console.error(`\n✖ ${why}`);

  if (seen) {
    console.error('  그 화면에서 본 것:');
    console.error(`  ${JSON.stringify(seen).slice(0, 700)}`);
  }

  for (const page of browsers.values()) {
    // eslint-disable-next-line no-await-in-loop
    await page
      .context()
      .close()
      .catch(() => {});
  }

  process.exit(1);
}

let article = plan.article ?? '';
let clock = 0;

for (const [index, step] of plan.steps.entries()) {
  // eslint-disable-next-line no-await-in-loop
  await waitWithCountdown((step.at - clock) * 60, step.what);
  clock = step.at;

  console.log(`${index + 1}. ${step.what} · ${step.profile}`);

  // eslint-disable-next-line no-await-in-loop
  const page = await pageFor(step.profile);

  if (step.kind === 'post') {
    let where = board.write;

    if (!where) {
      // eslint-disable-next-line no-await-in-loop
      await page.goto(plan.cafeUrl, { waitUntil: 'domcontentloaded' });

      // eslint-disable-next-line no-await-in-loop
      const link = await inPage(page, 'write-link');

      if (link.ok) {
        where = link.url;
      } else {
        // eslint-disable-next-line no-await-in-loop
        const ids = await inPage(page, 'ids');

        if (!ids.ok || !ids.menuId) {
          // eslint-disable-next-line no-await-in-loop
          await giveUp('글쓰기 화면으로 못 들어갔어요. 게시판 주소를 다시 넣어 주세요.', ids.seen);
        }

        where = writeUrl(ids.clubId, ids.menuId, board.home);
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await page.goto(where, { waitUntil: 'domcontentloaded' });

    // eslint-disable-next-line no-await-in-loop
    const form = await waitFor(page, 'form?', 25);

    if (!form.ok) {
      // eslint-disable-next-line no-await-in-loop
      const look = await inPage(page, 'look');

      // eslint-disable-next-line no-await-in-loop
      await giveUp('글쓰기 화면이 안 떴어요.', look.seen ?? look);
    }

    // eslint-disable-next-line no-await-in-loop
    const title = await inPage(page, 'title', step.title ?? '');

    if (!title.ok) {
      // eslint-disable-next-line no-await-in-loop
      await giveUp(title.reason, title.seen);
    }

    // eslint-disable-next-line no-await-in-loop
    const body = await inPage(page, 'body', step.text ?? '');

    if (!body.ok) {
      // eslint-disable-next-line no-await-in-loop
      await giveUp(body.reason, body.seen);
    }
  } else {
    // eslint-disable-next-line no-await-in-loop
    await page.goto(article || plan.cafeUrl, { waitUntil: 'domcontentloaded' });

    if (step.kind === 'reply') {
      // eslint-disable-next-line no-await-in-loop
      const opened = await inPage(page, 'open-reply', step.replyTo ?? '');

      if (!opened.ok) {
        // eslint-disable-next-line no-await-in-loop
        await giveUp(opened.reason, opened.seen);
      }

      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(1500);
    }

    // eslint-disable-next-line no-await-in-loop
    const ready = await waitFor(page, 'comment?', 15);

    if (!ready.ok) {
      // eslint-disable-next-line no-await-in-loop
      await giveUp(
        '댓글 칸이 안 보여요. 그 카페에서 댓글을 쓸 수 있는 계정인지 봐주세요.',
        ready.seen,
      );
    }

    // eslint-disable-next-line no-await-in-loop
    const filled = await inPage(page, 'comment', step.text ?? '');

    if (!filled.ok) {
      // eslint-disable-next-line no-await-in-loop
      await giveUp(filled.reason, filled.seen);
    }
  }

  if (dry) {
    console.log('   (연습이라 등록은 안 눌러요)');

    if (step.kind === 'post') {
      console.log('   연습은 본문까지만 해봐요. 댓글은 글이 올라가 있어야 달 수 있어요.');
      break;
    }

    continue;
  }

  // eslint-disable-next-line no-await-in-loop
  const sent = await inPage(page, 'submit', step.kind === 'post' ? 'post' : 'comment');

  if (!sent.ok) {
    // eslint-disable-next-line no-await-in-loop
    await giveUp(sent.reason, sent.seen);
  }

  // eslint-disable-next-line no-await-in-loop
  await page.waitForTimeout(step.kind === 'post' ? 4000 : 2500);

  if (step.kind === 'post') {
    const id = articleIdFrom(page.url());

    if (!id) {
      // eslint-disable-next-line no-await-in-loop
      await giveUp(
        '글은 올라갔는데 글 주소를 못 읽었어요. 댓글은 그 글을 열어 두고 이어서 해주세요.',
      );
    }

    article = board.clubId ? articleUrl(board.clubId, id, board.home) : page.url();
    console.log(`   올라갔어요 → ${article}`);
  } else {
    console.log('   달았어요');
  }
}

console.log(dry ? '\n연습 끝. 괜찮으면 --dry 빼고 다시 돌리세요.' : `\n다 올렸어요. ${article}`);

for (const page of browsers.values()) {
  // eslint-disable-next-line no-await-in-loop
  await page
    .context()
    .close()
    .catch(() => {});
}
