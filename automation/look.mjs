/*
 * 카페 화면을 한 번에 다 떠 오는 프로그램.
 *
 * 왜 필요하냐면요. 만든 사람은 네이버에 접속할 수 없어서, 카페 화면이
 * 어떻게 생겼는지 추측으로 맞춥니다. 그래서 틀릴 때마다 한 번씩 돌려 보고
 * 고치기를 반복하게 돼요. 그게 지겨운 일이라서, 필요한 화면을 전부 떠서
 * 파일로 남깁니다. 그 파일 하나만 보내 주시면 한 번에 다 고칠 수 있어요.
 *
 * 담는 것: 게시판 · 글쓰기 · 글(댓글 자리) 화면의 사진과 속 구조,
 * 그리고 우리 눈(page.js)이 그 화면에서 무엇을 찾았는지.
 * 비밀번호는 안 담습니다.
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoard } from '../extension/board.js';
import { act } from '../extension/page.js';
import { openAs, isLoggedIn } from './profile.mjs';
import { readAccounts } from './accounts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '살펴본것');

/**
 * Find the board address to look at.
 * @returns {string} Board address.
 */
function boardUrl() {
  const asked = process.argv.slice(2).find((one) => one.startsWith('http'));

  if (asked) {
    return asked;
  }

  const plans = readdirSync(HERE).filter(
    (one) =>
      one.toLowerCase().endsWith('.json') && !one.startsWith('package') && one !== 'accounts.json',
  );

  for (const one of plans) {
    try {
      const plan = JSON.parse(readFileSync(join(HERE, one), 'utf8'));

      if (plan.cafeUrl) {
        return plan.cafeUrl;
      }
    } catch {
      // 다음 파일을 봅니다.
    }
  }

  return '';
}

const url = boardUrl();

if (!url) {
  console.error('\n✖ 어느 게시판을 볼지 모르겠어요.');
  console.error('  작업실에서 「자동 업로드 파일 내려받기」로 받은 파일을 이 폴더에 넣거나,');
  console.error('  이 프로그램에 게시판 주소를 붙여서 실행해 주세요.');
  process.exit(1);
}

const board = readBoard(url);
const account = readAccounts()[0] ?? null;

console.log('\n  카페 화면을 떠 옵니다. 창이 하나 열려요.');
console.log(`  게시판: ${url}`);
console.log(
  board.write
    ? `  읽음: 카페 ${board.clubId} · 게시판 ${board.menuId}`
    : '  ⚠ 주소에서 번호를 못 읽었어요',
);
console.log('');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const context = await openAs(account?.id || '살펴보기', false);
const page = context.pages()[0] ?? (await context.newPage());
const naver = /naver\.com$/i.test(new URL(url).hostname);

if (naver && !(await isLoggedIn(context))) {
  console.log('  로그인이 필요해요. 열린 창에서 직접 로그인해 주세요. (5분 기다립니다)');
  await page.goto('https://nid.naver.com/nidlogin.login').catch(() => {});
  await page
    .waitForURL((where) => !/nid\.naver\.com/.test(where.href), { timeout: 300000 })
    .catch(() => {});
  console.log('  이어서 갑니다.\n');
}

/**
 * Save one screen: a picture, the innards, and what our eyes found there.
 * @param {string} name - What to call it.
 * @param {string} where - Address to open.
 */
async function keep(name, where) {
  console.log(`  ${name} 보는 중…`);
  await page.goto(where, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);

  const found = {};

  for (const what of ['look', 'check', 'form?', 'comment?', 'write-link', 'ids', 'first-article']) {
    // eslint-disable-next-line no-await-in-loop
    found[what] = await page.evaluate(act, { what, text: '' }).catch((error) => ({
      ok: false,
      reason: error.message,
    }));
  }

  writeFileSync(
    join(OUT, `${name}.json`),
    JSON.stringify({ where, url: page.url(), found }, null, 1),
  );
  writeFileSync(join(OUT, `${name}.html`), await page.content());
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
}

await keep('1_게시판', url);

const article = await page
  .evaluate(act, { what: 'first-article', text: '' })
  .catch(() => ({ ok: false }));

if (board.write) {
  await keep('2_글쓰기', board.write);
}

if (article.ok) {
  await keep('3_글과댓글', article.url);
} else {
  console.log('  글 목록에서 글을 못 찾아서 댓글 화면은 못 떴어요.');
}

await context.close();

console.log('');
console.log('  다 떴어요.');
console.log(`  ${OUT}`);
console.log('');
console.log('  그 폴더를 통째로 압축해서 보내 주시면, 한 번에 다 고칠 수 있어요.');
console.log('  (비밀번호는 안 담깁니다. 카페 화면 그대로만 담겨요.)');
console.log('');

if (existsSync(OUT)) {
  readdirSync(OUT).forEach((one) => console.log(`    ${one}`));
}

console.log('');
