/*
 * 올리는 일을 실제로 해내는 쪽.
 *
 * 명령창에서 부르든(upload.mjs), 작업실에서 바로 부르든(server.mjs)
 * 여기 하나만 씁니다. 그래야 두 길이 따로 놀지 않아요.
 *
 * 카페 화면을 보는 눈은 확장과 똑같은 파일(extension/page.js)을 씁니다.
 */

import { readBoard, writeUrl, articleUrl, articleIdFrom } from '../extension/board.js';
import { act } from '../extension/page.js';
import { openAs, isLoggedIn } from './profile.mjs';
import { fillLogin } from './accounts.mjs';

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
 * Decide which account sits in which seat.
 *
 * 계정.txt 에 적힌 순서가 자리예요. 첫 줄이 본문, 그다음이 댓글1, 댓글2…
 * 별칭을 직접 적어 두셨으면 그 이름이 먼저입니다.
 * @param {Record<string, any>} plan - The plan.
 * @param {{ alias: string, id: string, pw: string }[]} accounts - Accounts.
 * @returns {Map<string, Record<string, any>>} Seat name to account.
 */
export function seatAccounts(plan, accounts) {
  const seats = [];

  (plan.steps ?? []).forEach((step) => {
    if (!seats.includes(step.profile)) {
      seats.push(step.profile);
    }
  });

  const named = new Map();
  const rest2 = [];

  accounts.forEach((one) => {
    if (one.alias && seats.includes(one.alias)) {
      named.set(one.alias, one);
    } else {
      rest2.push(one);
    }
  });

  const sat = new Map();

  seats.forEach((seat) => {
    const mine = named.get(seat) ?? rest2.shift();

    if (mine) {
      sat.set(seat, mine);
    }
  });

  return sat;
}

/**
 * Put one plan up on the cafe.
 * @param {Record<string, any>} plan - What to post.
 * @param {Record<string, any>} how - How to do it.
 * @param {boolean} [how.dry] - Fill everything in but do not press 등록.
 * @param {boolean} [how.show] - Show the browser window.
 * @param {Record<string, any>[]} [how.accounts] - Accounts to use.
 * @param {(message: Record<string, any>) => void} [how.say] - Told about every step.
 * @returns {Promise<Record<string, any>>} How it went.
 */
export async function runPlan(plan, how = {}) {
  const { dry = false, show = false, accounts = [], say = () => {} } = how;
  const board = readBoard(plan.cafeUrl);
  const naver = /naver\.com$/i.test(new URL(plan.cafeUrl).hostname);
  const sitting = seatAccounts(plan, accounts);
  const browsers = new Map();
  const seats = [...new Set(plan.steps.map((one) => one.profile))];

  if (sitting.size < seats.length) {
    return {
      ok: false,
      reason: '계정이 모자라요. 계정.txt 에 한 줄씩 더 적어 주세요. 순서가 자리예요.',
    };
  }

  say({ type: 'seats', seats: seats.map((seat) => [seat, sitting.get(seat)?.id ?? '']) });

  /**
   * Get the browser for one seat, logging in the first time.
   * @param {string} seat - Seat name.
   * @returns {Promise<Record<string, any>>} A page, or why we could not get one.
   */
  async function pageFor(seat) {
    if (browsers.has(seat)) {
      return { ok: true, page: browsers.get(seat) };
    }

    const account = sitting.get(seat) ?? null;
    const context = await openAs(account?.id || seat, !show);
    const page = context.pages()[0] ?? (await context.newPage());

    if (naver && !(await isLoggedIn(context))) {
      if (!account?.id || !account?.pw) {
        await context.close();

        return {
          ok: false,
          reason: `「${seat}」 자리의 계정이 로그인돼 있지 않아요. 계정.txt 에 비밀번호까지 적어 두시거나, 시작하기 5번으로 한 번 로그인해 주세요.`,
        };
      }

      say({ type: 'note', message: `${seat} 로그인하는 중…` });

      const typed = await fillLogin(page, account);

      if (!typed.ok) {
        return { ok: false, reason: `「${seat}」 ${typed.reason}` };
      }

      await page
        .waitForURL((url) => !/nid\.naver\.com/.test(url.href), { timeout: 120000 })
        .catch(() => {});

      if (/nid\.naver\.com/.test(page.url())) {
        return {
          ok: false,
          reason: `「${seat}」 로그인이 안 끝났어요. 보안문자나 새 기기 확인이 뜬 것 같습니다. 시작하기 5번으로 직접 로그인해 두고 다시 눌러 주세요.`,
        };
      }
    }

    browsers.set(seat, page);

    return { ok: true, page };
  }

  /**
   * Do one small thing inside the cafe page, in whichever frame answers.
   * @param {Record<string, any>} page - Open page.
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
   * Put text in by actually typing it.
   *
   * 스마트에디터는 값을 밀어 넣으면 안 들어가요. 사람이 치는 걸 받아야 합니다.
   * 그래서 그 자리를 눌러 놓고 진짜 자판으로 칩니다.
   * @param {Record<string, any>} page - Open page.
   * @param {string} which - `title`, `body` or `comment`.
   * @param {string} text - What to type.
   * @returns {Promise<Record<string, any>>} How it went.
   */
  async function typeInto(page, which, text) {
    const want = String(text ?? '');

    /**
     * Check whether the words actually landed.
     * @returns {Promise<boolean>} True when they are there.
     */
    const landed = async () => {
      const back = await inPage(page, 'read', which);
      const bit = want.replace(/\s+/g, '').slice(0, 10);

      return Boolean(back.ok && bit && back.text.replace(/\s+/g, '').includes(bit));
    };

    /**
     * Click the spot for real, the way a person would.
     * @param {Record<string, any>} spot - What the page told us about the box.
     */
    const clickFor = async (spot) => {
      if (spot.spot) {
        // 플레이라이트가 직접 누르면 「사람이 누른 것」으로 칩니다. 화면도 알아서 맞춰요.
        await page.click(spot.spot, { timeout: 8000 }).catch(() => {});
      } else if (spot.at) {
        await page.mouse.click(spot.at.x, spot.at.y).catch(() => {});
      }

      await page.waitForTimeout(500);
    };

    /**
     * Type the text in, line by line.
     * @param {boolean} slowly - True to press every key, false to push it in at once.
     */
    const put = async (slowly) => {
      const lines = want.split('\n');

      for (const [at, line] of lines.entries()) {
        if (at > 0) {
          // eslint-disable-next-line no-await-in-loop
          await page.keyboard.press('Enter');
          // eslint-disable-next-line no-await-in-loop
          await page.waitForTimeout(80);
        }

        if (line) {
          // eslint-disable-next-line no-await-in-loop
          await (slowly ? page.keyboard.type(line, { delay: 12 }) : page.keyboard.insertText(line));
        }

        // eslint-disable-next-line no-await-in-loop
        await page.waitForTimeout(80);
      }

      await page.waitForTimeout(600);
    };

    const spot = await inPage(page, 'focus', which);

    if (!spot.ok) {
      return spot;
    }

    await clickFor(spot);
    await put(false);

    if (await landed()) {
      return { ok: true };
    }

    // 한 번에 밀어 넣는 게 안 먹는 화면이 있어요. 그때는 한 글자씩 칩니다.
    say({ type: 'note', message: `${which} 에 한 글자씩 쳐 봅니다` });
    await clickFor(await inPage(page, 'focus', which));
    await put(true);

    if (await landed()) {
      return { ok: true };
    }

    const back = await inPage(page, 'read', which);
    const look = await inPage(page, 'look');

    return {
      ok: false,
      reason: `${which} 에 글이 안 들어갔어요 (지금: ${back.text ?? ''})`,
      seen: [{ 눌렀던자리: spot, 지금들어있는것: back, 화면: look.seen ?? look }],
    };
  }

  /**
   * Keep asking until the page is ready.
   * @param {Record<string, any>} page - Open page.
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
      await rest(700);
    }

    return last;
  }

  /**
   * Close every browser we opened.
   */
  async function closeAll() {
    for (const page of browsers.values()) {
      // eslint-disable-next-line no-await-in-loop
      await page
        .context()
        .close()
        .catch(() => {});
    }

    browsers.clear();
  }

  let article = plan.article ?? '';
  let clock = 0;

  try {
    for (const step of plan.steps) {
      const waitMs = Math.max(0, (step.at - clock) * 60 * 1000);

      if (waitMs > 0) {
        say({ type: 'waiting', no: step.no, what: step.what, seconds: waitMs / 1000 });
        // eslint-disable-next-line no-await-in-loop
        await rest(waitMs);
      }

      clock = step.at;
      say({ type: 'doing', no: step.no, what: step.what, who: step.profile });

      // eslint-disable-next-line no-await-in-loop
      const got = await pageFor(step.profile);

      if (!got.ok) {
        return { ok: false, reason: got.reason, no: step.no };
      }

      const { page } = got;

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
              return {
                ok: false,
                no: step.no,
                reason: '글쓰기 화면으로 못 들어갔어요. 게시판 주소를 다시 넣어 주세요.',
                seen: ids.seen,
              };
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
          const blocked = /접속할 수 없|권한이 없|로그인/.test(look.page ?? '');

          return {
            ok: false,
            no: step.no,
            reason: blocked
              ? `네이버가 그 화면을 안 열어 줬어요 (${look.page}). 「${step.profile}」 자리의 계정이 로그인돼 있는지, 그 게시판에 글을 쓸 수 있는 계정인지 봐주세요.`
              : '글쓰기 화면이 안 떴어요.',
            seen: look.seen ?? [look],
          };
        }

        // eslint-disable-next-line no-await-in-loop
        const title = await typeInto(page, 'title', step.title ?? '');

        if (!title.ok) {
          return { ok: false, no: step.no, reason: title.reason, seen: title.seen };
        }

        // eslint-disable-next-line no-await-in-loop
        const body = await typeInto(page, 'body', step.text ?? '');

        if (!body.ok) {
          return { ok: false, no: step.no, reason: body.reason, seen: body.seen };
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        await page.goto(article || plan.cafeUrl, { waitUntil: 'domcontentloaded' });

        if (step.kind === 'reply') {
          // eslint-disable-next-line no-await-in-loop
          const opened = await inPage(page, 'open-reply', step.replyTo ?? '');

          if (!opened.ok) {
            return { ok: false, no: step.no, reason: opened.reason, seen: opened.seen };
          }

          // eslint-disable-next-line no-await-in-loop
          await rest(1500);
        }

        // eslint-disable-next-line no-await-in-loop
        const ready = await waitFor(page, 'comment?', 15);

        if (!ready.ok) {
          return {
            ok: false,
            no: step.no,
            reason: '댓글 칸이 안 보여요. 그 카페에서 댓글을 쓸 수 있는 계정인지 봐주세요.',
            seen: ready.seen,
          };
        }

        // eslint-disable-next-line no-await-in-loop
        const filled = await typeInto(page, 'comment', step.text ?? '');

        if (!filled.ok) {
          return { ok: false, no: step.no, reason: filled.reason, seen: filled.seen };
        }
      }

      if (dry) {
        say({ type: 'done-step', no: step.no, dry: true });

        if (step.kind === 'post') {
          return {
            ok: true,
            dry: true,
            note: '연습은 본문까지만 해봐요. 댓글은 글이 올라가 있어야 달 수 있어요.',
          };
        }

        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const sent = await inPage(page, 'submit', step.kind === 'post' ? 'post' : 'comment');

      if (!sent.ok) {
        return { ok: false, no: step.no, reason: sent.reason, seen: sent.seen };
      }

      // eslint-disable-next-line no-await-in-loop
      await rest(step.kind === 'post' ? 4000 : 2500);

      if (step.kind === 'post') {
        const id = articleIdFrom(page.url());

        if (!id) {
          return {
            ok: false,
            no: step.no,
            reason:
              '글은 올라갔는데 글 주소를 못 읽었어요. 댓글은 그 글을 열어 두고 이어서 해주세요.',
          };
        }

        article = board.clubId ? articleUrl(board.clubId, id, board.home) : page.url();
      }

      say({ type: 'done-step', no: step.no, url: article });
    }

    return { ok: true, url: article, dry };
  } finally {
    await closeAll();
  }
}
