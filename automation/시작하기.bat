@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 나비효과플랜 카페 올리기

echo.
echo   나비효과플랜 카페 올리기
echo   ------------------------
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
  echo   ^(컴퓨터에 깔린 크롬을 그대로 씁니다^)
  echo.
  call npm install
  echo.
)

:menu
echo.
echo   ---------------------------------------------
echo   1. 계정 적기            ^(메모장이 열려요^)
echo   2. 연습으로 올려 보기   ^(등록은 안 눌러요^)
echo   3. 진짜로 올리기        ^(창 없이 뒤에서^)
echo   4. 진짜로 올리기        ^(창 띄워서 보면서^)
echo   5. 계정 로그인해 두기   ^(비밀번호 안 적었을 때만^)
echo   0. 닫기
echo   ---------------------------------------------
echo.
echo   * 올릴 원고는 작업실에서 받아 이 폴더에 넣어 두시면
echo     가장 최근 것으로 알아서 올라갑니다.
echo.
set "pick="
set /p pick=  "번호를 누르고 엔터: "

if "%pick%"=="1" goto accounts
if "%pick%"=="2" goto dry
if "%pick%"=="3" goto real
if "%pick%"=="4" goto watch
if "%pick%"=="5" goto login
if "%pick%"=="0" exit
goto menu

:accounts
start notepad "계정.txt"
echo.
echo   메모장에 적고 저장하신 뒤 이리로 돌아오세요.
echo.
goto menu

:dry
call npm start -- --dry
echo.
pause
goto menu

:real
call npm start
echo.
pause
goto menu

:watch
call npm start -- --show
echo.
pause
goto menu

:login
echo.
set "alias="
set /p alias=  "계정 별칭 ^(계정.txt 에 적은 그대로^): "
if "%alias%"=="" goto menu
call npm run login -- "%alias%"
echo.
goto menu
