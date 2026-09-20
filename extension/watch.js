/*
 * 네이버에 나가는 요청을 한 번만 엿보는 쪽.
 *
 * 왜 필요하냐면요. 지금은 카페 화면에서 칸을 찾아 글자를 넣고 단추를 누릅니다.
 * 그래서 네이버가 화면을 바꾸면 멈춰요. 화면 대신 「요청」을 그대로 보내면
 * 창도 필요 없고 화면이 바뀌어도 안 깨집니다.
 *
 * 그 요청이 어떻게 생겼는지는 직접 한 번 올려 보면서 보는 게 제일 정확해요.
 * 켜 두고 카페에 글을 하나 올리면, 그때 나간 요청을 적어 둡니다.
 *
 * 비밀번호나 쿠키 같은 건 적지 않아요. 주소와 보낸 내용만 봅니다.
 */

/** 적어 둘 수 있는 개수. 너무 많이 쌓이지 않게요. */
const KEEP = 30;
/** 본문 길이 제한. */
const LONGEST = 4000;
/** 로그 찍는 주소들. 볼 필요 없어요. */
const NOISE = /lcs\.naver\.com|ni\.naver\.com|siape\.veta|nlog|\.gif(\?|$)|\.png|\.js(\?|$)|\.css/i;
/** 보면 안 되는 머리말. */
const SECRET = /^(cookie|authorization|set-cookie)$/i;
/** 지금 엿보는 중인지. 서비스 워커가 다시 켜지면 저장해 둔 값으로 되살려요. */
let watching = false;
/** 적는 일을 한 줄로 세워 둬요. 같이 쓰면 하나가 사라집니다. */
let queue = Promise.resolve();

chrome.storage.session
  .get('watching')
  .then((got) => {
    watching = Boolean(got.watching);
  })
  .catch(() => {});

/**
 * Turn watching on or off.
 * @param {boolean} on - True to start watching.
 * @returns {Promise<void>} Done.
 */
export async function setWatching(on) {
  watching = Boolean(on);
  await chrome.storage.session.set({ watching });
}

/**
 * Read back what we saw.
 * @returns {Promise<Record<string, any>[]>} What went out.
 */
export async function caught() {
  return (await chrome.storage.session.get('caught')).caught ?? [];
}

/**
 * Throw away what we saw.
 * @returns {Promise<void>} Done.
 */
export async function forget() {
  await chrome.storage.session.set({ caught: [] });
}

/**
 * Put one thing on the list.
 *
 * 주소와 머리말이 거의 같은 때에 따로 들어와요. 둘 다 저장소를 읽고 쓰는데,
 * 겹치면 하나가 덮여서 사라집니다. 그래서 한 줄로 세워서 차례대로 씁니다.
 * @param {string} id - Request id, so the body and the headers find each other.
 * @param {Record<string, any>} bits - What we learned.
 * @returns {Promise<void>} Done once it is written.
 */
function note(id, bits) {
  queue = queue
    .then(async () => {
      const all = await caught();
      const mine = all.find((one) => one.id === id);

      if (mine) {
        Object.assign(mine, bits);
      } else {
        all.push({ id, ...bits });
      }

      await chrome.storage.session.set({ caught: all.slice(-KEEP) });
    })
    .catch(() => {});

  return queue;
}

/**
 * Turn whatever was sent into readable text.
 * @param {Record<string, any>} body - What chrome handed us.
 * @returns {string} Readable text.
 */
function readBody(body) {
  if (!body) {
    return '';
  }

  if (body.formData) {
    return JSON.stringify(body.formData).slice(0, LONGEST);
  }

  const raw = body.raw?.[0]?.bytes;

  if (!raw) {
    return '(못 읽었어요)';
  }

  try {
    return new TextDecoder().decode(raw).slice(0, LONGEST);
  } catch {
    return '(글자가 아니에요)';
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!watching || NOISE.test(details.url)) {
      return;
    }

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(details.method)) {
      return;
    }

    note(details.requestId, {
      at: new Date().toISOString(),
      method: details.method,
      url: details.url,
      body: readBody(details.requestBody),
    });
  },
  { urls: ['*://*.naver.com/*'] },
  ['requestBody'],
);

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!watching || NOISE.test(details.url)) {
      return;
    }

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(details.method)) {
      return;
    }

    const headers = {};

    (details.requestHeaders ?? []).forEach((one) => {
      if (!SECRET.test(one.name)) {
        headers[one.name] = one.value;
      }
    });

    note(details.requestId, { headers });
  },
  { urls: ['*://*.naver.com/*'] },
  ['requestHeaders'],
);
