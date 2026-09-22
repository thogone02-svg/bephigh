import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 웹앱의 「계정 파일 내려받기」로 받아서 이 폴더에 둔 파일. */
export const ACCOUNTS_FILE = join(HERE, 'accounts.json');

/** 메모장으로 직접 적는 파일. 이게 있으면 이걸 먼저 씁니다. */
export const ACCOUNTS_TEXT = join(HERE, '계정.txt');

/**
 * Read the accounts people type into 계정.txt.
 *
 * 한 줄에 하나씩 「아이디,비밀번호」. 순서가 자리예요 — 첫 줄이 본문, 그다음이 댓글1, 댓글2…
 * 자리 이름을 직접 적고 싶으면 「별칭,아이디,비밀번호」 로 세 칸을 쓰셔도 됩니다.
 * # 으로 시작하는 줄은 메모라서 건너뜁니다.
 * @returns {{ alias: string, id: string, pw: string }[]} Accounts.
 */
function readTyped() {
  try {
    return (
      readFileSync(ACCOUNTS_TEXT, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split(/[,\t]/).map((bit) => bit.trim()))
        .filter((bits) => bits[0])
        // 두 칸이면 「아이디,비밀번호」, 세 칸이면 「별칭,아이디,비밀번호」.
        .map((bits) =>
          bits.length >= 3
            ? { alias: bits[0], id: bits[1], pw: bits[2] }
            : { alias: '', id: bits[0], pw: bits[1] ?? '' },
        )
    );
  } catch {
    return [];
  }
}

/**
 * Read the saved accounts, if there are any.
 *
 * 메모장 파일(계정.txt)이 먼저고, 없으면 작업실에서 받은 accounts.json 을 씁니다.
 * 비밀번호를 안 적어 두셨어도 됩니다. 그 경우엔 직접 로그인한 기록만 씁니다.
 * @returns {{ alias: string, id: string, pw: string }[]} Accounts.
 */
export function readAccounts() {
  const typed = readTyped();

  if (typed.length) {
    return typed;
  }

  try {
    const saved = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));

    return (saved.accounts ?? []).map((one) => ({
      alias: String(one.alias ?? ''),
      id: String(one.id ?? ''),
      pw: String(one.pw ?? ''),
    }));
  } catch {
    return [];
  }
}

/**
 * Find one account by the alias the web app uses.
 * @param {string} alias - Account alias.
 * @returns {{ alias: string, id: string, pw: string } | null} Account.
 */
export function findAccount(alias) {
  return readAccounts().find((a) => a.alias === alias) ?? null;
}

/**
 * Fill in the Naver login form and submit it.
 *
 * 네이버는 로그인 화면을 자주 바꿔요. 그래서 단추 이름에 기대지 않습니다.
 * 칸을 채우고 <엔터>를 치면 어떤 화면이든 들어가집니다. 단추가 보이면 눌러도 보고요.
 * 캡차가 뜨면 사람이 풀어야 해요. 그때는 창을 열어 둔 채로 기다립니다.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @param {{ id: string, pw: string }} account - Account to sign in as.
 * @returns {Promise<{ ok: boolean, reason?: string }>} Whether we could fill it in.
 */
export async function fillLogin(page, account) {
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const idBox = page.locator('#id, input[name="id"], input[type="text"]').first();
  const pwBox = page.locator('#pw, input[name="pw"], input[type="password"]').first();

  try {
    await idBox.waitFor({ state: 'visible', timeout: 15000 });
    await pwBox.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return {
      ok: false,
      reason: '로그인 화면에서 아이디·비밀번호 칸을 못 찾았어요. 창을 열어서 직접 로그인해 주세요.',
    };
  }

  await idBox.click();
  await idBox.fill(account.id);
  await page.waitForTimeout(400);
  await pwBox.click();
  await pwBox.fill(account.pw);
  await page.waitForTimeout(400);

  // 글자가 「로그인」인 단추를 먼저 찾아보고, 없으면 엔터를 칩니다.
  const button = page
    .locator('#log\\.login, .btn_login, button[type="submit"], button:has-text("로그인")')
    .first();

  const pressed = await button
    .click({ timeout: 4000 })
    .then(() => true)
    .catch(() => false);

  if (!pressed) {
    await pwBox.press('Enter');
    await page.waitForTimeout(1500);
  }

  // 그래도 그 자리면, 화면 안에서 직접 보내 봅니다.
  if (/nid\.naver\.com/.test(page.url())) {
    await page
      .evaluate(() => {
        const words = (node) => (node.textContent ?? '').replace(/\s+/g, '');

        const hit = [
          ...document.querySelectorAll('button, a, span[role="button"], input[type="submit"]'),
        ].find((node) => /^로그인$/.test(words(node) || node.value || ''));

        if (hit) {
          hit.click();

          return;
        }

        document.querySelector('form')?.requestSubmit?.();
      })
      .catch(() => {});
  }

  await page.waitForTimeout(3000);

  return { ok: true };
}
