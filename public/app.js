import { connect, createDoc, preloadGis } from './gdocs.js';
import {
  download,
  emptyState,
  load,
  onSaveError,
  readableSize,
  save,
  streamPost,
  uid,
  usage,
} from './store.js';
import { learnedFrom, pickReferences, styleCard } from './style.js';

const AUTHOR = '작성자';
const WON = 1400;

const ICON = {
  write: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M14 6l4 4"/>',
  refs: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  result:
    '<path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  export:
    '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/>',
  publish:
    '<path d="M7 18a4 4 0 0 1-.4-8A6 6 0 0 1 18 9.6 3.7 3.7 0 0 1 17.5 18H7Z"/><path d="M12 21v-7"/><path d="m9 16 3-3 3 3"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  image:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.4a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"/>',
};

const VIEWS = [
  { id: 'write', label: '생성' },
  { id: 'refs', label: '보관함' },
  { id: 'result', label: '결과' },
  { id: 'export', label: '내보내기' },
  { id: 'publish', label: '업로드' },
  { id: 'settings', label: '설정', off: true },
];

const MAKERS = { openai: 'OpenAI', google: 'Google', anthropic: 'Anthropic' };
const EXPORT_LABEL = { docs: '구글 문서로 내보내기', txt: 'txt로 저장하기', copy: '복사하기' };
const store = emptyState();

const state = {
  view: 'write',
  models: [],
  docId: null,
  version: 0,
  revising: {},
  modelOpen: false,
  maker: '전체',
  setMode: 'new',
  carried: '',
  keepSet: null,
  libQuery: '',
  libSort: 'recent',
  pickQuery: '',
  pickOpen: false,
  showAll: false,
  way: 'docs',
  picks: [],
  busy: false,
};

/**
 * @param id
 */
const el = (id) => document.getElementById(id);

/**
 * @param v
 */
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/**
 * @param name
 * @param size
 */
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/**
 * Draw a checkbox that looks the same in every browser.
 * @param {Record<string, string>} attrs - Attributes for the real input, such as `data-doc`.
 * @param {boolean} checked - Whether it starts ticked.
 * @param {string} label - Screen reader label.
 * @param {boolean} [round] - Draw it as a circle, for pick-one lists.
 * @returns {string} Markup.
 */
const checkbox = (attrs, checked, label, round = false) =>
  `<span class="pick${round ? ' round' : ''}">
    <input type="checkbox" ${Object.entries(attrs)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')} ${checked ? 'checked' : ''} aria-label="${esc(label)}" />
    <span class="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true"><path d="m5 13 4.5 4.5L19 7" /></svg></span>
  </span>`;

/**
 * @param n
 */
const comma = (n) => Math.round(n).toLocaleString('ko-KR');
/**
 * @param m
 */
const perDoc = (m) => (m.in * 1.5 + m.out * 1.5) / 1000;
/**
 * @param m
 */
const wonDoc = (m) => Math.round(perDoc(m) * WON);
/**
 * @param id
 */
const model = (id) => state.models.find((m) => m.id === id) ?? state.models[0];
/**
 *
 */
const doc = () => store.docs.find((d) => d.id === state.docId) ?? null;
/**
 *
 */
const version = () => doc()?.versions[state.version] ?? null;

/**
 * Take one version with the hand edits already merged in.
 * 화면뿐 아니라 복사·내보내기·다시 쓰기도 전부 이걸 씁니다.
 * @param {Record<string, any>} target - Document.
 * @param {number} [at] - Version index. Defaults to the last version.
 * @returns {Record<string, any> | null} Version with edits applied.
 */
function applied(target, at) {
  if (!target || !target.versions?.length) {
    return null;
  }

  const index = at ?? target.versions.length - 1;
  const v = target.versions[index];

  if (!v) {
    return null;
  }

  const edits = target.edits ?? {};
  /**
   * @param key
   * @param fallback
   */
  const pick = (key, fallback) => edits[`v${index}.${key}`] ?? fallback;

  return {
    ...v,
    title: pick('title', v.title),
    body: pick('body', v.body),
    comments: (v.comments ?? []).map((comment, i) => {
      const n = comment.index ?? i + 1;

      return {
        ...comment,
        thread: (comment.thread ?? []).map((turn, position) => ({
          ...turn,
          text: pick(`c${n}-${position}`, turn.text),
        })),
      };
    }),
  };
}

/**
 *
 */
const persist = () => save(store);

/**
 * Show a short message at the bottom of the screen.
 * @param {string} message - Message text.
 */
function toast(message) {
  const node = el('toast');

  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

/**
 * Turn a manuscript into the plain text that gets copied or saved.
 * @param {Record<string, any>} v - Manuscript version.
 * @param {'all' | 'body' | 'comments'} [part] - Which part to render.
 * @returns {string} Text.
 */
function toText(v, part = 'all') {
  if (!v) {
    return '';
  }

  const head = [`제목: ${v.title}`, '', v.body];

  const comments = (v.comments ?? []).flatMap((comment, index) => {
    const label = `댓글${comment.index ?? index + 1}`;
    const lines = [label];

    (comment.thread ?? []).forEach((turn, position) => {
      const who = turn.by === 'author' ? AUTHOR : label;

      lines.push(position === 0 ? turn.text : `ㄴ ${who}\n${turn.text}`);

      if (comment.photoAt === position) {
        lines.push('(댓글 사진 여기에 첨부해주세요)');
      }
    });

    return [...lines, ''];
  });

  if (part === 'body') {
    return head.join('\n').trim();
  }

  if (part === 'comments') {
    return comments.join('\n').trim();
  }

  return [...head, '', ...comments].join('\n').trim();
}

/**
 * Copy text to the clipboard.
 * @param {string} text - Text to copy.
 * @param {string} label - What was copied, for the toast.
 */
async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}을 복사했어요`);
  } catch {
    toast('복사가 막혀 있어요. 글을 직접 선택해서 복사해 주세요.');
  }
}

/* ---------------- 내비게이션 ---------------- */

/**
 * Draw the side and bottom navigation.
 */
function renderNav() {
  const main = VIEWS.filter((v) => !v.off);

  el('btn-settings').innerHTML = icon('settings');
  el('btn-settings').setAttribute('aria-current', String(state.view === 'settings'));
  el('rail-settings').innerHTML = `${icon('settings')}<span>설정</span>`;
  el('rail-settings').setAttribute('aria-current', String(state.view === 'settings'));
  el('nav-desktop').innerHTML = main
    .map(
      (v) =>
        `<button type="button" data-go="${v.id}" aria-current="${v.id === state.view}">${icon(v.id)}<span>${v.label}</span></button>`,
    )
    .join('');
  el('nav-mobile').innerHTML = main
    .map(
      (v) =>
        `<button type="button" data-go="${v.id}" aria-current="${v.id === state.view}">${icon(v.id, 22)}<span>${v.label}</span></button>`,
    )
    .join('');
}

/**
 * Offer back whatever was on screen when the last run was cut off.
 *
 * 쓰는 도중에 창이 닫히면 돈은 나갔는데 글은 사라졌어요.
 * 흘러온 만큼을 적어 뒀다가 다시 열 때 돌려줍니다.
 */
function renderDraft() {
  const bar = el('draft-bar');
  const { draft } = store;

  if (!bar) {
    return;
  }

  if (!draft?.raw?.trim()) {
    bar.innerHTML = '';

    return;
  }

  const size = draft.raw.replace(/\s/g, '').length;

  bar.innerHTML = `<div class="banner warn">${icon('result', 18)}
      <span class="grow">
        <b>${esc(draft.keyword || '원고')}</b> 쓰다가 끊겼어요 · ${size}자까지 받았어요
      </span>
      <button class="btn sm pri" type="button" id="btn-draft-keep">살리기</button>
      <button class="btn sm ghost" type="button" id="btn-draft-drop">버리기</button>
    </div>`;

  el('btn-draft-keep').addEventListener('click', async () => {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: draft.raw }),
    }).catch(() => null);

    const data = await response?.json().catch(() => null);
    const manuscript = data?.manuscripts?.[0] ?? data?.manuscript;

    if (!manuscript?.title) {
      toast('받은 만큼으로는 원고를 못 만들었어요. 글은 아래에 그대로 있어요.');
      el('stream-card').hidden = false;
      el('stream-out').textContent = draft.raw;

      return;
    }

    const created = {
      id: uid('doc'),
      ...(draft.options ?? {}),
      keyword: draft.keyword,
      createdAt: draft.at ?? Date.now(),
      edits: {},
      versions: [{ no: 1, ...manuscript, at: draft.at ?? Date.now() }],
    };

    store.docs.unshift(created);
    store.draft = null;
    persist();
    state.docId = created.id;
    state.version = 0;
    renderDraft();
    show('result');
    toast('끊긴 원고를 살렸어요. 빠진 곳은 다음 버전에서 채워 주세요.');
  });

  el('btn-draft-drop').addEventListener('click', () => {
    store.draft = null;
    persist();
    renderDraft();
    toast('버렸어요');
  });
}

/**
 * Say which keyword the generate screen is holding, if it carried one over.
 *
 * 결과 화면에서 조건을 들고 넘어오면 칸이 채워진 채로 열려요.
 * 그대로 두면 같은 원고를 또 만들게 되니 무엇이 들어 있는지 알려줘요.
 */
function renderCarry() {
  const bar = el('carry-bar');

  if (!bar) {
    return;
  }

  const typed = el('f-keyword')?.value.trim() ?? '';
  const set = state.keepSet ? store.library.find((l) => l.id === state.keepSet) : null;
  // 키워드를 직접 바꾸면 더 이상 이어받은 게 아니에요.
  const carried = state.carried && typed === state.carried ? typed : '';

  if (!carried && !set) {
    bar.innerHTML = '';

    return;
  }

  const what = [
    carried ? `<b>${esc(carried)}</b> 조건` : '',
    set ? `<b>${esc(set.keyword)}</b> 댓글 세트` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  bar.innerHTML = `<div class="banner">${icon('write', 18)}
      <span class="grow">${what}이 들어와 있어요</span>
      <button class="btn sm" type="button" id="btn-clear-carry">비우고 새로</button>
    </div>`;

  el('btn-clear-carry')?.addEventListener('click', startNew);
}

/**
 * Clear the generate screen and start a fresh keyword.
 *
 * 다 만든 원고에서 다음 키워드로 넘어가는 길이에요. 이게 없으면 생성 화면에
 * 이전 키워드가 남아 있어서 같은 원고를 또 만들게 돼요.
 */
function startNew() {
  ['f-keyword', 'f-brand', 'f-product', 'f-request', 'f-avoid'].forEach((id) => {
    const field = el(id);

    if (field) {
      field.value = '';
    }
  });

  state.keepSet = null;
  state.setMode = 'new';
  state.carried = '';
  show('write');
  renderSetZone();
  el('f-keyword')?.focus();
  toast('새 원고를 시작해요. 키워드를 넣어 주세요');
}

/**
 * Draw the bottom action bar for the current screen.
 */
function renderDock() {
  const inner = el('dock-inner');
  const pending = Object.values(state.revising).filter((v) => v && v.trim()).length;

  if (state.view === 'write') {
    const m = model(store.settings.model);

    renderDraft();
    renderCarry();

    inner.innerHTML =
      `<p>${m ? `${m.name} · 원고 1건 ${wonDoc(m)}원` : ''}</p>` +
      `<button class="btn pri lg" id="btn-generate" type="button"${state.busy ? ' disabled' : ''}>${state.busy ? '쓰는 중…' : '원고 만들기'}</button>`;
    el('btn-generate').addEventListener('click', generate);
  } else if (state.view === 'result' && doc()) {
    inner.innerHTML =
      `<p>${pending ? `고칠 곳 ${pending}군데를 적었어요` : '다 됐으면 맨 아래에서 내보내거나 새로 시작하세요'}</p>` +
      '<button class="btn" type="button" data-go="export">내보내기</button>' +
      `<button class="btn pri" id="btn-revise" type="button"${state.busy ? ' disabled' : ''}>${state.busy ? '고치는 중…' : '다음 버전 만들기'}</button>`;
    el('btn-revise').addEventListener('click', revise);
  } else if (state.view === 'export') {
    const n = state.picks.length;

    inner.innerHTML =
      `<p>${n}개를 골랐어요</p>` +
      `<button class="btn pri lg" type="button" id="btn-export"${n ? '' : ' disabled'}>${
        EXPORT_LABEL[state.way]
      }</button>`;

    if (n) {
      el('btn-export').addEventListener('click', runExport);
    }
  } else {
    inner.innerHTML = '';
  }

  el('dock').hidden = !inner.innerHTML;
}

/**
 * Switch to a screen.
 * @param {string} view - View id.
 */
function show(view) {
  state.view = view;
  VIEWS.forEach((v) => {
    el(`view-${v.id}`).hidden = v.id !== view;
  });
  el('view-name').textContent = VIEWS.find((v) => v.id === view).label;

  // 지난번에 쓴 글이 생성 화면에 그대로 남아 있으면 새로 쓰려는 건지
  // 아까 것이 아직 도는 건지 알 수 없어요. 쓰는 중이 아니면 치웁니다.
  if (view === 'write' && !state.busy) {
    el('stream-card').hidden = true;
    el('stream-out').textContent = '';
  }

  // 한 번 연 세트 목록이 계속 열려 있으면 또 골라야 하는 것처럼 보여요.
  if (view !== 'result') {
    state.pickOpen = false;
    el('picker-zone').innerHTML = '';
  }

  if (view === 'settings') renderSettings();
  if (view === 'refs') renderLibrary();
  if (view === 'export') renderExport();
  if (view === 'result') renderResult();
  if (view === 'publish') renderPublish();
  renderNav();
  renderDock();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * Set the pressed state of a segmented control.
 * @param {string} group - Control group name.
 * @param {string} value - Selected value.
 */
function setSeg(group, value) {
  document.querySelectorAll(`[data-seg="${group}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.value === value));
  });
}

/* ---------------- 생성 화면 ---------------- */

/**
 * Draw the model picker.
 */
function renderModel() {
  const s = store.settings;
  const base = model(s.model);
  const upper = model(s.upgradeModel);

  if (!base) {
    return;
  }

  const total = Math.round(perDoc(base) * 1000 * WON);
  const retry = upper ? Math.round(perDoc(upper) * 100 * WON) : 0;

  const list = state.models.filter(
    (m) => state.maker === '전체' || MAKERS[m.maker] === state.maker,
  );

  el('model-now').textContent = `${base.name} · 원고 1건 ${wonDoc(base)}원`;
  el('btn-model').textContent = state.modelOpen ? '닫기' : '바꾸기';
  el('model-zone').innerHTML = state.modelOpen
    ? `<div class="seg" role="group" aria-label="회사" style="margin:10px 0">
        ${['전체', 'OpenAI', 'Google', 'Anthropic']
          .map(
            (m) =>
              `<button type="button" data-maker="${m}" aria-pressed="${m === state.maker}">${m}</button>`,
          )
          .join('')}
      </div>
      <div class="rows">
        ${list
          .map(
            (m) => `<label class="row" style="cursor:pointer">
              <input type="radio" name="model" value="${m.id}" ${s.model === m.id ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--blue)" />
              <span class="txt"><b>${m.name}</b><span>${MAKERS[m.maker]}${store.settings.keys[m.maker] ? '' : ' · 키 없음'}</span></span>
              <span class="side"><b class="cost">${wonDoc(m)}원</b><span class="costsub">1,000건 ${comma(perDoc(m) * 1000 * WON)}원</span></span>
            </label>`,
          )
          .join('')}
      </div>
      <div class="switch-row" style="margin-top:16px;border-top:1px solid var(--line-soft);padding-top:16px">
        <span class="txt">
          <b>이상하면 좋은 모델로 다시 쓰기</b>
          <span class="desc">${upper ? upper.name : ''}로 다시 써요</span>
        </span>
        <label class="switch">
          <input type="checkbox" id="f-upgrade" ${s.upgrade ? 'checked' : ''} aria-label="상위 모델로 다시 쓰기" />
          <i></i>
        </label>
      </div>
      <div class="banner" style="margin-top:14px;background:var(--surface-2);color:var(--t700)">
        <span class="grow">원고 <b>1,000건</b>에 약 <b>${comma(total + (s.upgrade ? retry : 0))}원</b></span>
      </div>`
    : '';

  document.querySelectorAll('[name="model"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      store.settings.model = radio.value;
      persist();
      renderModel();
      renderDock();
    });
  });
  document.querySelectorAll('[data-maker]').forEach((button) => {
    button.addEventListener('click', () => {
      state.maker = button.dataset.maker;
      renderModel();
    });
  });

  const up = el('f-upgrade');

  if (up) {
    up.addEventListener('change', () => {
      store.settings.upgrade = up.checked;
      persist();
      renderModel();
    });
  }
}

/**
 * Draw the reuse-a-comment-set picker on the generate screen.
 */
function renderSetZone() {
  const zone = el('set-zone');

  if (state.setMode === 'new') {
    zone.innerHTML = '';
    state.keepSet = null;

    return;
  }

  if (state.keepSet) {
    const item = store.library.find((l) => l.id === state.keepSet);

    zone.innerHTML = `<div class="banner" style="margin-top:10px">${icon('check', 18)}
      <span class="grow">${esc(item?.keyword ?? '')} · 댓글 ${item?.comments?.length ?? 0}개</span>
      <button class="btn sm" type="button" id="btn-change">바꾸기</button></div>`;
    el('btn-change').addEventListener('click', () => {
      state.keepSet = null;
      renderSetZone();
    });

    return;
  }

  zone.innerHTML = pickerHtml('set-search');
  bindPicker('set-search');
}

/**
 * Collect what the generate screen is asking for.
 * @returns {Record<string, any>} Options.
 */
function readForm() {
  return {
    keyword: el('f-keyword').value.trim(),
    brand: el('f-brand').value.trim(),
    product: el('f-product').value.trim(),
    request: el('f-request').value.trim(),
    avoid: el('f-avoid').value.trim(),
    tone: store.settings.tone,
    length: store.settings.length,
    commentCount: store.settings.commentCount,
    mobileShape: store.settings.mobileShape,
  };
}

/**
 * Generate a first draft.
 */
async function generate() {
  const options = readForm();

  if (!options.keyword) {
    toast('키워드를 먼저 넣어 주세요');
    el('f-keyword').focus();

    return;
  }

  const m = model(store.settings.model);

  if (!store.settings.keys[m.maker]) {
    toast(`${MAKERS[m.maker]} API 키가 없어요. 설정에서 넣어 주세요.`);
    show('settings');

    return;
  }

  const keep = state.keepSet ? store.library.find((l) => l.id === state.keepSet) : null;
  const learning = store.library.filter((l) => l.learn);
  const card = el('stream-card');
  const out = el('stream-out');

  card.hidden = false;
  out.textContent = '';
  out.classList.add('caret');
  state.busy = true;
  renderDock();
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // 흘러오는 글을 이따금 적어 둡니다. 여기서 창이 닫혀도 쓴 만큼은 남아요.
  let lastKept = 0;

  /**
   * @param raw
   * @param force
   */
  const keepDraft = (raw, force = false) => {
    if (!force && Date.now() - lastKept < 1200) {
      return;
    }

    lastKept = Date.now();
    store.draft = { keyword: options.keyword, options, raw, at: Date.now() };
    persist();
  };

  try {
    await streamPost(
      '/api/generate',
      {
        modelId: store.settings.model,
        keys: store.settings.keys,
        options: {
          ...options,
          keepComments: keep
            ? keep.comments
                .map((c, i) => [`댓글${i + 1}`, ...(c.thread ?? []).map((t) => t.text)].join('\n'))
                .join('\n\n')
            : null,
        },
        references: pickReferences(learning, options.keyword),
        styleCard: styleCard(learning),
      },
      (event) => {
        if (event.type === 'delta') {
          out.textContent += event.text;
          out.scrollTop = out.scrollHeight;
          keepDraft(out.textContent);
        }

        if (event.type === 'error') {
          throw new Error(event.message);
        }

        if (event.type === 'done') {
          const created = {
            id: uid('doc'),
            ...options,
            createdAt: Date.now(),
            edits: {},
            versions: [{ no: 1, ...event.manuscript, at: Date.now() }],
          };

          if (keep) {
            created.versions[0].comments = keep.comments.map((c) => ({ ...c, locked: true }));
            keep.uses = (keep.uses ?? 0) + 1;
          }

          store.docs.unshift(created);
          store.draft = null;
          persist();
          state.docId = created.id;
          state.version = 0;
          state.revising = {};
          show('result');
          toast('원고가 나왔어요');
        }
      },
    );
  } catch (error) {
    toast(error.message);
  } finally {
    // 끊겼든 끝났든, 받은 마지막 조각까지 한 번 더 적어 둡니다.
    // 시간 간격 때문에 마지막 몇 줄이 빠지면 살릴 때 그만큼 사라져요.
    if (store.draft) {
      keepDraft(out.textContent, true);
    }

    state.busy = false;
    out.classList.remove('caret');
    renderDock();
    renderDraft();
  }
}

/**
 * Make the next version, rewriting only the parts with notes.
 */
async function revise() {
  const current = version();
  const asked = Object.entries(state.revising).filter(([, v]) => v && v.trim());

  if (!current) {
    return;
  }

  if (!asked.length) {
    toast('고칠 곳을 한 군데 이상 적어 주세요');

    return;
  }

  const target = doc();

  state.busy = true;
  renderDock();

  try {
    await streamPost(
      '/api/revise',
      {
        modelId: store.settings.model,
        keys: store.settings.keys,
        options: target,
        manuscript: applied(target, state.version),
        instructions: Object.fromEntries(asked),
      },
      (event) => {
        if (event.type === 'error') {
          throw new Error(event.message);
        }

        if (event.type === 'done') {
          const kept = current.comments.filter((c) => c.locked);

          const next = {
            no: target.versions.length + 1,
            ...event.manuscript,
            at: Date.now(),
          };

          if (kept.length) {
            next.comments = current.comments;
          }

          target.versions.push(next);
          persist();
          state.version = target.versions.length - 1;
          state.revising = {};
          renderResult();
          toast(`${next.no}차 원고가 나왔어요`);
        }
      },
    );
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
    renderDock();
  }
}

/* ---------------- 결과 화면 ---------------- */

/**
 * Draw the version chips, title, body and comment cards.
 */
function renderResult() {
  const target = doc();
  const v = version();

  if (!target || !v) {
    el('version-tabs').innerHTML = '';
    el('head-pieces').innerHTML =
      '<div class="card"><p class="desc" style="margin:0">아직 만든 원고가 없어요. 생성 화면에서 키워드를 넣고 원고를 만들어 주세요.</p></div>';
    el('comment-pieces').innerHTML = '';
    el('import-banner').innerHTML = '';
    el('result-done').innerHTML = '';
    el('doc-switch').hidden = true;

    return;
  }

  el('w-keyword').value = target.keyword ?? '';
  el('w-request').value = target.request ?? '';

  // 만든 원고가 여러 개면 여기서 골라 열 수 있어야 해요.
  // 이게 없으면 새로 만드는 순간 앞의 원고는 결과 화면에서 다시 못 엽니다.
  const many = store.docs.length > 1;

  el('doc-switch').hidden = !many;
  el('doc-now').textContent = target.keyword ?? '원고';

  if (many) {
    el('doc-pick').innerHTML = store.docs
      .slice(0, 50)
      .map(
        (d) =>
          `<option value="${d.id}" ${d.id === target.id ? 'selected' : ''}>${esc(d.keyword || '이름 없음')} · ${d.versions.length}차</option>`,
      )
      .join('');
  }

  el('version-tabs').innerHTML = target.versions
    .map(
      (entry, index) =>
        `<button class="vtab" type="button" data-version="${index}" aria-current="${index === state.version}">${entry.no}차</button>`,
    )
    .join('');

  const edits = target.edits ?? {};
  const title = edits[`v${state.version}.title`] ?? v.title;
  const body = edits[`v${state.version}.body`] ?? v.body;

  el('head-pieces').innerHTML = `
    <article class="piece">
      <div class="phead">
        <span class="chip blue">제목</span>
        ${edits[`v${state.version}.title`] ? '<span class="chip warn">직접 고침</span>' : ''}
      </div>
      <h3 class="ptitle" data-edit="title" title="두 번 누르면 고칠 수 있어요">${esc(title)}</h3>
      <div class="pfoot">
        <input class="input" type="text" data-part="title" placeholder="제목에서 고칠 곳" />
      </div>
    </article>

    <article class="piece">
      <div class="phead">
        <span class="chip blue">본문</span>
        <span class="chip">${body.replace(/\s/g, '').length}자</span>
        ${edits[`v${state.version}.body`] ? '<span class="chip warn">직접 고침</span>' : ''}
      </div>
      <p class="ptext" data-edit="body" title="두 번 누르면 고칠 수 있어요">${esc(body)}</p>
      <div class="pfoot">
        <input class="input" type="text" data-part="body" placeholder="본문에서 고칠 곳" />
      </div>
    </article>`;

  const locked = (v.comments ?? []).some((c) => c.locked);

  // 이미 가져와 둔 상태에서 「가져오기」라고 쓰여 있으면 또 골라야 하는 줄 알아요.
  el('btn-import').textContent = locked ? '다른 세트로 바꾸기' : '기존 세트 가져오기';

  el('import-banner').innerHTML = locked
    ? `<div class="banner">${icon('lock', 18)}<span class="grow">보관함에서 가져온 댓글이에요. 다시 만들어도 그대로 있어요.</span></div>`
    : '';

  el('comment-pieces').innerHTML = (v.comments ?? [])
    .map((comment, index) => {
      const n = comment.index ?? index + 1;
      const label = `댓글${n}`;

      const thread = (comment.thread ?? [])
        .map((turn, position) => {
          const key = `c${n}-${position}`;
          const text = edits[`v${state.version}.${key}`] ?? turn.text;
          const shot = comment.photoAt === position;

          return `<div class="turn ${turn.by === 'author' ? 'author' : ''}">
            <span class="tag">${turn.by === 'author' ? AUTHOR : label}</span>
            <span data-edit="${key}" title="두 번 누르면 고칠 수 있어요">${esc(text)}</span>
            <button type="button" class="shotbtn" data-shot="${n}:${position}"
              aria-pressed="${shot}" title="${shot ? '사진 자리 빼기' : '이 줄에 사진 자리 넣기'}"
              aria-label="${label} ${position + 1}번째 줄에 사진 자리 ${shot ? '빼기' : '넣기'}">${icon('image', 17)}</button>
          </div>
          ${shot ? `<div class="photo-slot">${icon('image', 16)}댓글 사진 여기에 첨부해주세요</div>` : ''}`;
        })
        .join('');

      const hand = Object.keys(edits).some((k) => k.startsWith(`v${state.version}.c${n}-`));

      return `<article class="piece">
        <div class="phead">
          <span class="chip blue">${label}</span>
          ${(comment.thread ?? []).length > 1 ? `<span class="chip">티키타카 ${comment.thread.length}턴</span>` : ''}
          ${comment.locked ? `<span class="chip">가져온 댓글</span>` : ''}
          ${hand ? '<span class="chip warn">직접 고침</span>' : ''}
        </div>
        ${index === 0 ? '<span class="shot-hint">사진을 넣을 줄에서 오른쪽 사진 단추를 눌러 주세요</span>' : ''}
        <div class="thread">${thread}</div>
        <div class="pfoot">
          <input class="input" type="text" data-part="c${n}" placeholder="${label}에서 고칠 곳" />
        </div>
      </article>`;
    })
    .join('');

  document.querySelectorAll('[data-part]').forEach((input) => {
    input.value = state.revising[input.dataset.part] ?? '';
    input.addEventListener('input', () => {
      state.revising[input.dataset.part] = input.value;
      renderDock();
    });
  });
  document.querySelectorAll('[data-shot]').forEach((button) => {
    button.addEventListener('click', () => {
      const [n, position] = button.dataset.shot.split(':').map(Number);
      const comment = v.comments.find((c, i) => (c.index ?? i + 1) === n);
      const on = comment.photoAt !== position;

      comment.photoAt = on ? position : null;
      persist();
      renderResult();
      toast(on ? '이 줄에 사진 자리를 넣었어요' : '사진 자리를 뺐어요');
    });
  });

  /**
   *
   */
  el('doc-pick').onchange = () => {
    const next = store.docs.find((d) => d.id === el('doc-pick').value);

    if (!next) {
      return;
    }

    state.docId = next.id;
    state.version = next.versions.length - 1;
    state.revising = {};
    renderResult();
    renderDock();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  el('result-done').innerHTML = `<div class="done">
    <b>이 원고는 여기까지예요</b>
    <p>고칠 게 없으면 내보내거나, 다음 키워드로 새 원고를 시작하세요.</p>
    <div class="act">
      <button class="btn" type="button" data-go="export">내보내기</button>
      <button class="btn" type="button" data-go="publish">카페에 올리기</button>
      <button class="btn pri" type="button" id="btn-new">새 키워드로 시작</button>
    </div>
  </div>`;
  el('btn-new').addEventListener('click', startNew);

  el('save-state').textContent = '저장됨';
}

/**
 * Save an inline edit.
 * @param {string} key - Edit key such as `title` or `c2-1`.
 * @param {string} value - New text.
 */
function saveEdit(key, value) {
  const target = doc();

  if (!target) {
    return;
  }

  target.edits = target.edits ?? {};

  if (value.trim()) {
    target.edits[`v${state.version}.${key}`] = value;
  } else {
    delete target.edits[`v${state.version}.${key}`];
  }

  persist();
  el('save-state').textContent = `저장됨 ${new Date().toTimeString().slice(0, 5)}`;
}

document.addEventListener('dblclick', (event) => {
  const target = event.target.closest('[data-edit]');

  if (!target || !doc()) {
    return;
  }

  const key = target.dataset.edit;
  const original = target.textContent;
  const area = document.createElement('textarea');

  area.className = 'editing';
  area.value = original;
  area.rows = Math.min(22, Math.max(2, original.split('\n').length + 1));
  target.replaceWith(area);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);

  let timer = null;

  /**
   * @param keep
   */
  const commit = (keep) => {
    clearTimeout(timer);

    if (keep) {
      saveEdit(key, area.value);
    }

    renderResult();

    if (keep) {
      toast('고친 내용을 저장했어요');
    }
  };

  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveEdit(key, area.value), 800);
  });
  area.addEventListener('blur', () => commit(true));
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      area.value = original;
      commit(false);
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      area.blur();
    }
  });
});

/* ---------------- 보관함 ---------------- */

/**
 * Filter and sort the library.
 * @param {string} query - Search text.
 * @param {string} sort - Sort key.
 * @returns {any[]} Matching entries.
 */
function libList(query, sort) {
  const q = query.trim().toLowerCase();

  const list = store.library.filter(
    (i) => !q || `${i.keyword} ${i.title}`.toLowerCase().includes(q),
  );

  if (sort === 'name') list.sort((a, b) => a.keyword.localeCompare(b.keyword, 'ko'));
  else if (sort === 'comments') list.sort((a, b) => b.comments.length - a.comments.length);
  else if (sort === 'used') list.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));
  else list.sort((a, b) => b.addedAt - a.addedAt);

  return list;
}

/**
 * Draw the library grid.
 */
function renderLibrary() {
  const list = libList(state.libQuery, state.libSort);
  const learning = store.library.filter((i) => i.learn).length;
  let summary = '아직 올린 원고가 없어요. 아래에서 파일을 올려 주세요.';

  if (store.library.length && state.libQuery) {
    summary = `${list.length}개 찾았어요`;
  } else if (store.library.length) {
    summary = `원고 ${store.library.length}개 · 학습 ${learning}개 · ${learnedFrom(
      store.library.filter((i) => i.learn),
    )}`;
  }

  el('lib-summary').textContent = summary;
  el('lib-empty').hidden = list.length > 0 || !store.library.length;
  el('lib-grid').innerHTML = list
    .map(
      (i) => `<article class="lib">
      <h4>${esc(i.keyword)}</h4>
      <p>${esc(i.title)}</p>
      <span class="meta">댓글 ${i.comments.length}개${i.uses ? ` · ${i.uses}번 씀` : ''}</span>
      <div class="act">
        <button class="btn sm" type="button" data-use="${i.id}">댓글 가져오기</button>
        <span class="grow"></span>
        <label class="check"><input type="checkbox" data-learn="${i.id}" ${i.learn ? 'checked' : ''} aria-label="어투 학습" />어투 학습</label>
      </div>
    </article>`,
    )
    .join('');

  document.querySelectorAll('[data-learn]').forEach((box) => {
    box.addEventListener('change', () => {
      const item = store.library.find((l) => l.id === box.dataset.learn);

      item.learn = box.checked;
      persist();
      renderLibrary();
    });
  });
}

/**
 * Build the comment-set picker markup, recommendations first.
 * @param {string} searchId - Id for the search input.
 * @returns {string} Markup.
 */
function pickerRecs() {
  const keyword = (el('f-keyword')?.value ?? '').trim();
  const words = keyword.split(/\s+/).filter(Boolean);

  const recs = store.library
    .map((item) => {
      const hits = words.filter((w) => item.keyword.includes(w)).length;
      const same = keyword && item.keyword === keyword;
      let reason = '';

      if (same) {
        reason = '같은 키워드';
      } else if (hits) {
        reason = '비슷한 키워드';
      } else if ((item.uses ?? 0) >= 3) {
        reason = '많이 쓴 세트';
      }

      return { item, reason, score: (same ? 100 : 0) + hits * 10 + (item.uses ?? 0) };
    })
    .filter((r) => r.reason)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!recs.length || state.pickQuery) {
    return '';
  }

  return `<p class="desc" style="margin:0 0 8px">추천</p><div class="rows" style="margin-bottom:6px">
    ${recs
      .map(
        (r) => `<div class="row">
          <span class="txt"><b>${esc(r.item.keyword)} <span class="chip blue">${r.reason}</span></b>
          <span>댓글 ${r.item.comments.length}개</span></span>
          <button class="btn sm pri" type="button" data-use="${r.item.id}">가져오기</button>
        </div>`,
      )
      .join('')}
  </div>`;
}

/**
 * Build the matching rows for the comment-set picker.
 * @returns {string} Markup.
 */
function pickerList() {
  const list = libList(state.pickQuery, 'recent');
  const shown = state.pickQuery || state.showAll ? list : [];

  if (!shown.length) {
    return emptyPick();
  }

  return `<div class="rows" style="max-height:290px;overflow-y:auto">
    ${shown
      .map(
        (i) => `<div class="row">
          <span class="txt"><b>${esc(i.keyword)}</b><span>댓글 ${i.comments.length}개</span></span>
          <button class="btn sm" type="button" data-use="${i.id}">가져오기</button>
        </div>`,
      )
      .join('')}
  </div>`;
}

/**
 * Build the comment-set picker, recommendations first.
 *
 * 검색창은 여기서 한 번만 그리고 다시 만들지 않아요. 글자를 칠 때마다 입력칸을
 * 새로 그리면 한글이 조합되는 중에 끊겨서 자모가 따로 입력돼요.
 * @param {string} searchId - Id for the search input.
 * @returns {string} Markup.
 */
function pickerHtml(searchId) {
  if (!store.library.length) {
    return '<div class="card" style="margin-top:10px"><div class="empty">보관함이 비어 있어요. 먼저 원고를 올려 주세요.</div></div>';
  }

  return `<div class="card" style="margin-top:10px">
    <div id="${searchId}-recs">${pickerRecs()}</div>
    <label class="searchbar" style="margin:10px 0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="${searchId}" value="${esc(state.pickQuery)}" placeholder="다른 키워드로 찾기" aria-label="원고 찾기" />
    </label>
    <div id="${searchId}-list">${pickerList()}</div>
  </div>`;
}

/**
 * Markup shown when the picker has nothing to list.
 * @returns {string} Markup.
 */
function emptyPick() {
  return state.pickQuery
    ? '<div class="empty">찾는 키워드가 없어요</div>'
    : `<button class="btn sm ghost block" type="button" data-showall="1">전체 ${store.library.length}개 보기</button>`;
}

/**
 * Wire up the picker search box.
 * @param {string} searchId - Search input id.
 */
function bindPicker(searchId) {
  const search = el(searchId);

  if (!search) {
    return;
  }

  // 결과만 다시 그려요. 입력칸은 그대로 두어야 한글 조합이 안 끊깁니다.
  /**
   *
   */
  const refresh = () => {
    state.pickQuery = search.value;
    el(`${searchId}-recs`).innerHTML = pickerRecs();
    el(`${searchId}-list`).innerHTML = pickerList();
  };

  search.addEventListener('input', refresh);
  search.addEventListener('compositionend', refresh);
}

/**
 * Read uploaded manuscript files into the library.
 * @param {FileList} files - Chosen files.
 */
async function addFiles(files) {
  const texts = await Promise.all(
    [...files]
      .filter((file) => /\.(txt|md|text)$/i.test(file.name))
      .map(async (file) => ({ name: file.name, text: await file.text() })),
  );

  if (!texts.length) {
    toast('읽을 수 있는 txt 파일이 없어요');

    return;
  }

  const results = await Promise.all(
    texts.map(async ({ name, text }) => {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fileName: name }),
      });

      const data = await response.json();

      return { name, manuscripts: data.manuscripts ?? [data.manuscript] };
    }),
  );

  let added = 0;
  let skipped = 0;
  let split = 0;

  results.forEach(({ name, manuscripts }) => {
    const base = name.replace(/\.[^.]+$/, '').trim();

    if (manuscripts.length > 1) {
      split += 1;
    }

    manuscripts.forEach((manuscript, order) => {
      if (!manuscript?.title || !manuscript.comments.length) {
        skipped += 1;

        return;
      }

      // 한 파일에 여러 편이면 파일 이름만으로는 구분이 안 되니 제목을 씁니다.
      const keyword = manuscripts.length > 1 ? manuscript.title.slice(0, 40) : base;

      store.library.unshift({
        id: uid('lib'),
        keyword,
        fileName: manuscripts.length > 1 ? `${base} (${order + 1})` : name,
        title: manuscript.title,
        body: manuscript.body,
        comments: manuscript.comments,
        learn: store.library.length < 3,
        uses: 0,
        addedAt: Date.now(),
      });
      added += 1;
    });
  });

  persist();
  renderLibrary();

  const notes = [
    split ? `파일 ${split}개에 원고가 여러 편이라 나눠 넣었어요` : '',
    skipped ? `${skipped}개는 댓글을 못 찾았어요` : '',
  ].filter(Boolean);

  toast(`${added}개를 보관함에 넣었어요${notes.length ? ` · ${notes.join(' · ')}` : ''}`);
}

/* ---------------- 카페 글 가져오기 ---------------- */

/**
 * Put a collected article into the library.
 * @param {Record<string, any>} article - Collected article.
 * @param {string} [keyword] - Keyword override.
 * @returns {boolean} Whether it was added.
 */
function addToLibrary(article, keyword) {
  if (!article?.title || !article.comments?.length) {
    toast('제목이나 댓글을 못 찾았어요. 붙여넣은 내용을 확인해 주세요.');

    return false;
  }

  store.library.unshift({
    id: uid('lib'),
    keyword: (keyword || article.keyword || article.title).trim().slice(0, 60),
    fileName: article.source ?? '',
    title: article.title,
    body: article.body,
    comments: article.comments,
    learn: store.library.length < 3,
    uses: 0,
    addedAt: Date.now(),
  });
  persist();
  renderLibrary();

  return true;
}

/**
 * Fetch a cafe article by its address.
 */
async function fetchCafe() {
  const url = el('f-url').value.trim();
  const box = el('cafe-result');

  if (!url) {
    toast('카페 글 주소를 넣어 주세요');

    return;
  }

  box.innerHTML = '<p class="desc" style="margin:0">가져오는 중이에요…</p>';

  try {
    const response = await fetch('/api/cafe/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? '가져오지 못했어요.');
    }

    const { article } = data;

    box.innerHTML = `<div class="banner" style="background:var(--surface-2);color:var(--t700)">
      ${icon('check', 18)}
      <span class="grow"><b>${esc(article.title)}</b><br />${esc(article.cafeName)} · 댓글 ${article.comments.length}개</span>
      <button class="btn sm pri" type="button" id="btn-keep-cafe">보관함에 넣기</button>
    </div>`;
    el('btn-keep-cafe').addEventListener('click', () => {
      if (addToLibrary(article)) {
        box.innerHTML = '';
        el('f-url').value = '';
        toast('보관함에 넣었어요');
      }
    });
  } catch (error) {
    box.innerHTML = `<div class="banner" style="background:var(--yellow-bg);color:var(--yellow)">
      <span class="grow">${esc(error.message)}</span></div>`;
    el('cafe-fallback').hidden = false;
    el('btn-fallback').textContent = '접기';
  }
}

/**
 * Build the bookmarklet address from the collector source.
 */
async function buildBookmarklet() {
  const link = el('bookmarklet');

  try {
    const source = await (await fetch('/collect.js')).text();

    const compact = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.trim())
      .join(' ');

    link.href = `javascript:${encodeURIComponent(compact)}`;
  } catch {
    link.removeAttribute('href');
  }

  link.addEventListener('click', (event) => {
    event.preventDefault();
    toast('이 버튼을 즐겨찾기 바로 끌어다 놓으세요');
  });
}

/* ---------------- 내보내기 ---------------- */

/**
 * Draw the export screen.
 */
function renderExport() {
  if (!state.picks.length && store.docs.length) {
    state.picks = [store.docs[0].id];
  }

  el('doc-list').innerHTML = store.docs.length
    ? store.docs
        .slice(0, 30)
        .map((d) => {
          const last = d.versions[d.versions.length - 1];
          const on = state.picks.includes(d.id);
          const when = new Date(d.createdAt).toLocaleDateString('ko-KR');

          // 날짜를 오른쪽 끝에 두면 제목과 사이가 너무 벌어져서 설명 줄에 붙였어요.
          return `<label class="row pickable${on ? ' on' : ''}">
            ${checkbox({ 'data-doc': d.id }, on, `${d.keyword} 고르기`)}
            <span class="txt"><b>${esc(d.keyword)}</b><span>댓글 ${last.comments?.length ?? 0}개 · ${d.versions.length}차 · ${when}</span></span>
          </label>`;
        })
        .join('')
    : '<div class="empty">아직 만든 원고가 없어요</div>';

  const names = state.picks
    .map((id) => store.docs.find((d) => d.id === id)?.keyword)
    .filter(Boolean);

  const zone = el('way-zone');
  const today = new Date().toISOString().slice(0, 10);

  if (state.way === 'docs') {
    zone.innerHTML = `
      <div class="field" style="margin-bottom:14px">
        <label class="label" for="f-doctitle">문서 제목</label>
        <input id="f-doctitle" class="input" type="text" placeholder="비우면 ${today} ${esc(names[0] ?? '원고')}${names.length > 1 ? ` 외 ${names.length - 1}건` : ''}" />
      </div>
      <div class="doctabs">
        ${names.length ? names.map((k) => `<span class="doctab">${esc(k)}</span>`).join('') : '<span class="doctab dim">원고를 고르면 탭이 만들어져요</span>'}
      </div>
      <p class="desc" style="margin:10px 0 0">문서 하나에 키워드 ${names.length}개가 제목으로 구분되어 들어가요. 구글 문서 왼쪽 개요에서 키워드를 눌러 바로 이동할 수 있어요.</p>
      ${
        store.settings.lastDoc?.url
          ? `<p class="desc" style="margin:8px 0 0">최근 만든 문서 · <a href="${esc(store.settings.lastDoc.url)}" target="_blank" rel="noopener">${esc(store.settings.lastDoc.title ?? '문서 열기')}</a></p>`
          : ''
      }
      <div class="way fallback" style="margin-top:14px">
        <span class="mark">＋</span>
        <div>
          <b>설정 없이 하려면</b>
          <p>
            서식 그대로 복사한 뒤 빈 구글 문서에 붙여넣어도 됩니다. 키워드가 제목으로 들어가요.
            ${store.settings.googleClientId ? '' : '<b>지금은 이 방법만 됩니다.</b> 바로 만들기는 설정에서 클라이언트 ID를 넣어야 해요.'}
          </p>
          <p style="margin-top:8px">
            <button class="btn sm" type="button" id="btn-rich">서식 그대로 복사</button>
          </p>
        </div>
      </div>`;
  } else if (state.way === 'txt') {
    zone.innerHTML = `
      <div class="rows">
        ${names.length ? names.map((k) => `<div class="row"><span class="txt"><b>${esc(k)}.txt</b></span></div>`).join('') : '<div class="empty">원고를 골라 주세요</div>'}
      </div>
      <p class="desc" style="margin:10px 0 0">파일 이름은 키워드로, 항상 txt로 저장돼요.</p>`;
  } else {
    zone.innerHTML = `
      <div class="pfoot" style="margin-top:0">
        <button class="btn" type="button" data-copy="all">전체</button>
        <button class="btn" type="button" data-copy="body">본문만</button>
        <button class="btn" type="button" data-copy="comments">댓글만</button>
      </div>
      <p class="desc" style="margin:10px 0 0">고른 원고 중 첫 번째를 복사해요. 사진 자리 표시도 같이 들어가요.</p>`;
  }

  const rich = el('btn-rich');

  if (rich) {
    rich.addEventListener('click', () => {
      const picked = state.picks.map((id) => store.docs.find((d) => d.id === id)).filter(Boolean);

      if (picked.length) {
        copyRich(picked);
      }
    });
  }

  document.querySelectorAll('[data-doc]').forEach((box) => {
    box.addEventListener('change', () => {
      state.picks = box.checked
        ? [...state.picks, box.dataset.doc]
        : state.picks.filter((id) => id !== box.dataset.doc);
      renderExport();
      renderDock();
    });
  });
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const first = store.docs.find((d) => d.id === state.picks[0]);
      const labels = { all: '전체', body: '본문', comments: '댓글' };

      if (first) {
        copy(toText(applied(first), button.dataset.copy), labels[button.dataset.copy]);
      }
    });
  });
}

/**
 * Run the chosen export.
 */
function runExport() {
  const picked = state.picks.map((id) => store.docs.find((d) => d.id === id)).filter(Boolean);

  if (!picked.length) {
    return;
  }

  if (state.way === 'txt') {
    picked.forEach((d) => download(`${d.keyword}.txt`, toText(applied(d))));
    toast(`txt ${picked.length}개를 저장했어요`);

    return;
  }

  if (state.way === 'copy') {
    copy(toText(applied(picked[0])), '전체');

    return;
  }

  if (!store.settings.googleClientId) {
    copyRich(picked);
    toast('클라이언트 ID가 없어 서식 복사로 했어요. 구글 문서에 붙여넣어 주세요.');

    return;
  }

  exportToDocs(picked);
}

/**
 * Send the chosen manuscripts to a new Google Doc.
 * @param {any[]} picked - Chosen documents.
 */
async function exportToDocs(picked) {
  const button = el('btn-export');

  const title =
    el('f-doctitle')?.value.trim() ||
    `${new Date().toISOString().slice(0, 10)} ${picked[0].keyword}${picked.length > 1 ? ` 외 ${picked.length - 1}건` : ''}`;

  button.disabled = true;
  button.textContent = '내보내는 중…';

  try {
    await connect(store.settings.googleClientId);

    const { url } = await createDoc(
      title,
      picked.map((d) => ({
        keyword: d.keyword,
        text: toText(applied(d)),
      })),
    );

    store.settings.lastDoc = { title, url, at: Date.now() };
    persist();
    window.open(url, '_blank', 'noopener');
    renderExport();
    toast('구글 문서를 만들었어요');
  } catch (error) {
    toast(error.message);

    if (/클라이언트 ID/.test(error.message)) {
      show('settings');
    }
  } finally {
    button.disabled = false;
    renderDock();
  }
}

/**
 * Build a rich-text version of the chosen manuscripts.
 * Pasting this into Google Docs keeps the keyword headings.
 * @param {any[]} picked - Chosen documents.
 * @returns {{ html: string, text: string }} Both clipboard flavours.
 */
function toRich(picked) {
  const parts = picked.map((d) => {
    const body = toText(applied(d));

    const paragraphs = body
      .split('\n')
      .map((line) => (line.trim() ? `<p>${esc(line)}</p>` : '<p><br></p>'))
      .join('');

    return `<h1>${esc(d.keyword)}</h1>${paragraphs}`;
  });

  return {
    html: `<meta charset="utf-8">${parts.join('<p><br></p>')}`,
    text: picked.map((d) => `${d.keyword}\n\n${toText(applied(d))}`).join('\n\n\n'),
  };
}

/**
 * Copy the chosen manuscripts with formatting, so a paste into Google Docs
 * arrives with the keyword headings already applied.
 * @param {any[]} picked - Chosen documents.
 */
async function copyRich(picked) {
  const { html, text } = toRich(picked);

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
    toast(`${picked.length}개를 서식 그대로 복사했어요. 구글 문서에 붙여넣어 주세요.`);
  } catch {
    await copy(text, '원고');
  }
}

/* ---------------- 카페에 올리기 ---------------- */

const GAPS = [
  { id: 'first', label: '본문 올린 뒤 첫 댓글까지' },
  { id: 'between', label: '댓글과 댓글 사이' },
  { id: 'reply', label: '댓글 달린 뒤 작성자 답글까지' },
];

/**
 * Add up minutes and format the running clock offset.
 * @param {number} minutes - Minutes from the start.
 * @returns {string} Label such as `+12분`.
 */
const atLabel = (minutes) => (minutes ? `+${minutes}분` : '바로');

/**
 * List every seat a manuscript needs filled, body first.
 * @param {Record<string, any>} v - Manuscript version.
 * @returns {{ role: string, label: string }[]} Seats.
 */
function roles(v) {
  return [
    { role: 'body', label: '본문 · 작성자 답글' },
    ...(v?.comments ?? []).map((comment, index) => {
      const n = comment.index ?? index + 1;

      return { role: `c${n}`, label: `댓글${n}` };
    }),
  ];
}

/**
 * Find which account alias sits on a seat.
 * @param {string} role - Seat id such as `body` or `c2`.
 * @returns {string} Alias, or a placeholder when nothing is assigned yet.
 */
function account(role) {
  const picked = (store.settings.assign ?? {})[role];

  return (store.settings.accounts ?? []).includes(picked)
    ? picked
    : `${role === 'body' ? '본문' : `댓글${role.slice(1)}`} 계정`;
}

/**
 * Build the ordered list of things to post, with the waiting time before each.
 * @param {Record<string, any>} v - Manuscript version.
 * @returns {Record<string, any>[]} Steps.
 */
function buildSteps(v) {
  const { gaps } = store.settings;

  const steps = [
    {
      role: 'body',
      who: account('body'),
      what: '본문 올리기',
      kind: 'post',
      title: v.title,
      text: v.body,
      at: 0,
    },
  ];

  let clock = 0;

  (v.comments ?? []).forEach((comment, index) => {
    const n = comment.index ?? index + 1;
    const label = `댓글${n}`;

    (comment.thread ?? []).forEach((turn, position) => {
      if (position === 0) {
        clock += index === 0 ? gaps.first : gaps.between;
      } else {
        clock += gaps.reply;
      }

      const photo = comment.photoAt === position ? '\n(댓글 사진 여기에 첨부해주세요)' : '';
      let what = `${label} 달기`;

      if (turn.by === 'author') {
        what = `${label}에 작성자 답글`;
      } else if (position > 0) {
        what = `${label} 다시 달기`;
      }

      const role = turn.by === 'author' ? 'body' : `c${n}`;

      steps.push({
        role,
        who: account(role),
        what,
        kind: turn.by === 'author' || position > 0 ? 'reply' : 'comment',
        thread: n,
        text: turn.text + photo,
        at: clock,
      });
    });
  });

  return steps;
}

/**
 * Draw the publish screen.
 */
function renderPublish() {
  const s = store.settings;

  el('p-url').value = s.cafeUrl ?? '';
  el('p-board').value = s.board ?? '';
  el('up-list').innerHTML = store.docs.length
    ? store.docs
        .slice(0, 20)
        .map((d) => {
          const on = state.upPick === d.id;
          const when = new Date(d.createdAt).toLocaleDateString('ko-KR');

          return `<label class="row pickable${on ? ' on' : ''}">
              <span class="pick round">
                <input type="radio" name="uppick" value="${d.id}" ${on ? 'checked' : ''} aria-label="${esc(d.keyword)} 고르기" />
                <span class="box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"
                  aria-hidden="true"><path d="m5 13 4.5 4.5L19 7" /></svg></span>
              </span>
              <span class="txt"><b>${esc(d.keyword)}</b><span>댓글 ${d.versions[d.versions.length - 1].comments?.length ?? 0}개 · ${when}</span></span>
            </label>`;
        })
        .join('')
    : '<div class="empty">아직 만든 원고가 없어요</div>';

  el('acct-list').innerHTML = (s.accounts ?? []).length
    ? s.accounts
        .map(
          (name, index) => `<div class="row">
            <span class="txt"><b>${esc(name)}</b></span>
            <button class="btn sm ghost" type="button" data-acct-del="${index}">지우기</button>
          </div>`,
        )
        .join('')
    : '<div class="empty" style="padding:14px">아직 없어요</div>';

  el('gap-list').innerHTML = GAPS.map(
    (g) => `<div class="row">
      <span class="txt"><b>${g.label}</b></span>
      <span class="stepper">
        <button type="button" data-gap="${g.id}" data-delta="-1" aria-label="${g.label} 줄이기">−</button>
        <span>${s.gaps[g.id]}분</span>
        <button type="button" data-gap="${g.id}" data-delta="1" aria-label="${g.label} 늘리기">+</button>
      </span>
    </div>`,
  ).join('');

  const target = store.docs.find((d) => d.id === state.upPick) ?? store.docs[0];
  const v = applied(target);

  el('step-list').innerHTML = v
    ? buildSteps(v)
        .map(
          (step, index) => `<div class="row">
            <span class="chip blue">${index + 1}</span>
            <span class="txt">
              <b>${esc(step.what)}</b>
              <span>${atLabel(step.at)} · ${esc(step.who)}</span>
            </span>
            <button class="btn sm" type="button" data-step-copy="${index}">복사</button>
          </div>`,
        )
        .join('') +
      (s.cafeUrl
        ? `<div class="row"><span class="txt"><b>카페 열기</b><span>${esc(s.board || '게시판')}</span></span>
           <a class="btn sm pri" href="${esc(s.cafeUrl)}" target="_blank" rel="noopener">열기</a></div>`
        : '')
    : '<div class="empty">원고를 먼저 골라 주세요</div>';

  document.querySelectorAll('[name="uppick"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.upPick = radio.value;
      renderPublish();
    });
  });
  document.querySelectorAll('[data-acct-del]').forEach((button) => {
    button.addEventListener('click', () => {
      store.settings.accounts.splice(Number(button.dataset.acctDel), 1);
      persist();
      renderPublish();
      renderSettings();
    });
  });
  document.querySelectorAll('[data-gap]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.gap;
      const next = store.settings.gaps[id] + Number(button.dataset.delta);

      if (next < 1 || next > 5) {
        toast('1분부터 5분까지 정할 수 있어요');

        return;
      }

      store.settings.gaps[id] = next;
      persist();
      renderPublish();
    });
  });
  document.querySelectorAll('[data-step-copy]').forEach((button) => {
    button.addEventListener('click', () => {
      const steps = buildSteps(v);
      const step = steps[Number(button.dataset.stepCopy)];

      copy(step.kind === 'post' ? `제목: ${step.title}\n\n${step.text}` : step.text, step.what);
    });
  });

  el('assign-list').innerHTML = v
    ? roles(v)
        .map((seat) => {
          const picked = (s.assign ?? {})[seat.role] ?? '';

          return `<div class="row">
            <span class="txt"><b>${esc(seat.label)}</b><span>${seat.role === 'body' ? '글을 올리고 답글도 다는 계정이에요' : '이 댓글을 다는 계정이에요'}</span></span>
            <select class="input" data-assign="${seat.role}" aria-label="${esc(seat.label)} 계정"
              style="max-width:200px;padding:10px 12px">
              <option value="">고르지 않음</option>
              ${(s.accounts ?? [])
                .map(
                  (name) =>
                    `<option value="${esc(name)}" ${name === picked ? 'selected' : ''}>${esc(name)}</option>`,
                )
                .join('')}
            </select>
          </div>`;
        })
        .join('')
    : '<div class="empty" style="padding:14px">원고를 먼저 골라 주세요</div>';

  document.querySelectorAll('[data-assign]').forEach((select) => {
    select.addEventListener('change', () => {
      store.settings.assign = { ...(store.settings.assign ?? {}) };
      store.settings.assign[select.dataset.assign] = select.value;
      persist();
      renderPublish();
    });
  });

  el('btn-plan').addEventListener('click', () => {
    if (!v || !target) {
      toast('원고를 먼저 골라 주세요');

      return;
    }

    if (!s.cafeUrl) {
      toast('올릴 카페 주소를 먼저 넣어 주세요');

      return;
    }

    const missing = roles(v).filter((seat) => !(s.assign ?? {})[seat.role]);

    if (missing.length) {
      toast(`${missing[0].label}에 쓸 계정을 골라 주세요`);

      return;
    }

    const plan = {
      version: 1,
      keyword: target.keyword,
      cafeUrl: s.cafeUrl,
      board: s.board ?? '',
      steps: buildSteps(v).map((step, index) => ({
        no: index + 1,
        kind: step.kind,
        profile: step.who,
        thread: step.thread ?? null,
        at: step.at,
        what: step.what,
        title: step.title ?? null,
        text: step.text,
      })),
    };

    download(`${target.keyword} 업로드.json`, JSON.stringify(plan, null, 2));
    toast('자동 업로드 파일을 내려받았어요');
  });

  el('btn-plan-help').addEventListener('click', () => {
    const box = el('plan-help');

    box.hidden = !box.hidden;
    box.innerHTML = box.hidden
      ? ''
      : `<div class="way fallback" style="margin-top:12px">
          <span class="mark">?</span>
          <div>
            <b>자동으로 올리는 법</b>
            <p>브라우저에서는 네이버에 대신 글을 못 올려요. 컴퓨터에서 도는 작은 프로그램이 대신 올려 줍니다.</p>
            <p style="margin-top:6px">
              ① 프로그램을 받아서 <code>npm install</code> 한 번<br />
              ② 계정마다 <code>npm run login -- 별칭</code> — 창이 뜨면 그 계정으로 직접 로그인하고 닫기<br />
              ③ 여기서 받은 파일을 <code>npm start -- 받은파일.json</code><br />
              ④ 정해둔 간격대로 알아서 올라가요
            </p>
            <p style="margin-top:6px">
              별칭은 위 <b>자리 배정</b>에서 고른 이름과 똑같이 맞춰 주세요.
              비밀번호는 저장하지 않고, 처음 한 번 직접 로그인한 기록만 컴퓨터에 남습니다.
            </p>
          </div>
        </div>`;
  });
}

/* ---------------- 설정 ---------------- */

/**
 * Draw the settings screen.
 */
function renderSettings() {
  const base = model(store.settings.model);
  const upper = model(store.settings.upgradeModel);

  el('set-base').textContent = base ? `${base.name} · 원고 1건 ${wonDoc(base)}원` : '';
  el('set-upper').textContent = upper
    ? `${upper.name} · ${store.settings.upgrade ? '켜짐' : '꺼짐'}`
    : '';

  const gid = store.settings.googleClientId ?? '';

  el('google-state').innerHTML = gid
    ? `<span class="chip ok">연결 준비됨</span><button class="btn sm ghost" type="button" id="btn-gid-del">지우기</button>`
    : `<input class="input" type="text" id="f-gid" placeholder="000000-xxxx.apps.googleusercontent.com" aria-label="구글 클라이언트 ID" style="max-width:300px;padding:10px 12px" />
       <button class="btn sm pri" type="button" id="btn-gid-save">저장</button>`;

  el('google-help').innerHTML = gid
    ? ''
    : `<div class="way fallback" style="margin-top:10px">
        <span class="mark">?</span>
        <div>
          <b>클라이언트 ID 만드는 법</b>
          <p>
            안 넣어도 됩니다. 넣으면 <b>버튼 한 번으로 구글 문서가 만들어져요.</b>
            안 넣으면 서식 복사 → 붙여넣기로 씁니다.
          </p>
          <p style="margin-top:6px">
            ① <a href="https://console.cloud.google.com/apis/library/docs.googleapis.com" target="_blank" rel="noopener">Google Docs API 켜기</a><br />
            ② <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">사용자 인증 정보</a> → OAuth 클라이언트 ID 만들기 → <b>웹 애플리케이션</b><br />
            ③ <b>승인된 자바스크립트 원본</b>에 아래 주소를 넣기<br />
            ④ 만들어진 ID를 위 칸에 붙여넣기
          </p>
          <p class="pfoot" style="margin-top:8px">
            <code style="font-family:var(--font-mono,monospace);font-size:12.5px;color:var(--t800)">${esc(window.location.origin)}</code>
            <button class="btn sm" type="button" id="btn-origin">주소 복사</button>
          </p>
        </div>
      </div>`;

  const origin = el('btn-origin');

  if (origin) {
    origin.addEventListener('click', () => copy(window.location.origin, '주소'));
  }

  const gidSave = el('btn-gid-save');
  const gidDel = el('btn-gid-del');

  if (gidSave) {
    gidSave.addEventListener('click', () => {
      const value = el('f-gid').value.trim();

      if (!value) {
        toast('클라이언트 ID를 붙여넣어 주세요');

        return;
      }

      store.settings.googleClientId = value;
      persist();
      renderSettings();
      toast('구글 클라이언트 ID를 저장했어요');
    });
  }

  if (gidDel) {
    gidDel.addEventListener('click', () => {
      store.settings.googleClientId = '';
      persist();
      renderSettings();
    });
  }

  el('naver-count').textContent = `${(store.settings.accounts ?? []).length}개`;
  el('key-list').innerHTML = Object.keys(MAKERS)
    .map((maker) => {
      const saved = store.settings.keys[maker];
      const count = state.models.filter((m) => m.maker === maker).length;

      return `<div class="row">
        <span class="txt"><b>${MAKERS[maker]}</b><span>모델 ${count}개${saved ? ` · ${esc(saved.slice(0, 7))}…${esc(saved.slice(-4))}` : ''}</span></span>
        ${
          saved
            ? `<span class="chip ok" id="key-state-${maker}">등록됨</span>
               <button class="btn sm" type="button" data-key-test="${maker}">확인</button>
               <button class="btn sm ghost" type="button" data-key-del="${maker}">지우기</button>`
            : `<input class="input" type="password" data-key="${maker}" placeholder="API 키 붙여넣기" autocomplete="off" aria-label="${MAKERS[maker]} API 키" style="max-width:260px;padding:10px 12px" />
               <button class="btn sm pri" type="button" data-key-save="${maker}">저장</button>`
        }
      </div>`;
    })
    .join('');

  document.querySelectorAll('[data-key-save]').forEach((button) => {
    button.addEventListener('click', () => {
      const maker = button.dataset.keySave;
      const value = document.querySelector(`[data-key="${maker}"]`).value.trim();

      if (!value) {
        toast('API 키를 붙여넣어 주세요');

        return;
      }

      store.settings.keys[maker] = value;
      persist();
      renderSettings();
      renderModel();
      toast(`${MAKERS[maker]} 키를 저장했어요`);
    });
  });
  document.querySelectorAll('[data-key-test]').forEach((button) => {
    button.addEventListener('click', async () => {
      const maker = button.dataset.keyTest;
      const cheapest = state.models.filter((m) => m.maker === maker)[0];
      const chip = el(`key-state-${maker}`);

      if (!cheapest) {
        toast('쓸 수 있는 모델이 없어요');

        return;
      }

      button.disabled = true;
      chip.className = 'chip';
      chip.textContent = '확인 중…';

      try {
        const response = await fetch('/api/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId: cheapest.id, keys: store.settings.keys }),
        });

        const data = await response.json();

        chip.className = data.ok ? 'chip ok' : 'chip warn';
        chip.textContent = data.ok ? '잘 됩니다' : '안 돼요';

        if (!data.ok) {
          toast(`${MAKERS[maker]} · ${data.error}`);
        }
      } catch (error) {
        chip.className = 'chip warn';
        chip.textContent = '안 돼요';
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
  document.querySelectorAll('[data-key-del]').forEach((button) => {
    button.addEventListener('click', () => {
      store.settings.keys[button.dataset.keyDel] = '';
      persist();
      renderSettings();
      renderModel();
      toast(`${MAKERS[button.dataset.keyDel]} 키를 지웠어요`);
    });
  });
  renderStorage();
}

/**
 * Draw the storage meter and wire up backup and restore.
 */
async function renderStorage() {
  const { bytes, limit, ratio, known } = await usage();
  const percent = Math.round(ratio * 100);
  const docs = store.docs.length;
  const saved = store.library.length;
  let tone = 'ok';

  if (ratio > 0.9) {
    tone = 'warn';
  } else if (ratio > 0.7) {
    tone = 'mid';
  }

  const note = {
    warn: '거의 다 찼어요. 백업을 내려받고 오래된 원고를 지워 주세요.',
    mid: '절반쯤 썼어요. 백업을 한 번 받아 두세요.',
    ok: '넉넉해요. 원고 수만 개까지 들어가요.',
  }[tone];

  const amount = known
    ? `${readableSize(bytes)} 씀 · 쓸 수 있는 공간 ${readableSize(limit)}`
    : `${readableSize(bytes)} 씀`;

  el('storage-meter').innerHTML = `
    <div class="meter ${tone}"><span style="width:${Math.max(2, percent)}%"></span></div>
    <p class="desc" style="margin:8px 0 0">
      ${amount} · 만든 원고 ${docs}개 · 보관함 ${saved}개<br />${note}
    </p>`;

  el('btn-backup').addEventListener('click', () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    download(`나비효과플랜-원고백업-${stamp}.json`, JSON.stringify(store, null, 2));
    toast('백업 파일을 내려받았어요');
  });

  el('btn-restore').addEventListener('click', () => el('f-restore').click());
  el('f-restore').addEventListener('change', async (event) => {
    const [file] = event.target.files ?? [];

    if (!file) {
      return;
    }

    try {
      const incoming = JSON.parse(await file.text());

      if (!Array.isArray(incoming.docs) || !Array.isArray(incoming.library)) {
        throw new Error('원고 백업 파일이 아니에요.');
      }

      const ids = new Set(store.docs.map((d) => d.id));
      const libIds = new Set(store.library.map((l) => l.id));
      const addedDocs = incoming.docs.filter((d) => d?.id && !ids.has(d.id));
      const addedLib = incoming.library.filter((l) => l?.id && !libIds.has(l.id));

      store.docs = [...addedDocs, ...store.docs];
      store.library = [...addedLib, ...store.library];

      if (persist()) {
        toast(`원고 ${addedDocs.length}개, 보관함 ${addedLib.length}개를 더했어요`);
      }

      renderLibrary();
      renderExport();
      renderSettings();
    } catch (error) {
      toast(error.message);
    } finally {
      event.target.value = '';
    }
  });
}

/* ---------------- 이벤트 ---------------- */

document.addEventListener('click', (event) => {
  const t = event.target.closest(
    '[data-go],[data-version],[data-use],[data-seg],[data-step],[data-pick],[data-showall],[data-soon]',
  );

  if (!t) {
    return;
  }

  if (t.dataset.go) show(t.dataset.go);
  if (t.dataset.soon) toast(t.dataset.soon);

  if (t.dataset.version) {
    state.version = Number(t.dataset.version);
    state.revising = {};
    renderResult();
    renderDock();
  }

  if (t.dataset.use) {
    state.keepSet = t.dataset.use;
    state.setMode = 'load';
    setSeg('set', 'load');
    renderSetZone();

    if (t.closest('#lib-grid')) {
      show('write');
    }

    toast('이 댓글 세트로 만들게요');
  }

  if (t.dataset.showall) {
    state.showAll = true;
    el('set-zone').innerHTML = pickerHtml('set-search');
    bindPicker('set-search');
  }

  if (t.dataset.pick) {
    state.picks = t.dataset.pick === 'all' ? store.docs.map((d) => d.id) : [];
    renderExport();
    renderDock();
  }

  if (t.dataset.step === 'count') {
    store.settings.commentCount = Math.min(
      8,
      Math.max(1, store.settings.commentCount + Number(t.dataset.delta)),
    );
    persist();
    el('cnt-value').textContent = `${store.settings.commentCount}개`;
  }

  if (t.dataset.seg) {
    const { seg, value } = t.dataset;

    setSeg(seg, value);

    if (seg === 'tone') store.settings.tone = value;
    if (seg === 'len') store.settings.length = value;

    if (seg === 'set') {
      state.setMode = value;
      renderSetZone();
    }

    if (seg === 'way') {
      state.way = value;
      renderExport();
    }

    persist();
    renderDock();
  }
});

/**
 * Start the app.
 */
async function start() {
  Object.assign(store, await load());

  if (store.settings.googleClientId) {
    preloadGis();
  }

  window.addEventListener('beforeunload', (event) => {
    if (state.busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  onSaveError((error) => {
    toast(`저장하지 못했어요. ${error.message ?? '설정에서 백업을 내려받아 두세요.'}`);
  });

  const response = await fetch('/api/models').catch(() => null);

  state.models = response?.ok ? (await response.json()).models : [];

  const s = store.settings;

  el('f-mobile').checked = s.mobileShape;
  el('cnt-value').textContent = `${s.commentCount}개`;
  setSeg('tone', s.tone);
  setSeg('len', s.length);
  setSeg('set', 'new');
  setSeg('way', 'docs');

  el('f-mobile').addEventListener('change', () => {
    store.settings.mobileShape = el('f-mobile').checked;
    persist();
  });
  el('btn-model').addEventListener('click', () => {
    state.modelOpen = !state.modelOpen;
    renderModel();
  });
  el('lib-search').addEventListener('input', () => {
    state.libQuery = el('lib-search').value;
    renderLibrary();
  });
  el('lib-sort').addEventListener('change', () => {
    state.libSort = el('lib-sort').value;
    renderLibrary();
  });
  el('btn-import').addEventListener('click', () => {
    state.pickOpen = !state.pickOpen;
    el('picker-zone').innerHTML = state.pickOpen ? pickerHtml('result-search') : '';

    if (state.pickOpen) {
      bindPicker('result-search');
    }
  });
  el('btn-fetch').addEventListener('click', fetchCafe);
  el('btn-fallback').addEventListener('click', () => {
    const zone = el('cafe-fallback');

    zone.hidden = !zone.hidden;
    el('btn-fallback').textContent = zone.hidden ? '방법 보기' : '접기';
  });
  el('btn-paste').addEventListener('click', async () => {
    const text = el('f-paste').value.trim();

    if (!text) {
      toast('붙여넣은 내용이 없어요');

      return;
    }

    const parsed = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = await parsed.json();

    if (addToLibrary(data.manuscript, el('f-paste-keyword').value.trim())) {
      el('f-paste').value = '';
      el('f-paste-keyword').value = '';
      toast('보관함에 넣었어요');
    }
  });
  el('p-url').addEventListener('change', () => {
    store.settings.cafeUrl = el('p-url').value.trim();
    persist();
    renderPublish();
  });
  el('p-board').addEventListener('change', () => {
    store.settings.board = el('p-board').value.trim();
    persist();
  });
  el('btn-acct-add').addEventListener('click', () => {
    const name = el('f-acct').value.trim();

    if (!name) {
      toast('별칭을 적어 주세요');

      return;
    }

    store.settings.accounts = [...(store.settings.accounts ?? []), name];
    persist();
    el('f-acct').value = '';
    renderPublish();
    renderSettings();
  });
  buildBookmarklet();
  el('btn-regen').addEventListener('click', () => {
    const target = doc();

    if (!target) {
      return;
    }

    target.keyword = el('w-keyword').value.trim();
    target.request = el('w-request').value.trim();
    persist();
    el('f-keyword').value = target.keyword;
    el('f-request').value = target.request;
    state.carried = target.keyword;
    show('write');
    toast('생성 화면에서 조건을 확인하고 다시 만들어 주세요');
  });

  const picker = document.createElement('input');

  picker.type = 'file';
  picker.multiple = true;
  picker.accept = '.txt,.md,.text';
  picker.hidden = true;
  document.body.append(picker);
  picker.addEventListener('change', () => {
    if (picker.files?.length) {
      addFiles(picker.files);
      picker.value = '';
    }
  });
  el('btn-upload').addEventListener('click', () => picker.click());

  state.upPick = store.docs[0]?.id ?? null;
  state.docId = store.docs[0]?.id ?? null;
  state.version = state.docId ? store.docs[0].versions.length - 1 : 0;
  renderNav();
  renderModel();
  renderSetZone();
  renderLibrary();
  renderSettings();
  show(store.docs.length ? 'result' : 'write');
}

start();
