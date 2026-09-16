/**
 * Build a JSON response.
 * @param {any} data - Payload to serialize.
 * @param {number} [status] - HTTP status code.
 * @returns {Response} JSON response.
 */
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/**
 * Build a JSON error response.
 * @param {string} message - Message shown to the user, in Korean.
 * @param {number} [status] - HTTP status code.
 * @returns {Response} JSON response describing the error.
 */
export const fail = (message, status = 400) => json({ error: message }, status);

/**
 * Read and validate a JSON request body.
 * @param {Request} request - Incoming request.
 * @returns {Promise<Record<string, any>>} Parsed body.
 * @throws {Error} When the body is not a JSON object.
 */
export const readBody = async (request) => {
  let body;

  try {
    body = await request.json();
  } catch {
    throw new Error('요청을 읽지 못했어요.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('요청 형식이 올바르지 않아요.');
  }

  return /** @type {Record<string, any>} */ (body);
};

/**
 * Stream an async generator of events to the browser as server-sent events.
 * @param {AsyncGenerator<Record<string, any>>} events - Events to send.
 * @returns {Response} Streaming response.
 */
export const sse = (events) => {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    /**
     * Pump the generator into the stream.
     * @param {ReadableStreamDefaultController} controller - Stream controller.
     * @returns {Promise<void>} Resolves once the generator is exhausted.
     */
    async start(controller) {
      /**
       * Write one event.
       * @param {Record<string, any>} event - Event payload.
       */
      const send = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of events) {
          send(event);
        }
      } catch (error) {
        send({ type: 'error', message: /** @type {Error} */ (error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
};

/**
 * Turn a fetch response body into an async generator of server-sent event payloads.
 * @param {Response} response - Streaming response from a model provider.
 * @returns {AsyncGenerator<string>} Generator of payloads.
 * @yields {string} Raw `data:` payload of each event.
 */
export async function* readEventStream(response) {
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n');

    buffer = chunks.pop() ?? '';

    for (const line of chunks) {
      const trimmed = line.trim();

      if (trimmed.startsWith('data:')) {
        yield trimmed.slice(5).trim();
      }
    }
  }
}
