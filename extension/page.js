/*
 * 카페 화면 안에서 손으로 하듯 하나씩 해주는 쪽.
 *
 * 이 파일의 `act` 는 통째로 카페 페이지 안에 넣어서 돌립니다. 그래서
 * 바깥 것을 하나도 못 써요. 필요한 건 전부 안에 적어 둡니다.
 *
 * 한 번 부르면 한 가지만 하고 바로 돌아옵니다. 기다리는 일은 전부
 * 바깥(background.js)에서 해요. 창을 최소화해 두면 페이지 안의 타이머가
 * 느려지기 때문에, 페이지 안에서는 기다리지 않는 게 안전합니다.
 *
 * 못 찾았을 때는 그 화면에 뭐가 있었는지도 같이 돌려줍니다.
 * 네이버가 화면을 바꿔도 그걸 보고 바로 고칠 수 있게요.
 * @param {{ what: string, text?: string }} job - 할 일과 넣을 글.
 * @returns {Record<string, any>} 됐는지, 안 됐으면 왜 안 됐는지.
 */
export function act(job) {
  const { what, text } = job ?? {};

  // 화면에 진짜로 보이는 것만. 스마트에디터는 화면 밖(-9999px)에 글자를 받아
  // 두는 숨은 칸을 두는데, 거기에 글을 넣으면 아무 데도 안 들어갑니다.
  const seen = (node) => {
    if (!node || node.getAttribute?.('aria-hidden') === 'true') {
      return false;
    }

    const box = node.getBoundingClientRect?.();

    if (!box) {
      return node.offsetParent !== null;
    }

    if (box.width < 12 || box.height < 8) {
      return false;
    }

    const wide = window.innerWidth || 1280;

    return box.right > 0 && box.left < wide + 400;
  };

  const words = (node) => (node.textContent ?? '').replace(/\s+/g, '');

  const label = (node) =>
    [
      node.getAttribute('placeholder'),
      node.getAttribute('aria-label'),
      node.getAttribute('data-placeholder'),
      node.getAttribute('title'),
    ]
      .filter(Boolean)
      .join(' ');

  const named = (node) => `${node.className || ''} ${node.id || ''}`;

  const writable = () =>
    [
      ...document.querySelectorAll(
        'textarea, input[type="text"], [contenteditable="true"], [contenteditable=""]',
      ),
    ].filter(seen);

  const size = (node) => {
    const box = node.getBoundingClientRect();

    return box.width * box.height;
  };

  const clickable = (within) =>
    [
      ...(within ?? document).querySelectorAll(
        'button, a, span[role="button"], div[role="button"], input[type="submit"]',
      ),
    ].filter(seen);

  // 칸 바로 옆에 적힌 안내말. 새 카페는 안내말을 칸 속성이 아니라
  // 옆에 글자로 그려 둬서, 그것도 같이 봐야 해요.
  const nearby = (node) => {
    let zone = node.parentElement;
    let words2 = '';

    for (let up = 0; up < 3 && zone; up += 1) {
      words2 += ` ${zone.textContent ?? ''}`.slice(0, 200);
      zone = zone.parentElement;
    }

    return words2;
  };

  const dump = () => ({
    url: window.location.href,
    frame: window.top === window ? '맨 위' : '안쪽 틀',
    page: document.title,
    // 화면에 뭐라고 쓰여 있는지 앞부분만. 「접속할 수 없습니다」 같은 말을 잡으려고요.
    said: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    boxes: writable()
      .map(
        (node) =>
          `${node.tagName.toLowerCase()}${node.isContentEditable ? '(글판)' : ''}[${
            label(node) || named(node).trim() || '이름 없음'
          }]{${nearby(node).replace(/\s+/g, ' ').trim().slice(0, 40)}}`,
      )
      .slice(0, 12),
    buttons: clickable()
      .map(words)
      .filter((one) => one && one.length <= 10)
      .slice(0, 24),
  });

  const button = (which, within) =>
    clickable(within).find((node) => {
      const one = words(node) || node.value || '';

      return one.length > 0 && one.length <= 10 && which.test(one);
    }) ?? null;

  const titleBox = () => {
    // 본문 편집기 안쪽은 제목이 아니에요.
    const outside = writable().filter(
      (node) => !node.closest('.se-viewer, .se-container, .se-content, .se-module-text'),
    );

    return (
      outside.find((node) => /제목/.test(label(node))) ??
      outside.find((node) => /제목을?\s*입력/.test(nearby(node))) ??
      outside.find((node) => /textarea_input|subject|title/i.test(named(node))) ??
      null
    );
  };

  const bodyBox = () => {
    // 스마트에디터 본문은 contenteditable 이 아니에요. 글을 넣는 칸이 아니라
    // 「글이 그려지는 자리」라서, 거기를 눌러 놓고 자판으로 쳐야 들어갑니다.
    const smart = [
      '.se-module-text',
      '.se-section-text',
      '[data-a11y-title="본문"] .se-component-content',
      '.se-text-paragraph',
    ]
      .map((one) => [...document.querySelectorAll(one)].filter(seen)[0])
      .find(Boolean);

    if (smart) {
      return smart;
    }

    const rich = writable().filter((node) => node.isContentEditable);
    // 스마트에디터는 se- 로 시작하는 틀 안에 있어요.
    const editor = rich.find((node) => node.closest('.se-viewer, .se-container, .se-content'));

    if (editor) {
      return editor;
    }

    // 없으면 화면에서 제일 큰 글판이 본문이에요.
    const biggest = rich.sort((one, two) => size(two) - size(one))[0];

    if (biggest && size(biggest) > 4000) {
      return biggest;
    }

    return (
      writable().find((node) => node.tagName === 'TEXTAREA' && /내용|본문/.test(label(node))) ??
      null
    );
  };

  const looksLikeComment = (node) =>
    /댓글|답글/.test(label(node)) || /cmt|comment|reply/i.test(named(node));

  // 답글을 열어 둔 자리가 있으면 그 안의 칸이 먼저예요.
  // 답글 칸은 그 댓글 안에 생기기도 하고 바로 아래에 생기기도 합니다.
  const replySpot = () => {
    const marked = document.querySelector('[data-nabi-reply="1"]');

    if (!marked) {
      return null;
    }

    const near = [marked, marked.nextElementSibling, marked.parentElement].filter(Boolean);

    for (const zone of near) {
      const found = [
        ...zone.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]'),
      ].filter(seen)[0];

      if (found) {
        return found;
      }
    }

    return null;
  };

  const commentBox = () =>
    replySpot() ??
    writable().find((node) => node.tagName === 'TEXTAREA' && looksLikeComment(node)) ??
    writable().find(looksLikeComment) ??
    null;

  // 「등록」이 화면에 여럿 있을 수 있어서, 글 쓰는 칸 가까이 있는 것을 먼저 봐요.
  const sendNear = (box) => {
    let zone = box?.parentElement ?? null;

    for (let up = 0; up < 6 && zone; up += 1) {
      const found = button(/^(등록|등록하기|확인|올리기|작성)$/, zone);

      if (found) {
        return found;
      }

      zone = zone.parentElement;
    }

    return null;
  };

  const put = (box, value) => {
    box.scrollIntoView({ block: 'center' });
    box.focus();
    box.click();

    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;

      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(box, value);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));

      return box.value.trim().length > 0;
    }

    // 글판은 붙여넣기로 넣어야 줄바꿈이 살아요.
    const clip = new DataTransfer();

    clip.setData('text/plain', value);
    box.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clip, bubbles: true, cancelable: true }),
    );

    if (words(box)) {
      return true;
    }

    // 붙여넣기를 안 받으면 한 줄씩 직접 쳐요.
    value.split('\n').forEach((line, index) => {
      if (index) {
        document.execCommand('insertParagraph');
      }

      if (line) {
        document.execCommand('insertText', false, line);
      }
    });

    return words(box).length > 0;
  };

  const no = (reason) => ({ ok: false, reason, ...dump() });

  if (what === 'look') {
    return { ok: true, ...dump() };
  }

  if (what === 'form?') {
    return { ok: Boolean(titleBox()), title: Boolean(titleBox()), body: Boolean(bodyBox()) };
  }

  if (what === 'comment?') {
    return { ok: Boolean(commentBox()) };
  }

  // 미리 점검. 이 화면에서 무엇을 찾을 수 있는지 그대로 알려줘요.
  if (what === 'check') {
    const box = commentBox();

    const written = [
      ...document.querySelectorAll(
        'li.CommentItem, .comment_list li, ul.comment_list > li, [class*="CommentItem"]',
      ),
    ].filter(seen);

    return {
      ok: true,
      title: Boolean(titleBox()),
      body: Boolean(bodyBox()),
      comment: Boolean(box),
      comments: written.length,
      // 댓글이 하나도 없으면 답글 단추가 있을 수가 없어요. 모르는 걸로 둡니다.
      reply: written.length ? Boolean(button(/^답글$/)) : null,
      send: Boolean(sendNear(box) ?? button(/^(등록|등록하기|확인|올리기)$/)),
      ...dump(),
    };
  }

  // 이 화면에서 글쓰기로 들어가는 링크를 찾아요. 단추를 누르는 것보다 확실합니다.
  if (what === 'write-link') {
    const link = [...document.querySelectorAll('a[href]')]
      .map((node) => node.href)
      .find((href) => /\/articles\/write|ArticleWrite|WriteForm/i.test(href));

    return link ? { ok: true, url: link } : { ok: false, reason: '글쓰기 링크가 없어요' };
  }

  // 페이지 안에 적힌 카페 번호와 게시판 번호를 찾아요. 주소로 못 읽었을 때 씁니다.
  if (what === 'ids') {
    const all = document.documentElement.innerHTML;

    const clubId =
      all.match(/"cafeId"\s*:\s*"?(\d+)/)?.[1] ??
      all.match(/"clubId"\s*:\s*"?(\d+)/)?.[1] ??
      all.match(/g_sClubId\s*=\s*"(\d+)"/)?.[1] ??
      all.match(/clubid[=:]"?(\d+)/i)?.[1] ??
      '';

    const menuId =
      window.location.href.match(/\/menus\/(\d+)/)?.[1] ??
      all.match(/"menuId"\s*:\s*"?(\d+)/)?.[1] ??
      all.match(/menuid[=:]"?(\d+)/i)?.[1] ??
      '';

    return clubId ? { ok: true, clubId, menuId } : { ok: false, reason: '카페 번호를 못 찾았어요' };
  }

  // 게시판에서 글 하나를 골라 그 주소를 알려줘요. 댓글 자리를 보려고요.
  if (what === 'first-article') {
    const link = [...document.querySelectorAll('a[href*="/articles/"]')]
      .filter(seen)
      .map((node) => node.href)
      .find((href) => /\/articles\/\d+/.test(href));

    return link ? { ok: true, url: link } : { ok: false, reason: '글 목록에서 글을 못 찾았어요' };
  }

  // 그 자리를 눌러서 글 칠 준비만 해요. 글자는 바깥에서 자판으로 칩니다.
  // 스마트에디터는 값을 넣는 게 아니라 사람이 치는 걸 받아야 들어가거든요.
  if (what === 'focus') {
    const which = { title: titleBox, body: bodyBox, comment: commentBox }[text] ?? titleBox;
    const box = which();

    if (!box) {
      return no(`${text} 칸을 못 찾았어요`);
    }

    box.scrollIntoView({ block: 'center' });
    box.click();
    box.focus?.();

    // 바깥에서 「진짜 마우스」로 다시 누를 수 있게 표를 달아 둬요.
    document
      .querySelectorAll('[data-nabi-spot]')
      .forEach((one) => one.removeAttribute('data-nabi-spot'));
    box.setAttribute('data-nabi-spot', '1');

    // 스마트에디터는 화면 밖에 숨겨 둔 틀이 글자를 받아요. 거기로도 넘겨 봅니다.
    let buffer = '';

    const hidden = [...document.querySelectorAll('iframe')].find((one) =>
      /input_buffer|스마트\s*에디터/.test(`${one.id} ${one.title}`),
    );

    if (hidden) {
      try {
        hidden.contentWindow.focus();
        hidden.contentDocument?.body?.focus();
        buffer = hidden.id || '(이름 없음)';
      } catch {
        buffer = '(못 들어감)';
      }
    }

    const at = box.getBoundingClientRect();

    return {
      ok: true,
      spot: '[data-nabi-spot="1"]',
      buffer,
      landed: document.activeElement?.tagName ?? '',
      at: {
        x: Math.round(at.left + at.width / 2),
        y: Math.round(at.top + Math.min(at.height / 2, 40)),
      },
      tag: `${box.tagName.toLowerCase()}.${(box.className || '').split(' ')[0]}`,
    };
  }

  // 그 칸에 지금 뭐가 들어 있나. 제대로 들어갔는지 확인하려고요.
  if (what === 'read') {
    const which = { title: titleBox, body: bodyBox, comment: commentBox }[text] ?? titleBox;
    const box = which();

    if (!box) {
      return no(`${text} 칸을 못 찾았어요`);
    }

    const got = box.value ?? box.innerText ?? box.textContent ?? '';

    return { ok: true, text: got.replace(/\s+/g, ' ').trim().slice(0, 120), long: got.length };
  }

  if (what === 'title') {
    const box = titleBox();

    if (!box) {
      return no('제목 칸을 못 찾았어요');
    }

    return put(box, text) ? { ok: true } : no('제목이 안 들어가요');
  }

  if (what === 'body') {
    const box = bodyBox();

    if (!box) {
      return no('본문 칸을 못 찾았어요');
    }

    return put(box, text) ? { ok: true } : no('본문이 안 들어가요');
  }

  if (what === 'comment') {
    const box = commentBox();

    if (!box) {
      return no('댓글 칸을 못 찾았어요');
    }

    return put(box, text) ? { ok: true } : no('댓글이 안 들어가요');
  }

  if (what === 'open-reply') {
    const items = [
      ...document.querySelectorAll(
        'li.CommentItem, .comment_list li, ul.comment_list > li, [class*="CommentItem"]',
      ),
    ].filter(seen);

    // 달려는 댓글의 글자로 그 자리를 찾아요. 못 찾으면 맨 끝 댓글.
    const want = (text ?? '').replace(/\s+/g, '').slice(0, 20);
    const mine = want ? items.filter((node) => words(node).includes(want)) : [];
    const spot = mine[mine.length - 1] ?? items[items.length - 1];

    if (!spot) {
      return no('댓글을 하나도 못 찾았어요');
    }

    const reply = button(/^답글$/, spot);

    if (!reply) {
      return no('답글 단추를 못 찾았어요');
    }

    // 다음 부름에서 이 자리를 알아볼 수 있게 표시해 둬요.
    document
      .querySelectorAll('[data-nabi-reply]')
      .forEach((node) => node.removeAttribute('data-nabi-reply'));
    spot.setAttribute('data-nabi-reply', '1');
    reply.click();

    return { ok: true };
  }

  if (what === 'submit') {
    // 댓글이면 그 칸 가까이 있는 등록을, 없으면 화면 전체에서 찾아요.
    const send =
      (text === 'comment' ? sendNear(commentBox()) : null) ??
      button(/^(등록|등록하기|확인|올리기)$/);

    if (!send) {
      return no('등록 단추를 못 찾았어요');
    }

    send.click();

    return { ok: true };
  }

  return no(`모르는 일이에요: ${what}`);
}
