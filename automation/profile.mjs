import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Where each account's logged-in browser profile lives. */
export const PROFILES = join(HERE, 'profiles');

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
  const dir = join(PROFILES, alias.replace(/[\\/:*?"<>|]/g, '_'));

  mkdirSync(dir, { recursive: true });

  const base = {
    headless,
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
      args: [...base.args, ...(headless ? ['--headless=new'] : []), '--no-sandbox'],
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
 * Check whether a profile is still signed in to Naver.
 * @param {import('playwright').BrowserContext} context - Open browser.
 * @returns {Promise<boolean>} True when signed in.
 */
export async function isLoggedIn(context) {
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto('https://www.naver.com', { waitUntil: 'domcontentloaded' });

  return page
    .locator('.MyView-module__link_login___HpHMW')
    .count()
    .then((n) => n === 0);
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
