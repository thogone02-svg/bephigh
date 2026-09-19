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
    /** 한 번에 어디까지 올릴지. Body / first / all */
    scope: 'all',
  },
  docs: [],
  library: [],
  /** 쓰는 도중에 창이 닫혀도 남도록, 흘러오는 글을 여기에 계속 적어 둬요. */
  draft: null,
};

const DB_NAME = 'nabi.workbench';
const DB_STORE = 'state';
const DB_KEY = 'current';

/** Handed out so the app can start from a blank slate before the saved data arrives. */
export const emptyState = () => structuredClone(EMPTY);

let opening = null;

/**
 * Open the database the app keeps its work in.
 *
 * LocalStorage only gives a site about 5MB, which ran out at a few hundred
 * manuscripts. This store is limited by free disk space instead.
 * @returns {Promise<IDBDatabase>} Open database.
 */
const openDb = () => {
  if (opening) {
    return opening;
  }

  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    /**
     *
     */
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) {
        request.result.createObjectStore(DB_STORE);
      }
    };

    /**
     *
     */
    request.onsuccess = () => resolve(request.result);
    /**
     *
     */
    request.onerror = () => reject(request.error ?? new Error('저장소를 열지 못했어요.'));
  });

  return opening;
};

/**
 * Run one read or write against the store.
 * @param {'readonly' | 'readwrite'} mode - Transaction mode.
 * @param {(store: IDBObjectStore) => IDBRequest} run - What to do with the store.
 * @returns {Promise<any>} Whatever the request returned.
 */
const tx = async (mode, run) => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, mode);
    const request = run(transaction.objectStore(DB_STORE));

    /**
     *
     */
    request.onsuccess = () => resolve(request.result);
    /**
     *
     */
    transaction.onerror = () => reject(transaction.error ?? request.error);
    /**
     *
     */
    transaction.onabort = () => reject(transaction.error ?? new Error('저장이 막혔어요.'));
  });
};

/**
 * Fill in anything a saved state is missing, so older saves keep working.
 * @param {Record<string, any>} saved - State read back from storage.
 * @returns {typeof EMPTY} Complete state.
 */
const withDefaults = (saved) => ({
  ...structuredClone(EMPTY),
  ...saved,
  settings: { ...EMPTY.settings, ...(saved.settings ?? {}) },
});

/**
 * Read whatever the old localStorage version of the app left behind.
 * @returns {Record<string, any> | null} Saved state, or null when there is none.
 */
const readLegacy = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};

/**
 * Read the saved state, falling back to an empty one.
 *
 * Work saved by the earlier localStorage version is carried over the first
 * time this runs. The old copy is left alone so nothing is lost if the
 * browser refuses the new store.
 * @returns {Promise<typeof EMPTY>} Saved state.
 */
export const load = async () => {
  try {
    const saved = await tx('readonly', (store) => store.get(DB_KEY));

    if (saved) {
      return withDefaults(saved);
    }

    const legacy = readLegacy();

    if (legacy) {
      await tx('readwrite', (store) => store.put(legacy, DB_KEY));

      return withDefaults(legacy);
    }

    return structuredClone(EMPTY);
  } catch {
    // No database available (private window, blocked storage). Fall back to
    // the old store so the app still opens with the work that is there.
    const legacy = readLegacy();

    return legacy ? withDefaults(legacy) : structuredClone(EMPTY);
  }
};

let queued = null;
let writing = false;
/**
 *
 */
let onTrouble = () => {};

/**
 * Say what to do when a save fails, so the app can tell the user.
 * @param {(error: Error) => void} handler - Called with the failure.
 */
export const onSaveError = (handler) => {
  onTrouble = handler;
};

/**
 * Write whatever is queued, then whatever arrived while that was happening.
 * @returns {Promise<void>} Resolves once the queue is empty.
 */
const flush = async () => {
  if (writing || !queued) {
    return;
  }

  writing = true;

  while (queued) {
    const next = queued;

    queued = null;

    try {
      // eslint-disable-next-line no-await-in-loop
      await tx('readwrite', (store) => store.put(next, DB_KEY));
    } catch (error) {
      writing = false;
      onTrouble(/** @type {Error} */ (error));

      return;
    }
  }

  writing = false;
};

/**
 * Save the state.
 *
 * Writing happens just after the call returns, and only the newest state is
 * written when several changes land together. A failure is reported through
 * `onSaveError` rather than here.
 * @param {typeof EMPTY} state - State to save.
 * @returns {boolean} True once the save is queued.
 */
export const save = (state) => {
  try {
    queued = structuredClone(state);
  } catch {
    queued = JSON.parse(JSON.stringify(state));
  }

  flush();

  return true;
};

/**
 * Measure how much room the app is using and how much it has.
 * @returns {Promise<{ bytes: number, limit: number, ratio: number, known: boolean }>} Usage.
 */
export const usage = async () => {
  try {
    const { usage: bytes = 0, quota = 0 } = await navigator.storage.estimate();

    return {
      bytes,
      limit: quota,
      ratio: quota ? Math.min(1, bytes / quota) : 0,
      known: quota > 0,
    };
  } catch {
    return { bytes: 0, limit: 0, ratio: 0, known: false };
  }
};

/**
 * Turn a byte count into something readable.
 * @param {number} bytes - Byte count.
 * @returns {string} Readable size.
 */
export const readableSize = (bytes) => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
};

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
