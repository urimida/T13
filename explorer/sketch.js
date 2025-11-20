/* =========================================================
   Interactive Bubbles — Apple Watch Style Honeycomb
   요구사항:
   1) 헥사곤 패턴 밀집 배치
   2) 중앙 집중형 크기 변화 (피시아이 렌즈 효과)
   3) 스와이프로 배경 이동 탐색
   ========================================================= */

// ---------- 로깅 설정 ----------
const LOG_ENABLED = false; // 배포 시 false로 설정하여 로깅 비활성화

function log(...args) {
  if (!LOG_ENABLED) return;
  console.log(...args);
}

function logError(...args) {
  if (!LOG_ENABLED) return;
  console.error(...args);
}

function logWarn(...args) {
  if (!LOG_ENABLED) return;
  console.warn(...args);
}

// ---------- 런타임 & 캐시 헬퍼 ----------
const globalScope = typeof window !== "undefined" ? window : globalThis;

if (globalScope.__T13_EXPLORER_RUNTIME__?.destroy) {
  // HMR 또는 SPA 재마운트 시 이전 스케치 완전히 정리
  globalScope.__T13_EXPLORER_RUNTIME__.destroy({ keepCache: true });
}

function createExplorerRuntime() {
  const cleanupTasks = new Map();
  let p5Instance = null;
  let disposed = false;

  return {
    registerCleanup(key, fn) {
      if (!key || typeof fn !== "function") return;
      if (cleanupTasks.has(key)) {
        try {
          cleanupTasks.get(key)();
        } catch (err) {
          logWarn(`[Explorer] 기존 정리 작업 실패(${key}):`, err);
        }
      }
      cleanupTasks.set(key, fn);
    },
    setP5Instance(instance) {
      p5Instance = instance;
    },
    destroy(options = {}) {
      if (disposed) return;
      cleanupTasks.forEach((fn, key) => {
        try {
          fn(options);
        } catch (err) {
          logWarn(`[Explorer] 정리 작업 실패(${key}):`, err);
        }
      });
      cleanupTasks.clear();
      if (p5Instance && typeof p5Instance.remove === "function") {
        try {
          p5Instance.remove();
        } catch (err) {
          logWarn("[Explorer] p5 인스턴스 제거 실패:", err);
        }
      }
      disposed = true;
    },
  };
}

const explorerRuntime = createExplorerRuntime();
globalScope.__T13_EXPLORER_RUNTIME__ = explorerRuntime;
globalScope.__T13_EXPLORER_DISPOSE__ = (options) =>
  explorerRuntime.destroy(options);

const globalImageCache =
  globalScope.__T13_EXPLORER_IMAGE_CACHE__ ||
  (globalScope.__T13_EXPLORER_IMAGE_CACHE__ = new Map());

function getCachedImage(path) {
  return path ? globalImageCache.get(path) || null : null;
}

function cacheImage(path, img) {
  if (!path || !img) return;
  globalImageCache.set(path, img);
}

// 전역 변수들 (리소스)
let mikeIcon; // 마이크 아이콘 이미지
let captureButton; // 캡쳐 버튼 이미지
let workroomButton; // 워크룸 버튼 이미지
let navigationBar; // 네비게이션 바 이미지
let bgImage; // 배경 이미지
let bubbleCap; // 버블 캡 이미지
let navBarBuffer; // 네비게이션 바 고해상도 버퍼
let bubbleImages = []; // 버블 이미지들 (지연 로딩)
let imageLoading = new Set(); // 현재 로딩 중인 이미지 인덱스
let imageLoaded = new Set(); // 로드 완료된 이미지 인덱스
let bubbleData = []; // 버블 제목/태그 데이터
let imageFiles = []; // 이미지 파일명 목록 (전역으로 이동)
let pretendardFont; // Pretendard 폰트
let groupImages = {}; // 집단 이미지들 (1: traveler, 2: 20s, 3: 50s, 4: housewife, 5: 10s)

explorerRuntime.registerCleanup("asset-cache", ({ keepCache } = {}) => {
  if (keepCache) return;
  bubbleImages.length = 0;
  imageFiles.length = 0;
  imageLoading.clear();
  imageLoaded.clear();
});

function loadCachedAsset(path) {
  const cached = getCachedImage(path);
  if (cached && cached.width > 0 && cached.height > 0) {
    return cached;
  }
  return loadImage(path, (img) => cacheImage(path, img));
}

function loadDeferredAssets() {
  const deferredList = [
    { key: "bubbleCap", path: "../public/assets/public-imgs/bubble-cap.png" },
    { key: "group-1", path: "../public/assets/public-imgs/traveler.png", index: 1 },
    { key: "group-2", path: "../public/assets/public-imgs/20s.png", index: 2 },
    { key: "group-3", path: "../public/assets/public-imgs/50s.png", index: 3 },
    { key: "group-4", path: "../public/assets/public-imgs/housewife.png", index: 4 },
    { key: "group-5", path: "../public/assets/public-imgs/10s.png", index: 5 },
  ];

  deferredList.forEach(({ key, path, index }) => {
    const cached = getCachedImage(path);
    if (cached) {
      if (key === "bubbleCap") {
        bubbleCap = cached;
      } else if (index) {
        groupImages[index] = cached;
      }
      return;
    }
    loadImage(
      path,
      (img) => {
        cacheImage(path, img);
        if (key === "bubbleCap") {
          bubbleCap = img;
        } else if (index) {
          groupImages[index] = img;
        }
      },
      (err) => logWarn(`Deferred asset load failed (${key}):`, err)
    );
  });
}

function recreateGraphicsBuffer(buffer, w, h) {
  const needsNewBuffer = !buffer || buffer.width !== w || buffer.height !== h;
  if (needsNewBuffer) {
    if (buffer?.remove) {
      buffer.remove();
    }
    return createGraphics(w, h);
  }
  buffer.clear();
  return buffer;
}

// 중간 단계 버블 드래그 및 길게 누르기 상태
let orbitBubbleDragState = {
  isDragging: false,
  draggedBubble: null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartAngle: 0,
  baseAngle: 0
};

let longPressState = {
  isPressing: false,
  pressedBubble: null,
  pressStartTime: 0,
  pressX: 0,
  pressY: 0
};

// 태그 필터링된 버블 중 선택된 버블 (정보 표시용)
let selectedOrbitBubble = null;
// 버블 정보 표시 alpha (닫힐 때 페이드아웃 애니메이션용)
let orbitInfoAlpha = 1.0;
// 버블 정보 페이드아웃 상태 (같은 버블을 다시 클릭했을 때 토글용)
let isOrbitInfoFadingOut = false;

function resetOrbitBubbleInfo() {
  selectedOrbitBubble = null;
  orbitInfoAlpha = 0.0;
  isOrbitInfoFadingOut = false;
}
// 태그 필터링된 버블의 위치 정보 저장 (클릭 감지용)
let orbitBubblePositions = []; // [{ bubble, x, y, r }]

// 토글 버튼 컴포넌트 배열
let toggleButtons = [];

// 버블 회전 제어 상태 (태그/그룹 뷰에서 사용)
let bubbleRotationState = {
  rotationAngle: 0, // 현재 회전 각도 (기준 각도)
  angularVelocity: 0, // 회전 속도 (관성)
  isDragging: false, // 드래그 중인지 여부
  lastX: 0, // 직전에 마우스가 있던 x
  lastY: 0, // 직전에 마우스가 있던 y
  autoSpeed: 0.01, // 자동으로 돌아가는 기본 속도
  didDrag: false // 이번 입력에서 실제 회전 드래그가 있었는지
};

// ---------- CONFIG ----------
const RENDER_CONFIG = {
  bgColor: "#1a1b1f",
  bubbleGloss: true,
  totalBubbles: 35,
  baseBubbleRadius: 22,
  maxBubbleRadius: 130,
  minBubbleRadiusBase: 30,
  hexSpacing: 75,
  centerXRatio: 0.5,
  centerYRatio: 0.55,
  fisheyeStrength: 2.5,
  centerInfluenceRadius: 200,
  alphaFadeRadius: 400,
  minAlpha: 0.3,
  maxWrapCopies: 6,
};

const INTERACTION_CONFIG = {
  panSensitivity: 0.6,
  snapSpeed: 0.15,
  longPressDuration: 500,
};

const UI_CONFIG = {
  searchScale: 0.7 * 0.7,
  searchWidthRatio: 0.2,
  searchNavGap: 40,
  searchWRatio: 0.56,
};

const PERFORMANCE_CONFIG = {
  imageCheckInterval: 400,
  maxImageQueueLength: 40,
  maxDraw: 140, // 동적으로 조정됨
};

const ANIMATION_CONFIG = {
  enableBreathAnim: true,
  lightEffectInterval: 1,
  enableLightEffect: false,
  enableMicGlow: false,
  enableCenterPulse: true,
  allowIdlePause: true,
};

const FRAME_INTERVAL_MS = 50; // 약 20fps
const RESET_INTERVAL_MS = 3 * 60 * 1000; // 3분
let lastFrameTime = 0;
let lastResetTime = 0;

// 하위 호환성을 위한 별칭 (기존 코드 호환)
const BG_COLOR = RENDER_CONFIG.bgColor;
const BUBBLE_GLOSS = RENDER_CONFIG.bubbleGloss;
const TOTAL_BUBBLES = RENDER_CONFIG.totalBubbles;
const BASE_BUBBLE_RADIUS = RENDER_CONFIG.baseBubbleRadius;
let MAX_BUBBLE_RADIUS = RENDER_CONFIG.maxBubbleRadius;
const MIN_BUBBLE_RADIUS_BASE = RENDER_CONFIG.minBubbleRadiusBase;
let MIN_BUBBLE_RADIUS = RENDER_CONFIG.minBubbleRadiusBase;
const HEX_SPACING = RENDER_CONFIG.hexSpacing;
const CENTER_X_RATIO = RENDER_CONFIG.centerXRatio;
const CENTER_Y_RATIO = RENDER_CONFIG.centerYRatio;
const FISHEYE_STRENGTH = RENDER_CONFIG.fisheyeStrength;
const CENTER_INFLUENCE_RADIUS = RENDER_CONFIG.centerInfluenceRadius;
const ALPHA_FADE_RADIUS = RENDER_CONFIG.alphaFadeRadius;
const MIN_ALPHA = RENDER_CONFIG.minAlpha;
const MAX_WRAP_COPIES = RENDER_CONFIG.maxWrapCopies;
const PAN_SENSITIVITY = INTERACTION_CONFIG.panSensitivity;
const SNAP_SPEED = INTERACTION_CONFIG.snapSpeed;
const LONG_PRESS_DURATION = INTERACTION_CONFIG.longPressDuration;
const SEARCH_SCALE = UI_CONFIG.searchScale;
const SEARCH_WIDTH_RATIO = UI_CONFIG.searchWidthRatio;
const SEARCH_NAV_GAP = UI_CONFIG.searchNavGap;
const SEARCH_W_RATIO = UI_CONFIG.searchWRatio;
const IMAGE_CHECK_INTERVAL = PERFORMANCE_CONFIG.imageCheckInterval;
const MAX_IMAGE_QUEUE_LENGTH = PERFORMANCE_CONFIG.maxImageQueueLength;
let MAX_DRAW = PERFORMANCE_CONFIG.maxDraw;
let IS_MOBILE = false;

// 전역 변수 (성능 최적화)
let WORLD_W, WORLD_H; // 월드 크기 (재사용)
let bgBuffer; // 배경 버퍼
let canvasElement = null;
let filterCacheSignature = null;
let filterCacheResult = {
  filteredBubbles: [],
  hasTagFilter: false,
  selectedTag: null,
  selectedGroup: null,
};
let MAX_CONCURRENT_IMAGE_LOADS = 2;
let imageLoadQueue = [];
let imageQueueSet = new Set();
let activeImageLoads = 0;
let lastVisibleImageCheck = 0;
let resetInProgress = false;

explorerRuntime.registerCleanup("graphics-buffers", () => {
  if (bgBuffer?.remove) {
    bgBuffer.remove();
  }
  bgBuffer = null;
  if (navBarBuffer?.remove) {
    navBarBuffer.remove();
  }
  navBarBuffer = null;
});

// ---------- UI 헬퍼 함수 ----------
// 공통 텍스트 렌더링 헬퍼 (중복 코드 제거)
function withTextRendering(fn, options = {}) {
  push();
  drawingContext.save();
  drawingContext.textBaseline = options.textBaseline || "middle";
  drawingContext.textAlign = options.textAlign || "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = options.imageSmoothingQuality || "high";
  noStroke();
  textAlign(CENTER, CENTER);
  if (pretendardFont) textFont(pretendardFont);
  
  fn();
  
  drawingContext.restore();
  pop();
}

// ---------- CLASSES ----------
// 버블 정보 표시 컴포넌트 (순수 렌더러)
class BubbleInfoComponent {
  constructor(name, visualTags = [], emotionalTags = []) {
    this.name = name;
    this.visualTags = visualTags;
    this.emotionalTags = emotionalTags;
  }
  
  draw(x, y, alpha = 1.0, titleSize = 20, tagSize = 15) {
    if (!this.name) return;
    
    withTextRendering(() => {
    // 제목
    fill(255, 255, 255, 230 * alpha);
    textSize(titleSize);
    textStyle(BOLD);
    text(this.name, x, y);
    
    // 태그 표시
    let currentY = y + 35;
    if (this.visualTags.length > 0) {
      fill(255, 255, 255, 180 * alpha);
      textSize(tagSize);
      textStyle(NORMAL);
      text(this.visualTags.slice(0, 3).map(tag => `#${tag}`).join("  "), x, currentY);
      currentY += 25;
    }
    if (this.emotionalTags.length > 0) {
      fill(255, 255, 0, 220 * alpha);
      textSize(tagSize);
      textStyle(NORMAL);
      text(this.emotionalTags.slice(0, 3).map(tag => `#${tag}`).join("  "), x, currentY);
    }
    });
  }
}

// UI 버튼 베이스 클래스 (ToggleButton과 TagButton 통합)
class UIButton {
  constructor(label, x, y, width, height, radius = 12, style = {}) {
    this.label = label;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.radius = radius;
    this.style = style; // { type: 'toggle' | 'tag', index?: number }
    this.isHovered = false;
  }
  
  isSelected(selectedToggles) {
    if (this.style.type === 'toggle') {
      const index = this.style.index || 0;
      return index === 0 
      ? selectedToggles.length === 0 
        : selectedToggles.includes(index);
    }
    return false;
  }
  
  draw(state = {}) {
    const isSelected = state.isSelected !== undefined 
      ? state.isSelected 
      : (this.style.type === 'toggle' ? this.isSelected(state.selectedToggles || []) : false);
    
    // 배경 그리기
    if (this.style.type === 'toggle') {
      // 그라디언트 배경
    const gradient = drawingContext.createLinearGradient(
      this.x, this.y, this.x, this.y + this.height
    );
    gradient.addColorStop(0, isSelected 
      ? "rgba(255, 255, 255, 0.3)" 
      : "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(1, isSelected 
      ? "rgba(255, 255, 255, 0.2)" 
      : "rgba(255, 255, 255, 0.1)");
    
    drawingContext.fillStyle = gradient;
    drawingContext.strokeStyle = isSelected
      ? "rgba(255, 255, 255, 0.5)"
      : "rgba(255, 255, 255, 0.3)";
    drawingContext.lineWidth = isSelected ? 2 : 1;
    
    roundRectPath(drawingContext, this.x, this.y, this.width, this.height, this.radius);
    drawingContext.fill();
    drawingContext.stroke();
    } else if (this.style.type === 'tag') {
      // Glass 태그 스타일
      drawGlassTag(this.x, this.y, this.width, this.height, this.radius, isSelected, this.isHovered);
    }
    
    // 텍스트 렌더링
    const textX = this.x + this.width / 2;
    const textY = this.y + this.height / 2 + (this.style.type === 'toggle' ? -3 : 0);
    const labelFontSize = this.style.type === 'toggle' ? 16 : 14;
    
    withTextRendering(() => {
      if (this.style.type === 'toggle' && isSelected) {
    // LED 빛번짐 효과
      drawingContext.shadowBlur = 20;
      drawingContext.shadowColor = "rgba(255, 255, 255, 0.8)";
        drawingContext.shadowOffsetX = 0;
        drawingContext.shadowOffsetY = 0;
      } else if (this.style.type === 'toggle') {
      drawingContext.shadowBlur = 12;
      drawingContext.shadowColor = "rgba(255, 255, 255, 0.5)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 0;
      }
    
    fill(255, 255, 255, isSelected ? 255 : 200);
      textSize(labelFontSize);
    textStyle(NORMAL);
    text(this.label, textX, textY);
    
      if (this.style.type === 'toggle' && isSelected) {
      drawingContext.shadowBlur = 30;
      drawingContext.shadowColor = "rgba(255, 255, 255, 0.6)";
      text(this.label, textX, textY);
    }
    });
  }
  
  contains(x, y) {
    return x >= this.x && x <= this.x + this.width &&
           y >= this.y && y <= this.y + this.height;
  }
}

// 하위 호환성을 위한 별칭 (기존 코드 호환)
class ToggleButton extends UIButton {
  constructor(label, index, x, y, width, height, radius = 16) {
    super(label, x, y, width, height, radius, { type: 'toggle', index });
    this.index = index;
  }
  
  isSelected(selectedToggles = []) {
    return super.isSelected(selectedToggles);
  }
  
  draw(selectedToggles = []) {
    super.draw({ selectedToggles });
  }
}

class TagButton extends UIButton {
  constructor(label, x, y, width, height, radius = 12) {
    super(label, x, y, width, height, radius, { type: 'tag' });
  }
  
  draw(isSelected = false) {
    super.draw({ isSelected });
  }
}

// 애니메이션 컨트롤러
class AnimationController {
  constructor() {
    this.animating = true;
  }

  start() {
    if (!this.animating) {
      this.animating = true;
      loop();
    }
  }

  stop() {
    if (this.animating) {
      this.animating = false;
      noLoop();
    }
  }
}

// 패닝 컨트롤러
class PanController {
  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.snapTargetX = null;
    this.snapTargetY = null;
    this.snapCompleted = false;
  }

  startDrag(x, y) {
    this.isDragging = true;
    this.dragStartX = x;
    this.dragStartY = y;
    this.dragOffsetX = this.offsetX;
    this.dragOffsetY = this.offsetY;
    this.panVelocityX = 0;
    this.panVelocityY = 0;
    this.snapTargetX = null;
    this.snapTargetY = null;
    this.snapCompleted = false;
  }

  updateDrag(x, y) {
    if (!this.isDragging) return;
    const deltaX = x - this.dragStartX;
    const deltaY = y - this.dragStartY;
    this.offsetX = this.dragOffsetX + deltaX * PAN_SENSITIVITY;
    this.offsetY = this.dragOffsetY + deltaY * PAN_SENSITIVITY;
    this.panVelocityX = deltaX * 0.05 * PAN_SENSITIVITY;
    this.panVelocityY = deltaY * 0.05 * PAN_SENSITIVITY;
  }

  endDrag() {
    this.isDragging = false;
  }

  update() {
    if (!this.isDragging) {
      if (this.snapTargetX !== null && this.snapTargetY !== null) {
        const dx = this.snapTargetX - this.offsetX;
        const dy = this.snapTargetY - this.offsetY;
        const dist = sqrt(dx * dx + dy * dy);

        if (dist < 0.1) {
          this.offsetX = this.snapTargetX;
          this.offsetY = this.snapTargetY;
          this.snapTargetX = null;
          this.snapTargetY = null;
          this.panVelocityX = 0;
          this.panVelocityY = 0;
          this.snapCompleted = true;
        } else {
          const dynamicSpeed = min(SNAP_SPEED * (1 + dist / 1000), 0.25);
          this.offsetX = lerp(this.offsetX, this.snapTargetX, dynamicSpeed);
          this.offsetY = lerp(this.offsetY, this.snapTargetY, dynamicSpeed);
          this.panVelocityX = 0;
          this.panVelocityY = 0;
        }
      } else {
        this.panVelocityX *= 0.95;
        this.panVelocityY *= 0.95;
        this.offsetX += this.panVelocityX;
        this.offsetY += this.panVelocityY;
      }
    }
  }
}

// UI 상태 관리자
class UIStateManager {
  constructor() {
    this.showToggles = false;
    this.selectedToggles = [];
    this.previousSelectedToggles = [];
    this.showGroupView = false; // 중간 단계 화면 표시 여부
    this.selectedGroup = null; // 선택된 집단 (1~5)
    this.selectedTag = null; // 선택된 태그 (태그 문자열)
  }

  toggleToggles() {
    this.showToggles = !this.showToggles;
  }

  selectToggle(index) {
    if (index === 0) {
      this.previousSelectedToggles = [...this.selectedToggles];
      this.selectedToggles = [];
    } else {
      this.previousSelectedToggles = [...this.selectedToggles];
      this.selectedToggles = [index];
    }
    this.showToggles = false;
  }

  // 중간 단계 화면으로 이동
  showGroupSelection(groupIndex) {
    this.showGroupView = true;
    this.selectedGroup = groupIndex;
    this.selectedTag = null;
    this.showToggles = false;
    resetOrbitBubbleInfo();
  }

  // 전체보기로 돌아가기
  backToMainView() {
    this.showGroupView = false;
    this.selectedGroup = null;
    this.selectedTag = null;
    this.selectedToggles = [];
    this.previousSelectedToggles = [];
    resetOrbitBubbleInfo();
  }

  // 태그 선택
  selectTag(tag) {
    this.selectedTag = tag;
    resetOrbitBubbleInfo();
    // 중간 단계 화면은 유지 (태그 선택을 자유롭게 할 수 있도록)
    // this.showGroupView = false; // 중간 단계 화면 닫기 - 제거
  }
}

// 버블 매니저
class BubbleManager {
  constructor() {
    this.bubbles = [];
    this.currentFilteredBubbles = [];
    this.alignAfterPopStartTime = null;
    this.version = 0;
  }

  build() {
    this.bubbles = [];
    const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
    let count = 0;
    
    // 사용 가능한 이미지 개수 확인
    const availableImages = Math.min(bubbleData.length, imageFiles.length);
    
    // 버블에 이미지를 순환하여 할당 (모든 버블이 이미지를 가지도록)
    // 예: 35개 버블, 30개 이미지 → 0~29, 0~4 (순환)
    const maxImageIndex = availableImages > 0 ? availableImages : 0;
    
    log(`[Explorer] buildBubbles: bubbleData.length=${bubbleData.length}, imageFiles.length=${imageFiles.length}, availableImages=${availableImages}, TOTAL_BUBBLES=${TOTAL_BUBBLES}`);

    for (let y = 0; y < gridSize && count < TOTAL_BUBBLES; y++) {
      for (let x = 0; x < gridSize && count < TOTAL_BUBBLES; x++) {
        const hueSeed = count + 1;
        // 이미지를 순환하여 할당 (모든 버블이 이미지를 가지도록)
        const imageIndex = maxImageIndex > 0 ? (count % maxImageIndex) : null;
        const bubble = new Bubble(x, y, hueSeed, imageIndex);
        
        // 이미지가 이미 로드되어 있으면 alpha를 조정 (깜빡거림 방지)
        if (imageIndex !== null && bubbleImages[imageIndex] && bubbleImages[imageIndex].width > 0) {
          bubble.alpha = 0.01; // 페이드인 시작
        }
        
        this.bubbles.push(bubble);
        count++;
      }
    }
    
    this.version += 1;
    log(`[Explorer] 버블 생성 완료: ${this.bubbles.length}개, imageIndex가 null인 버블: ${this.bubbles.filter(b => b.imageIndex === null).length}개`);
  }

  getFilteredBubbles(selectedToggles) {
    if (selectedToggles.length === 0) {
      return this.bubbles;
    }
    return this.bubbles.filter((b) => {
      return (
        b.attributes &&
        b.attributes.some((attr) => selectedToggles.includes(attr))
      );
    });
  }

  // 버블 팡 터지기 시작 (헬퍼 메서드)
  startPoppingBubbles(bubbles, filteredBubbles, excludeBubbles = []) {
    bubbles.forEach((b) => {
      const isFiltered = filteredBubbles.includes(b);
      const isExcluded = excludeBubbles.includes(b);
      if (!isFiltered && !isExcluded && !b.isPopping) {
        b.startPop(millis());
      }
    });
  }

  // 모든 팡 터지는 애니메이션 중지 (헬퍼 메서드)
  stopAllPopping(bubbles) {
    bubbles.forEach((b) => {
      if (b.isPopping) {
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0;
      }
    });
  }
}

// 전역 인스턴스 생성
let animationController;
let panController;
let uiStateManager;
let bubbleManager;

let bubbleIdCounter = 0;

class Bubble {
  constructor(gridX, gridY, hueSeed, imageIndex = null) {
    this.id = bubbleIdCounter++;
    this.gridX = gridX; // 그리드 X 좌표
    this.gridY = gridY; // 그리드 Y 좌표
    this.hueSeed = hueSeed; // 색상 시드
    this.baseX = 0; // 기본 X 위치 (계산됨)
    this.baseY = 0; // 기본 Y 위치 (계산됨)
    this.pos = createVector(0, 0); // 화면상 위치 (계산됨)
    this.r = BASE_BUBBLE_RADIUS; // 반지름
    this.copies = Array.from({ length: MAX_WRAP_COPIES }, () => ({
      x: 0,
      y: 0,
      active: false,
    }));
    // 이미지가 필요한 버블은 이미지가 로드될 때까지 alpha를 0으로 설정 (깜빡거림 방지)
    this.alpha = (imageIndex !== null) ? 0 : 1.0; // 투명도 (페이드아웃 효과용)
    this.imageIndex = imageIndex; // 사용할 이미지 인덱스 (null이면 색상 사용)
    this.isPopping = false; // 팡 터지는 애니메이션 중인지
    this.popProgress = 0; // 팡 터지는 진행도 (0~1)
    this.popStartTime = 0; // 팡 터지기 시작 시간
    this.POP_DURATION = 500; // 팡 애니메이션 지속 시간
    
    // 숨쉬기 애니메이션용
    this.pulseOffset = random(TWO_PI); // 버블마다 위상 다르게
    this.noiseOffset = random(1000); // noise 기반 미세 떨림용 오프셋
    this.baseRadius = BASE_BUBBLE_RADIUS; // 기준 반지름 (계산된 크기 기준값)
    this.interactionScale = 1.0; // 상호작용 스케일 (중앙 버블 등)
    
    // 버블 설명 정보
    if (imageIndex !== null && imageIndex < bubbleData.length && bubbleData[imageIndex]) {
      this.name = bubbleData[imageIndex].title;
      this.visualTags = bubbleData[imageIndex].visualTags || [];
      this.emotionalTags = bubbleData[imageIndex].emotionalTags || [];
      this.attributes = bubbleData[imageIndex].attributes || []; // 속성 추가
      // 하위 호환성을 위해 tags도 유지
      this.tags = [
        ...(bubbleData[imageIndex].visualTags || []),
        ...(bubbleData[imageIndex].emotionalTags || []),
      ];
    } else {
      // imageIndex가 없거나 bubbleData에 해당하는 데이터가 없는 경우
      if (imageIndex !== null) {
        logWarn(`[Explorer] imageIndex ${imageIndex}에 해당하는 bubbleData가 없습니다. bubbleData.length=${bubbleData.length}`);
      }
      this.name = `버블 ${
        gridX + gridY * Math.ceil(Math.sqrt(TOTAL_BUBBLES)) + 1
      }`;
      this.visualTags = [];
      this.emotionalTags = [];
      this.tags = ["#버블", "#색상", "#기본"];
      this.attributes = []; // 기본 속성 없음
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
    // edgeFactor 감쇠를 줄여서 최소 크기가 너무 작아지지 않도록
    let sizeFactor =
      (1 - normalizedDist * 0.5) * (0.4 + edgeFactor * 0.6); // 0.16 ~ 1.0 (최소값 증가)

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

    // 초기 화면인지 확인 (아무것도 선택되지 않은 상태)
    const isInitialScreen = uiStateManager && 
      !uiStateManager.selectedGroup && 
      !uiStateManager.selectedTag &&
      !uiStateManager.showGroupView;
    
    const minRadius = Math.max(
      MIN_BUBBLE_RADIUS_BASE,
      min(width, height) * 0.04
    );
    const minSizeFactor = 0.3;

    const targetBaseR =
      minRadius +
      (MAX_BUBBLE_RADIUS - minRadius) * max(sizeFactor, minSizeFactor);
    const baseEase = isInitialScreen ? 0.18 : 0.15;
    this.baseRadius = lerp(this.baseRadius, targetBaseR, baseEase);

    let breathFactor = 1.0;
    let noiseFactor = 1.0;
    if (ANIMATION_CONFIG.enableBreathAnim) {
    const t = millis() * 0.001;
    const breathSpeed = 0.5 + (this.hueSeed % 7) * 0.1;
    const breath = sin(t * breathSpeed + this.pulseOffset);
    const pulseAmp = map(sizeFactor, 0.1, 1.0, 0.03, 0.1);
      breathFactor = map(breath, -1, 1, 1.0 - pulseAmp, 1.0 + pulseAmp);

    const noiseSpeed = 0.2;
    const n = noise(this.noiseOffset + t * noiseSpeed);
      noiseFactor = map(n, 0, 1, 0.95, 1.05);
    }

    const interactionEase = 0.08;
    this.interactionScale = lerp(this.interactionScale, 1.0, interactionEase);

    this.r = this.baseRadius * breathFactor * noiseFactor * this.interactionScale;

    // 토러스 래핑 복사본 생성 (배열 재사용)
    const wrapOffsets = [
      { x: -worldWidth * fisheyeFactor, y: 0, cond: displayX < -this.r },
      { x: worldWidth * fisheyeFactor, y: 0, cond: displayX > width + this.r },
      { x: 0, y: -worldHeight * fisheyeFactor, cond: displayY < -this.r },
      { x: 0, y: worldHeight * fisheyeFactor, cond: displayY > height + this.r },
      {
        x: -worldWidth * fisheyeFactor,
        y: -worldHeight * fisheyeFactor,
        cond: displayX < -this.r && displayY < -this.r,
      },
      {
        x: worldWidth * fisheyeFactor,
        y: worldHeight * fisheyeFactor,
        cond: displayX > width + this.r && displayY > height + this.r,
      },
    ];
    let copyIndex = 0;
    wrapOffsets.forEach((offset) => {
      const slot = this.copies[copyIndex];
      if (!slot) return;
      if (offset.cond) {
        slot.x = displayX + offset.x;
        slot.y = displayY + offset.y;
        slot.active = true;
        copyIndex++;
      } else {
        slot.active = false;
      }
    });
    for (; copyIndex < this.copies.length; copyIndex++) {
      this.copies[copyIndex].active = false;
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

      const targetAlpha = isOnScreen && isInAllowedArea ? 1.0 : 0.0;
      const alphaEase = targetAlpha > this.alpha ? 0.18 : 0.08;
      this.alpha = lerp(this.alpha, targetAlpha, alphaEase);
    } else if (this._isFiltered && !this.isPopping) {
      // 필터링된 버블은 항상 alpha를 1.0으로 유지 (페이드아웃 로직 건너뛰기)
      this.alpha = 1.0;
    }
  }

  // 팡 애니메이션 메서드 (캡슐화)
  startPop(now) {
    this.isPopping = true;
    this.popStartTime = now;
    this.popProgress = 0;
  }

  updatePop(now, duration = null) {
    if (!this.isPopping) return false;
    
    const popDuration = duration || this.POP_DURATION;
    const elapsed = now - this.popStartTime;
    const t = Math.min(elapsed / popDuration, 1);
    const eased = 1 - pow(1 - t, 3); // easeOutCubic
    
    this.popProgress = eased;
    this.alpha = 1.0 - eased;
    
    if (t >= 1) {
      this.isPopping = false;
      this.alpha = 0;
      return true; // 완료됨
    }
    return false; // 진행 중
  }

  currentRadius() {
    if (!this.isPopping) return this.r;
    return this.r * (1.0 + this.popProgress * 1.5);
  }

  drawAt(x, y, isMain = false) {
    if (this.alpha < 0.01) return;

    const renderRadius = this.currentRadius();

    drawBubbleVisual(this, x, y, renderRadius, {
      isMain,
      alphaOverride: this.alpha,
    });
  }

  draw(isMain = false) {
    this.drawAt(this.pos.x, this.pos.y, isMain);

    // 토러스 래핑 복사본도 그리기
    if (this.copies) {
      this.copies.forEach((copyPos) => {
        if (!copyPos.active) return;
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

// 이미지 로더 클래스 (이미지 로딩 로직 통합)
class ImageLoader {
  constructor(basePath, maxConcurrent, maxQueue) {
    this.basePath = basePath;
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.queueSet = new Set();
    this.loading = new Set();
    this.loaded = new Set();
    this.activeLoads = 0;
    this.images = [];
  }

  request(index, imageFiles, onLoaded = null) {
    if (index === null || index >= imageFiles.length) return;
    if (this.loading.has(index) || this.loaded.has(index)) return;
    if (this.queueSet.has(index)) return;
    
    if (this.queue.length >= this.maxQueue) {
      const dropped = this.queue.shift();
    if (dropped !== undefined) {
        this.queueSet.delete(dropped);
      }
    }
    
    this.queue.push(index);
    this.queueSet.add(index);
    this.processQueue(imageFiles, onLoaded);
  }

  processQueue(imageFiles, onLoaded = null) {
  while (
      this.activeLoads < this.maxConcurrent &&
      this.queue.length > 0
  ) {
      const nextIndex = this.queue.shift();
    if (nextIndex === undefined) continue;
      this.queueSet.delete(nextIndex);
      this.startLoad(nextIndex, imageFiles, onLoaded);
    }
  }

  startLoad(imageIndex, imageFiles, onLoaded = null) {
    if (imageIndex === null || imageIndex >= imageFiles.length) return;
    if (this.loading.has(imageIndex) || this.loaded.has(imageIndex)) return;
    
    this.activeLoads++;
    const imagePath = `${this.basePath}${imageFiles[imageIndex]}`;
    const cached = getCachedImage(imagePath);
    
    if (cached) {
      this.images[imageIndex] = cached;
      this.loaded.add(imageIndex);
      this.loading.delete(imageIndex);
      this.activeLoads = Math.max(0, this.activeLoads - 1);
      if (onLoaded) onLoaded(imageIndex, cached);
      this.processQueue(imageFiles, onLoaded);
      return;
    }

    this.loading.add(imageIndex);
    loadImage(
      imagePath,
      (img) => {
        this.images[imageIndex] = img;
        cacheImage(imagePath, img);
        this.loaded.add(imageIndex);
        this.loading.delete(imageIndex);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (onLoaded) onLoaded(imageIndex, img);
        this.processQueue(imageFiles, onLoaded);
      },
      () => {
        // 로드 실패
        this.loading.delete(imageIndex);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        this.processQueue(imageFiles, onLoaded);
      }
    );
  }

  isLoaded(index) {
    return this.loaded.has(index);
  }

  isLoading(index) {
    return this.loading.has(index);
  }

  getImage(index) {
    return this.images[index] || null;
  }
}

// 전역 이미지 로더 인스턴스
let bubbleImageLoader = null;

function requestBubbleImage(imageIndex) {
  if (!bubbleImageLoader) return;
  bubbleImageLoader.request(imageIndex, imageFiles, (idx, img) => {
    // 이미지 로드 완료 후 해당 이미지를 사용하는 버블들을 페이드인
    if (bubbleManager && bubbleManager.bubbles) {
      bubbleManager.bubbles.forEach((b) => {
        if (b.imageIndex === idx && b.alpha < 0.01) {
          b.alpha = 0.01;
        }
      });
    }
  });
}

function processImageQueue() {
  if (!bubbleImageLoader) return;
  bubbleImageLoader.processQueue(imageFiles);
}

function queueVisibleBubbleImages() {
  if (!bubbleManager || !bubbleManager.bubbles) return;
  const now = millis();
  if (now - lastVisibleImageCheck < IMAGE_CHECK_INTERVAL) return;
  lastVisibleImageCheck = now;
  const LOAD_MARGIN = 200;
  bubbleManager.bubbles.forEach((b) => {
    // 이미지 인덱스가 없으면 스킵
    if (b.imageIndex === null || b.imageIndex === undefined) return;
    // 이미 로딩 중이거나 완료된 이미지는 스킵
    if (!bubbleImageLoader || bubbleImageLoader.isLoading(b.imageIndex) || bubbleImageLoader.isLoaded(b.imageIndex)) return;
    
    const effectiveR =
      b.isPopping && b.popProgress < 1.0
        ? b.r * (1.0 + b.popProgress * 1.5)
        : b.r;
    
    // 화면 안(또는 살짝 밖)에 들어온 버블이라면,
    // 알파값과 관계없이 이미지 로딩을 요청
    const isOnScreen =
      b.pos.x + effectiveR > -LOAD_MARGIN &&
      b.pos.x - effectiveR < width + LOAD_MARGIN &&
      b.pos.y + effectiveR > -LOAD_MARGIN &&
      b.pos.y - effectiveR < height + LOAD_MARGIN;
    
    if (isOnScreen) {
      requestBubbleImage(b.imageIndex);
    }
  });
}

function ensureFilteredBubblesState() {
  const bubbles = bubbleManager?.bubbles ?? [];
  const selectedTag = uiStateManager?.selectedTag ?? null;
  const selectedGroup = uiStateManager?.selectedGroup ?? null;
  const selectedToggles = uiStateManager?.selectedToggles ?? [];
  const previousSelectedToggles = uiStateManager?.previousSelectedToggles ?? [];
  const showGroupView = uiStateManager?.showGroupView ?? false;

  const signature = [
    bubbleManager?.version ?? 0,
    selectedTag ?? "__NONE__",
    selectedGroup ?? "__NONE__",
    selectedToggles.length > 0 ? selectedToggles.join(",") : "__ALL__",
  ].join("|");

  if (signature === filterCacheSignature) {
    return filterCacheResult;
  }

  let filteredBubbles = bubbles;
  let hasTagFilter = false;

  if (selectedTag) {
    filteredBubbles = bubbles.filter((b) => {
      if (!b.visualTags && !b.emotionalTags) return false;
      const allTags = [...(b.visualTags || []), ...(b.emotionalTags || [])];
      const hasRequestedTag = allTags.includes(selectedTag);
      if (!hasRequestedTag) return false;
      if (selectedGroup) {
        return b.attributes && b.attributes.includes(selectedGroup);
      }
      return true;
    });
    if (bubbleManager) {
      bubbleManager.currentFilteredBubbles = filteredBubbles;
      if (!showGroupView) {
        bubbleManager.startPoppingBubbles(bubbles, filteredBubbles);
      }
    }
    hasTagFilter = true;
  } else if (selectedToggles.length > 0) {
    filteredBubbles = bubbles.filter((b) => {
      return (
        b.attributes &&
        b.attributes.some((attr) => selectedToggles.includes(attr))
      );
    });

    let previousFilteredBubbles = [];
    if (previousSelectedToggles.length > 0) {
      previousFilteredBubbles = bubbles.filter((b) => {
        return (
          b.attributes &&
          b.attributes.some((attr) => previousSelectedToggles.includes(attr))
        );
      });
    }
    const commonBubbles = filteredBubbles.filter((b) =>
      previousFilteredBubbles.includes(b)
    );

    if (bubbleManager) {
      bubbleManager.currentFilteredBubbles = filteredBubbles;
      bubbleManager.startPoppingBubbles(
        bubbles,
        filteredBubbles,
        commonBubbles
      );
    }
  } else {
    if (bubbleManager) {
      bubbleManager.currentFilteredBubbles = bubbles;
      bubbleManager.stopAllPopping(bubbles);
    }
  }

  filterCacheSignature = signature;
  filterCacheResult = {
    filteredBubbles,
    hasTagFilter,
    selectedTag,
    selectedGroup,
  };

  return filterCacheResult;
}

// 모든 버블에서 사용되는 이미지들을 한 번에 미리 로드
// (화면 안에 들어온 버블들이 색 버블로만 남지 않도록 보장)
function preloadInitialImages(count = 12) {
  if (!bubbleManager || !bubbleManager.bubbles) return;
  const bubbles = bubbleManager.bubbles;
  const uniqueIndexes = [];
  const seen = new Set();
  for (const b of bubbles) {
    const idx = b.imageIndex;
    if (idx === null || idx === undefined) continue;
    if (idx < 0 || idx >= imageFiles.length) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    uniqueIndexes.push(idx);
    if (uniqueIndexes.length >= count) break;
  }
  uniqueIndexes.forEach((idx) => requestBubbleImage(idx));
}

// 개별 버블 이미지 로드 함수
function startBubbleImageLoad(imageIndex) {
  if (imageIndex === null || imageIndex >= imageFiles.length) return;
  if (imageLoading.has(imageIndex) || imageLoaded.has(imageIndex)) return;
  activeImageLoads++;

  const imagePath = `../public/assets/bubble-imgs/${imageFiles[imageIndex]}`;
  const cached = getCachedImage(imagePath);
  if (cached) {
    bubbleImages[imageIndex] = cached;
    imageLoaded.add(imageIndex);
    imageLoading.delete(imageIndex);
    activeImageLoads = Math.max(0, activeImageLoads - 1);
    processImageQueue();
    return;
  }

  imageLoading.add(imageIndex);

  loadImage(
    imagePath,
    (img) => {
      // 로드 성공
      bubbleImages[imageIndex] = img;
      cacheImage(imagePath, img);
      imageLoaded.add(imageIndex);
      imageLoading.delete(imageIndex);
      activeImageLoads = Math.max(0, activeImageLoads - 1);
      processImageQueue();

      // 이미지 로드 완료 후 해당 이미지를 사용하는 버블들을 페이드인
      if (bubbleManager && bubbleManager.bubbles) {
        bubbleManager.bubbles.forEach((b) => {
          if (b.imageIndex === imageIndex && b.alpha < 0.01) {
            // 이미지가 로드되면 부드럽게 페이드인 (깜빡거림 방지)
            b.alpha = 0.01; // 0이 아닌 작은 값으로 시작하여 페이드인 시작
          }
        });
      }

    },
    (e) => {
      // 로드 실패
      logError(
        `[Explorer] bubbleImage[${imageIndex}] (${imageFiles[imageIndex]}) 로딩 실패:`,
        e
      );
      // 로드 실패한 이미지는 null로 유지하고 실패로 표시
      bubbleImages[imageIndex] = null;
      imageLoaded.add(imageIndex); // 실패한 이미지도 "시도 완료"로 표시
      imageLoading.delete(imageIndex);
      activeImageLoads = Math.max(0, activeImageLoads - 1);
      processImageQueue();

      // 이 이미지를 쓰던 버블들은 색 버블로 전환
      if (bubbleManager && bubbleManager.bubbles) {
        bubbleManager.bubbles.forEach((b) => {
          if (b.imageIndex === imageIndex) {
            b.imageIndex = null; // 앞으로는 이미지 없는 버블로 처리
            if (b.alpha < 0.01) {
              b.alpha = 1.0; // 컬러 버블은 바로 보이게
            }
          }
        });
      }
    }
  );
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
  bgBuffer = recreateGraphicsBuffer(bgBuffer, width, height);
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

// 애니메이션 시작/정지 함수 (하위 호환성)
function startAnim() {
  if (animationController) {
    animationController.start();
  }
}

function stopAnim() {
  if (animationController) {
    animationController.stop();
  }
}

function drawBubbleVisual(
  bubble,
  x,
  y,
  r,
  { isMain = false, alphaOverride = null } = {}
) {
  if (!bubble) return;

  const effectiveAlpha =
    alphaOverride !== null && alphaOverride !== undefined
      ? alphaOverride
      : bubble.alpha;
  if (effectiveAlpha < 0.01) return;

  const diameter = r * 2;
  const hasImage =
    bubble.imageIndex !== null &&
    bubbleImages[bubble.imageIndex] &&
    bubbleImages[bubble.imageIndex].width > 0;
  
  // 이미지가 필요한 버블인데 이미지가 아직 로드되지 않았으면 로드 시도
  if (bubble.imageIndex !== null && !hasImage && !imageLoading.has(bubble.imageIndex) && !imageLoaded.has(bubble.imageIndex)) {
    requestBubbleImage(bubble.imageIndex);
  }

  // 메인 버블 백글로우
  if (isMain) {
    push();
    drawingContext.save();
    drawingContext.globalAlpha = effectiveAlpha * 0.85;
    const glowRadius = r * 1.7;
    const glowGradient = drawingContext.createRadialGradient(
      x,
      y,
      r * 0.4,
      x,
      y,
      glowRadius
    );
    glowGradient.addColorStop(0, "rgba(255,255,255,0.7)");
    glowGradient.addColorStop(0.5, "rgba(255, 243, 156, 0.18)");
    glowGradient.addColorStop(1, "rgba(255, 255, 217, 0)");
    drawingContext.fillStyle = glowGradient;
    drawingContext.beginPath();
    drawingContext.arc(x, y, glowRadius, 0, Math.PI * 2);
    drawingContext.fill();
    drawingContext.restore();
    pop();
  }

  push();
  drawingContext.save();
  drawingContext.globalAlpha = effectiveAlpha;
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";

  drawingContext.beginPath();
  drawingContext.arc(x, y, r, 0, Math.PI * 2);
  drawingContext.clip();

  if (hasImage) {
    imageMode(CENTER);
    const img = bubbleImages[bubble.imageIndex];
    const imgRatio = img.width / img.height;

    let drawW, drawH;
    if (imgRatio > 1) {
      drawH = diameter;
      drawW = imgRatio * drawH;
    } else {
      drawW = diameter;
      drawH = drawW / imgRatio;
    }

    image(img, x, y, drawW, drawH);
  } else {
    const base = bubbleColor(bubble.hueSeed);
    const outer = base.outer;
    const inner = base.inner;

    drawingContext.shadowBlur = 24;
    drawingContext.shadowColor = "rgba(0,0,0,0.35)";
    fill(outer);
    circle(x, y, diameter);

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
      circle(x, y, diameter);
    }
  }

  drawingContext.restore();
  pop();

  if (!isMain && bubbleCap && bubbleCap.width > 0) {
    push();
    drawingContext.save();
    drawingContext.globalAlpha = effectiveAlpha;
    imageMode(CENTER);
    image(bubbleCap, x, y, diameter, diameter);
    drawingContext.restore();
    pop();
  }

  push();
  drawingContext.save();
  drawingContext.globalAlpha = effectiveAlpha;
  if (isMain) {
    // 메인 버블은 추가 링 없이 부드러운 발광만 유지
  } else {
    noStroke();
    fill(255, 25);
    ellipse(x, y, diameter, diameter);
  }
  drawingContext.restore();
  pop();
}

// 중앙 버블 이미지/색상만 그리기 (캡 없이)
function drawCenterBubbleImage(bubble) {
  drawBubbleVisual(bubble, bubble.pos.x, bubble.pos.y, bubble.r, {
    isMain: true,
  });
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
  const size = r * 2;

  push();
  imageMode(CENTER);
  drawingContext.save();
  drawingContext.globalAlpha = bubble.alpha;
  image(bubbleCap, x, y, size, size);
  drawingContext.restore();
  pop();
}

// 버블 정보 가져오기 헬퍼 함수
function getBubbleInfo(bubble) {
  if (bubble.imageIndex !== null && bubbleData?.[bubble.imageIndex]) {
    const data = bubbleData[bubble.imageIndex];
    return {
      name: data.title || "",
      visualTags: data.visualTags || [],
      emotionalTags: data.emotionalTags || []
    };
  }
  return {
    name: bubble.name || "",
    visualTags: bubble.visualTags || [],
    emotionalTags: bubble.emotionalTags || []
  };
}

// 버블 정보 표시 통합 함수 (센터/오빗 공통)
function drawBubbleInfoAt(bubble, x, y, alpha = 1.0, options = {}) {
  const { name, visualTags, emotionalTags } = getBubbleInfo(bubble);
  if (!name) return;
  
  const comp = new BubbleInfoComponent(name, visualTags, emotionalTags);
  comp.draw(x, y, alpha, options.titleSize ?? 18, options.tagSize ?? 14);
}

// 센터 버블 정보 표시
function drawCenterBubbleInfo(bubble) {
  if (!bubble) return;
  const infoY = bubble.pos.y + bubble.r + 40;
  drawBubbleInfoAt(bubble, bubble.pos.x, infoY, 1.0, { titleSize: 18, tagSize: 14 });
}

// 오빗 버블 정보 표시
function drawOrbitBubbleInfo(bubble, bubbleX, bubbleY, bubbleRadius = null) {
  if (orbitInfoAlpha < 0.01) return;
  
  const r = bubbleRadius !== null ? bubbleRadius : (bubble.r || 50);
  const infoY = bubbleY + r + 30;
  drawBubbleInfoAt(bubble, bubbleX, infoY, orbitInfoAlpha, { titleSize: 16, tagSize: 13 });
}

// ---------- 집단별 언어 데이터 ----------
// 각 집단의 시각적 언어와 감정적 언어 정의
const groupLanguages = {
  1: {
    // 여행자 (traveler)
    visual: [
      "깊이감",
      "메탈릭 쉐이드",
      "자연광 리플렉션",
      "미드나잇 톤",
      "풍경 반사감",
    ],
    emotional: [
      "탐험",
      "긴장과 기대",
      "미지로 향함",
      "고독한 낭만",
      "체험의 몰입",
    ],
  },
  2: {
    // 20대 여성 (20s)
    visual: [
      "핑크-옐로우 그라데이션",
      "젤리 같은 텍스처",
      "따뜻한 난색 반짝임",
      "부드러운 곡면",
      "글로시한 윤기",
    ],
    emotional: ["활력", "사랑스러움", "자기표현", "로맨틱", "설렘"],
  },
  3: {
    // 50대 남성 (50s)
    visual: [
      "고명도 대비",
      "크고 안정된 구형",
      "차분하고 시원한 색",
      "투명도 높은 반사광",
      "균형 잡힌 색 분포",
    ],
    emotional: ["보호", "책임감", "신뢰", "안정", "성취"],
  },
  4: {
    // 주부 (housewife)
    visual: [
      "소프트 톤",
      "은은한 파스텔 옐로",
      "투명한 안정감",
      "부드러운 난반사",
      "깨끗한 정결 이미지",
    ],
    emotional: ["온기", "안정", "배려", "평온", "따뜻한 일상"],
  },
  5: {
    // 10대 여성 (10s)
    visual: [
      "네온 핑크",
      "사이버 파스텔",
      "디지털 글로시",
      "높은 채도",
      "K-pop 컬러 팔레트",
    ],
    emotional: [
      "흥미",
      "자기취향 강도",
      "아이코닉함",
      "통통 튀는 귀여움",
      "즉각적 몰입",
    ],
  },
};

// 버블 데이터에 언어를 자동 할당하는 함수
function assignLanguagesToBubbles() {
  for (let i = 0; i < bubbleData.length; i++) {
    const bubble = bubbleData[i];
    if (!bubble.attributes || bubble.attributes.length === 0) {
      bubble.visualTags = [];
      bubble.emotionalTags = [];
      continue;
    }

    const visualTags = [];
    const emotionalTags = [];

    // 각 속성에 대해 언어 선택 (랜덤하게 선택)
    bubble.attributes.forEach((attr) => {
      const lang = groupLanguages[attr];
      if (lang) {
        // 시각적 언어 2-3개 선택
        const visualCount = Math.floor(Math.random() * 2) + 2; // 2-3개
        const selectedVisual = [];
        const visualCopy = [...lang.visual];
        for (let j = 0; j < visualCount && visualCopy.length > 0; j++) {
          const idx = Math.floor(Math.random() * visualCopy.length);
          selectedVisual.push(visualCopy[idx]);
          visualCopy.splice(idx, 1);
        }
        visualTags.push(...selectedVisual);

        // 감정적 언어 2-3개 선택
        const emotionalCount = Math.floor(Math.random() * 2) + 2; // 2-3개
        const selectedEmotional = [];
        const emotionalCopy = [...lang.emotional];
        for (let j = 0; j < emotionalCount && emotionalCopy.length > 0; j++) {
          const idx = Math.floor(Math.random() * emotionalCopy.length);
          selectedEmotional.push(emotionalCopy[idx]);
          emotionalCopy.splice(idx, 1);
        }
        emotionalTags.push(...selectedEmotional);
      }
    });

    // 중복 제거
    bubble.visualTags = [...new Set(visualTags)];
    bubble.emotionalTags = [...new Set(emotionalTags)];
  }
}

// ---------- p5 LIFECYCLE ----------
function preload() {
  // preload() 내에서는 콜백 없이 직접 할당 (p5.js가 자동으로 동기 처리)
  mikeIcon = loadCachedAsset("../public/assets/public-imgs/mike.png");
  captureButton = loadCachedAsset(
    "../public/assets/public-imgs/capture-button.png"
  );
  workroomButton = loadCachedAsset(
    "../public/assets/public-imgs/workroom-button.png"
  );
  navigationBar = loadCachedAsset(
    "../public/assets/public-imgs/navigation-bar.png"
  );
  bgImage = loadCachedAsset("../public/assets/public-imgs/bg.png");

  // Pretendard 폰트 로드
  pretendardFont = loadFont("../public/assets/fonts/PretendardVariable.ttf");

  // 공용 버블 데이터 JSON은 setup()에서 비동기로 로드
  // (preload에서 loadJSON이 제대로 작동하지 않을 수 있음)

}

// 공용 버블 데이터 JSON 비동기 로드 함수
async function loadBubbleDataFromJSON() {
  try {
    const response = await fetch("../public/assets/data/bubbles.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const bubblesJson = await response.json();
    
    log("[Explorer] JSON 로드 성공:", bubblesJson);
    
    // 버블 이미지 데이터 정의 (JSON에서 로드)
    if (bubblesJson && bubblesJson.imageFiles && Array.isArray(bubblesJson.imageFiles)) {
      imageFiles = bubblesJson.imageFiles;
      log(`[Explorer] JSON에서 ${imageFiles.length}개의 이미지 파일 로드됨`);
    } else {
      logError("[Explorer] JSON에서 imageFiles를 로드할 수 없습니다", bubblesJson);
    }
    
    // 버블 데이터 (JSON에서 로드)
    if (bubblesJson && bubblesJson.bubbles && Array.isArray(bubblesJson.bubbles)) {
      bubbleData = bubblesJson.bubbles.map(bubble => ({
        title: bubble.title,
        tags: bubble.tags,
        attributes: bubble.attributes,
        visualTags: [], // assignLanguagesToBubbles에서 채워짐
        emotionalTags: [] // assignLanguagesToBubbles에서 채워짐
      }));
      log(`[Explorer] JSON에서 ${bubbleData.length}개의 버블 데이터 로드됨`);
      
      // 버블 이미지 배열 초기화 (지연 로딩을 위해 null로 초기화)
      if (bubbleImageLoader) {
      for (let i = 0; i < imageFiles.length; i++) {
          bubbleImageLoader.images.push(null);
        }
        bubbleImages = bubbleImageLoader.images; // 참조 업데이트
      }
      
      // 버블 데이터에 언어 할당 (visualTags, emotionalTags 생성)
      assignLanguagesToBubbles();
      log(`[Explorer] 버블 데이터에 언어 할당 완료`);
      
      // 버블 재생성 (JSON 데이터가 로드된 후)
      if (bubbleManager) {
        bubbleManager.build();
        log(`[Explorer] 버블 재생성 완료`);

        // 초기 오프셋 설정 (버블이 화면에 보이도록)
        // 중앙 버블이 화면 중앙에 오도록 초기 오프셋 계산
        const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
        const centerGridX = Math.floor(gridSize / 2);
        const centerGridY = Math.floor(gridSize / 2);
        const centerHexX = centerGridX * HEX_SPACING * 1.5;
        const centerHexY =
          centerGridY * HEX_SPACING * sqrt(3) +
          ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

        if (panController) {
          panController.offsetX = width * CENTER_X_RATIO - centerHexX;
          panController.offsetY = height * CENTER_Y_RATIO - centerHexY;
          // 초기 스냅 완료 상태로 설정하여 자동 스냅이 실행되도록
          panController.snapCompleted = false;
        }
        log(`[Explorer] 초기 버블 위치 설정 완료`);

        // 초기 버블 일부만 미리 로드
        preloadInitialImages();
      }
    } else {
      logError("[Explorer] JSON에서 bubbles를 로드할 수 없습니다", bubblesJson);
    }
  } catch (error) {
    logError("[Explorer] JSON 로드 중 오류 발생:", error);
    bubbleData = [];
    imageFiles = [];
  }
}

// 태블릿/모바일 감지 및 성능 최적화
function isMobileOrTablet() {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile =
    /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const isTabletUA =
    /ipad|tablet/.test(ua) ||
    (/macintosh/.test(ua) && navigator.maxTouchPoints > 0);
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isWindowsDesktop = /windows nt/i.test(ua);

  return isMobile || isTabletUA || (isTouchDevice && !isWindowsDesktop);
}

function setup() {
  // 클래스 인스턴스 초기화
  animationController = new AnimationController();
  panController = new PanController();
  uiStateManager = new UIStateManager();
  bubbleManager = new BubbleManager();

  // 태블릿/모바일 최적화
  IS_MOBILE = isMobileOrTablet();
  const isMobile = IS_MOBILE;
  
  if (isMobile) {
    pixelDensity(1.3); // 태블릿/모바일에서도 화질 유지하면서 발열 완화
    frameRate(28); // 모바일에서도 부드러운 애니메이션 유지
    MAX_DRAW = 50; // 한 번에 그리는 버블 수 완화
    MAX_BUBBLE_RADIUS = 90;
    ANIMATION_CONFIG.enableBreathAnim = false;
    ANIMATION_CONFIG.lightEffectInterval = 4;
    ANIMATION_CONFIG.enableLightEffect = false;
    ANIMATION_CONFIG.enableMicGlow = false;
    ANIMATION_CONFIG.enableCenterPulse = false;
    ANIMATION_CONFIG.allowIdlePause = false;
  } else {
    pixelDensity(1.5); // 데스크톱은 적당한 밀도로 유지
    frameRate(30); // 데스크톱은 30fps로 제한
    MAX_DRAW = 80;
    MAX_BUBBLE_RADIUS = 120;
    ANIMATION_CONFIG.enableBreathAnim = true;
    ANIMATION_CONFIG.lightEffectInterval = 1;
    ANIMATION_CONFIG.enableLightEffect = false;
    ANIMATION_CONFIG.enableMicGlow = false;
    ANIMATION_CONFIG.enableCenterPulse = true;
    ANIMATION_CONFIG.allowIdlePause = true;
  }
  MAX_CONCURRENT_IMAGE_LOADS = isMobile ? 4 : 6;
  
  // ImageLoader 초기화
  bubbleImageLoader = new ImageLoader(
    "../public/assets/bubble-imgs/",
    MAX_CONCURRENT_IMAGE_LOADS,
    MAX_IMAGE_QUEUE_LENGTH
  );
  // bubbleImages를 ImageLoader의 images로 참조 (하위 호환성)
  bubbleImages = bubbleImageLoader.images;

  // 지연 로딩 자산 로드 시작
  loadDeferredAssets();
  
  const canvas = createCanvas(windowWidth, windowHeight);
  canvasElement = canvas?.elt ?? null;
  explorerRuntime.setP5Instance(canvas?.pInst ?? null);

  if (typeof window !== "undefined") {
    const beforeUnloadHandler = () => explorerRuntime.destroy();
    window.addEventListener("beforeunload", beforeUnloadHandler, {
      once: true,
    });
    explorerRuntime.registerCleanup("before-unload", () => {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
    });
  }

  // 전역 텍스트 렌더링 품질 개선
  drawingContext.textBaseline = "alphabetic";
  drawingContext.textAlign = "start";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  
  // 추가 화질 개선 설정
  if (drawingContext.fontKerning !== undefined) {
    drawingContext.fontKerning = "normal";
  }

  rebuildWorldMetrics(); // 월드 메트릭스 초기화
  
  // 공용 버블 데이터 JSON 비동기 로드 (로드 완료 후 버블 생성)
  loadBubbleDataFromJSON();

  // 자산 로딩 확인 및 에러 체크 (헬퍼 함수로 간소화)
  const checkAsset = (asset, name, onSuccess = null) => {
    const isValid = asset && (!asset.width || asset.width > 0);
    if (!isValid) {
      logError(`${name} 로딩 실패`);
    } else if (onSuccess) {
      onSuccess();
    }
  };

  checkAsset(mikeIcon, "mikeIcon");
  checkAsset(captureButton, "captureButton");
  checkAsset(workroomButton, "workroomButton");
  checkAsset(navigationBar, "navigationBar");
  checkAsset(bubbleCap, "bubbleCap");
  checkAsset(pretendardFont, "pretendardFont");
  checkAsset(bgImage, "bgImage", redrawBackgroundBuffer);

  // 집단 이미지 로드 확인
  for (let i = 1; i <= 5; i++) {
    const img = groupImages[i];
    if (!img || (img.width !== undefined && img.width === 0)) {
      logError(`집단 이미지[${i}] 로딩 실패`);
    } else {
      log(`집단 이미지[${i}] 로드 성공: width=${img.width}, height=${img.height}`);
    }
  }

  // 네비게이션 바 고해상도 버퍼 생성 (한 번만 생성)
  // windowResized에서 재생성하므로 여기서는 기본 크기로 생성
  if (navigationBar) {
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();

    const NAV_W = navigationBar.width * 0.455 * responsiveScale;
    const NAV_H = navigationBar.height * 0.455 * responsiveScale;
    const scaleFactor = 2;
    navBarBuffer = recreateGraphicsBuffer(
      navBarBuffer,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
    navBarBuffer.imageMode(CORNER);
    navBarBuffer.image(
      navigationBar,
      0,
      0,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
  }

  queueVisibleBubbleImages();

  // 포인터 이벤트 설정 (모든 입력 통합)
  setupPointerBridges();
  
  // 토글 버튼 초기화
  initToggleButtons();

  // Page Visibility API 설정 (화면 밖에 나갔을 때 렌더링 중단)
  if (typeof document !== "undefined") {
    const handleVisibilityChange = () => {
      isPageVisible = !document.hidden;
      if (!isPageVisible) {
        // 화면 밖에 나갔을 때 캔버스 완전히 지우기
        clear();
        background(BG_COLOR);
        // 모든 애니메이션 상태 초기화
        if (panController) {
          panController.panVelocityX = 0;
          panController.panVelocityY = 0;
        }
        if (bubbleRotationState) {
          bubbleRotationState.angularVelocity = 0;
        }
      } else {
        softReset();
      }
    };
    
    // 초기 상태 설정
    isPageVisible = !document.hidden;
    
    // 이벤트 리스너 등록
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    // 정리 함수 등록
    explorerRuntime.registerCleanup("visibility-change", () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    });
  }
}

// 포인터 이벤트 핸들러 저장 (중복 등록 방지)
let pointerEventHandlers = {
  down: null,
  move: null,
  up: null,
  cancel: null
};
let activePointers = new Map(); // 활성 포인터 추적 (pointerId -> {x, y})
let lastMemoryCleanup = 0; // 마지막 메모리 정리 시간
const MEMORY_CLEANUP_INTERVAL = 60000; // 60초마다 메모리 정리
let isPageVisible = true; // 페이지 가시성 상태

// 포인터 이벤트 설정 (모든 입력 통합 처리)
function setupPointerBridges() {
  // 이미 등록된 이벤트 리스너 제거 (중복 방지)
  if (pointerEventHandlers.down) {
    window.removeEventListener("pointerdown", pointerEventHandlers.down);
    window.removeEventListener("pointermove", pointerEventHandlers.move);
    window.removeEventListener("pointerup", pointerEventHandlers.up);
    window.removeEventListener("pointercancel", pointerEventHandlers.cancel);
  }
  
  // activePointers 초기화
  activePointers.clear();

  // 포인터 다운 이벤트
  pointerEventHandlers.down = (e) => {
    const canvas = canvasElement;
    if (!canvas || !canvas.contains(e.target)) return;

    // 캔버스 영역인지 확인
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    activePointers.set(e.pointerId, { x, y });

    const handled = handlePointerDown(x, y, e.pointerId);

    // 터치나 펜인 경우 기본 동작 방지
    if (e.pointerType !== "mouse" && handled) {
      e.preventDefault();
    }
  };
  window.addEventListener("pointerdown", pointerEventHandlers.down, { passive: false });

  // 포인터 이동 이벤트
  pointerEventHandlers.move = (e) => {
    if (!activePointers.has(e.pointerId)) return;

    const canvas = canvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    activePointers.set(e.pointerId, { x, y });

    handlePointerMove(x, y, e.pointerId);

    // 드래그 중이면 기본 동작 방지
    if (
      panController &&
      panController.isDragging &&
      e.pointerType !== "mouse"
    ) {
      e.preventDefault();
    }
  };
  window.addEventListener("pointermove", pointerEventHandlers.move, { passive: false });

  // 포인터 업 이벤트
  pointerEventHandlers.up = (e) => {
    if (!activePointers.has(e.pointerId)) return;

    const canvas = canvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    handlePointerUp(x, y, e.pointerId);

    activePointers.delete(e.pointerId);

    // 터치나 펜인 경우 기본 동작 방지
    if (e.pointerType !== "mouse") {
      e.preventDefault();
    }
  };
  window.addEventListener("pointerup", pointerEventHandlers.up, { passive: false });

  // 포인터 취소 이벤트 (예: 다중 터치로 인한 취소)
  pointerEventHandlers.cancel = (e) => {
    if (!activePointers.has(e.pointerId)) return;

    const canvas = canvasElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 포인터 업과 동일하게 처리
    handlePointerUp(x, y, e.pointerId);

    activePointers.delete(e.pointerId);

    if (e.pointerType !== "mouse") {
      e.preventDefault();
    }
  };
  window.addEventListener("pointercancel", pointerEventHandlers.cancel, { passive: false });

  explorerRuntime.registerCleanup("pointer-events", () => {
    if (pointerEventHandlers.down) {
      window.removeEventListener("pointerdown", pointerEventHandlers.down);
    }
    if (pointerEventHandlers.move) {
      window.removeEventListener("pointermove", pointerEventHandlers.move);
    }
    if (pointerEventHandlers.up) {
      window.removeEventListener("pointerup", pointerEventHandlers.up);
    }
    if (pointerEventHandlers.cancel) {
      window.removeEventListener("pointercancel", pointerEventHandlers.cancel);
    }
    pointerEventHandlers = {
      down: null,
      move: null,
      up: null,
      cancel: null,
    };
    activePointers.clear();
  });
}


function softReset() {
  if (resetInProgress) return;
  resetInProgress = true;
  clear();
  background(BG_COLOR);
  if (panController) {
    panController.panVelocityX = 0;
    panController.panVelocityY = 0;
    panController.snapTargetX = null;
    panController.snapTargetY = null;
    panController.snapCompleted = true;
  }
  if (bubbleRotationState) {
    bubbleRotationState.angularVelocity = 0;
  }
  if (bubbleManager) {
    bubbleManager.build();
  }
  if (uiStateManager) {
    uiStateManager.backToMainView?.();
    uiStateManager.showToggles = false;
    uiStateManager.selectedTag = null;
    uiStateManager.selectedGroup = null;
  }
  startAnim();
  if (typeof loop === "function") {
    loop();
  }
  resetInProgress = false;
}

function draw() {
  // 페이지가 보이지 않으면 렌더링 중단
  if (!isPageVisible) {
    clear();
    background(BG_COLOR);
    return;
  }

  const now = millis();
  if (now - lastFrameTime < FRAME_INTERVAL_MS) {
    return;
  }
  lastFrameTime = now;

  if (!resetInProgress && now - lastResetTime > RESET_INTERVAL_MS) {
    softReset();
    lastResetTime = now;
  }

  const isMobile = IS_MOBILE;
  
  // 주기적 메모리 정리 (60초마다)
  if (now - lastMemoryCleanup > MEMORY_CLEANUP_INTERVAL) {
    // activePointers 정리 (오래된 항목 제거)
    if (activePointers.size > 10) {
      activePointers.clear(); // 비정상적으로 많은 경우 초기화
    }
    
    lastMemoryCleanup = now;
  }
  
  // 누적 렌더링 방지: 매 프레임 캔버스를 완전히 지움
  if (IS_MOBILE) {
    background(BG_COLOR);
  } else {
  clear();
  }
  const shouldRunHeavyPass = !IS_MOBILE || frameCount % 2 === 0;
  
  // 배경 버퍼 사용 (성능 최적화)
  if (bgBuffer) {
    image(bgBuffer, 0, 0);
  } else if (!IS_MOBILE) {
    background(BG_COLOR);
  }

  // 중간 단계 화면 상태 확인 (먼저 선언)
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedGroup = uiStateManager ? uiStateManager.selectedGroup : null;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  const bubbles = bubbleManager?.bubbles ?? [];
  const filterState = ensureFilteredBubblesState();
  const hasTagFilter = filterState.hasTagFilter;
  let currentFilteredBubbles = filterState.filteredBubbles;

  const orbitModeActive = !!showGroupView;
  if (!orbitModeActive) {
    resetOrbitBubbleState();
  }

  // 버블 회전 각도 업데이트 (태그 필터링 또는 그룹 뷰가 활성화된 경우)
  if (hasTagFilter || showGroupView) {
    if (!bubbleRotationState.isDragging) {
      // 자동 회전
      bubbleRotationState.rotationAngle += bubbleRotationState.autoSpeed;
      
      // 관성 회전
      bubbleRotationState.rotationAngle += bubbleRotationState.angularVelocity;
      bubbleRotationState.angularVelocity *= 0.92;
      if (Math.abs(bubbleRotationState.angularVelocity) < 0.0001) {
        bubbleRotationState.angularVelocity = 0;
      }
    }
    
    // 각도 정규화 (오버플로우 방지) - 2π로 모듈로 연산하여 0~2π 범위로 유지
    const TWO_PI = Math.PI * 2;
    bubbleRotationState.rotationAngle = ((bubbleRotationState.rotationAngle % TWO_PI) + TWO_PI) % TWO_PI;
  } else {
    // 태그/그룹 뷰가 아닐 때는 회전 상태 초기화
    bubbleRotationState.rotationAngle = 0;
    bubbleRotationState.angularVelocity = 0;
    bubbleRotationState.isDragging = false;
    bubbleRotationState.didDrag = false;
  }

  // 패닝 애니메이션 업데이트 (클래스 사용) - 중간 단계에서도 활성화
  if (panController) {
    // 중간 단계에서는 스냅 비활성화
    if (!showGroupView && !hasTagFilter) {
      panController.update();

    // 속도가 매우 작아지면 스냅 시작 (한 번만)
    if (
      !panController.isDragging &&
      abs(panController.panVelocityX) < 0.1 &&
      abs(panController.panVelocityY) < 0.1
    ) {
      panController.panVelocityX = 0;
      panController.panVelocityY = 0;
      // 스냅 타겟이 없고, 아직 스냅이 완료되지 않았을 때만 스냅 시작
      if (
        panController.snapTargetX === null &&
        panController.snapTargetY === null &&
        !panController.snapCompleted
      ) {
        snapToCenterBubble();
      }
    }
    } else if (showGroupView || hasTagFilter) {
      // 중간 단계에서도 패닝 업데이트 (스냅 없이)
      panController.update();
    }
  }

  // 상태 변수 추출 (간소화)
  const offsetX = panController?.offsetX ?? 0;
  const offsetY = panController?.offsetY ?? 0;
  const isDragging = panController?.isDragging ?? false;
  const snapTargetX = panController?.snapTargetX ?? null;
  const snapTargetY = panController?.snapTargetY ?? null;
  const snapCompleted = panController?.snapCompleted ?? false;
  const panVelocityX = panController?.panVelocityX ?? 0;
  const panVelocityY = panController?.panVelocityY ?? 0;
  let showToggles = uiStateManager?.showToggles ?? false;
  const alignAfterPopStartTime = bubbleManager?.alignAfterPopStartTime ?? null;
  const filteredBubbles = filterState.filteredBubbles;

  // 중심 위치 계산
  const { centerX, centerY } = getBubbleAreaCenter();

  // 중간 단계 화면 상태 확인 (위에서 이미 선언됨)

  const selectedToggles = uiStateManager?.selectedToggles ?? [];

  // 팡 터지는 애니메이션 업데이트 (Bubble 클래스 메서드 사용)
  const popNow = millis();
  let allPopped = true;
  let lastPopEndTime = 0;

  bubbles.filter(b => b.isPopping).forEach((b) => {
    const completed = b.updatePop(popNow);
    if (completed) {
      lastPopEndTime = Math.max(lastPopEndTime, b.popStartTime + b.POP_DURATION);
    } else {
      allPopped = false;
    }
  });

  // 팡 애니메이션이 진행되는 동안 시점 이동 시작 (더 자연스럽게)
  if (alignAfterPopStartTime !== null) {
    const elapsedSinceStart = millis() - alignAfterPopStartTime;
    const POP_START_DELAY = 200; // 팡 애니메이션 시작 후 0.2초 후에 시점 이동 시작

    // 팡 애니메이션이 시작된 지 일정 시간이 지나면 바로 정렬 시작
    // 팡 애니메이션이 완료되기를 기다리지 않고 진행 중에 시작
    if (elapsedSinceStart >= POP_START_DELAY) {
      // 정렬 시작
      if (currentFilteredBubbles.length > 0) {
        const filteredCount = currentFilteredBubbles.length;
        const gridSize = Math.ceil(Math.sqrt(filteredCount));

        // 필터링된 버블들을 새로운 그리드로 재배치
        currentFilteredBubbles.forEach((b, index) => {
          const newGridX = index % gridSize;
          const newGridY = Math.floor(index / gridSize);
          b.gridX = newGridX;
          b.gridY = newGridY;
        });

        // 새로운 그리드의 중심 계산
        const centerGridX = Math.floor(gridSize / 2);
        const centerGridY = Math.floor((filteredCount - 1) / gridSize / 2);
        const centerHexX = centerGridX * HEX_SPACING * 1.5;
        const centerHexY =
          centerGridY * HEX_SPACING * sqrt(3) +
          ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

        // 화면 중앙에 오도록 오프셋 계산
        const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
        const { centerX, centerY } = getBubbleAreaCenter();

        // 타겟 오프셋 설정 (부드럽게 이동하도록)
        // 현재 위치에서 목표 위치로 부드럽게 이동 시작
        snapTargetX = centerX - centerHexX;
        snapTargetY = centerY - centerHexY;
        snapCompleted = false;

        // 애니메이션 시작 (즉시 시점 이동 시작)
        startAnim();

        // 정렬 시작 플래그 리셋 (한 번만 실행되도록)
        alignAfterPopStartTime = null;
      }
    }
  }

  // centerBubble 변수를 먼저 선언 (중간 단계 화면에서도 사용 가능하도록)
  let centerBubble = null;
  
  // 태그 필터링된 상태에서도 버블들이 중심 이미지 주변을 돌아다니게 하기
  // 집단이 선택된 경우 (중간 단계 화면 또는 태그 필터링된 상태)
  // hasTagFilter는 위에서 이미 선언됨
  
  if (selectedGroup) {
    // 집단이 선택된 경우: 버블은 drawGroupViewBubbles 또는 drawTagFilteredBubbles에서 처리
    // 여기서는 일반 버블 그리기 건너뛰기
  } else {
    // 일반 버블 그리기 (전체보기)
    // 버블 업데이트 및 그리기 (화면에 보이는 것만)
    // 먼저 모든 버블 업데이트하여 중앙 버블 찾기 (1차 업데이트)
    // 필터링된 버블들은 이미지 로드 상태 확인 (거리 기반 투명도는 나중에 적용)
    filteredBubbles.forEach((b) => {
      if (!b.isPopping) {
        if (b.imageIndex !== null) {
          const hasImage = bubbleImages[b.imageIndex] && bubbleImages[b.imageIndex].width > 0;
          if (hasImage) {
            // 이미지가 로드되면 페이드인 시작 (거리 기반 투명도는 나중에 적용)
            if (b.alpha < 0.01) b.alpha = 0.01; // 페이드인 시작
            // 거리 기반 투명도는 중앙 버블 찾은 후 적용되므로 여기서는 최소값만 설정
          } else {
            // 아직 로딩 시도조차 안 했으면 로딩 시도
            if (!imageLoading.has(b.imageIndex) && !imageLoaded.has(b.imageIndex)) {
              requestBubbleImage(b.imageIndex);
              // 로딩 중인 버블도 최소한 살짝 보이게 (완전 투명 X)
              if (b.alpha < 0.01) b.alpha = 0.01;
            }
            // 이미 imageLoaded에 있다 = 실패했거나, 더 이상 시도 안 할 상태
            // (실패한 경우는 error 콜백에서 imageIndex를 null로 바꿔주므로 여기 올 일이 거의 없음)
            else if (imageLoaded.has(b.imageIndex)) {
              // 방어적으로 alpha를 올려줌 (실패한 버블은 이미 imageIndex=null로 바뀌었을 것)
              if (b.alpha < 0.5) b.alpha = 0.5;
            }
          }
        } else {
          // 이미지가 없는 버블도 거리 기반 투명도 적용 대상
          // 초기값은 나중에 거리 기반으로 조정됨 (일단 1.0으로 설정)
          if (b.alpha < 0.01) b.alpha = 1.0;
        }
      }
      b._isFiltered = true;
      b.update(centerX, centerY, offsetX, offsetY, null);
      b._isFiltered = false;
    });

    // 팡 터지는 버블도 위치 업데이트 (애니메이션을 위해)
    bubbles.filter(b => b.isPopping && b.alpha > 0.01).forEach((b) => {
      b.update(centerX, centerY, offsetX, offsetY, null);
    });

    // 중앙에 가장 가까운 버블 찾기 (간소화)
    centerBubble = filteredBubbles.reduce((closest, b) => {
      const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
      const closestDist = closest ? dist(closest.pos.x, closest.pos.y, centerX, centerY) : Infinity;
      return distToCenter < closestDist ? b : closest;
    }, null);

    // 중앙 버블을 최대 크기로 부드럽게 설정 (interactionScale 사용)
    if (centerBubble) {
      // 주변보다 약간만 더 크게 (과하게 부풀지 않게)
      const targetInteractionScale = 1.05; // 5% 더 크게
      // interactionScale을 부드럽게 변화시킴 (실제 r은 update에서 계산됨)
      const interactionEase = 0.08;
      centerBubble.interactionScale = lerp(centerBubble.interactionScale, targetInteractionScale, interactionEase);
      
      // 중앙 버블로부터의 거리에 따라 투명도 조정 (바깥으로 갈수록 투명해짐)
      const centerBubbleX = centerBubble.pos.x;
      const centerBubbleY = centerBubble.pos.y;
      
      filteredBubbles.forEach((b) => {
        if (b === centerBubble || b.isPopping) return; // 중앙 버블과 팡 터지는 버블은 제외
        
        // 이미지가 로드되지 않은 버블은 투명도 조정하지 않음 (이미지가 없는 버블은 제외)
        if (b.imageIndex !== null) {
          const hasImage = bubbleImages[b.imageIndex] && bubbleImages[b.imageIndex].width > 0;
          if (!hasImage) return; // 이미지가 없으면 투명도 조정하지 않음
        }
        
        // 중앙 버블로부터의 거리 계산
        const distToCenter = dist(b.pos.x, b.pos.y, centerBubbleX, centerBubbleY);
        
        // 거리에 따라 alpha 계산 (중앙에 가까울수록 1.0, 멀어질수록 MIN_ALPHA)
        let targetAlpha;
        if (distToCenter <= CENTER_INFLUENCE_RADIUS) {
          // 중앙 근처는 완전히 불투명
          targetAlpha = 1.0;
        } else if (distToCenter >= ALPHA_FADE_RADIUS) {
          // 최대 거리 이상은 최소 투명도
          targetAlpha = MIN_ALPHA;
        } else {
          // 중간 영역은 선형 보간
          const fadeRange = ALPHA_FADE_RADIUS - CENTER_INFLUENCE_RADIUS;
          const fadeProgress = (distToCenter - CENTER_INFLUENCE_RADIUS) / fadeRange;
          targetAlpha = lerp(1.0, MIN_ALPHA, fadeProgress);
        }
        
        // 부드럽게 alpha 조정
        // 이미지가 로드된 버블 또는 이미지가 없는 버블 모두 거리 기반 투명도 적용
        b.alpha = lerp(b.alpha, targetAlpha, 0.12);
      });
      
      // 중앙 버블은 항상 완전히 불투명
      centerBubble.alpha = 1.0;
    }

    // 검색창과 네비게이션 바 영역 계산 (재사용)
    const NAV_Y = 20;
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();
    const NAV_H = navigationBar
      ? navigationBar.height * 0.315 * responsiveScale
      : 64;
    const NAV_BOTTOM = NAV_Y + NAV_H;

    if (shouldRunHeavyPass) {
      queueVisibleBubbleImages();
    }

    const { bottom: SEARCH_BOTTOM } = getSearchMetrics();

    // LOD: 보이는 버블만 수집하고 정렬 (간소화)
    const visible = bubbles
      .filter(b => {
        if (b.alpha < 0.01) return false;
        const effectiveR = b.currentRadius();
        const isOnScreen = b.pos.x + effectiveR > -50 && b.pos.x - effectiveR < width + 50 &&
                          b.pos.y + effectiveR > -50 && b.pos.y - effectiveR < height + 50;
        const bubbleTop = b.pos.y - effectiveR;
        const bubbleBottom = b.pos.y + effectiveR;
        const isInAllowedArea = bubbleTop >= SEARCH_BOTTOM - 50 && bubbleBottom <= height - 10 + 50;
        return isOnScreen && isInAllowedArea;
      })
      .map(b => {
        const dx = b.pos.x - centerX;
        const dy = b.pos.y - centerY;
        return { distSq: dx * dx + dy * dy, bubble: b };
      })
      .sort((a, b) => b.bubble.r - a.bubble.r) // 큰 버블부터
      .slice(0, MAX_DRAW)
      .filter(item => item.bubble !== centerBubble);

    // 상위 MAX_DRAW개만 그리기 (중앙 버블 제외)
    visible.forEach(item => item.bubble.draw());

    // 중앙 버블은 별도로 그리기 (이미지 -> 빛 -> 캡 순서)
    if (centerBubble) {
      const originalRadius = centerBubble.r;
      let centerPulseScale = 1.0;
      if (!ANIMATION_CONFIG.enableBreathAnim && ANIMATION_CONFIG.enableCenterPulse) {
        const t = millis() * 0.001;
        centerPulseScale = 1 + 0.03 * Math.sin(t * 1.5);
        centerBubble.r = originalRadius * centerPulseScale;
      }
      // 1. 버블 이미지/색상만 그리기 (캡 없이)
      drawCenterBubbleImage(centerBubble);
      // 2. 빛 효과 그리기 (캡과 사진 사이) - 큰 버블에 한해 프레임 분할
      if (
        ANIMATION_CONFIG.enableLightEffect &&
        centerBubble.r > 60 &&
        frameCount % ANIMATION_CONFIG.lightEffectInterval === 0
      ) {
      drawBubbleLightEffect(centerBubble);
      }
      // 3. 캡 그리기
      drawCenterBubbleCap(centerBubble);
      centerBubble.r = originalRadius;

      // 중앙 버블이 있으면 빛 효과를 위해 애니메이션 계속 실행
      startAnim();
    } else {
      // 중앙 버블이 없고 모든 움직임이 멈췄으면 애니메이션 정지
      // 단, 모달이 열려있으면 애니메이션 계속 실행
      const showModal = uiStateManager ? uiStateManager.showModal : false;
      if (
      !IS_MOBILE &&
        ANIMATION_CONFIG.allowIdlePause &&
        snapTargetX === null &&
        snapTargetY === null &&
        abs(panVelocityX) < 0.1 &&
        abs(panVelocityY) < 0.1 &&
        !isDragging &&
        !showModal
      ) {
        stopAnim();
      } else if (showModal || !ANIMATION_CONFIG.allowIdlePause) {
        // 모달이 열려있으면 애니메이션 계속 실행
        startAnim();
      }
    }
  }
  
  // 태그 필터링된 상태나 중간 단계 화면일 때는 애니메이션 계속 실행
  if (hasTagFilter || showGroupView) {
    startAnim();
  }

  if (shouldRunHeavyPass) {
    vignette();
  }

  // orbitInfoAlpha 애니메이션 업데이트
  const shouldShowInfo = selectedOrbitBubble && hasTagFilter && !isOrbitInfoFadingOut;
  if (shouldShowInfo) {
    // 표시해야 할 때는 alpha를 1로 증가
    orbitInfoAlpha = lerp(orbitInfoAlpha, 1.0, 0.15);
  } else if (selectedOrbitBubble) {
    // selectedOrbitBubble이 있지만 표시하지 않아야 할 때 (태그/그룹 뷰 종료 등)
    // alpha를 0으로 감소 (페이드아웃 애니메이션)
    orbitInfoAlpha = lerp(orbitInfoAlpha, 0.0, 0.15);
    // alpha가 거의 0이 되면 selectedOrbitBubble을 null로 설정하고 페이드아웃 상태 초기화
    if (orbitInfoAlpha < 0.01) {
      selectedOrbitBubble = null;
      orbitInfoAlpha = 0.0;
      isOrbitInfoFadingOut = false;
    }
  } else {
    // selectedOrbitBubble이 null일 때는 alpha를 0으로 유지
    orbitInfoAlpha = lerp(orbitInfoAlpha, 0.0, 0.15);
    isOrbitInfoFadingOut = false;
  }

  // 카테고리/태그 선택 시 회전하는 버블 정보 표시 (가장 먼저 그려서 카테고리와 오버레이 뒤에 위치)
  // selectedOrbitBubble이 있고 alpha가 0보다 크면 표시 (페이드아웃 중에도 표시)
  if (selectedOrbitBubble && orbitInfoAlpha > 0.01) {
    // 선택된 버블의 현재 위치 찾기 (orbitBubblePositions에서 찾거나, 없으면 버블의 실제 위치 사용)
    const bubblePos = orbitBubblePositions.find(p => p.bubble === selectedOrbitBubble);
    if (bubblePos) {
      // 버블 바로 아래에 정보 표시 (버블과 함께 움직임)
      drawOrbitBubbleInfo(selectedOrbitBubble, bubblePos.x, bubblePos.y, bubblePos.r);
    } else if (selectedOrbitBubble.pos) {
      // orbitBubblePositions에 없어도 버블의 실제 위치를 사용 (버블이 화면 밖에 있어도)
      drawOrbitBubbleInfo(selectedOrbitBubble, selectedOrbitBubble.pos.x, selectedOrbitBubble.pos.y, selectedOrbitBubble.r);
    }
  }

  // 중간 단계 화면 표시 (버블 위에 오버레이)
  // 태그가 선택되어 있어도 중간 단계 화면은 계속 표시
  let bubblesAbove = []; // 위쪽 버블들 (중심 이미지 뒤에 그려야 함)
  
  if (selectedGroup) {
    // 태그가 선택된 경우에만 버블 표시 (카테고리만 클릭했을 때는 버블 안 보임)
    if (hasTagFilter) {
      // 태그 필터링된 상태: 해당 태그의 버블만 중심 이미지 주변에 배치
      // 아래쪽 버블은 이미 그려지고, 위쪽 버블은 반환받음
      bubblesAbove = drawTagFilteredBubbles(selectedTag, selectedGroup) || [];
    }
    // else 블록 제거: 카테고리만 클릭했을 때는 버블을 그리지 않음
    
    // 중간 단계 화면 그리기 (태그 선택 여부와 관계없이 항상 표시)
    drawGroupView(selectedGroup);
    
    // 위쪽 버블 그리기 (중심 이미지 뒤) - 태그가 선택된 경우에만
    bubblesAbove.forEach(({ bubble, x, y }) => {
      bubble.drawAt(x, y);
    });
  }

  // 토글이 열려있을 때 배경 어둡게 (카테고리 외 화면) - 글자들 뒤에 그려서 글자들을 가림
  if (showToggles) {
    push();
    fill(0, 0, 0, 180); // 어두운 오버레이 (더 어둡게)
    noStroke();
    rect(0, 0, width, height);
    pop();
  }

  // 검색창과 네비게이션 바를 가장 위에 그리기 (버블 위에 표시)
  drawNavBar();
  drawSearchBar();

  // 토글 표시
  if (showToggles) {
    drawToggles();
  }

  if (centerBubble && !showGroupView && !showToggles) {
    drawCenterBubbleInfo(centerBubble);
  }

}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  rebuildWorldMetrics(); // 월드 메트릭스 재계산
  redrawBackgroundBuffer(); // 배경 버퍼 재생성
  buildBubbles(); // 버블 재생성
  initToggleButtons(); // 토글 버튼 재초기화

  // 네비게이션 바 고해상도 버퍼 재생성 (화면 크기 변경 시)
  if (navigationBar) {
    // 반응형 스케일 계산 (헬퍼 함수 사용)
    const responsiveScale = getResponsiveScale();

    const NAV_W = navigationBar.width * 0.455 * responsiveScale;
    const NAV_H = navigationBar.height * 0.455 * responsiveScale;
    const scaleFactor = 2;
    navBarBuffer = recreateGraphicsBuffer(
      navBarBuffer,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
    navBarBuffer.imageMode(CORNER);
    navBarBuffer.image(
      navigationBar,
      0,
      0,
      NAV_W * scaleFactor,
      NAV_H * scaleFactor
    );
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
  const NAV_Y = 20;
  const NAV_H = navigationBar ? navigationBar.height * 0.315 * responsiveScale : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;
  const W = width * SEARCH_WIDTH_RATIO * responsiveScale * 1.3;
  const H = 75 * SEARCH_SCALE * responsiveScale * 1.3;
  const X = (width - W) / 2;
  const Y = NAV_BOTTOM + SEARCH_NAV_GAP * responsiveScale;
  return { W, H, X, Y, bottom: Y + H };
}

// 버블 영역 중심 계산 헬퍼 (중복 제거)
function getBubbleAreaCenter(offsetY = -70) {
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
  const BUBBLE_AREA_BOTTOM = height - 10;
  const BUBBLE_AREA_CENTER = BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;
  return {
    centerX: width * CENTER_X_RATIO,
    centerY: BUBBLE_AREA_CENTER + offsetY,
    BUBBLE_AREA_CENTER,
  };
}

// 마이크 아이콘 위치/크기 계산 헬퍼 (중복 제거)
function getMicIconRect() {
  const responsiveScale = getResponsiveScale();
  const { W, H, X, Y } = getSearchMetrics();

  const iconSize = 40 * SEARCH_SCALE * responsiveScale * 1.5 * 1.3 * 4 * 0.7;
  const iconX = X + (W - iconSize) / 2;
  const iconY = Y + (H - iconSize) / 2 + 20;
  const iconCenterX = iconX + iconSize / 2;
  const iconCenterY = iconY + iconSize / 2;
  const iconRadius = iconSize / 2;

  return { iconX, iconY, iconSize, iconCenterX, iconCenterY, iconRadius };
}

// 태그 필터링된 버블 클릭 감지 함수
function checkOrbitBubbleClick(x, y) {
  if (orbitBubblePositions.length === 0) return null;
  
  // 클릭 위치에서 가장 가까운 버블 찾기
  let clickedBubble = null;
  let minDist = Infinity;
  
  orbitBubblePositions.forEach(({ bubble, x: bubbleX, y: bubbleY, r }) => {
    // 클릭 위치와 버블 중심 사이의 거리
    const distToBubble = dist(x, y, bubbleX, bubbleY);
    
    // 버블 반지름 내에 클릭이 있는지 확인
    if (distToBubble <= r && distToBubble < minDist) {
      minDist = distToBubble;
      clickedBubble = bubble;
    }
  });
  
  return clickedBubble;
}

// 버블 클릭 감지 함수
function checkBubbleClick(x, y) {
  if (!bubbleManager) return;
  
  const bubbles = bubbleManager.bubbles;
  const currentFilteredBubbles = bubbleManager.currentFilteredBubbles || [];
  const bubblesToCheck = currentFilteredBubbles.length > 0 ? currentFilteredBubbles : bubbles;
  
  // 현재 화면 상태 확인
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  
  // 중간 단계 화면이나 태그 필터링된 상태에서는 버블 클릭 감지 안 함
  if (showGroupView || selectedTag) return;
  
  // 중심 위치 계산 (snapToCenterBubble과 동일)
  const { centerX, centerY } = getBubbleAreaCenter();
  
  const offsetX = panController ? panController.offsetX : 0;
  const offsetY = panController ? panController.offsetY : 0;
  
  // 모든 버블 업데이트하여 현재 화면 위치 계산
  bubblesToCheck.forEach((b) => {
    b.update(centerX, centerY, offsetX, offsetY, null);
  });
  
  // 클릭 위치에서 가장 가까운 버블 찾기
  let clickedBubble = null;
  let minDist = Infinity;
  
  bubblesToCheck.forEach((b) => {
    // 버블이 화면에 보이는지 확인
    if (b.alpha < 0.01) return;
    
    // 클릭 위치와 버블 중심 사이의 거리
    const distToBubble = dist(x, y, b.pos.x, b.pos.y);
    
    // 버블 반지름 내에 클릭이 있는지 확인
    if (distToBubble <= b.r && distToBubble < minDist) {
      minDist = distToBubble;
      clickedBubble = b;
    }
  });
  
  // 클릭된 버블 정보 출력
  if (clickedBubble) {
    const bubbleInfo = clickedBubble.imageIndex !== null && bubbleData && bubbleData[clickedBubble.imageIndex]
      ? bubbleData[clickedBubble.imageIndex]
      : null;
    
    log("=== 버블 클릭 감지 ===");
    log("버블 인덱스:", clickedBubble.imageIndex);
    log("버블 위치:", { x: clickedBubble.pos.x, y: clickedBubble.pos.y });
    log("버블 반지름:", clickedBubble.r);
    log("클릭 위치:", { x, y });
    log("클릭 거리:", minDist);
    if (bubbleInfo) {
      log("버블 제목:", bubbleInfo.title);
      log("버블 태그:", bubbleInfo.tags);
      log("버블 속성:", bubbleInfo.attributes);
    } else {
      log("버블 데이터: 없음 (imageIndex:", clickedBubble.imageIndex, ")");
    }
    log("====================");
  }
}

// 중앙 버블을 화면 중앙에 고정하는 함수 (타겟만 설정)
function snapToCenterBubble() {
  const { centerX, centerY } = getBubbleAreaCenter();

  // 필터링된 버블만 사용 (없으면 모든 버블 사용)
  const currentFilteredBubbles = bubbleManager
    ? bubbleManager.currentFilteredBubbles
    : [];
  const bubbles = bubbleManager ? bubbleManager.bubbles : [];
  const offsetX = panController ? panController.offsetX : 0;
  const offsetY = panController ? panController.offsetY : 0;
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
    if (panController) {
      panController.snapTargetX = targetOffsetX;
      panController.snapTargetY = targetOffsetY;
    }

    // 애니메이션 시작
    startAnim();
  }
}

function buildBubbles() {
  if (bubbleManager) {
    bubbleManager.build();

    // 초기 오프셋을 중앙 버블이 화면 중앙에 오도록 설정
    const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
    const centerGridX = Math.floor(gridSize / 2);
    const centerGridY = Math.floor(gridSize / 2);
    const centerHexX = centerGridX * HEX_SPACING * 1.5;
    const centerHexY =
      centerGridY * HEX_SPACING * sqrt(3) +
      ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    if (panController) {
      panController.offsetX = width * CENTER_X_RATIO - centerHexX;
      panController.offsetY = height * CENTER_Y_RATIO - centerHexY;
    }
  }
}

// ---------- POINTER EVENTS (통합 입력 처리) ----------
// 포인터 이벤트 핸들러 (마우스, 터치, 펜 모두 지원)
function handlePointerDown(x, y, pointerId) {
  // 검색창 클릭 확인 (모든 씬에서 항상 먼저 확인 - mike 버튼은 항상 작동)
  const isSearchBarClick = checkSearchBarClick(x, y);
  
  // 검색창 클릭 처리 (어떤 씬에서든 작동)
  if (isSearchBarClick) {
    // 검색창 클릭 시 항상 전체보기로 전환하고 토글 열기
    if (uiStateManager && uiStateManager.selectedToggles.length > 0) {
      toggleSelect(0); // 전체보기로 전환
    }
    if (uiStateManager) {
      uiStateManager.showToggles = true; // 토글 항상 열기
      // 중간 단계 화면이 열려있으면 닫기
      if (uiStateManager.showGroupView) {
        uiStateManager.backToMainView();
      }
    }
    startAnim();
    return true; // 이벤트 처리됨
  }

  // 중간 단계 화면 클릭 처리
  if (uiStateManager && uiStateManager.showGroupView && uiStateManager.selectedGroup) {
    // 태그 클릭 확인
    const clickedTag = checkTagClick(x, y, uiStateManager.selectedGroup);
    if (clickedTag) {
      const isSameTag = uiStateManager.selectedTag === clickedTag;
      if (isSameTag) {
        // 같은 태그를 다시 클릭하면 선택 해제 후 메인 이미지만 표시
        uiStateManager.selectedTag = null;
        resetOrbitBubbleInfo();
      } else {
        // 새로운 태그 선택
        uiStateManager.selectTag(clickedTag);
        uiStateManager.selectedToggles = [uiStateManager.selectedGroup];
      }
      startAnim();
      return true;
    }

    // 태그가 아직 선택되지 않았다면 다른 영역 클릭은 무시
    if (!uiStateManager.selectedTag) {
      return true;
    }
  }

  // 검색창이 아닌 곳을 클릭하면 input 비활성화하여 드래그 확보
  // 토글이 열려있으면 토글 클릭 확인
  if (uiStateManager && uiStateManager.showToggles) {
    const clickedToggle = checkToggleClick(x, y);
    if (clickedToggle !== null) {
      // 토글 클릭 시 바로 적용
      toggleSelect(clickedToggle);
      return true; // 이벤트 처리됨
    }
    // 토글 외부 클릭 시 닫기
    if (!isSearchBarClick) {
      uiStateManager.showToggles = false;
    }
  }

  startAnim(); // 애니메이션 시작

  // 패닝 컨트롤러 사용 (중간 단계에서도 활성화)
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  
  // 버블 회전 제어 시도 (태그 필터링 또는 그룹 뷰가 활성화된 경우)
  if (showGroupView || selectedTag) {
    // 회전 제어 영역 내에서 드래그 시작 시도
    if (handleRotationStart(x, y)) {
      // 회전 제어가 시작되었으면 패닝은 시작하지 않음
      return false;
    }
    
    // 중간 단계에서 버블 클릭 감지 (길게 누르기용)
    const hoveredBubble = checkOrbitBubbleClick(x, y);
    if (hoveredBubble) {
      // 버블을 길게 누르기 시작
      longPressState.pressedBubble = hoveredBubble;
      longPressState.pressStartTime = millis();
      longPressState.isPressing = false;
    }
  }
  
  if (panController) {
    panController.startDrag(x, y);
  }

  return false; // 드래그 시작, 기본 동작 허용
}

function handlePointerMove(x, y, pointerId) {
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  
  // 버블 회전 제어가 활성화되어 있으면 회전 처리
  if (bubbleRotationState.isDragging) {
    startAnim(); // 애니메이션 시작
    handleRotationDrag(x, y);
    return; // 회전 제어 중이면 패닝은 처리하지 않음
  }
  
  // 중간 단계에서도 패닝 활성화
  if (panController && panController.isDragging) {
    startAnim(); // 애니메이션 시작
    panController.updateDrag(x, y);
  }
  
  // 길게 누르기 상태 업데이트
  if (longPressState.pressedBubble && longPressState.pressStartTime) {
    const elapsed = millis() - longPressState.pressStartTime;
    if (elapsed > 300 && !longPressState.isPressing) {
      // 300ms 이상 누르고 있으면 정보 표시
      longPressState.isPressing = true;
    }
  }
}

function handlePointerUp(x, y, pointerId) {
  // 버블 회전 제어 종료
  if (bubbleRotationState.isDragging) {
    const didRotationDrag = bubbleRotationState.didDrag;
    handleRotationEnd();
    if (didRotationDrag) {
      return; // 실제 드래그가 있었다면 클릭 처리 중단
    }
    // 드래그가 없었다면 클릭으로 간주하고 아래 로직 계속 진행
  }
  
  // 카테고리/태그 선택 시 회전하는 버블 클릭 감지
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  const selectedGroup = uiStateManager ? uiStateManager.selectedGroup : null;
  
  // 카테고리 선택 시 또는 태그 선택 시 버블 클릭 감지
  if (showGroupView || selectedTag) {
    const clickedBubble = checkOrbitBubbleClick(x, y);
    if (clickedBubble) {
      // 같은 버블을 다시 클릭하면 설명 숨기기, 다른 버블 클릭하면 설명 표시
      if (selectedOrbitBubble === clickedBubble) {
        isOrbitInfoFadingOut = true;
      } else {
        selectedOrbitBubble = clickedBubble;
        orbitInfoAlpha = 0.0; // 0에서 시작하여 서서히 나타남
        isOrbitInfoFadingOut = false;
      }
      startAnim();
      return;
    }
  }
  
  // 버블 클릭 감지 및 디버깅 (드래그 여부와 관계없이 항상 확인)
  checkBubbleClick(x, y);
  
  if (!panController || !panController.isDragging) return;

  // 패닝 컨트롤러 사용
  panController.endDrag();

  // 드래그가 끝난 직후 바로 중앙 버블로 스냅
  // 관성이 시작되기 전에 스냅하여 버블이 흐르지 않도록 함
  snapToCenterBubble();

  // 관성은 draw()에서 처리됨
}

// ---------- UI helpers ----------
function drawNavBar() {
  const metrics = getNavMetrics();
  if (!metrics) return;

  const { BUTTON_W, BUTTON_H, NAV_W, NAV_H, Y, navBarX } = metrics;

  // 캡쳐 버튼 - 왼쪽 끝
  imageMode(CORNER);
  image(captureButton, 0, Y, BUTTON_W, BUTTON_H);

  // 워크룸 버튼 - 오른쪽 끝
  image(workroomButton, width - BUTTON_W, Y, BUTTON_W, BUTTON_H);

  // 네비게이션 바 - 중앙에 배치 (두 버튼 사이)
  // 화질 개선: 고해상도 버퍼 사용 (setup에서 미리 생성)
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

// 네비게이션 바 메트릭 헬퍼 (중복 제거)
function getNavMetrics() {
  if (!captureButton || !workroomButton || !navigationBar) return null;
  
  const responsiveScale = getResponsiveScale();
  const BUTTON_W = captureButton.width * 0.56 * responsiveScale;
  const BUTTON_H = captureButton.height * 0.56 * responsiveScale;
  const NAV_W = navigationBar.width * 0.455 * responsiveScale;
  const NAV_H = navigationBar.height * 0.455 * responsiveScale;
  const Y = 20;
  const navBarX = (width - NAV_W) / 2;
  
  return { BUTTON_W, BUTTON_H, NAV_W, NAV_H, Y, navBarX };
}

// 네비게이션 바 클릭 확인 (실제 네비게이션 바 이미지 영역만)
function checkNavBarClick(x, y) {
  const metrics = getNavMetrics();
  if (!metrics) return false;

  const { BUTTON_W, BUTTON_H, NAV_W, NAV_H, Y, navBarX } = metrics;

  // 네비게이션 바 이미지 영역만 클릭 가능하도록 제한
  // 버튼 영역은 제외하고 네비게이션 바 이미지가 실제로 그려지는 영역만 확인
  // 위아래로 50%만 인식 (중앙 50% 영역)
  const NAV_H_50 = NAV_H * 0.5; // 높이의 50%
  const NAV_Y_CENTER = Y + NAV_H * 0.25; // 상단 25% 지점부터 시작
  const NAV_Y_BOTTOM = NAV_Y_CENTER + NAV_H_50; // 상단 25% + 50% = 75% 지점까지

  const isInNavBarArea =
    x >= navBarX &&
    x <= navBarX + NAV_W &&
    y >= NAV_Y_CENTER &&
    y <= NAV_Y_BOTTOM;
  const isInLeftButton = x >= 0 && x <= BUTTON_W && y >= Y && y <= Y + BUTTON_H;
  const isInRightButton =
    x >= width - BUTTON_W && x <= width && y >= Y && y <= Y + BUTTON_H;

  // 네비게이션 바 영역이면서 버튼 영역이 아닌 경우만 true
  return isInNavBarArea && !isInLeftButton && !isInRightButton;
}

// 글래스모피즘 스타일 모달 그리기
function drawSearchBar() {
  const responsiveScale = getResponsiveScale();
  const { W, H, X, Y } = getSearchMetrics();

  // UI 상태 가져오기
  const showToggles = uiStateManager ? uiStateManager.showToggles : false;
  const selectedToggles = uiStateManager ? uiStateManager.selectedToggles : [];

  // 마이크 아이콘 - 중앙에 배치 (크기 3배 * 2배 = 6배, 화질 개선)
  if (mikeIcon) {
    const { iconX, iconY, iconSize, iconCenterX, iconCenterY, iconRadius } = getMicIconRect();
    imageMode(CORNER);

    if (ANIMATION_CONFIG.enableMicGlow) {
    // 마이크 아이콘 뒤에 깜빡이는 빛 효과 (펄스 효과)
    push();
    drawingContext.save();
    
    // 시간에 따른 펄스 효과 (1.5초 주기)
    const pulseTime = (millis() / 1500) % 1; // 0~1 사이 값
    // 부드러운 펄스: sin 함수 사용 (0~1 사이 값)
    const pulseValue = (Math.sin(pulseTime * Math.PI * 2) + 1) / 2; // 0~1 사이 값
    
    // 최소 밝기와 최대 밝기 설정 (0.3 ~ 0.9)
    const minBrightness = 0.3;
    const maxBrightness = 0.9;
    const pulseBrightness = lerp(minBrightness, maxBrightness, pulseValue);
    
    // 빛 효과 그리기 (아이콘 뒤에) - 더 좁고 하얀 빛
    drawingContext.globalAlpha = pulseBrightness;
    const glowRadius = iconRadius * 1.2; // 더 좁게 (1.8 -> 1.2)
    const glowGradient = drawingContext.createRadialGradient(
      iconCenterX,
      iconCenterY,
      iconRadius * 0.2,
      iconCenterX,
      iconCenterY,
      glowRadius
    );
    // 하얀 빛으로 변경
    glowGradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    glowGradient.addColorStop(0.3, "rgba(255, 255, 255, 0.6)");
    glowGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.3)");
    glowGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    drawingContext.fillStyle = glowGradient;
    drawingContext.beginPath();
    drawingContext.arc(iconCenterX, iconCenterY, glowRadius, 0, Math.PI * 2);
    drawingContext.fill();
    
    drawingContext.restore();
    pop();
    }

    // 화질 개선 설정
    push();
    drawingContext.save();
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";

    tint(255, 255, 255, 200); // rgba(255,255,255,0.78) 효과
    image(mikeIcon, iconX, iconY, iconSize, iconSize);
    noTint(); // tint 효과 제거

    drawingContext.restore();
    pop();
  }

  // 선택된 토글이 있으면 마이크 아래에 텍스트 표시
  if (!showToggles) {
    push();
    drawingContext.save();
    
    // 텍스트 렌더링 품질 개선
    drawingContext.textBaseline = "top";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    
    noStroke();
    textAlign(CENTER, TOP); // 가로 중앙, 세로 상단 정렬

    if (pretendardFont) {
      textFont(pretendardFont);
    }

    // 마이크 아래 텍스트 제거 (카테고리 선택 후 표시되던 텍스트 완전히 제거)
  }
}

// 검색창 클릭 확인 (마이크 이미지 영역만)
function checkSearchBarClick(x, y) {
  const { iconX, iconY, iconSize } = getMicIconRect();

  // 클릭 영역을 실제 이미지보다 약간 작게 설정 (오클릭 방지)
  const clickPadding = iconSize * 0.1; // 10% 여백 제거
  const clickSize = iconSize - clickPadding * 2;
  const clickX = iconX + clickPadding;
  const clickY = iconY + clickPadding;

  // 마이크 이미지 영역만 클릭 가능하도록 제한 (조정된 크기)
  return (
    x >= clickX && x <= clickX + clickSize && y >= clickY && y <= clickY + clickSize
  );
}

// 토글 클릭 확인
function checkToggleClick(x, y) {
  const showToggles = uiStateManager ? uiStateManager.showToggles : false;
  if (!showToggles) return null;
  
  // 버튼이 초기화되지 않았으면 초기화
  if (toggleButtons.length === 0) {
    initToggleButtons();
  }
  
  // 토글 클릭 확인
  for (let i = 0; i < toggleButtons.length; i++) {
    const button = toggleButtons[i];
    if (i === 0) {
      // 전체보기는 높이를 40px로 제한
      if (x >= button.x && x <= button.x + button.width &&
          y >= button.y && y <= button.y + 40) {
        return i;
      }
    } else if (button.contains(x, y)) {
      return i;
    }
  }
  return null;
}

// 토글 선택/해제 (한 번에 하나만 선택 가능)
function toggleSelect(toggleIndex) {
  if (!uiStateManager || !bubbleManager || !panController) return;

  const bubbles = bubbleManager.bubbles;
  const selectedToggles = uiStateManager.selectedToggles;
  const previousSelectedToggles = uiStateManager.previousSelectedToggles;

  // toggleIndex: 0 = 전체 보기, 1~5 = 각 카테고리
  if (toggleIndex === 0) {
    // 전체 보기 선택
    uiStateManager.previousSelectedToggles = [...selectedToggles]; // 이전 선택 저장
    uiStateManager.selectedToggles = [];
    // 중간 단계 화면 닫기
    uiStateManager.backToMainView();
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
    bubbleManager.currentFilteredBubbles = bubbles;

    // 원래 그리드의 중심으로 정렬
    const centerGridX = Math.floor(gridSize / 2);
    const centerGridY = Math.floor(gridSize / 2);
    const centerHexX = centerGridX * HEX_SPACING * 1.5;
    const centerHexY =
      centerGridY * HEX_SPACING * sqrt(3) +
      ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    const { centerX, centerY } = getBubbleAreaCenter(-20);

    panController.snapTargetX = centerX - centerHexX;
    panController.snapTargetY = centerY - centerHexY;
    panController.snapCompleted = false;
  } else {
    // 카테고리 선택 (1~5를 1~5로 매핑)
    const categoryIndex = toggleIndex; // 1~5

    // 같은 카테고리를 다시 클릭하면 선택 해제 (전체보기로 돌아가기)
    if (uiStateManager.selectedGroup === categoryIndex && !uiStateManager.selectedTag) {
      // 전체보기로 전환
      toggleSelect(0);
      return;
    }

    // 중간 단계 화면으로 이동
    uiStateManager.showGroupSelection(categoryIndex);
    startAnim();
    return; // 여기서 종료하여 버블 필터링하지 않음

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

    // 팡 터지는 애니메이션이 완료된 후 0.3초 뒤에 정렬 시작하도록 설정
    // 팡 터지는 버블이 있는지 확인
    const hasPoppingBubbles = bubbles.some((b) => b.isPopping);
    if (hasPoppingBubbles) {
      // 팡 터지는 버블이 있으면 팡 터짐 완료 후 정렬 시작 시간 설정
      alignAfterPopStartTime = millis();
    } else {
      // 팡 터지는 버블이 없으면 바로 정렬
      alignAfterPopStartTime = millis() - 1000; // 이미 지난 시간으로 설정하여 바로 실행
    }
  }

  // 토글 닫기
  showToggles = false;

  // 버블 정렬 (버블이 이동하면서 정렬되도록)
  startAnim(); // 필터링 업데이트를 위해 애니메이션 시작
}

// 토글 버튼 초기화
// 토글 버튼 상수
const TOGGLE_LABELS = [
    "전체 보기",
    "여행자의 취향만 모아보고 싶어",
    "20대 여성의 취향만 모아보고 싶어",
    "50대 남성의 취향만 모아보고 싶어",
    "주부들의 취향만 모아보고 싶어",
    "10대 여성의 취향만 모아보고 싶어",
  ];
  
// 토글 레이아웃 계산 헬퍼 (중복 제거)
function getToggleLayout() {
  const toggleWidth = 300;
  const toggleHeight = 50;
  const toggleX = (width - toggleWidth) / 2;
  const startY = 220;
  const spacing = 60;
  const radius = 16;
  return { toggleWidth, toggleHeight, toggleX, startY, spacing, radius };
}
  
function initToggleButtons() {
  const { toggleWidth, toggleHeight, toggleX, startY, spacing, radius } = getToggleLayout();
  
  toggleButtons = TOGGLE_LABELS.map((label, i) => {
    const toggleY = startY + i * spacing;
    return new ToggleButton(label, i, toggleX, toggleY, toggleWidth, toggleHeight, radius);
  });
}

// 토글 UI 그리기
function drawToggles() {
  const showToggles = uiStateManager ? uiStateManager.showToggles : false;
  const selectedToggles = uiStateManager ? uiStateManager.selectedToggles : [];
  if (!showToggles) return;
  
  // 버튼이 초기화되지 않았으면 초기화
  if (toggleButtons.length === 0) {
    initToggleButtons();
  }
  
  push();
  drawingContext.save();
  
  // 배경 오버레이는 draw()에서 이미 그려지므로 여기서는 제거
  
  // 버튼 그리기
  toggleButtons.forEach(button => button.draw(selectedToggles));
  
  drawingContext.restore();
  pop();
}

function resetOrbitBubbleState() {
  if (!bubbleManager || !bubbleManager.bubbles) return;
  bubbleManager.bubbles.forEach((bubble) => {
    if (bubble.isInOrbit) {
      bubble.isInOrbit = false;
      bubble.orbitContextKey = null;
    }
  });
}

function ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey) {
  if (!bubble) return false;
  const contextChanged = bubble.orbitContextKey !== orbitContextKey;
  if (!bubble.isInOrbit || contextChanged) {
    bubble.baseRadius = targetBaseR;
    bubble.r = targetBaseR;
    bubble.interactionScale = 1.0;
    bubble.isInOrbit = true;
    bubble.orbitContextKey = orbitContextKey;
    return true;
  }
  return false;
}

// 오비트 버블 그리기 공통 함수 (drawTagFilteredBubbles와 drawGroupViewBubbles 통합)
function drawOrbitBubbles({ bubbles, orbitContextKey, filterFn }) {
  if (!bubbles || bubbles.length === 0) return [];
  
  const targetBubbles = bubbles.filter(filterFn);
  if (targetBubbles.length === 0) return [];
  
  const { imageX, imageY, imageSize } = getOrbitCenterMetrics();
  const centerRadius = imageSize / 2;
  const minOrbitRadius = centerRadius + 100;
  const maxOrbitRadius = min(width, height) * 0.45;
  const baseTime = bubbleRotationState.rotationAngle;
  const tiltAngle = Math.PI / 5;
  const orbitTilt = Math.cos(tiltAngle) * 0.85;
  const orbitStretch = 1.3;
  
  const totalBubbles = targetBubbles.length;
  const isMobile = IS_MOBILE;
  const maxVisibleBubbles = isMobile ? 30 : totalBubbles;
  const visibleCount = Math.min(totalBubbles, maxVisibleBubbles);
  const angleStep = totalBubbles > 0 ? (Math.PI * 2) / totalBubbles : 0;
  
  const bubblesBelow = [];
  const bubblesAbove = [];
  orbitBubblePositions = [];
  
  for (let i = 0; i < visibleCount; i++) {
    const bubble = targetBubbles[i];
    const angleOffset = i * angleStep;
    const currentAngle = baseTime + angleOffset;
    const radiusVariation = 0.4 + (i % 3) * 0.15;
    const orbitRadius = minOrbitRadius + (maxOrbitRadius - minOrbitRadius) * radiusVariation;
    const zDepth = Math.sin(currentAngle);
    const smoothZ = zDepth * zDepth * (3 - 2 * zDepth);
    const depthAlpha = 0.7 + (smoothZ + 1) * 0.15;
    const bubbleX = imageX + Math.cos(currentAngle) * orbitRadius * orbitStretch;
    const bubbleY = imageY + Math.sin(currentAngle) * orbitRadius * orbitTilt;
    const zOffsetY = smoothZ * 20;
    const finalY = bubbleY + zOffsetY;
    const frontFactor = (Math.sin(currentAngle) + 1) / 2;
    const MIN_R = 50;
    const MAX_R = 85;
    const targetBaseR = lerp(MIN_R, MAX_R, frontFactor);
    
    const justSynced = ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey);
    const baseEase = justSynced ? 1.0 : 0.15;
    bubble.baseRadius = lerp(bubble.baseRadius, targetBaseR, baseEase);
    
    const t = millis() * 0.001;
    const breathSpeed = 0.5 + (bubble.hueSeed % 7) * 0.1;
    const breath = sin(t * breathSpeed + (bubble.pulseOffset || 0));
    const breathFactor = map(breath, -1, 1, 0.95, 1.05);
    const noiseOffset = bubble.noiseOffset || (bubble.hueSeed * 100);
    const n = noise(noiseOffset + t * 0.2);
    const noiseFactor = map(n, 0, 1, 0.97, 1.03);
    
    if (!bubble.interactionScale) bubble.interactionScale = 1.0;
    bubble.r = bubble.baseRadius * breathFactor * noiseFactor * bubble.interactionScale;
    bubble.pos.set(bubbleX, finalY);
    bubble.alpha = depthAlpha;
    
    orbitBubblePositions.push({ bubble, x: bubbleX, y: finalY, r: bubble.r });
    
    if (finalY < imageY) {
      bubblesBelow.push({ bubble, x: bubbleX, y: finalY });
    } else {
      bubblesAbove.push({ bubble, x: bubbleX, y: finalY });
    }
  }
  
  bubblesBelow.forEach(({ bubble, x, y }) => bubble.drawAt(x, y));
  return bubblesAbove;
}

// 태그 필터링된 상태에서 중심 이미지 주변에 관련 버블 그리기
function drawOrbitBubbles({ bubbles, filterFn, orbitContextKey }) {
  if (!bubbles || bubbles.length === 0) return;

  const targetBubbles = typeof filterFn === "function" ? bubbles.filter(filterFn) : bubbles;
  if (targetBubbles.length === 0) return;

  const { centerX, centerY, imageX, imageY, imageSize } = getOrbitCenterMetrics();
  const centerRadius = imageSize / 2;
  const minOrbitRadius = centerRadius + 100;
  const maxOrbitRadius = min(width, height) * 0.45;
  const baseTime = bubbleRotationState.rotationAngle;
  const tiltAngle = Math.PI / 5;
  const orbitTilt = Math.cos(tiltAngle) * 0.85;
  const orbitStretch = 1.3;
  const totalBubbles = targetBubbles.length;
  const isMobile = IS_MOBILE;
  const maxVisibleBubbles = isMobile ? 30 : totalBubbles;
  const visibleCount = Math.min(totalBubbles, maxVisibleBubbles);
  const angleStep = totalBubbles > 0 ? (Math.PI * 2) / totalBubbles : 0;
  
  const bubblesBelow = [];
  const bubblesAbove = [];
  orbitBubblePositions = [];
  
  for (let i = 0; i < visibleCount; i++) {
    const bubble = targetBubbles[i];
    const currentAngle = baseTime + i * angleStep;

    const radiusVariation = 0.4 + (i % 3) * 0.15;
    const orbitRadius = minOrbitRadius + (maxOrbitRadius - minOrbitRadius) * radiusVariation;
    const zDepth = Math.sin(currentAngle);
    const smoothZ = zDepth * zDepth * (3 - 2 * zDepth);
    const depthAlpha = 0.7 + (smoothZ + 1) * 0.15;
    const bubbleX = imageX + Math.cos(currentAngle) * orbitRadius * orbitStretch;
    const bubbleY = imageY + Math.sin(currentAngle) * orbitRadius * orbitTilt;
    const finalY = bubbleY + smoothZ * 20;

    const frontFactor = (Math.sin(currentAngle) + 1) / 2;
    const MIN_R = 50;
    const MAX_R = 85;
    const targetBaseR = lerp(MIN_R, MAX_R, frontFactor);
    const justSynced = ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey);
    const baseEase = justSynced ? 1.0 : 0.15;
    bubble.baseRadius = lerp(bubble.baseRadius, targetBaseR, baseEase);
    
    const t = millis() * 0.001;
    const breathSpeed = 0.5 + (bubble.hueSeed % 7) * 0.1;
    const breath = sin(t * breathSpeed + (bubble.pulseOffset || 0));
    const breathFactor = map(breath, -1, 1, 0.95, 1.05);
    const noiseOffset = bubble.noiseOffset || bubble.hueSeed * 100;
    const n = noise(noiseOffset + t * 0.2);
    const noiseFactor = map(n, 0, 1, 0.97, 1.03);
    
    if (!bubble.interactionScale) bubble.interactionScale = 1.0;
    bubble.r = bubble.baseRadius * breathFactor * noiseFactor * bubble.interactionScale;
    bubble.pos.set(bubbleX, finalY);
    bubble.alpha = depthAlpha;

    orbitBubblePositions.push({ bubble, x: bubbleX, y: finalY, r: bubble.r });

    if (finalY < imageY) {
      bubblesBelow.push({ bubble, x: bubbleX, y: finalY });
    } else {
      bubblesAbove.push({ bubble, x: bubbleX, y: finalY });
    }
  }
  
  bubblesBelow.forEach(({ bubble, x, y }) => bubble.drawAt(x, y));
  return bubblesAbove;
}

function drawTagFilteredBubbles(selectedTag, groupIndex) {
  if (!bubbleManager) return;
  const { bubbles } = bubbleManager;

  const filterFn = (b) => {
    if (!b.visualTags && !b.emotionalTags) return false;
    const allTags = [...(b.visualTags || []), ...(b.emotionalTags || [])];
    const hasTag = allTags.includes(selectedTag);
    const hasGroup = groupIndex ? b.attributes?.includes(groupIndex) : true;
    return hasTag && hasGroup;
  };

  return drawOrbitBubbles({
    bubbles,
    orbitContextKey: `tag-${groupIndex}-${selectedTag}`,
    filterFn,
  });
}

function drawGroupViewBubbles(groupIndex) {
  if (!bubbleManager) return;
  const { bubbles } = bubbleManager;

  const filterFn = (b) => b.attributes && b.attributes.includes(groupIndex);

  return drawOrbitBubbles({
    bubbles,
    orbitContextKey: `group-${groupIndex}`,
    filterFn,
  });
}

// 오비트 중심 메트릭 헬퍼 (중복 제거)
function getOrbitCenterMetrics() {
  const responsiveScale = getResponsiveScale();
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();
  const centerX = width / 2;
  const centerY = (SEARCH_BOTTOM + height) / 2;
  const imageSize = min(width * 0.4, height * 0.4) * responsiveScale;
  const imageX = centerX;
  const imageY = centerY - 50;
  return { centerX, centerY, imageX, imageY, imageSize };
}

// 태그 레이아웃 반복 헬퍼 (중복 제거)
function forEachGroupTag(groupIndex, cb) {
  const groupLang = groupLanguages[groupIndex];
  if (!groupLang) return;
  
  const responsiveScale = getResponsiveScale();
  const { imageX, imageY, imageSize } = getOrbitCenterMetrics();
  const allTags = [...groupLang.visual, ...groupLang.emotional];
  const tagRadius = imageSize / 2 + 80;
  const angleStep = (Math.PI * 2) / allTags.length;
  const TAG_FONT_SCALE = 1.4;
  const fontSize = 16 * TAG_FONT_SCALE * responsiveScale;
  const padding = 28 * responsiveScale;
  
  push();
  if (pretendardFont) textFont(pretendardFont);
  textSize(fontSize);
  
  allTags.forEach((tag, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const tagX = imageX + Math.cos(angle) * tagRadius;
    const tagY = imageY + Math.sin(angle) * tagRadius;
    const tagWidth = textWidth(tag) + padding * 2;
    const tagHeight = 56 * responsiveScale;
    
    cb({
      tag,
      x: tagX,
      y: tagY,
      w: tagWidth,
      h: tagHeight,
      fontSize,
    });
  });
  
  pop();
}

// 중간 단계 화면 그리기 (집단 이미지 + 버블캡 + 태그)
function drawGroupView(groupIndex) {
  push();
  drawingContext.save();

  // 배경 오버레이 제거 (배경이 어두워지지 않도록)
  // fill(0, 0, 0, 150);
  // noStroke();
  // rect(0, 0, width, height);

  // 집단 이미지 가져오기
  const groupImg = groupImages[groupIndex];
  if (!groupImg) {
    logError(`집단 이미지 로드 실패: groupIndex=${groupIndex}`);
    drawingContext.restore();
    pop();
    return;
  }
  if (!groupImg.width || groupImg.width === 0) {
    logWarn(`집단 이미지 크기 0: groupIndex=${groupIndex}, width=${groupImg.width}`);
    drawingContext.restore();
    pop();
    return;
  }

  // 집단 이미지 크기 및 위치 계산
  const { centerX, centerY, imageX, imageY, imageSize } = getOrbitCenterMetrics();
  const responsiveScale = getResponsiveScale();
  const imageRadius = imageSize / 2;

  // 주인공 버블처럼 백글로우 효과 추가
  push();
  drawingContext.save();
  drawingContext.globalAlpha = 0.85;
  const glowRadius = imageRadius * 1.7;
  const glowGradient = drawingContext.createRadialGradient(
    imageX,
    imageY,
    imageRadius * 0.4,
    imageX,
    imageY,
    glowRadius
  );
  glowGradient.addColorStop(0, "rgba(255,255,255,0.7)");
  glowGradient.addColorStop(0.5, "rgba(255, 243, 156, 0.18)");
  glowGradient.addColorStop(1, "rgba(255, 255, 217, 0)");
  drawingContext.fillStyle = glowGradient;
  drawingContext.beginPath();
  drawingContext.arc(imageX, imageY, glowRadius, 0, Math.PI * 2);
  drawingContext.fill();
  drawingContext.restore();
  pop();

  // 집단 이미지 그리기 (원형으로 클리핑)
  push();
  drawingContext.save();
  
  // 이미지 렌더링 품질 개선
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  
  drawingContext.beginPath();
  drawingContext.arc(imageX, imageY, imageRadius, 0, Math.PI * 2);
  drawingContext.clip();

  imageMode(CENTER);
  const imgRatio = groupImg.width / groupImg.height;
  let drawW, drawH;
  if (imgRatio > 1) {
    drawH = imageSize;
    drawW = imgRatio * drawH;
  } else {
    drawW = imageSize;
    drawH = drawW / imgRatio;
  }
  
  // 10대 여성(groupIndex 5)의 경우 안쪽 이미지만 1.5배 크게
  if (groupIndex === 5) {
    drawW *= 1.5;
    drawH *= 1.5;
  }
  
  // 20대 여성(groupIndex 2)의 경우 안쪽 이미지만 1.4배 크게
  if (groupIndex === 2) {
    drawW *= 1.4;
    drawH *= 1.4;
  }
  
  image(groupImg, imageX, imageY, drawW, drawH);
  drawingContext.restore();
  pop();

  // 빛 효과 그리기 (버블캡 아래, 이미지 위)
  // 버블 객체를 임시로 생성하여 빛 효과 함수 사용
  const tempBubble = {
    pos: { x: imageX, y: imageY },
    r: imageRadius,
    alpha: 1.0
  };
  if (
    ANIMATION_CONFIG.enableLightEffect &&
    frameCount % ANIMATION_CONFIG.lightEffectInterval === 0
  ) {
  drawBubbleLightEffect(tempBubble);
  }

  // 버블캡 그리기
  if (bubbleCap && bubbleCap.width > 0) {
    push();
    imageMode(CENTER);
    drawingContext.save();
    
    // 이미지 렌더링 품질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    
    image(bubbleCap, imageX, imageY, imageSize, imageSize);
    drawingContext.restore();
    pop();
  }

  // 집단 이름 텍스트 (화면 정 중앙에 흰색 글자로, 가장 앞 레이어)
  const groupNames = {
    1: "여행자",
    2: "20대 여성",
    3: "50대 남성",
    4: "주부",
    5: "10대 여성"
  };
  
  const groupName = groupNames[groupIndex];
  if (groupName) {
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    
    if (pretendardFont) {
      textFont(pretendardFont);
    }
    
    // 화면 정 중앙에 위치 (imageY가 아닌 화면 중앙)
    const screenCenterY = centerY;
    
    // 흰색 글자로 표시
    const textSizeValue = 32 * responsiveScale;
    textSize(textSizeValue);
    textStyle(BOLD);
    
    // 텍스트 그림자 효과 (가독성 향상)
    drawingContext.shadowBlur = 8;
    drawingContext.shadowColor = "rgba(0,0,0,0.5)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 2;
    
    fill(255, 255, 255, 255); // 흰색
    // 텍스트 화질 개선: 정수 반올림 제거
    text(groupName, centerX, screenCenterY);
    
    drawingContext.restore();
    pop();
  }

  // 태그 표시 (집단 이미지 주변에 원형으로 배치)
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;

    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";

    if (pretendardFont) {
      textFont(pretendardFont);
    }

  forEachGroupTag(groupIndex, ({ tag, x: tagX, y: tagY, w: tagWidth, h: tagHeight, fontSize: tagFontSize }) => {
    const tagRadiusRect = tagHeight / 2;
      const isSelected = selectedTag === tag;
      
    // hover 상태 확인
      const isHovered = (
        mouseX >= tagX - tagWidth / 2 &&
        mouseX <= tagX + tagWidth / 2 &&
        mouseY >= tagY - tagHeight / 2 &&
        mouseY <= tagY + tagHeight / 2
      );

    // 글래스 라벨 그리기
      drawGlassTag(tagX - tagWidth / 2, tagY - tagHeight / 2, tagWidth, tagHeight, tagRadiusRect, isSelected, isHovered);

      // 태그 텍스트 (그림자 효과 포함)
      push();
      drawingContext.save();
      drawingContext.textBaseline = "middle";
      drawingContext.textAlign = "center";
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      
      if (pretendardFont) {
        textFont(pretendardFont);
      }
      
      fill(255, 255, 255, 255);
      textSize(tagFontSize);
      textStyle(NORMAL);
      
      // 텍스트 그림자 효과
      drawingContext.shadowBlur = 4;
      drawingContext.shadowColor = "rgba(0,0,0,0.3)";
      drawingContext.shadowOffsetX = 0;
      drawingContext.shadowOffsetY = 2;
      
      const textX = tagX;
      const textY = tagY - 8;
      text(tag, textX, textY);
      
      drawingContext.restore();
      pop();
    });

    drawingContext.restore();
    pop();

  drawingContext.restore();
  pop();
}

// 태그 클릭 확인
function checkTagClick(x, y, groupIndex) {
  const groupImg = groupImages[groupIndex];
  if (!groupImg || !groupImg.width || groupImg.width === 0) return null;

  let clicked = null;
  
  forEachGroupTag(groupIndex, ({ tag, x: tagX, y: tagY, w: tagWidth, h: tagHeight }) => {
    if (
      !clicked &&
      x >= tagX - tagWidth / 2 &&
      x <= tagX + tagWidth / 2 &&
      y >= tagY - tagHeight / 2 &&
      y <= tagY + tagHeight / 2
    ) {
      clicked = tag;
    }
  });

  return clicked;
}

// 글래스 태그 그리기 (circle-to-capture 스타일 참고)
function drawGlassTag(x, y, w, h, r, isSelected = false, isHovered = false) {
  const ctx = drawingContext;

  // 1) 아웃샤도우 (태그 외곽 글로우, hover 시 더 강하게)
  ctx.save();
  // hover 시 약간 위로 올라가는 효과 (transform 대신 그림자 오프셋으로)
  const shadowOffsetY = isHovered ? -2 : 0;
  roundRectPath(ctx, x, y + shadowOffsetY, w, h, r);
  ctx.shadowBlur = isHovered ? 24 : 18; // hover 시 더 강한 그림자
  ctx.shadowColor = isHovered ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
  ctx.shadowOffsetY = shadowOffsetY;
  ctx.fillStyle = "rgba(0,0,0,0.001)"; // 내용 영향 없이 그림자만
  ctx.fill();
  ctx.restore();

  // 2) 클립 후, 배경을 다시 그리면서 필터 적용 → 백드롭 블러 효과
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  if (bgBuffer) {
    // 유리감: 블러 + 채도↑ + 밝기↓ (더 어둡고 흐리게)
    ctx.filter = "blur(16px) saturate(140%) brightness(60%)";
    const src = bgBuffer.canvas || bgBuffer.elt;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
  } else if (bgImage && bgImage.width > 0) {
    // 배경 이미지가 있으면 사용
    ctx.filter = "blur(16px) saturate(140%) brightness(60%)";
    const src = bgImage.canvas || bgImage.elt;
    ctx.drawImage(src, 0, 0, width, height);
    ctx.filter = "none";
  } else {
    // 배경 이미지가 없으면 단색 배경
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(x, y, w, h);
  }

  // 3) 어두운 오버레이 (배경을 더 어둡게, hover 시 더 밝게)
  const overlayAlpha = isHovered ? 0.25 : 0.4; // hover 시 더 밝게
  ctx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
  ctx.fillRect(x, y, w, h);

  // 4) 유리 틴트(상→하 미묘한 그라디언트, hover 시 더 밝게)
  const tint = ctx.createLinearGradient(x, y, x, y + h);
  const tintTop = isHovered ? 0.25 : 0.15; // hover 시 더 밝게
  const tintBottom = isHovered ? 0.15 : 0.08;
  tint.addColorStop(0, `rgba(255,255,255,${tintTop})`);
  tint.addColorStop(1, `rgba(255,255,255,${tintBottom})`);
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, w, h);

  // 5) 유리 테두리(대각선 그라디언트 하이라이트)
  // 선택된 태그는 더 진한 스트로크, hover 시도 더 밝게
  const edge = ctx.createLinearGradient(x, y, x + w, y + h);
  if (isSelected) {
    // 선택된 태그: 더 진한 테두리
    edge.addColorStop(0, "rgba(255,255,255,0.95)");
    edge.addColorStop(0.5, "rgba(255,255,255,0.8)");
    edge.addColorStop(1, "rgba(255,255,255,0.3)");
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3; // 더 두꺼운 테두리
  } else if (isHovered) {
    // hover 상태: 더 밝은 테두리
    edge.addColorStop(0, "rgba(255,255,255,0.7)");
    edge.addColorStop(0.5, "rgba(255,255,255,0.5)");
    edge.addColorStop(1, "rgba(255,255,255,0.2)");
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2.5; // 약간 더 두꺼운 테두리
  } else {
    edge.addColorStop(0, "rgba(255,255,255,0.75)");
    edge.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
  }
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.restore();
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

// 뒤로가기 버튼 클릭 확인
function checkBackButtonClick(x, y) {
  const backButtonSize = 50;
  const backButtonX = 30;
  const backButtonY = 30;
  const dist = sqrt((x - backButtonX) ** 2 + (y - backButtonY) ** 2);
  return dist <= backButtonSize / 2;
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

// 버블 회전 제어는 handlePointerDown, handlePointerMove, handlePointerUp에 통합됨

// 회전 제어 헬퍼 함수들
function handleRotationStart(x, y) {
  // 태그 필터링 또는 그룹 뷰가 활성화된 경우에만 회전 제어
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  const hasTagFilter = selectedTag !== null;
  
  if (!hasTagFilter && !showGroupView) {
    return false; // 회전 제어 모드가 아님
  }
  
  // 중심 위치 계산
  const { centerX, centerY } = getOrbitCenterMetrics();
  
  // 중심에서의 거리 계산
  const dx = x - centerX;
  const dy = y - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  // 중심 이미지 영역 내부인지 확인 (회전 제어 영역)
  const imageSize = min(width * 0.4, height * 0.4) * getResponsiveScale();
  const maxRadius = min(width, height) * 0.45; // 버블이 돌아다니는 최대 반지름
  const controlRadius = maxRadius + 100; // 약간 여유를 둔 제어 영역
  
  if (dist <= controlRadius) {
    bubbleRotationState.isDragging = true;
    bubbleRotationState.lastX = x;
    bubbleRotationState.lastY = y;
    bubbleRotationState.didDrag = false;
    return true; // 회전 제어 시작됨
  }
  
  return false; // 회전 제어 영역이 아님
}

function handleRotationDrag(x, y) {
  if (!bubbleRotationState.isDragging) {
    return;
  }
  
  // 중심 위치 계산
  const { centerX, centerY } = getOrbitCenterMetrics();
  
  // 이전 위치와 현재 위치의 각도 차이 계산
  const prevDx = bubbleRotationState.lastX - centerX;
  const prevDy = bubbleRotationState.lastY - centerY;
  const prevAngle = Math.atan2(prevDy, prevDx);
  
  const currDx = x - centerX;
  const currDy = y - centerY;
  const currAngle = Math.atan2(currDy, currDx);
  
  // 각도 차이 계산 (회전 방향 고려)
  let angleDelta = currAngle - prevAngle;
  
  // 각도 차이를 -π ~ π 범위로 정규화
  if (angleDelta > Math.PI) {
    angleDelta -= 2 * Math.PI;
  } else if (angleDelta < -Math.PI) {
    angleDelta += 2 * Math.PI;
  }
  
  // 드래그 감도 조절
  const dragSensitivity = 1.0; // 드래그한 각도를 얼마나 반영할지
  
  // 회전 각도 업데이트
  bubbleRotationState.rotationAngle += angleDelta * dragSensitivity;
  
  // 각도 정규화 (드래그 중에도 오버플로우 방지)
  const TWO_PI = Math.PI * 2;
  bubbleRotationState.rotationAngle = ((bubbleRotationState.rotationAngle % TWO_PI) + TWO_PI) % TWO_PI;
  
  // 마지막 드래그 속도를 관성으로 저장 (튕겨 나가는 느낌)
  const timeDelta = deltaTime / 1000; // 초 단위
  if (timeDelta > 0 && Math.abs(angleDelta) > 0.001) {
    bubbleRotationState.angularVelocity = (angleDelta * dragSensitivity) / timeDelta * 0.5;
  }
  if (Math.abs(angleDelta) > 0.0005) {
    bubbleRotationState.didDrag = true;
  }
  
  // 마지막 위치 업데이트
  bubbleRotationState.lastX = x;
  bubbleRotationState.lastY = y;
}

function handleRotationEnd() {
  if (bubbleRotationState.isDragging) {
    bubbleRotationState.isDragging = false;
    
    // 거의 안 움직인 상태에서 떼면 그냥 멈춘 느낌 나도록
    if (Math.abs(bubbleRotationState.angularVelocity) < 0.0001) {
      bubbleRotationState.angularVelocity = 0;
    }
  }

  if (bubbleRotationState.didDrag) {
    bubbleRotationState.didDrag = false;
  }
}
