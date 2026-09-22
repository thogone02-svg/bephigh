@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 카페 살펴보기

echo.
echo   카페 살펴보기
echo   -------------
echo   카페에서 살펴볼 게시판을 열고, 주소창을 복사(Ctrl+C)해 두시면
echo   그 주소로 알아서 갑니다.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js 가 안 깔려 있어요.
  echo   https://nodejs.org 에서 LTS 를 받아 깔고 이 파일을 다시 눌러 주세요.
  echo.
  pause
  exit
)

if not exist node_modules (
  echo   처음이라 준비부터 할게요. 1~2분 걸려요.
  echo.
  call npm install
  echo.
)

rem 복사해 둔 주소가 있으면 그걸 바로 넘겨 줍니다.
set "URL="
for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "Get-Clipboard"`) do (
  if not defined URL set "URL=%%u"
)

echo %URL% | findstr /i "cafe.naver.com" >nul
if errorlevel 1 (
  node look.mjs
) else (
  node look.mjs "%URL%"
)

echo.
echo   「살펴본것」 폴더를 통째로 압축해서 보내 주세요.
echo.
pause
