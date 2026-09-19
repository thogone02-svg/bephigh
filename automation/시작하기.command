#!/bin/bash
cd "$(dirname "$0")" || exit 1

echo
echo "  나비효과플랜 카페 올리기"
echo "  ------------------------"
echo

if [ ! -d node_modules ]; then
  echo "  처음이라 준비부터 할게요. 몇 분 걸려요."
  echo
  npm install && npm run setup
  echo
fi

pickfile() {
  echo
  echo "  이 폴더에 있는 업로드 파일이에요:"
  ls -1 *업로드.json 2>/dev/null | sed 's/^/    /' || echo "    (없어요. 웹앱에서 먼저 받아 주세요)"
  echo
  read -r -p "  쓸 파일 이름을 적어 주세요: " plan
}

while true; do
  echo "  1. 계정 로그인해 두기"
  echo "  2. 연습으로 올려 보기 (등록은 안 눌러요)"
  echo "  3. 진짜로 올리기"
  echo "  4. 로그인 상태 확인"
  echo "  0. 닫기"
  echo
  read -r -p "  번호를 누르고 엔터: " pick
  echo

  case "$pick" in
    1) read -r -p "  계정 별칭 (웹앱에 적은 그대로): " alias; npm run login -- "$alias" ;;
    2) pickfile; [ -n "$plan" ] && npm start -- "$plan" --dry ;;
    3) pickfile; [ -n "$plan" ] && npm start -- "$plan" ;;
    4) node check.mjs ;;
    0) exit 0 ;;
    *) echo "  그 번호는 없어요." ;;
  esac
  echo
done
