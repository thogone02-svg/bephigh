/*
 * 작업실에서 바로 올릴 수 있게, 이 컴퓨터 안에서만 듣는 작은 창구.
 *
 * 한 번 켜 두면 작업실에서 「업로드 시작」을 누르는 것만으로 올라갑니다.
 * 파일을 받아서 옮기고 이 프로그램을 다시 누르고 하는 일이 없어져요.
 *
 * 밖에서는 못 들어옵니다. 127.0.0.1 (이 컴퓨터) 에서만 듣고,
 * 정해 둔 작업실 주소에서 온 것만 받습니다.
 */

import { createServer } from 'node:http';
import { runPlan } from './runner.mjs';
import { readAccounts } from './accounts.mjs';

/** 이 창구가 듣는 자리. */
const PORT = Number(process.env.NABI_PORT ?? 8765);

/** 이 주소들에서 온 것만 받습니다. */
const ALLOWED = [
  'https://bephighcafe.thogone02.workers.dev',
  'http://127.0.0.1:8788',
  'http://localhost:8788',
];

/** 지금 무슨 일을 하고 있는지. 작업실이 물어보면 그대로 알려줍니다. */
const now = { running: false, dry: false, at: 0, steps: [], log: [], done: null };

/**
 * Remember one thing that happened.
 * @param {Record<string, any>} message - What happened.
 */
function note(message) {
  now.log.push({ ...message, when: Date.now() });

  if (now.log.length > 200) {
    now.log.shift();
  }

  if (message.no) {
    now.at = message.no;
  }

  const said = [
    message.what && `${message.no ?? ''} ${message.what}`.trim(),
    message.message,
  ].filter(Boolean);

  if (said.length) {
    console.log(`  ${said.join(' · ')}`);
  }
}

/**
 * Read the whole body of a request.
 * @param {Record<string, any>} req - The request.
 * @returns {Promise<Record<string, any>>} What was sent.
 */
const readBody = (req) =>
  new Promise((done) => {
    let raw = '';

    req.on('data', (bit) => {
      raw += bit;

      if (raw.length > 8_000_000) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        done(JSON.parse(raw || '{}'));
      } catch {
        done({});
      }
    });
  });

/**
 * Say yes or no back to the workshop.
 * @param {Record<string, any>} res - The response.
 * @param {Record<string, any>} body - What to say.
 * @param {number} [code] - Status code.
 */
function reply(res, body, code = 200) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const from = req.headers.origin ?? '';

  if (ALLOWED.includes(from)) {
    res.setHeader('Access-Control-Allow-Origin', from);
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);

    return res.end();
  }

  if (from && !ALLOWED.includes(from)) {
    return reply(res, { ok: false, reason: '이 주소에서는 못 써요.' }, 403);
  }

  const path = (req.url ?? '/').split('?')[0];

  if (path === '/ping') {
    return reply(res, {
      ok: true,
      program: '나비효과플랜 카페 올리기',
      version: 1,
      running: now.running,
    });
  }

  if (path === '/status') {
    return reply(res, { ok: true, ...now });
  }

  if (path === '/stop') {
    now.running = false;

    return reply(res, { ok: true });
  }

  if (path !== '/run' || req.method !== 'POST') {
    return reply(res, { ok: false, reason: '모르는 요청이에요.' }, 404);
  }

  if (now.running) {
    return reply(res, { ok: false, reason: '이미 올리는 중이에요.' }, 409);
  }

  const sent = await readBody(req);
  const plan = sent.plan ?? sent;

  if (!Array.isArray(plan?.steps) || !plan.steps.length) {
    return reply(res, { ok: false, reason: '올릴 단계가 없어요.' }, 400);
  }

  // 계정은 작업실에서 같이 보내 주는 걸 먼저 쓰고, 없으면 계정.txt 를 봅니다.
  const accounts =
    Array.isArray(sent.accounts) && sent.accounts.length ? sent.accounts : readAccounts();

  Object.assign(now, {
    running: true,
    dry: Boolean(sent.dry),
    at: 0,
    steps: plan.steps.map((one) => ({ no: one.no, what: one.what, who: one.profile })),
    log: [],
    done: null,
  });

  console.log(
    `\n「${plan.keyword ?? '원고'}」 ${plan.steps.length}단계 ${sent.dry ? '(연습)' : ''}`,
  );
  reply(res, { ok: true, started: true, steps: plan.steps.length });

  runPlan(plan, { dry: Boolean(sent.dry), show: Boolean(sent.show), accounts, say: note })
    .then((how) => {
      now.done = how;
      console.log(how.ok ? '  다 했어요.\n' : `  ✖ ${how.reason}\n`);
    })
    .catch((error) => {
      now.done = { ok: false, reason: error.message };
      console.log(`  ✖ ${error.message}\n`);
    })
    .finally(() => {
      now.running = false;
    });

  return undefined;
}).listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  나비효과플랜 카페 올리기 — 준비됐어요');
  console.log('  ------------------------------------');
  console.log('  이 창을 켜 두시고, 작업실에서 「업로드 시작」을 누르시면 됩니다.');
  console.log('  파일을 받아 옮기실 필요 없어요.');
  console.log('');
  console.log('  끄시려면 이 창을 닫으시면 됩니다.');
  console.log('');
});
