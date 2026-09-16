const KEY = 'nabi.workbench.v1';

/** Shape of everything the app keeps in the browser. */
const EMPTY = {
  settings: {
    keys: { openai: '', google: '', anthropic: '' },
    model: 'luna',
    upgrade: false,
    upgradeModel: 'terra',
    mobileShape: true,
    tone: '후기형',
    length: 'medium',
    commentCount: 4,
    googleClientId: '',
    lastDoc: null,
    cafeUrl: '',
    board: '',
    accounts: [],
    assign: {},
    gaps: { first: 3, between: 2, reply: 1 },
  },
  docs: [],
  library: [],
};

/**
 * Read the saved state, falling back to an empty one.
 * @returns {typeof EMPTY} Saved state.
 */
export const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');

    if (!saved) {
      return structuredClone(EMPTY);
    }

    return {
      ...structuredClone(EMPTY),
      ...saved,
      settings: { ...EMPTY.settings, ...(saved.settings ?? {}) },
    };
  } catch {
    return structuredClone(EMPTY);
  }
};

/**
 * Write the state back to the browser.
 * @param {typeof EMPTY} state - State to save.
 * @returns {boolean} False when the browser refused to save, usually because it is full.
 */
export const save = (state) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));

    return true;
  } catch {
    return false;
  }
};

/** Browsers give one site about 5MB of this kind of storage. */
const LIMIT = 5 * 1024 * 1024;

/**
 * Measure how much of the browser storage the app is using.
 * @returns {{ bytes: number, limit: number, ratio: number }} Usage in bytes.
 */
export const usage = () => {
  let bytes = 0;

  try {
    // Browsers count this storage in UTF-16 code units, so two bytes per character.
    bytes = (localStorage.getItem(KEY) ?? '').length * 2;
  } catch {
    bytes = 0;
  }

  return { bytes, limit: LIMIT, ratio: Math.min(1, bytes / LIMIT) };
};

/**
 * Turn a byte count into something readable.
 * @param {number} bytes - Byte count.
 * @returns {string} Readable size.
 */
export const readableSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;

/**
 * Make a short unique id.
 * @param {string} prefix - Id prefix.
 * @returns {string} Unique id.
 */
export const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Download text as a file.
 * @param {string} name - File name.
 * @param {string} text - File contents.
 */
export const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');

  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Call a streaming API route and report each event.
 * @param {string} path - API path.
 * @param {Record<string, any>} body - Request body.
 * @param {(event: Record<string, any>) => void} onEvent - Called for every event.
 * @returns {Promise<void>} Resolves when the stream ends.
 * @throws {Error} When the request fails before streaming starts.
 */
export const streamPost = async (path, body, onEvent) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({}));

    throw new Error(detail.error ?? '요청이 실패했어요.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();

    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');

    buffer = lines.pop() ?? '';

    const events = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => {
        try {
          return JSON.parse(line.slice(5).trim());
        } catch {
          // Partial frames are skipped; the next chunk completes them.
          return null;
        }
      })
      .filter(Boolean);

    // Errors thrown by the caller must reach the caller, so this is outside the parse guard.
    events.forEach((event) => onEvent(event));
  }
};
