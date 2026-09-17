import { fail, json, readBody, sse } from './lib/http.js';
import { BUILD } from './version.js';
import { parseManuscript, parseManuscripts, renderManuscript } from './lib/manuscript.js';
import { fetchCafeArticle } from './lib/naver-cafe.js';
import { MODELS, streamCompletion } from './lib/providers.js';
import { generatePrompt, revisePrompt, systemPrompt } from './lib/prompts.js';

/**
 * Stream a generation or revision back to the browser.
 * @param {Record<string, any>} body - Request body.
 * @param {string} user - User prompt.
 * @returns {AsyncGenerator<Record<string, any>>} Generator of events.
 * @yields {Record<string, any>} Stream event.
 */
async function* run(body, user) {
  const system = systemPrompt(body.options?.mobileShape !== false, body.options?.tone);
  let text = '';

  yield { type: 'start', model: body.modelId };

  for await (const delta of streamCompletion({
    modelId: body.modelId,
    keys: body.keys ?? {},
    system,
    user,
  })) {
    text += delta;
    yield { type: 'delta', text: delta };
  }

  const manuscript = parseManuscript(text);

  // A model that declines the request sends prose back, not a manuscript.
  if (!manuscript.title || !(manuscript.comments ?? []).length) {
    yield {
      type: 'error',
      message: `모델이 원고 대신 다른 답을 보냈어요. 설정에서 다른 모델로 바꿔 보세요.\n\n받은 답: ${text.trim().slice(0, 300)}`,
    };

    return;
  }

  yield { type: 'done', manuscript, raw: text };
}

/**
 * Handle `POST /api/generate`.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Response>} Streaming response.
 */
const generate = async (request) => {
  const body = await readBody(request);

  if (!String(body.options?.keyword ?? '').trim()) {
    return fail('키워드를 넣어 주세요.');
  }

  return sse(run(body, generatePrompt(body.options, body.references ?? [], body.styleCard ?? '')));
};

/**
 * Handle `POST /api/revise`.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Response>} Streaming response.
 */
const revise = async (request) => {
  const body = await readBody(request);
  const current = renderManuscript(body.manuscript ?? {});

  return sse(run(body, revisePrompt(body.options ?? {}, current, body.instructions ?? {})));
};

/**
 * Handle `POST /api/parse` — read an uploaded manuscript file.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Response>} JSON response.
 */
const parse = async (request) => {
  const body = await readBody(request);
  const found = parseManuscripts(String(body.text ?? ''));

  // 파일 하나에 원고가 여러 편 들어 있는 경우가 많아서 전부 돌려줍니다.
  // manuscript 는 예전 호출부를 위해 남겨 둡니다.
  return json({ manuscripts: found, manuscript: found[0] ?? parseManuscript('') });
};

/**
 * Handle `POST /api/cafe/fetch` — read a public cafe article.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Response>} JSON response.
 */
const cafeFetch = async (request) => {
  const body = await readBody(request);
  const url = String(body.url ?? '').trim();

  if (!url) {
    return fail('카페 글 주소를 넣어 주세요.');
  }

  try {
    return json({ article: await fetchCafeArticle(url) });
  } catch (error) {
    return fail(/** @type {Error} */ (error).message, 422);
  }
};

/**
 * Handle `POST /api/check` — try one model with the saved key.
 *
 * 원고를 쓰다가 키가 틀린 걸 알게 되면 늦어요. 아주 짧은 요청을 한 번 보내
 * 되는지 미리 봅니다.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Response>} JSON response.
 */
const check = async (request) => {
  const body = await readBody(request);

  try {
    let got = '';

    for await (const delta of streamCompletion({
      modelId: body.modelId,
      keys: body.keys ?? {},
      system: '한 글자로만 답하세요.',
      user: '안녕',
      maxTokens: 16,
    })) {
      got += delta;

      if (got.trim()) {
        break;
      }
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: /** @type {Error} */ (error).message });
  }
};

const ROUTES = {
  'POST /api/cafe/fetch': cafeFetch,
  'POST /api/check': check,
  'POST /api/generate': generate,
  'POST /api/revise': revise,
  'POST /api/parse': parse,
  /**
   * Handle `GET /api/models`.
   * @returns {Response} JSON response listing the models the app can use.
   */
  'GET /api/models': () => json({ models: MODELS, build: BUILD }),
};

export default {
  /**
   * Route a request to the API, falling back to the static assets.
   * @param {Request} request - Incoming request.
   * @param {Record<string, any>} env - Worker bindings.
   * @returns {Promise<Response>} Response.
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);

      if (!asset.headers.get('content-type')?.includes('text/html')) {
        return asset;
      }

      // 화면 파일은 늘 새로 받아오고, 그 안의 주소에 판 번호를 붙여서
      // 브라우저가 옛 app.js 를 계속 쓰지 않게 합니다.
      const html = (await asset.text()).replace(
        /(href|src)="\/(app\.(?:js|css))"/g,
        `$1="/$2?v=${BUILD}"`,
      );

      return new Response(html, {
        status: asset.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const route = ROUTES[`${request.method} ${url.pathname}`];

    if (!route) {
      return fail('없는 주소예요.', 404);
    }

    try {
      return await route(request);
    } catch (error) {
      return fail(/** @type {Error} */ (error).message, 500);
    }
  },
};
