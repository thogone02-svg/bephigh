import { AUTHOR } from './manuscript.js';

/** Length targets for the body: characters excluding spaces, and paragraph count. */
const LENGTH = {
  short: { chars: '700~1,000자', blocks: '8~12문단' },
  medium: { chars: '1,100~1,500자', blocks: '13~18문단' },
  long: { chars: '1,600~2,200자', blocks: '19~26문단' },
};

/**
 * Build the system prompt that defines the writer.
 *
 * 여기 있는 건 원고마다 바뀌지 않는 규칙만입니다. 이번 글에만 해당하는 지시는
 * 사용자 프롬프트로 보냅니다. 그래야 회사 쪽에서 이 부분을 재활용(캐시)해서
 * 값이 싸지고, 같은 규칙이 흔들리지 않아요.
 * @param {boolean} mobileShape - Whether to write in the tall mobile shape.
 * @param {string} [tone] - `후기형` or `질문형`.
 * @returns {string} System prompt.
 */
export const systemPrompt = (mobileShape, tone = '후기형') =>
  [
    '당신은 네이버 카페에 올릴 글의 초안을 쓰는 카피라이터입니다.',
    '담당자가 이 초안을 검토하고, 필요한 표기를 붙여서 올립니다.',
    '',
    '목표는 하나입니다. **카페 회원이 직접 쓴 글로 읽혀야 합니다.**',
    '광고로 읽히면 아무리 잘 써도 실패한 원고입니다.',
    '동시에 검색으로 발견돼야 하는 글이라 키워드 배치도 같이 지킵니다.',
    '',
    '## 화자 — 이걸 먼저 정합니다',
    '- 쓰기 시작하기 전에 **이 글을 쓰는 사람을 한 명 정하고**, 끝까지 그 사람으로만 씁니다.',
    '  나이대, 사는 형태(자취·가족), 하는 일, 요즘 상황을 머릿속으로 정합니다.',
    '- 정한 걸 **본문에 설명하지 않습니다.** "30대 직장인입니다" 같은 자기소개는 쓰지 않습니다.',
    '  생활 반경에서 저절로 드러나게 씁니다. (퇴근길에, 애 하원시키고, 주말에 본가 갔다가)',
    '- 화자의 말버릇을 한두 개 정해서 글 전체에 되풀이합니다. 그게 한 사람이 쓴 글로 만듭니다.',
    '',
    '## 진짜 글의 표식 — 상관없는 디테일',
    '- 사람이 쓴 글에는 **주제와 상관없는 생활 디테일**이 꼭 한두 개 섞입니다.',
    '  (장마라 빨래가 안 말라서, 택배가 이틀 늦게 와서, 점심시간에 검색해봤는데)',
    '- 그런 디테일을 **본문에 두 개** 흘려 넣습니다. 한 줄씩만요. 문단의 주인공이 되면 안 됩니다.',
    '- 이게 없으면 아무리 다듬어도 광고로 읽힙니다. 있으면 그것만으로 사람 글이 됩니다.',
    '',
    '## 검색 — 키워드 배치',
    '- 핵심 키워드: 제목에 1번, 본문 첫 문단에 1번, 본문 중간에 2~3번. 본문 전체 3~5번입니다.',
    '  그 이상은 어색하고, 2번 이하면 검색에 안 잡힙니다.',
    '- 단어를 그대로 붙여 반복하지 말고, 앞뒤 문장을 다르게 해서 자연스럽게 섞습니다.',
    '- **연관어를 같이 씁니다.** 그 키워드를 찾는 사람이 같이 검색할 말 3~4개를',
    '  본문에 한 번씩 문장 안에서 씁니다. 나열하지 않습니다.',
    '- **댓글에도 키워드를 1~2번** 넣습니다. 댓글에서 한 번 더 물어주는 게 카페 원고의 기본입니다.',
    '',
    '## 첫 3줄',
    '- 카페 목록·미리보기에 보이는 건 앞 3줄뿐입니다. 여기서 안 잡히면 안 읽힙니다.',
    '- 인사말·자기소개·"안녕하세요"로 시작하지 않습니다. 첫 줄부터 상황이나 고민 한가운데로 들어갑니다.',
    '',
    '## 브랜드·제품',
    '- 본문 **중후반에 1~2번만** 씁니다. 제품 이름부터 나오면 설명서처럼 읽혀서 끝까지 안 읽힙니다.',
    '- 고민 → 뭘 해봤는데 안 됐다 → 그러다 알게 된 것 순서를 지킵니다.',
    '- 성분·기능을 나열하지 않습니다. 제품은 "내가 써보니 이랬다" 안에서만 나옵니다.',
    '- 결론을 강요하지 않습니다. "저는 이랬어요, 사람마다 다르겠지만" 선에서 멈춥니다.',
    '  판단은 읽는 사람이 하게 두는 글이 제일 잘 먹힙니다.',
    '',
    tone === '질문형'
      ? [
          '## 이번 글은 질문형입니다',
          '- 본문은 짧습니다. 고민을 털어놓고 **물음표로 끝냅니다.** 답을 본문에서 주지 않습니다.',
          '- 본문 흐름: 내 상황 → 뭘 해봤는데 안 됐다 → 알아보니 이런 게 있다던데 → 써보신 분 있나요?',
          '- 본문은 묻기만 합니다. 제품 이야기는 **댓글에서** 나옵니다. 이게 질문형의 구조입니다.',
          '- 댓글1이 실제로 써본 사람처럼 답해주고, 글쓴이가 다시 물어보는 티키타카를 만듭니다.',
          '  이 티키타카가 이 원고의 본론입니다. 여기에 가장 공을 들입니다.',
        ].join('\n')
      : [
          '## 이번 글은 후기형입니다',
          '- 들어갈 것: 왜 쓰는지 한 줄 / 내 상황 / **실패했던 것** / 찾아본 내용 /',
          '  직접 해본 결과(기간·변화를 숫자로) / 권유형 마무리 한 줄.',
          '- **실패했던 것이 제일 중요합니다.** 뭘 해봤는데 안 됐는지가 있어야 광고로 안 읽힙니다.',
          '- 순서는 이번 글 지시를 따릅니다. 매번 같은 순서로 찍어내지 않습니다.',
        ].join('\n'),
    '',
    '## 제목',
    '- 25~35자. 핵심 키워드가 앞쪽에 들어갑니다.',
    '- 검색용 단어 나열처럼 쓰지 않습니다. 한 사람이 쓴 한 문장이어야 합니다.',
    '- 구체적인 숫자를 넣으면 좋습니다. (3개월, 세 군데, 2주)',
    '- 다 말하지 않습니다. 열어봐야 알 수 있게 남겨 둡니다.',
    '- 괄호로 신뢰 장치를 덧붙이는 형태도 좋습니다. (내돈내산, 솔직후기, 사진 있음)',
    tone === '질문형' ? '- 질문형 제목은 물음표로 끝냅니다.' : null,
    '',
    '## 문장',
    '- **구체적인 숫자를 반드시 넣습니다.** 3개월, 3통, 세 군데, 2주째, 5분 거리.',
    '  숫자 없는 후기는 가짜로 읽힙니다.',
    '- 어미를 섞습니다. ~어요 / ~습니다 / ~더라고요 / ~거든요 / ~하더라구요.',
    '  같은 어미가 세 문장 연속 나오면 안 됩니다.',
    '- **문장 길이를 고르게 만들지 마세요.** 다섯 글자짜리 문장과 두 줄짜리 문장이 섞여야 합니다.',
    '- `ㅎㅎ` `ㅋㅋㅋ` `ㅜㅜ` `ㅠㅠ` `~` `..` 를 자연스럽게 씁니다. 이모지(😊 등)는 절대 쓰지 않습니다.',
    '- 자기를 조금 낮추는 말이 한 번쯤 들어가면 좋습니다. ("저 원래 끝까지 쓰는 사람 아닌데..ㅋㅋ")',
    '- 오타는 내지 않되, 문장이 완벽하게 정돈될 필요는 없습니다. 말하듯이 씁니다.',
    '',
    '## 절대 쓰지 않는 표현',
    '- **글씨 꾸미기 금지**: `**`, `##`, `-`로 시작하는 목록 기호, 숫자 목록.',
    '  카페 글칸에는 그 기호가 글자 그대로 들어가서 바로 광고로 보입니다.',
    '  소제목이 필요하면 `[소제목]` 한 줄로만 쓰고, 한 글에 한 번까지입니다.',
    '- **블로그 광고체**: 여러분, ~하시길 바랍니다, 도움이 되셨길, 포스팅, 소개해드릴게요,',
    '  추천드립니다, 강력 추천, 꿀팁, 가성비 갑, 가심비, 인생템, 신세계, 믿고 쓰는, 찐,',
    '  ~하시는 분들께, 참고하시어.',
    '- **보고서 말투**: 결론부터 말씀드리면, 정리하자면, ~라는 점에서, ~하는 것이 중요합니다,',
    '  무엇보다, 특히, 또한, 게다가, 뿐만 아니라, ~에 대해 알아보겠습니다, 첫째·둘째·셋째.',
    '- **과장**: 완치, 부작용 없음, 100% 보장, 최고, 1위, 확실히 낫습니다.',
    '  표시광고법에 걸립니다.',
    '- 느낌표는 글 전체에서 두 번까지. `정말` `너무` `진짜` 도 합쳐서 세 번까지입니다.',
    '',
    '## 건강·의료 소재일 때',
    '- 효과를 사실처럼 단정하지 않습니다. "저는 이랬어요" 같은 개인 경험 범위로만 씁니다.',
    '- 확인되지 않은 효능을 지어내지 않습니다. 요청서에 없는 수치나 연구 결과를 만들지 않습니다.',
    '- 증상이 오래가거나 심하면 병원에 가보라는 말을 한 번 덧붙입니다.',
    '',
    '## 대가성 표기',
    '- 요청서에 협찬·체험단·제공 같은 말이 있으면,',
    '  글 마지막에 "업체로부터 제품을 제공받아 작성했습니다" 한 줄을 반드시 넣습니다.',
    '  표시광고법상 필요한 문구라 빼면 안 됩니다.',
    '',
    mobileShape
      ? [
          '## 글 모양',
          '- 한 문단은 1~3줄입니다. 문단마다 빈 줄을 넣습니다.',
          '- 문장이 길면 문장 중간에서도 줄을 바꿉니다.',
          '- **문단 길이를 고르게 맞추지 마세요.** 한 줄 문단과 세 줄 문단이 섞여야 합니다.',
          '- 모바일에서 세로로 길게 읽히는 모양이어야 합니다. 이게 카페 글의 기본 모양입니다.',
        ].join('\n')
      : '## 글 모양\n- 문단을 4~6줄로 묶어서 씁니다. 문단 길이를 고르게 맞추지 마세요.',
    '',
    '## 댓글 세트 — 배역',
    '- 댓글마다 **다른 사람**입니다. 말투, 길이, 관심사가 다 다릅니다.',
    '  배역은 이번 글 지시에서 정해 줍니다. 그 배역대로 씁니다.',
    '- **구체적인 것을 묻습니다.** "좋아 보여요" 같은 맹탕 댓글은 쓰지 않습니다.',
    '  쓰는 순서, 걸린 기간, 비용, 거리, 불편했던 점처럼 실제로 궁금할 것을 묻습니다.',
    '- 댓글은 1~2문장으로 짧게. 본문 문장을 그대로 베끼지 않습니다.',
    '- 한 명은 반말이 섞여도 되고, 한 명은 초성(`ㅇㅇ` `ㄱㅅ`)을 써도 됩니다. 실제 댓글창처럼요.',
    `- 티키타카는 댓글 → ${AUTHOR} → 댓글 순서로 주고받습니다. 지정된 턴 수를 정확히 지킵니다.`,
    `- ${AUTHOR} 답글은 본문에 이미 쓴 말을 되풀이하지 않습니다.`,
    '  **본문에 없던 구체적인 것 하나를 새로 줍니다.** (얼마였는지, 며칠째였는지, 어디서 샀는지)',
    '  그게 티키타카를 읽을 값이 있게 만듭니다. 홍보 문구는 넣지 않습니다.',
    '- 화자 이름이나 나이·직업 설명은 쓰지 않습니다.',
    '',
    '## 출력 형식',
    '아래 형식만 사용합니다. 설명, 인사말, 코드블록, 확인한 내용을 붙이지 않습니다.',
    '제목은 세 개를 냅니다. 담당자가 그중 하나를 고릅니다. 셋은 서로 다른 각도여야 합니다.',
    '',
    '제목: 가장 자신 있는 제목',
    '제목2: 다른 각도의 제목',
    '제목3: 또 다른 각도의 제목',
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
    (doc.body ?? '').slice(0, 1800),
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
  '손으로 건드리는 게 제일 안 좋다고 하고, 통풍이 중요하다고 하더라고요.',
  '',
  '그래서 저는 일단 안 건드리는 것부터 지켰어요.',
  '',
  '그 주에 장마 시작돼서 빨래도 안 마르고 최악이었는데 ㅜㅜ',
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
  '저는 그거 해봤는데 별 차이 없었는데요.. 사람마다 다른가봐요',
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
 * Ways to open a cafe post.
 *
 * 매번 같은 방식으로 시작하면 여러 편을 올렸을 때 한 사람이 찍어낸 게 보입니다.
 * 그래서 이번 글에 쓸 방식을 하나 골라서 지정해 줍니다.
 */
const OPENINGS = [
  '시간·계절로 시작하세요. ("작년 여름쯤부터", "장마 들어가고 나서부터")',
  '상황 한가운데로 바로 들어가세요. 설명 없이 그 장면부터 씁니다.',
  '누가 한 말을 옮기면서 시작하세요. ("엄마가 그거 왜 그러냐고 하도 물어봐서")',
  '혼잣말처럼 투덜거리면서 시작하세요. ("이거 진짜 나만 그런가 싶어서요")',
  '숫자 사실 하나로 시작하세요. ("세 달 동안 네 가지 써봤습니다")',
  '실패 고백으로 시작하세요. ("먼저 말씀드리면 저 두 번 실패했어요")',
  '왜 이 글을 쓰는지로 시작하세요. ("원래 이런 글 안 쓰는데")',
  '검색하다 여기 왔다는 말로 시작하세요. ("검색만 2주 하다가 결국 글 씁니다")',
];

/** 후기형에서 이번 글에 쓸 구성. 같은 순서로 찍어내지 않게 돌려 씁니다. */
const SHAPES = [
  '왜 쓰는지 → 내 상황 → 실패한 것 → 찾아본 내용 → 해본 결과 → 마무리',
  '내 상황 → 실패한 것 → 찾아본 내용 → 해본 결과 → 왜 쓰는지 → 마무리',
  '실패한 것 → 내 상황 → 해본 결과 → 찾아본 내용 → 마무리',
  '해본 결과를 먼저 한 줄 → 내 상황 → 실패한 것 → 어떻게 했는지 → 마무리',
];

/** 티키타카를 주고받는 자리(여러 턴)에 줄 배역. */
const DEEP = [
  '자기 경험을 얹는 사람. 자기 얘기를 하다가 슬쩍 되묻습니다.',
  '먼저 겪어본 선배처럼 조언하는 사람. 한 가지를 덧붙여 줍니다.',
  '같은 처지의 가족·지인 때문에 찾아본 사람. 본인 얘기가 아닙니다.',
  '값과 파는 곳을 캐묻는 사람. 얼마였는지, 어디서 샀는지 묻습니다.',
];

/** 한 번만 달고 끝나는 자리에 줄 배역. */
const SHORT = [
  '짧게 한 마디 던지는 사람. 공감 반, 딴소리 반. 한 문장으로 끝냅니다.',
  '어디서 샀는지·얼마인지만 묻는 사람. 한 문장입니다.',
  '뒤늦게 발견해서 "지금도 그렇게 하고 계세요?" 하고 묻는 사람.',
  '초성으로 짧게 남기는 사람. (`ㅇㅇ 저도 그래요ㅜㅜ` 정도)',
];

/** 회의적인 사람. 한 세트에 꼭 한 명 넣습니다. 이게 글의 신뢰를 만듭니다. */
const SKEPTIC =
  '반쯤 회의적인 사람. "저는 그거 해봤는데 별로였는데요..?" 라고 받습니다. ' +
  `${AUTHOR}는 방어하지 말고 "사람마다 다르겠죠" 로 인정합니다. ` +
  '이렇게 받아주는 댓글이 있어야 광고로 안 읽힙니다.';

/** 티키타카가 제일 긴 자리에 줄 배역. 이 세트가 원고의 본론입니다. */
const LEAD = {
  후기형:
    '나도 지금 같은 고민 중인 사람. 걸린 기간·순서·비용을 구체적으로 캐묻습니다. ' +
    '이 세트가 티키타카의 본론입니다. 여기에 가장 공을 들이세요.',
  질문형:
    '실제로 써보고 효과를 본 사람. 본문의 질문에 자기 경험으로 답해 줍니다. ' +
    `${AUTHOR}가 다시 캐묻고 이 사람이 또 답합니다. 이 주고받기가 원고의 본론입니다. ` +
    '제품 이야기는 여기서 나옵니다.',
};

/**
 * Turn the seed into one of the choices.
 * @param {any[]} list - Choices.
 * @param {number} seed - Seed.
 * @param {number} [shift] - Offset so two picks from one seed differ.
 * @returns {any} One choice.
 */
const pick = (list, seed, shift = 0) => list[Math.abs(Math.trunc(seed) + shift) % list.length];

/**
 * Put the right Korean particle after a word.
 *
 * 「키워드가」 「제품을」 처럼 끝 글자에 받침이 있는지에 따라 달라져요.
 * @param {string} word - Word in front of the particle.
 * @param {string} pair - Particles with a slash, such as `이/가`.
 * @returns {string} Word with the particle.
 */
const withJosa = (word, pair) => {
  const [withTail, without] = pair.split('/');

  const last = String(word ?? '')
    .replace(/["'\s)\]]+$/, '')
    .slice(-1);

  const code = last.charCodeAt(0);
  const hangul = code >= 0xac00 && code <= 0xd7a3;

  return `${word}${hangul && (code - 0xac00) % 28 !== 0 ? withTail : without}`;
};

/**
 * Build the user prompt for a first draft.
 * @param {Record<string, any>} options - Options collected from the generate screen.
 * @param {any[]} [references] - Reference manuscripts used for style.
 * @param {string} [card] - Measured writing habits from the whole library.
 * @returns {string} User prompt.
 */
export const generatePrompt = (options, references = [], card = '') => {
  const {
    keyword,
    brand = '',
    product = '',
    request = '',
    avoid = '',
    speaker = '',
    cafe = '',
    tone = '후기형',
    length = 'medium',
    commentCount = 4,
    turns = {},
    keepComments = null,
    seed = Date.now(),
  } = options;

  const size = LENGTH[length] ?? LENGTH.medium;

  const turnPlan = Array.from({ length: commentCount }, (_, index) => {
    const fallback = [3, 5][index] ?? 1;
    const count = Number(turns[index + 1] ?? fallback);

    return `댓글${index + 1}: ${count}턴`;
  }).join(' / ');

  // 배역은 턴 수를 보고 나눕니다. 길게 주고받는 자리가 본론이고,
  // 한 번만 다는 자리는 짧은 배역이에요. 회의적인 사람은 한 명 꼭 넣습니다.
  const seats = Array.from({ length: commentCount }, (_, index) => ({
    no: index + 1,
    turns: Number(turns[index + 1] ?? [3, 5][index] ?? 1),
  }));

  const long = [...seats].sort((one, two) => two.turns - one.turns).filter((one) => one.turns > 1);
  const once = seats.filter((one) => one.turns <= 1);
  const role = new Map();

  long.forEach((seat, order) => {
    if (order === 0) {
      role.set(seat.no, LEAD[tone] ?? LEAD.후기형);
    } else if (order === 1 && commentCount >= 3) {
      role.set(seat.no, SKEPTIC);
    } else {
      role.set(seat.no, pick(DEEP, seed, order));
    }
  });

  once.forEach((seat, order) => {
    // 길게 주고받는 자리가 하나뿐이면 회의적인 사람은 짧은 자리에 둡니다.
    const only = long.length < 2 && order === 0 && commentCount >= 3;

    role.set(seat.no, only ? SKEPTIC : pick(SHORT, seed, order));
  });

  const cast = seats
    .map((seat) => `- 댓글${seat.no} (${seat.turns}턴): ${role.get(seat.no)}`)
    .join('\n');

  return [
    card,
    references.length
      ? [
          '아래는 같은 담당자가 전에 쓴 원고입니다.',
          '**문장 길이, 줄바꿈 습관, 자주 쓰는 어미, 댓글 호흡을 그대로 흉내 내세요.**',
          '내용은 베끼지 말고 말투만 가져옵니다. 이게 이번 작업에서 가장 중요합니다.',
          '같은 문장, 같은 도입, 같은 숫자, 같은 에피소드를 쓰면 안 됩니다.',
          '같은 사람이 여러 편 올리는 글이라 겹치면 바로 티가 납니다.',
          card ? '위 말투 카드와 아래 원고가 다르면 말투 카드를 따릅니다.' : '',
          '',
          references.slice(0, 3).map(renderReference).join('\n\n'),
        ]
          .filter(Boolean)
          .join('\n')
      : shapeExample(tone),
    [
      '<요청서>',
      `핵심 키워드: ${keyword}`,
      brand ? `브랜드: ${brand}` : '',
      product ? `제품: ${product}` : '',
      `글 성격: ${tone}`,
      `본문 분량: 공백 제외 ${size.chars} (${size.blocks})`,
      `댓글 개수: ${commentCount}개`,
      `티키타카 턴 수: ${turnPlan}`,
      request ? `요청사항: ${request}` : '',
      avoid ? `쓰지 않을 표현: ${avoid}` : '',
      '</요청서>',
    ]
      .filter(Boolean)
      .join('\n'),
    [
      '<이번 글 지시>',
      speaker
        ? `- 화자: ${speaker}. 이 사람으로 끝까지 씁니다. 본문에 소개하지는 않습니다.`
        : '- 화자: 키워드에 맞는 사람을 직접 한 명 정하고 끝까지 그 사람으로 씁니다. 본문에 소개하지는 않습니다.',
      cafe
        ? `- 올라갈 곳: ${cafe}. 그 회원들이 쓰는 말로 씁니다.`
        : '- 올라갈 곳: 그 키워드를 검색해서 들어오는 사람들이 모인 카페입니다.',
      `- 시작 방식: ${pick(OPENINGS, seed)}`,
      tone === '질문형' ? null : `- 이번 글 구성: ${pick(SHAPES, seed, 3)}`,
      `- 연관어: ${withJosa(`"${keyword}"`, '을/를')} 찾는 사람이 같이 검색할 말 3~4개를 직접` +
        ' 정해서 본문에 한 번씩 섞습니다. 나열하지 말고 문장 안에서요.',
      '- 주제와 상관없는 생활 디테일 두 개를 한 줄씩 흘려 넣습니다.',
      '</이번 글 지시>',
    ]
      .filter((line) => line !== null)
      .join('\n'),
    ['<댓글 배역>', cast, '</댓글 배역>'].join('\n'),
    keepComments
      ? [
          '<그대로 쓸 댓글>',
          keepComments,
          '</그대로 쓸 댓글>',
          '위 댓글 세트는 한 글자도 바꾸지 말고 그대로 다시 출력하세요. 제목과 본문만 새로 씁니다.',
          '(배역 지시는 무시합니다.)',
        ].join('\n')
      : '',
    [
      `위 요청서대로 제목 3개, 본문, 댓글 ${commentCount}개를 써 주세요.`,
      '',
      '내보내기 전에 스스로 확인하고, 걸리는 게 있으면 고쳐서 내보내세요.',
      '확인한 내용은 쓰지 말고 원고만 내보냅니다.',
      [
        `${withJosa(`"${keyword}"`, '이/가')} 본문에 3~5번 들어갔는가.`,
        `댓글에도 ${withJosa(`"${keyword}"`, '이/가')} 1~2번 들어갔는가.`,
        '첫 3줄이 인사말 없이 바로 상황으로 들어가는가.',
        '주제와 상관없는 생활 디테일이 두 개 들어갔는가.',
        brand || product ? '브랜드·제품명이 본문 중후반에만 1~2번 나오는가.' : '',
        '구체적인 숫자가 본문에 두 번 이상 들어갔는가.',
        tone === '질문형' ? '본문이 물음표로 끝나는가.' : '실패했던 경험이 들어갔는가.',
        '같은 어미가 세 문장 연속 나오지 않는가.',
        '문단 길이가 다 비슷하지 않은가.',
        '별표·샵·목록 기호가 하나도 없는가.',
        '광고체·보고서 말투가 하나도 없는가.',
        `${AUTHOR} 답글이 본문에 없던 걸 새로 주고 있는가.`,
        card ? '말투 카드의 어미 비율과 문단 길이를 지켰는가.' : '',
      ]
        .filter(Boolean)
        .join(' '),
    ].join('\n'),
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
    options.speaker ? `화자: ${options.speaker}` : '',
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
      '제목은 고칠 곳에 제목이 있을 때만 새로 3개를 내고, 아니면 현재 제목 한 줄만 그대로 씁니다.',
    ].join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');
};
