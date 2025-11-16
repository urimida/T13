# T13 프로젝트 통합

세 가지 인터랙티브 프로젝트를 통합한 웹 애플리케이션입니다.

## 📦 프로젝트 구성

1. **분석** (React + Vite) - 인터랙티브 분석 도구
2. **서클 투 캡쳐** (p5.js) - 인터랙티브 시각화
3. **익스플로어** (p5.js) - 헥사곤 패턴 버블 탐색기

## 🚀 시작하기

### 빠른 시작

1. **자동 빌드 (권장)**

   - **Windows**: `build-all.bat` 파일을 더블클릭
   - **Mac/Linux**: 터미널에서 `node build-all.js` 실행

2. **메인 페이지 열기**
   - 루트 폴더의 `index.html` 파일을 브라우저에서 열기

### 수동 빌드

분석 프로젝트를 사용하려면 먼저 빌드가 필요합니다:

```bash
cd analyze
npm install
npm run build
```

## 📁 프로젝트 구조

```
T13/
├── index.html              # 메인 통합 페이지
├── build-all.js            # 자동 빌드 스크립트 (Node.js)
├── build-all.bat           # 자동 빌드 스크립트 (Windows)
├── analyze/                # React 프로젝트
│   ├── dist/               # 빌드 결과물 (빌드 후 생성)
│   └── ...
├── circle-to-capture/      # p5.js 프로젝트
│   └── ...
└── explorer/               # p5.js 프로젝트
    └── ...
```

## ⚠️ 주의사항

- **분석 프로젝트**는 React 기반이므로 빌드가 필요합니다.
- 빌드하지 않으면 분석 프로젝트에 접근할 수 없습니다.
- 다른 두 프로젝트(서클 투 캡쳐, 익스플로러)는 빌드 없이 바로 사용 가능합니다.

## 🌐 Netlify 배포

Netlify에 배포하면 **자동으로 빌드**됩니다! 별도로 빌드할 필요가 없습니다.

### 배포 방법

1. **GitHub/GitLab에 코드 푸시**
2. **Netlify에서 사이트 생성**
   - "Add new site" → "Import an existing project"
   - 저장소 선택
3. **빌드 설정** (자동 감지됨)
   - Build command: `cd analyze && npm install && npm run build` (또는 `npm run build`)
   - Publish directory: `.` (루트)
4. **배포 완료!**

`netlify.toml` 파일이 이미 설정되어 있어서 자동으로 빌드됩니다.

## 🔧 문제 해결

### 분석 프로젝트가 작동하지 않을 때

1. `analyze/dist/` 폴더가 존재하는지 확인
2. 없으면 `build-all.bat` (Windows) 또는 `node build-all.js` (Mac/Linux) 실행
3. 빌드 완료 후 페이지 새로고침

### 빌드 오류가 발생할 때

1. Node.js가 설치되어 있는지 확인 (`node --version`)
2. `analyze` 폴더에서 `npm install` 실행
3. 다시 빌드 시도

### Netlify 배포 시 빌드 실패

1. Netlify 대시보드에서 빌드 로그 확인
2. `netlify.toml` 파일이 루트에 있는지 확인
3. Node.js 버전이 18 이상인지 확인

## 📝 라이선스

이 프로젝트는 개인 프로젝트입니다.
