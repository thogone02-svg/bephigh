/**
 * Read the writing habits out of the saved manuscripts.
 *
 * This runs in the browser and costs nothing, so it can look at the whole
 * library instead of the handful of manuscripts that fit in a prompt.
 * The result is a short card the model reads before writing, which is why
 * the output keeps getting closer to the real thing as more files go in.
 */

/** Sentence endings worth counting, longest first so the longest match wins. */
const ENDINGS = [
  '더라고요',
  '더라구요',
  '하더라고요',
  '거든요',
  '았어요',
  '었어요',
  '겠어요',
  '같아요',
  '던데요',
  '드라고요',
  '습니다',
  '입니다',
  '합니다',
  '했어요',
  '봤어요',
  '네요',
  '해요',
  '에요',
  '예요',
  '아요',
  '어요',
  '구요',
  '고요',
  '까요',
  '나요',
  '죠',
];

const FACES = /(ㅎㅎ+|ㅋㅋ+|ㅜㅜ+|ㅠㅠ+|ㅡㅡ|\.\.+|~+)/g;

/**
 * Split text into sentences, treating line breaks as breaks too.
 * @param {string} text - Text to split.
 * @returns {string[]} Sentences.
 */
const sentences = (text) =>
  String(text ?? '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Find the ending a sentence uses, ignoring trailing punctuation and emoticons.
 * @param {string} sentence - One sentence.
 * @returns {string | null} Ending, or null when it is not one we track.
 */
const endingOf = (sentence) => {
  const bare = sentence.replace(FACES, '').replace(/[.!?…\s]+$/, '');

  return ENDINGS.find((ending) => bare.endsWith(ending)) ?? null;
};

/**
 * Average a list of numbers, rounded.
 * @param {number[]} numbers - Values.
 * @param {number} [digits] - Decimal places.
 * @returns {number} Average, or 0 when the list is empty.
 */
const mean = (numbers, digits = 0) => {
  if (!numbers.length) {
    return 0;
  }

  const total = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;

  return Number(total.toFixed(digits));
};

/**
 * Share of a list that passes a test, as a percentage.
 * @param {any[]} list - Items.
 * @param {(item: any) => boolean} test - Test.
 * @returns {number} Percentage 0-100.
 */
const share = (list, test) =>
  list.length ? Math.round((list.filter(test).length / list.length) * 100) : 0;

/**
 * Count how often each sentence ending shows up across the library.
 * @param {string[]} bodies - Manuscript bodies.
 * @returns {{ ending: string, percent: number }[]} Endings, most used first.
 */
const endingMix = (bodies) => {
  const counts = new Map();
  let total = 0;

  bodies.forEach((body) => {
    sentences(body).forEach((sentence) => {
      const ending = endingOf(sentence);

      if (ending) {
        counts.set(ending, (counts.get(ending) ?? 0) + 1);
        total += 1;
      }
    });
  });

  if (!total) {
    return [];
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ending, count]) => ({ ending, percent: Math.round((count / total) * 100) }));
};

/**
 * Measure the library and write it up as a short card for the prompt.
 * @param {any[]} library - Saved manuscripts, already filtered to the ones to learn from.
 * @returns {string} Prompt block, or an empty string when there is nothing to learn from.
 */
export function styleCard(library) {
  const entries = (library ?? []).filter((item) => item?.body);

  if (entries.length < 2) {
    return '';
  }

  const bodies = entries.map((item) => String(item.body));
  const titles = entries.map((item) => String(item.title ?? ''));

  const paragraphs = bodies.flatMap((body) =>
    body
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean),
  );

  const comments = entries.flatMap((item) => item.comments ?? []);
  const turns = comments.map((comment) => (comment.thread ?? []).length);

  const commentTexts = comments.flatMap((comment) =>
    (comment.thread ?? []).map((turn) => String(turn.text ?? '')),
  );

  const faceRate = mean(
    bodies.map((body) => ((body.match(FACES) ?? []).length / Math.max(1, body.length)) * 100),
    1,
  );

  const lines = [
    `<말투 카드 — 보관함 원고 ${entries.length}개에서 뽑았습니다>`,
    '이건 담당자가 실제로 쓰는 습관입니다. 숫자에 맞춰 쓰세요.',
    '',
    '[제목]',
    `- 평균 ${mean(titles.map((t) => t.length))}자`,
    `- 괄호 쓰는 비율 ${share(titles, (t) => /[(（]/.test(t))}%`,
    `- 숫자 들어가는 비율 ${share(titles, (t) => /\d/.test(t))}%`,
    `- 물음표로 끝나는 비율 ${share(titles, (t) => t.trim().endsWith('?'))}%`,
    '',
    '[본문]',
    `- 평균 ${mean(bodies.map((b) => b.replace(/\s/g, '').length))}자 (공백 제외)`,
    `- 문단 ${mean(bodies.map((b) => b.split(/\n{2,}/).filter((x) => x.trim()).length))}개`,
    `- 한 문단 ${mean(
      paragraphs.map((p) => p.split('\n').length),
      1,
    )}줄`,
    `- 한 문장 ${mean(bodies.flatMap((b) => sentences(b).map((s) => s.length)))}자`,
    `- [소제목] 쓰는 원고 ${share(bodies, (b) => /\[[^\]]+\]/.test(b))}%`,
    `- 불릿(-) 쓰는 원고 ${share(bodies, (b) => /^\s*[-·•]/m.test(b))}%`,
    `- ㅎㅎ ㅋㅋ ㅜㅜ ~ .. 같은 표시가 100자당 ${faceRate}번`,
    '',
    '[자주 쓰는 어미]',
    ...endingMix(bodies).map((e) => `- ~${e.ending} ${e.percent}%`),
    '이 비율대로 섞으세요. 한 어미만 반복하면 안 됩니다.',
    '',
    '[댓글]',
    `- 원고당 ${mean(
      entries.map((item) => (item.comments ?? []).length),
      1,
    )}개`,
    `- 한 줄 평균 ${mean(commentTexts.map((t) => t.length))}자`,
    `- 물음표로 끝나는 비율 ${share(commentTexts, (t) => t.trim().endsWith('?'))}%`,
    `- 티키타카 평균 ${mean(turns, 1)}턴, 제일 긴 게 ${Math.max(0, ...turns)}턴`,
    '</말투 카드>',
  ];

  return lines.join('\n');
}

/**
 * Rank the library so the manuscripts closest to this keyword go into the prompt.
 *
 * As the library grows this matters more than how many get sent: three
 * manuscripts on a related keyword teach more than ten unrelated ones.
 * @param {any[]} library - Saved manuscripts to learn from.
 * @param {string} keyword - Keyword being written about.
 * @param {number} [take] - How many to send.
 * @returns {any[]} Chosen manuscripts, closest first.
 */
export function pickReferences(library, keyword, take = 3) {
  const words = String(keyword ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 1);

  return (library ?? [])
    .filter((item) => item?.body)
    .map((item) => {
      const name = String(item.keyword ?? '');
      const hits = words.filter((word) => name.includes(word)).length;
      const same = name === String(keyword ?? '').trim() ? 60 : 0;

      return { item, score: same + hits * 20 + Math.min(10, item.uses ?? 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((row) => row.item);
}

/**
 * Say in one line how much the library can teach right now.
 *
 * The learning happens out of sight, so this is what makes it visible:
 * put more files in, watch the line change.
 * @param {any[]} library - Manuscripts marked for learning.
 * @returns {string} One line for the library header.
 */
export function learnedFrom(library) {
  const entries = (library ?? []).filter((item) => item?.body);

  if (entries.length < 2) {
    return '2개부터 말투를 배워요';
  }

  const endings = endingMix(entries.map((item) => String(item.body))).length;

  if (entries.length < 5) {
    return `말투를 배우는 중이에요 (${endings}가지 어미)`;
  }

  return `말투를 잘 배웠어요 (${endings}가지 어미)`;
}
