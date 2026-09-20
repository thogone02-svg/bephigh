@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 나비효과플랜 카페 올리기 — 연결됨

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js 가 안 깔려 있어요.
  echo   https://nodejs.org 에서 LTS 를 받아 깔고 이 파일을 다시 눌러 주세요.
  echo.
  pause
  exit
)

if not exist node_modules (
  echo.
  echo   처음이라 준비부터 할게요. 1~2분 걸려요.
  echo.
  call npm install
)

node server.mjs
pause
