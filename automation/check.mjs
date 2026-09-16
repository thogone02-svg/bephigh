import { readdirSync } from 'node:fs';
import { openAs, isLoggedIn, PROFILES } from './profile.mjs';

let saved = [];

try {
  saved = readdirSync(PROFILES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
} catch {
  saved = [];
}

if (!saved.length) {
  console.log('아직 로그인해 둔 계정이 없어요. npm run login -- "별칭" 부터 해주세요.');
  process.exit(0);
}

for (const alias of saved) {
  // eslint-disable-next-line no-await-in-loop
  const context = await openAs(alias, true);
  // eslint-disable-next-line no-await-in-loop
  const ok = await isLoggedIn(context).catch(() => false);

  console.log(`${ok ? '✅' : '❌'} ${alias}${ok ? '' : ' — 다시 로그인해 주세요'}`);

  // eslint-disable-next-line no-await-in-loop
  await context.close();
}
