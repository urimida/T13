let bgImg;

// UI 요소 이미지
let workroomImg;
let galleryImg;
let clockImg;
let illuminationImg;
let gatheringImg;

// 돋보기 설정 (요청 스펙: 지름 370px)
const lensDiameter = 370;
const lensRadius = lensDiameter / 2;
// zoom 변수 제거 - 렌즈 확대 기능 없음

// 올가미/버블 관련 변수
let isDrawing = false;
let drawingPath = [];
let bubbles = []; // 저장된 버블들
const minCircleRadius = 50; // 최소 원 반지름
const circleTolerance = 0.3; // 원 인식 허용 오차 (0-1)
let fixedLensPosition = null; // 고정된 돋보기 위치 (버블 생성 시 설정) { x, y, radius, startRadius, targetRadius, progress }
let lensAnimation = null; // 렌즈 터짐 애니메이션 상태 { x, y, scale, opacity, rotation, progress }
let hasDragged = false; // 드래그 여부 추적
let overlay; // 올가미/가이드만 그리는 레이어
let lastDrawnPathIndex = 0; // 마지막으로 그린 경로 인덱스 (증분 렌더링용)
const maxPathLength = 500; // 최대 경로 길이 (성능 최적화)

// 성능 최적화: 캐싱 변수
let cachedCoverFit = null; // computeCoverFit 결과 캐싱
let lastCanvasSize = { w: 0, h: 0 }; // 캔버스 크기 추적
let overlayNeedsClear = false; // overlay clear 필요 여부
let lastDrawingPathLength = 0; // 이전 drawingPath 길이 추적

// 렌즈 렌더링 최적화: 캐싱 변수
let lensBuffer = null; // 렌즈 전용 버퍼 (createGraphics, 저해상도)
let lensCacheKey = ""; // 렌즈 캐싱 키 (x, y, scale, opacity, rotation 기반)

// 모달 관련 변수
let showModal = false; // 모달 표시 여부
let modalOpacity = 0; // 모달 페이드 인/아웃용 투명도
let modalJustOpened = false; // 모달이 방금 열렸는지 추적 (터치 이벤트 보호용)
let modalOpenTime = 0; // 모달이 열린 시간 (프레임 수)
const MODAL_PROTECTION_FRAMES = 5; // 모달이 열린 후 보호 시간 (프레임 수)

// 안내 텍스트 관련 변수
let showInstructionText = true; // 안내 텍스트 표시 여부
let instructionPulseTime = 0; // LED 펄스 애니메이션 시간

// 캡쳐 후 화면 관련 변수
let showCaptureScreen = false; // 캡쳐 화면 표시 여부
let capturedImage = null; // 캡쳐된 이미지
let captureAnimation = null; // 캡쳐 애니메이션 { startX, startY, currentX, currentY, targetX, targetY, progress, scale }
let darkOverlayOpacity = 0; // 배경 어둡게 오버레이 투명도
let captureRadius = 0; // 캡쳐된 원의 반지름
let captureDelayTimer = 0; // 렌즈 표시 후 캡쳐 화면으로 전환하기 위한 타이머
const CAPTURE_DELAY = 10; // 렌즈 표시 시간 (프레임 수, 약 0.17초)

// Easing helpers
const Easing = {
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInQuad: (t) => t * t,
  easeOutBack: (t, s = 1.10158) =>
    1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
};

// Cubic Bezier (x,y 각각에 사용)
function bezier1D(p0, p1, p2, p3, t) {
  const it = 1 - t;
  return (
    it * it * it * p0 +
    3 * it * it * t * p1 +
    3 * it * t * t * p2 +
    t * t * t * p3
  );
}

// 버튼 액션 애니메이션 변수
let deleteAnimation = null; // 삭제 애니메이션 { t0, dur, phaseInflate, x, y, baseR, particles:[], ring:{r, alpha, born} }
let saveAnimation = null; // 저장 애니메이션 { t0, dur, startX, startY, targetX, targetY, cx1, cy1, cx2, cy2, startRadius, targetRadius }

// 4x4 그리드 특징 데이터
const gridFeatures = [
  // 1행
  ["수관 실루엣", "네거티브 스페이스", "저명도 그린 질감"], // 1번 (좌상단)
  ["사선 지붕 릿지 소실점", "UI 오버레이 레이어링", "목재 루버 리듬"], // 2번
  ["캔틸레버 정점(예각)", "금속 하이라이트", "식재·체인 디테일 포인트"], // 3번
  ["발코니 모듈 반복", "하늘–회색 입면 냉·난색 대비", "대기 원근"], // 4번 (우상단)
  // 2행
  ["잎·가지 덩어리감", "유기적 윤곽과 하늘 대비", "점묘식 음영 패턴"], // 5번
  ["수직 루버 패턴", "사선 처마 흐름", "유리 난간–목재 재료 대비"], // 6번
  ["삼각형 매스 전이", "엣지 하이라이트", "소형 오브제(플랜터) 포컬"], // 7번
  ["직교 타워 반복", "경계 정돈", "청명한 스카이 백그라운드"], // 8번
  // 3행
  ["고채도 파랑 원형 표지판", "수관 오클루전", "전경-배경 분리"], // 9번
  ["일문 타이포 표지(화이트 보드)", "표지 그림자 캐스팅", "목재 면과 교차"], // 10번
  ["소핏 음영 그라데이션", "V자 코너 수렴", "다운라이트 점광 포인트"], // 11번
  ["도로 소실점 유도", "가는 전선 라인워크", "명조 대비 강화"], // 12번
  // 4행
  ["하단 유리 반사 레이어", "낮은 잎사귀 컷오프", "베이스 라인 정렬"], // 13번 (좌하단)
  ["수직 멀리언 리듬", "고반사 유리 텍스처", "인물 스케일 앵커"], // 14번
  ["브랜드 엠블럼 포컬", "직사광 캐스팅 섀도", "목재 텍스처 방향 대비"], // 15번
  ["교차로 원근 심화", "간판·신호 혼합 색온", "도시 전경 프레이밍"], // 16번 (우하단)
];

// 원과 사각형의 교차 면적 계산
function calculateCircleRectIntersection(cx, cy, radius, rx, ry, rw, rh) {
  // 사각형이 원 안에 완전히 포함되는 경우
  const corners = [
    { x: rx, y: ry },
    { x: rx + rw, y: ry },
    { x: rx + rw, y: ry + rh },
    { x: rx, y: ry + rh },
  ];
  let allInside = true;
  for (const corner of corners) {
    const dist = Math.sqrt(
      Math.pow(cx - corner.x, 2) + Math.pow(cy - corner.y, 2)
    );
    if (dist > radius) {
      allInside = false;
      break;
    }
  }
  if (allInside) {
    return rw * rh; // 사각형 전체 면적
  }

  // 원이 사각형 안에 완전히 포함되는 경우
  const distToClosest = Math.sqrt(
    Math.pow(Math.max(rx, Math.min(cx, rx + rw)) - cx, 2) +
      Math.pow(Math.max(ry, Math.min(cy, ry + rh)) - cy, 2)
  );
  if (distToClosest >= radius) {
    return 0; // 교차하지 않음
  }

  // 근사 계산: 샘플링 방식으로 교차 면적 계산
  const samples = 50; // 각 축당 샘플 수
  let intersectionArea = 0;
  const stepX = rw / samples;
  const stepY = rh / samples;

  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const px = rx + i * stepX + stepX / 2;
      const py = ry + j * stepY + stepY / 2;
      const dist = Math.sqrt(Math.pow(cx - px, 2) + Math.pow(cy - py, 2));
      if (dist <= radius) {
        intersectionArea += stepX * stepY;
      }
    }
  }

  return intersectionArea;
}

// 캡쳐된 영역의 그리드 특징 분석
function analyzeCapturedGrid(circle) {
  if (!bgImg || !cachedCoverFit) return [];

  const cover = cachedCoverFit;
  const gridCols = 4;
  const gridRows = 4;

  // 배경 이미지 원본 좌표로 변환
  const screenX = circle.x - cover.offsetX;
  const screenY = circle.y - cover.offsetY;
  const scaleX = bgImg.width / cover.drawW;
  const scaleY = bgImg.height / cover.drawH;
  const imgX = screenX * scaleX;
  const imgY = screenY * scaleY;
  const imgRadius = circle.radius * Math.min(scaleX, scaleY);

  // 올가미의 전체 면적
  const totalLassoArea = Math.PI * imgRadius * imgRadius;

  // 그리드 칸 크기
  const gridCellW = bgImg.width / gridCols;
  const gridCellH = bgImg.height / gridRows;

  // 모든 칸에 대해 원과의 교차 면적 계산
  const cellIntersectionAreas = [];
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const cellX = col * gridCellW;
      const cellY = row * gridCellH;
      const cellIndex = row * gridCols + col;

      // 원과 칸의 교차 면적 계산
      const intersectionArea = calculateCircleRectIntersection(
        imgX,
        imgY,
        imgRadius,
        cellX,
        cellY,
        gridCellW,
        gridCellH
      );

      cellIntersectionAreas[cellIndex] = intersectionArea;
    }
  }

  // 각 특징별로 올가미 내 면적 계산
  const featureAreas = {};
  for (let cellIndex = 0; cellIndex < gridRows * gridCols; cellIndex++) {
    if (gridFeatures[cellIndex]) {
      const intersectionArea = cellIntersectionAreas[cellIndex] || 0;
      for (const feature of gridFeatures[cellIndex]) {
        if (!featureAreas[feature]) {
          featureAreas[feature] = 0;
        }
        featureAreas[feature] += intersectionArea;
      }
    }
  }

  // 올가미 면적의 20% 이상을 차지하는 특징만 필터링
  const threshold = totalLassoArea * 0.2;
  const filteredFeatures = Object.keys(featureAreas).filter(
    (feature) => featureAreas[feature] >= threshold
  );

  return filteredFeatures;
}

// 반응형 스케일 계산 헬퍼 함수
function getResponsiveScale() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;
  const scale = Math.min(scaleX, scaleY);
  const minScale = 0.5;
  const maxScale = 1.5;
  return Math.max(minScale, Math.min(maxScale, scale));
}

// 화면 채우기용 배경 이미지 스케일링 계산 (cover 방식)
function computeCoverFit(imgW, imgH, viewW, viewH) {
  const imgRatio = imgW / imgH;
  const viewRatio = viewW / viewH;
  let drawW, drawH;
  if (viewRatio > imgRatio) {
    // 가로가 더 넓음 → 너비를 맞추고 높이 초과
    drawW = viewW;
    drawH = viewW / imgRatio;
  } else {
    // 세로가 더 큼 → 높이를 맞추고 너비 초과
    drawH = viewH;
    drawW = viewH * imgRatio;
  }
  const offsetX = (viewW - drawW) / 2;
  const offsetY = (viewH - drawH) / 2;
  return { drawW, drawH, offsetX, offsetY };
}

function preload() {
  bgImg = loadImage("assets/img/background.jpg");
  workroomImg = loadImage("assets/img/workroom.png");
  galleryImg = loadImage("assets/img/gallery.png");
  clockImg = loadImage("assets/img/digital-clock.png");
  illuminationImg = loadImage("assets/img/Illumination-display.png");
  gatheringImg = loadImage("assets/img/gathering.png");
}

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.parent(document.querySelector("main"));
  noStroke();

  // 프레임레이트 제한으로 성능 최적화 (45fps - 체감 차이 거의 없음)
  frameRate(45);

  overlay = createGraphics(windowWidth, windowHeight);
  overlay.clear(); // 완전 투명

  // 렌즈용 오프스크린 버퍼 생성 (저해상도로 성능 최적화)
  lensBuffer = createGraphics(
    Math.ceil(windowWidth / 2),
    Math.ceil(windowHeight / 2)
  );
  lensBuffer.pixelDensity(1);

  // 캐시 초기화
  lastCanvasSize = { w: windowWidth, h: windowHeight };
  cachedCoverFit = null;
  lensCacheKey = "";
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  // overlay도 캔버스와 동일 크기로 재생성
  overlay = createGraphics(windowWidth, windowHeight);
  overlay.clear();

  // 렌즈 버퍼도 재생성
  lensBuffer = createGraphics(
    Math.ceil(windowWidth / 2),
    Math.ceil(windowHeight / 2)
  );
  lensBuffer.pixelDensity(1);

  // 캐시 무효화
  lastCanvasSize = { w: windowWidth, h: windowHeight };
  cachedCoverFit = null;
  lensCacheKey = ""; // 렌즈 캐시 무효화
}

function drawBackgroundCovered() {
  if (!bgImg) return;

  // 캐시된 값이 없거나 캔버스 크기가 변경되었으면 재계산
  if (
    !cachedCoverFit ||
    lastCanvasSize.w !== width ||
    lastCanvasSize.h !== height
  ) {
    cachedCoverFit = computeCoverFit(bgImg.width, bgImg.height, width, height);
    lastCanvasSize = { w: width, h: height };
  }

  const { drawW, drawH, offsetX, offsetY } = cachedCoverFit;
  image(bgImg, offsetX, offsetY, drawW, drawH);
}

// 그리드 시각화 (디버깅용)
function drawGridVisualization() {
  if (!bgImg || !cachedCoverFit) return;

  const cover = cachedCoverFit;
  const gridCols = 4;
  const gridRows = 4;

  // 그리드 칸 크기 (화면 좌표계)
  const cellW = cover.drawW / gridCols;
  const cellH = cover.drawH / gridRows;

  push();
  stroke(255, 0, 0); // 빨간색
  strokeWeight(2);
  noFill();

  // 그리드 선 그리기
  for (let i = 0; i <= gridCols; i++) {
    const x = cover.offsetX + i * cellW;
    line(x, cover.offsetY, x, cover.offsetY + cover.drawH);
  }
  for (let i = 0; i <= gridRows; i++) {
    const y = cover.offsetY + i * cellH;
    line(cover.offsetX, y, cover.offsetX + cover.drawW, y);
  }

  // 각 칸에 번호와 특징 표시
  textAlign(CENTER, TOP);
  textSize(14);
  fill(255, 0, 0); // 빨간색
  noStroke();

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const cellIndex = row * gridCols + col;
      const cellX = cover.offsetX + col * cellW;
      const cellY = cover.offsetY + row * cellH;
      const cellCenterX = cellX + cellW / 2;
      const cellCenterY = cellY + cellH / 2;

      // 칸 번호 표시
      textSize(20);
      textStyle(BOLD);
      text(`${cellIndex + 1}`, cellCenterX, cellY + 10);

      // 모든 특징 표시
      if (gridFeatures[cellIndex] && gridFeatures[cellIndex].length > 0) {
        textSize(11);
        textStyle(NORMAL);
        const maxWidth = cellW - 20;
        let yOffset = cellY + 35; // 번호 아래부터 시작

        for (const feature of gridFeatures[cellIndex]) {
          // 텍스트가 칸을 벗어나지 않도록 줄바꿈 처리
          if (textWidth(feature) > maxWidth) {
            // 긴 텍스트는 줄바꿈
            const words = feature.split(/[\/·]/);
            let currentLine = "";
            for (const word of words) {
              const testLine = currentLine ? `${currentLine}/${word}` : word;
              if (textWidth(testLine) > maxWidth && currentLine) {
                text(currentLine, cellCenterX, yOffset);
                yOffset += 14;
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
            if (currentLine) {
              text(currentLine, cellCenterX, yOffset);
              yOffset += 14;
            }
          } else {
            text(feature, cellCenterX, yOffset);
            yOffset += 14;
          }

          // 다음 특징과 구분을 위한 간격
          yOffset += 2;
        }
      }
    }
  }

  pop();
}

// drawLens 함수는 더 이상 사용하지 않음 - 올가미로 캡쳐한 이미지만 표시

// 화면 좌표 (cx,cy), 화면 반지름 r 로 렌즈를 그린다(확대 없음, 1:1 렌더링)
// srcRectOverride: { sx, sy, sw, sh }를 넘기면 그 영역만을 사용해 어디에든 그려줌
function drawLensFromBG(cx, cy, r, srcRectOverride = null) {
  if (!bgImg || !cachedCoverFit) return;
  const cover = cachedCoverFit;

  const toSrcX = bgImg.width / cover.drawW;
  const toSrcY = bgImg.height / cover.drawH;

  let sx, sy, srcW, srcH;

  if (srcRectOverride) {
    // 고정된 원본 영역을 사용
    ({ sx, sy, sw: srcW, sh: srcH } = srcRectOverride);
  } else {
    // (이전 로직) 화면 위치에서 즉석 계산
    const srcCenterX = (cx - cover.offsetX) * toSrcX;
    const srcCenterY = (cy - cover.offsetY) * toSrcY;
    srcW = 2 * r * toSrcX;
    srcH = 2 * r * toSrcY;
    sx = srcCenterX - srcW / 2;
    sy = srcCenterY - srcH / 2;
    sx = Math.max(0, Math.min(bgImg.width - srcW, sx));
    sy = Math.max(0, Math.min(bgImg.height - srcH, sy));
  }

  const srcCanvas = bgImg.canvas || bgImg.elt;
  const ctx = drawingContext;

  // 원형 클리핑
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // 목적지는 렌즈 원에 꽉 차게
  ctx.drawImage(srcCanvas, sx, sy, srcW, srcH, cx - r, cy - r, 2 * r, 2 * r);

  ctx.restore();
}

// 렌즈 테두리만 그리기 (캡쳐된 이미지 위에)
function drawLensBorder(mx, my, radius = lensRadius) {
  push();
  const ctx = drawingContext;
  ctx.save();

  // 가장자리 페더(뭉개짐) 표현
  const feather = 28;
  const grad = ctx.createRadialGradient(
    mx,
    my,
    Math.max(1, radius - feather),
    mx,
    my,
    radius + 1
  );
  grad.addColorStop(0.0, "rgba(255,255,255,0)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.55)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(mx, my, radius + 1, 0, Math.PI * 2);
  ctx.fill();

  // 방사형 그라디언트 스트로크
  const strokeFeather = 10;
  const strokeGrad = ctx.createRadialGradient(
    mx,
    my,
    Math.max(1, radius - 1),
    mx,
    my,
    radius + strokeFeather
  );
  strokeGrad.addColorStop(0.0, "rgba(255,255,255,0.9)");
  strokeGrad.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.beginPath();
  ctx.arc(mx, my, radius, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeGrad;
  ctx.stroke();
  ctx.restore();
  pop();
}

function getPointer() {
  if (touches && touches.length > 0) {
    return { x: touches[0].x, y: touches[0].y };
  }
  return { x: mouseX, y: mouseY };
}

// 포인터 다운 (통합 핸들러)
function handlePointerDown(x, y) {
  // 모달이 열려있으면 닫기 버튼 클릭 확인 (보호 시간이 지난 후에만)
  if (showModal && !modalJustOpened && window.modalCloseBtn) {
    const btn = window.modalCloseBtn;
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      showModal = false;
      modalOpacity = 0;
      modalJustOpened = false;
      return true; // 처리됨
    }
  }

  // UI 요소 클릭 확인
  if (checkUIClick(x, y)) {
    return true; // UI 클릭이면 올가미 시작하지 않음
  }

  // 이전 올가미 잔상 즉시 제거
  isDrawing = false;
  drawingPath = [];
  overlayNeedsClear = true;
  lastDrawnPathIndex = 0; // 증분 렌더링 인덱스 초기화

  // 새로운 드래그 시작
  hasDragged = false;
  isDrawing = true;
  drawingPath = [];
  showInstructionText = false; // 그림 그리기 시작하면 안내 텍스트 숨김
  if (Number.isFinite(x) && Number.isFinite(y)) {
    drawingPath.push({ x: x, y: y });
  }
  lastDrawingPathLength = drawingPath.length;
  return false; // 계속 진행
}

// 드래그 시작 (p5.js 이벤트 - 포인터 통합)
function mousePressed() {
  const ptr = getPointer();
  const handled = handlePointerDown(ptr.x, ptr.y);
  return !handled; // handled면 false 반환하여 기본 동작 방지
}

function touchStarted() {
  const ptr = getPointer();
  const handled = handlePointerDown(ptr.x, ptr.y);
  return !handled; // handled면 false 반환하여 기본 동작 방지
}

// 포인터 업 (통합 핸들러)
function handlePointerUp(x, y) {
  // 캡쳐 화면 버튼 클릭 확인
  if (showCaptureScreen && !hasDragged && window.captureButtons) {
    for (let btn of window.captureButtons) {
      if (
        x >= btn.x &&
        x <= btn.x + btn.w &&
        y >= btn.y &&
        y <= btn.y + btn.h
      ) {
        handleCaptureButtonClick(btn.action);
        return true; // 처리됨
      }
    }
  }

  // 모달이 열려있으면 닫기 버튼 또는 모달 외부 클릭 시 닫기
  if (showModal && !hasDragged) {
    const responsiveScale = getResponsiveScale();
    const modalX = width / 2;
    const modalY = height / 2;
    const modalW = 400 * responsiveScale;
    const modalH = 200 * responsiveScale;
    const modalLeft = modalX - modalW / 2;
    const modalRight = modalX + modalW / 2;
    const modalTop = modalY - modalH / 2;
    const modalBottom = modalY + modalH / 2;

    // 닫기 버튼 클릭 확인
    if (window.modalCloseBtn) {
      const btn = window.modalCloseBtn;
      if (
        x >= btn.x &&
        x <= btn.x + btn.w &&
        y >= btn.y &&
        y <= btn.y + btn.h
      ) {
        showModal = false;
        modalOpacity = 0;
        return true; // 처리됨
      }
    }

    // 모달 외부 클릭 시 닫기
    if (x < modalLeft || x > modalRight || y < modalTop || y > modalBottom) {
      showModal = false;
      modalOpacity = 0;
      return true; // 처리됨
    }
  }

  // 드래그가 아닌 단순 클릭이면 렌즈 터짐 애니메이션 시작 (더 이상 사용하지 않음 - 렌즈 확대 기능 제거)
  // 렌즈는 올가미로 캡쳐한 이미지만 표시하므로 이 기능 제거
  if (!hasDragged && fixedLensPosition) {
    // 렌즈 터짐 애니메이션은 더 이상 사용하지 않음
    // fixedLensPosition은 그대로 유지하여 캡쳐된 이미지 계속 표시
    isDrawing = false;
    drawingPath = [];
    return true; // 처리됨
  }

  if (!isDrawing || drawingPath.length < 10) {
    isDrawing = false;
    drawingPath = [];
    overlayNeedsClear = true;
    lastDrawnPathIndex = 0;
    if (overlay) overlay.clear(); // ✅
    return true; // 처리됨
  }

  // 원 인식 및 버블 생성
  const circle = detectCircle(drawingPath);
  if (circle) {
    // 올가미 경로를 먼저 초기화하여 잔상 방지
    isDrawing = false;
    drawingPath = [];
    captureBubble(circle);
  } else {
    isDrawing = false;
    drawingPath = [];
  }
  overlayNeedsClear = true;
  lastDrawnPathIndex = 0;
  if (overlay) overlay.clear(); // ✅
  return true; // 처리됨
}

// 드래그 종료 (포인터 통합)
function mouseReleased() {
  const ptr = getPointer();
  const handled = handlePointerUp(ptr.x, ptr.y);
  return !handled; // handled면 false 반환하여 기본 동작 방지
}

function touchEnded() {
  const ptr = getPointer();
  const handled = handlePointerUp(ptr.x, ptr.y);
  return !handled; // handled면 false 반환하여 기본 동작 방지
}

// 포인터 이동 (통합 핸들러)
function handlePointerMove(x, y) {
  hasDragged = true; // 드래그 중임을 표시
  if (isDrawing && Number.isFinite(x) && Number.isFinite(y)) {
    // 마지막 점과의 거리가 충분하면 추가 (거리 임계값을 줄여서 더 부드럽게)
    const minDistance = 2; // 5에서 2로 줄여서 더 촘촘하게 점 추가
    if (
      drawingPath.length === 0 ||
      dist(
        x,
        y,
        drawingPath[drawingPath.length - 1].x,
        drawingPath[drawingPath.length - 1].y
      ) > minDistance
    ) {
      drawingPath.push({ x: x, y: y });

      // 경로가 너무 길어지면 오래된 점 제거 (성능 최적화)
      if (drawingPath.length > maxPathLength) {
        drawingPath.shift(); // 첫 번째 점 제거
        // 전체 경로를 다시 그려야 하므로 clear 필요
        overlayNeedsClear = true;
        lastDrawnPathIndex = 0;
      } else {
        // 경로가 변경되었으므로 overlay 업데이트 필요 (증분 렌더링)
        overlayNeedsClear = false; // 증분 렌더링이므로 clear 불필요
      }
    }
  }
}

// 드래그 중 경로 업데이트 (포인터 통합)
function mouseDragged() {
  const ptr = getPointer();
  handlePointerMove(ptr.x, ptr.y);
  return false;
}

function touchMoved() {
  const ptr = getPointer();
  handlePointerMove(ptr.x, ptr.y);
  return false;
}

// 경로에서 원 인식
function detectCircle(path) {
  if (path.length < 10) return null;

  // 시작점과 끝점이 가까운지 확인
  const start = path[0];
  const end = path[path.length - 1];
  const distanceToStart = dist(end.x, end.y, start.x, start.y);

  // 시작점과 끝점이 너무 멀면 원이 아님
  if (distanceToStart > 100) return null;

  // 중심점 계산 (모든 점의 평균)
  let sumX = 0,
    sumY = 0;
  for (let p of path) {
    sumX += p.x;
    sumY += p.y;
  }
  const centerX = sumX / path.length;
  const centerY = sumY / path.length;

  // 평균 반지름 계산
  let sumRadius = 0;
  for (let p of path) {
    sumRadius += dist(p.x, p.y, centerX, centerY);
  }
  const avgRadius = sumRadius / path.length;

  if (avgRadius < minCircleRadius) return null;

  // 원형인지 확인 (각 점이 중심으로부터 비슷한 거리에 있는지)
  let variance = 0;
  for (let p of path) {
    const r = dist(p.x, p.y, centerX, centerY);
    variance += Math.abs(r - avgRadius);
  }
  const avgVariance = variance / path.length;
  const normalizedVariance = avgVariance / avgRadius;

  // 허용 오차 내에 있으면 원으로 인식
  if (normalizedVariance < circleTolerance) {
    return {
      x: centerX,
      y: centerY,
      radius: avgRadius,
    };
  }

  return null;
}

// 렌즈 고정 및 캡쳐 처리
function captureBubble(circle) {
  // 올가미 자국 제거
  isDrawing = false;
  drawingPath = [];
  lastDrawnPathIndex = 0;

  // 캡쳐된 영역 이미지 추출
  if (!bgImg) return;

  // 배경 이미지의 해당 영역을 캡쳐 (캐시 업데이트)
  if (
    !cachedCoverFit ||
    lastCanvasSize.w !== width ||
    lastCanvasSize.h !== height
  ) {
    cachedCoverFit = computeCoverFit(bgImg.width, bgImg.height, width, height);
    lastCanvasSize = { w: width, h: height };
  }

  // 캡쳐된 영역의 그리드 특징 분석
  window.capturedFeatures = analyzeCapturedGrid(circle);
  // 라벨 위치 초기화 (새로운 캡쳐마다 재계산)
  window.featureLabelPositions = null;

  // 올가미 시점의 원본 자르기 좌표를 고정 저장
  const cover = cachedCoverFit;
  const toSrcX = bgImg.width / cover.drawW;
  const toSrcY = bgImg.height / cover.drawH;

  const srcCenterX = (circle.x - cover.offsetX) * toSrcX;
  const srcCenterY = (circle.y - cover.offsetY) * toSrcY;
  const srcW = 2 * circle.radius * toSrcX;
  const srcH = 2 * circle.radius * toSrcY;
  let sx = srcCenterX - srcW / 2;
  let sy = srcCenterY - srcH / 2;
  sx = Math.max(0, Math.min(bgImg.width - srcW, sx));
  sy = Math.max(0, Math.min(bgImg.height - srcH, sy));

  // 이후 모든 렌더/저장에서 이 값만 사용
  window.capturedSrcRect = { sx, sy, sw: srcW, sh: srcH };

  // 이미지 버퍼는 생성하지 않음 - 실시간으로 drawLensFromBG로 렌더링
  capturedImage = null; // 더 이상 사용하지 않음
  captureRadius = circle.radius;

  // 먼저 렌즈를 표시 (올가미로 그린 원의 크기로, 중앙으로 이동하며 커지는 애니메이션)
  const centerX = width / 2;
  const centerY = height / 2;
  const targetRadius = Math.min(width, height) * 0.3; // 최종 크기
  fixedLensPosition = {
    x: circle.x,
    y: circle.y,
    radius: circle.radius, // 현재 크기 (올가미 원 크기)
    startX: circle.x,
    startY: circle.y,
    targetX: centerX,
    targetY: centerY,
    startRadius: circle.radius,
    targetRadius: targetRadius,
    progress: 0, // 애니메이션 진행도
  };
  captureDelayTimer = 0;
  showCaptureScreen = false; // 아직 캡쳐 화면 표시 안 함

  // 흔적 완전 제거
  overlayNeedsClear = true;
  if (overlay) overlay.clear();
}

// LED 전광판 효과를 위한 펄스 애니메이션
let lassoPulseTime = 0;

// 올가미 경로 그리기 (증분 렌더링 최적화 + LED 글로우 효과)
function drawLasso() {
  // 구슬이 생성되면 올가미를 그리지 않음
  if (!isDrawing || drawingPath.length < 2 || fixedLensPosition || !overlay)
    return;

  const ctx = overlay.drawingContext;
  ctx.save();

  // LED 펄스 효과 (시간 기반)
  lassoPulseTime += 0.15;
  const pulse = (Math.sin(lassoPulseTime) + 1) * 0.5; // 0~1 사이 값
  const glowIntensity = 0.3 + pulse * 0.4; // 0.3~0.7 사이로 펄스

  // 증분 렌더링: 마지막으로 그린 부분 이후만 추가로 그리기
  const startIndex = Math.max(0, lastDrawnPathIndex - 1); // 이전 점부터 시작하여 연결

  // 경로 그리기 헬퍼 함수
  const drawPath = (pathStart, pathEnd) => {
    ctx.beginPath();
    ctx.moveTo(drawingPath[pathStart].x, drawingPath[pathStart].y);
    for (let i = pathStart + 1; i <= pathEnd; i++) {
      ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
    }
  };

  // LED 글로우 효과를 위한 여러 레이어 그리기
  const drawLEDGlow = (pathStart, pathEnd, alpha) => {
    // 1단계: 뿌연 글로우 레이어들 (넓고 투명한 선들을 먼저 그리기)
    // 가장 넓은 뿌연 레이어
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.15})`;
    ctx.lineWidth = 20;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawPath(pathStart, pathEnd);
    ctx.stroke();

    // 중간 뿌연 레이어
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.25})`;
    ctx.lineWidth = 14;
    drawPath(pathStart, pathEnd);
    ctx.stroke();

    // 약간 뿌연 레이어
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
    ctx.lineWidth = 10;
    drawPath(pathStart, pathEnd);
    ctx.stroke();

    // 2단계: 진한 메인 LED 선 (뿌연 레이어 위에 그리기)
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
    ctx.lineWidth = 5;
    drawPath(pathStart, pathEnd);
    ctx.stroke();

    // 3단계: 가장 진한 중심선
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = 3;
    drawPath(pathStart, pathEnd);
    ctx.stroke();
  };

  // 경로가 새로 시작되었거나 전체를 다시 그려야 하는 경우
  if (overlayNeedsClear || startIndex === 0) {
    // 전체 경로 다시 그리기
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    drawPath(0, drawingPath.length - 1);

    // 시작점과 끝점 연결
    if (drawingPath.length > 2) {
      const start = drawingPath[0];
      const end = drawingPath[drawingPath.length - 1];
      const distance = dist(end.x, end.y, start.x, start.y);
      if (distance < 100) {
        ctx.lineTo(start.x, start.y);
        ctx.closePath();
        ctx.fill(); // 채우기
      } else {
        ctx.stroke(); // 닫히지 않은 경우 stroke만
      }
    }

    // LED 글로우 효과로 올가미 테두리 그리기
    drawLEDGlow(0, drawingPath.length - 1, 0.9 * glowIntensity);
  } else {
    // 증분 렌더링: 마지막 선분만 추가
    if (startIndex < drawingPath.length - 1) {
      // LED 글로우 효과로 마지막 선분 그리기
      drawLEDGlow(startIndex, drawingPath.length - 1, 0.9 * glowIntensity);

      // 채우기도 업데이트 (전체 경로 다시 그리기 - 하지만 최적화됨)
      if (drawingPath.length > 2) {
        const start = drawingPath[0];
        const end = drawingPath[drawingPath.length - 1];
        const distance = dist(end.x, end.y, start.x, start.y);
        if (distance < 100) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.beginPath();
          ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
          for (let i = 1; i < drawingPath.length; i++) {
            ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
          }
          ctx.lineTo(start.x, start.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  // 마지막으로 그린 인덱스 업데이트
  lastDrawnPathIndex = drawingPath.length;

  ctx.restore();
}

// 저장된 버블들 그리기
function drawBubbles() {
  for (let bubble of bubbles) {
    // 스케일 및 투명도 애니메이션
    bubble.scale += (bubble.targetScale - bubble.scale) * 0.1;
    bubble.opacity += (bubble.targetOpacity - bubble.opacity) * 0.1;

    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = bubble.opacity;
    ctx.translate(bubble.x, bubble.y);
    ctx.scale(bubble.scale, bubble.scale);

    // 버블 이미지 그리기
    ctx.drawImage(
      bubble.image,
      -bubble.radius,
      -bubble.radius,
      bubble.radius * 2,
      bubble.radius * 2
    );

    ctx.restore();
  }
}

function draw() {
  background(255);
  drawBackgroundCovered();

  // 모달 보호 시간 업데이트 (터치 이벤트 보호)
  if (modalJustOpened && showModal) {
    modalOpenTime++;
    if (modalOpenTime >= MODAL_PROTECTION_FRAMES) {
      modalJustOpened = false; // 보호 시간이 지나면 플래그 해제
    }
  }
  // drawGridVisualization(); // 그리드 시각화 (비활성화)

  // ✅ 버블은 더 이상 그리지 않음
  // drawBubbles();  <-- 버블 렌더링 제거

  // overlay 초기화 최적화: 필요한 경우에만 clear
  // 렌즈 애니메이션이 있거나, overlay를 clear해야 하는 경우에만
  const hasActiveContent = lensAnimation || fixedLensPosition || isDrawing;
  const needsClear = overlayNeedsClear || (hasActiveContent && !isDrawing);

  if (needsClear && overlay) {
    overlay.clear();
    overlayNeedsClear = false;
    lastDrawnPathIndex = 0; // clear 후 인덱스 초기화
  }

  lastDrawingPathLength = drawingPath.length;

  // 렌즈 터짐 애니메이션 업데이트 및 렌더링 (더 이상 사용하지 않음 - 렌즈 확대 기능 제거)
  // lensAnimation은 제거되었지만 호환성을 위해 유지
  if (lensAnimation) {
    // 애니메이션 즉시 완료 처리
    lensAnimation = null;
  }

  // 렌즈 표시 후 캡쳐 화면으로 전환 (capturedImage 의존 제거)
  if (fixedLensPosition && !showCaptureScreen) {
    // 애니메이션이 완료되었는지 확인
    const animationComplete =
      fixedLensPosition.progress !== undefined &&
      fixedLensPosition.progress >= 1;

    if (animationComplete) {
      captureDelayTimer++;
      if (captureDelayTimer >= CAPTURE_DELAY) {
        // 캡쳐 화면으로 전환
        captureAnimation = {
          startX: fixedLensPosition.x,
          startY: fixedLensPosition.y,
          currentX: fixedLensPosition.x,
          currentY: fixedLensPosition.y,
          targetX: fixedLensPosition.targetX,
          targetY: fixedLensPosition.targetY,
          progress: 0,
          scale: 1,
          startRadius: fixedLensPosition.radius,
          targetRadius: fixedLensPosition.targetRadius,
        };
        showCaptureScreen = true;
        darkOverlayOpacity = 0;
        fixedLensPosition = null; // 렌즈 위치 제거
      }
    }
  }

  // 삭제 애니메이션 처리
  if (deleteAnimation) {
    // 배경 어둡게 유지
    fill(0, 0, 0, Math.min(0.7, darkOverlayOpacity || 0.7) * 255);
    noStroke();
    rect(0, 0, width, height);

    deleteAnimation.progress = min(1, deleteAnimation.progress + 0.12);
    const t = deleteAnimation.progress;
    const easeOut = Easing.easeOutCubic(t);

    // 콘텐츠는 확대하지 않고, 렌즈 반지름만 약간 키움
    const r = deleteAnimation.baseR * (1 + 0.6 * easeOut);

    // 1:1 렌더링으로 렌즈 그리기
    push();
    const ctx = drawingContext;
    ctx.save();
    ctx.globalAlpha = 1 - easeOut; // 페이드아웃
    drawLensFromBG(
      deleteAnimation.x,
      deleteAnimation.y,
      r,
      window.capturedSrcRect // 고정된 원본 영역 사용
    );
    ctx.restore();
    pop();

    // 투명 링 (비눗방울 느낌)
    const ringAlpha = (1 - easeOut) * 0.8;
    push();
    noFill();
    stroke(255, 255, 255, 255 * ringAlpha);
    strokeWeight(2);
    circle(deleteAnimation.x, deleteAnimation.y, r * 2 + 8);
    pop();

    // 애니메이션 완료 시 화면 닫기
    if (deleteAnimation.progress >= 1) {
      showCaptureScreen = false;
      capturedImage = null;
      deleteAnimation = null;
      darkOverlayOpacity = 0;
      fixedLensPosition = null; // 렌즈 위치 초기화
      captureAnimation = null; // 캡쳐 애니메이션도 초기화
      isDrawing = false; // 그리기 상태 초기화
      drawingPath = []; // 경로 초기화
      // 안내 텍스트 다시 표시
      showInstructionText = true;
      instructionPulseTime = 0;
    }
  }

  // 저장 애니메이션 처리
  if (saveAnimation) {
    saveAnimation.progress = min(1, saveAnimation.progress + 0.08);
    const t = saveAnimation.progress;
    const easeInOut = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out

    // 위치 보간
    saveAnimation.currentX = lerp(
      saveAnimation.startX,
      saveAnimation.targetX,
      easeInOut
    );
    saveAnimation.currentY = lerp(
      saveAnimation.startY,
      saveAnimation.targetY,
      easeInOut
    );

    // 크기 보간 (축소)
    saveAnimation.currentRadius = lerp(
      saveAnimation.startRadius,
      saveAnimation.targetRadius,
      easeInOut
    );

    // 배경 어둡게
    darkOverlayOpacity = min(0.7, darkOverlayOpacity + 0.05);
    fill(0, 0, 0, darkOverlayOpacity * 255);
    noStroke();
    rect(0, 0, width, height);

    // 1:1 렌더링으로 렌즈 그리기 (갤러리로 이동하며 축소)
    drawLensFromBG(
      saveAnimation.currentX,
      saveAnimation.currentY,
      saveAnimation.currentRadius,
      window.capturedSrcRect // 고정된 원본 영역 사용
    );

    // 애니메이션 완료 시 화면 닫기
    if (saveAnimation.progress >= 1) {
      showCaptureScreen = false;
      capturedImage = null;
      saveAnimation = null;
      darkOverlayOpacity = 0;
      fixedLensPosition = null; // 렌즈 위치 초기화
      captureAnimation = null; // 캡쳐 애니메이션도 초기화
      isDrawing = false; // 그리기 상태 초기화
      drawingPath = []; // 경로 초기화
      // 안내 텍스트 다시 표시
      showInstructionText = true;
      instructionPulseTime = 0;
      console.log("저장 완료");
    }
  }

  // 캡쳐 화면 표시
  if (
    showCaptureScreen &&
    captureAnimation &&
    !deleteAnimation &&
    !saveAnimation &&
    showInstructionText === false // 캡쳐 화면일 때는 안내 텍스트 숨김
  ) {
    // 배경 다시 그리기 (어둡게 하기 전에)
    drawBackgroundCovered();

    // 배경 어둡게
    darkOverlayOpacity = min(0.7, darkOverlayOpacity + 0.05);
    fill(0, 0, 0, darkOverlayOpacity * 255);
    noStroke();
    rect(0, 0, width, height);

    // 캡쳐 애니메이션 업데이트
    captureAnimation.progress = min(1, captureAnimation.progress + 0.05);
    const t = captureAnimation.progress;
    const easeOut = 1 - Math.pow(1 - t, 3); // ease-out cubic

    captureAnimation.currentX = lerp(
      captureAnimation.startX,
      captureAnimation.targetX,
      easeOut
    );
    captureAnimation.currentY = lerp(
      captureAnimation.startY,
      captureAnimation.targetY,
      easeOut
    );

    const currentRadius = lerp(
      captureAnimation.startRadius,
      captureAnimation.targetRadius,
      easeOut
    );

    // 1:1 렌더링으로 렌즈 그리기
    drawLensFromBG(
      captureAnimation.currentX,
      captureAnimation.currentY,
      currentRadius,
      window.capturedSrcRect // 고정된 원본 영역 사용
    );

    // 버튼들 그리기 (애니메이션 완료 후)
    if (captureAnimation.progress >= 1) {
      drawCaptureButtons();
      drawFeatureLabels();
    }
  } else {
    // 일반 화면
    // 돋보기 표시 로직 - 올가미 완성 시에만 표시
    if (fixedLensPosition) {
      // 중앙으로 이동하며 커지는 애니메이션 업데이트
      if (fixedLensPosition.progress !== undefined) {
        fixedLensPosition.progress = min(1, fixedLensPosition.progress + 0.05);
        const t = fixedLensPosition.progress;
        const easeOut = 1 - Math.pow(1 - t, 3); // ease-out cubic

        // 위치 보간 (올가미 위치 -> 중앙)
        fixedLensPosition.x = lerp(
          fixedLensPosition.startX,
          fixedLensPosition.targetX,
          easeOut
        );
        fixedLensPosition.y = lerp(
          fixedLensPosition.startY,
          fixedLensPosition.targetY,
          easeOut
        );

        // 크기 보간 (올가미 원 크기 -> 최종 크기)
        fixedLensPosition.radius = lerp(
          fixedLensPosition.startRadius,
          fixedLensPosition.targetRadius,
          easeOut
        );
      }

      // 1:1 렌더링으로 렌즈 그리기
      drawLensFromBG(
        fixedLensPosition.x,
        fixedLensPosition.y,
        fixedLensPosition.radius,
        window.capturedSrcRect // 고정된 원본 영역 사용
      );
      drawLensBorder(
        fixedLensPosition.x,
        fixedLensPosition.y,
        fixedLensPosition.radius
      );

      window.currentLens = {
        x: fixedLensPosition.x,
        y: fixedLensPosition.y,
        r: fixedLensPosition.radius,
      };
    } else {
      window.currentLens = null;
    }

    // 드래그 중일 때만 올가미를 overlay에 그림
    if (isDrawing && !fixedLensPosition) {
      drawLasso();
    }

    // 마지막에 overlay를 합성
    if (overlay) image(overlay, 0, 0);

    // UI 요소 그리기 (overlay 위에)
    drawUI();

    // 안내 텍스트 그리기 (LED 깜빡임 효과)
    // 저장/삭제 애니메이션이 없고, 캡쳐 화면이 아니고, 그리기 중이 아니고, 렌즈가 없을 때만 표시
    if (
      showInstructionText &&
      !isDrawing &&
      !fixedLensPosition &&
      !showCaptureScreen &&
      !deleteAnimation &&
      !saveAnimation
    ) {
      drawInstructionText();
    }
  }

  // 모달 그리기 (가장 위에)
  if (showModal) {
    drawModal();
  }
}

// 갤러리 아이콘 중심 좌표 계산 (drawUI와 동일 수식 사용)
function getGalleryIconCenter() {
  const responsiveScale = getResponsiveScale();
  const baseHeight = 48 * 2.2 * responsiveScale;
  const margin = 16 * responsiveScale;
  const verticalGap = -baseHeight * 0.3;

  if (!galleryImg || galleryImg.width === 0) {
    // 안전장치: 대략적인 위치(좌상단)에 둠
    return {
      x: margin + 40 * responsiveScale,
      y: margin + baseHeight + verticalGap + baseHeight / 2,
    };
  }

  const galleryRatio = galleryImg.width / galleryImg.height;
  const galleryW = baseHeight * galleryRatio;

  const x = margin + galleryW / 2;
  const y = margin + baseHeight + verticalGap + baseHeight / 2;
  return { x, y };
}

// UI 요소 그리기 함수
function drawUI() {
  // 반응형 스케일 계산
  const responsiveScale = getResponsiveScale();

  // 기본 크기를 1.5배 * 2배 * 0.8 = 2.4배로 조정하고 반응형 적용
  const baseHeight = 48 * 2.2 * responsiveScale; // 기준 높이 (2.4배 + 반응형)
  const margin = 16 * responsiveScale; // 상단 마진 (반응형)
  const gap = 8 * responsiveScale; // 아이콘 간 간격 (반응형)
  const verticalGap = -baseHeight * 0.3; // 작업실과 갤러리 사이 간격 (겹치도록 음수 값)

  imageMode(CORNER);

  // 왼쪽 끝: 작업실과 갤러리 세로 묶음
  if (workroomImg && workroomImg.width > 0 && workroomImg.height > 0) {
    const workroomRatio = workroomImg.width / workroomImg.height;
    const workroomW = baseHeight * workroomRatio;
    image(workroomImg, margin, margin, workroomW, baseHeight);
  }
  if (galleryImg && galleryImg.width > 0 && galleryImg.height > 0) {
    const galleryRatio = galleryImg.width / galleryImg.height;
    const galleryW = baseHeight * galleryRatio;
    image(
      galleryImg,
      margin,
      margin + baseHeight + verticalGap,
      galleryW,
      baseHeight
    );
  }

  // 중간: 시계와 조도표 가로 묶음
  const centerGroupY = margin;
  let centerGroupStartX = width / 2;
  let totalCenterWidth = 0;

  // 시계와 조도표의 실제 크기 계산
  let clockW = 0;
  let clockH = 0;
  let illuminationW = 0;
  let illuminationH = 0;

  if (clockImg && clockImg.width > 0 && clockImg.height > 0) {
    const clockRatio = clockImg.width / clockImg.height;
    clockH = baseHeight;
    clockW = clockH * clockRatio;
    totalCenterWidth += clockW;
  }

  if (
    illuminationImg &&
    illuminationImg.width > 0 &&
    illuminationImg.height > 0
  ) {
    const illuminationRatio = illuminationImg.width / illuminationImg.height;
    illuminationH = baseHeight;
    illuminationW = illuminationH * illuminationRatio;
    totalCenterWidth += illuminationW + gap;
  }

  // 중앙 그룹 시작 위치 계산
  centerGroupStartX = width / 2 - totalCenterWidth / 2;

  // 시계 그리기
  if (clockImg && clockImg.width > 0 && clockImg.height > 0) {
    image(clockImg, centerGroupStartX, centerGroupY, clockW, clockH);
  }

  // 조도표 그리기
  if (
    illuminationImg &&
    illuminationImg.width > 0 &&
    illuminationImg.height > 0
  ) {
    image(
      illuminationImg,
      centerGroupStartX + clockW + gap,
      centerGroupY,
      illuminationW,
      illuminationH
    );
  }

  // 오른쪽 끝: 개더링 단일
  if (gatheringImg && gatheringImg.width > 0 && gatheringImg.height > 0) {
    const gatheringRatio = gatheringImg.width / gatheringImg.height;
    const gatheringH = baseHeight;
    const gatheringW = gatheringH * gatheringRatio;
    image(
      gatheringImg,
      width - margin - gatheringW,
      margin,
      gatheringW,
      gatheringH
    );
  }
}

// 안내 텍스트 그리기 (LED 깜빡임 효과)
function drawInstructionText() {
  const responsiveScale = getResponsiveScale();

  // LED 펄스 효과 (시간 기반)
  instructionPulseTime += 0.1;
  const pulse = (Math.sin(instructionPulseTime) + 1) * 0.5; // 0~1 사이 값
  const alpha = 0.3 + pulse * 0.7; // 0.3~1.0 사이로 펄스 (살짝 보였다가 사라졌다가)

  push();
  const ctx = drawingContext;
  ctx.save();

  // 텍스트 설정
  textAlign(CENTER, CENTER);
  textSize(24 * responsiveScale);
  textFont("system-ui, -apple-system, sans-serif");
  const textY = height / 2 + 30 * responsiveScale; // 화면 중앙 약간 아래쪽

  // LED 글로우 효과를 위한 여러 레이어 그리기
  // 1단계: 뿌연 글로우 레이어들
  ctx.shadowBlur = 15;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.3})`;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fill(255, 255, 255, alpha * 0.2 * 255);
  text("채집을 원하는 부분에 원을 그려주세요.", width / 2, textY);

  // 2단계: 중간 글로우 레이어
  ctx.shadowBlur = 10;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`;
  fill(255, 255, 255, alpha * 0.4 * 255);
  text("채집을 원하는 부분에 원을 그려주세요.", width / 2, textY);

  // 3단계: 메인 LED 텍스트
  ctx.shadowBlur = 8;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.8})`;
  fill(255, 255, 255, alpha * 255);
  text("채집을 원하는 부분에 원을 그려주세요.", width / 2, textY);

  // 그림자 리셋
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
  pop();
}

// UI 요소 클릭 확인 함수
function checkUIClick(x, y) {
  // 반응형 스케일 계산
  const responsiveScale = getResponsiveScale();

  // 기본 크기를 1.5배 * 2배 * 0.8 = 2.4배로 조정하고 반응형 적용
  const baseHeight = 48 * 1.5 * 2 * 0.8 * responsiveScale; // 기준 높이 (2.4배 + 반응형)
  const margin = 16 * responsiveScale; // 상단 마진 (반응형)
  const gap = 8 * responsiveScale; // 아이콘 간 간격 (반응형)
  const verticalGap = 0; // 작업실과 갤러리 사이 간격 (0으로 설정하여 최소화)

  // 왼쪽: 작업실과 갤러리
  if (workroomImg && workroomImg.width > 0 && workroomImg.height > 0) {
    const workroomRatio = workroomImg.width / workroomImg.height;
    const workroomW = baseHeight * workroomRatio;
    if (
      x >= margin &&
      x <= margin + workroomW &&
      y >= margin &&
      y <= margin + baseHeight
    ) {
      showModal = true;
      modalOpacity = 0;
      modalJustOpened = true; // 모달이 방금 열렸음을 표시
      modalOpenTime = 0; // 시간 초기화
      return true;
    }
  }

  if (galleryImg && galleryImg.width > 0 && galleryImg.height > 0) {
    const galleryRatio = galleryImg.width / galleryImg.height;
    const galleryW = baseHeight * galleryRatio;
    if (
      x >= margin &&
      x <= margin + galleryW &&
      y >= margin + baseHeight + verticalGap &&
      y <= margin + baseHeight + verticalGap + baseHeight
    ) {
      showModal = true;
      modalOpacity = 0;
      modalJustOpened = true; // 모달이 방금 열렸음을 표시
      modalOpenTime = 0; // 시간 초기화
      return true;
    }
  }

  // 중간: 시계와 조도표
  let centerGroupStartX = width / 2;
  let totalCenterWidth = 0;
  let clockW = 0;
  let clockH = 0;
  let illuminationW = 0;
  let illuminationH = 0;

  if (clockImg && clockImg.width > 0 && clockImg.height > 0) {
    const clockRatio = clockImg.width / clockImg.height;
    clockH = baseHeight;
    clockW = clockH * clockRatio;
    totalCenterWidth += clockW;
  }

  if (
    illuminationImg &&
    illuminationImg.width > 0 &&
    illuminationImg.height > 0
  ) {
    const illuminationRatio = illuminationImg.width / illuminationImg.height;
    illuminationH = baseHeight;
    illuminationW = illuminationH * illuminationRatio;
    totalCenterWidth += illuminationW + gap;
  }

  centerGroupStartX = width / 2 - totalCenterWidth / 2;

  if (clockImg && clockImg.width > 0 && clockImg.height > 0) {
    if (
      x >= centerGroupStartX &&
      x <= centerGroupStartX + clockW &&
      y >= margin &&
      y <= margin + clockH
    ) {
      showModal = true;
      modalOpacity = 0;
      modalJustOpened = true; // 모달이 방금 열렸음을 표시
      modalOpenTime = 0; // 시간 초기화
      return true;
    }
  }

  if (
    illuminationImg &&
    illuminationImg.width > 0 &&
    illuminationImg.height > 0
  ) {
    if (
      x >= centerGroupStartX + clockW + gap &&
      x <= centerGroupStartX + clockW + gap + illuminationW &&
      y >= margin &&
      y <= margin + illuminationH
    ) {
      showModal = true;
      modalOpacity = 0;
      modalJustOpened = true; // 모달이 방금 열렸음을 표시
      modalOpenTime = 0; // 시간 초기화
      return true;
    }
  }

  // 오른쪽: 개더링
  if (gatheringImg && gatheringImg.width > 0 && gatheringImg.height > 0) {
    const gatheringRatio = gatheringImg.width / gatheringImg.height;
    const gatheringH = baseHeight;
    const gatheringW = gatheringH * gatheringRatio;
    if (
      x >= width - margin - gatheringW &&
      x <= width - margin &&
      y >= margin &&
      y <= margin + gatheringH
    ) {
      showModal = true;
      modalOpacity = 0;
      modalJustOpened = true; // 모달이 방금 열렸음을 표시
      modalOpenTime = 0; // 시간 초기화
      return true;
    }
  }

  return false;
}

// 모달 그리기 함수 (글래스모피즘 스타일)
function drawModal() {
  // 페이드 인 애니메이션
  if (modalOpacity < 1) {
    modalOpacity = min(1, modalOpacity + 0.1);
  }

  const responsiveScale = getResponsiveScale();
  const modalW = 400 * responsiveScale;
  const modalH = 200 * responsiveScale;
  const modalX = width / 2;
  const modalY = height / 2;
  const modalLeft = modalX - modalW / 2;
  const modalTop = modalY - modalH / 2;
  const borderRadius = 20 * responsiveScale;

  // 닫기 버튼 크기
  const closeBtnSize = 32 * responsiveScale;
  const closeBtnMargin = 12 * responsiveScale;
  const closeBtnX = modalLeft + modalW - closeBtnSize - closeBtnMargin;
  const closeBtnY = modalTop + closeBtnMargin;
  const closeBtnRadius = closeBtnSize / 2;

  push();
  const ctx = drawingContext;
  ctx.save();

  // 배경 오버레이 (반투명 검정)
  fill(0, 0, 0, 100 * modalOpacity);
  noStroke();
  rect(0, 0, width, height);

  // 글래스모피즘 모달 배경
  // 배경 그라데이션
  const gradient = ctx.createLinearGradient(
    modalLeft,
    modalTop,
    modalLeft,
    modalTop + modalH
  );
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.2 * modalOpacity})`);
  gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.15 * modalOpacity})`);
  gradient.addColorStop(1, `rgba(255, 255, 255, ${0.1 * modalOpacity})`);
  ctx.fillStyle = gradient;

  // 그림자 효과
  ctx.shadowBlur = 30;
  ctx.shadowColor = `rgba(0, 0, 0, ${0.5 * modalOpacity})`;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;

  // 둥근 사각형 경로
  ctx.beginPath();
  ctx.moveTo(modalLeft + borderRadius, modalTop);
  ctx.lineTo(modalLeft + modalW - borderRadius, modalTop);
  ctx.quadraticCurveTo(
    modalLeft + modalW,
    modalTop,
    modalLeft + modalW,
    modalTop + borderRadius
  );
  ctx.lineTo(modalLeft + modalW, modalTop + modalH - borderRadius);
  ctx.quadraticCurveTo(
    modalLeft + modalW,
    modalTop + modalH,
    modalLeft + modalW - borderRadius,
    modalTop + modalH
  );
  ctx.lineTo(modalLeft + borderRadius, modalTop + modalH);
  ctx.quadraticCurveTo(
    modalLeft,
    modalTop + modalH,
    modalLeft,
    modalTop + modalH - borderRadius
  );
  ctx.lineTo(modalLeft, modalTop + borderRadius);
  ctx.quadraticCurveTo(modalLeft, modalTop, modalLeft + borderRadius, modalTop);
  ctx.closePath();
  ctx.fill();

  // 테두리 효과 (글래스모피즘)
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * modalOpacity})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();

  // 닫기 버튼 (글래스모피즘 스타일)
  const closeBtnCenterX = closeBtnX + closeBtnSize / 2;
  const closeBtnCenterY = closeBtnY + closeBtnSize / 2;

  ctx.save();

  // 닫기 버튼 배경 (호버 효과를 위한 원)
  const closeBtnGradient = ctx.createRadialGradient(
    closeBtnCenterX,
    closeBtnCenterY,
    0,
    closeBtnCenterX,
    closeBtnCenterY,
    closeBtnRadius
  );
  closeBtnGradient.addColorStop(
    0,
    `rgba(255, 255, 255, ${0.15 * modalOpacity})`
  );
  closeBtnGradient.addColorStop(
    1,
    `rgba(255, 255, 255, ${0.05 * modalOpacity})`
  );
  ctx.fillStyle = closeBtnGradient;
  ctx.beginPath();
  ctx.arc(closeBtnCenterX, closeBtnCenterY, closeBtnRadius, 0, Math.PI * 2);
  ctx.fill();

  // 닫기 버튼 테두리
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * modalOpacity})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // X 아이콘 그리기
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * modalOpacity})`;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  const xSize = closeBtnSize * 0.4;
  ctx.beginPath();
  ctx.moveTo(closeBtnCenterX - xSize / 2, closeBtnCenterY - xSize / 2);
  ctx.lineTo(closeBtnCenterX + xSize / 2, closeBtnCenterY + xSize / 2);
  ctx.moveTo(closeBtnCenterX + xSize / 2, closeBtnCenterY - xSize / 2);
  ctx.lineTo(closeBtnCenterX - xSize / 2, closeBtnCenterY + xSize / 2);
  ctx.stroke();

  ctx.restore();

  // 텍스트
  fill(255, 255, 255, 255 * modalOpacity);
  textAlign(CENTER, CENTER);
  textSize(18 * responsiveScale);
  textFont("system-ui, -apple-system, sans-serif");
  text("현재 채집 화면만 체험 가능합니다", modalX, modalY);

  pop();

  // 닫기 버튼 영역 저장 (클릭 감지용)
  window.modalCloseBtn = {
    x: closeBtnX,
    y: closeBtnY,
    w: closeBtnSize,
    h: closeBtnSize,
  };
}

// 캡쳐 화면 버튼 그리기
function drawCaptureButtons() {
  const responsiveScale = getResponsiveScale();
  const centerX = width / 2;
  const centerY = height / 2;
  const buttonY =
    centerY + (captureAnimation.targetRadius || 200) + 40 * responsiveScale;

  const buttonHeight = 50 * responsiveScale;
  const buttonPaddingX = 30 * responsiveScale;
  const buttonPaddingY = 20 * responsiveScale;
  const buttonGap = 10 * responsiveScale;
  const borderRadius = 30 * responsiveScale;

  const buttons = [
    { text: "저장하기", action: "save" },
    { text: "삭제하기", action: "delete" },
  ];

  // 버튼 텍스트 크기 측정 및 배치
  textSize(16 * responsiveScale);
  textFont("system-ui, -apple-system, sans-serif");
  textAlign(CENTER, CENTER);

  let totalWidth = 0;
  const buttonWidths = [];

  for (let btn of buttons) {
    const textW = textWidth(btn.text);
    const btnW = textW + buttonPaddingX * 2;
    buttonWidths.push(btnW);
    totalWidth += btnW;
    if (buttons.indexOf(btn) < buttons.length - 1) {
      totalWidth += buttonGap;
    }
  }

  let currentX = centerX - totalWidth / 2;

  push();
  const ctx = drawingContext;

  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i];
    const btnW = buttonWidths[i];
    const btnX = currentX;
    const btnY = buttonY;

    // 버튼 배경 (글래스모피즘 스타일)
    ctx.save();
    ctx.fillStyle = "rgba(165, 242, 221, 0.30)";
    ctx.shadowBlur = 30;
    ctx.shadowColor = "rgba(128, 128, 128, 0.30)";
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 7;

    // 둥근 사각형
    ctx.beginPath();
    ctx.moveTo(btnX + borderRadius, btnY);
    ctx.lineTo(btnX + btnW - borderRadius, btnY);
    ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + borderRadius);
    ctx.lineTo(btnX + btnW, btnY + buttonHeight - borderRadius);
    ctx.quadraticCurveTo(
      btnX + btnW,
      btnY + buttonHeight,
      btnX + btnW - borderRadius,
      btnY + buttonHeight
    );
    ctx.lineTo(btnX + borderRadius, btnY + buttonHeight);
    ctx.quadraticCurveTo(
      btnX,
      btnY + buttonHeight,
      btnX,
      btnY + buttonHeight - borderRadius
    );
    ctx.lineTo(btnX, btnY + borderRadius);
    ctx.quadraticCurveTo(btnX, btnY, btnX + borderRadius, btnY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 버튼 텍스트
    fill(255, 255, 255, 255);
    text(btn.text, btnX + btnW / 2, btnY + buttonHeight / 2);

    // 버튼 영역 저장 (클릭 감지용)
    if (!window.captureButtons) window.captureButtons = [];
    window.captureButtons[i] = {
      x: btnX,
      y: btnY,
      w: btnW,
      h: buttonHeight,
      action: btn.action,
    };

    currentX += btnW + buttonGap;
  }

  pop();
}

// 둥근 사각형 경로 헬퍼
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

// 글래스 라벨 하나 그리기 (배경 재렌더+블러+틴트+테두리+스펙큘러)
function drawGlassLabel(x, y, w, h, r) {
  const ctx = drawingContext;

  // 1) 아웃샤도우 (라벨 외곽 글로우)
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.shadowBlur = 18;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.fillStyle = "rgba(0,0,0,0.001)"; // 내용 영향 없이 그림자만
  ctx.fill();
  ctx.restore();

  // 2) 클립 후, 배경을 다시 그리면서 필터 적용 → 백드롭 블러 효과
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  if (bgImg && cachedCoverFit) {
    const { offsetX, offsetY, drawW, drawH } = cachedCoverFit;

    // 유리감: 블러 + 채도↑ + 밝기↓ (더 어둡고 흐리게)
    ctx.filter = "blur(16px) saturate(140%) brightness(60%)";
    const src = bgImg.canvas || bgImg.elt;
    ctx.drawImage(
      src,
      0,
      0,
      bgImg.width,
      bgImg.height,
      offsetX,
      offsetY,
      drawW,
      drawH
    );
    ctx.filter = "none";
  }

  // 3) 어두운 오버레이 (배경을 더 어둡게)
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x, y, w, h);

  // 4) 유리 틴트(상→하 미묘한 그라디언트)
  const tint = ctx.createLinearGradient(x, y, x, y + h);
  tint.addColorStop(0, "rgba(255,255,255,0.15)");
  tint.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);

  // 5) 유리 테두리(대각선 그라디언트 하이라이트)
  const edge = ctx.createLinearGradient(x, y, x + w, y + h);
  edge.addColorStop(0, "rgba(255,255,255,0.75)");
  edge.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.restore();
}

// 특징 라벨 그리기 (glass 스타일 참고, 방사형 랜덤 배치)
function drawFeatureLabels() {
  if (!window.capturedFeatures || window.capturedFeatures.length === 0) return;
  if (!captureAnimation) return;

  const responsiveScale = getResponsiveScale();
  const centerX = captureAnimation.currentX ?? width / 2;
  const centerY = captureAnimation.currentY ?? height / 2;
  const lensR = captureAnimation.targetRadius ?? 200;

  const padX = 32 * responsiveScale; // 라벨 마진 더 크게 (글자보다 더 크게)
  const labelH = 50 * responsiveScale; // 라벨 높이 더 크게 (위아래로 뚱뚱하게)
  const radius = 79 * responsiveScale;

  textSize(18 * responsiveScale);
  textFont("system-ui, -apple-system, sans-serif");
  textAlign(CENTER, CENTER);

  // 라벨 위치를 한 번만 계산하고 저장 (랜덤 위치 고정)
  if (
    !window.featureLabelPositions ||
    window.featureLabelPositions.length !== window.capturedFeatures.length
  ) {
    window.featureLabelPositions = [];
    const minDist = lensR + 80 * responsiveScale;
    const maxDist = Math.min(width, height) * 0.4;

    for (let i = 0; i < window.capturedFeatures.length; i++) {
      let attempts = 0;
      let labelX, labelY;
      let validPosition = false;

      // 유효한 위치를 찾을 때까지 시도
      while (!validPosition && attempts < 50) {
        // 방사형 랜덤 위치 계산
        const ang = Math.random() * Math.PI * 2;
        const distR = minDist + Math.random() * (maxDist - minDist);
        labelX = centerX + Math.cos(ang) * distR;
        labelY = centerY + Math.sin(ang) * distR;

        // 화면 경계 체크 (# 포함)
        const tw = textWidth("# " + window.capturedFeatures[i]);
        const labelW = tw + padX * 2;
        const margin = 20 * responsiveScale;

        // 라벨은 화면 위아래 25%씩 제외하고 가운데 50%에만 존재
        const topBoundary = height * 0.25; // 상단 25% 제외
        const bottomBoundary = height * 0.75; // 하단 25% 제외
        const labelTop = labelY - labelH / 2;
        const labelBottom = labelY + labelH / 2;
        const inVerticalRange =
          labelTop >= topBoundary && labelBottom <= bottomBoundary;

        // 버튼 영역 계산 (버튼이 표시되는 영역 피하기)
        const buttonY = centerY + lensR + 40 * responsiveScale;
        const buttonHeight = 50 * responsiveScale;
        const buttonAreaTop = buttonY - 20 * responsiveScale; // 버튼 위 여유 공간
        const buttonAreaBottom = buttonY + buttonHeight + 20 * responsiveScale; // 버튼 아래 여유 공간

        // 라벨이 버튼 영역과 겹치지 않는지 체크
        const notInButtonArea =
          labelBottom < buttonAreaTop || labelTop > buttonAreaBottom;

        // 기존 라벨들과 겹치지 않는지 체크
        const padding = 15 * responsiveScale; // 라벨 간 최소 간격
        let noOverlap = true;
        for (let j = 0; j < window.featureLabelPositions.length; j++) {
          const existingPos = window.featureLabelPositions[j];
          const existingTw = textWidth("# " + window.capturedFeatures[j]);
          const existingW = existingTw + padX * 2;

          // 두 라벨의 경계 박스 계산
          const thisLeft = labelX - labelW / 2;
          const thisRight = labelX + labelW / 2;
          const thisTop = labelY - labelH / 2;
          const thisBottom = labelY + labelH / 2;

          const existingLeft = existingPos.x - existingW / 2;
          const existingRight = existingPos.x + existingW / 2;
          const existingTop = existingPos.y - labelH / 2;
          const existingBottom = existingPos.y + labelH / 2;

          // 겹침 체크 (패딩 포함)
          if (
            !(
              thisRight + padding < existingLeft ||
              thisLeft - padding > existingRight ||
              thisBottom + padding < existingTop ||
              thisTop - padding > existingBottom
            )
          ) {
            noOverlap = false;
            break;
          }
        }

        if (
          labelX - labelW / 2 >= margin &&
          labelX + labelW / 2 <= width - margin &&
          inVerticalRange && // 화면 가운데 50% 영역 체크
          notInButtonArea && // 버튼 영역 체크
          noOverlap // 라벨 간 겹침 체크
        ) {
          validPosition = true;
        }
        attempts++;
      }

      // 유효한 위치를 못 찾으면 기본 위치 사용
      if (!validPosition) {
        const ang = (i / window.capturedFeatures.length) * Math.PI * 2;
        const distR = minDist + 50 * responsiveScale;
        labelX = centerX + Math.cos(ang) * distR;
        labelY = centerY + Math.sin(ang) * distR;
      }

      window.featureLabelPositions.push({ x: labelX, y: labelY });
    }
  }

  // 실제 그리기
  for (let i = 0; i < window.capturedFeatures.length; i++) {
    const feature = window.capturedFeatures[i];
    const pos = window.featureLabelPositions[i];
    if (!pos) continue;

    const tw = textWidth("# " + feature);
    const labelW = tw + padX * 2;
    const x = pos.x - labelW / 2;
    const y = pos.y - labelH / 2;

    // 글래스 라벨(백드롭 블러+유리 표현)
    drawGlassLabel(x, y, labelW, labelH, radius);

    // C) 텍스트 (미세한 그림자로 가독성 ↑, # 추가)
    push();
    fill(255);
    drawingContext.shadowBlur = 4;
    drawingContext.shadowColor = "rgba(0,0,0,0.25)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 2;
    text("# " + feature, pos.x, pos.y);
    pop();
  }
}

// 캡쳐 버튼 클릭 처리
function handleCaptureButtonClick(action) {
  switch (action) {
    case "save":
      // 저장 애니메이션 시작: 중앙(현재) → 갤러리 아이콘으로 축소 이동
      if (captureAnimation) {
        const startX = captureAnimation.currentX ?? width / 2;
        const startY = captureAnimation.currentY ?? height / 2;
        const startRadius = captureAnimation.targetRadius ?? lensRadius;
        const { x: gx, y: gy } = getGalleryIconCenter();
        saveAnimation = {
          progress: 0,
          startX,
          startY,
          currentX: startX,
          currentY: startY,
          targetX: gx,
          targetY: gy,
          startRadius: startRadius,
          currentRadius: startRadius,
          targetRadius: 12, // 갤러리로 빨려 들어가는 느낌
        };
        // 캡쳐 고정 애니메이션은 멈춤 (버튼 숨김)
        captureAnimation = null;
      }
      // 안내 텍스트 다시 표시
      showInstructionText = true;
      instructionPulseTime = 0;
      break;
    case "delete":
      // 삭제 애니메이션 시작: 버블처럼 터지며 사라짐
      if (captureAnimation) {
        const cx = captureAnimation.currentX ?? width / 2;
        const cy = captureAnimation.currentY ?? height / 2;
        const cr = captureAnimation.targetRadius ?? lensRadius;
        deleteAnimation = {
          progress: 0,
          x: cx,
          y: cy,
          baseR: cr, // 기본 반지름 (1:1 렌더링용)
        };
        // 캡쳐 고정 애니메이션은 멈춤 (버튼 숨김)
        captureAnimation = null;
      }
      // 안내 텍스트 다시 표시
      showInstructionText = true;
      instructionPulseTime = 0;
      break;
  }
}
