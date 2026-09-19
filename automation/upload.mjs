import { readFileSync } from 'node:fs';
import { openAs, isLoggedIn, waitWithCountdown } from './profile.mjs';
import { findAccount, fillLogin } from './accounts.mjs';
import { SELECTORS, cafeFrame, typeParagraphs } from './cafe.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const file = args.find((arg) => !arg.startsWith('--'));

if (!file) {
  console.error('쓰는 법: npm start -- "말라세지아 모낭염 업로드.json"');
  console.error('  --dry 를 붙이면 등록 버튼만 안 누르고 나머지는 그대로 해봐요.');
  process.exit(1);
}

const plan = JSON.parse(readFileSync(file, 'utf8'));

if (!Array.isArray(plan.steps) || !plan.steps.length) {
  console.error('업로드 파일에 올릴 단계가 없어요.');
  process.exit(1);
}

console.log(`\n「${plan.keyword}」 — ${plan.steps.length}단계`);
console.log(`게시판: ${plan.board || '(이름 없음)'}`);
console.log(`주소: ${plan.cafeUrl}`);

if (!/iframe_url|ArticleList|menuid/i.test(plan.cafeUrl)) {
  console.log(
    '\n⚠ 카페 첫 주소 같아요. 이러면 글쓰기에서 게시판이 안 골라져 있을 수 있어요.',
  );
  console.log('  올릴 게시판을 연 상태의 주소를 넣으시면 그 게시판으로 바로 갑니다.\n');
}
console.log(
  dry ? '연습 모드예요. 등록 버튼은 누르지 않습니다.\n' : '진짜로 올립니다. 멈추려면 Ctrl+C.\n',
);

// Every account this plan uses has to be signed in before anything goes up,
// so a half-finished thread never gets left sitting on the cafe.
const needed = [...new Set(plan.steps.map((step) => step.profile))];

for (const alias of needed) {
  // eslint-disable-next-line no-await-in-loop
  let context = await openAs(alias, true);
  // eslint-disable-next-line no-await-in-loop
  let ok = await isLoggedIn(context).catch(() => false);

  // eslint-disable-next-line no-await-in-loop
  await context.close();

  const account = findAccount(alias);

  // 로그인이 풀렸는데 아이디와 비밀번호를 적어 두셨으면 알아서 다시 들어가요.
  if (!ok && account?.id && account?.pw) {
    console.log(`   ${alias} 로그인이 풀려서 다시 들어가 볼게요…`);
    // eslint-disable-next-line no-await-in-loop
    context = await openAs(alias, false);
    // eslint-disable-next-line no-await-in-loop
    const page = context.pages()[0] ?? (await context.newPage());

    // eslint-disable-next-line no-await-in-loop
    await fillLogin(page, account).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    ok = await isLoggedIn(context).catch(() => false);
    // eslint-disable-next-line no-await-in-loop
    await context.close();
  }

  if (!ok) {
    console.error(`\n「${alias}」 계정이 로그인되어 있지 않아요.`);
    console.error(`먼저 이것부터 해주세요:  npm run login -- "${alias}"`);
    process.exit(1);
  }

  console.log(`✅ ${alias}`);
}

console.log('');

let articleUrl = null;
let posted = 0;

/**
 * Put up the article itself and remember where it landed.
 * @param {import('playwright').Page} page - Page opened as the body account.
 * @param {Record<string, any>} step - Step from the plan file.
 * @returns {Promise<void>} Resolves once posted.
 */
async function postArticle(page, step) {
  // 게시판을 열어 둔 주소로 가야 글쓰기를 눌렀을 때 그 게시판이 골라져 있어요.
  await page.goto(plan.cafeUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.locator(SELECTORS.writeButton).first().click();
  await page.waitForTimeout(2500);

  const frame = await cafeFrame(page);

  await frame
    .locator(SELECTORS.titleInput)
    .first()
    .fill(step.title ?? '');
  await typeParagraphs(frame, SELECTORS.bodyEditor, step.text);

  if (dry) {
    console.log('   (연습 모드라 등록은 안 눌렀어요)');

    return;
  }

  await frame.locator(SELECTORS.submitArticle).last().click();
  await page.waitForTimeout(4000);
  articleUrl = page.url();
  console.log(`   올렸어요 → ${articleUrl}`);
}

/**
 * Leave a comment, or a reply under the comment posted just before it.
 * @param {import('playwright').Page} page - Page opened as this step's account.
 * @param {Record<string, any>} step - Step from the plan file.
 * @returns {Promise<void>} Resolves once posted.
 */
async function postComment(page, step) {
  if (!articleUrl && !dry) {
    throw new Error('본문 주소를 모르겠어요. 본문 단계가 먼저 끝나야 합니다.');
  }

  await page.goto(articleUrl ?? plan.cafeUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const frame = await cafeFrame(page);

  if (step.kind === 'reply') {
    // The comment being answered is the last one on the page, because this
    // same run posted it a minute or two ago.
    const items = frame.locator(SELECTORS.commentItem);
    const count = await items.count();

    if (count) {
      await items
        .nth(count - 1)
        .locator(SELECTORS.replyButton)
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(800);
    }
  }

  await frame.locator(SELECTORS.commentBox).last().fill(step.text);

  if (dry) {
    console.log('   (연습 모드라 등록은 안 눌렀어요)');

    return;
  }

  await frame.locator(SELECTORS.commentSubmit).last().click();
  await page.waitForTimeout(2500);
  console.log('   달았어요');
}

for (const [index, step] of plan.steps.entries()) {
  const previous = index === 0 ? 0 : plan.steps[index - 1].at;

  // eslint-disable-next-line no-await-in-loop
  await waitWithCountdown((step.at - previous) * 60, step.what);

  console.log(`${step.no}. ${step.what} — ${step.profile}`);

  // eslint-disable-next-line no-await-in-loop
  const context = await openAs(step.profile, false);
  // eslint-disable-next-line no-await-in-loop
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    // eslint-disable-next-line no-await-in-loop
    await (step.kind === 'post' ? postArticle(page, step) : postComment(page, step));
    posted += 1;
  } catch (error) {
    console.error(`   ✋ 여기서 막혔어요: ${error.message}`);
    console.error(
      '   창은 열어 둘게요. 이 단계는 직접 올리시고, 나머지는 순서 화면에서 복사해 쓰세요.',
    );
    console.error(`   지금까지 ${posted}단계 올라갔습니다.`);

    // eslint-disable-next-line no-await-in-loop
    await new Promise((stop) => {
      context.on('close', stop);
    });
    process.exit(1);
  }

  // eslint-disable-next-line no-await-in-loop
  await context.close();
}

console.log(`\n끝났습니다. ${posted}단계 올렸어요.`);

if (articleUrl) {
  console.log(articleUrl);
}
