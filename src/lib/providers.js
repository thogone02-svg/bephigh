import { readEventStream } from './http.js';

/**
 * Models the app can generate with, cheapest first.
 * `in` and `out` are USD per one million tokens, as of 2026-09-15.
 */
export const MODELS = [
  { id: 'luna', maker: 'openai', api: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', in: 0.2, out: 1.2 },
  {
    id: 'flash-lite',
    maker: 'google',
    api: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    in: 0.25,
    out: 1.5,
  },
  {
    id: 'flash',
    maker: 'google',
    api: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    in: 0.75,
    out: 3.75,
  },
  {
    id: 'haiku',
    maker: 'anthropic',
    api: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    in: 1,
    out: 5,
  },
  {
    id: 'sonnet5',
    maker: 'anthropic',
    api: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    in: 2,
    out: 10,
  },
  { id: 'terra', maker: 'openai', api: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', in: 2, out: 12 },
  {
    id: 'sonnet46',
    maker: 'anthropic',
    api: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    in: 3,
    out: 15,
  },
  { id: 'sol', maker: 'openai', api: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', in: 4, out: 20 },
  { id: 'astra', maker: 'openai', api: 'gpt-6-astra', name: 'GPT-6 Astra', in: 10, out: 50 },
];

const MAKER_NAMES = { openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic' };

/**
 * Look up a model by its app-level id.
 * @param {string} id - Model id such as `luna`.
 * @returns {(typeof MODELS)[number]} Model definition.
 * @throws {Error} When the id is unknown.
 */
export const findModel = (id) => {
  const model = MODELS.find((entry) => entry.id === id);

  if (!model) {
    throw new Error('고를 수 없는 모델이에요. 설정에서 모델을 다시 골라 주세요.');
  }

  return model;
};

/**
 * Turn a provider error response into a message the user can act on.
 * @param {Response} response - Failed response.
 * @param {string} maker - Provider key.
 * @returns {Promise<string>} Korean message.
 */
const describe = async (response, maker) => {
  const name = MAKER_NAMES[maker] ?? maker;
  const text = await response.text().catch(() => '');
  const detail = text.slice(0, 300);
  // 구글은 키가 틀려도 400으로 답하고, 이유는 본문 안에만 적어 줍니다.
  const badKey = /API_KEY_INVALID|API key not valid|invalid[_ ]api[_ ]key/i.test(detail);

  if (response.status === 401 || response.status === 403 || badKey) {
    return `${name} API 키가 올바르지 않아요. 설정에서 키를 다시 넣어 주세요.`;
  }

  if (/billing|quota|insufficient|credit/i.test(detail)) {
    return `${name} 잔액이나 사용 한도가 부족해요. ${name} 콘솔에서 결제를 확인해 주세요.`;
  }

  if (response.status === 404 || /not found|does not exist|unknown model/i.test(detail)) {
    return `${name}에 그 모델이 없어요. 설정에서 다른 모델을 골라 주세요.`;
  }

  if (response.status === 429) {
    return `${name} 사용량이 잠시 막혔어요. 조금 뒤에 다시 시도해 주세요.`;
  }

  return `${name} 오류(${response.status})예요. ${detail}`;
};

const CALLS = {
  /**
   * Start a streaming completion on OpenAI.
   * @param {object} params - Request parameters.
   * @param {string} params.apiKey - API key.
   * @param {string} params.model - Provider model id.
   * @param {string} params.system - System prompt.
   * @param {string} params.user - User prompt.
   * @param {number} params.maxTokens - Output cap.
   * @returns {Promise<Response>} Streaming response.
   */
  openai: async ({ apiKey, model, system, user, maxTokens }) => {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

    /**
     * @param tokenField
     */
    const chat = (tokenField) =>
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          stream: true,
          [tokenField]: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });

    let response = await chat('max_completion_tokens');

    if (response.ok) {
      return response;
    }

    // Older models take `max_tokens` instead; newer ones only answer on /v1/responses.
    const detail = await response
      .clone()
      .text()
      .catch(() => '');

    if (/max_completion_tokens|max_tokens/i.test(detail)) {
      response = await chat('max_tokens');

      if (response.ok) {
        return response;
      }
    }

    const viaResponses = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        stream: true,
        max_output_tokens: maxTokens,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    return viaResponses.ok ? viaResponses : response;
  },

  /**
   * Start a streaming completion on Google Gemini.
   * @param {object} params - Request parameters.
   * @param {string} params.apiKey - API key.
   * @param {string} params.model - Provider model id.
   * @param {string} params.system - System prompt.
   * @param {string} params.user - User prompt.
   * @param {number} params.maxTokens - Output cap.
   * @returns {Promise<Response>} Streaming response.
   */
  google: ({ apiKey, model, system, user, maxTokens }) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    ),

  /**
   * Start a streaming completion on Anthropic.
   * @param {object} params - Request parameters.
   * @param {string} params.apiKey - API key.
   * @param {string} params.model - Provider model id.
   * @param {string} params.system - System prompt.
   * @param {string} params.user - User prompt.
   * @param {number} params.maxTokens - Output cap.
   * @returns {Promise<Response>} Streaming response.
   */
  anthropic: ({ apiKey, model, system, user, maxTokens }) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // The rules never change between manuscripts, so let Anthropic keep them
        // cached. A cached read costs about a tenth of a fresh one.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        stream: true,
        messages: [{ role: 'user', content: user }],
      }),
    }),
};

const PICKERS = {
  /**
   * Pull the text delta out of an OpenAI stream event.
   * @param {any} event - Parsed event.
   * @returns {string} Text delta.
   */
  openai: (event) => {
    if (event?.type === 'response.output_text.delta') {
      return event.delta ?? '';
    }

    return event?.choices?.[0]?.delta?.content ?? '';
  },

  /**
   * Pull the text delta out of a Gemini stream event.
   * @param {any} event - Parsed event.
   * @returns {string} Text delta.
   */
  google: (event) =>
    (event?.candidates?.[0]?.content?.parts ?? [])
      .map((/** @type {any} */ part) => part?.text ?? '')
      .join(''),

  /**
   * Pull the text delta out of an Anthropic stream event.
   * @param {any} event - Parsed event.
   * @returns {string} Text delta.
   */
  anthropic: (event) => (event?.delta?.type === 'text_delta' ? (event.delta.text ?? '') : ''),
};

/**
 * Stream a completion from whichever provider owns the chosen model.
 * @param {object} params - Request parameters.
 * @param {string} params.modelId - App-level model id.
 * @param {Record<string, string>} params.keys - API keys by provider key.
 * @param {string} params.system - System prompt.
 * @param {string} params.user - User prompt.
 * @param {number} [params.maxTokens] - Output cap.
 * @returns {AsyncGenerator<string>} Generator of text deltas.
 * @throws {Error} When the key is missing or the provider rejects the request.
 * @yields {string} Text delta.
 */
export async function* streamCompletion({ modelId, keys, system, user, maxTokens = 8000 }) {
  const model = findModel(modelId);
  const apiKey = keys?.[model.maker];

  if (!apiKey) {
    throw new Error(`${MAKER_NAMES[model.maker]} API 키가 없어요. 설정에서 먼저 넣어 주세요.`);
  }

  const response = await CALLS[model.maker]({
    apiKey,
    model: model.api,
    system,
    user,
    maxTokens,
  });

  if (!response.ok || !response.body) {
    throw new Error(await describe(response, model.maker));
  }

  const pick = PICKERS[model.maker];

  for await (const payload of readEventStream(response)) {
    if (payload === '[DONE]') {
      return;
    }

    let event;

    try {
      event = JSON.parse(payload);
    } catch {
      // Providers occasionally send keep-alive lines that are not JSON.
      event = null;
    }

    if (event?.error) {
      throw new Error(`${MAKER_NAMES[model.maker]} 오류: ${event.error.message ?? '알 수 없음'}`);
    }

    const delta = event ? pick(event) : '';

    if (delta) {
      yield delta;
    }
  }
}
