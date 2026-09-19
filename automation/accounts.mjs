import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 웹앱의 「계정 파일 내려받기」로 받아서 이 폴더에 둔 파일. */
export const ACCOUNTS_FILE = join(HERE, 'accounts.json');

/**
 * Read the saved accounts, if the file is there.
 *
 * 비밀번호를 안 적어 두셨어도 됩니다. 그 경우엔 직접 로그인한 기록만 씁니다.
 * @returns {{ alias: string, id: string, pw: string }[]} Accounts.
 */
export function readAccounts() {
  try {
    const saved = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));

    return (saved.accounts ?? []).map((a) => ({
      alias: String(a.alias ?? ''),
      id: String(a.id ?? ''),
      pw: String(a.pw ?? ''),
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
 * 네이버가 캡차를 띄우면 사람이 풀어야 해요. 그때는 창을 열어 둔 채로 기다립니다.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @param {{ id: string, pw: string }} account - Account to sign in as.
 * @returns {Promise<void>} Resolves once submitted.
 */
export async function fillLogin(page, account) {
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 붙여넣기로 넣어야 네이버가 자동 입력으로 안 보고 덜 막아요.
  await page.locator('#id').click();
  await page.locator('#id').fill(account.id);
  await page.waitForTimeout(400);
  await page.locator('#pw').click();
  await page.locator('#pw').fill(account.pw);
  await page.waitForTimeout(400);
  await page.locator('#log\\.login, .btn_login').first().click();
  await page.waitForTimeout(4000);
}
