import { openAs, isLoggedIn, markSignedIn } from './profile.mjs';
import { findAccount, fillLogin } from './accounts.mjs';

const alias = process.argv.slice(2).join(' ').trim();

if (!alias) {
  console.error('쓰는 법: npm run login -- "댓글용1"');
  console.error('따옴표 안에는 웹앱 「자리 배정」에서 고른 별칭을 그대로 넣어 주세요.');
  process.exit(1);
}

console.log(`\n「${alias}」 계정으로 쓸 브라우저를 엽니다.`);
console.log('창이 뜨면 그 계정으로 직접 로그인해 주세요.');
console.log('로그인이 끝나면 창을 그냥 닫으시면 됩니다. 비밀번호는 저장하지 않아요.\n');

const context = await openAs(alias);
const page = context.pages()[0] ?? (await context.newPage());
const account = findAccount(alias);

if (account?.id && account?.pw) {
  console.log('저장해 두신 아이디와 비밀번호로 넣어 볼게요.');
  console.log('캡차가 뜨면 그것만 풀어 주시고, 로그인되면 창을 닫으세요.\n');
  await fillLogin(page, account);
} else {
  await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded' });
}

// 창은 사장님이 닫을 때까지 열려 있습니다. 그동안 로그인이 됐는지 지켜보다가,
// 되는 순간 「이 자리는 손으로 로그인해 뒀다」고 적어 둡니다. 그래야 나중에
// 업로드할 때 이 자리를 건너뛰지 않고 그대로 씁니다.
let saved = false;

const watching = setInterval(async () => {
  if (saved) {
    return;
  }

  const inside = await isLoggedIn(context).catch(() => false);

  if (inside) {
    saved = true;
    markSignedIn(alias, account?.id || '*');
    console.log('  로그인됐어요. 이제 창을 닫으셔도 됩니다.');
  }
}, 2000);

await new Promise((done) => {
  context.on('close', done);
});

clearInterval(watching);

if (saved) {
  console.log(`「${alias}」 로그인 기록을 저장했어요. 이제 자동 업로드에 쓸 수 있습니다.`);
} else {
  console.log(`「${alias}」 로그인이 안 된 것 같아요. 한 번 더 5번을 눌러 주세요.`);
}
