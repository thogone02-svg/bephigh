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

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBoard } from '../extension/board.js';
import { runPlan } from './runner.mjs';
import { readAccounts } from './accounts.mjs';

// 뜻밖의 일이 나도 시뻘건 글씨 대신 읽을 수 있는 말로 알려줘요.
const blewUp = (error) => {
  console.error(`\n✖ ${error?.message ?? error}`);
  console.error('  인터넷이 끊겼거나, 카페 주소가 잘못됐거나, 크롬이 닫힌 걸 수도 있어요.');
  console.error('  다시 한 번 눌러 보시고, 계속 이러면 이 글자를 그대로 알려주세요.');
  process.exit(1);
};

process.on('uncaughtException', blewUp);
process.on('unhandledRejection', blewUp);

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const show = args.includes('--show');

const asked = args
  .filter((one) => !one.startsWith('--'))
  .join(' ')
  .trim();

/** 이 폴더에 있는 업로드 파일들. 프로그램이 쓰는 파일은 빼요. */
const NOT_A_PLAN = ['accounts.json', 'package.json', 'package-lock.json'];

/**
 * List the plan files sitting next to this program.
 * @returns {string[]} File names.
 */
const plansHere = () =>
  readdirSync(HERE).filter(
    (one) => one.toLowerCase().endsWith('.json') && !NOT_A_PLAN.includes(one.toLowerCase()),
  );

/**
 * Find the plan file, even when the name was typed a bit wrong.
 *
 * 「.json」을 빼고 치거나 앞부분만 쳐도 찾아줍니다.
 * @param {string} name - What the person typed.
 * @returns {string} Path to the file.
 */
function findPlan(name) {
  const tries = [name, `${name}.json`, join(HERE, name), join(HERE, `${name}.json`)];
  const found = tries.find((one) => one && existsSync(one));

  if (found) {
    return found;
  }

  const want = name.replace(/\.json$/i, '').trim();

  const near = plansHere().find((one) =>
    one
      .replace(/\.json$/i, '')
      .trim()
      .startsWith(want),
  );

  if (want && near) {
    return join(HERE, near);
  }

  console.error(`\n✖ 「${name}」 파일을 못 찾았어요.`);

  const all = plansHere();

  if (all.length) {
    console.error('  이 폴더에 있는 파일은 이거예요:');
    all.forEach((one) => console.error(`    ${one}`));
    console.error('  이름을 그대로 적어 주세요. 「.json」까지 넣으셔야 해요.');
  } else {
    console.error('  이 폴더에 업로드 파일이 없어요.');
    console.error(
      '  작업실 업로드 화면에서 「자동 업로드 파일 내려받기」로 받아 이 폴더에 넣어 주세요.',
    );
  }

  process.exit(1);

  return '';
}

/**
 * Pick the newest plan file sitting in this folder.
 *
 * 이름을 치지 않아도 되게, 방금 받아 둔 파일을 알아서 씁니다.
 * @returns {string} Path to the file.
 */
function newestPlan() {
  const all = plansHere()
    .map((one) => ({ one, at: statSync(join(HERE, one)).mtimeMs }))
    .sort((a, b) => b.at - a.at);

  if (!all.length) {
    console.error('\n✖ 이 폴더에 올릴 원고 파일이 없어요.');
    console.error('  작업실 업로드 화면에서 「자동 업로드 파일 내려받기」를 누르고,');
    console.error('  받은 파일을 이 폴더에 넣은 다음 다시 눌러 주세요.');
    process.exit(1);
  }

  if (all.length > 1) {
    console.log(`(파일이 ${all.length}개라 가장 최근 것을 씁니다)`);
  }

  return join(HERE, all[0].one);
}

const file = asked ? findPlan(asked) : newestPlan();
let plan = null;

try {
  plan = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`\n✖ 「${file}」 를 못 읽었어요. ${error.message}`);
  console.error('  작업실에서 받은 파일이 맞는지 봐주세요.');
  process.exit(1);
}

if (!Array.isArray(plan.steps) || !plan.steps.length) {
  console.error('업로드 파일에 올릴 단계가 없어요.');
  process.exit(1);
}

const board = readBoard(plan.cafeUrl);

console.log(`\n파일: ${file.split(/[\\/]/).pop()}`);
console.log(`「${plan.keyword}」 — ${plan.steps.length}단계`);
console.log(`주소: ${plan.cafeUrl}`);
console.log(
  board.write
    ? `읽음: 카페 ${board.clubId} · 게시판 ${board.menuId}`
    : '⚠ 주소에서 게시판 번호를 못 읽었어요. 글쓰기 링크를 찾아 들어가 봅니다.',
);
console.log(dry ? '연습 모드예요. 등록은 안 누릅니다.' : '진짜로 올립니다. 멈추려면 Ctrl+C.');
console.log(show ? '창을 띄워 놓고 합니다.\n' : '창 없이 뒤에서 합니다.\n');

/**
 * Print what is going on, one line at a time.
 * @param {Record<string, any>} message - What happened.
 */
function tell(message) {
  if (message.type === 'seats') {
    console.log('자리 배정');
    message.seats.forEach(([seat, who]) => console.log(`  ${seat} → ${who || '(아이디 없음)'}`));
    console.log('');
  }

  if (message.type === 'waiting') {
    console.log(`   ${message.what}까지 ${Math.round(message.seconds / 60)}분 기다려요`);
  }

  if (message.type === 'doing') {
    console.log(`${message.no}. ${message.what} · ${message.who}`);
  }

  if (message.type === 'done-step') {
    console.log(message.dry ? '   (연습이라 등록은 안 눌러요)' : '   됐어요');
  }

  if (message.type === 'note') {
    console.log(`   ${message.message}`);
  }
}

const how = await runPlan(plan, { dry, show, accounts: readAccounts(), say: tell });

if (!how.ok) {
  console.error(`\n✖ ${how.reason}`);

  if (how.seen) {
    console.error('  그 화면에서 본 것:');
    console.error(`  ${JSON.stringify(how.seen).slice(0, 700)}`);
  }

  process.exit(1);
}

console.log(how.note ?? '');
console.log(
  dry ? '\n연습 끝. 괜찮으면 3번으로 진짜로 올리세요.' : `\n다 올렸어요. ${how.url ?? ''}`,
);
