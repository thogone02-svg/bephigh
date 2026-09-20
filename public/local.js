/*
 * 이 컴퓨터에서 도는 「카페 올리기」 프로그램과 이야기하는 쪽.
 *
 * 프로그램을 켜 두면 여기로 바로 계획을 넘깁니다. 파일을 받아서 옮기고
 * 프로그램을 다시 누르는 일이 없어져요.
 *
 * 프로그램이 꺼져 있으면 아무 일도 안 하고 없다고만 알려줍니다.
 */

const HOME = 'http://127.0.0.1:8765';

/**
 * Ask the program something.
 * @param {string} path - What to ask for.
 * @param {Record<string, any>} [body] - What to send.
 * @param {number} [waitMs] - How long to wait.
 * @returns {Promise<Record<string, any> | null>} The answer, or null when it is not there.
 */
async function ask(path, body, waitMs = 3000) {
  const stop = AbortSignal.timeout(waitMs);

  try {
    const said = await fetch(`${HOME}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: stop,
    });

    return await said.json();
  } catch {
    return null;
  }
}

/**
 * See whether the program is running on this computer.
 * @returns {Promise<boolean>} True when it answers.
 */
export const localProgram = async () => Boolean((await ask('/ping'))?.ok);

/**
 * Hand the plan to the program and let it post.
 * @param {Record<string, any>} plan - Plan with steps and accounts.
 * @param {boolean} dry - True to fill everything in without pressing 등록.
 * @returns {Promise<Record<string, any> | null>} What it said.
 */
export const runOnLocal = (plan, dry) =>
  ask('/run', { plan, accounts: plan.accounts ?? [], dry }, 10000);

/**
 * Ask how far it has got.
 * @returns {Promise<Record<string, any> | null>} Where it is.
 */
export const localStatus = () => ask('/status');

/**
 * Tell it to stop.
 * @returns {Promise<Record<string, any> | null>} What it said.
 */
export const stopLocal = () => ask('/stop');
