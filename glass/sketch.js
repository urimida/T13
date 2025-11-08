let bgImg;

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
  bgImg = loadImage("assets/img/background.svg");
}

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.parent(document.querySelector("main"));
  noStroke();

  overlay = createGraphics(windowWidth, windowHeight);
  overlay.clear(); // 완전 투명
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  // overlay도 캔버스와 동일 크기로 재생성
  overlay = createGraphics(windowWidth, windowHeight);
  overlay.clear();
}

function drawBackgroundCovered() {
  if (!bgImg) return;
  const { drawW, drawH, offsetX, offsetY } = computeCoverFit(
    bgImg.width,
    bgImg.height,
    width,
    height
  );
  image(bgImg, offsetX, offsetY, drawW, drawH);
}

function drawLens(mx, my, scale = 1, opacity = 1, rotation = 0) {
  if (!bgImg) return;

  // 배경이 화면에 그려진 동일 스케일을 참고하여, 확대용으로 재-렌더링
  const cover = computeCoverFit(bgImg.width, bgImg.height, width, height);

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
  // 이전 올가미 잔상 즉시 제거
  isDrawing = false;
  drawingPath = [];

  // 새로운 드래그 시작
  hasDragged = false;
  isDrawing = true;
  drawingPath = [];
  if (Number.isFinite(mouseX) && Number.isFinite(mouseY)) {
    drawingPath.push({ x: mouseX, y: mouseY });
  }
  return false; // 기본 동작 방지
}

function touchStarted() {
  // 이전 올가미 잔상 즉시 제거
  isDrawing = false;
  drawingPath = [];

  // 새로운 드래그 시작
  hasDragged = false;
  isDrawing = true;
  drawingPath = [];
  if (touches && touches.length > 0) {
    drawingPath.push({ x: touches[0].x, y: touches[0].y });
  }
  return false; // 기본 동작 방지
}

// 드래그 종료 (p5.js 이벤트)
function mouseReleased() {
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
    overlay.clear(); // ✅
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
  overlay.clear(); // ✅
  return false;
}

function touchEnded() {
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
    overlay.clear(); // ✅
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
  overlay.clear(); // ✅
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

  // 렌즈만 고정
  fixedLensPosition = { x: circle.x, y: circle.y };

  // 흔적 완전 제거
  overlay.clear();
}

// 올가미 경로 그리기
function drawLasso() {
  // 구슬이 생성되면 올가미를 그리지 않음
  if (!isDrawing || drawingPath.length < 2 || fixedLensPosition) return;

  const ctx = overlay.drawingContext; // ✅ 변경: overlay에 그림
  // overlay.clear()는 draw()에서 매 프레임 호출하므로 여기서는 불필요

  ctx.save();

  // 올가미 채우기 (반투명)
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
    }
  }

  // 올가미 테두리
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

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

  // overlay 초기화 (매 프레임마다 깨끗하게)
  overlay.clear();

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
  image(overlay, 0, 0);
}
