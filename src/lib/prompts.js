import { AUTHOR } from './manuscript.js';

/** Length targets for the body, in characters excluding spaces. */
const LENGTH = { short: '700~1,000자', medium: '1,100~1,500자', long: '1,600~2,200자' };

/**
 * Build the system prompt that defines the writer.
 * @param {boolean} mobileShape - Whether to write in the tall mobile shape.
 * @returns {string} System prompt.
 */
export const systemPrompt = (mobileShape) =>
  [
    '당신은 네이버 카페 바이럴 원고를 오래 써 온 한국어 카피라이터입니다.',
    '실제 카페 회원이 쓴 것처럼 읽히는 제목·본문과, 그 글에 달릴 댓글 세트를 함께 만듭니다.',
    '',
    '## 본문',
    '1. 광고 문구를 나열하지 말고 상황 → 고민 → 알아본 것 → 직접 겪은 것 → 정리 흐름으로 씁니다.',
    '2. 핵심 키워드는 제목에 1회, 본문에 3~5회만 자연스럽게 넣습니다. 억지로 반복하지 않습니다.',
    '3. "완치", "부작용 없음", "100% 보장", "최저가" 같은 단정·과장 표현은 쓰지 않습니다.',
    '4. 효과는 단정하지 말고 개인차가 있다는 뉘앙스를 남깁니다. 심하면 병원에 가보라는 말을 덧붙입니다.',
    '5. "ㅎㅎ", "ㅋㅋ", "ㅜㅜ", "~", ".." 같은 표현은 자연스럽게 씁니다. 이모지는 쓰지 않습니다.',
    '6. 필요하면 본문 중간에 "[소제목]" 한 줄과 "- 항목" 목록을 넣어 정리합니다.',
    mobileShape
      ? '7. 한 문단은 2~3줄까지만 쓰고 문단마다 빈 줄을 둡니다. 문장이 길면 문장 안에서도 줄을 바꿉니다.'
      : '7. 문단을 길게 묶어 씁니다.',
    '',
    '## 댓글 세트',
    '1. 댓글마다 다른 사람이 쓴 것처럼 말투와 길이를 다르게 합니다.',
    '2. 한 세트에 질문형, 공감형, 경험 공유형, 추천·문의 유도형을 섞습니다.',
    '3. 댓글은 1~3문장으로 짧게 씁니다. 본문 문장을 그대로 베끼지 않습니다.',
    `4. 티키타카는 댓글 → ${AUTHOR} → 댓글 순으로 주고받습니다. 지정된 턴 수를 정확히 지킵니다.`,
    '5. 화자 이름이나 나이·직업 같은 페르소나 설명은 쓰지 않습니다.',
    '',
    '## 출력 형식',
    '아래 형식만 사용합니다. 설명, 인사말, 코드블록을 붙이지 않습니다.',
    '',
    '제목: 제목 한 줄',
    '',
    '본문 전체',
    '',
    '댓글1',
    '첫 번째 사람이 단 댓글',
    `ㄴ ${AUTHOR}`,
    '글쓴이가 단 답글',
    'ㄴ 댓글1',
    '같은 사람이 다시 단 댓글',
    '',
    '댓글2',
    '두 번째 사람이 단 댓글',
  ].join('\n');

/**
 * Render one reference manuscript as a prompt block.
 * @param {{ keyword?: string, title?: string, body?: string,
 *   comments?: { thread?: { by: string, text: string }[] }[] }} doc - Reference manuscript.
 * @param {number} order - Zero based position.
 * @returns {string} Prompt block.
 */
const renderReference = (doc, order) => {
  const comments = (doc.comments ?? [])
    .map((comment, index) =>
      [
        `댓글${index + 1}`,
        ...(comment.thread ?? []).map((turn, position) =>
          position === 0
            ? turn.text
            : `ㄴ ${turn.by === 'author' ? AUTHOR : `댓글${index + 1}`}\n${turn.text}`,
        ),
      ].join('\n'),
    )
    .join('\n\n');

  return [
    `<참고원고 ${order + 1}${doc.keyword ? ` 키워드="${doc.keyword}"` : ''}>`,
    `제목: ${doc.title ?? ''}`,
    (doc.body ?? '').slice(0, 3000),
    comments,
    '</참고원고>',
  ]
    .filter(Boolean)
    .join('\n');
};

/**
 * Build the user prompt for a first draft.
 * @param {Record<string, any>} options - Options collected from the generate screen.
 * @param {any[]} [references] - Reference manuscripts used for style.
 * @returns {string} User prompt.
 */
export const generatePrompt = (options, references = []) => {
  const {
    keyword,
    brand = '',
    product = '',
    request = '',
    avoid = '',
    tone = '후기형',
    length = 'medium',
    commentCount = 4,
    turns = {},
    keepComments = null,
  } = options;

  const turnPlan = Array.from({ length: commentCount }, (_, index) => {
    const fallback = [3, 5][index] ?? 1;
    const count = Number(turns[index + 1] ?? fallback);

    return `댓글${index + 1}: ${count}턴`;
  }).join(' / ');

  return [
    references.length
      ? [
          '아래는 같은 담당자가 전에 쓴 원고입니다.',
          '문장 길이, 줄바꿈 습관, 자주 쓰는 어미, 댓글 호흡을 그대로 흉내 내되 내용은 베끼지 마세요.',
          '',
          references.slice(0, 4).map(renderReference).join('\n\n'),
        ].join('\n')
      : '',
    '<요청서>',
    `핵심 키워드: ${keyword}`,
    brand ? `브랜드: ${brand}` : '',
    product ? `제품: ${product}` : '',
    `글 성격: ${tone}`,
    `본문 분량: 공백 제외 ${LENGTH[length] ?? LENGTH.medium}`,
    `댓글 개수: ${commentCount}개`,
    `티키타카 턴 수: ${turnPlan}`,
    request ? `요청사항: ${request}` : '',
    avoid ? `쓰지 않을 표현: ${avoid}` : '',
    '</요청서>',
    keepComments
      ? [
          '<그대로 쓸 댓글>',
          keepComments,
          '</그대로 쓸 댓글>',
          '위 댓글 세트는 한 글자도 바꾸지 말고 그대로 다시 출력하세요. 제목과 본문만 새로 씁니다.',
        ].join('\n')
      : '',
    `위 요청서대로 제목, 본문, 댓글 ${commentCount}개를 써 주세요.`,
  ]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * Build the user prompt for a follow-up version that only rewrites requested parts.
 * @param {Record<string, any>} options - Options collected from the generate screen.
 * @param {string} current - Current manuscript, rendered as text.
 * @param {Record<string, string>} instructions - Revision notes keyed by `title`, `body`, `c1`….
 * @returns {string} User prompt.
 */
export const revisePrompt = (options, current, instructions) => {
  const asked = Object.entries(instructions)
    .filter(([, value]) => String(value ?? '').trim())
    .map(([part, value]) => {
      const labels = { title: '제목', body: '본문' };
      const label = labels[part] ?? `댓글${part.slice(1)}`;

      return `- ${label}: ${String(value).trim()}`;
    });

  return [
    '<요청서>',
    `핵심 키워드: ${options.keyword}`,
    options.brand ? `브랜드: ${options.brand}` : '',
    options.product ? `제품: ${options.product}` : '',
    options.request ? `요청사항: ${options.request}` : '',
    '</요청서>',
    '<현재원고>',
    current,
    '</현재원고>',
    '<고칠 곳>',
    asked.length ? asked.join('\n') : '- 전체: 전반적으로 더 자연스럽게 다듬어 주세요.',
    '</고칠 곳>',
    [
      '고칠 곳으로 지정된 부분만 새로 씁니다.',
      '지정되지 않은 부분은 현재 원고의 문장을 한 글자도 바꾸지 말고 그대로 다시 출력합니다.',
      '댓글 개수와 티키타카 턴 수는 그대로 유지합니다. 출력 형식도 동일하게 씁니다.',
    ].join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
};
