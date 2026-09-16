import { fail, json, readBody, sse } from './lib/http.js';
import { parseManuscript, renderManuscript } from './lib/manuscript.js';
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

  yield { type: 'done', manuscript: parseManuscript(text), raw: text };
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

  return sse(run(body, generatePrompt(body.options, body.references ?? [])));
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

  return json({ manuscript: parseManuscript(String(body.text ?? '')) });
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

const ROUTES = {
  'POST /api/cafe/fetch': cafeFetch,
  'POST /api/generate': generate,
  'POST /api/revise': revise,
  'POST /api/parse': parse,
  /**
   * Handle `GET /api/models`.
   * @returns {Response} JSON response listing the models the app can use.
   */
  'GET /api/models': () => json({ models: MODELS }),
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
      return env.ASSETS.fetch(request);
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
