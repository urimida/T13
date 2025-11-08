#!/usr/bin/env node

/**
 * 모든 프로젝트를 자동으로 빌드하는 스크립트
 * 사용법: node build-all.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 T13 프로젝트 빌드 시작...\n');

// analyze 프로젝트 빌드
const analyzePath = path.join(__dirname, 'analyze');
if (fs.existsSync(analyzePath)) {
  console.log('📊 분석 프로젝트 빌드 중...');
  try {
    process.chdir(analyzePath);
    
    // node_modules가 없으면 npm install 실행
    if (!fs.existsSync(path.join(analyzePath, 'node_modules'))) {
      console.log('  → 의존성 설치 중...');
      execSync('npm install', { stdio: 'inherit' });
    }
    
    // 빌드 실행
    console.log('  → 빌드 실행 중...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('  ✅ 분석 프로젝트 빌드 완료!\n');
  } catch (error) {
    console.error('  ❌ 분석 프로젝트 빌드 실패:', error.message);
    process.exit(1);
  }
} else {
  console.log('  ⚠️  analyze 폴더를 찾을 수 없습니다.\n');
}

process.chdir(__dirname);
console.log('✨ 모든 프로젝트 빌드 완료!');
console.log('이제 index.html을 열어서 프로젝트를 사용할 수 있습니다.');

