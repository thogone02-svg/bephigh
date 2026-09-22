import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 네이버 로그인 화면. 시험할 때만 다른 곳을 봅니다. */
const LOGIN_URL = process.env.NABI_LOGIN_URL ?? 'https://nid.naver.com/nidlogin.login';

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
 * Read what Naver itself is complaining about on the login screen.
 *
 * 「로그인이 안 됐어요」 만 말하면 사장님이 뭘 고쳐야 하는지 알 수 없어요.
 * 네이버가 화면에 써 준 말을 그대로 가져옵니다.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @returns {Promise<string>} What Naver said, or an empty string.
 */
async function whatNaverSaid(page) {
  return page
    .evaluate(() => {
      const spots = [
        '.error_message',
        '#err_common',
        '.login_error_text',
        '[role="alert"]',
        '.error_text',
        '.captcha',
        '#captcha',
      ];

      for (const spot of spots) {
        const said = document.querySelector(spot)?.innerText?.trim();

        if (said) {
          return said.replace(/\s+/g, ' ').slice(0, 200);
        }
      }

      const body = document.body?.innerText ?? '';

      const lines = body
        .split('\n')
        .map((one) => one.trim())
        .filter(Boolean);

      const hit = lines.find((one) =>
        /잘못 입력|일치하지|보안|자동입력|캡차|기기|차단|제한|중단/.test(one),
      );

      return (hit ?? '').slice(0, 200);
    })
    .catch(() => '');
}

/**
 * Press the 로그인 button, however Naver has named it this month.
 *
 * 네이버는 이 단추 이름을 자주 바꿉니다. 그래서 세 가지 길을 차례로 갑니다.
 *  ① 단추처럼 보이는 걸 찾아서 진짜로 누르기
 *  ② 비밀번호 칸에서 <엔터>
 *  ③ 화면 안에서 「로그인」 이라고 쓰인 것을 직접 누르기 (없으면 양식을 그대로 보내기)
 * 하나만 되면 됩니다. 되는 순간 멈춥니다.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @param {import('playwright').Locator} pwBox - The password box.
 * @returns {Promise<string>} Which way worked, or an empty string.
 */
async function pressLogin(page, pwBox) {
  /**
   *
   */
  const left = () => !/nid\.naver\.com/.test(page.url());

  const ways = [
    [
      '로그인 단추를 눌러서',
      async () => {
        const button = page
          .locator(
            [
              '#log\\.login',
              '.btn_login',
              'button[type="submit"]',
              'input[type="submit"]',
              'button:has-text("로그인")',
              'a:has-text("로그인")',
              '[role="button"]:has-text("로그인")',
            ].join(', '),
          )
          .first();

        await button.click({ timeout: 5000 });
      },
    ],
    [
      '엔터를 쳐서',
      async () => {
        await pwBox.press('Enter');
      },
    ],
    [
      '화면 안에서 직접 눌러서',
      async () => {
        const done = await page.evaluate(() => {
          /**
           * @param node
           */
          const words = (node) => (node.textContent ?? node.value ?? '').replace(/\s+/g, '');

          const all = [
            ...document.querySelectorAll(
              'button, a, span[role="button"], div[role="button"], input[type="submit"], input[type="button"]',
            ),
          ];

          // 단추가 아닌 것으로 만들어 둔 화면도 있어요. 「로그인」 이라고만 쓰인
          // 가장 안쪽 조각까지 찾아봅니다.
          const leaves = [...document.querySelectorAll('*')].filter(
            (node) =>
              /^로그인(하기)?$/.test(words(node)) &&
              ![...node.children].some((kid) => /^로그인(하기)?$/.test(words(kid))),
          );

          // 「로그인」 「로그인하기」 「로그인 하기」 다 같은 단추예요.
          const hit =
            all.find((node) => /^로그인(하기)?$/.test(words(node))) ??
            all.find(
              (node) =>
                /로그인/.test(words(node)) && !/아이디|비밀번호|찾기|가입/.test(words(node)),
            ) ??
            leaves[leaves.length - 1];

          if (hit) {
            hit.click();

            return true;
          }

          const form = document.querySelector('form');

          if (form) {
            if (form.requestSubmit) {
              form.requestSubmit();
            } else {
              form.submit();
            }

            return true;
          }

          return false;
        });

        if (!done) {
          throw new Error('누를 게 없었어요');
        }
      },
    ],
  ];

  for (const [name, go] of ways) {
    // eslint-disable-next-line no-await-in-loop
    const tried = await go()
      .then(() => true)
      .catch(() => false);

    if (tried) {
      // eslint-disable-next-line no-await-in-loop
      await page.waitForTimeout(2500);

      if (left()) {
        return name;
      }

      // 눌렸는데 아직 그 자리면, 네이버가 뭐라고 했는지 보고 끝냅니다.
      // eslint-disable-next-line no-await-in-loop
      const said = await whatNaverSaid(page);

      if (said) {
        return name;
      }
    }
  }

  return '';
}

/**
 * Turn on 「로그인 상태 유지」 so the login survives closing the browser.
 *
 * 이걸 안 켜면 쿠키가 창을 닫을 때 사라져요. 그러면 올릴 때마다 로그인 화면을
 * 다시 거치게 되고, 손으로 한 번 로그인해 두신 것도 안 남습니다.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @returns {Promise<void>} Resolves when we have tried.
 */
async function keepMeIn(page) {
  await page
    .locator('#keep, input[name="nvlong"]')
    .first()
    .check({ timeout: 2000 })
    .catch(() => {});

  // 이름이 바뀌었으면 「로그인 상태 유지」라고 쓰인 것 옆의 칸을 켭니다.
  await page
    .evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')];

      const mine = boxes.find((box) => {
        const near = `${box.closest('label')?.textContent ?? ''} ${
          document.querySelector(`label[for="${box.id}"]`)?.textContent ?? ''
        } ${box.getAttribute('aria-label') ?? ''}`;

        return /로그인\s*상태\s*유지|상태유지/.test(near.replace(/\s+/g, ' '));
      });

      if (mine && !mine.checked) {
        mine.click();
      }
    })
    .catch(() => {});
}

/**
 * Fill in the Naver login form and submit it.
 *
 * 네이버는 로그인 화면을 자주 바꿔요. 그래서 단추 이름에 기대지 않습니다.
 * 칸을 채우고, 누를 수 있는 길을 다 눌러 봅니다. 그래도 안 되면
 * 네이버가 화면에 써 준 말을 그대로 가져와서 알려 드려요.
 * @param {import('playwright').Page} page - Page on the login screen.
 * @param {{ id: string, pw: string }} account - Account to sign in as.
 * @returns {Promise<{ ok: boolean, reason?: string, how?: string }>} How it went.
 */
export async function fillLogin(page, account) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 이미 들어가 있으면 네이버가 로그인 화면을 안 보여줍니다. 그럼 그대로 끝.
  if (!/nid\.naver\.com/.test(page.url())) {
    return { ok: true, how: '이미 로그인돼 있어서' };
  }

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

  // 「로그인 상태 유지」를 켜 둡니다. 이걸 안 켜면 크롬을 닫을 때 로그인이 날아가서
  // 올릴 때마다 매번 다시 로그인하게 돼요. 네이버도 그걸 더 수상하게 봅니다.
  await keepMeIn(page);

  const how = await pressLogin(page, pwBox);

  if (!how) {
    return {
      ok: false,
      reason:
        '로그인 단추를 못 눌렀어요. 네이버가 화면을 바꾼 것 같습니다. ' +
        '시작하기 5번으로 그 계정에 한 번만 직접 로그인해 두시면 그 뒤로는 알아서 씁니다.',
    };
  }

  await page.waitForTimeout(1500);

  if (/nid\.naver\.com/.test(page.url())) {
    const said = await whatNaverSaid(page);

    return {
      ok: false,
      how,
      reason: said
        ? `${how} 보냈는데 네이버가 이렇게 말했어요: 「${said}」`
        : `${how} 보냈는데도 로그인 화면에 그대로 있어요. 보안문자나 새 기기 확인이 뜬 것 같습니다.`,
    };
  }

  return { ok: true, how };
}
