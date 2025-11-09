let bgImg;

// 돋보기 설정 (요청 스펙: 지름 370px)
const lensDiameter = 370;
const lensRadius = lensDiameter / 2;
const zoom = 2.0; // 확대 배율

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
}

function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.parent(document.querySelector("main"));
  noStroke();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
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

function drawLens(mx, my) {
  if (!bgImg) return;

  // 배경이 화면에 그려진 동일 스케일을 참고하여, 확대용으로 재-렌더링
  const cover = computeCoverFit(bgImg.width, bgImg.height, width, height);

  // 캔버스 2D 컨텍스트를 사용해 원형 클리핑
  const ctx = drawingContext;
  ctx.save();
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

  // 확대된 배경 렌더
  image(bgImg, cover.offsetX, cover.offsetY, cover.drawW, cover.drawH);
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

function draw() {
  background(255);
  drawBackgroundCovered();

  const { x, y } = getPointer();
  if (Number.isFinite(x) && Number.isFinite(y)) {
    drawLens(x, y);
    // 렌즈 정보 전역 공개: DOM 태그와의 충돌 판정에 사용
    window.currentLens = { x, y, r: lensRadius };
  } else {
    window.currentLens = null;
  }
}
