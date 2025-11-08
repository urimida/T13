/* =========================================================
   Interactive Bubbles — Apple Watch Style Honeycomb
   요구사항:
   1) 헥사곤 패턴 밀집 배치
   2) 중앙 집중형 크기 변화 (피시아이 렌즈 효과)
   3) 스와이프로 배경 이동 탐색
   ========================================================= */

let bubbles = []; // 모든 버블들
let searchIcon; // 돋보기 아이콘 이미지
let captureButton; // 캡쳐 버튼 이미지
let workroomButton; // 워크룸 버튼 이미지
let navigationBar; // 네비게이션 바 이미지
let bgImage; // 배경 이미지
let searchInput; // 검색 입력 필드
let bubbleCap; // 버블 캡 이미지

// ---------- CONFIG ----------
const BG_COLOR = "#1a1b1f";
const NAV_COLOR = "rgba(255,255,255,0.06)";
const SEARCH_COLOR = "rgba(255,255,255,0.08)";
const RING_COLOR = "rgba(255,255,255,0.25)";
const RING_THICK = 8;

const BUBBLE_GLOSS = true;
const NOISE_PUSH = 0.0; // ← 거의 안 움직이게: 드리프트 0
const BOUNCE_DAMP = 0.95;
const MAX_SPEED = 0.1; // ← 최소한만 허용(사실상 정지)

// 버블을 프레임 반지름의 몇 배로 할지 (더 크게)
const BUBBLE_RADIUS_FACTOR = 0.92;
const SEP_PAD = 25; // 프레임 사이 최소 여백(픽셀) - 겹침 방지용

// 헥사곤 배치 설정
const TOTAL_BUBBLES = 35; // 총 버블 개수 (35개로 제한)
const BASE_BUBBLE_RADIUS = 25; // 기본 버블 반지름
const MAX_BUBBLE_RADIUS = 160; // 최대 버블 반지름 (중심) - 더 크게
const MIN_BUBBLE_RADIUS = 15; // 최소 버블 반지름 (가장자리)
const HEX_SPACING = 80; // 헥사곤 간격 - 더 넓게
const CENTER_X_RATIO = 0.5; // 화면 중심 X 비율
const CENTER_Y_RATIO = 0.55; // 화면 중심 Y 비율
const FISHEYE_STRENGTH = 2.5; // 피시아이 효과 강도
const CENTER_INFLUENCE_RADIUS = 200; // 중앙 버블이 주변에 영향을 미치는 반경
const PAN_SENSITIVITY = 0.6; // 패닝 감도 (낮을수록 느림)
const SEARCH_SCALE = 0.7 * 0.7; // 검색창 스케일
const SEARCH_Y = 120; // 검색창 Y 위치

// 성능 최적화 설정
const MAX_DRAW = 140; // 그릴 최대 버블 수 (LOD)
const SPRITE_STEP = 6; // 반지름 버킷 간격(px) - 스프라이트 캐시용

// 전역 변수 (성능 최적화)
let WORLD_W, WORLD_H; // 월드 크기 (재사용)
let bgBuffer; // 배경 버퍼
let animating = true; // 애니메이션 상태
const SPRITES = new Map(); // 스프라이트 캐시 (key: "bucket|hue", val: {g, size})

// UI sizes
const NAV_H = 64;
const SEARCH_W_RATIO = 0.56;

// ---------- STATE for panning ----------
let offsetX = 0; // X 오프셋 (스와이프로 이동)
let offsetY = 0; // Y 오프셋
let isDragging = false; // 드래그 중인지
let dragStartX = 0; // 드래그 시작 X
let dragStartY = 0; // 드래그 시작 Y
let dragOffsetX = 0; // 드래그 시작 시 오프셋 X
let dragOffsetY = 0; // 드래그 시작 시 오프셋 Y
let panVelocityX = 0; // X 방향 이동 속도 (관성)
let panVelocityY = 0; // Y 방향 이동 속도 (관성)

// ---------- CLASSES ----------
class FrameCircle {
  constructor(index, cx, cy, r) {
    this.index = index; // 1~8 느낌으로 인덱싱
    this.cx = cx;
    this.cy = cy;
    this.r = r;
  }
  draw(highlight = false) {
    noFill();
    strokeWeight(RING_THICK);
    stroke(highlight ? "rgba(255,255,255,0.55)" : RING_COLOR);
    circle(this.cx, this.cy, this.r * 2);
  }
  containsPoint(px, py) {
    return dist(px, py, this.cx, this.cy) <= this.r;
  }
}

class Bubble {
  constructor(gridX, gridY, hueSeed) {
    this.gridX = gridX; // 그리드 X 좌표
    this.gridY = gridY; // 그리드 Y 좌표
    this.hueSeed = hueSeed; // 색상 시드
    this.baseX = 0; // 기본 X 위치 (계산됨)
    this.baseY = 0; // 기본 Y 위치 (계산됨)
    this.pos = createVector(0, 0); // 화면상 위치 (계산됨)
    this.r = BASE_BUBBLE_RADIUS; // 반지름
    this.copies = []; // 토러스 래핑 복사본 위치
    this.alpha = 1.0; // 투명도 (페이드아웃 효과용)
    // 버블 설명 정보
    this.name = `버블 ${
      gridX + gridY * Math.ceil(Math.sqrt(TOTAL_BUBBLES)) + 1
    }`;
    this.description = `이것은 ${gridX}, ${gridY} 위치의 버블입니다.`;
  }

  update(
    screenCenterX,
    screenCenterY,
    offsetX,
    offsetY,
    centerBubblePos = null
  ) {
    // 헥사곤 배치 계산
    const hexX = this.gridX * HEX_SPACING * 1.5;
    const hexY =
      this.gridY * HEX_SPACING * sqrt(3) +
      ((this.gridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    // 토러스 형태: 무한 반복을 위한 월드 크기 계산 (전역 상수 재사용)
    const worldWidth = WORLD_W;
    const worldHeight = WORLD_H;

    // 오프셋 적용 (스와이프 반영)
    let worldX = hexX + offsetX;
    let worldY = hexY + offsetY;

    // 토러스 래핑: 월드 좌표를 월드 크기로 모듈로 연산
    worldX = ((worldX % worldWidth) + worldWidth) % worldWidth;
    worldY = ((worldY % worldHeight) + worldHeight) % worldHeight;

    // 화면 중심을 기준으로 한 상대 위치 계산
    let screenX = worldX - screenCenterX;
    let screenY = worldY - screenCenterY;

    // 토러스 래핑: 화면 반대편에서도 가장 가까운 거리 계산
    // X 방향 래핑
    if (abs(screenX) > worldWidth / 2) {
      screenX = screenX > 0 ? screenX - worldWidth : screenX + worldWidth;
    }
    // Y 방향 래핑
    if (abs(screenY) > worldHeight / 2) {
      screenY = screenY > 0 ? screenY - worldHeight : screenY + worldHeight;
    }

    const distFromCenter = sqrt(screenX * screenX + screenY * screenY);

    // 피시아이 효과: 중심에 가까울수록 크게
    const maxDist = sqrt(width * width + height * height) / 2;
    const normalizedDist = min(distFromCenter / maxDist, 1);

    // 화면상 위치 계산 (피시아이 효과 적용 전)
    const fisheyeFactor = 1 + (1 - normalizedDist) * FISHEYE_STRENGTH;
    let displayX = screenCenterX + screenX * fisheyeFactor;
    let displayY = screenCenterY + screenY * fisheyeFactor;

    // 화면 경계에서의 거리 계산 (화면 바깥으로 나갈수록 작아지도록)
    const distToLeftEdge = displayX;
    const distToRightEdge = width - displayX;
    const distToTopEdge = displayY;
    const distToBottomEdge = height - displayY;

    // 가장 가까운 경계까지의 거리
    const distToNearestEdge = min(
      distToLeftEdge,
      distToRightEdge,
      distToTopEdge,
      distToBottomEdge
    );

    // 화면 경계에서의 거리를 정규화 (화면 크기의 절반을 기준으로)
    const maxEdgeDist = min(width, height) / 2;
    const normalizedEdgeDist = min(distToNearestEdge / maxEdgeDist, 1);

    // 화면 바깥으로 나가면 음수 거리 (더 작아지도록)
    // 화면 경계에서 멀어질수록 더 작아지도록 강한 감쇠 적용
    let edgeFactor;
    if (distToNearestEdge < 0) {
      // 화면 밖: 거리가 멀수록 더 작아짐
      edgeFactor = max(0, 1 + (distToNearestEdge / maxEdgeDist) * 2); // 음수일수록 작아짐
    } else {
      // 화면 안: 경계에 가까울수록 작아짐
      edgeFactor = normalizedEdgeDist;
    }

    // 기본 크기 팩터 (중심 거리 + 화면 경계 거리)
    // 중심에서 멀수록 작아지고, 화면 경계에서 멀수록 더 작아짐
    // edgeFactor를 제곱하여 더 강한 감쇠 효과 적용
    let sizeFactor =
      (1 - normalizedDist * 0.6) * (0.2 + edgeFactor * edgeFactor * 0.8); // 0.04 ~ 1.0

    // 중앙 버블 주변 버블들이 작아지도록 조정
    if (centerBubblePos) {
      // 화면상 위치 기준으로 거리 계산
      const currentDisplayX = screenCenterX + screenX;
      const currentDisplayY = screenCenterY + screenY;
      const distToCenterBubble = dist(
        currentDisplayX,
        currentDisplayY,
        centerBubblePos.x,
        centerBubblePos.y
      );

      // 중앙 버블 영향 범위 내에 있으면 크기 감소
      if (distToCenterBubble < CENTER_INFLUENCE_RADIUS) {
        const influenceFactor =
          1 - distToCenterBubble / CENTER_INFLUENCE_RADIUS;
        // 중앙 버블에 가까울수록 더 작아짐 (최대 60%까지 작아짐)
        sizeFactor *= 0.4 + influenceFactor * 0.3; // 0.4 ~ 0.7 사이
      }
    }

    // 크기 계산 - 거리 기반으로만 결정 (배경 움직임에 따라 동적으로 변함)
    const targetR =
      MIN_BUBBLE_RADIUS +
      (MAX_BUBBLE_RADIUS - MIN_BUBBLE_RADIUS) * max(sizeFactor, 0.1);

    // 부드러운 크기 변화 (lerp 사용)
    this.r = lerp(this.r, targetR, 0.15);

    // 토러스 래핑: 화면 밖으로 나가면 반대편에서 나타나게 (여러 복사본 고려)
    // 배열 재사용 (GC 방지)
    this.copies.length = 0;
    const baseX = displayX;
    const baseY = displayY;

    // X 방향 복사본
    if (displayX < -this.r) {
      this.copies.push(
        createVector(displayX + worldWidth * fisheyeFactor, displayY)
      );
    }
    if (displayX > width + this.r) {
      this.copies.push(
        createVector(displayX - worldWidth * fisheyeFactor, displayY)
      );
    }
    // Y 방향 복사본
    if (displayY < -this.r) {
      this.copies.push(
        createVector(displayX, displayY + worldHeight * fisheyeFactor)
      );
    }
    if (displayY > height + this.r) {
      this.copies.push(
        createVector(displayX, displayY - worldHeight * fisheyeFactor)
      );
    }
    // 대각선 복사본
    if (displayX < -this.r && displayY < -this.r) {
      this.copies.push(
        createVector(
          displayX + worldWidth * fisheyeFactor,
          displayY + worldHeight * fisheyeFactor
        )
      );
    }
    if (displayX > width + this.r && displayY > height + this.r) {
      this.copies.push(
        createVector(
          displayX - worldWidth * fisheyeFactor,
          displayY - worldHeight * fisheyeFactor
        )
      );
    }

    // 메인 위치 저장
    this.pos.set(displayX, displayY);

    // 페이드아웃 효과: 버블이 화면 밖으로 나가거나 허용 영역 밖으로 나갈 때 투명도 감소
    const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
    const bubbleTop = displayY - this.r;
    const bubbleBottom = displayY + this.r;

    const isOnScreen =
      displayX + this.r > 0 &&
      displayX - this.r < width &&
      displayY + this.r > 0 &&
      displayY - this.r < height;

    const isInAllowedArea =
      bubbleTop >= SEARCH_BOTTOM && // 검색창 아래
      bubbleBottom <= height - 10; // 화면 하단 위

    // 버블이 보여야 할 때는 alpha를 1.0으로 복원, 사라져야 할 때는 감소
    if (isOnScreen && isInAllowedArea) {
      // 보이는 상태: 서서히 나타남
      this.alpha = lerp(this.alpha, 1.0, 0.2);
    } else {
      // 사라지는 상태: 서서히 사라짐
      this.alpha = lerp(this.alpha, 0.0, 0.15);
    }
  }

  drawAt(x, y) {
    // alpha가 너무 작으면 그리지 않음
    if (this.alpha < 0.01) return;

    // 스프라이트 캐시 사용 (성능 최적화)
    const { g, size } = getBubbleSprite(this.r, this.hueSeed);
    push();
    drawingContext.save();
    drawingContext.globalAlpha = this.alpha; // 투명도 적용
    imageMode(CENTER);
    image(g, x, y, size, size); // 매 프레임 경량 복사만
    drawingContext.restore();
    pop();
  }

  draw() {
    // 메인 위치에 그리기
    this.drawAt(this.pos.x, this.pos.y);

    // 토러스 래핑 복사본도 그리기
    if (this.copies) {
      this.copies.forEach((copyPos) => {
        // 화면에 보이는 복사본만 그리기
        if (
          copyPos.x + this.r > 0 &&
          copyPos.x - this.r < width &&
          copyPos.y + this.r > 0 &&
          copyPos.y - this.r < height
        ) {
          this.drawAt(copyPos.x, copyPos.y);
        }
      });
    }
  }
}

function bubbleColor(seed) {
  const h = (seed * 137.5) % 360;
  return {
    outer: `hsl(${h} 70% 55% / 0.95)`,
    inner: `hsl(${(h + 20) % 360} 80% 35% / 0.75)`,
  };
}

// 스프라이트 캐시 시스템 (성능 최적화)
function getBubbleSprite(r, hueSeed) {
  const bucket = Math.max(6, Math.round(r / SPRITE_STEP) * SPRITE_STEP);
  const h = Math.floor((hueSeed * 137.5) % 360);
  const key = `${bucket}|${h}`;

  if (SPRITES.has(key)) return SPRITES.get(key);

  const size = bucket * 2;
  const g = createGraphics(size, size);
  g.noStroke();

  // 색상
  const base = bubbleColor(hueSeed);
  const outer = base.outer;
  const inner = base.inner;

  // 그림자(오프스크린에서 한 번만)
  g.drawingContext.save();
  g.drawingContext.shadowBlur = 24;
  g.drawingContext.shadowColor = "rgba(0,0,0,0.35)";
  g.fill(outer);
  g.circle(bucket, bucket, size);
  g.drawingContext.restore();

  // 글로스 그라디언트
  if (BUBBLE_GLOSS) {
    const grd = g.drawingContext.createRadialGradient(
      bucket - bucket * 0.35,
      bucket - bucket * 0.35,
      bucket * 0.1,
      bucket,
      bucket,
      bucket
    );
    grd.addColorStop(0, "rgba(255,255,255,0.45)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.20)");
    grd.addColorStop(1, inner);
    g.drawingContext.fillStyle = grd;
    g.circle(bucket, bucket, size);
  }

  // 캡 이미지(있다면)까지 합성해서 완성 스프라이트로 캐시
  if (bubbleCap && bubbleCap.width > 0) {
    g.push();
    g.imageMode(g.CENTER);
    g.image(bubbleCap, bucket, bucket, size, size);
    g.pop();
  }

  const sprite = { g, size };
  SPRITES.set(key, sprite);
  return sprite;
}

// 월드 메트릭스 재계산 (윈도우 리사이즈 시)
function rebuildWorldMetrics() {
  // 35개 버블을 위한 그리드 크기 계산 (대략 6x6 그리드)
  const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
  WORLD_W = gridSize * HEX_SPACING * 1.5;
  WORLD_H = gridSize * HEX_SPACING * sqrt(3);
}

// 배경 버퍼 재생성
function redrawBackgroundBuffer() {
  bgBuffer = createGraphics(width, height);
  if (
    bgImage &&
    typeof bgImage.width !== "undefined" &&
    typeof bgImage.height !== "undefined" &&
    bgImage.width > 0 &&
    bgImage.height > 0 &&
    !isNaN(bgImage.width) &&
    !isNaN(bgImage.height)
  ) {
    const imgRatio = bgImage.width / bgImage.height;
    const screenRatio = width / height;

    let drawW, drawH, bgOffsetX, bgOffsetY;

    if (imgRatio > screenRatio) {
      // 이미지가 더 넓음 → 높이에 맞춤
      drawH = height;
      drawW = imgRatio * drawH;
      bgOffsetX = (width - drawW) / 2;
      bgOffsetY = 0;
    } else {
      // 이미지가 더 높음 → 너비에 맞춤
      drawW = width;
      drawH = drawW / imgRatio;
      bgOffsetX = 0;
      bgOffsetY = (height - drawH) / 2;
    }

    bgBuffer.imageMode(CORNER);
    bgBuffer.image(bgImage, bgOffsetX, bgOffsetY, drawW, drawH);
  } else {
    bgBuffer.background(BG_COLOR);
  }
}

// 애니메이션 시작/정지 함수
function startAnim() {
  if (!animating) {
    animating = true;
    loop();
  }
}

function stopAnim() {
  if (animating) {
    animating = false;
    noLoop();
  }
}

// 중앙 버블 설명창 그리기
function drawBubbleInfo(bubble, centerX, centerY) {
  const infoY = bubble.pos.y + bubble.r + 30; // 버블 아래 30px
  const infoWidth = 280;
  const infoHeight = 80;
  const infoX = bubble.pos.x - infoWidth / 2;

  // 설명창 배경 (둥근 모서리)
  push();
  drawingContext.save();

  // 그림자
  drawingContext.shadowBlur = 20;
  drawingContext.shadowColor = "rgba(0,0,0,0.4)";
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 4;

  // 배경 그라데이션
  const gradient = drawingContext.createLinearGradient(
    infoX,
    infoY,
    infoX,
    infoY + infoHeight
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.08)");
  drawingContext.fillStyle = gradient;

  // 둥근 사각형
  const radius = 12;
  drawingContext.beginPath();
  drawingContext.moveTo(infoX + radius, infoY);
  drawingContext.lineTo(infoX + infoWidth - radius, infoY);
  drawingContext.quadraticCurveTo(
    infoX + infoWidth,
    infoY,
    infoX + infoWidth,
    infoY + radius
  );
  drawingContext.lineTo(infoX + infoWidth, infoY + infoHeight - radius);
  drawingContext.quadraticCurveTo(
    infoX + infoWidth,
    infoY + infoHeight,
    infoX + infoWidth - radius,
    infoY + infoHeight
  );
  drawingContext.lineTo(infoX + radius, infoY + infoHeight);
  drawingContext.quadraticCurveTo(
    infoX,
    infoY + infoHeight,
    infoX,
    infoY + infoHeight - radius
  );
  drawingContext.lineTo(infoX, infoY + radius);
  drawingContext.quadraticCurveTo(infoX, infoY, infoX + radius, infoY);
  drawingContext.closePath();
  drawingContext.fill();

  drawingContext.restore();
  pop();

  // 텍스트 그리기
  push();
  fill(255, 255, 255, 0.9);
  textAlign(CENTER);
  textSize(18);
  textStyle(BOLD);
  // TOP 대신 수동으로 Y 위치 조정
  text(bubble.name, bubble.pos.x, infoY + 15);

  fill(255, 255, 255, 0.7);
  textSize(14);
  textStyle(NORMAL);
  text(bubble.description, bubble.pos.x, infoY + 40);
  pop();
}

// ---------- p5 LIFECYCLE ----------
function preload() {
  searchIcon = loadImage("assets/imgs/lucide_search.svg");
  captureButton = loadImage("assets/imgs/capture-button.png");
  workroomButton = loadImage("assets/imgs/workroom-button.png");
  navigationBar = loadImage("assets/imgs/navigation-bar.png");
  bgImage = loadImage("assets/imgs/bg.png", () => {
    // 이미지 로드 후 배경 버퍼 생성
    if (typeof width !== "undefined" && width > 0) {
      redrawBackgroundBuffer();
    }
  });
  bubbleCap = loadImage("assets/imgs/bubble-cap.png");
}

function setup() {
  // pixelDensity(1) 제거 - 화질 유지를 위해 기본 해상도 사용
  frameRate(45); // 60→45로 캡(시각적 차이는 적고 연산 25%↓)
  createCanvas(windowWidth, windowHeight);

  rebuildWorldMetrics(); // 월드 메트릭스 초기화
  buildBubbles();

  // 검색 입력 필드 생성
  createSearchInput();

  // 배경 버퍼 초기화 (이미지 로드 후 호출)
  if (bgImage && bgImage.width > 0) {
    redrawBackgroundBuffer();
  }

  // 모바일 스크롤 방지
  document.addEventListener(
    "touchmove",
    function (e) {
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length > 1) {
        e.preventDefault(); // 핀치 줌 방지
      }
    },
    { passive: false }
  );
}

function createSearchInput() {
  const W = 1205 * SEARCH_SCALE;
  const H = 75 * SEARCH_SCALE;
  const X = (width - W) / 2;
  const Y = 120;

  // 아이콘 영역을 제외한 텍스트 입력 영역
  const iconSize = 24 * SEARCH_SCALE * 1.5;
  const iconX = X + 24 * SEARCH_SCALE;
  const textStartX = iconX + iconSize + 16 * SEARCH_SCALE;
  const textWidth = W - (textStartX - X) - 24 * SEARCH_SCALE;

  searchInput = createInput("");
  searchInput.attribute("placeholder", "검색하기");
  searchInput.position(textStartX, Y);
  searchInput.size(textWidth, H);
  searchInput.style("background", "transparent");
  searchInput.style("border", "none");
  searchInput.style("outline", "none");
  searchInput.style("color", "rgba(255,255,255,0.8)");
  searchInput.style("font-size", `${16 * SEARCH_SCALE * 1.2 * 1.5}px`);
  searchInput.style("font-family", "inherit");
  searchInput.style("padding", "0");
  searchInput.style("margin", "0");
  searchInput.style("z-index", "1000"); // 가장 위에 표시
}

function draw() {
  // 배경 버퍼 사용 (성능 최적화)
  if (bgBuffer) {
    image(bgBuffer, 0, 0);
  } else {
    background(BG_COLOR);
  }

  // 패닝 애니메이션 업데이트 (관성)
  if (!isDragging) {
    // 관성 이동
    panVelocityX *= 0.95; // 감쇠
    panVelocityY *= 0.95;
    offsetX += panVelocityX;
    offsetY += panVelocityY;

    // 속도가 매우 작아지면 정지
    if (abs(panVelocityX) < 0.1 && abs(panVelocityY) < 0.1) {
      panVelocityX = 0;
      panVelocityY = 0;
      stopAnim(); // 완전히 정지하면 렌더 멈춤
    }
  }

  // 중심 위치 계산 (검색창 아래 영역의 중앙)
  const { H: SEARCH_H, bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
  const BUBBLE_AREA_BOTTOM = height - 10;
  const BUBBLE_AREA_CENTER =
    BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;

  const centerX = width * CENTER_X_RATIO;
  const centerY = BUBBLE_AREA_CENTER; // 검색창 아래 영역의 중앙

  // 버블 업데이트 및 그리기 (화면에 보이는 것만)
  // 먼저 모든 버블 업데이트하여 중앙 버블 찾기 (1차 업데이트)
  bubbles.forEach((b) => {
    b.update(centerX, centerY, offsetX, offsetY, null);
  });

  // 중앙에 가장 가까운 버블 찾기
  let centerBubble = null;
  let minDistToCenter = Infinity;
  bubbles.forEach((b) => {
    const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
    if (distToCenter < minDistToCenter) {
      minDistToCenter = distToCenter;
      centerBubble = b;
    }
  });

  // 중앙 버블을 최대 크기로 부드럽게 설정 (배경 움직임에 따라 동적으로 변함)
  if (centerBubble) {
    // 부드럽게 최대 크기로 변화 (1.2배 더 크게)
    centerBubble.r = lerp(centerBubble.r, MAX_BUBBLE_RADIUS * 1.2, 0.2);

    // 중앙 버블 위치를 전달하여 주변 버블들이 작아지도록 재업데이트
    bubbles.forEach((b) => {
      if (b !== centerBubble) {
        b.update(centerX, centerY, offsetX, offsetY, centerBubble.pos);
      }
    });
  }

  // 검색창과 네비게이션 바 영역 계산 (재사용)
  const NAV_Y = 20;
  const NAV_H = navigationBar ? navigationBar.height * 0.375 : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;

  // LOD: 보이는 버블만 수집하고 가까운 순으로 정렬 (성능 최적화)
  const visible = [];
  for (const b of bubbles) {
    // alpha가 너무 작으면 스킵
    if (b.alpha < 0.01) continue;

    // 버블이 화면에 보이는지 확인
    const isOnScreen =
      b.pos.x + b.r > -50 &&
      b.pos.x - b.r < width + 50 &&
      b.pos.y + b.r > -50 &&
      b.pos.y - b.r < height + 50;

    // 버블이 검색창 아래 영역에만 있는지 확인
    const bubbleTop = b.pos.y - b.r;
    const bubbleBottom = b.pos.y + b.r;
    const isInAllowedArea =
      bubbleTop >= SEARCH_BOTTOM - 50 && bubbleBottom <= height - 10 + 50;

    if (isOnScreen && isInAllowedArea) {
      // 거리 제곱 계산 (루트 없이 - 성능 최적화)
      const dx = b.pos.x - centerX;
      const dy = b.pos.y - centerY;
      const distSq = dx * dx + dy * dy;
      visible.push([distSq, b]);
    }
  }

  // 가까운 순으로 정렬 후 큰 것부터 그리기 (오버드로우 감소)
  visible.sort((a, b) => a[0] - b[0]); // 거리 순 정렬
  // 큰 버블부터 그리기 (오버드로우 감소)
  visible.sort((a, b) => b[1].r - a[1].r);

  // 상위 MAX_DRAW개만 그리기
  for (let i = 0; i < Math.min(MAX_DRAW, visible.length); i++) {
    visible[i][1].draw();
  }

  // 중앙 버블 설명창 그리기
  if (centerBubble) {
    drawBubbleInfo(centerBubble, centerX, centerY);
  }

  vignette();

  // 검색창과 네비게이션 바를 가장 위에 그리기 (버블 위에 표시)
  drawNavBar();
  drawSearchBar();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  rebuildWorldMetrics(); // 월드 메트릭스 재계산
  redrawBackgroundBuffer(); // 배경 버퍼 재생성
  buildBubbles(); // 버블 재생성

  // 검색 입력 필드 위치 업데이트
  if (searchInput) {
    const { W, H, X, Y } = getSearchMetrics();
    const iconSize = 24 * SEARCH_SCALE * 1.5;
    const iconX = X + 24 * SEARCH_SCALE;
    const textStartX = iconX + iconSize + 16 * SEARCH_SCALE;
    const textWidth = W - (textStartX - X) - 24 * SEARCH_SCALE;

    searchInput.position(textStartX, Y);
    searchInput.size(textWidth, H);
  }
}

// ---------- UTILS ----------
// 검색창 메트릭 헬퍼 함수
function getSearchMetrics() {
  const W = 1205 * SEARCH_SCALE;
  const H = 75 * SEARCH_SCALE;
  const X = (width - W) / 2;
  const Y = SEARCH_Y;
  return { W, H, X, Y, bottom: Y + H };
}

function clampBubbleToCanvas(b) {
  // 검색창 아래 영역 계산
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 20;
  const BUBBLE_AREA_BOTTOM = height - 20;

  // 버블 중심이 검색창 아래 영역 내에만 있도록 클램프
  b.pos.x = constrain(b.pos.x, b.r, width - b.r);
  b.pos.y = constrain(b.pos.y, BUBBLE_AREA_TOP + b.r, BUBBLE_AREA_BOTTOM - b.r);
}

// ---------- BUILDERS ----------
function buildFrames() {
  frames = [];
  const minSize = Math.min(width, height);

  // 검색창 영역 계산
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 20; // 검색창 아래 20px 여유
  const BUBBLE_AREA_BOTTOM = height - 20; // 하단 여유

  // 중앙 큰 버블 (검색창 아래 영역의 중앙에 배치)
  const [cxRatio, _, rr] = CENTER_FRAME;
  const centerY =
    BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5; // 검색창 아래 영역의 중앙
  const centerX = cxRatio * width;
  const centerR = rr * minSize;
  const centerFrame = new FrameCircle(0, centerX, centerY, centerR);
  frames.push(centerFrame);

  // 버블 간 최소 거리 (일정한 간격 유지)
  const MIN_BUBBLE_DISTANCE = 80; // 픽셀 단위 최소 거리

  // 왼쪽에 3개, 오른쪽에 3개 배치 (삼각형 모양)
  const leftCount = 3;
  const rightCount = 3;

  // 중앙 버블 기준으로 왼쪽/오른쪽 영역 계산
  const availableHeight = BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP;
  const centerRadius = centerR;
  const centerYPos = centerY;

  // 왼쪽 버블 배치 (3개 - 삼각형 모양)
  const leftX =
    centerX - centerRadius - MIN_BUBBLE_DISTANCE - MAX_FRAME_RATIO * minSize;

  // 삼각형 위치: 위(작음), 중간(큼), 아래(중간)
  const leftPositions = [
    {
      yOffset: -availableHeight * 0.25,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.2,
    }, // 위쪽 작은 버블
    {
      yOffset: 0,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.8,
    }, // 중간 큰 버블
    {
      yOffset: availableHeight * 0.25,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.5,
    }, // 아래쪽 중간 버블
  ];

  for (let i = 0; i < leftCount; i++) {
    const frameIndex = i + 1;
    const pos = leftPositions[i];
    const rr = pos.sizeRatio;
    const r = rr * minSize;
    const cy = centerYPos + pos.yOffset;

    const leftFrame = new FrameCircle(frameIndex, leftX, cy, r);
    frames.push(leftFrame);
  }

  // 오른쪽 버블 배치 (3개 - 삼각형 모양)
  const rightX =
    centerX + centerRadius + MIN_BUBBLE_DISTANCE + MAX_FRAME_RATIO * minSize;

  // 삼각형 위치: 위(중간), 중간(큼), 아래(작음) - 왼쪽과 약간 다르게
  const rightPositions = [
    {
      yOffset: -availableHeight * 0.25,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.5,
    }, // 위쪽 중간 버블
    {
      yOffset: 0,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.9,
    }, // 중간 큰 버블
    {
      yOffset: availableHeight * 0.25,
      sizeRatio: MIN_FRAME_RATIO + (MAX_FRAME_RATIO - MIN_FRAME_RATIO) * 0.3,
    }, // 아래쪽 작은 버블
  ];

  for (let i = 0; i < rightCount; i++) {
    const frameIndex = leftCount + i + 1;
    const pos = rightPositions[i];
    const rr = pos.sizeRatio;
    const r = rr * minSize;
    const cy = centerYPos + pos.yOffset;

    const rightFrame = new FrameCircle(frameIndex, rightX, cy, r);
    frames.push(rightFrame);
  }
}

// 안전 반지름 계산: 프레임 간 거리를 고려하여 버블이 겹치지 않는 최대 반지름 계산
function computeSafeBubbleRadii() {
  const n = frames.length;
  const safe = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    let ri = frames[i].r * BUBBLE_RADIUS_FACTOR; // 기본 상한

    // 중앙 버블(인덱스 0)은 항상 가장 크게 유지
    if (i === 0) {
      // 중앙 버블은 다른 버블들과의 거리를 고려하되, 최소한 프레임 크기의 90%는 유지
      const minRadius = frames[i].r * 0.9;
      for (let j = 1; j < n; j++) {
        const d = dist(frames[i].cx, frames[i].cy, frames[j].cx, frames[j].cy);
        const maxAllowed = (d - SEP_PAD) / 2;
        ri = Math.min(ri, maxAllowed);
      }
      safe[i] = Math.max(ri, minRadius);
    } else {
      // 나머지 버블들은 일반 계산
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = dist(frames[i].cx, frames[i].cy, frames[j].cx, frames[j].cy);
        // 두 버블이 만나지 않도록 한쪽 최대 반지름은 (d - pad)/2
        ri = Math.min(ri, Math.max(0, (d - SEP_PAD) / 2));
      }
      safe[i] = ri;
    }
  }

  // 중앙 버블이 항상 가장 큰지 확인하고 보장
  const centerRadius = safe[0];
  for (let i = 1; i < n; i++) {
    if (safe[i] >= centerRadius) {
      safe[i] = centerRadius * 0.8; // 중앙보다 작게 조정
    }
  }

  return safe;
}

function buildBubbles() {
  bubbles = [];

  // 35개 버블 생성 (헥사곤 그리드 패턴)
  const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES)); // 대략 6x6 그리드
  let count = 0;

  for (let y = 0; y < gridSize && count < TOTAL_BUBBLES; y++) {
    for (let x = 0; x < gridSize && count < TOTAL_BUBBLES; x++) {
      const hueSeed = count + 1;
      bubbles.push(new Bubble(x, y, hueSeed));
      count++;
    }
  }

  // 초기 오프셋을 중앙 버블이 화면 중앙에 오도록 설정
  const centerGridX = Math.floor(gridSize / 2);
  const centerGridY = Math.floor(gridSize / 2);
  const centerHexX = centerGridX * HEX_SPACING * 1.5;
  const centerHexY =
    centerGridY * HEX_SPACING * sqrt(3) +
    ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

  offsetX = width * CENTER_X_RATIO - centerHexX;
  offsetY = height * CENTER_Y_RATIO - centerHexY;
}

// ---------- PANNING (스와이프) ----------
function mousePressed() {
  startAnim(); // 애니메이션 시작
  isDragging = true;
  dragStartX = mouseX;
  dragStartY = mouseY;
  dragOffsetX = offsetX;
  dragOffsetY = offsetY;
  panVelocityX = 0;
  panVelocityY = 0;
}

function mouseDragged() {
  if (!isDragging) return;
  startAnim(); // 애니메이션 시작

  const deltaX = mouseX - dragStartX;
  const deltaY = mouseY - dragStartY;

  // 오프셋 업데이트 (감도 적용)
  offsetX = dragOffsetX + deltaX * PAN_SENSITIVITY;
  offsetY = dragOffsetY + deltaY * PAN_SENSITIVITY;

  // 속도 계산 (관성용) - 감도 적용
  panVelocityX = deltaX * 0.05 * PAN_SENSITIVITY;
  panVelocityY = deltaY * 0.05 * PAN_SENSITIVITY;
}

function mouseReleased() {
  if (!isDragging) return;
  isDragging = false;
  // 관성은 draw()에서 처리됨
}

// ---------- TOUCH EVENTS (모바일 지원) ----------
function touchStarted() {
  if (touches.length > 0) {
    startAnim(); // 애니메이션 시작
    const touch = touches[0];
    isDragging = true;
    dragStartX = touch.x;
    dragStartY = touch.y;
    dragOffsetX = offsetX;
    dragOffsetY = offsetY;
    panVelocityX = 0;
    panVelocityY = 0;
    return false; // 기본 동작 방지
  }
  return false;
}

function touchMoved() {
  if (!isDragging || touches.length === 0) return false;
  startAnim(); // 애니메이션 시작
  const touch = touches[0];

  const deltaX = touch.x - dragStartX;
  const deltaY = touch.y - dragStartY;

  // 오프셋 업데이트 (감도 적용)
  offsetX = dragOffsetX + deltaX * PAN_SENSITIVITY;
  offsetY = dragOffsetY + deltaY * PAN_SENSITIVITY;

  // 속도 계산 (관성용) - 감도 적용
  panVelocityX = deltaX * 0.05 * PAN_SENSITIVITY;
  panVelocityY = deltaY * 0.05 * PAN_SENSITIVITY;

  return false; // 기본 동작 방지
}

function touchEnded() {
  if (!isDragging) return false;
  isDragging = false;
  return false; // 기본 동작 방지
}

// ---------- UI helpers ----------
function drawNavBar() {
  if (!captureButton || !workroomButton || !navigationBar) return;

  // 버튼 크기 (반으로 줄임)
  const BUTTON_W = captureButton.width * 0.5;
  const BUTTON_H = captureButton.height * 0.5;

  // 네비게이션 바 크기 (0.25 * 1.5 = 0.375)
  const NAV_W = navigationBar.width * 0.375;
  const NAV_H = navigationBar.height * 0.375;

  // 상단 위치
  const Y = 20;

  // 캡쳐 버튼 - 왼쪽 끝
  imageMode(CORNER);
  image(captureButton, 0, Y, BUTTON_W, BUTTON_H);

  // 워크룸 버튼 - 오른쪽 끝
  image(workroomButton, width - BUTTON_W, Y, BUTTON_W, BUTTON_H);

  // 네비게이션 바 - 중앙에 배치 (두 버튼 사이)
  const navBarX = (width - NAV_W) / 2;
  image(navigationBar, navBarX, Y, NAV_W, NAV_H);
}

function drawSearchBar() {
  const W = 1205 * SEARCH_SCALE;
  const H = 75 * SEARCH_SCALE;
  const X = (width - W) / 2;
  const Y = 120;

  // 바 배경 - linear gradient
  noStroke();
  drawingContext.save();

  // box-shadow
  drawingContext.shadowBlur = 30 * SEARCH_SCALE;
  drawingContext.shadowColor = "rgba(135, 135, 135, 0.30)";
  drawingContext.shadowOffsetX = 7 * SEARCH_SCALE;
  drawingContext.shadowOffsetY = 7 * SEARCH_SCALE;

  // linear gradient
  const gradient = drawingContext.createLinearGradient(X, Y, X, Y + H);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.42)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.28)");
  drawingContext.fillStyle = gradient;

  // rounded rect (수동으로 path 그리기)
  const radius = 48 * SEARCH_SCALE;
  drawingContext.beginPath();
  drawingContext.moveTo(X + radius, Y);
  drawingContext.lineTo(X + W - radius, Y);
  drawingContext.quadraticCurveTo(X + W, Y, X + W, Y + radius);
  drawingContext.lineTo(X + W, Y + H - radius);
  drawingContext.quadraticCurveTo(X + W, Y + H, X + W - radius, Y + H);
  drawingContext.lineTo(X + radius, Y + H);
  drawingContext.quadraticCurveTo(X, Y + H, X, Y + H - radius);
  drawingContext.lineTo(X, Y + radius);
  drawingContext.quadraticCurveTo(X, Y, X + radius, Y);
  drawingContext.closePath();
  drawingContext.fill();

  drawingContext.restore();

  // 돋보기 아이콘
  if (searchIcon) {
    const iconSize = 24 * SEARCH_SCALE * 1.5; // 1.5배
    const iconX = X + 24 * SEARCH_SCALE;
    const iconY = Y + (H - iconSize) / 2;
    imageMode(CORNER);
    tint(255, 255, 255, 165); // rgba(255,255,255,0.65) 효과
    image(searchIcon, iconX, iconY, iconSize, iconSize);
    noTint(); // tint 효과 제거
  }

  // 플레이스홀더는 input의 placeholder로 처리되므로 제거
  // 입력 필드가 있으면 텍스트를 그리지 않음
}

function vignette() {
  const gTop = drawingContext.createLinearGradient(0, 0, 0, height * 0.25);
  gTop.addColorStop(0, "rgba(0,0,0,0.35)");
  gTop.addColorStop(1, "rgba(0,0,0,0)");
  drawingContext.fillStyle = gTop;
  noStroke();
  rect(0, 0, width, height * 0.25);

  const gBot = drawingContext.createLinearGradient(0, height, 0, height * 0.75);
  gBot.addColorStop(0, "rgba(0,0,0,0.35)");
  gBot.addColorStop(1, "rgba(0,0,0,0)");
  drawingContext.fillStyle = gBot;
  rect(0, height * 0.75, width, height * 0.25);
}
