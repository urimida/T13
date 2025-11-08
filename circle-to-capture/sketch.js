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
const zoom = 2.0; // 확대 배율

// 올가미/버블 관련 변수
let isDrawing = false;
let drawingPath = [];
let bubbles = []; // 저장된 버블들
const minCircleRadius = 50; // 최소 원 반지름
const circleTolerance = 0.3; // 원 인식 허용 오차 (0-1)
let fixedLensPosition = null; // 고정된 돋보기 위치 (버블 생성 시 설정)
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

function drawLens(mx, my, scale = 1, opacity = 1, rotation = 0) {
  if (!bgImg || !overlay) return;

  // 배경이 화면에 그려진 동일 스케일을 참고하여, 확대용으로 재-렌더링
  // 캐시된 값 사용
  if (
    !cachedCoverFit ||
    lastCanvasSize.w !== width ||
    lastCanvasSize.h !== height
  ) {
    cachedCoverFit = computeCoverFit(bgImg.width, bgImg.height, width, height);
    lastCanvasSize = { w: width, h: height };
  }
  const cover = cachedCoverFit;

  // overlay에 렌즈 그리기 (메인 캔버스에 잔상 남지 않도록)
  const ctx = overlay.drawingContext;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(mx, my);
  ctx.rotate(rotation); // 회전 추가
  ctx.scale(scale, scale);
  ctx.translate(-mx, -my);
  ctx.beginPath();
  ctx.arc(mx, my, lensRadius, 0, Math.PI * 2);
  ctx.clip();

  // 확대 배율만큼 변환하여, 포인터 아래의 지점을 중심에 오도록 그리기
  ctx.save();
  ctx.translate(mx, my);
  ctx.scale(zoom, zoom);

  // 스케일 전 좌표계에서 포인터가 가리키던 배경 위치를 역보정
  const imgX = mx - cover.offsetX;
  const imgY = my - cover.offsetY;
  const centerShiftX = -imgX + lensRadius / zoom;
  const centerShiftY = -imgY + lensRadius / zoom;
  ctx.translate(centerShiftX, centerShiftY);

  // 확대된 배경 렌더 (overlay에)
  overlay.image(bgImg, cover.offsetX, cover.offsetY, cover.drawW, cover.drawH);
  ctx.restore();

  // 가장자리 페더(뭉개짐) 표현: 라디얼 그라디언트 오버레이로 부드러운 경계
  const feather = 28; // 페더 범위(px)
  const grad = ctx.createRadialGradient(
    mx,
    my,
    Math.max(1, lensRadius - feather),
    mx,
    my,
    lensRadius + 1
  );
  grad.addColorStop(0.0, "rgba(255,255,255,0)");
  grad.addColorStop(1.0, "rgba(255,255,255,0.55)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(mx, my, lensRadius + 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // 검정 방사형 그라디언트 스트로크
  ctx.save();
  const strokeFeather = 10; // 외곽으로 번지는 정도
  const strokeGrad = ctx.createRadialGradient(
    mx,
    my,
    Math.max(1, lensRadius - 1),
    mx,
    my,
    lensRadius + strokeFeather
  );
  strokeGrad.addColorStop(0.0, "rgba(255,255,255,0.9)");
  strokeGrad.addColorStop(1.0, "rgba(255,255,255,0)");

  ctx.beginPath();
  ctx.arc(mx, my, lensRadius, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeGrad;
  ctx.stroke();
  ctx.restore();
}

function getPointer() {
  if (touches && touches.length > 0) {
    return { x: touches[0].x, y: touches[0].y };
  }
  return { x: mouseX, y: mouseY };
}

// 드래그 시작 (p5.js 이벤트)
function mousePressed() {
  // UI 요소 클릭 확인
  if (checkUIClick(mouseX, mouseY)) {
    return false; // UI 클릭이면 올가미 시작하지 않음
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
  if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
    drawingPath.push({ x: mouseX, y: mouseY });
  }
  lastDrawingPathLength = drawingPath.length;
  return false; // 기본 동작 방지
}

function touchStarted() {
  // UI 요소 클릭 확인
  if (touches && touches.length > 0) {
    if (checkUIClick(touches[0].x, touches[0].y)) {
      return false; // UI 클릭이면 올가미 시작하지 않음
    }
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
  if (touches && touches.length > 0) {
    drawingPath.push({ x: touches[0].x, y: touches[0].y });
  }
  lastDrawingPathLength = drawingPath.length;
  return false; // 기본 동작 방지
}

// 드래그 종료 (p5.js 이벤트)
function mouseReleased() {
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
        mouseX >= btn.x &&
        mouseX <= btn.x + btn.w &&
        mouseY >= btn.y &&
        mouseY <= btn.y + btn.h
      ) {
        showModal = false;
        modalOpacity = 0;
        return false;
      }
    }

    // 모달 외부 클릭 시 닫기
    if (
      mouseX < modalLeft ||
      mouseX > modalRight ||
      mouseY < modalTop ||
      mouseY > modalBottom
    ) {
      showModal = false;
      modalOpacity = 0;
      return false;
    }
  }

  // 드래그가 아닌 단순 클릭이면 고정된 돋보기 터짐 애니메이션 시작
  if (!hasDragged && fixedLensPosition) {
    // 렌즈 터짐 애니메이션 시작
    lensAnimation = {
      x: fixedLensPosition.x,
      y: fixedLensPosition.y,
      scale: 1,
      opacity: 1,
      rotation: 0,
      progress: 0, // 0 ~ 1
    };
    fixedLensPosition = null; // 렌즈 위치는 null로 설정하되 애니메이션은 계속
    isDrawing = false;
    drawingPath = [];
    return false;
  }

  if (!isDrawing || drawingPath.length < 10) {
    isDrawing = false;
    drawingPath = [];
    overlayNeedsClear = true;
    lastDrawnPathIndex = 0;
    if (overlay) overlay.clear(); // ✅
    return false;
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
  return false;
}

function touchEnded() {
  // 모달이 열려있으면 닫기 버튼 또는 모달 외부 터치 시 닫기
  if (showModal && !hasDragged && touches && touches.length > 0) {
    const responsiveScale = getResponsiveScale();
    const modalX = width / 2;
    const modalY = height / 2;
    const modalW = 400 * responsiveScale;
    const modalH = 200 * responsiveScale;
    const modalLeft = modalX - modalW / 2;
    const modalRight = modalX + modalW / 2;
    const modalTop = modalY - modalH / 2;
    const modalBottom = modalY + modalH / 2;

    const tx = touches[0].x;
    const ty = touches[0].y;

    // 닫기 버튼 터치 확인
    if (window.modalCloseBtn) {
      const btn = window.modalCloseBtn;
      if (
        tx >= btn.x &&
        tx <= btn.x + btn.w &&
        ty >= btn.y &&
        ty <= btn.y + btn.h
      ) {
        showModal = false;
        modalOpacity = 0;
        return false;
      }
    }

    // 모달 외부 터치 시 닫기
    if (
      tx < modalLeft ||
      tx > modalRight ||
      ty < modalTop ||
      ty > modalBottom
    ) {
      showModal = false;
      modalOpacity = 0;
      return false;
    }
  }

  // 드래그가 아닌 단순 터치면 고정된 돋보기 터짐 애니메이션 시작
  if (!hasDragged && fixedLensPosition) {
    // 렌즈 터짐 애니메이션 시작
    lensAnimation = {
      x: fixedLensPosition.x,
      y: fixedLensPosition.y,
      scale: 1,
      opacity: 1,
      rotation: 0,
      progress: 0, // 0 ~ 1
    };
    fixedLensPosition = null; // 렌즈 위치는 null로 설정하되 애니메이션은 계속
    isDrawing = false;
    drawingPath = [];
    return false;
  }

  if (!isDrawing || drawingPath.length < 10) {
    isDrawing = false;
    drawingPath = [];
    overlayNeedsClear = true;
    lastDrawnPathIndex = 0;
    if (overlay) overlay.clear(); // ✅
    return false;
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
  return false;
}

// 드래그 중 경로 업데이트
function mouseDragged() {
  hasDragged = true; // 드래그 중임을 표시
  if (isDrawing && Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
    // 마지막 점과의 거리가 충분하면 추가
    if (
      drawingPath.length === 0 ||
      dist(
        mouseX,
        mouseY,
        drawingPath[drawingPath.length - 1].x,
        drawingPath[drawingPath.length - 1].y
      ) > 5
    ) {
      drawingPath.push({ x: mouseX, y: mouseY });

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
  return false;
}

function touchMoved() {
  hasDragged = true; // 드래그 중임을 표시
  if (isDrawing && touches && touches.length > 0) {
    const tx = touches[0].x;
    const ty = touches[0].y;
    // 마지막 점과의 거리가 충분하면 추가
    if (
      drawingPath.length === 0 ||
      dist(
        tx,
        ty,
        drawingPath[drawingPath.length - 1].x,
        drawingPath[drawingPath.length - 1].y
      ) > 5
    ) {
      drawingPath.push({ x: tx, y: ty });

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

// 렌즈 고정 전용 (버블 생성 로직 제거)
function captureBubble(circle) {
  // 버블 관련 로직 전부 제거
  // -> 버블 배열도 비우고, 저장 안 함
  bubbles = []; // 혹시 남아있던 이전 버블 제거

  // 올가미 자국 제거
  isDrawing = false;
  drawingPath = [];
  lastDrawnPathIndex = 0;

  // 렌즈만 고정
  fixedLensPosition = { x: circle.x, y: circle.y };

  // 흔적 완전 제거
  overlayNeedsClear = true;
  if (overlay) overlay.clear();
}

// 올가미 경로 그리기 (증분 렌더링 최적화)
function drawLasso() {
  // 구슬이 생성되면 올가미를 그리지 않음
  if (!isDrawing || drawingPath.length < 2 || fixedLensPosition || !overlay)
    return;

  const ctx = overlay.drawingContext;
  ctx.save();

  // 증분 렌더링: 마지막으로 그린 부분 이후만 추가로 그리기
  const startIndex = Math.max(0, lastDrawnPathIndex - 1); // 이전 점부터 시작하여 연결

  // 경로가 새로 시작되었거나 전체를 다시 그려야 하는 경우
  if (overlayNeedsClear || startIndex === 0) {
    // 전체 경로 다시 그리기
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
    for (let i = 1; i < drawingPath.length; i++) {
      ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
    }

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

    // 올가미 테두리
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(drawingPath[0].x, drawingPath[0].y);
    for (let i = 1; i < drawingPath.length; i++) {
      ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
    }
    ctx.stroke();
  } else {
    // 증분 렌더링: 마지막 선분만 추가
    if (startIndex < drawingPath.length - 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();

      // 이전 점부터 현재 마지막 점까지 선 그리기
      const prevPoint = drawingPath[startIndex];
      ctx.moveTo(prevPoint.x, prevPoint.y);
      for (let i = startIndex + 1; i < drawingPath.length; i++) {
        ctx.lineTo(drawingPath[i].x, drawingPath[i].y);
      }
      ctx.stroke();

      // 채우기도 업데이트 (전체 경로 다시 그리기 - 하지만 최적화됨)
      if (drawingPath.length > 2) {
        const start = drawingPath[0];
        const end = drawingPath[drawingPath.length - 1];
        const distance = dist(end.x, end.y, start.x, start.y);
        if (distance < 100) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
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

  // 렌즈 터짐 애니메이션 업데이트 및 렌더링
  if (lensAnimation) {
    // 진행도 업데이트 (0 -> 1)
    lensAnimation.progress += 0.12;

    if (lensAnimation.progress >= 1) {
      // 애니메이션 완료 - 제거
      lensAnimation = null;
    } else {
      // 이징 함수 (ease-out cubic)로 부드러운 터짐 효과
      const t = lensAnimation.progress;
      const easeOut = 1 - Math.pow(1 - t, 3);

      // 스케일: 1.0 -> 2.2 (더 크게 터짐)
      lensAnimation.scale = 1 + easeOut * 1.2;

      // 투명도: 1.0 -> 0 (빠르게 사라짐)
      lensAnimation.opacity = 1 - easeOut;

      // 회전: 약간 회전하면서 터짐
      lensAnimation.rotation = easeOut * Math.PI * 0.3;

      // 애니메이션 중인 렌즈 그리기
      drawLens(
        lensAnimation.x,
        lensAnimation.y,
        lensAnimation.scale,
        lensAnimation.opacity,
        lensAnimation.rotation
      );
    }
  }

  // 돋보기 표시 로직 - 올가미 완성 시에만 표시
  if (fixedLensPosition) {
    // 고정된 돋보기 위치에 표시 (overlay에 그리기)
    drawLens(fixedLensPosition.x, fixedLensPosition.y);
    window.currentLens = {
      x: fixedLensPosition.x,
      y: fixedLensPosition.y,
      r: lensRadius,
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

  // 모달 그리기 (가장 위에)
  if (showModal) {
    drawModal();
  }
}

// UI 요소 그리기 함수
function drawUI() {
  // 반응형 스케일 계산
  const responsiveScale = getResponsiveScale();

  // 기본 크기를 1.5배로 키우고 반응형 적용
  const baseHeight = 48 * 1.5 * responsiveScale; // 기준 높이 (1.5배 + 반응형)
  const margin = 16 * responsiveScale; // 상단 마진 (반응형)
  const gap = 8 * responsiveScale; // 아이콘 간 간격 (반응형)

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
    image(galleryImg, margin, margin + baseHeight + gap, galleryW, baseHeight);
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

// UI 요소 클릭 확인 함수
function checkUIClick(x, y) {
  // 반응형 스케일 계산
  const responsiveScale = getResponsiveScale();

  // 기본 크기를 1.5배로 키우고 반응형 적용
  const baseHeight = 48 * 1.5 * responsiveScale; // 기준 높이 (1.5배 + 반응형)
  const margin = 16 * responsiveScale; // 상단 마진 (반응형)
  const gap = 8 * responsiveScale; // 아이콘 간 간격 (반응형)

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
      return true;
    }
  }

  if (galleryImg && galleryImg.width > 0 && galleryImg.height > 0) {
    const galleryRatio = galleryImg.width / galleryImg.height;
    const galleryW = baseHeight * galleryRatio;
    if (
      x >= margin &&
      x <= margin + galleryW &&
      y >= margin + baseHeight + gap &&
      y <= margin + baseHeight + gap + baseHeight
    ) {
      showModal = true;
      modalOpacity = 0;
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
