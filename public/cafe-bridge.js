/*
 * 카페 올리기 확장과 이야기하는 쪽.
 *
 * 확장이 깔려 있으면 여기로 말을 걸어서 올리고, 진행 상황을 받아옵니다.
 * 확장이 없으면 아무 일도 안 하고 없다고만 알려줘요.
 */

const OUT = 'nabi-cafe-request';
const IN = 'nabi-cafe-event';
/** 확장이 보내오는 진행 소식을 받을 사람들. */
const listeners = new Set();

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.channel !== IN) {
    return;
  }

  listeners.forEach((listen) => listen(event.data.payload));
});

/**
 * Hear about each step as the extension works through the plan.
 * @param {(event: Record<string, any>) => void} listen - Called for every update.
 * @returns {() => void} Call this to stop hearing.
 */
export const onCafeEvent = (listen) => {
  listeners.add(listen);

  return () => listeners.delete(listen);
};

/**
 * Ask the extension something and wait for the one reply.
 * @param {Record<string, any>} payload - What to ask.
 * @param {number} [waitMs] - How long to wait.
 * @returns {Promise<Record<string, any> | null>} The reply, or null when nothing came.
 */
const askExtension = (payload, waitMs = 2500, only = null) =>
  new Promise((done) => {
    let settled = false;

    const stop = onCafeEvent((reply) => {
      // 올리는 동안에는 진행 소식이 계속 와요. 물어본 것에 대한 답만 받습니다.
      if (settled || (only && reply?.type !== only && reply?.type !== 'error')) {
        return;
      }

      settled = true;
      stop();
      done(reply);
    });

    window.postMessage({ channel: OUT, payload }, '*');

    setTimeout(() => {
      if (!settled) {
        settled = true;
        stop();
        done(null);
      }
    }, waitMs);
  });

/**
 * See whether the extension is installed in this browser.
 * @returns {Promise<string>} Its version, or an empty string when it is not there.
 */
export const cafeExtension = async () => {
  if (!document.documentElement.dataset.nabiCafe) {
    return '';
  }

  const reply = await askExtension({ type: 'nabi-ping' }, 2500, 'pong');

  return reply?.type === 'pong' ? reply.version : '';
};

/**
 * Hand the plan over and let the extension post it.
 * @param {Record<string, any>} plan - Plan with steps and accounts.
 * @param {boolean} dry - True to fill everything in without pressing 등록.
 * @returns {Promise<Record<string, any> | null>} First reply from the extension.
 */
export const runInCafe = (plan, dry) =>
  askExtension({ type: 'nabi-run', plan: { ...plan, dry } }, 6000);

/**
 * Tell the extension to stop after the step it is on.
 * @returns {Promise<Record<string, any> | null>} Reply.
 */
export const stopCafe = () => askExtension({ type: 'nabi-stop' });

/**
 * Look at the cafe first, without posting anything.
 *
 * 올리기 전에 글쓰기 화면과 댓글 자리를 미리 봐 둡니다.
 * @param {string} cafeUrl - Board address.
 * @returns {Promise<Record<string, any> | null>} What the extension found.
 */
export const checkCafe = (cafeUrl) =>
  askExtension({ type: 'nabi-check', cafeUrl }, 90000, 'checked');

/**
 * Ask whether something is being posted right now.
 *
 * 작업실 화면을 새로고침해도 올리던 것이 이어지고 있으면 다시 보여주려고요.
 * @returns {Promise<Record<string, any> | null>} What it is in the middle of.
 */
export const cafeStatus = () => askExtension({ type: 'nabi-status' }, 2500, 'status');
