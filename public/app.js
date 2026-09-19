import { cafeExtension, cafeStatus, onCafeEvent, runInCafe, stopCafe } from './cafe-bridge.js';
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
  stopped: false,
  libPage: 0,
  madePage: 0,
  editLib: null,
  runLog: [],
  pub: null,
  hasExtension: '',
  stuckSeen: null,
  runNote: '',
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
const doc = () => store.docs.find((d) => d.id === state.docId) ?? null;
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
 * Keep only the steps the chosen range covers.
 *
 * 본문만 먼저 올려 보고 댓글은 나중에 다는 일이 많아서, 어디까지 올릴지
 * 고를 수 있게 했어요.
 * @param {Record<string, any>[]} steps - All steps.
 * @param {string} scope - `body`, `first` or `all`.
 * @returns {Record<string, any>[]} Steps to actually post.
 */
function inScope(steps, scope) {
  if (scope === 'body') {
    return steps.filter((step) => step.kind === 'post');
  }

  if (scope === 'first') {
    return steps.filter((step) => step.kind === 'post' || step.thread === 1);
  }

  return steps;
}

/**
 * Show how far the extension got, step by step.
 * @param {boolean} dry - True when nothing is actually being posted.
 */
function renderRunLog(dry) {
  const box = el('auto-log');

  if (!box || !state.runLog.length) {
    return;
  }

  box.innerHTML = `<div class="runlog">
    <div class="cardhead">
      <h3>${dry ? '연습으로 올려 보는 중' : '올리는 중'}</h3>
      <span class="grow"></span>
      <button class="btn sm" type="button" id="btn-run-stop">멈추기</button>
    </div>
    <p class="desc" style="margin:0">
      ${
        store.settings.background === false
          ? '카페 탭이 눈앞에 열려요. <b>그 창을 닫지 마세요.</b>'
          : '카페 창을 내려둔 채로 올리고 있어요. <b>작업표시줄에 있는 그 창을 닫지 마세요.</b> 크롬은 켜 두셔야 해요.'
      }
      캡차나 로그인 확인이 뜨면 그 창을 열어서 풀어 주시면 이어서 갑니다.
    </p>
    ${state.runNote ? `<p class="desc" style="margin:8px 0 0"><b>${esc(state.runNote)}</b></p>` : ''}
    <ol>
      ${state.runLog
        .map(
          (step) =>
            `<li class="${step.at}">${esc(step.what)} · ${esc(step.profile)}${
              step.at === 'stuck' ? ` — ${esc(step.why ?? '')}` : ''
            }</li>`,
        )
        .join('')}
    </ol>
    ${
      state.stuckSeen
        ? `<p class="desc" style="margin:12px 0 0">막힌 화면에서 이런 게 보였어요. 이걸 그대로 알려주시면 고칠 수 있어요.</p>
           <pre class="seen">${esc(JSON.stringify(state.stuckSeen, null, 1))}</pre>
           <div class="pfoot"><button class="btn sm" type="button" id="btn-copy-seen">이 내용 복사</button></div>`
        : ''
    }
  </div>`;

  el('btn-copy-seen')?.addEventListener('click', () =>
    copy(JSON.stringify(state.stuckSeen, null, 1), '화면 정보'),
  );

  el('btn-run-stop').onclick = async () => {
    await stopCafe();
    toast('이번 단계까지만 하고 멈춰요');
  };
}

/**
 * Read the saved accounts, whichever shape they were stored in.
 *
 * 처음에는 별칭만 글자로 넣어 뒀어요. 그때 저장한 것도 그대로 열리게 합니다.
 * @returns {{ alias: string, id: string, pw: string }[]} Accounts.
 */
function accountList() {
  return (store.settings.accounts ?? []).map((entry) =>
    typeof entry === 'string'
      ? { alias: entry, id: '', pw: '' }
      : { alias: entry.alias ?? '', id: entry.id ?? '', pw: entry.pw ?? '' },
  );
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

  // 좁은 화면에서는 설명줄을 감추는데, 업로드 바만은 보여야 해요.
  inner.className = state.view === 'publish' ? 'inner stack' : 'inner';

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
  } else if (state.view === 'publish' && state.pub) {
    const p = state.pub;
    const off = p.ready ? '' : ' disabled';

    const buttons = state.hasExtension
      ? `<button class="btn" type="button" id="btn-dock-dry"${off}>연습으로</button>
         <button class="btn pri lg" type="button" id="btn-dock-run"${off}>업로드 시작</button>`
      : `<button class="btn pri lg" type="button" id="btn-dock-plan"${off}>업로드 파일 내려받기</button>`;

    inner.innerHTML = `<p>${p.ready ? `${esc(p.keyword)} · ${p.scope} · ${p.count}단계` : esc(p.missing)}</p>${buttons}`;

    if (state.hasExtension) {
      el('btn-dock-dry').onclick = () => p.run(true);
      el('btn-dock-run').onclick = () => p.run(false);
    } else {
      el('btn-dock-plan').onclick = p.plan;
    }
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
  reserveForDock();
}

/**
 * Leave room under the page so the bottom bar never sits on top of anything.
 *
 * 바가 두 줄이 되기도 해서 높이를 재서 그만큼 비워 둬요.
 */
function reserveForDock() {
  const wrap = document.querySelector('.wrap');
  const dock = el('dock');

  if (!wrap || !dock) {
    return;
  }

  requestAnimationFrame(() => {
    const tabbar = window.innerWidth <= 860 ? 62 : 0;
    const tall = dock.hidden ? tabbar : dock.offsetHeight + tabbar;

    wrap.style.paddingBottom = `${tall + 36}px`;
  });
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
  el('stream-title').textContent = '쓰는 중이에요';
  el('stream-count').textContent = '0자';
  el('btn-stop').hidden = false;
  el('stream-note').textContent =
    '다른 화면으로 가도 계속 써요. 창을 닫으면 여기까지 쓴 만큼만 남고 이어서 쓰진 못해요.';
  state.busy = true;
  state.stopped = false;
  renderDock();
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  el('btn-stop').onclick = () => {
    state.stopped = true;
    el('stream-title').textContent = '여기서 멈췄어요';
    el('stream-note').textContent = '쓴 만큼은 남아 있어요. 아래에서 살릴 수 있어요.';
    el('btn-stop').hidden = true;
  };

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
          if (state.stopped) {
            throw new Error('그만뒀어요. 쓴 만큼은 아래에서 살릴 수 있어요.');
          }

          out.textContent += event.text;
          out.scrollTop = out.scrollHeight;
          el('stream-count').textContent = `${out.textContent.replace(/\s/g, '').length}자`;
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
    state.stopped = false;
    out.classList.remove('caret');
    el('btn-stop').hidden = true;
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

  // 하나뿐일 때도 몇 개인지 보여줘요. 아무것도 안 보이면
  // 원고가 하나인 건지 고르개가 없는 건지 알 수 없어요.
  el('doc-switch').hidden = false;
  el('doc-now').textContent = many
    ? `만든 원고 ${store.docs.length}개`
    : `만든 원고 1개 · ${target.keyword ?? '원고'}`;
  el('doc-pick').hidden = !many;

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
/** 한 쪽에 보여줄 개수. 스크롤이 끝없이 길어지지 않게 끊어요. */
const PER_PAGE = 10;
/** 이 화면이 기대하는 확장 판. 이보다 낮으면 새로 받아야 해요. */
const NEEDS_EXT = '1.2.0';

/**
 * Compare two version strings like `1.2.0`.
 * @param {string} one - Version found.
 * @param {string} two - Version needed.
 * @returns {boolean} True when `one` is older than `two`.
 */
function olderThan(one, two) {
  const left = String(one).split('.').map(Number);
  const right = String(two).split('.').map(Number);

  for (let at = 0; at < right.length; at += 1) {
    if ((left[at] ?? 0) !== right[at]) {
      return (left[at] ?? 0) < right[at];
    }
  }

  return false;
}

/**
 * Draw the page buttons for a list.
 * @param {string} id - Container id.
 * @param {number} total - How many items there are.
 * @param {number} page - Current page, starting at 0.
 * @param {(next: number) => void} go - Called with the page to move to.
 */
function renderPager(id, total, page, go) {
  const box = el(id);
  const last = Math.max(0, Math.ceil(total / PER_PAGE) - 1);

  if (last === 0) {
    box.innerHTML = '';

    return;
  }

  const numbers = [];

  for (let n = Math.max(0, page - 2); n <= Math.min(last, page + 2); n += 1) {
    numbers.push(n);
  }

  box.innerHTML = `
    <button type="button" data-go-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>이전</button>
    ${numbers
      .map(
        (n) =>
          `<button type="button" data-go-page="${n}" aria-current="${n === page}">${n + 1}</button>`,
      )
      .join('')}
    <button type="button" data-go-page="${page + 1}" ${page === last ? 'disabled' : ''}>다음</button>
    <span class="at">${total}개 중 ${page * PER_PAGE + 1}~${Math.min(total, (page + 1) * PER_PAGE)}</span>`;

  box.querySelectorAll('[data-go-page]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = Number(button.dataset.goPage);

      if (next >= 0 && next <= last) {
        go(next);
      }
    });
  });
}

/**
 * Draw the manuscripts made in this app, newest first.
 *
 * 만든 원고도 보관함에서 한눈에 보이게 해요. 여기서 바로 열거나 지웁니다.
 */
function renderMade() {
  const total = store.docs.length;

  el('made-card').hidden = !total;

  if (!total) {
    return;
  }

  const last = Math.max(0, Math.ceil(total / PER_PAGE) - 1);

  state.madePage = Math.min(state.madePage, last);
  el('made-count').textContent = `${total}개`;

  el('made-grid').innerHTML = store.docs
    .slice(state.madePage * PER_PAGE, (state.madePage + 1) * PER_PAGE)
    .map((d) => {
      const v = applied(d);

      return `<article class="lib">
        <h4>${esc(d.keyword || '이름 없음')}</h4>
        <p>${esc(v?.title ?? '')}</p>
        <span class="meta">댓글 ${v?.comments?.length ?? 0}개 · ${d.versions.length}차 · ${new Date(d.createdAt).toLocaleDateString('ko-KR')}</span>
        <div class="act">
          <button class="btn sm" type="button" data-open-doc="${d.id}">열기</button>
          <button class="btn sm" type="button" data-save-doc="${d.id}">보관함에 넣기</button>
          <span class="grow"></span>
          <button class="btn sm ghost" type="button" data-del-doc="${d.id}">지우기</button>
        </div>
      </article>`;
    })
    .join('');

  renderPager('made-pager', total, state.madePage, (next) => {
    state.madePage = next;
    renderMade();
  });

  document.querySelectorAll('[data-open-doc]').forEach((button) => {
    button.addEventListener('click', () => {
      state.docId = button.dataset.openDoc;
      state.version = (doc()?.versions.length ?? 1) - 1;
      state.revising = {};
      show('result');
    });
  });

  document.querySelectorAll('[data-save-doc]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = store.docs.find((d) => d.id === button.dataset.saveDoc);
      const v = applied(target);

      if (!v?.comments?.length) {
        toast('댓글이 있어야 보관함 세트로 쓸 수 있어요');

        return;
      }

      store.library.unshift({
        id: uid('lib'),
        keyword: target.keyword,
        fileName: `${target.keyword}.txt`,
        title: v.title,
        body: v.body,
        comments: v.comments.map((c) => ({ ...c, locked: false })),
        learn: false,
        uses: 0,
        addedAt: Date.now(),
      });
      persist();
      renderLibrary();
      toast('보관함에 넣었어요. 어투 학습을 켜면 다음 원고에 반영돼요');
    });
  });

  document.querySelectorAll('[data-del-doc]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = store.docs.find((d) => d.id === button.dataset.delDoc);

      if (!window.confirm(`「${target?.keyword ?? '원고'}」를 지울까요? 되돌릴 수 없어요.`)) {
        return;
      }

      store.docs = store.docs.filter((d) => d.id !== button.dataset.delDoc);

      if (state.docId === button.dataset.delDoc) {
        state.docId = store.docs[0]?.id ?? null;
        state.version = Math.max(0, (store.docs[0]?.versions.length ?? 1) - 1);
      }

      persist();
      renderMade();
      renderExport();
      toast('지웠어요');
    });
  });
}

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

  const lastPage = Math.max(0, Math.ceil(list.length / PER_PAGE) - 1);

  state.libPage = Math.min(state.libPage, lastPage);

  el('lib-summary').textContent = summary;
  el('lib-empty').hidden = list.length > 0 || !store.library.length;
  el('lib-grid').innerHTML = list
    .slice(state.libPage * PER_PAGE, (state.libPage + 1) * PER_PAGE)
    .map(
      (i) => `<article class="lib">
      <h4>${esc(i.keyword)}</h4>
      <p>${esc(i.title)}</p>
      <span class="meta">댓글 ${i.comments.length}개${i.uses ? ` · ${i.uses}번 씀` : ''}</span>
      <div class="act">
        <button class="btn sm" type="button" data-use="${i.id}">댓글 가져오기</button>
        <button class="btn sm" type="button" data-edit-lib="${i.id}">고치기</button>
        <span class="grow"></span>
        <label class="check"><input type="checkbox" data-learn="${i.id}" ${i.learn ? 'checked' : ''} aria-label="어투 학습" />어투 학습</label>
        <button class="btn sm ghost" type="button" data-del-lib="${i.id}">지우기</button>
      </div>
    </article>`,
    )
    .join('');

  renderPager('lib-pager', list.length, state.libPage, (next) => {
    state.libPage = next;
    renderLibrary();
  });
  renderMade();
  renderLibEditor();

  document.querySelectorAll('[data-learn]').forEach((box) => {
    box.addEventListener('change', () => {
      const item = store.library.find((l) => l.id === box.dataset.learn);

      item.learn = box.checked;
      persist();
      renderLibrary();
    });
  });

  document.querySelectorAll('[data-edit-lib]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editLib = state.editLib === button.dataset.editLib ? null : button.dataset.editLib;
      renderLibEditor();
    });
  });

  document.querySelectorAll('[data-del-lib]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = store.library.find((l) => l.id === button.dataset.delLib);

      if (!window.confirm(`「${item?.keyword ?? '원고'}」를 보관함에서 지울까요?`)) {
        return;
      }

      store.library = store.library.filter((l) => l.id !== button.dataset.delLib);

      if (state.editLib === button.dataset.delLib) {
        state.editLib = null;
      }

      persist();
      renderLibrary();
      toast('지웠어요');
    });
  });
}

/**
 * Show the panel for fixing one saved manuscript.
 *
 * 원고를 올린 그대로 글자로 보여주고, 고쳐서 저장하면 다시 읽어들여요.
 * 제목·본문·댓글을 따로 다루는 화면을 만드는 것보다 손대기 쉬워요.
 */
function renderLibEditor() {
  const box = el('lib-editor');
  const item = state.editLib ? store.library.find((l) => l.id === state.editLib) : null;

  if (!box) {
    return;
  }

  if (!item) {
    box.innerHTML = '';

    return;
  }

  box.innerHTML = `<div class="editor">
    <div class="cardhead">
      <h3>「${esc(item.keyword)}」 고치기</h3>
      <span class="grow"></span>
      <button class="btn sm ghost" type="button" id="btn-edit-close">닫기</button>
    </div>
    <div class="field" style="margin-bottom:10px">
      <label class="label" for="f-lib-keyword">키워드</label>
      <input class="input" type="text" id="f-lib-keyword" value="${esc(item.keyword)}" />
    </div>
    <label class="label" for="f-lib-text">원고</label>
    <textarea id="f-lib-text" spellcheck="false"></textarea>
    <p class="desc" style="margin:8px 0 0">
      올릴 때와 같은 형식이에요. 첫 줄이 제목, <b>댓글1</b> 부터 댓글, <b>ㄴ 작성자</b> 는 글쓴이 답글이에요.
    </p>
    <div class="pfoot">
      <button class="btn pri" type="button" id="btn-edit-save">저장하기</button>
      <button class="btn" type="button" id="btn-edit-cancel">되돌리기</button>
    </div>
  </div>`;

  el('f-lib-text').value = toText(item);

  el('btn-edit-close').addEventListener('click', () => {
    state.editLib = null;
    renderLibEditor();
  });

  el('btn-edit-cancel').addEventListener('click', () => {
    el('f-lib-text').value = toText(item);
    el('f-lib-keyword').value = item.keyword;
    toast('되돌렸어요');
  });

  el('btn-edit-save').addEventListener('click', async () => {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: el('f-lib-text').value }),
    }).catch(() => null);

    const data = await response?.json().catch(() => null);
    const next = data?.manuscripts?.[0] ?? data?.manuscript;

    if (!next?.title) {
      toast('제목을 못 찾았어요. 첫 줄에 제목이 있어야 해요.');

      return;
    }

    item.keyword = el('f-lib-keyword').value.trim() || item.keyword;
    item.title = next.title;
    item.body = next.body;
    item.comments = next.comments;
    persist();
    state.editLib = null;
    renderLibrary();
    toast('고쳤어요');
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

/** 어디까지 올릴지 고른 것을 짧게 부르는 말. */
const SCOPE_LABEL = { body: '본문만', first: '본문 + 댓글1', all: '전체' };

/** 고른 범위가 무슨 뜻인지 풀어서 쓴 말. */
const SCOPE_NOTE = {
  body: '<b>본문 글만</b> 올려요. 댓글은 하나도 안 올립니다. 글이 제대로 올라가는지 먼저 볼 때 좋아요.',
  first:
    '<b>본문 글과 댓글1 묶음까지</b> 올려요. 남은 댓글은 나중에 <b>전체</b>로 다시 올리시면 됩니다.',
  all: '원고에 있는 <b>본문과 댓글을 전부</b> 정해둔 간격대로 올려요.',
};

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
    // 원고 안의 댓글 번호가 겹치는 일이 있어서(1,2,3,3,4) 순서대로 셉니다.
    ...(v?.comments ?? []).map((comment, index) => ({
      role: `c${index + 1}`,
      label: `댓글${index + 1}`,
    })),
  ];
}

/**
 * Find which account alias sits on a seat.
 * @param {string} role - Seat id such as `body` or `c2`.
 * @returns {string} Alias, or a placeholder when nothing is assigned yet.
 */
function account(role) {
  const picked = (store.settings.assign ?? {})[role];

  return accountList().some((a) => a.alias === picked)
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
    // 자리 이름과 똑같이, 원고 안 번호가 아니라 순서대로 셉니다.
    const n = index + 1;
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
 * Say in one short line what still has to be filled in before uploading.
 * @param {Record<string, any> | null} v - The chosen version, when there is one.
 * @param {Record<string, any>} settings - Saved settings.
 * @param {Record<string, any>[]} accounts - Saved accounts.
 * @returns {string} What to do next.
 */
function whatIsMissing(v, settings, accounts) {
  if (!v) {
    return '올릴 원고를 골라 주세요';
  }

  if (!settings.cafeUrl) {
    return '올릴 게시판 주소를 넣어 주세요';
  }

  if (!accounts.length) {
    return '올릴 계정을 하나라도 추가해 주세요';
  }

  return '';
}

/**
 * Draw the publish screen.
 */
function renderPublish() {
  const s = store.settings;

  el('p-url').value = s.cafeUrl ?? '';
  el('p-bg').checked = s.background !== false;

  el('p-bg').onchange = () => {
    store.settings.background = el('p-bg').checked;
    persist();
  };

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

  const accounts = accountList();

  el('acct-list').innerHTML = accounts.length
    ? accounts
        .map(
          (a, index) => `<div class="row">
            <span class="txt"><b>${esc(a.alias)}</b><span>${a.id ? esc(a.id) : '아이디 없음'}${a.pw ? ' · 비밀번호 저장됨' : ' · 직접 로그인'}</span></span>
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
  const scope = s.scope ?? 'all';
  const allSteps = v ? buildSteps(v) : [];
  const steps = inScope(allSteps, scope);
  const left = allSteps.length - steps.length;
  const needed = new Set(steps.map((step) => step.role));
  let scopeNote = SCOPE_NOTE[scope];

  if (v) {
    scopeNote += ` 고른 원고로는 <b>${steps.length}단계</b>를 올려요`;
    scopeNote += left > 0 ? ` (원고 전체는 ${allSteps.length}단계).` : '.';
  }

  el('scope-note').innerHTML = scopeNote;

  el('step-list').innerHTML = v
    ? steps
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
      (left > 0
        ? `<div class="row"><span class="txt"><b>남은 ${left}단계는 이번에 안 올려요</b><span>「어디까지 올릴까요」를 전체로 바꾸면 다 올라가요</span></span></div>`
        : '') +
      (s.cafeUrl
        ? `<div class="row"><span class="txt"><b>카페 열기</b><span>올릴 게시판을 새 탭에서 봐요</span></span>
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
      const next = accountList();

      next.splice(Number(button.dataset.acctDel), 1);
      store.settings.accounts = next;
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
      const step = steps[Number(button.dataset.stepCopy)];

      copy(step.kind === 'post' ? `제목: ${step.title}\n\n${step.text}` : step.text, step.what);
    });
  });

  el('assign-list').innerHTML = v
    ? roles(v)
        .map((seat) => {
          const picked = (s.assign ?? {})[seat.role] ?? '';
          let why = '이번 범위에서는 안 올려요. 비워 두셔도 됩니다';

          if (needed.has(seat.role)) {
            why =
              seat.role === 'body'
                ? '글을 올리고 답글도 다는 계정이에요'
                : '이 댓글을 다는 계정이에요';
          }

          return `<div class="row"${needed.has(seat.role) ? '' : ' style="opacity:.55"'}>
            <span class="txt"><b>${esc(seat.label)}</b><span>${why}</span></span>
            <select class="input" data-assign="${seat.role}" aria-label="${esc(seat.label)} 계정"
              style="max-width:200px;padding:10px 12px">
              <option value="">고르지 않음</option>
              ${accounts
                .map(
                  (a) =>
                    `<option value="${esc(a.alias)}" ${a.alias === picked ? 'selected' : ''}>${esc(a.alias)}</option>`,
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

  el('btn-plan-help').onclick = () => {
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
  };

  const ready = Boolean(v) && Boolean(s.cafeUrl) && accounts.length > 0;

  el('auto-state').textContent = ready ? '쓸 준비 됨' : '아래를 먼저 채워 주세요';
  el('auto-state').className = ready ? 'chip ok' : 'chip';

  const loginCmd = accounts.length
    ? accounts.map((a) => `npm run login -- "${a.alias}"`).join('\n')
    : 'npm run login -- "계정별칭"';

  /**
   * Put together everything the uploader needs, or say what is missing.
   * @returns {Record<string, any> | null} Plan, or null when something is missing.
   */
  const buildPlan = () => {
    if (!v || !target) {
      toast('원고를 먼저 골라 주세요');

      return null;
    }

    if (!s.cafeUrl) {
      toast('올릴 게시판 주소를 먼저 넣어 주세요');

      return null;
    }

    // 올릴 자리의 계정만 있으면 돼요. 안 올릴 댓글은 비어 있어도 괜찮습니다.
    const missing = roles(v).filter(
      (seat) => needed.has(seat.role) && !(s.assign ?? {})[seat.role],
    );

    if (missing.length) {
      toast(`${missing[0].label}에 쓸 계정을 골라 주세요`);

      return null;
    }

    return {
      version: 1,
      keyword: target.keyword,
      // 게시판을 열어 둔 주소라야 그 게시판에 올라가요.
      cafeUrl: s.cafeUrl,
      board: s.board ?? '',
      steps: steps.map((step, index) => ({
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
  };

  el('btn-plan').onclick = () => {
    const plan = buildPlan();

    if (plan) {
      download(`${target.keyword} 업로드.json`, JSON.stringify(plan, null, 2));
      toast('자동 업로드 파일을 내려받았어요');
    }
  };

  /**
   * Hand the plan to the extension and follow along.
   * @param {boolean} dry - True to fill everything in without pressing 등록.
   */
  const runHere = async (dry) => {
    const plan = buildPlan();

    if (!plan) {
      return;
    }

    // 진짜로 올리면 되돌릴 수 없어요. 한 번만 물어봅니다.
    if (
      !dry &&
      // eslint-disable-next-line no-alert
      !window.confirm(
        `${SCOPE_LABEL[scope]} · ${plan.steps.length}단계를 실제로 카페에 올려요. 올린 글은 카페에서 직접 지워야 합니다. 시작할까요?`,
      )
    ) {
      return;
    }

    // 확장은 이 브라우저에서 로그인을 갈아 끼우므로 계정 정보도 같이 넘겨요.
    const reply = await runInCafe({ ...plan, accounts, background: s.background !== false }, dry);

    if (!reply || reply.type === 'error') {
      toast(reply?.message ?? '확장이 응답하지 않아요. 브라우저를 새로고침해 보세요.');

      return;
    }

    state.runLog = plan.steps.map((step) => ({ ...step, at: 'wait' }));
    renderRunLog(dry);
  };

  // 아래 바에서도 바로 올릴 수 있게, 필요한 것만 넘겨 둬요.
  state.pub = {
    ready,
    count: steps.length,
    scope: SCOPE_LABEL[scope] ?? '전체',
    keyword: target?.keyword ?? '',
    missing: ready ? '' : whatIsMissing(v, s, accounts),
    run: runHere,
    plan: () => el('btn-plan').click(),
  };

  if (state.view === 'publish') {
    renderDock();
  }

  if (state.hasExtension) {
    el('auto-state').textContent = ready ? '바로 올릴 수 있어요' : '아래를 먼저 채워 주세요';
    el('auto-state').className = ready ? 'chip ok' : 'chip';

    const stale = olderThan(state.hasExtension, NEEDS_EXT);

    el('auto-guide').innerHTML = `
      ${
        stale
          ? `<div class="way fallback" style="margin:0 0 16px">
              <span class="mark">!</span>
              <div>
                <b>확장이 낡았어요 (지금 ${esc(state.hasExtension)}, 필요한 판 ${NEEDS_EXT})</b>
                <p>
                  깃허브에서 <b>Code → Download ZIP</b> 으로 새로 받아 <b>extension</b> 폴더를 바꿔치기하고,
                  <code>chrome://extensions</code> 에서 이 확장의 <b>↻</b> 를 눌러 주세요.
                  낡은 판은 글쓰기 화면에서 멈출 수 있어요.
                </p>
              </div>
            </div>`
          : ''
      }
      <p class="desc" style="margin:0 0 14px">
        이 브라우저에 <b>카페 올리기</b>가 깔려 있어요. 아래 단추만 누르시면 카페 탭을 열어서
        순서와 간격대로 올려 드립니다. 터미널은 필요 없어요.
        <b>먼저 연습부터</b> 해보세요. 글은 다 채우고 등록만 안 누릅니다.
        화면 맨 아래 바에서도 똑같이 시작할 수 있어요.
      </p>
      <div class="pfoot" style="margin-top:0">
        <button class="btn" type="button" id="btn-run-dry"${ready ? '' : ' disabled'}>연습으로 올려 보기</button>
        <button class="btn pri" type="button" id="btn-run"${ready ? '' : ' disabled'}>업로드 시작</button>
        <span class="grow"></span>
        <button class="btn ghost" type="button" id="btn-acct-file">계정 파일 내려받기</button>
      </div>`;

    el('btn-run-dry').onclick = () => runHere(true);
    el('btn-run').onclick = () => runHere(false);

    el('btn-acct-file').onclick = () => {
      if (!accounts.length) {
        toast('계정을 먼저 추가해 주세요');

        return;
      }

      download('accounts.json', JSON.stringify({ version: 1, accounts }, null, 2));
      toast('automation 폴더에 넣어 주세요');
    };

    return;
  }

  el('auto-guide').innerHTML = `
    <div class="way fallback" style="margin:0 0 16px">
      <span class="mark">＋</span>
      <div>
        <b>확장을 깔면 여기서 바로 올릴 수 있어요</b>
        <p>
          터미널도, Node.js도 필요 없어요. 폴더 하나만 끌어다 놓으면 끝이고,
          그 다음부터는 이 화면에서 단추 한 번이면 됩니다. 한 번만 하시면 돼요.
        </p>
        <p style="margin-top:8px">
          ① 받은 폴더 안의 <b>extension</b> 폴더를 컴퓨터에 두기 (지우지 마세요)<br />
          ② 주소창에 <code>chrome://extensions</code> 치기
          (웨일은 <code>whale://extensions</code>)<br />
          ③ 오른쪽 위 <b>개발자 모드</b> 켜기<br />
          ④ <b>압축해제된 확장 프로그램을 로드합니다</b> → 그 <b>extension</b> 폴더 고르기<br />
          ⑤ 이 화면 새로고침
        </p>
      </div>
    </div>

    <p class="desc" style="margin:0 0 6px">
      확장 없이 하시려면 아래 <b>까만 칸의 글자</b>를 컴퓨터의 <b>터미널</b>(윈도우는 명령
      프롬프트)에 붙여넣고 엔터를 치시면 돼요. 복사를 누르면 그 글자가 복사됩니다.
    </p>
    <p class="desc" style="margin:0 0 14px">
      <b>automation</b> 폴더 안의 <b>시작하기</b> 파일을 두 번 눌러도 같은 일을 합니다.
    </p>

    ${[
      {
        title: '처음 한 번만 · 프로그램 준비',
        note: '받은 폴더에서 딱 한 번만 하면 돼요',
        cmd: 'cd automation\nnpm install\nnpm run setup',
      },
      {
        title: '계정마다 한 번만 · 로그인해 두기',
        note: '창이 뜨면 그 계정으로 로그인하고 닫으면 끝이에요',
        cmd: loginCmd,
      },
      {
        title: '올릴 때마다 · 연습해 보고 진짜로 올리기',
        note: '--dry 를 붙이면 등록만 빼고 똑같이 해봐요. 먼저 이걸로 확인해 보세요',
        cmd: `npm start -- "${target?.keyword ?? '원고'} 업로드.json" --dry\nnpm start -- "${target?.keyword ?? '원고'} 업로드.json"`,
      },
    ]
      .map(
        (step, index) => `<div class="cmd">
          <div class="cmdhead">
            <span class="chip blue">${index + 1}</span>
            <span class="txt"><b>${step.title}</b><span>${step.note}</span></span>
            <button class="btn sm" type="button" data-copy-cmd="${esc(step.cmd)}">복사</button>
          </div>
          <pre>${esc(step.cmd)}</pre>
        </div>`,
      )
      .join('')}`;

  document.querySelectorAll('[data-copy-cmd]').forEach((button) => {
    button.addEventListener('click', () => copy(button.dataset.copyCmd, '명령'));
  });

  el('btn-acct-file').onclick = () => {
    if (!accounts.length) {
      toast('계정을 먼저 추가해 주세요');

      return;
    }

    download('accounts.json', JSON.stringify({ version: 1, accounts }, null, 2));
    toast('automation 폴더에 넣어 주세요');
  };
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

  el('naver-count').textContent = `${accountList().length}개`;
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

    if (seg === 'scope') {
      store.settings.scope = value;
      persist();
      renderPublish();
    }

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

  // 확장이 깔려 있으면 업로드 화면이 단추로 바뀌어요.
  state.hasExtension = await cafeExtension();

  // 새로고침해도 올리던 것이 이어지고 있으면 진행 상황을 다시 보여줘요.
  if (state.hasExtension) {
    const now = await cafeStatus();

    if (now?.steps?.length) {
      const mark = (index) => {
        if (index < now.at) {
          return 'done';
        }

        return index === now.at ? 'now' : 'wait';
      };

      state.runLog = now.steps.map((step, index) => ({ ...step, at: mark(index) }));

      if (state.view === 'publish') {
        renderRunLog(now.dry);
      }
    }
  }

  onCafeEvent((event) => {
    /**
     * @param no
     * @param at
     * @param why
     */
    const mark = (no, at, why) => {
      const step = state.runLog.find((x) => x.no === no);

      if (step) {
        step.at = at;
        step.why = why;
      }
    };

    if (event.type === 'waiting' || event.type === 'doing') {
      state.runLog.forEach((step) => {
        if (step.at === 'now') {
          step.at = 'done';
        }
      });
      mark(event.no, 'now');
    }

    if (event.type === 'done-step') {
      mark(event.no, 'done');
    }

    if (event.type === 'needs-you') {
      mark(event.no, 'stuck', event.message);
      toast(event.message ?? '확인이 필요해요');

      // 왜 막혔는지 알려면 그 화면에 뭐가 있었는지가 필요해요.
      if (event.seen) {
        state.stuckSeen = event.seen;
      }
    }

    if (event.type === 'note') {
      state.runNote = event.message ?? '';
    }

    if (event.type === 'finished') {
      state.runLog.forEach((step) => {
        step.at = 'done';
      });
      toast(
        event.message ??
          (event.dry ? '연습이 끝났어요. 괜찮으면 업로드 시작을 눌러 주세요' : '다 올렸어요'),
      );
    }

    if (state.view === 'publish') {
      renderRunLog(false);
    }
  });

  window.addEventListener('resize', reserveForDock);

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
  const meta = response?.ok ? await response.json() : null;

  state.models = meta?.models ?? [];

  // 지금 어떤 판이 도는지 보여줍니다. 고친 게 반영됐는지 여기서 확인해요.
  if (meta?.build) {
    el('build-tag').textContent = meta.build;
  }

  const s = store.settings;

  el('f-mobile').checked = s.mobileShape;
  el('cnt-value').textContent = `${s.commentCount}개`;
  setSeg('tone', s.tone);
  setSeg('len', s.length);
  setSeg('set', 'new');
  setSeg('way', 'docs');
  setSeg('scope', store.settings.scope ?? 'all');

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
  el('btn-acct-add').addEventListener('click', () => {
    const name = el('f-acct').value.trim();

    if (!name) {
      toast('별칭을 적어 주세요');

      return;
    }

    store.settings.accounts = [
      ...accountList(),
      { alias: name, id: el('f-acct-id').value.trim(), pw: el('f-acct-pw').value },
    ];
    persist();
    el('f-acct').value = '';
    el('f-acct-id').value = '';
    el('f-acct-pw').value = '';
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
