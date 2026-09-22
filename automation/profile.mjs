import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where each account's logged-in browser profile lives. */
export const PROFILES = join(HERE, 'profiles');

/**
 * Where one account's browser folder lives.
 * @param {string} alias - Account alias or id.
 * @returns {string} Folder path.
 */
export const profileDir = (alias) => join(PROFILES, String(alias).replace(/[\\/:*?"<>|]/g, '_'));

/**
 * Remember which account this folder is actually signed in as.
 *
 * 쿠키만 보고 「로그인돼 있네」 하면 틀립니다. 로그인이 반쯤 되다 만 적이 있으면
 * 쿠키는 남아 있는데 실제로는 안 들어가 있어요. 그러면 프로그램이 로그인을
 * 건너뛰고 그냥 카페로 가버려서, 사장님 눈에는 「로그인을 왜 안 누르지」로 보입니다.
 * 그래서 우리가 누구로 들어갔는지 직접 적어 둡니다.
 * @param {string} alias - Account alias or id (the folder).
 * @param {string} id - Naver id we signed in as.
 */
export function markSignedIn(alias, id) {
  try {
    writeFileSync(join(profileDir(alias), '누구.txt'), String(id ?? ''), 'utf8');
  } catch {
    // 못 적어도 큰일은 아니에요. 다음에 한 번 더 로그인할 뿐입니다.
  }
}

/**
 * Forget that this folder was signed in, so we log in again next time.
 * @param {string} alias - Account alias or id (the folder).
 */
export function forgetSignedIn(alias) {
  rmSync(join(profileDir(alias), '누구.txt'), { force: true });
}

/**
 * Read who this folder last signed in as.
 * @param {string} alias - Account alias or id (the folder).
 * @returns {string} Naver id, or an empty string.
 */
export function signedInAs(alias) {
  try {
    return readFileSync(join(profileDir(alias), '누구.txt'), 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Open the browser as one saved account.
 *
 * Each alias gets its own folder, so each one keeps its own Naver login.
 * Nothing but the cookies Naver itself sets is stored — no id, no password.
 * @param {string} alias - Account alias, matching the one chosen in the web app.
 * 컴퓨터에 깔린 크롬을 그대로 씁니다. 따로 받을 게 없어요.
 * @param {boolean} [headless] - Run without a visible window.
 * @returns {Promise<import('playwright').BrowserContext>} A browser logged in as that account.
 */
export async function openAs(alias, headless = false) {
  const dir = profileDir(alias);

  mkdirSync(dir, { recursive: true });

  // 시험할 때는 창 없이 돌려요. 평소엔 부르는 쪽이 정합니다.
  const hidden = process.env.NABI_HEADLESS === '1' || headless;

  const base = {
    headless: hidden,
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    args: ['--disable-blink-features=AutomationControlled'],
  };

  // ① 시험할 때 쓰는 길 ② 컴퓨터에 깔린 크롬 ③ 받아 둔 크로미움 순서로 열어 봐요.
  // 깔린 크롬을 쓰면 따로 받을 게 없고, 네이버도 덜 까다롭게 봅니다.
  const tries = [];

  if (process.env.NABI_CHROME) {
    tries.push({
      ...base,
      executablePath: process.env.NABI_CHROME,
      headless: false,
      args: [...base.args, ...(hidden ? ['--headless=new'] : []), '--no-sandbox'],
    });
  }

  tries.push({ ...base, channel: 'chrome' });
  tries.push(base);

  let last = null;

  for (const how of tries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await chromium.launchPersistentContext(dir, how);
    } catch (error) {
      last = error;
    }
  }

  throw last;
}

/**
 * Check whether a profile is really signed in to Naver as the account we want.
 *
 * 화면에 뭐가 보이는지로 판단하면 네이버가 디자인을 바꿀 때마다 틀려요.
 * 그래서 ① 로그인 쿠키 두 개가 다 있고 ② 우리가 적어 둔 「누구」가 이 계정일 때만
 * 로그인돼 있다고 봅니다. 하나라도 어긋나면 다시 로그인합니다.
 * @param {import('playwright').BrowserContext} context - Open browser.
 * @param {{ alias?: string, id?: string }} [who] - Which account should be in there.
 * @returns {Promise<boolean>} True when signed in as that account.
 */
export async function isLoggedIn(context, who = {}) {
  const cookies = await context.cookies('https://www.naver.com').catch(() => []);
  /**
   * @param name
   */
  const has = (name) => cookies.some((one) => one.name === name && one.value);

  if (!has('NID_AUT') || !has('NID_SES')) {
    return false;
  }

  const folder = who.alias || who.id;

  // 누구로 들어갔는지 모르겠으면, 쿠키만 믿지 않고 다시 로그인합니다.
  if (!folder || !who.id) {
    return true;
  }

  const mark = signedInAs(folder);

  // 「*」 는 사장님이 그 창에서 손으로 로그인해 두신 자리예요. 그건 그대로 믿습니다.
  return mark === who.id || mark === '*';
}

/**
 * Wait the given number of seconds, printing a countdown.
 * @param {number} seconds - How long to wait.
 * @param {string} what - What we are waiting for.
 * @returns {Promise<void>} Resolves when the wait is over.
 */
export async function waitWithCountdown(seconds, what) {
  if (seconds <= 0) {
    return;
  }

  process.stdout.write(`   ${what}까지 ${seconds}초 대기`);

  for (let left = seconds; left > 0; left -= 10) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((done) => {
      setTimeout(done, Math.min(10, left) * 1000);
    });
    process.stdout.write('.');
  }

  process.stdout.write('\n');
}
