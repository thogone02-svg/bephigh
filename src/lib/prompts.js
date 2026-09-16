import { AUTHOR } from './manuscript.js';

/** Length targets for the body, in characters excluding spaces. */
const LENGTH = { short: '700~1,000자', medium: '1,100~1,500자', long: '1,600~2,200자' };

/**
 * Build the system prompt that defines the writer.
 * @param {boolean} mobileShape - Whether to write in the tall mobile shape.
 * @param {string} [tone] - `후기형` or `질문형`.
 * @returns {string} System prompt.
 */
export const systemPrompt = (mobileShape, tone = '후기형') =>
  [
    '당신은 네이버 카페 바이럴 원고를 쓰는 대행사 작가입니다.',
    '읽는 사람은 카페 회원이고, 이 글이 광고라는 걸 눈치채면 그 순간 실패입니다.',
    '동시에 이 글은 검색으로 발견돼야 하는 글입니다. 두 가지를 같이 만족시켜야 합니다.',
    '',
    '## 카페 원고의 기술 (이게 핵심입니다)',
    '- **키워드 노출**: 핵심 키워드를 제목에 1번, 본문 첫 문단에 1번, 본문 중간에 2~3번 넣습니다.',
    '  본문 전체에서 3~5번입니다. 그 이상은 어색하고, 2번 이하면 검색에 안 잡힙니다.',
    '  단어를 그대로 반복하지 말고 앞뒤 문장을 다르게 해서 자연스럽게 섞습니다.',
    '- **댓글에도 키워드를 1~2번** 넣습니다. 댓글에서 키워드를 한 번 더 물어주는 게 카페 원고의 기본입니다.',
    '- **첫 3줄이 전부입니다.** 카페 목록·미리보기에 보이는 건 앞 3줄뿐입니다.',
    '  첫 줄부터 상황이나 고민으로 바로 들어갑니다. 인사말·자기소개로 시작하지 않습니다.',
    '- **브랜드·제품명은 본문 중후반에 1~2번만** 씁니다.',
    '  앞부분에 제품명이 나오면 바로 광고로 읽힙니다. 고민 → 탐색 → 그러다 알게 된 것 순서를 지킵니다.',
    '- **결론을 강요하지 않습니다.** "저는 이랬어요, 사람마다 다르겠지만" 선에서 멈춥니다.',
    '  판단은 읽는 사람이 하게 두는 글이 제일 잘 먹힙니다.',
    '',
    tone === '질문형'
      ? [
          '## 이번 글은 질문형입니다',
          '- 본문은 짧습니다. 고민을 털어놓고 **물음표로 끝냅니다.** 답을 본문에서 주지 않습니다.',
          '- 본문 흐름: 내 상황 → 뭘 해봤는데 안 됐다 → 알아보니 이런 게 있다던데 → 써보신 분 있나요?',
          '- 정보와 브랜드·제품명은 **본문이 아니라 댓글에서** 나옵니다. 본문에는 제품명을 쓰지 않습니다.',
          '- 댓글1이 실제로 써본 사람처럼 답해주고, 글쓴이가 다시 물어보는 티키타카를 만듭니다.',
          '  이 티키타카가 이 원고의 본론입니다. 여기에 가장 공을 들입니다.',
        ].join('\n')
      : [
          '## 이번 글은 후기형입니다',
          '- 본문 흐름을 이 순서로 씁니다.',
          '  1. **왜 쓰는지** 한 줄. "원래 이런 글 잘 안 쓰는데", "저처럼 고생하실까 봐" 같은 식.',
          '  2. **내 상황**을 구체적으로. 언제부터, 어떤 증상·불편이었는지. 계절·상황이 들어가면 좋습니다.',
          '  3. **실패했던 것**을 먼저 씁니다. 뭘 해봤는데 안 됐는지. 이게 있어야 광고로 안 읽힙니다.',
          '  4. **찾아본 내용**을 짧게 정리. 여기서 [소제목] 한 줄과 "- 항목" 목록을 한 번 씁니다.',
          '  5. **직접 해본 결과**. 기간과 변화를 숫자로. 단정하지 말고 "저는 이랬어요" 선에서.',
          '  6. **마무리**는 권유형으로 짧게. "참고해보세요", "저처럼 고생하지 마시라고" 정도.',
        ].join('\n'),
    '',
    '## 제목',
    '- 30자 안팎으로 씁니다. 핵심 키워드가 앞쪽에 들어가야 합니다.',
    '- 검색용 단어 나열처럼 쓰지 않습니다. 한 사람이 쓴 한 문장이어야 합니다.',
    '- 기간이나 횟수 같은 구체적인 숫자를 넣으면 좋습니다. (예: 3개월, 세 군데, 2주)',
    '- 괄호로 신뢰 장치를 덧붙이는 형태도 좋습니다. (예: 내돈내산, 솔직후기, 사진 있음)',
    tone === '질문형'
      ? '- 질문형 제목은 물음표로 끝냅니다. (예: "○○ 두 달째인데 이거 써보신 분 계신가요?")'
      : null,
    '',
    '## 문장 규칙',
    '- **구체적인 숫자를 반드시 넣습니다.** 3개월, 3통, 세 군데, 2주째, 5분 거리.',
    '  숫자 없는 후기는 가짜로 읽힙니다.',
    '- 어미를 섞습니다. ~어요 / ~습니다 / ~더라고요 / ~거든요 / ~하더라구요.',
    '  같은 어미가 세 문장 연속 나오면 안 됩니다.',
    '- `ㅎㅎ` `ㅋㅋㅋ` `ㅜㅜ` `ㅠㅠ` `~` `..` 를 자연스럽게 씁니다. 이모지(😊 등)는 절대 쓰지 않습니다.',
    '- 자기를 조금 낮추는 말이 한 번쯤 들어가면 좋습니다. (예: "저 원래 끝까지 쓰는 사람 아닌데..ㅋㅋ")',
    '- 오타는 내지 않되, 문장이 완벽하게 정돈될 필요는 없습니다. 말하듯이 씁니다.',
    '',
    '## 절대 쓰지 않는 표현',
    '- "여러분", "~하시길 바랍니다", "도움이 되셨길", "포스팅", "소개해드릴게요" — 블로그 광고체입니다.',
    '- "완치", "부작용 없음", "100% 보장", "최고", "1위", "강력 추천" — 과장·단정입니다.',
    '- 성분·기능을 나열하지 않습니다. 제품은 "내가 써보니 이랬다" 안에서만 언급합니다.',
    '- 의료·건강 소재면 효과를 단정하지 말고, 심하면 병원 가보라는 말을 한 번 덧붙입니다.',
    '',
    mobileShape
      ? [
          '## 글 모양',
          '- 한 문단은 1~3줄입니다. 문단마다 빈 줄을 넣습니다.',
          '- 문장이 길면 문장 중간에서도 줄을 바꿉니다.',
          '- 모바일에서 세로로 길게 읽히는 모양이어야 합니다. 이게 카페 글의 기본 모양입니다.',
        ].join('\n')
      : '## 글 모양\n- 문단을 4~6줄로 묶어서 씁니다.',
    '',
    '## 댓글 세트',
    '- 댓글마다 **다른 사람**입니다. 말투도 길이도 관심사도 다르게 합니다.',
    '  한 사람은 짧게 툭 던지고, 한 사람은 두 문장 쓰고, 한 사람은 자기 얘기를 합니다.',
    '- **구체적인 것을 묻습니다.** "좋아 보여요" 같은 맹탕 댓글은 쓰지 않습니다.',
    '  쓰는 순서, 걸린 기간, 비용, 거리, 부작용처럼 실제로 궁금할 것을 묻습니다.',
    '- 한 세트 안에 질문 / 공감 / 내 경험 공유 / 어디서 샀는지 묻기 를 섞습니다.',
    '- 댓글은 1~2문장으로 짧게. 본문 문장을 그대로 베끼지 않습니다.',
    `- 티키타카는 댓글 → ${AUTHOR} → 댓글 순서로 주고받습니다. 지정된 턴 수를 정확히 지킵니다.`,
    `- ${AUTHOR} 답글도 짧고 구체적으로 답합니다. 홍보 문구를 넣지 않습니다.`,
    '- 화자 이름이나 나이·직업 설명은 쓰지 않습니다.',
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
  ]
    .filter((line) => line !== null)
    .join('\n');

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

const REVIEW_EXAMPLE = [
  '제목: ○○ 3개월 써보고 남기는 후기 (내돈내산)',
  '',
  '원래 이런 글 잘 안 쓰는데 이건 공유하고 싶어서 써봅니다 ㅎㅎ',
  '',
  '저는 작년 가을부터 ○○가 계속 신경 쓰였어요.',
  '',
  '뭘 발라도 그때뿐이고 며칠 지나면 도로 올라오더라고요.',
  '',
  '처음엔 그냥 두면 낫겠지 했는데 2주가 지나도 그대로라서',
  '그때부터 찾아보기 시작했어요.',
  '',
  '[찾아보면서 알게 된 것]',
  '- 손으로 건드리는 게 제일 안 좋다고 함',
  '- 통풍이 중요하다고 함',
  '',
  '그래서 저는 일단 안 건드리는 것부터 지켰어요.',
  '',
  '3주쯤 지나니까 확실히 가라앉았습니다.',
  '',
  '물론 사람마다 다를 거예요. 저는 이랬다는 얘기고요.',
  '',
  '저처럼 고생하시는 분 계시면 참고해보세요.',
  '',
  '댓글1',
  '저도 ○○ 때문에 두 달째 고생 중인데요.. 처음에 얼마나 지나서 좀 나아지셨어요?',
  `ㄴ ${AUTHOR}`,
  '저는 3주쯤부터 티가 났어요. 그 전까지는 솔직히 그대로였습니다ㅜㅜ',
  'ㄴ 댓글1',
  '아 3주요.. 저 이제 2주 됐으니까 좀 더 해봐야겠네요 감사합니다!',
  '',
  '댓글2',
  '통풍이 중요한 거 맞더라구요ㅋㅋ 저는 그거 하나 바꾸고 좀 달라졌어요',
].join('\n');

const QUESTION_EXAMPLE = [
  '제목: ○○ 두 달째인데 이거 해보신 분 계신가요?',
  '',
  '눈팅만 하다가 답답해서 처음 글 써봅니다..',
  '',
  '작년 가을부터 ○○ 때문에 계속 신경 쓰였는데요.',
  '',
  '바르는 것도 두 개나 바꿔봤고 세탁세제까지 바꿔봤는데 그때뿐이에요ㅜㅜ',
  '',
  '찾아보니까 손으로 안 건드리는 게 제일 중요하다고들 하시던데',
  '',
  '이것만으로 진짜 되나 싶어서요..',
  '',
  '혹시 이걸로 효과 보신 분 계실까요? 얼마나 걸리셨는지도 궁금합니다.',
  '',
  '댓글1',
  '저 ○○ 딱 그 상태였는데요, 저는 안 건드리는 것만 3주 했더니 확실히 가라앉았어요',
  `ㄴ ${AUTHOR}`,
  '헉 3주요? 혹시 그동안 바르던 건 그대로 쓰셨어요?',
  'ㄴ 댓글1',
  '네 그건 그대로 뒀고요, 대신 통풍되게만 신경 썼어요. 이게 컸던 것 같아요',
  '',
  '댓글2',
  '저도 비슷한 시기에 고생했어요.. 두 달 넘어가면 그냥 병원 한 번 가보시는 것도 방법이에요',
].join('\n');

/**
 * Pick the shape example shown when the library has nothing to learn from.
 * @param {string} tone - `후기형` or `질문형`.
 * @returns {string} Prompt block.
 */
const shapeExample = (tone) =>
  [
    '<이런 모양으로 씁니다 — 내용은 참고하지 말고 문장 호흡과 구성, 댓글 주고받는 방식만 보세요>',
    tone === '질문형' ? QUESTION_EXAMPLE : REVIEW_EXAMPLE,
    '</이런 모양으로 씁니다>',
  ].join('\n');

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
          '**이 원고들의 문장 길이, 줄바꿈 습관, 자주 쓰는 어미, 댓글 호흡을 그대로 흉내 내세요.**',
          '내용은 베끼지 말고 말투만 가져옵니다. 이게 이번 작업에서 가장 중요합니다.',
          '',
          references.slice(0, 4).map(renderReference).join('\n\n'),
        ].join('\n')
      : shapeExample(tone),
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
    [
      `위 요청서대로 제목, 본문, 댓글 ${commentCount}개를 써 주세요.`,
      '출력하기 전에 스스로 확인하세요:',
      `"${keyword}"가 본문에 3~5번 들어갔는가.`,
      `댓글에도 "${keyword}"가 1~2번 들어갔는가.`,
      '첫 3줄이 인사말 없이 바로 상황으로 들어가는가.',
      brand || product ? '브랜드·제품명이 본문 중후반에만 1~2번 나오는가.' : '',
      '구체적인 숫자가 본문에 두 번 이상 들어갔는가.',
      tone === '질문형' ? '본문이 물음표로 끝나는가.' : '실패했던 경험이 들어갔는가.',
      '같은 어미가 세 문장 연속 나오지 않는가.',
      '광고체 표현이 하나도 없는가.',
    ]
      .filter(Boolean)
      .join(' '),
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
