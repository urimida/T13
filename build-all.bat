@echo off
chcp 65001 >nul
echo 🚀 T13 프로젝트 빌드 시작...
echo.

cd analyze
if exist package.json (
    echo 📊 분석 프로젝트 빌드 중...
    
    if not exist node_modules (
        echo   → 의존성 설치 중...
        call npm install
    )
    
    echo   → 빌드 실행 중...
    call npm run build
    
    if %ERRORLEVEL% EQU 0 (
        echo   ✅ 분석 프로젝트 빌드 완료!
    ) else (
        echo   ❌ 분석 프로젝트 빌드 실패!
        pause
        exit /b 1
    )
) else (
    echo   ⚠️  analyze 폴더를 찾을 수 없습니다.
)

cd ..
echo.
echo ✨ 모든 프로젝트 빌드 완료!
echo 이제 index.html을 열어서 프로젝트를 사용할 수 있습니다.
pause

