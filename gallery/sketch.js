/* =========================================================
   Interactive Bubbles — Apple Watch Style Honeycomb
   요구사항:
   1) 헥사곤 패턴 밀집 배치
   2) 중앙 집중형 크기 변화 (피시아이 렌즈 효과)
   3) 스와이프로 배경 이동 탐색
   ========================================================= */

let bubbles = []; // 모든 버블들
let searchIcon; // 돋보기 아이콘 이미지
let interestedImage; // interested 이미지
let captureButton; // 캡쳐 버튼 이미지
let workroomButton; // 워크룸 버튼 이미지
let navigationBar; // 네비게이션 바 이미지
let bgImage; // 배경 이미지
let searchInput; // 검색 입력 필드
let bubbleCap; // 버블 캡 이미지
let navBarBuffer; // 네비게이션 바 고해상도 버퍼
let bubbleImages = []; // 버블 이미지들 (지연 로딩)
let cardImages = []; // 카드 이미지들
let imageLoading = new Set(); // 현재 로딩 중인 이미지 인덱스
let imageLoaded = new Set(); // 로드 완료된 이미지 인덱스
let bubbleData = []; // 버블 제목/태그 데이터
let imageFiles = []; // 이미지 파일명 목록 (전역으로 이동)
let pretendardFont; // Pretendard 폰트
let showModal = false; // 모달 표시 여부
let showToggles = false; // 토글 표시 여부 (더 이상 사용하지 않음)
let selectedToggles = []; // 선택된 토글들 (더 이상 사용하지 않음)
let previousSelectedToggles = []; // 이전에 선택된 토글들 (더 이상 사용하지 않음)

// 시각적 언어 카드 시스템
let visualLanguageCards = []; // 시각적 언어 카드 데이터
let selectedCardIndex = null; // 선택된 카드 인덱스 (null이면 전체 보기)
let previousSelectedCardIndex = null; // 이전에 선택된 카드 인덱스

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
const SEARCH_Y = 100; // 검색창 Y 위치 (기본값, 반응형으로 계산됨)
const SEARCH_WIDTH_RATIO = 0.2; // 검색창 너비 비율 (화면 너비의 65%)
const SEARCH_NAV_GAP = 40; // 네비게이션 바와 검색창 사이 간격

// ---- ARC CAROUSEL ----
let ARC_MODE = false; // 아크 캐러셀 켜기(카드 선택 시에만 켜짐)
const ARC_VISIBLE_COUNT = 7; // 한번에 그릴 슬롯 수 (7개 고정)
const ARC_SPREAD_RAD = (150 * Math.PI) / 180; // 간격 줄이기 위해 180도 → 150도로 축소
const ARC_MIN_R = 50; // 버블 최소 반지름 (양 끝, 적당한 크기)
const ARC_MAX_R = 130; // 버블 최대 반지름(주변 버블용)
const ARC_HERO_R = 180; // 주인공 버블 최대 반지름(중앙 버블만)
const ARC_DAMP = 0.85; // 관성 감쇠 (더 빠르게 멈춤)
const ARC_DRAG_SENSE = 0.008; // 드래그 감도(좌우 스와이프 → 각도)
const ARC_SNAP_THRESHOLD = 0.3; // 스냅 임계값 (라디안)

let arcScroll = 0; // 스크롤 각도 오프셋 (애니메이션용)
let arcVel = 0; // 관성
let arcDragging = false;
let arcDragStartX = 0; // 드래그 시작 X 위치
let arcDragStartIndex = 0; // 드래그 시작 시점의 인덱스
let arcTargetIndex = 0; // 목표 버블 인덱스 (스냅용)
let arcCurrentIndex = 0; // 현재 버블 인덱스 (애니메이션용)

// 성능 최적화 설정
const MAX_DRAW = 140; // 그릴 최대 버블 수 (LOD)
const SPRITE_STEP = 6; // 반지름 버킷 간격(px) - 스프라이트 캐시용

// 전역 변수 (성능 최적화)
let WORLD_W = 0; // 월드 크기 (재사용) - 초기값 설정
let WORLD_H = 0; // 월드 크기 (재사용) - 초기값 설정
let bgBuffer; // 배경 버퍼
let animating = true; // 애니메이션 상태
const SPRITES = new Map(); // 스프라이트 캐시 (key: "bucket|hue", val: {g, size})

// UI sizes
const NAV_H = 64;

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
let snapTargetX = null;
let lastPointerStamp = 0; // 마지막 포인터 입력 타임스탬프
const RELEASE_IDLE_MS = 140; // 손을 뗀 뒤 이 시간 이상 입력 없으면 릴리즈로 간주 // 스냅 타겟 X 오프셋
let snapTargetY = null; // 스냅 타겟 Y 오프셋
let snapCompleted = false; // 스냅이 완료되었는지 여부
const SNAP_SPEED = 0.15; // 스냅 애니메이션 속도 (낮을수록 느림)

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
  constructor(gridX, gridY, hueSeed, imageIndex = null) {
    this.gridX = gridX; // 그리드 X 좌표
    this.gridY = gridY; // 그리드 Y 좌표
    this.hueSeed = hueSeed; // 색상 시드
    this.baseX = 0; // 기본 X 위치 (계산됨)
    this.baseY = 0; // 기본 Y 위치 (계산됨)
    this.pos = createVector(0, 0); // 화면상 위치 (계산됨)
    this.r = BASE_BUBBLE_RADIUS; // 반지름
    this.copies = []; // 토러스 래핑 복사본 위치
    this.alpha = 1.0; // 투명도 (페이드아웃 효과용)
    this.imageIndex = imageIndex; // 사용할 이미지 인덱스 (null이면 색상 사용)
    this.isPopping = false; // 팡 터지는 애니메이션 중인지
    this.popProgress = 0; // 팡 터지는 진행도 (0~1)
    this.popStartTime = 0; // 팡 터지기 시작 시간
    // 버블 설명 정보
    if (imageIndex !== null && bubbleData[imageIndex]) {
      this.name = bubbleData[imageIndex].title;
      this.tags = bubbleData[imageIndex].tags;
      this.attributes = bubbleData[imageIndex].attributes || []; // 속성 추가
      this.visualLanguageAttributes =
        bubbleData[imageIndex].visualLanguageAttributes || []; // 시각적 언어 속성 추가
    } else {
      this.name = `버블 ${
        gridX + gridY * Math.ceil(Math.sqrt(TOTAL_BUBBLES)) + 1
      }`;
      this.tags = ["#버블", "#색상", "#기본"];
      this.attributes = []; // 기본 속성 없음
      this.visualLanguageAttributes = []; // 시각적 언어 속성 없음
    }
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
    // 단, 팡 터지는 중이 아니고 필터링된 버블이 아닐 때만 적용
    // 필터링된 버블은 _isFiltered 플래그로 확인
    if (!this.isPopping && !this._isFiltered) {
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
    } else if (this._isFiltered && !this.isPopping) {
      // 필터링된 버블은 항상 alpha를 1.0으로 유지 (페이드아웃 로직 건너뛰기)
      this.alpha = 1.0;
    }
  }

  drawAt(x, y) {
    // alpha가 너무 작으면 그리지 않음
    if (this.alpha < 0.01) return;

    // 스프라이트 캐시 사용 (성능 최적화)
    const { g, size } = getBubbleSprite(this.r, this.hueSeed, this.imageIndex);
    push();
    drawingContext.save();

    // 팡 터지는 애니메이션
    if (this.isPopping && this.popProgress < 1.0) {
      const scale = 1.0 + this.popProgress * 1.5; // 1.0에서 2.5배까지
      const scaledSize = size * scale;
      drawingContext.globalAlpha = this.alpha; // 투명도 적용
      imageMode(CENTER);
      image(g, x, y, scaledSize, scaledSize); // 크기가 커지면서 그리기
    } else {
      // 일반 버블 그리기
      drawingContext.globalAlpha = this.alpha; // 투명도 적용
      imageMode(CENTER);
      image(g, x, y, size, size); // 매 프레임 경량 복사만
    }

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

// 화면에 보이는 버블의 이미지 지연 로딩
function loadVisibleBubbleImages() {
  const LOAD_MARGIN = 200; // 화면 밖 200px까지 미리 로드

  for (const b of bubbles) {
    // alpha가 너무 작으면 스킵
    if (b.alpha < 0.01) continue;

    // 이미지 인덱스가 없으면 스킵
    if (b.imageIndex === null) continue;

    // 이미 로드 중이거나 로드 완료된 이미지는 스킵
    if (imageLoading.has(b.imageIndex) || imageLoaded.has(b.imageIndex))
      continue;

    // 버블이 화면에 보이는지 확인 (여유 공간 포함)
    const effectiveR =
      b.isPopping && b.popProgress < 1.0
        ? b.r * (1.0 + b.popProgress * 1.5)
        : b.r;

    const isOnScreen =
      b.pos.x + effectiveR > -LOAD_MARGIN &&
      b.pos.x - effectiveR < width + LOAD_MARGIN &&
      b.pos.y + effectiveR > -LOAD_MARGIN &&
      b.pos.y - effectiveR < height + LOAD_MARGIN;

    if (isOnScreen) {
      // 이미지 로드 시작
      loadBubbleImage(b.imageIndex);
    }
  }
}

// 개별 버블 이미지 로드 함수
function loadBubbleImage(imageIndex) {
  if (imageIndex === null || imageIndex >= imageFiles.length) return;
  if (imageLoading.has(imageIndex) || imageLoaded.has(imageIndex)) return;

  imageLoading.add(imageIndex);

  loadImage(
    `../explorer/assets/bubble-imgs/${imageFiles[imageIndex]}`,
    (img) => {
      // 로드 성공
      bubbleImages[imageIndex] = img;
      imageLoaded.add(imageIndex);
      imageLoading.delete(imageIndex);

      // 해당 이미지를 사용하는 스프라이트 캐시 무효화
      invalidateSpriteCacheForImage(imageIndex);
    },
    (e) => {
      // 로드 실패
      console.error(
        `bubbleImage[${imageIndex}] (${imageFiles[imageIndex]}) 로딩 실패:`,
        e
      );
      imageLoading.delete(imageIndex);
    }
  );
}

// 특정 이미지를 사용하는 스프라이트 캐시 무효화
function invalidateSpriteCacheForImage(imageIndex) {
  const keysToDelete = [];
  for (const key of SPRITES.keys()) {
    if (key.includes(`img${imageIndex}`)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach((key) => SPRITES.delete(key));
}

// 스프라이트 캐시 시스템 (성능 최적화)
function getBubbleSprite(r, hueSeed, imageIndex = null) {
  const bucket = Math.max(6, Math.round(r / SPRITE_STEP) * SPRITE_STEP);
  const h =
    imageIndex !== null
      ? `img${imageIndex}`
      : Math.floor((hueSeed * 137.5) % 360);
  const key = `${bucket}|${h}`;

  if (SPRITES.has(key)) return SPRITES.get(key);

  const size = bucket * 2;
  const g = createGraphics(size, size);
  g.noStroke();

  // 이미지가 있으면 이미지 사용, 없으면 색상 사용
  if (
    imageIndex !== null &&
    bubbleImages[imageIndex] &&
    bubbleImages[imageIndex].width > 0
  ) {
    // 이미지 사용
    g.push();
    g.imageMode(g.CENTER);
    g.ellipseMode(g.CENTER);

    // 클리핑 마스크로 원형으로 자르기
    g.drawingContext.save();
    g.drawingContext.beginPath();
    g.drawingContext.arc(bucket, bucket, bucket, 0, Math.PI * 2);
    g.drawingContext.clip();

    // 이미지 그리기 (크롭 및 스케일)
    const img = bubbleImages[imageIndex];
    const imgRatio = img.width / img.height;
    const targetRatio = 1;

    let drawW, drawH, offsetX, offsetY;
    if (imgRatio > targetRatio) {
      // 이미지가 더 넓음
      drawH = size;
      drawW = imgRatio * drawH;
      offsetX = (size - drawW) / 2;
      offsetY = 0;
    } else {
      // 이미지가 더 높음
      drawW = size;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (size - drawH) / 2;
    }

    g.image(img, bucket, bucket, drawW, drawH);
    g.drawingContext.restore();
    g.pop();
  } else {
    // 색상 사용
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

    // 화면을 완전히 꽉 채우도록 cover 방식 적용 (비율 유지, 확대하여 화면 채움)
    if (imgRatio > screenRatio) {
      // 이미지가 더 넓음 → 높이에 맞춰 확대 (좌우가 잘림)
      drawH = height;
      drawW = imgRatio * drawH;
      bgOffsetX = (width - drawW) / 2; // 중앙 정렬
      bgOffsetY = 0;
    } else {
      // 이미지가 더 높음 → 너비에 맞춰 확대 (상하가 잘림)
      drawW = width;
      drawH = drawW / imgRatio;
      bgOffsetX = 0;
      bgOffsetY = (height - drawH) / 2; // 중앙 정렬
    }

    // 넘치는 부분을 잘라내기 위해 클리핑 먼저 적용
    bgBuffer.drawingContext.save();
    bgBuffer.drawingContext.beginPath();
    bgBuffer.drawingContext.rect(0, 0, width, height);
    bgBuffer.drawingContext.clip();

    // 화면 전체를 채우도록 이미지 확대하여 그리기
    bgBuffer.imageMode(CORNER);
    bgBuffer.image(bgImage, bgOffsetX, bgOffsetY, drawW, drawH);

    bgBuffer.drawingContext.restore();
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

// 중앙 버블 이미지/색상만 그리기 (캡 없이)
function drawCenterBubbleImage(bubble) {
  if (bubble.alpha < 0.01) return;

  const x = bubble.pos.x;
  const y = bubble.pos.y;
  const r = bubble.r;
  const size = r * 2;

  push();
  drawingContext.save();
  drawingContext.globalAlpha = bubble.alpha;

  // 클리핑 마스크로 원형으로 자르기
  drawingContext.beginPath();
  drawingContext.arc(x, y, r, 0, Math.PI * 2);
  drawingContext.clip();

  // 이미지가 있으면 이미지 사용, 없으면 색상 사용
  if (
    bubble.imageIndex !== null &&
    bubbleImages[bubble.imageIndex] &&
    bubbleImages[bubble.imageIndex].width > 0
  ) {
    // 이미지 사용
    imageMode(CENTER);
    const img = bubbleImages[bubble.imageIndex];
    const imgRatio = img.width / img.height;

    let drawW, drawH;
    if (imgRatio > 1) {
      drawH = size;
      drawW = imgRatio * drawH;
    } else {
      drawW = size;
      drawH = drawW / imgRatio;
    }

    image(img, x, y, drawW, drawH);
  } else {
    // 색상 사용
    const base = bubbleColor(bubble.hueSeed);
    const outer = base.outer;
    const inner = base.inner;

    // 그림자
    drawingContext.shadowBlur = 24;
    drawingContext.shadowColor = "rgba(0,0,0,0.35)";
    fill(outer);
    circle(x, y, size);

    // 글로스 그라디언트
    if (BUBBLE_GLOSS) {
      const grd = drawingContext.createRadialGradient(
        x - r * 0.35,
        y - r * 0.35,
        r * 0.1,
        x,
        y,
        r
      );
      grd.addColorStop(0, "rgba(255,255,255,0.45)");
      grd.addColorStop(0.25, "rgba(255,255,255,0.20)");
      grd.addColorStop(1, inner);
      drawingContext.fillStyle = grd;
      circle(x, y, size);
    }
  }

  drawingContext.restore();
  pop();
}

// 중앙 버블에 빛 효과 그리기 (캡과 사진 사이)
function drawBubbleLightEffect(bubble) {
  push();
  drawingContext.save();

  // 버블 중심과 반지름
  const x = bubble.pos.x;
  const y = bubble.pos.y;
  const r = bubble.r;

  // 시간에 따라 빛이 왼쪽 위에서 오른쪽 위로 이동 (0~1 사이 값)
  const time = (millis() / 3000) % 1; // 3초 주기

  // 각도 범위: 왼쪽 위(-135도)에서 오른쪽 위(-45도)로, 약 20픽셀 아래로 이동
  // -135도 = -3π/4, -45도 = -π/4
  // 20픽셀 아래로 이동하기 위해 각도를 약간 조정
  const offsetPixels = 20; // 아래로 이동할 픽셀 수
  const angleOffset = Math.asin(offsetPixels / r); // 반지름 대비 각도 오프셋

  const startAngle = (-Math.PI * 3) / 4 + angleOffset; // 왼쪽 위에서 약간 아래
  const endAngle = -Math.PI / 4 + angleOffset; // 오른쪽 위에서 약간 아래
  const angleRange = endAngle - startAngle;
  const lightAngle = startAngle + time * angleRange; // 왼쪽 위에서 오른쪽 위로 이동

  // 빛의 위치 (원 둘레를 거꾸로 따라 이동 - 원의 바깥쪽 경로)
  // 반지름을 반전시켜서 원의 바깥쪽 경로를 따라 이동
  const innerRadius = r * 0.7; // 안쪽 반지름
  const outerRadius = r * 0.95; // 바깥쪽 반지름
  const lightRadius = outerRadius - time * (outerRadius - innerRadius); // 시간에 따라 바깥에서 안으로
  const lightX = x + Math.cos(lightAngle) * lightRadius;
  let lightY = y + Math.sin(lightAngle) * lightRadius;

  // 사라질 때(끝 부분) 10픽셀 위로 이동
  const fadeOutDurationForY = 0.15; // 끝 부분 15% 구간
  if (time > 1 - fadeOutDurationForY) {
    const fadeOutProgress =
      (time - (1 - fadeOutDurationForY)) / fadeOutDurationForY; // 0~1
    lightY -= 10 * fadeOutProgress; // 점진적으로 위로 이동
  }

  // 클리핑 마스크로 원형으로 자르기
  drawingContext.beginPath();
  drawingContext.arc(x, y, r, 0, Math.PI * 2);
  drawingContext.clip();

  // 빛의 크기: 중간(-90도 + 오프셋)에서 가장 크고, 양 끝에서 작게
  const centerAngle = -Math.PI / 2 + angleOffset; // 위쪽 중앙 (-90도)에서 약간 아래
  const angleDiff = Math.abs(lightAngle - centerAngle); // 중앙으로부터의 각도 차이
  const maxAngleDiff = Math.PI / 4; // 최대 각도 차이 (45도)
  const sizeFactor = 1 - (angleDiff / maxAngleDiff) * 0.5; // 중간에서 1.0, 양 끝에서 0.5
  const baseLightSize = r * 0.6 * 1.5; // 기본 빛 크기 (1.5배 증가)
  const lightSize = baseLightSize * sizeFactor;

  // 시작과 끝 부분에서 페이드 인/아웃 효과 (부드러운 전환)
  const fadeInDuration = 0.15; // 시작 부분 15% 구간에서 페이드 인
  const fadeOutDuration = 0.15; // 끝 부분 15% 구간에서 페이드 아웃
  let fadeFactor = 1.0;

  if (time < fadeInDuration) {
    // 시작 부분: 페이드 인
    fadeFactor = time / fadeInDuration;
  } else if (time > 1 - fadeOutDuration) {
    // 끝 부분: 페이드 아웃
    fadeFactor = (1 - time) / fadeOutDuration;
  }

  // 빛 효과 그리기 (자연스러운 노출값 집중 효과)
  // 중심부가 매우 밝고 강렬한 빛
  const coreGradient = drawingContext.createRadialGradient(
    lightX,
    lightY,
    0,
    lightX,
    lightY,
    lightSize * 0.3
  );

  // 빛의 강도가 시간에 따라 변하도록 (펄스 효과)
  const pulse = (Math.sin(millis() / 800) + 1) / 2; // 0~1 사이 값
  const baseOpacity = 0.7 + pulse * 0.25; // 0.7~0.95 사이 (외곽 빛용)
  const lightOpacity = baseOpacity * fadeFactor; // 페이드 효과 적용

  // 안쪽 빛(중심부)만 희미하게
  const innerLightOpacity = baseOpacity * 0.4 * fadeFactor; // 안쪽 빛은 40%만

  // 중심부: 매우 밝은 흰색 (노출값 과다 느낌, 희미하게)
  coreGradient.addColorStop(0, `rgba(255, 255, 255, ${innerLightOpacity})`);
  coreGradient.addColorStop(
    0.3,
    `rgba(255, 255, 240, ${innerLightOpacity * 0.9})`
  );
  coreGradient.addColorStop(
    0.6,
    `rgba(255, 250, 200, ${innerLightOpacity * 0.6})`
  );
  coreGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  drawingContext.fillStyle = coreGradient;
  drawingContext.fillRect(x - r, y - r, r * 2, r * 2);

  // 색수차 효과 (무지개색 스펙트럼) - 빛 번짐
  const chromaticGradient = drawingContext.createRadialGradient(
    lightX,
    lightY,
    lightSize * 0.2,
    lightX,
    lightY,
    lightSize * 1.2
  );

  // 색수차 색상 (무지개 스펙트럼)
  const chromaticOpacity = lightOpacity * 0.4 * fadeFactor; // 원래대로
  chromaticGradient.addColorStop(
    0,
    `rgba(255, 200, 150, ${chromaticOpacity * 0.3})`
  ); // 주황
  chromaticGradient.addColorStop(
    0.2,
    `rgba(255, 150, 200, ${chromaticOpacity * 0.4})`
  ); // 분홍
  chromaticGradient.addColorStop(
    0.4,
    `rgba(200, 150, 255, ${chromaticOpacity * 0.5})`
  ); // 보라
  chromaticGradient.addColorStop(
    0.6,
    `rgba(150, 200, 255, ${chromaticOpacity * 0.4})`
  ); // 파랑
  chromaticGradient.addColorStop(
    0.8,
    `rgba(150, 255, 200, ${chromaticOpacity * 0.3})`
  ); // 청록
  chromaticGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  drawingContext.fillStyle = chromaticGradient;
  drawingContext.fillRect(x - r, y - r, r * 2, r * 2);

  // 외곽 빛 번짐 (더 넓은 범위)
  const bloomGradient = drawingContext.createRadialGradient(
    lightX,
    lightY,
    lightSize * 0.5,
    lightX,
    lightY,
    lightSize * 1.5
  );

  const bloomOpacity = lightOpacity * 0.2 * fadeFactor; // 원래대로
  bloomGradient.addColorStop(0, `rgba(255, 255, 255, ${bloomOpacity})`);
  bloomGradient.addColorStop(0.5, `rgba(255, 255, 240, ${bloomOpacity * 0.5})`);
  bloomGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  drawingContext.fillStyle = bloomGradient;
  drawingContext.fillRect(x - r, y - r, r * 2, r * 2);

  drawingContext.restore();
  pop();
}

// 중앙 버블 캡 그리기
function drawCenterBubbleCap(bubble) {
  if (!bubbleCap || bubbleCap.width <= 0) return;
  if (bubble.alpha < 0.01) return;

  const x = bubble.pos.x;
  const y = bubble.pos.y;
  const r = bubble.r;
  // 버블 크기에 정확히 맞추기 위해 약간 크게 설정
  const size = r * 2.05;

  push();
  imageMode(CENTER);
  drawingContext.save();
  drawingContext.globalAlpha = bubble.alpha;
  image(bubbleCap, x, y, size, size);
  drawingContext.restore();
  pop();
}

// 중앙 버블 설명창 그리기
function drawBubbleInfo(bubble, centerX, centerY) {
  const infoY = bubble.pos.y + bubble.r + 20; // 버블 아래 20px (더 가깝게, 위로 올라감)

  // 텍스트 그리기 (배경 틀 제거)
  push();
  noStroke();
  textAlign(CENTER, CENTER); // 가로, 세로 모두 중앙 정렬

  // Pretendard 폰트 적용
  if (pretendardFont) {
    textFont(pretendardFont);
  }

  // 제목 (위쪽) - 더 굵게
  fill(255, 255, 255, 230); // 0.9 * 255 ≈ 230
  textSize(18);
  textStyle(BOLD);
  const titleY = infoY + 25;
  // 텍스트를 약간 오프셋을 두고 두 번 그려서 더 굵게 보이게
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  text(bubble.name, bubble.pos.x, titleY);
  // 약간의 오프셋으로 한 번 더 그려서 굵게
  text(bubble.name, bubble.pos.x + 0.5, titleY);
  text(bubble.name, bubble.pos.x, titleY + 0.5);

  // 태그 (아래쪽)
  if (bubble.tags && bubble.tags.length > 0) {
    fill(255, 255, 255, 180); // 0.7 * 255 ≈ 180
    textSize(14);
    textStyle(NORMAL);
    const tagsText = bubble.tags.slice(0, 3).join("  "); // 최대 3개 태그, 공백으로 구분
    const tagsY = infoY + 55;
    text(tagsText, bubble.pos.x, tagsY);
  }
  pop();
}

// 아크 캐러셀 모드: 아크 중간(버블 아래쪽)에 제목과 설명 표시
function drawBubbleInfoInCircle(bubble, x, y, r) {
  push();
  noStroke();
  textAlign(CENTER, CENTER);

  // Pretendard 폰트 적용
  if (pretendardFont) {
    textFont(pretendardFont);
  }

  // 반응형 스케일 적용
  const responsiveScale = getResponsiveScale();

  // 버블 아래쪽 공간에 텍스트 표시 (버블과 겹치지 않도록, 반응형 스케일 적용)
  const textOffsetY = r + 30 * responsiveScale; // 버블 아래쪽 여백
  const titleY = y + textOffsetY;
  const tagsY = y + textOffsetY + 25 * responsiveScale; // 제목 아래 여백

  // 제목 (버블 아래쪽, 반응형 크기)
  fill(255, 255, 255, 255);
  textSize(20 * responsiveScale);
  textStyle(BOLD);

  // 텍스트 그림자 효과
  drawingContext.save();
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.8)";
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 2;
  text(bubble.name, x, titleY);
  drawingContext.restore();

  // 설명/태그 (제목 아래, 반응형 크기)
  if (bubble.tags && bubble.tags.length > 0) {
    fill(255, 255, 255, 220);
    textSize(14 * responsiveScale);
    textStyle(NORMAL);
    const tagsText = bubble.tags.slice(0, 2).join("  "); // 최대 2개 태그

    drawingContext.save();
    drawingContext.shadowBlur = 8;
    drawingContext.shadowColor = "rgba(0, 0, 0, 0.7)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 1;
    text(tagsText, x, tagsY);
    drawingContext.restore();
  }

  pop();
}

// ---------- p5 LIFECYCLE ----------
function preload() {
  // preload() 내에서는 콜백 없이 직접 할당 (p5.js가 자동으로 동기 처리)
  searchIcon = loadImage("../explorer/assets/public-imgs/lucide_search.svg");
  interestedImage = loadImage("../explorer/assets/public-imgs/interested.png");
  captureButton = loadImage(
    "../explorer/assets/public-imgs/capture-button.png"
  );
  workroomButton = loadImage(
    "../explorer/assets/public-imgs/workroom-button.png"
  );
  navigationBar = loadImage(
    "../explorer/assets/public-imgs/navigation-bar2.png"
  );
  bgImage = loadImage("../explorer/assets/public-imgs/bg.png");
  bubbleCap = loadImage("../explorer/assets/public-imgs/bubble-cap.png");

  // Pretendard 폰트 로드
  pretendardFont = loadFont("../explorer/assets/fonts/PretendardVariable.ttf");

  // 버블 이미지 데이터 정의 (전역 변수로 이동)
  imageFiles = [
    "akihabara.png",
    "cafe.jpg",
    "home.jpg",
    "kyeongbokgung.png",
    "paris.png",
    "park.jpg",
    "pool.jpg",
    "Praha.png",
    "rainy.png",
    "school.jpg",
    "seoul.jpg",
    "street.png",
    "terrace.jpg",
    "town.png",
    "work.jpg",
    "building.jpg",
    "water-glitter.jpg",
    "hamburger.jpg",
    "neon-sign.jpg",
    "hot-sauce.jpg",
    "firework.jpg",
    "fallen-leaf.jpg",
    "sweater.jpg",
    "balloon-dog.png",
    "construction.jpg",
    "library.png",
    "running.png",
    "samgyeopsal.png",
    "basketball.png",
    "hongdae.png",
    "aquarium.png",
    "super-market.png",
    "jeju.png",
    "crosswalk.png",
    "ginkgo-tree.png",
  ];
  // 시각적 언어 카테고리 정의 (이미지 설명 기반)
  // 하나의 사진이 여러 카테고리에 속할 수 있도록 키워드를 확장
  visualLanguageCards = [
    {
      id: "traditional-pattern",
      title: "전통적인 문양",
      subtitle: "Traditional Pattern",
      visualAttributes: [
        "전통",
        "문양",
        "민속",
        "대칭",
        "전통적",
        "궁궐",
        "고전",
        "전통건축",
      ],
      count: 0, // 버블 개수는 나중에 계산
      imageFile: "kyeongbokgung.png", // 전통 궁궐 이미지
    },
    {
      id: "strong-contrast",
      title: "강한 대비감",
      subtitle: "Strong Contrast",
      visualAttributes: [
        "대비",
        "명조",
        "대비감",
        "대비 강화",
        "엣지",
        "부분대비",
        "명도 대비",
        "온냉색 대비",
        "색 대비",
        "브루탈리즘",
        "사선 구도",
      ],
      count: 0,
      imageFile: "building.jpg", // 강한 대비 이미지
    },
    {
      id: "vivid-color",
      title: "비비드한 컬러",
      subtitle: "Vivid Color",
      visualAttributes: [
        "비비드",
        "컬러",
        "고채도",
        "형광",
        "밝은",
        "선명한",
        "비비드 컬러",
        "네온",
        "팝 아트",
        "형광 물질",
      ],
      count: 0,
      imageFile: "super-market.png", // 슈퍼마켓 이미지
    },
    {
      id: "casual-style",
      title: "캐주얼한 스타일",
      subtitle: "Casual Style",
      visualAttributes: [
        "캐주얼",
        "일상",
        "부드러운",
        "편안한",
        "자연스러운",
        "일상적",
        "리듬감",
        "횡단보도",
        "거리",
        "도심",
      ],
      count: 0,
      imageFile: "crosswalk.png", // 횡단보도 이미지
    },
    {
      id: "unique-pattern",
      title: "독특한 패턴",
      subtitle: "Unique Pattern",
      visualAttributes: [
        "패턴",
        "독특한",
        "반복",
        "리듬",
        "구조",
        "그리드",
        "지오메트릭",
        "프랙탈",
        "그물맥",
        "세포 패터닝",
        "반복 패턴",
        "규칙적인",
        "하이라키",
      ],
      count: 0,
      imageFile: "sweater.jpg", // 패턴 이미지
    },
  ];

  // 카드 이미지 로드
  cardImages = [];
  visualLanguageCards.forEach((card) => {
    if (card.imageFile) {
      const img = loadImage(`../explorer/assets/bubble-imgs/${card.imageFile}`);
      cardImages.push(img);
      card.image = img; // 카드 객체에 이미지 참조 저장
    } else {
      cardImages.push(null);
      card.image = null;
    }
  });

  // 태그를 분석하여 시각적 언어 속성 자동 매핑
  // 하나의 사진이 여러 카테고리에 속할 수 있도록 개선
  function mapTagsToVisualLanguage(tags) {
    const attributes = [];
    // 태그를 공백으로 합친 전체 문자열
    const tagString = tags.join(" ").toLowerCase();
    // 각 태그를 개별적으로도 확인 (더 정확한 매핑을 위해)
    const individualTags = tags.map((tag) =>
      tag.toLowerCase().replace("#", "").trim()
    );

    // 각 카드의 visualAttributes와 태그를 비교
    visualLanguageCards.forEach((card) => {
      // 전체 태그 문자열에서 확인
      const matchesInString = card.visualAttributes.some((attr) =>
        tagString.includes(attr.toLowerCase())
      );

      // 개별 태그에서도 확인 (더 정확한 매칭)
      const matchesInTags = card.visualAttributes.some((attr) => {
        const attrLower = attr.toLowerCase();
        return individualTags.some(
          (tag) => tag.includes(attrLower) || attrLower.includes(tag)
        );
      });

      // 둘 중 하나라도 매칭되면 해당 카테고리에 속함
      if (matchesInString || matchesInTags) {
        attributes.push(card.id);
      }
    });

    return attributes;
  }

  bubbleData = [
    {
      title: "아키하바라의 밤거리",
      tags: ["#비비드 컬러 대비", "#시각적 과부하", "#도시광의 반사"],
      attributes: [1, 2, 5], // 여행자, 20대 여성, 10대 여성
    },
    {
      title: "식물 가득한 카페 인테리어",
      tags: ["#자연채광 강조", "#유기적 질감 대비", "#우드톤 통일감"],
      attributes: [2, 4],
    }, // 20대 여성, 주부
    {
      title: "햇살 드는 거실 공간",
      tags: ["#부드러운 파스텔 톤", "#확산광의 따스함", "#시각적 여백감"],
      attributes: [4],
    }, // 주부
    {
      title: "경복궁의 야경",
      tags: ["#점광원의 리듬", "#온·냉색 대비", "#대칭적 구도"],
      attributes: [1, 3],
    }, // 여행자, 50대 남성
    {
      title: "파리 에펠탑의 낮 풍경",
      tags: ["#구조적 중심성", "#공기 원근감", "#자연색 대비"],
      attributes: [1, 2],
    }, // 여행자, 20대 여성
    {
      title: "해질녘 유럽 거리 풍경",
      tags: ["#저채도 컬러 조화", "#따스한 조도 변화", "#거리의 리듬감"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
    {
      title: "야외 수영장과 숲 배경",
      tags: ["#청명한 색 온도", "#인공·자연 질감 대비", "#곡선적 공간 리듬"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "프라하의 석양 다리",
      tags: ["#웜 톤 그라데이션", "#공간 원근의 리듬", "#수면 반사의 균형"],
      attributes: [1, 3],
    }, // 여행자, 50대 남성
    {
      title: "비 오는 도심 거리",
      tags: ["#반사광 질감 대비", "#선형 원근 강조", "#냉색 조명 톤"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "학교 전경과 운동장",
      tags: ["#대지색 대비", "#대칭적 수평 구도", "#명시적 공간 구조"],
      attributes: [5],
    }, // 10대 여성
    {
      title: "서울의 봄 전경",
      tags: ["#계절적 명도 대비", "#원근감 흐름", "#수평선 중심 구도"],
      attributes: [1, 2, 3],
    }, // 여행자, 20대 여성, 50대 남성
    {
      title: "남산과 전통건축 조망",
      tags: ["#계절 색채의 계조", "#수직 원근 흐름", "#전통·현대 혼성 구도"],
      attributes: [1, 2],
    }, // 여행자, 20대 여성
    {
      title: "루프탑 테라스 공간",
      tags: ["#황혼의 명도 대비", "#개방적 공간감", "#점광원의 리듬"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
    {
      title: "고즈넉한 유럽 골목",
      tags: ["#저명도 톤 밸런스", "#반사 질감의 부드러움", "#중앙 구도 안정성"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
    {
      title: "건설 현장의 일출 풍경",
      tags: ["#황금광 대비", "#산업적 질감 강조", "#수직 구조 리듬"],
      attributes: [3],
    }, // 50대 남성
    {
      title: "빌딩",
      tags: ["#사선 구도", "#엣지 부분대비", "#브루탈리즘"],
      attributes: [1, 3],
    }, // 여행자, 50대 남성
    {
      title: "윤슬",
      tags: ["#사인 곡선", "#투명색", "#반추상"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "참깨 빵",
      tags: ["#유기적인 분포", "#비정형성", "#표면 밀도감"],
      attributes: [4],
    }, // 주부
    {
      title: "네온 사인",
      tags: ["#형광 물질", "#외부 광선", "#팝 아트"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "핫소스",
      tags: ["#동심원 모양", "#점성 질감", "#모노크롬 미니멀리즘"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
    {
      title: "폭죽 놀이",
      tags: ["#방사선 구도", "#광채 확산", "#동적 에너지"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "가을 낙엽",
      tags: ["#그물맥 구조", "#세포 패터닝", "#프랙탈"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
    {
      title: "성탄절 스웨터",
      tags: ["#지오메트릭", "#하이라키", "#민속 모티프"],
      attributes: [4, 5],
    }, // 주부, 10대 여성
    {
      title: "풍선 강아지",
      tags: ["#풍선 질감", "#반사 질감", "#포스트모더니즘"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "철근",
      tags: ["#산업 질감", "#규칙적인 그리드", "#텍토닉"],
      attributes: [1, 3],
    }, // 여행자, 50대 남성
    {
      title: "고전 도서관의 정적",
      tags: ["#확산광의 깊이감", "#목재 질감의 통일성", "#수직적 반복 리듬"],
      attributes: [3],
    }, // 50대 남성
    {
      title: "트랙 위의 질주",
      tags: ["#저각 원근 강조", "#역광 실루엣 효과", "#동세 중심 구도"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "삼겹살 식사 장면",
      tags: ["#근접 시선 구도", "#온기감 있는 색채", "#증기와 조명의 대비"],
      attributes: [2, 4],
    }, // 20대 여성, 주부
    {
      title: "실내 농구 경기",
      tags: [
        "#역동적 순간 포착",
        "#인공조명의 균일 조도",
        "#원형 구도의 집중감",
      ],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "홍대 거리 버스킹",
      tags: ["#네온 조명 대비", "#군중 밀도감", "#도시적 에너지 흐름"],
      attributes: [1, 2, 5],
    }, // 여행자, 20대 여성, 10대 여성
    {
      title: "수족관 터널 전경",
      tags: ["#수중광의 산란", "#곡면 원근감", "#청록색 단일 톤"],
      attributes: [2, 5],
    }, // 20대 여성, 10대 여성
    {
      title: "대형마트 통로",
      tags: ["#선형 원근 구도", "#인공조명 균질성", "#포장색의 반복 패턴"],
      attributes: [4],
    }, // 주부
    {
      title: "제주 해안 일몰",
      tags: [
        "#색온도 그라데이션",
        "#수평선 중심 안정감",
        "#반사광의 질감 대비",
      ],
      attributes: [1, 3, 4],
    }, // 여행자, 50대 남성, 주부
    {
      title: "차창 밖 횡단보도",
      tags: ["#프레이밍 구도", "#일상적 리듬감", "#선형 대비 구조"],
      attributes: [2, 4],
    }, // 20대 여성, 주부
    {
      title: "가을 은행나무길",
      tags: ["#계절색 지배", "#원근 반복 리듬", "#자연광의 부드러운 투과"],
      attributes: [3, 4],
    }, // 50대 남성, 주부
  ];

  // 모든 버블 데이터에 시각적 언어 속성 자동 매핑
  bubbleData.forEach((data) => {
    data.visualLanguageAttributes = mapTagsToVisualLanguage(data.tags);
  });

  // 각 카드의 버블 개수 계산
  visualLanguageCards.forEach((card) => {
    card.count = bubbleData.filter((data) =>
      data.visualLanguageAttributes.includes(card.id)
    ).length;
  });

  // 버블 이미지 배열 초기화 (지연 로딩을 위해 null로 초기화)
  for (let i = 0; i < imageFiles.length; i++) {
    bubbleImages.push(null);
  }

  // 초기 화면에 보일 버블 이미지만 미리 로드 (성능 최적화)
  // setup()에서 화면에 보이는 버블 확인 후 로드
}

function setup() {
  // Windows/데스크톱에서만 pixelDensity(1) 설정 (iPad는 제외)
  if (!/iPad|iPhone|Macintosh/.test(navigator.userAgent)) {
    pixelDensity(1); // 윈도우/데스크탑에서 좌표/크기 싱크 맞춤
  }
  frameRate(45); // 60→45로 캡(시각적 차이는 적고 연산 25%↓)
  createCanvas(windowWidth, windowHeight);

  rebuildWorldMetrics(); // 월드 메트릭스 초기화
  buildBubbles();

  // 검색 입력 필드 생성 (interested 이미지 사용 시 숨김)
  // createSearchInput(); // interested 이미지 사용으로 인해 주석 처리

  // 자산 로딩 확인 및 에러 체크
  if (
    !searchIcon ||
    (searchIcon.width !== undefined && searchIcon.width === 0)
  ) {
    console.error("searchIcon 로딩 실패");
  }
  if (
    !interestedImage ||
    (interestedImage.width !== undefined && interestedImage.width === 0)
  ) {
    console.error("interestedImage 로딩 실패");
  }
  if (
    !captureButton ||
    (captureButton.width !== undefined && captureButton.width === 0)
  ) {
    console.error("captureButton 로딩 실패");
  }
  if (
    !workroomButton ||
    (workroomButton.width !== undefined && workroomButton.width === 0)
  ) {
    console.error("workroomButton 로딩 실패");
  }
  if (
    !navigationBar ||
    (navigationBar.width !== undefined && navigationBar.width === 0)
  ) {
    console.error("navigationBar 로딩 실패");
  }
  if (!bgImage || (bgImage.width !== undefined && bgImage.width === 0)) {
    console.error("bgImage 로딩 실패");
  } else {
    redrawBackgroundBuffer();
  }
  if (!bubbleCap || (bubbleCap.width !== undefined && bubbleCap.width === 0)) {
    console.error("bubbleCap 로딩 실패");
  }
  if (!pretendardFont) {
    console.error("pretendardFont 로딩 실패");
  }

  // 네비게이션 바 고해상도 버퍼 생성 (한 번만 생성)
  // windowResized에서 재생성하므로 여기서는 기본 크기로 생성
  if (navigationBar) {
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();

    const NAV_W = navigationBar.width * 0.65 * responsiveScale;
    const NAV_H = navigationBar.height * 0.65 * responsiveScale;
    const scaleFactor = 2;
    navBarBuffer = createGraphics(NAV_W * scaleFactor, NAV_H * scaleFactor);
    navBarBuffer.imageMode(CORNER);
    navBarBuffer.image(
      navigationBar,
      0,
      0,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
  }

  // 초기 화면에 보이는 버블 이미지 로드
  loadVisibleBubbleImages();

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

  // 포인터 이벤트 브릿지 설정 (Windows 터치스크린 지원)
  setupPointerBridges();

  // 초기 상태에서 첫 번째 카테고리 자동 선택
  if (visualLanguageCards.length > 0) {
    selectCard(0);
  }
}

// 포인터 이벤트 브릿지 함수 (Windows 터치스크린/펜 지원)
function setupPointerBridges() {
  // 포인터 다운 → mousePressed 브릿지
  window.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse") {
      // 마우스가 아닌 포인터(터치/펜)만 처리
      // p5의 mousePressed는 자동으로 호출되지만, 명시적으로 처리
      if (typeof mousePressed === "function") {
        // p5 전역 변수 업데이트 (필요한 경우)
        // mouseX, mouseY는 이미 p5가 업데이트하므로 추가 작업 불필요
      }
    }
  });

  // 포인터 이동 → mouseDragged 브릿지
  window.addEventListener("pointermove", (e) => {
    if (isDragging && e.pointerType !== "mouse") {
      // p5의 mouseDragged는 자동으로 호출됨
    }
  });

  // 포인터 업 이벤트를 캔버스에 직접 바인딩 (더 정확한 감지)
  const handlePointerUp = (e) => {
    if (e.pointerType !== "mouse") {
      // 포인터 업 이벤트를 mouseReleased로 명시적으로 전달
      // p5.js의 mouseReleased는 마우스 이벤트에만 반응할 수 있으므로 직접 호출
      if (
        typeof mouseReleased === "function" &&
        typeof canvas !== "undefined" &&
        canvas &&
        canvas.elt
      ) {
        // mouseX, mouseY를 포인터 위치로 업데이트
        const rect = canvas.elt.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        // 드래그 중이었다면 mouseReleased 호출하여 자동 정렬 트리거
        // isDragging 상태는 mouseReleased 내부에서 확인됨
        mouseReleased();
      }
    }
  };

  // 캔버스와 window 모두에 이벤트 바인딩 (더 확실한 감지)
  // canvas.elt가 존재하는지 확인
  if (typeof canvas !== "undefined" && canvas && canvas.elt) {
    canvas.elt.addEventListener("pointerup", handlePointerUp);
  }
  window.addEventListener("pointerup", handlePointerUp);

  // 포인터가 캔버스 밖으로 나갔을 때도 처리 (손을 떼어낸 것으로 인식)
  const handlePointerLeave = (e) => {
    if (e.pointerType !== "mouse" && isDragging) {
      // 드래그 중이었다면 손을 뗀 것으로 처리
      if (
        typeof mouseReleased === "function" &&
        typeof canvas !== "undefined" &&
        canvas &&
        canvas.elt
      ) {
        const rect = canvas.elt.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        mouseReleased();
      }
    }
  };

  if (typeof canvas !== "undefined" && canvas && canvas.elt) {
    canvas.elt.addEventListener("pointerleave", handlePointerLeave);
  }
  window.addEventListener("pointerleave", handlePointerLeave);

  // 포인터 취소 (예: 시스템 제스처로 인한 취소)
  const handlePointerCancel = (e) => {
    if (e.pointerType !== "mouse" && isDragging) {
      // 드래그 중이었다면 손을 뗀 것으로 처리
      if (
        typeof mouseReleased === "function" &&
        typeof canvas !== "undefined" &&
        canvas &&
        canvas.elt
      ) {
        const rect = canvas.elt.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        mouseReleased();
      }
    }
  };

  if (typeof canvas !== "undefined" && canvas && canvas.elt) {
    canvas.elt.addEventListener("pointercancel", handlePointerCancel);
  }
  window.addEventListener("pointercancel", handlePointerCancel);
}

function createSearchInput() {
  const responsiveScale = getResponsiveScale();
  const { W, H, X, Y } = getSearchMetrics();

  // 아이콘 영역을 제외한 텍스트 입력 영역 - 30% 증가
  const iconSize = 24 * SEARCH_SCALE * responsiveScale * 1.5 * 1.3;
  const iconX = X + 24 * SEARCH_SCALE * responsiveScale * 1.3;
  const textStartX =
    iconX + iconSize + 16 * SEARCH_SCALE * responsiveScale * 1.3;
  const textWidth =
    W - (textStartX - X) - 24 * SEARCH_SCALE * responsiveScale * 1.3;

  searchInput = createInput("");
  searchInput.attribute("placeholder", "");
  searchInput.position(textStartX, Y);
  searchInput.size(textWidth, H);
  searchInput.style("background", "transparent");
  searchInput.style("border", "none");
  searchInput.style("outline", "none");
  searchInput.style("color", "rgba(255,255,255,0.8)");
  searchInput.style(
    "font-size",
    `${16 * SEARCH_SCALE * responsiveScale * 1.2 * 1.5 * 1.3}px`
  );
  searchInput.style("font-family", "inherit");
  searchInput.style("padding", "0");
  searchInput.style("margin", "0");
  searchInput.style("z-index", "1000"); // 가장 위에 표시
  searchInput.style("text-align", "center"); // 텍스트 중앙 정렬
  searchInput.style("line-height", `${H}px`); // 세로 중앙 정렬을 위한 line-height

  // Windows에서 레이어 문제 방지: pointer-events 및 위치 제어
  searchInput.style("pointer-events", "auto"); // 포커스 가능
  searchInput.style("position", "absolute");
  searchInput.style("overflow", "hidden");
  searchInput.style("white-space", "nowrap");
}

function draw() {
  // 배경 버퍼 사용 (성능 최적화)
  if (bgBuffer) {
    image(bgBuffer, 0, 0);
  } else {
    background(BG_COLOR);
  }

  // 릴리즈 워치독: 드래그 중 입력이 끊기면 자동으로 손을 뗀 것으로 처리
  if (isDragging && millis() - lastPointerStamp > RELEASE_IDLE_MS) {
    isDragging = false;
    // pointercancel/leave 등으로 놓치는 경우 보정
    snapTargetX = null;
    snapTargetY = null;
    snapCompleted = false;
    // 바로 중앙 버블로 스냅 시작
    snapToCenterBubble();
  }

  // 패닝 애니메이션 업데이트 (관성 및 스냅)
  if (!isDragging) {
    // 스냅 타겟이 있으면 부드럽게 스냅
    if (snapTargetX !== null && snapTargetY !== null) {
      const dx = snapTargetX - offsetX;
      const dy = snapTargetY - offsetY;
      const dist = sqrt(dx * dx + dy * dy);

      // 목표 위치에 충분히 가까우면 스냅 완료
      if (dist < 0.1) {
        offsetX = snapTargetX;
        offsetY = snapTargetY;
        snapTargetX = null;
        snapTargetY = null;
        panVelocityX = 0;
        panVelocityY = 0;
        snapCompleted = true; // 스냅 완료 표시
        // 중앙 버블이 있으면 빛 효과를 위해 애니메이션 계속 실행
        // stopAnim()은 나중에 중앙 버블 확인 후 호출
      } else {
        // 부드럽게 타겟으로 이동 (거리에 따라 속도 조정)
        const dx = snapTargetX - offsetX;
        const dy = snapTargetY - offsetY;
        const dist = sqrt(dx * dx + dy * dy);

        // 거리가 멀수록 더 빠르게, 가까울수록 더 느리게 (자연스러운 감속)
        const dynamicSpeed = min(SNAP_SPEED * (1 + dist / 1000), 0.25);

        offsetX = lerp(offsetX, snapTargetX, dynamicSpeed);
        offsetY = lerp(offsetY, snapTargetY, dynamicSpeed);
        panVelocityX = 0; // 스냅 중에는 관성 무시
        panVelocityY = 0;
      }
    } else {
      // 관성 이동
      panVelocityX *= 0.95; // 감쇠
      panVelocityY *= 0.95;
      offsetX += panVelocityX;
      offsetY += panVelocityY;

      // 속도가 매우 작아지면 스냅 시작 (한 번만)
      if (abs(panVelocityX) < 0.1 && abs(panVelocityY) < 0.1) {
        panVelocityX = 0;
        panVelocityY = 0;
        // 스냅 타겟이 없고, 아직 스냅이 완료되지 않았을 때만 스냅 시작
        if (snapTargetX === null && snapTargetY === null && !snapCompleted) {
          snapToCenterBubble();
        }
      }
    }
  }

  // 중심 위치 계산 (검색창 아래 영역의 중앙)
  const { H: SEARCH_H, bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
  const BUBBLE_AREA_BOTTOM = height - 10;
  const BUBBLE_AREA_CENTER =
    BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;

  const centerX = width * CENTER_X_RATIO;
  const centerY = BUBBLE_AREA_CENTER - 70; // 검색창 아래 영역의 중앙에서 70픽셀 위 (더 위로)

  // 버블 필터링 (선택된 카드가 있으면 해당 시각적 언어 속성을 가진 버블만 표시)
  let filteredBubbles = bubbles;
  if (selectedCardIndex !== null && visualLanguageCards[selectedCardIndex]) {
    const selectedCard = visualLanguageCards[selectedCardIndex];
    filteredBubbles = bubbles.filter((b) => {
      // 버블의 시각적 언어 속성 중 하나라도 선택된 카드에 포함되면 표시
      return (
        b.visualLanguageAttributes &&
        b.visualLanguageAttributes.includes(selectedCard.id)
      );
    });

    // 필터링된 버블을 전역 변수에 저장 (snapToCenterBubble에서 사용)
    currentFilteredBubbles = filteredBubbles;

    // 이전 카테고리와 새 카테고리 모두에 포함되는 버블 찾기 (유지되는 버블)
    let previousFilteredBubbles = [];
    if (
      previousSelectedCardIndex !== null &&
      visualLanguageCards[previousSelectedCardIndex]
    ) {
      const previousCard = visualLanguageCards[previousSelectedCardIndex];
      previousFilteredBubbles = bubbles.filter((b) => {
        return (
          b.visualLanguageAttributes &&
          b.visualLanguageAttributes.includes(previousCard.id)
        );
      });
    }

    // 공통 버블 (이전과 새 카테고리 모두에 포함되는 버블)
    const commonBubbles = filteredBubbles.filter((b) =>
      previousFilteredBubbles.includes(b)
    );

    // 필터링되지 않은 버블들 팡 터지기 시작 (단, 공통 버블은 제외)
    bubbles.forEach((b) => {
      const isFiltered = filteredBubbles.includes(b);
      const isCommon = commonBubbles.includes(b);
      // 필터링되지 않았고, 공통 버블이 아니면 팡 터지기
      if (!isFiltered && !isCommon && !b.isPopping) {
        b.isPopping = true;
        b.popStartTime = millis();
        b.popProgress = 0;
      }
    });
  } else {
    // 토글이 선택되지 않았으면 모든 팡 터지는 애니메이션 중지
    bubbles.forEach((b) => {
      if (b.isPopping) {
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0;
      }
    });
    // 필터링되지 않았으므로 모든 버블 사용
    currentFilteredBubbles = bubbles;
  }

  // 팡 터지는 애니메이션 업데이트
  const POP_DURATION = 500; // 0.5초 동안 팡 터짐 (더 부드럽게)
  let allPopped = true; // 모든 팡 터지는 버블이 완료되었는지 확인
  let lastPopEndTime = 0; // 마지막 팡 터짐 완료 시간

  // Easing 함수: ease-out cubic
  function easeOutCubic(t) {
    return 1 - pow(1 - t, 3);
  }

  bubbles.forEach((b) => {
    if (b.isPopping) {
      const elapsed = millis() - b.popStartTime;
      const rawProgress = Math.min(elapsed / POP_DURATION, 1.0);
      b.popProgress = easeOutCubic(rawProgress); // easing 적용

      if (b.popProgress >= 1.0) {
        b.alpha = 0; // 완전히 사라짐
        // 팡 터짐 완료 시간 기록
        const popEndTime = b.popStartTime + POP_DURATION;
        if (popEndTime > lastPopEndTime) {
          lastPopEndTime = popEndTime;
        }
      } else {
        // 팡 터지는 효과: 커지면서 투명해짐 (더 부드러운 곡선)
        const scale = 1.0 + b.popProgress * 1.2; // 1.0에서 2.2배까지 (더 부드럽게)
        b.alpha = 1.0 - b.popProgress; // 투명도 감소
        // 실제 반지름은 업데이트하지 않고 그릴 때만 스케일 적용
        allPopped = false; // 아직 팡 터지는 중인 버블이 있음
      }
    }
  });

  // === 버블 섹션 ===
  let centerBubble = null;

  if (ARC_MODE) {
    // 아크 캐러셀 모드
    // 버블이 아크를 따라 이동하는 애니메이션 (drawArcCarousel 내부에서 처리)
    drawArcCarousel();
    // 아크 캐러셀에서는 centerBubble을 drawArcCarousel 내부에서 처리
  } else {
    // 기존 자유 패닝(애플워치식) 모드
    // 버블 업데이트 및 그리기 (화면에 보이는 것만)
    // 먼저 모든 버블 업데이트하여 중앙 버블 찾기 (1차 업데이트)
    // 필터링된 버블들은 alpha를 1.0으로 보장하고 페이드아웃 로직 건너뛰기
    filteredBubbles.forEach((b) => {
      // 필터링된 버블은 팡 터지는 중이 아니면 alpha를 1.0으로 강제 설정
      if (!b.isPopping) {
        b.alpha = 1.0;
      }
      // 필터링된 버블임을 표시하기 위해 임시 속성 추가 (update에서 사용)
      b._isFiltered = true;
      b.update(centerX, centerY, offsetX, offsetY, null);
      b._isFiltered = false; // 업데이트 후 제거
    });

    // 팡 터지는 버블도 위치 업데이트 (애니메이션을 위해)
    bubbles.forEach((b) => {
      if (b.isPopping && b.alpha > 0.01) {
        b.update(centerX, centerY, offsetX, offsetY, null);
      }
    });

    // 중앙에 가장 가까운 버블 찾기 (필터링된 버블 중에서)
    let minDistToCenter = Infinity;
    filteredBubbles.forEach((b) => {
      const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
      if (distToCenter < minDistToCenter) {
        minDistToCenter = distToCenter;
        centerBubble = b;
      }
    });

    // 중앙 버블을 최대 크기로 부드럽게 설정 (배경 움직임에 따라 동적으로 변함)
    if (centerBubble) {
      // 부드럽게 최대 크기로 변화 (1.4배 * 0.9 = 1.26배, 더 크게)
      centerBubble.r = lerp(centerBubble.r, MAX_BUBBLE_RADIUS * 1.4 * 0.9, 0.2);

      // 중앙 버블 위치를 전달하여 주변 버블들이 작아지도록 재업데이트 (필터링된 버블만)
      filteredBubbles.forEach((b) => {
        if (b !== centerBubble) {
          b.update(centerX, centerY, offsetX, offsetY, centerBubble.pos);
        }
      });
    }

    // 검색창과 네비게이션 바 영역 계산 (재사용)
    const NAV_Y = 20;
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();
    const NAV_H = navigationBar
      ? navigationBar.height * 0.45 * responsiveScale
      : 64;
    const NAV_BOTTOM = NAV_Y + NAV_H;

    // 화면에 보이는 버블의 이미지 지연 로딩
    loadVisibleBubbleImages();

    // LOD: 보이는 버블만 수집하고 가까운 순으로 정렬 (성능 최적화)
    // 필터링된 버블과 팡 터지는 버블 모두 포함
    const visible = [];
    for (const b of bubbles) {
      // alpha가 너무 작으면 스킵
      if (b.alpha < 0.01) continue;

      // 팡 터지는 버블은 스케일을 고려한 크기로 확인
      const effectiveR =
        b.isPopping && b.popProgress < 1.0
          ? b.r * (1.0 + b.popProgress * 1.5)
          : b.r;

      // 버블이 화면에 보이는지 확인
      const isOnScreen =
        b.pos.x + effectiveR > -50 &&
        b.pos.x - effectiveR < width + 50 &&
        b.pos.y + effectiveR > -50 &&
        b.pos.y - effectiveR < height + 50;

      // 버블이 검색창 아래 영역에만 있는지 확인
      const bubbleTop = b.pos.y - effectiveR;
      const bubbleBottom = b.pos.y + effectiveR;
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

    // 상위 MAX_DRAW개만 그리기 (중앙 버블 제외)
    for (let i = 0; i < Math.min(MAX_DRAW, visible.length); i++) {
      if (visible[i][1] !== centerBubble) {
        visible[i][1].draw();
      }
    }

    // 중앙 버블은 별도로 그리기 (이미지 -> 빛 -> 캡 순서)
    if (centerBubble) {
      // 1. 버블 이미지/색상만 그리기 (캡 없이)
      drawCenterBubbleImage(centerBubble);
      // 2. 빛 효과 그리기 (캡과 사진 사이)
      drawBubbleLightEffect(centerBubble);
      // 3. 캡 그리기
      drawCenterBubbleCap(centerBubble);

      // 중앙 버블이 있으면 빛 효과를 위해 애니메이션 계속 실행
      startAnim();
    } else {
      // 중앙 버블이 없고 모든 움직임이 멈췄으면 애니메이션 정지
      // 단, 모달이 열려있으면 애니메이션 계속 실행
      if (
        snapTargetX === null &&
        snapTargetY === null &&
        abs(panVelocityX) < 0.1 &&
        abs(panVelocityY) < 0.1 &&
        !isDragging &&
        !showModal
      ) {
        stopAnim();
      } else if (showModal) {
        // 모달이 열려있으면 애니메이션 계속 실행
        startAnim();
      }
    }
  }

  vignette();

  // 검색창과 네비게이션 바를 가장 위에 그리기 (버블 위에 표시)
  drawNavBar();
  drawSearchBar();

  // 시각적 언어 카드 그리기 (검색창 아래)
  drawVisualLanguageCards();

  // 토글 표시 (더 이상 사용하지 않음)
  // if (showToggles) {
  //   drawToggles();
  // }

  // 설명창은 가장 마지막에 그리기 (다른 요소 위에 표시)
  if (centerBubble) {
    drawBubbleInfo(centerBubble, centerX, centerY);
  }

  // 모달 표시
  if (showModal) {
    drawModal();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  rebuildWorldMetrics(); // 월드 메트릭스 재계산
  redrawBackgroundBuffer(); // 배경 버퍼 재생성
  buildBubbles(); // 버블 재생성

  // 네비게이션 바 고해상도 버퍼 재생성 (화면 크기 변경 시)
  if (navigationBar) {
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();

    const NAV_W = navigationBar.width * 0.65 * responsiveScale;
    const NAV_H = navigationBar.height * 0.65 * responsiveScale;
    const scaleFactor = 2;
    navBarBuffer = createGraphics(NAV_W * scaleFactor, NAV_H * scaleFactor);
    navBarBuffer.imageMode(CORNER);
    navBarBuffer.image(
      navigationBar,
      0,
      0,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
  }

  // 검색 입력 필드 위치 업데이트
  if (searchInput) {
    const responsiveScale = getResponsiveScale();
    const { W, H, X, Y } = getSearchMetrics();
    const iconSize = 24 * SEARCH_SCALE * responsiveScale * 1.5 * 1.3;
    const iconX = X + 24 * SEARCH_SCALE * responsiveScale * 1.3;
    const textStartX =
      iconX + iconSize + 16 * SEARCH_SCALE * responsiveScale * 1.3;
    const textWidth =
      W - (textStartX - X) - 24 * SEARCH_SCALE * responsiveScale * 1.3;

    searchInput.position(textStartX, Y);
    searchInput.size(textWidth, H);
    searchInput.style(
      "font-size",
      `${16 * SEARCH_SCALE * responsiveScale * 1.2 * 1.5}px`
    );
    searchInput.style("text-align", "center"); // 텍스트 중앙 정렬
    searchInput.style("line-height", `${H}px`); // 세로 중앙 정렬을 위한 line-height
  }
}

// ---------- UTILS ----------
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

// 검색창 메트릭 헬퍼 함수
function getSearchMetrics() {
  const responsiveScale = getResponsiveScale();

  // 네비게이션 바 높이 계산
  const NAV_Y = 20;
  const NAV_H = navigationBar
    ? navigationBar.height * 0.45 * responsiveScale
    : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;

  // 검색창 너비: 화면 너비의 비율로 반응형 조정 - 30% 증가
  const W = width * SEARCH_WIDTH_RATIO * responsiveScale * 1.3;
  const H = 75 * SEARCH_SCALE * responsiveScale * 1.3;
  const X = (width - W) / 2;
  // 태블릿에서는 간격을 줄이기 위해 반응형 스케일 적용 (화면이 작을수록 간격 작아짐)
  // 태블릿에서 간격을 더 줄이기 위해 스케일을 더 작게 적용
  const gapScale = Math.min(1, responsiveScale * 0.3); // 태블릿에서 간격을 60%로 줄임
  const gap = SEARCH_NAV_GAP * gapScale;
  const Y = NAV_BOTTOM + gap;

  return { W, H, X, Y, bottom: Y + H };
}

// 중앙 버블을 화면 중앙에 고정하는 함수 (타겟만 설정)
// filteredBubbles를 전역에서 접근할 수 있도록 변수로 저장
let currentFilteredBubbles = [];

function snapToCenterBubble() {
  // 중심 위치 계산
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
  const BUBBLE_AREA_BOTTOM = height - 10;
  const BUBBLE_AREA_CENTER =
    BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;

  const centerX = width * CENTER_X_RATIO;
  const centerY = BUBBLE_AREA_CENTER - 70; // 검색창 아래 영역의 중앙에서 70픽셀 위 (더 위로)

  // 필터링된 버블만 사용 (없으면 모든 버블 사용)
  const bubblesToUse =
    currentFilteredBubbles.length > 0 ? currentFilteredBubbles : bubbles;

  // 필터링된 버블만 업데이트하여 현재 위치 계산
  bubblesToUse.forEach((b) => {
    b.update(centerX, centerY, offsetX, offsetY, null);
  });

  // 중앙에 가장 가까운 버블 찾기 (필터링된 버블 중에서)
  let centerBubble = null;
  let minDistToCenter = Infinity;
  bubblesToUse.forEach((b) => {
    const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
    if (distToCenter < minDistToCenter) {
      minDistToCenter = distToCenter;
      centerBubble = b;
    }
  });

  // 중앙 버블이 있으면 그 버블이 화면 중앙에 오도록 타겟 오프셋 계산
  if (centerBubble) {
    // 피시아이 효과를 고려하여 반복적으로 정확한 오프셋 계산
    let hexX = centerBubble.gridX * HEX_SPACING * 1.5;
    let hexY =
      centerBubble.gridY * HEX_SPACING * sqrt(3) +
      ((centerBubble.gridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    // 현재 오프셋을 기준으로 타겟 오프셋 계산
    let targetOffsetX = offsetX;
    let targetOffsetY = offsetY;

    // 반복적으로 조정하여 정확한 위치 찾기 (최대 5회)
    for (let iter = 0; iter < 5; iter++) {
      // 타겟 오프셋으로 버블 위치 계산
      const worldWidth = WORLD_W;
      const worldHeight = WORLD_H;
      let worldX = hexX + targetOffsetX;
      let worldY = hexY + targetOffsetY;

      // 토러스 래핑
      worldX = ((worldX % worldWidth) + worldWidth) % worldWidth;
      worldY = ((worldY % worldHeight) + worldHeight) % worldHeight;

      // 화면 중심 기준 상대 위치
      let screenX = worldX - centerX;
      let screenY = worldY - centerY;

      // 토러스 래핑
      if (abs(screenX) > worldWidth / 2) {
        screenX = screenX > 0 ? screenX - worldWidth : screenX + worldWidth;
      }
      if (abs(screenY) > worldHeight / 2) {
        screenY = screenY > 0 ? screenY - worldHeight : screenY + worldHeight;
      }

      // 피시아이 효과 적용 전 거리
      const distFromCenter = sqrt(screenX * screenX + screenY * screenY);
      const maxDist = sqrt(width * width + height * height) / 2;
      const normalizedDist = min(distFromCenter / maxDist, 1);
      const fisheyeFactor = 1 + (1 - normalizedDist) * FISHEYE_STRENGTH;

      // 피시아이 효과 적용 후 화면상 위치
      const displayX = centerX + screenX * fisheyeFactor;
      const displayY = centerY + screenY * fisheyeFactor;

      // 목표 위치와의 차이
      const dx = centerX - displayX;
      const dy = centerY - displayY;

      // 차이가 충분히 작으면 종료
      if (abs(dx) < 0.1 && abs(dy) < 0.1) break;

      // 피시아이 효과를 역계산하여 타겟 오프셋 조정
      const reverseScreenX = dx / fisheyeFactor;
      const reverseScreenY = dy / fisheyeFactor;

      // 타겟 오프셋 업데이트
      targetOffsetX += reverseScreenX;
      targetOffsetY += reverseScreenY;
    }

    // 타겟 오프셋 설정 (부드럽게 이동하도록)
    snapTargetX = targetOffsetX;
    snapTargetY = targetOffsetY;

    // 애니메이션 시작
    startAnim();
  }
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
  const maxImageIndex = Math.min(bubbleImages.length, TOTAL_BUBBLES);

  for (let y = 0; y < gridSize && count < TOTAL_BUBBLES; y++) {
    for (let x = 0; x < gridSize && count < TOTAL_BUBBLES; x++) {
      const hueSeed = count + 1;
      // 이미지가 있으면 이미지 인덱스 사용, 없으면 null (색상 사용)
      const imageIndex = count < maxImageIndex ? count : null;
      bubbles.push(new Bubble(x, y, hueSeed, imageIndex));
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
  lastPointerStamp = millis();
  // 검색창 클릭 확인 (드래그 방지 전에 확인)
  const isSearchBarClick = checkSearchBarClick(mouseX, mouseY);

  // 검색창이 아닌 곳을 클릭하면 input 비활성화하여 드래그 확보
  if (!isSearchBarClick && searchInput) {
    searchInput.style("pointer-events", "none"); // 캔버스 드래그 확보
  }

  // 네비게이션 바 클릭 확인
  if (navigationBar && checkNavBarClick(mouseX, mouseY)) {
    showModal = true;
    showToggles = false; // 모달 열릴 때 토글 닫기
    startAnim(); // 모달 애니메이션을 위해 애니메이션 시작
    return;
  }

  // 모달이 열려있으면 닫기
  if (showModal) {
    showModal = false;
    return;
  }

  // 카드 클릭 확인 (검색창과 네비게이션 바 클릭보다 먼저 확인)
  const clickedCardIndex = checkCardClick(mouseX, mouseY);
  if (clickedCardIndex !== null) {
    selectCard(clickedCardIndex);
    startAnim();
    return;
  }

  // 토글이 열려있으면 토글 클릭 확인 (더 이상 사용하지 않음)
  // if (showToggles) {
  //   const clickedToggle = checkToggleClick(mouseX, mouseY);
  //   if (clickedToggle !== null) {
  //     // 토글 클릭 시 바로 적용
  //     toggleSelect(clickedToggle);
  //     return;
  //   }
  //   // 토글 외부 클릭 시 닫기
  //   if (!isSearchBarClick) {
  //     showToggles = false;
  //   }
  // }

  // 검색창 클릭 확인
  if (isSearchBarClick) {
    // 검색창 클릭 시 전체보기로 전환
    if (selectedCardIndex !== null) {
      selectCard(null); // 전체보기로 전환
    }
    startAnim();
    return;
  }

  // 아크 캐러셀 모드에서 아크 영역 드래그
  if (ARC_MODE && isInArcArea(mouseX, mouseY)) {
    arcDragging = true;
    arcDragStartX = mouseX; // 드래그 시작점 저장
    arcDragStartIndex = arcCurrentIndex; // 드래그 시작 시점의 인덱스 저장
    arcVel = 0;
    startAnim();
    return; // 월드 패닝 방지
  }

  startAnim(); // 애니메이션 시작
  isDragging = true;
  dragStartX = mouseX;
  dragStartY = mouseY;
  dragOffsetX = offsetX;
  dragOffsetY = offsetY;
  panVelocityX = 0;
  panVelocityY = 0;
  // 드래그 시작 시 스냅 타겟 취소 및 스냅 완료 플래그 리셋
  snapTargetX = null;
  snapTargetY = null;
  snapCompleted = false;
}

function mouseDragged() {
  lastPointerStamp = millis();
  if (ARC_MODE && arcDragging) {
    // 전체 드래그 거리 계산
    const totalDragDistance = mouseX - arcDragStartX;
    // 아크 형태는 고정, 버블 인덱스만 변경 (시각적 피드백)
    const step = ARC_SPREAD_RAD / Math.max(1, ARC_VISIBLE_COUNT - 1);
    const src =
      selectedCardIndex !== null && currentFilteredBubbles.length > 0
        ? currentFilteredBubbles
        : bubbles;
    if (src.length > 0) {
      // 드래그 거리에 따라 실시간으로 arcTargetIndex 업데이트
      const dragAngle = totalDragDistance * ARC_DRAG_SENSE;
      const indexChange = dragAngle / step;
      // 드래그 시작 시점의 arcDragStartIndex를 기준으로 계산
      // 왼쪽으로 드래그하면 인덱스 증가 (왼쪽 버블이 사라지고 오른쪽에 새 버블)
      // 오른쪽으로 드래그하면 인덱스 감소
      const newTargetIndex = arcDragStartIndex - indexChange;
      arcTargetIndex = positiveMod(newTargetIndex, src.length);
      // 드래그 중에는 즉시 반응하도록 arcCurrentIndex도 업데이트
      arcCurrentIndex = newTargetIndex;
    }
    arcVel = (mouseX - pmouseX) * ARC_DRAG_SENSE;
    startAnim();
    return;
  }

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
  lastPointerStamp = millis();
  if (ARC_MODE && arcDragging) {
    arcDragging = false;

    // 드래그 종료 시 버블 인덱스만 변경 (아크 형태는 고정)
    const src =
      selectedCardIndex !== null && currentFilteredBubbles.length > 0
        ? currentFilteredBubbles
        : bubbles;
    if (src.length > 0) {
      const step = ARC_SPREAD_RAD / Math.max(1, ARC_VISIBLE_COUNT - 1);
      // 전체 드래그 거리에 따라 버블 인덱스 변경
      const totalDragDistance = mouseX - arcDragStartX;
      const dragAngle = totalDragDistance * ARC_DRAG_SENSE;
      const indexChange = dragAngle / step;
      // 왼쪽으로 드래그하면 인덱스 증가 (왼쪽 버블이 사라지고 오른쪽에 새 버블)
      // 오른쪽으로 드래그하면 인덱스 감소
      // 드래그 시작 시점의 인덱스를 기준으로 계산
      const newTargetIndex = arcDragStartIndex - indexChange;
      arcTargetIndex = positiveMod(Math.round(newTargetIndex), src.length);
      // arcCurrentIndex는 draw에서 부드럽게 목표로 이동
    }

    arcVel = 0; // 관성 초기화
    return;
  }

  if (!isDragging) return;
  isDragging = false;

  // input 다시 활성화
  if (searchInput) {
    searchInput.style("pointer-events", "auto");
  }

  // 드래그가 끝난 직후 바로 중앙 버블로 스냅
  // 관성이 시작되기 전에 스냅하여 버블이 흐르지 않도록 함
  snapToCenterBubble();

  // 관성은 draw()에서 처리됨
}

// ---------- TOUCH EVENTS (모바일 지원) ----------
function touchStarted() {
  lastPointerStamp = millis();
  if (ARC_MODE && touches.length > 0) {
    const t = touches[0];
    if (isInArcArea(t.x, t.y)) {
      arcDragging = true;
      arcDragStartX = t.x; // 드래그 시작점 저장
      arcDragStartIndex = arcCurrentIndex; // 드래그 시작 시점의 인덱스 저장
      arcVel = 0;
      startAnim();
      return false;
    }
  }

  if (touches.length > 0) {
    const touch = touches[0];

    // 네비게이션 바 클릭 확인
    if (navigationBar && checkNavBarClick(touch.x, touch.y)) {
      showModal = true;
      showToggles = false; // 모달 열릴 때 토글 닫기
      startAnim(); // 모달 애니메이션을 위해 애니메이션 시작
      return false;
    }

    // 모달이 열려있으면 닫기
    if (showModal) {
      showModal = false;
      return false;
    }

    // 카드 클릭 확인 (검색창과 네비게이션 바 클릭보다 먼저 확인)
    const clickedCardIndex = checkCardClick(touch.x, touch.y);
    if (clickedCardIndex !== null) {
      selectCard(clickedCardIndex);
      startAnim();
      return false;
    }

    // 토글이 열려있으면 토글 클릭 확인 (더 이상 사용하지 않음)
    // if (showToggles) {
    //   const clickedToggle = checkToggleClick(touch.x, touch.y);
    //   if (clickedToggle !== null) {
    //     // 토글 클릭 시 바로 적용
    //     toggleSelect(clickedToggle);
    //     return false;
    //   }
    //   // 토글 외부 클릭 시 닫기
    //   if (!checkSearchBarClick(touch.x, touch.y)) {
    //     showToggles = false;
    //   }
    // }

    // 검색창 클릭 확인
    if (checkSearchBarClick(touch.x, touch.y)) {
      // 검색창 클릭 시 전체보기로 전환
      if (selectedCardIndex !== null) {
        selectCard(null); // 전체보기로 전환
      }
      startAnim();
      return false;
    }

    startAnim(); // 애니메이션 시작
    isDragging = true;
    dragStartX = touch.x;
    dragStartY = touch.y;
    dragOffsetX = offsetX;
    dragOffsetY = offsetY;
    panVelocityX = 0;
    panVelocityY = 0;
    // 드래그 시작 시 스냅 타겟 취소 및 스냅 완료 플래그 리셋
    snapTargetX = null;
    snapTargetY = null;
    snapCompleted = false;
    return false; // 기본 동작 방지
  }
  return false;
}

function touchMoved() {
  lastPointerStamp = millis();
  if (ARC_MODE && arcDragging && touches.length > 0) {
    const t = touches[0];
    // 전체 드래그 거리 계산
    const totalDragDistance = t.x - arcDragStartX;
    // 아크 형태는 고정, 버블 인덱스만 변경 (시각적 피드백)
    const step = ARC_SPREAD_RAD / Math.max(1, ARC_VISIBLE_COUNT - 1);
    const src =
      selectedCardIndex !== null && currentFilteredBubbles.length > 0
        ? currentFilteredBubbles
        : bubbles;
    if (src.length > 0) {
      // 드래그 거리에 따라 실시간으로 arcTargetIndex 업데이트
      const dragAngle = totalDragDistance * ARC_DRAG_SENSE;
      const indexChange = dragAngle / step;
      // 드래그 시작 시점의 arcDragStartIndex를 기준으로 계산
      // 왼쪽으로 드래그하면 인덱스 증가 (왼쪽 버블이 사라지고 오른쪽에 새 버블)
      // 오른쪽으로 드래그하면 인덱스 감소
      const newTargetIndex = arcDragStartIndex - indexChange;
      arcTargetIndex = positiveMod(newTargetIndex, src.length);
      // 드래그 중에는 즉시 반응하도록 arcCurrentIndex도 업데이트
      arcCurrentIndex = newTargetIndex;
    }
    arcVel = (t.x - (touches.length > 1 ? touches[1].x : t.x)) * ARC_DRAG_SENSE;
    startAnim();
    return false;
  }

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
  lastPointerStamp = millis();
  if (ARC_MODE && arcDragging) {
    arcDragging = false;

    // 드래그 종료 시 버블 인덱스만 변경 (아크 형태는 고정)
    const src =
      selectedCardIndex !== null && currentFilteredBubbles.length > 0
        ? currentFilteredBubbles
        : bubbles;
    if (src.length > 0) {
      // 드래그 중 실시간 반영해온 arcCurrentIndex를 기준으로 스냅
      arcTargetIndex = positiveMod(Math.round(arcCurrentIndex), src.length);
    }

    arcVel = 0; // 관성 초기화
    return false;
  }

  if (!isDragging) return false;
  isDragging = false;

  // 드래그가 끝난 직후 바로 중앙 버블로 스냅
  // 관성이 시작되기 전에 스냅하여 버블이 흐르지 않도록 함
  snapToCenterBubble();

  return false; // 기본 동작 방지
}

// ---------- UI helpers ----------
function drawNavBar() {
  if (!captureButton || !workroomButton || !navigationBar) return;

  // 반응형 스케일 계산 (헬퍼 함수 사용)
  const responsiveScale = getResponsiveScale();

  // 버튼 크기 (반응형 스케일 적용) - 20% 증가
  const BUTTON_W = captureButton.width * 0.8 * responsiveScale;
  const BUTTON_H = captureButton.height * 0.8 * responsiveScale;

  // 네비게이션 바 크기 (반응형 스케일 적용) - 20% 증가
  const NAV_W = navigationBar.width * 0.65 * responsiveScale;
  const NAV_H = navigationBar.height * 0.65 * responsiveScale;

  // 상단 위치
  const Y = 20;

  // 캡쳐 버튼 - 왼쪽 끝
  imageMode(CORNER);
  image(captureButton, 0, Y, BUTTON_W, BUTTON_H);

  // 워크룸 버튼 - 오른쪽 끝
  image(workroomButton, width - BUTTON_W, Y, BUTTON_W, BUTTON_H);

  // 네비게이션 바 - 중앙에 배치 (두 버튼 사이)
  // 화질 개선: 고해상도 버퍼 사용 (setup에서 미리 생성)
  const navBarX = (width - NAV_W) / 2;
  push();
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  imageMode(CORNER);
  if (navBarBuffer) {
    // 고해상도 버퍼를 원래 크기로 축소하여 그리기
    image(navBarBuffer, navBarX, Y, NAV_W, NAV_H);
  } else {
    // 버퍼가 없으면 일반 렌더링 (폴백)
    image(navigationBar, navBarX, Y, NAV_W, NAV_H);
  }
  pop();
}

// 네비게이션 바 클릭 확인
function checkNavBarClick(x, y) {
  if (!navigationBar) return false;

  // 반응형 스케일 계산 (헬퍼 함수 사용)
  const responsiveScale = getResponsiveScale();

  const BUTTON_W = captureButton
    ? captureButton.width * 0.8 * responsiveScale
    : 0;
  const NAV_W = navigationBar.width * 0.65 * responsiveScale;
  const NAV_H = navigationBar.height * 0.65 * responsiveScale;
  const Y = 20;
  const navBarX = (width - NAV_W) / 2;

  // 네비게이션 바 영역 확인
  return x >= navBarX && x <= navBarX + NAV_W && y >= Y && y <= Y + NAV_H;
}

// 글래스모피즘 스타일 모달 그리기
function drawModal() {
  push();
  drawingContext.save();

  // 배경 오버레이 (어둡게)
  fill(0, 0, 0, 180);
  noStroke();
  rect(0, 0, width, height);

  // 모달 크기
  const modalWidth = 420;
  const modalHeight = 180;
  const modalX = (width - modalWidth) / 2;
  const modalY = (height - modalHeight) / 2;
  const radius = 32;

  // 모달 배경 (글래스모피즘)
  // 배경 그라데이션
  const gradient = drawingContext.createLinearGradient(
    modalX,
    modalY,
    modalX,
    modalY + modalHeight
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.1)");
  drawingContext.fillStyle = gradient;

  // 그림자 효과
  drawingContext.shadowBlur = 30;
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.5)";
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 8;

  // 둥근 사각형
  drawingContext.beginPath();
  drawingContext.moveTo(modalX + radius, modalY);
  drawingContext.lineTo(modalX + modalWidth - radius, modalY);
  drawingContext.quadraticCurveTo(
    modalX + modalWidth,
    modalY,
    modalX + modalWidth,
    modalY + radius
  );
  drawingContext.lineTo(modalX + modalWidth, modalY + modalHeight - radius);
  drawingContext.quadraticCurveTo(
    modalX + modalWidth,
    modalY + modalHeight,
    modalX + modalWidth - radius,
    modalY + modalHeight
  );
  drawingContext.lineTo(modalX + radius, modalY + modalHeight);
  drawingContext.quadraticCurveTo(
    modalX,
    modalY + modalHeight,
    modalX,
    modalY + modalHeight - radius
  );
  drawingContext.lineTo(modalX, modalY + radius);
  drawingContext.quadraticCurveTo(modalX, modalY, modalX + radius, modalY);
  drawingContext.closePath();
  drawingContext.fill();

  // 테두리 효과 (글래스모피즘)
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  drawingContext.strokeStyle = "rgba(255, 255, 255, 0.4)";
  drawingContext.lineWidth = 1.5;
  drawingContext.stroke();

  // 내부 하이라이트 (글래스모피즘 효과 - 상단)
  const highlightGradient = drawingContext.createLinearGradient(
    modalX,
    modalY,
    modalX,
    modalY + radius * 1.5
  );
  highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
  highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  drawingContext.fillStyle = highlightGradient;
  drawingContext.beginPath();
  drawingContext.moveTo(modalX + radius, modalY);
  drawingContext.lineTo(modalX + modalWidth - radius, modalY);
  drawingContext.quadraticCurveTo(
    modalX + modalWidth,
    modalY,
    modalX + modalWidth,
    modalY + radius
  );
  drawingContext.lineTo(modalX + modalWidth, modalY + radius * 1.5);
  drawingContext.lineTo(modalX, modalY + radius * 1.5);
  drawingContext.lineTo(modalX, modalY + radius);
  drawingContext.quadraticCurveTo(modalX, modalY, modalX + radius, modalY);
  drawingContext.closePath();
  drawingContext.fill();

  drawingContext.restore();

  // 텍스트 그리기
  push();
  noStroke();
  textAlign(CENTER, CENTER);

  // Pretendard 폰트 적용
  if (pretendardFont) {
    textFont(pretendardFont);
  }

  // 메시지 텍스트
  fill(255, 255, 255, 255);
  textSize(18);
  textStyle(NORMAL);
  text("현재 갤러리만 체험 가능합니다.", width / 2, height / 2);

  pop();
  pop();
}

// 시각적 언어 카드 그리기 함수
function drawVisualLanguageCards() {
  if (!visualLanguageCards || visualLanguageCards.length === 0) return;

  const responsiveScale = getResponsiveScale();
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const CARD_AREA_TOP = SEARCH_BOTTOM + 20; // 검색창 아래 20px
  // 태블릿에서 카드를 30픽셀 더 아래로 내림 (20 + 10)
  const tabletOffset = responsiveScale < 1 ? 30 : 0; // 태블릿(작은 화면)일 때만 오프셋 적용
  const CARD_Y = CARD_AREA_TOP + 20 + tabletOffset; // 카드 Y 위치
  const CARD_HEIGHT = 180 * responsiveScale; // 카드 높이
  const CARD_WIDTH = 200 * responsiveScale; // 카드 너비
  const CARD_GAP = 20 * responsiveScale; // 카드 간 간격
  const TOTAL_CARDS_WIDTH =
    visualLanguageCards.length * CARD_WIDTH +
    (visualLanguageCards.length - 1) * CARD_GAP;
  const CARD_START_X = (width - TOTAL_CARDS_WIDTH) / 2; // 카드 시작 X 위치

  push();
  drawingContext.save();

  for (let i = 0; i < visualLanguageCards.length; i++) {
    const card = visualLanguageCards[i];
    const cardX = CARD_START_X + i * (CARD_WIDTH + CARD_GAP);
    const isSelected = selectedCardIndex === i;

    // 카드 배경 (글래스모피즘)
    const gradient = drawingContext.createLinearGradient(
      cardX,
      CARD_Y,
      cardX,
      CARD_Y + CARD_HEIGHT
    );
    if (isSelected) {
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.15)");
    } else {
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.08)");
    }
    drawingContext.fillStyle = gradient;

    // 그림자 효과
    drawingContext.shadowBlur = isSelected ? 20 : 10;
    drawingContext.shadowColor = isSelected
      ? "rgba(255, 255, 255, 0.3)"
      : "rgba(0, 0, 0, 0.2)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = isSelected ? 4 : 2;

    // 둥근 사각형
    const radius = 16 * responsiveScale;
    drawingContext.beginPath();
    drawingContext.moveTo(cardX + radius, CARD_Y);
    drawingContext.lineTo(cardX + CARD_WIDTH - radius, CARD_Y);
    drawingContext.quadraticCurveTo(
      cardX + CARD_WIDTH,
      CARD_Y,
      cardX + CARD_WIDTH,
      CARD_Y + radius
    );
    drawingContext.lineTo(cardX + CARD_WIDTH, CARD_Y + CARD_HEIGHT - radius);
    drawingContext.quadraticCurveTo(
      cardX + CARD_WIDTH,
      CARD_Y + CARD_HEIGHT,
      cardX + CARD_WIDTH - radius,
      CARD_Y + CARD_HEIGHT
    );
    drawingContext.lineTo(cardX + radius, CARD_Y + CARD_HEIGHT);
    drawingContext.quadraticCurveTo(
      cardX,
      CARD_Y + CARD_HEIGHT,
      cardX,
      CARD_Y + CARD_HEIGHT - radius
    );
    drawingContext.lineTo(cardX, CARD_Y + radius);
    drawingContext.quadraticCurveTo(cardX, CARD_Y, cardX + radius, CARD_Y);
    drawingContext.closePath();
    drawingContext.fill();

    // 테두리
    drawingContext.shadowBlur = 0;
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 0;
    drawingContext.strokeStyle = isSelected
      ? "rgba(255, 255, 255, 0.5)"
      : "rgba(255, 255, 255, 0.3)";
    drawingContext.lineWidth = isSelected ? 2 : 1;
    drawingContext.stroke();

    // 카드 이미지 그리기 (배경 위, 텍스트 아래)
    if (card.image && card.image.width > 0) {
      const IMAGE_PADDING = 8 * responsiveScale;
      const IMAGE_Y = CARD_Y + IMAGE_PADDING;
      const IMAGE_HEIGHT = CARD_HEIGHT * 0.5; // 카드 높이의 50%
      const IMAGE_WIDTH = CARD_WIDTH - IMAGE_PADDING * 2;
      const IMAGE_X = cardX + IMAGE_PADDING;

      // 이미지를 둥근 사각형으로 클리핑
      drawingContext.save();
      drawingContext.beginPath();
      const imageRadius = 8 * responsiveScale;
      drawingContext.moveTo(IMAGE_X + imageRadius, IMAGE_Y);
      drawingContext.lineTo(IMAGE_X + IMAGE_WIDTH - imageRadius, IMAGE_Y);
      drawingContext.quadraticCurveTo(
        IMAGE_X + IMAGE_WIDTH,
        IMAGE_Y,
        IMAGE_X + IMAGE_WIDTH,
        IMAGE_Y + imageRadius
      );
      drawingContext.lineTo(
        IMAGE_X + IMAGE_WIDTH,
        IMAGE_Y + IMAGE_HEIGHT - imageRadius
      );
      drawingContext.quadraticCurveTo(
        IMAGE_X + IMAGE_WIDTH,
        IMAGE_Y + IMAGE_HEIGHT,
        IMAGE_X + IMAGE_WIDTH - imageRadius,
        IMAGE_Y + IMAGE_HEIGHT
      );
      drawingContext.lineTo(IMAGE_X + imageRadius, IMAGE_Y + IMAGE_HEIGHT);
      drawingContext.quadraticCurveTo(
        IMAGE_X,
        IMAGE_Y + IMAGE_HEIGHT,
        IMAGE_X,
        IMAGE_Y + IMAGE_HEIGHT - imageRadius
      );
      drawingContext.lineTo(IMAGE_X, IMAGE_Y + imageRadius);
      drawingContext.quadraticCurveTo(
        IMAGE_X,
        IMAGE_Y,
        IMAGE_X + imageRadius,
        IMAGE_Y
      );
      drawingContext.closePath();
      drawingContext.clip();

      // 이미지 그리기 (cover 방식으로 채우기)
      const imgRatio = card.image.width / card.image.height;
      const targetRatio = IMAGE_WIDTH / IMAGE_HEIGHT;
      let drawW, drawH, offsetX, offsetY;

      if (imgRatio > targetRatio) {
        // 이미지가 더 넓음 → 높이에 맞춰 확대
        drawH = IMAGE_HEIGHT;
        drawW = imgRatio * drawH;
        offsetX = (IMAGE_WIDTH - drawW) / 2;
        offsetY = 0;
      } else {
        // 이미지가 더 높음 → 너비에 맞춰 확대
        drawW = IMAGE_WIDTH;
        drawH = drawW / imgRatio;
        offsetX = 0;
        offsetY = (IMAGE_HEIGHT - drawH) / 2;
      }

      imageMode(CORNER);
      image(card.image, IMAGE_X + offsetX, IMAGE_Y + offsetY, drawW, drawH);
      drawingContext.restore();
    }

    // 텍스트 그리기
    if (pretendardFont) {
      textFont(pretendardFont);
    }

    // 카드 개수 표시 (좌상단, 이미지 위)
    textAlign(LEFT, TOP);
    fill(255, 255, 255, isSelected ? 255 : 200);
    textSize(14 * responsiveScale);
    textStyle(NORMAL);
    // 배경 박스 추가 (가독성 향상)
    push();
    fill(0, 0, 0, 120);
    noStroke();
    const countText = `${card.count}장`;
    const countTextWidth = textWidth(countText);
    const countPadding = 6 * responsiveScale;
    rect(
      cardX + 12 * responsiveScale - countPadding / 2,
      CARD_Y + 12 * responsiveScale - countPadding / 2,
      countTextWidth + countPadding,
      20 * responsiveScale
    );
    pop();
    text(
      countText,
      cardX + 12 * responsiveScale,
      CARD_Y + 12 * responsiveScale
    );

    // 제목 (이미지 아래, 중앙)
    textAlign(CENTER, CENTER);
    fill(255, 255, 255, isSelected ? 255 : 230);
    textSize(18 * responsiveScale);
    textStyle(BOLD);
    const titleY = CARD_Y + CARD_HEIGHT * 0.5 + 25 * responsiveScale;
    text(card.title, cardX + CARD_WIDTH / 2, titleY);

    // 부제목 (제목 아래)
    fill(255, 255, 255, isSelected ? 200 : 150);
    textSize(12 * responsiveScale);
    textStyle(NORMAL);
    text(card.subtitle, cardX + CARD_WIDTH / 2, titleY + 20 * responsiveScale);
  }

  drawingContext.restore();
  pop();
}

// 카드 클릭 판정 (drawVisualLanguageCards와 동일한 레이아웃 계산 사용)
function checkCardClick(x, y) {
  if (!visualLanguageCards || visualLanguageCards.length === 0) return null;

  const responsiveScale = getResponsiveScale();
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const CARD_AREA_TOP = SEARCH_BOTTOM + 20;
  // 태블릿에서 카드를 30픽셀 더 아래로 내림 (drawVisualLanguageCards와 동일, 20 + 10)
  const tabletOffset = responsiveScale < 1 ? 30 : 0; // 태블릿(작은 화면)일 때만 오프셋 적용
  const CARD_Y = CARD_AREA_TOP + 20 + tabletOffset;
  const CARD_HEIGHT = 180 * responsiveScale;
  const CARD_WIDTH = 200 * responsiveScale;
  const CARD_GAP = 20 * responsiveScale;

  const totalW =
    visualLanguageCards.length * CARD_WIDTH +
    (visualLanguageCards.length - 1) * CARD_GAP;
  const startX = (width - totalW) / 2;

  for (let i = 0; i < visualLanguageCards.length; i++) {
    const cx = startX + i * (CARD_WIDTH + CARD_GAP);
    if (
      x >= cx &&
      x <= cx + CARD_WIDTH &&
      y >= CARD_Y &&
      y <= CARD_Y + CARD_HEIGHT
    ) {
      return i;
    }
  }
  return null;
}

// 현재 필터링된 버블들을 가운데 기준으로 부채꼴(호) 배열
function drawSearchBar() {
  // 반응형 스케일 계산 (간격만 반응형으로 조정)
  const responsiveScale = getResponsiveScale();

  // 검색창 메트릭 (크기는 고정, 간격만 반응형)
  const NAV_Y = 20;
  const NAV_H = navigationBar ? navigationBar.height * 0.45 : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;
  const W = width * SEARCH_WIDTH_RATIO * 1.3; // 크기 고정
  const H = 75 * SEARCH_SCALE * 1.3; // 크기 고정
  const X = (width - W) / 2;
  // 태블릿에서는 간격을 줄이기 위해 반응형 스케일 적용 (화면이 작을수록 간격 작아짐)
  // 기본적으로 10픽셀 위로 올림
  // 태블릿에서 간격을 더 줄이기 위해 스케일을 더 작게 적용
  const gapScale = Math.min(1, responsiveScale * 0.3); // 태블릿에서 간격을 30%로 줄임
  const gap = SEARCH_NAV_GAP * gapScale;
  // 태블릿에서 버튼을 20픽셀 더 올림
  const tabletButtonOffset = responsiveScale < 1 ? -20 : 0;
  const Y = NAV_BOTTOM + gap - 10 + tabletButtonOffset;

  // interested 이미지만 표시 (배경 컴포넌트 제거)
  if (interestedImage && interestedImage.width > 0) {
    imageMode(CORNER);
    // 이미지 비율 유지하면서 검색창 영역에 맞춤
    const imgRatio = interestedImage.width / interestedImage.height;
    const targetRatio = W / H;

    let drawW, drawH, drawX, drawY;
    if (imgRatio > targetRatio) {
      // 이미지가 더 넓음 → 높이에 맞춤
      drawH = H * 0.6;
      drawW = imgRatio * drawH;
      drawX = X + (W - drawW) / 2; // 중앙 정렬
      drawY = Y + (H - drawH) / 2; // 중앙 정렬
    } else {
      // 이미지가 더 높음 → 너비에 맞춤
      drawW = W * 0.6;
      drawH = drawW / imgRatio;
      drawX = X + (W - drawW) / 2; // 중앙 정렬
      drawY = Y + (H - drawH) / 2; // 중앙 정렬
    }

    image(interestedImage, drawX, drawY, drawW, drawH);
  }
}

// 검색창 클릭 확인
function checkSearchBarClick(x, y) {
  const { W, H, X, Y } = getSearchMetrics();

  return x >= X && x <= X + W && y >= Y && y <= Y + H;
}

// 토글 클릭 확인
function checkToggleClick(x, y) {
  if (!showToggles) return null;

  const toggleLabels = [
    "전체 보기",
    "여행자의 취향 탐색",
    "20대 여성의 취향 탐색",
    "50대 남성의 취향 탐색",
    "주부들의 취향 탐색",
    "10대 여성의 취향 탐색",
  ];

  const toggleWidth = 300;
  const toggleHeight = 50;
  const toggleX = (width - toggleWidth) / 2;
  const startY = 220;
  const spacing = 60;

  // 토글 클릭 확인
  for (let i = 0; i < toggleLabels.length; i++) {
    const toggleY = startY + i * spacing;
    if (
      x >= toggleX &&
      x <= toggleX + toggleWidth &&
      y >= toggleY &&
      y <= toggleY + toggleHeight
    ) {
      return i; // 0~5 반환 (0은 전체 보기)
    }
  }

  return null;
}

// 카드 선택 함수
function selectCard(indexOrNull) {
  // 이전 선택 저장
  previousSelectedCardIndex = selectedCardIndex;

  // 같은 카드를 다시 클릭하면 전체보기로 전환
  if (selectedCardIndex === indexOrNull) {
    selectedCardIndex = null;
  } else {
    selectedCardIndex = indexOrNull;
  }

  // 카드 선택 시에만 아크 모드 켜기
  ARC_MODE = indexOrNull !== null;

  // 아크 캐러셀 초기화
  if (ARC_MODE) {
    // 즉시 중앙 고정을 위해 현재 인덱스와 목표 인덱스를 0으로 설정
    arcTargetIndex = 0;
    arcCurrentIndex = 0;
    arcScroll = 0;
    arcVel = 0;
  }

  // 스냅 상태 초기화
  snapTargetX = null;
  snapTargetY = null;
  snapCompleted = false;

  // 필터링된 버블 찾기
  let filteredBubbles = bubbles;
  if (selectedCardIndex !== null && visualLanguageCards[selectedCardIndex]) {
    const selectedCard = visualLanguageCards[selectedCardIndex];
    filteredBubbles = bubbles.filter((b) => {
      return (
        b.visualLanguageAttributes &&
        b.visualLanguageAttributes.includes(selectedCard.id)
      );
    });
  }

  // 이전 카테고리와 새 카테고리 모두에 포함되는 버블 찾기 (유지되는 버블)
  let previousFilteredBubbles = [];
  if (
    previousSelectedCardIndex !== null &&
    visualLanguageCards[previousSelectedCardIndex]
  ) {
    const previousCard = visualLanguageCards[previousSelectedCardIndex];
    previousFilteredBubbles = bubbles.filter((b) => {
      return (
        b.visualLanguageAttributes &&
        b.visualLanguageAttributes.includes(previousCard.id)
      );
    });
  }

  // 공통 버블 (이전과 새 카테고리 모두에 포함되는 버블)
  const commonBubbles = filteredBubbles.filter((b) =>
    previousFilteredBubbles.includes(b)
  );

  // 필터링되지 않은 버블들 팡 터지기 시작 (단, 공통 버블은 제외)
  bubbles.forEach((b) => {
    const isFiltered = filteredBubbles.includes(b);
    const isCommon = commonBubbles.includes(b);
    // 필터링되지 않았고, 공통 버블이 아니면 팡 터지기
    if (!isFiltered && !isCommon && !b.isPopping) {
      b.isPopping = true;
      b.popStartTime = millis();
      b.popProgress = 0;
    }
  });

  // 필터링된 버블 복구 (alpha 및 팡 터짐 상태 초기화)
  filteredBubbles.forEach((b) => {
    if (!commonBubbles.includes(b)) {
      // 공통 버블이 아닌 새로 나타나는 버블만 복구
      b.isPopping = false;
      b.popProgress = 0;
      b.alpha = 1.0; // 바로 보이도록 설정
    } else {
      // 공통 버블은 팡 터지는 상태만 해제
      if (b.isPopping) {
        b.isPopping = false;
        b.popProgress = 0;
      }
      b.alpha = 1.0; // alpha는 유지
    }
  });

  currentFilteredBubbles = filteredBubbles;

  // 아크 모드에서는 drawArcCarousel()에서 버블 위치를 직접 설정하므로 정렬 불필요
  if (!ARC_MODE) {
    // 전체보기로 전환 시 원래 그리드 위치로 복원
    const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
    bubbles.forEach((b, index) => {
      if (b.isPopping || b.alpha < 0.5) {
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0;
      }
      // 원래 그리드 위치로 복원
      b.gridX = index % gridSize;
      b.gridY = Math.floor(index / gridSize);
    });
    currentFilteredBubbles = bubbles;

    // 원래 그리드의 중심으로 정렬
    const centerGridX = Math.floor(gridSize / 2);
    const centerGridY = Math.floor(gridSize / 2);
    const centerHexX = centerGridX * HEX_SPACING * 1.5;
    const centerHexY =
      centerGridY * HEX_SPACING * sqrt(3) +
      ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
    const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
    const BUBBLE_AREA_BOTTOM = height - 10;
    const BUBBLE_AREA_CENTER =
      BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;
    const centerX = width * CENTER_X_RATIO;
    const centerY = BUBBLE_AREA_CENTER - 20;

    snapTargetX = centerX - centerHexX;
    snapTargetY = centerY - centerHexY;
    snapCompleted = false;
  }

  // 버블 정렬 (버블이 이동하면서 정렬되도록)
  startAnim(); // 필터링 업데이트를 위해 애니메이션 시작
}

// 토글 선택/해제 (더 이상 사용하지 않음)
function toggleSelect(toggleIndex) {
  // toggleIndex: 0 = 전체 보기, 1~5 = 각 카테고리
  if (toggleIndex === 0) {
    // 전체 보기 선택
    previousSelectedToggles = [...selectedToggles]; // 이전 선택 저장
    selectedToggles = [];
    // 모든 버블 복구 및 원래 그리드 위치로 복원
    const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
    bubbles.forEach((b, index) => {
      if (b.isPopping || b.alpha < 0.5) {
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0;
      }
      // 원래 그리드 위치로 복원
      b.gridX = index % gridSize;
      b.gridY = Math.floor(index / gridSize);
    });
    currentFilteredBubbles = bubbles;

    // 원래 그리드의 중심으로 정렬
    const centerGridX = Math.floor(gridSize / 2);
    const centerGridY = Math.floor(gridSize / 2);
    const centerHexX = centerGridX * HEX_SPACING * 1.5;
    const centerHexY =
      centerGridY * HEX_SPACING * sqrt(3) +
      ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
    const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
    const BUBBLE_AREA_BOTTOM = height - 10;
    const BUBBLE_AREA_CENTER =
      BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;
    const centerX = width * CENTER_X_RATIO;
    const centerY = BUBBLE_AREA_CENTER - 20;

    snapTargetX = centerX - centerHexX;
    snapTargetY = centerY - centerHexY;
    snapCompleted = false;
  } else {
    // 카테고리 선택 (1~5를 1~5로 매핑)
    const categoryIndex = toggleIndex; // 1~5

    // 이전 선택된 토글 저장 (카테고리 변경 비교용)
    previousSelectedToggles = [...selectedToggles];

    selectedToggles = [categoryIndex];

    // 필터링된 버블 찾기 및 복구
    const filteredBubbles = bubbles.filter((b) => {
      return (
        b.attributes &&
        b.attributes.some((attr) => selectedToggles.includes(attr))
      );
    });

    // 이전 카테고리와 새 카테고리 모두에 포함되는 버블 찾기 (유지되는 버블)
    let previousFilteredBubbles = [];
    if (previousSelectedToggles.length > 0) {
      previousFilteredBubbles = bubbles.filter((b) => {
        return (
          b.attributes &&
          b.attributes.some((attr) => previousSelectedToggles.includes(attr))
        );
      });
    }

    // 공통 버블 (이전과 새 카테고리 모두에 포함되는 버블)
    const commonBubbles = filteredBubbles.filter((b) =>
      previousFilteredBubbles.includes(b)
    );

    // 필터링된 버블 복구 (alpha 및 팡 터짐 상태 초기화)
    // 단, 공통 버블은 이미 보이는 상태이므로 alpha만 확인
    filteredBubbles.forEach((b) => {
      if (!commonBubbles.includes(b)) {
        // 공통 버블이 아닌 새로 나타나는 버블만 복구
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0; // 바로 보이도록 설정
      } else {
        // 공통 버블은 팡 터지는 상태만 해제
        if (b.isPopping) {
          b.isPopping = false;
          b.popProgress = 0;
        }
        b.alpha = 1.0; // alpha는 유지
      }
    });

    currentFilteredBubbles = filteredBubbles;
  }

  // 토글 닫기
  showToggles = false;

  // 버블 정렬 (버블이 이동하면서 정렬되도록)
  startAnim(); // 필터링 업데이트를 위해 애니메이션 시작
}

// 토글 UI 그리기
function drawToggles() {
  const toggleLabels = [
    "전체 보기",
    "여행자의 취향 탐색",
    "20대 여성의 취향 탐색",
    "50대 남성의 취향 탐색",
    "주부들의 취향 탐색",
    "10대 여성의 취향 탐색",
  ];

  const toggleWidth = 300;
  const toggleHeight = 50;
  const toggleX = (width - toggleWidth) / 2;
  const startY = 220;
  const spacing = 60;
  const radius = 16;

  push();
  drawingContext.save();

  // 배경 오버레이 (약간 어둡게)
  fill(0, 0, 0, 100);
  noStroke();
  rect(0, 0, width, height);

  for (let i = 0; i < toggleLabels.length; i++) {
    const toggleY = startY + i * spacing;
    // 전체 보기(0)는 selectedToggles가 비어있을 때 선택됨
    // 카테고리(1~5)는 selectedToggles에 포함되어 있을 때 선택됨
    const isSelected =
      i === 0 ? selectedToggles.length === 0 : selectedToggles.includes(i);

    // 토글 배경
    const gradient = drawingContext.createLinearGradient(
      toggleX,
      toggleY,
      toggleX,
      toggleY + toggleHeight
    );

    if (isSelected) {
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.2)");
    } else {
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.1)");
    }

    drawingContext.fillStyle = gradient;
    drawingContext.strokeStyle = isSelected
      ? "rgba(255, 255, 255, 0.5)"
      : "rgba(255, 255, 255, 0.3)";
    drawingContext.lineWidth = isSelected ? 2 : 1;

    // 둥근 사각형
    drawingContext.beginPath();
    drawingContext.moveTo(toggleX + radius, toggleY);
    drawingContext.lineTo(toggleX + toggleWidth - radius, toggleY);
    drawingContext.quadraticCurveTo(
      toggleX + toggleWidth,
      toggleY,
      toggleX + toggleWidth,
      toggleY + radius
    );
    drawingContext.lineTo(
      toggleX + toggleWidth,
      toggleY + toggleHeight - radius
    );
    drawingContext.quadraticCurveTo(
      toggleX + toggleWidth,
      toggleY + toggleHeight,
      toggleX + toggleWidth - radius,
      toggleY + toggleHeight
    );
    drawingContext.lineTo(toggleX + radius, toggleY + toggleHeight);
    drawingContext.quadraticCurveTo(
      toggleX,
      toggleY + toggleHeight,
      toggleX,
      toggleY + toggleHeight - radius
    );
    drawingContext.lineTo(toggleX, toggleY + radius);
    drawingContext.quadraticCurveTo(
      toggleX,
      toggleY,
      toggleX + radius,
      toggleY
    );
    drawingContext.closePath();
    drawingContext.fill();
    drawingContext.stroke();

    // 텍스트
    push();
    noStroke();
    textAlign(CENTER, CENTER);

    if (pretendardFont) {
      textFont(pretendardFont);
    }

    fill(255, 255, 255, isSelected ? 255 : 200);
    textSize(16);
    textStyle(NORMAL);
    text(
      toggleLabels[i],
      toggleX + toggleWidth / 2,
      toggleY + toggleHeight / 2
    );
    pop();
  }

  drawingContext.restore();
  pop();
}

function vignette() {
  push();
  drawingContext.save();
  const g = drawingContext.createRadialGradient(
    width * 0.5,
    height * 0.55,
    Math.min(width, height) * 0.25,
    width * 0.5,
    height * 0.55,
    Math.max(width, height) * 0.7
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  drawingContext.fillStyle = g;
  drawingContext.fillRect(0, 0, width, height);
  drawingContext.restore();
  pop();
}

// 캔버스용 라운드 사각형 path 유틸
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// =======================
// ARC CAROUSEL FUNCTIONS
// =======================

function positiveMod(n, m) {
  return ((n % m) + m) % m;
}

function getArcMetrics() {
  const responsiveScale = getResponsiveScale();
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();

  const arcCenterX = width * 0.5;
  // 더 큰 원의 일부처럼 보이도록 반지름을 크게 증가
  const arcRadius = Math.min(width, height) * 0.65 * responsiveScale; // 0.28 → 0.8로 증가 (훨씬 큰 원)
  // 원의 윗부분만 보이도록 중심을 더 아래로 이동 (더 큰 원이므로 더 아래로)
  // 원의 상단이 화면 중앙 근처에 오도록, 하단은 화면 밖으로
  const arcCenterY = height + arcRadius * 0.25; // 중심을 더 아래로 내려서 평평한 아크 만들기
  const arcTopY = arcCenterY - arcRadius; // 아크 상단 y
  const arcBottomY = arcCenterY + arcRadius * 0.1; // 아래쪽(실제 보이는 범위)
  return { arcCenterX, arcCenterY, arcRadius, arcTopY, arcBottomY };
}

// y가 아래로 갈수록(값 커질수록) 작아지게
function radiusByY(y, arcTopY, arcBottomY) {
  const t = constrain((y - arcTopY) / Math.max(1, arcBottomY - arcTopY), 0, 1);
  // 위쪽(t=0) → ARC_MAX_R, 아래쪽(t=1) → ARC_MIN_R
  return lerp(ARC_MAX_R, ARC_MIN_R, t);
}

// 아크 영역 클릭 확인
// 화면 아래쪽 반 정도를 모두 아크 터치 영역으로 설정
function isInArcArea(x, y) {
  const top = height * 0.5; // 화면 중앙부터
  const bottom = height; // 화면 하단까지
  return y >= top && y <= bottom;
}

// 아크 캐러셀 렌더링(필터링된 버블 사용)
function drawArcCarousel() {
  const src =
    selectedCardIndex !== null && currentFilteredBubbles.length > 0
      ? currentFilteredBubbles
      : bubbles;
  if (src.length === 0) return;

  const { arcCenterX, arcCenterY, arcRadius, arcTopY, arcBottomY } =
    getArcMetrics();

  // 아크 형태는 고정, 버블이 아크를 따라 이동하는 애니메이션
  // 원의 윗부분만 보이는 형태 유지 (각도 범위: 0도 ~ 180도, 상단 반원)
  const step = ARC_SPREAD_RAD / Math.max(1, ARC_VISIBLE_COUNT - 1);

  // 목표 인덱스로 부드럽게 이동 (애니메이션)
  if (!arcDragging) {
    const indexDiff = arcTargetIndex - arcCurrentIndex;
    // 인덱스 차이를 최단 경로로 정규화
    let normalizedDiff = indexDiff;
    if (normalizedDiff > src.length / 2) normalizedDiff -= src.length;
    if (normalizedDiff < -src.length / 2) normalizedDiff += src.length;

    // 초기화 직후 또는 목표가 0일 때는 즉시 중앙 고정
    if (arcTargetIndex === 0 && Math.abs(arcCurrentIndex) < 0.01) {
      arcCurrentIndex = 0;
    } else if (Math.abs(normalizedDiff) > 0.01) {
      arcCurrentIndex = lerp(arcCurrentIndex, arcTargetIndex, 0.2); // 부드러운 이동
      // 인덱스가 목표에 가까워지면 정확히 맞춤
      if (Math.abs(normalizedDiff) < 0.1) {
        arcCurrentIndex = arcTargetIndex;
      }
    } else {
      arcCurrentIndex = arcTargetIndex;
    }
  } else {
    // 드래그 중에는 즉시 반응
    arcCurrentIndex = arcTargetIndex;
  }

  // 각도 오프셋 계산 (버블 이동 애니메이션)
  const indexOffset = arcCurrentIndex - Math.floor(arcCurrentIndex);
  arcScroll = -indexOffset * step;

  // 7개 슬롯 배치 (중앙 기준 -3 ~ +3)
  // 버블의 끝점(edge) 간 거리를 일정하게 유지하도록 각도 계산
  const mid = Math.floor(ARC_VISIBLE_COUNT / 2); // 3
  const angleBase = -Math.PI / 2; // 위 방향(12시 기준 -90도) 중심

  // 반응형 스케일 적용
  const responsiveScale = getResponsiveScale();

  // 먼저 모든 버블의 크기를 계산 (반응형 스케일 적용)
  // 태블릿에서 버블이 너무 작아지지 않도록 최소 스케일 보장
  const bubbleScale = Math.max(0.7, responsiveScale); // 최소 70% 크기 보장
  const bubbleRadii = [];
  for (let i = -mid; i <= mid; i++) {
    const distanceFromCenter = Math.abs(i);
    const maxDistance = mid;
    const normalizedDistance = distanceFromCenter / maxDistance;
    // 4제곱 함수를 사용하여 주인공과 그 다음, 그 다음의 차이를 더 크게
    const sizeRatio = 1 - Math.pow(normalizedDistance, 4) * 0.8; // 4제곱으로 더 가파르게
    // 주인공 버블(i=0)만 ARC_HERO_R 사용, 나머지는 ARC_MAX_R 사용
    const maxR = i === 0 ? ARC_HERO_R : ARC_MAX_R;
    const r = lerp(ARC_MIN_R, maxR, sizeRatio) * bubbleScale;
    bubbleRadii.push({ index: i, r: r });
  }

  // 버블 끝점 간 일정한 간격 설정 (픽셀 단위, 반응형 스케일 적용)
  const EDGE_GAP = 20 * responsiveScale; // 버블 끝점 간 간격 (픽셀)

  // 중앙 버블부터 시작하여 각도를 누적 계산
  const angles = [];
  let currentAngle = angleBase; // 중앙 버블의 각도
  angles.push({ index: 0, angle: currentAngle });

  // 왼쪽으로 이동하면서 각도 계산
  for (let i = 1; i <= mid; i++) {
    const prevR = bubbleRadii[mid - i + 1].r; // 이전 버블 반지름
    const currR = bubbleRadii[mid - i].r; // 현재 버블 반지름
    // 두 버블의 끝점 간 거리 = 중심 간 거리 - 반지름 합
    // 중심 간 거리 = 끝점 간 거리 + 반지름 합
    const centerDistance = EDGE_GAP + prevR + currR;
    // 아크 반지름을 기준으로 각도 차이 계산
    const angleDiff = centerDistance / arcRadius;
    currentAngle -= angleDiff; // 왼쪽으로 이동
    angles.push({ index: -i, angle: currentAngle });
  }

  // 오른쪽으로 이동하면서 각도 계산
  currentAngle = angleBase;
  for (let i = 1; i <= mid; i++) {
    const prevR = bubbleRadii[mid + i - 1].r; // 이전 버블 반지름
    const currR = bubbleRadii[mid + i].r; // 현재 버블 반지름
    const centerDistance = EDGE_GAP + prevR + currR;
    const angleDiff = centerDistance / arcRadius;
    currentAngle += angleDiff; // 오른쪽으로 이동
    angles.push({ index: i, angle: currentAngle });
  }

  // 각도에 arcScroll 오프셋 추가
  angles.forEach((angle) => {
    angle.angle += arcScroll;
  });

  // 깊이(뒤→앞) 오버드로우 줄이기 위해 y가 큰 것부터 그리기
  const drawList = [];
  for (let i = -mid; i <= mid; i++) {
    // 해당 인덱스의 각도 찾기
    const angleData = angles.find((a) => a.index === i);
    const fixedAngle = angleData
      ? angleData.angle
      : angleBase + i * step + arcScroll;
    const x = arcCenterX + Math.cos(fixedAngle) * arcRadius;
    const y = arcCenterY + Math.sin(fixedAngle) * arcRadius;

    // 버블 크기는 이미 계산됨
    const bubbleData = bubbleRadii.find((b) => b.index === i);
    const r = bubbleData ? bubbleData.r : ARC_MIN_R;

    // 버블만 순환: arcCurrentIndex 기준으로 상대 위치 계산
    const baseIndex = Math.floor(arcCurrentIndex);
    const idx = positiveMod(baseIndex + i, src.length);
    drawList.push({ x, y, r, bubble: src[idx], ySort: y, slotIndex: i });
  }

  // y값 큰 것(아래쪽)부터 그리면 위쪽 큰 버블이 겹쳐서 자연스러움
  drawList.sort((a, b) => b.ySort - a.ySort);

  // 중앙 버블(정보 텍스트)은 나중에 따로
  let centerCandidate = null;

  for (const it of drawList) {
    const b = it.bubble;
    // 버블 스프라이트/이미지 그대로 재사용
    b.pos.set(it.x, it.y);
    // 계산된 크기를 바로 적용 (lerp 제거하여 정확한 크기 유지)
    b.r = it.r;
    b.alpha = 1.0;
    b.isPopping = false;
    b.popProgress = 0;

    // 그림
    b.drawAt(b.pos.x, b.pos.y);

    // 중앙 후보(슬롯 인덱스가 0인 것)
    if (it.slotIndex === 0) {
      centerCandidate = it;
    }
  }

  // 중앙 후보에만 캡/빛/텍스트를 추가
  if (centerCandidate) {
    drawCenterBubbleImage(centerCandidate.bubble);
    drawBubbleLightEffect(centerCandidate.bubble);
    drawCenterBubbleCap(centerCandidate.bubble);
    // 아크 캐러셀 모드: 버블 안에 제목과 설명 표시
    drawBubbleInfoInCircle(
      centerCandidate.bubble,
      centerCandidate.x,
      centerCandidate.y,
      centerCandidate.r
    );
  }
}
