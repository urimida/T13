#!/usr/bin/env node

/**
 * Vercel/Netlify 배포용 빌드 스크립트
 * analyze 폴더가 있으면 빌드하고, 없으면 건너뜁니다.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const analyzePath = path.join(__dirname, "analyze");

if (fs.existsSync(analyzePath)) {
  console.log("📊 analyze 폴더를 찾았습니다. 빌드를 시작합니다...");
  try {
    process.chdir(analyzePath);

    // package.json이 있는지 확인
    if (fs.existsSync(path.join(analyzePath, "package.json"))) {
      console.log("  → 의존성 설치 중...");
      execSync("npm install", { stdio: "inherit" });

      console.log("  → 빌드 실행 중...");
      execSync("npm run build", { stdio: "inherit" });

      console.log("  ✅ analyze 프로젝트 빌드 완료!");
    } else {
      console.log("  ⚠️  package.json을 찾을 수 없습니다.");
    }
  } catch (error) {
    console.error("  ❌ 빌드 실패:", error.message);
    process.exit(1);
  }
} else {
  console.log("ℹ️  analyze 폴더가 없습니다. 정적 사이트로 배포합니다.");
}
