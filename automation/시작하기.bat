@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 나비효과플랜 카페 올리기

echo.
echo   나비효과플랜 카페 올리기
echo   ------------------------
echo.

if not exist node_modules (
  echo   처음이라 준비부터 할게요. 1~2분 걸려요.
  echo   ^(컴퓨터에 깔린 크롬을 그대로 씁니다^)
  echo.
  call npm install
  echo.
)

:menu
echo   1. 계정 로그인해 두기
echo   2. 연습으로 올려 보기 ^(등록은 안 눌러요^)
echo   3. 진짜로 올리기
echo   4. 로그인 상태 확인
echo   0. 닫기
echo.
set /p pick=  "번호를 누르고 엔터: "

if "%pick%"=="1" goto login
if "%pick%"=="2" goto dry
if "%pick%"=="3" goto real
if "%pick%"=="4" goto check
if "%pick%"=="5" goto watch
if "%pick%"=="0" exit
goto menu

:login
echo.
set /p alias=  "계정 별칭 (웹앱에 적은 그대로): "
call npm run login -- "%alias%"
echo.
goto menu

:dry
call :pickfile
if "%plan%"=="" goto menu
call npm start -- "%plan%" --dry
echo.
goto menu

:real
call :pickfile
if "%plan%"=="" goto menu
call npm start -- "%plan%"
echo.
goto menu

:watch
call :pickfile
if "%plan%"=="" goto menu
call npm start -- "%plan%" --show
echo.
goto menu

:check
node check.mjs
echo.
goto menu

:pickfile
set plan=
echo.
echo   이 폴더에 있는 업로드 파일이에요:
for %%f in ("*업로드.json") do echo     %%~nxf
echo.
set /p plan=  "쓸 파일 이름을 적어 주세요: "
exit /b
