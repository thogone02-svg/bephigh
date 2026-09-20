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
