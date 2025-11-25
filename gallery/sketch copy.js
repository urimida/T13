/* =========================================================
   Gallery - Exhibition Grade Rebuild (p5.js global mode)
   - Long-run stable (>= 1h), low-GC, tablet 30fps+
   - Keep UI/behavior same, rewrite all logic
   ========================================================= */

/* =========================
   0. HARD CONFIG
========================= */

const PATHS = {
  bubblesJson: "../public/assets/data/bubbles.json",
  bubbleImgs: "../public/assets/bubble-imgs/",      // *.webp 폴더
  uiImgs: "../public/assets/public-imgs/",         // UI png 폴더
  font: "../public/assets/fonts/PretendardVariable.ttf",
  navBar: "../public/assets/public-imgs/navigation-bar.png", // 익스플로어와 동일
  bubblePopSound: "../circle-to-capture/assets/music/ding.mp3", // 버블 터지는 소리
};

const DEV = {
  showFPS: false,
  logMemory: false,
};

const RENDER = {
  bgColor: "#1a1b1f",
  totalBubblesFallback: 35,
  baseBubbleRadius: 22,
  maxBubbleRadius: 130,
  minBubbleRadius: 28,
  hexSpacing: 75,
  fisheyeStrength: 2.5,
  centerInfluenceRadius: 200,
  alphaFadeRadius: 420,
  minAlpha: 0.28,
  maxWrapCopies: 6,
  idleFPS: 30,         // 드래그/애니메이션 없을 때 목표 fps
};

const INTERACT = {
  panSensitivity: 0.6,
  snapSpeed: 0.14,
  longPressDuration: 500,
  inertiaDecay: 0.94,
  dragDeadzone: 6,
};

const UI = {
  navScaleRatio: 0.7,
  leftCardsWidthRatio: 0.17,
  leftCardsPaddingRatio: 0.02,
  bottomArcHeightRatio: 0.28,
  glassAlpha: 0.22,
  searchWRatio: 0.56, // 버튼 크기용 (검색창 제거됨)
};

// 성능 최적화 설정 (익스플로어와 동일)
const PERFORMANCE_CONFIG = {
  imageCheckInterval: 400,
  maxImageQueueLength: 40,
  maxDraw: 140,
  tabletGCInterval: 20000,
  desktopGCInterval: 30000,
  tabletSoftReset: 120000,
  desktopSoftReset: 180000,
  maxSimulImageLoads: 2,
};

// ---- ARC CAROUSEL (원본 스케치와 동일) ----
const ARC_VISIBLE_COUNT = 7; // 한번에 그릴 슬롯 수 (7개 고정)
const ARC_SPREAD_RAD = (150 * Math.PI) / 180; // 간격 줄이기 위해 180도 → 150도로 축소
const ARC_MIN_R = 50; // 버블 최소 반지름 (양 끝, 적당한 크기)
const ARC_MAX_R = 130; // 버블 최대 반지름(주변 버블용)
const ARC_HERO_R = 180; // 주인공 버블 최대 반지름(중앙 버블만)
const ARC_DAMP = 0.75; // 관성 감쇠 (더 빠르게 멈춤, 중앙 정렬 강화)
const ARC_DRAG_SENSE = 0.008; // 드래그 감도(좌우 스와이프 → 각도)
const ARC_SNAP_THRESHOLD = 0.3; // 스냅 임계값 (라디안)

// 아크 캐러셀 상태 변수
let arcScroll = 0; // 스크롤 각도 오프셋 (애니메이션용)
let arcVel = 0; // 관성
let arcDragging = false;
let arcDragStartX = 0; // 드래그 시작 X 위치
let arcDragStartIndex = 0; // 드래그 시작 시점의 인덱스
let arcTargetIndex = 0; // 목표 버블 인덱스 (스냅용)
let arcCurrentIndex = 0; // 현재 버블 인덱스 (애니메이션용)
let arcBubbleHitboxes = []; // 현재 화면에 그려진 버블의 히트박스 정보 [{x, y, r, bubble, slotIndex}]

// --- ARC source cache (GC-free) ---
let arcSrcIndices = [];   // 필터링된 버블 인덱스만 저장
let arcSrcCount = 0;

// 슬롯 재사용 버퍼 (객체 재사용으로 GC 방지)
const ARC_SLOTS = ARC_VISIBLE_COUNT; // 7
const arcSlotItems = new Array(ARC_SLOTS); // {x,y,r,bi,slotIndex,ySort} - 미리 초기화
const arcAngles = new Float32Array(ARC_SLOTS);
const arcRadii  = new Float32Array(ARC_SLOTS);

// arcSlotItems 객체 미리 초기화 (setup에서 호출)
function initArcSlotItems() {
  for (let i = 0; i < ARC_SLOTS; i++) {
    arcSlotItems[i] = { x: 0, y: 0, r: 0, bi: 0, slotIndex: 0, ySort: 0 };
  }
}

// 드로우 순서(뒤→앞). 중앙은 마지막에 텍스트 따로.
const ARC_DRAW_ORDER = [-3,-2,-1,1,2,3,0];

// 캐러셀 변수 (carouselOffset, carouselVel, carouselSnapping)
let carouselOffset = 0; // 캐러셀 오프셋
let carouselVel = 0; // 캐러셀 속도
let carouselSnapping = false; // 캐러셀 스냅 상태

// 버블 스프라이트 캐시는 SpriteCache만 사용

// 버블 이미지 배열 (원본 스케치와 동일)
let bubbleImages = []; // 버블 이미지들 (지연 로딩)
let imageFiles = []; // 이미지 파일명 목록
let imageLoader = null; // ImageLoader 인스턴스 (익스플로어와 동일)

/* =========================
   1. GLOBAL STATE
========================= */

// core data
let rawData = null;
let bubbles = null;
let bubbleCount = 0;

// pooled arrays / temp buffers (no per-frame alloc)
let filteredIndices = [];    // current filter result (태그 필터링용, 일부만 사용)

// input
let pointerDown = false;
let pointerId = -1;
let downX = 0, downY = 0;
let lastX = 0, lastY = 0;
let lastT = 0;
let dragging = false;
let dragMode = 0; // 0 none, 1 pan, 2 carousel
let clickedBubbleAtPress = null; // 버블 클릭 정보 저장

// modes
let mode = 0; // 0 normal, 1 fullscreen
let fullscreenIndex = -1;
let fullscreenAnim = 0; // 0 -> 1
let fullscreenTagLayout = []; // 태그 레이아웃 (랜덤 배치)
let fullscreenStartPos = { x: 0, y: 0, r: 0 }; // 버블의 원래 위치와 크기 (확대 애니메이션용)
let fullscreenExitAnim = 0; // 나갈 때 역방향 애니메이션 (1 -> 0)

// UI managers
let fontPretendard = null;
let uiImages = {};
let uiHitboxes = []; // {id,x,y,w,h}

// sound
let bubblePopSound = null; // 버블 터지는 소리

// filtering
let tagList = [];
let activeTag = null;

// carousel (원본 스케치와 동일한 변수명 사용)
// arcScroll, arcVel, arcDragging 등은 위에서 이미 정의됨

// caches
let bgBuffer = null;
let spriteCache = null;
let imageManager = null;

// perf
let fpsSmoother = 60;
let idleFrameSkip = 0;
let lastActiveTime = 0;
let deltaTime = 16.666; // 프레임 간 시간 차이 (ms, 기본값 60fps)
let lastDrawTime = 0;

// 안내 텍스트 관련 변수
let showInstructionText = true; // 안내 텍스트 표시 여부
let instructionPulseTime = 0; // LED 펄스 애니메이션 시간

/* =========================
   2. DATA SCHEMA ADAPTER
   - bubbles.json 구조가 다르면 여기만 수정
========================= */

const DATA_SCHEMA_ADAPTER = {
  // raw json -> normalized bubble objects
  normalize(raw) {
    // expected:
    // { imageFiles:[...], bubbles:[{title,image,attributes,visualTags,emotionalTags}] }
    const list = raw.bubbles || [];
    const out = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const b = list[i] || {};
      // visualTags와 emotionalTags를 합쳐서 tags로 사용
      const allTags = [
        ...(b.visualTags || []),
        ...(b.emotionalTags || [])
      ];
      out[i] = {
        title: b.title || "",
        imageFile: b.image || b.imageFile || "",
        tags: allTags,
        visualTags: b.visualTags || [],
        emotionalTags: b.emotionalTags || [],
        attributes: b.attributes || [],
        description: b.description || "",
      };
    }
    return out;
  },

  collectTags(normList) {
    // visualTags와 emotionalTags에서 가장 많이 사용된 태그 6개 선택
    const tagCounts = Object.create(null);
    for (let i = 0; i < normList.length; i++) {
      const b = normList[i];
      // visualTags 수집
      if (b.visualTags) {
        for (let j = 0; j < b.visualTags.length; j++) {
          const tag = b.visualTags[j];
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      // emotionalTags 수집
      if (b.emotionalTags) {
        for (let j = 0; j < b.emotionalTags.length; j++) {
          const tag = b.emotionalTags[j];
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
    }
    // 사용 횟수 순으로 정렬하고 상위 6개 선택
    const sortedTags = Object.keys(tagCounts)
      .sort((a, b) => tagCounts[b] - tagCounts[a])
      .slice(0, 6);
    return sortedTags;
  },
};

/* =========================
   3. IMAGE LOADER (익스플로어와 동일)
========================= */

class ImageLoader {
  constructor() {
    this.cache = new Map();           // path -> p5.Image
    this.queue = [];                  // pending paths
    this.loading = new Set();         // currently loading
    this.lastCheck = 0;
    this.activeLoads = 0;
    this.lastSeen = new Map();       // path -> timestamp (LRU용)
  }

  has(path){ return this.cache.has(path); }

  get(path){ return this.cache.get(path); }

  request(path) {
    if (!path) return;
    if (this.cache.has(path) || this.loading.has(path)) return;
    if (this.queue.length >= PERFORMANCE_CONFIG.maxImageQueueLength) return;
    this.queue.push(path);
    this.lastSeen.set(path, millis());
  }

  markVisible(path) {
    if (path) {
      this.lastSeen.set(path, millis());
    }
  }

  update(now) {
    if (now - this.lastCheck < PERFORMANCE_CONFIG.imageCheckInterval) return;
    this.lastCheck = now;

    while (this.activeLoads < PERFORMANCE_CONFIG.maxSimulImageLoads && this.queue.length > 0) {
      const path = this.queue.shift();
      if (this.cache.has(path) || this.loading.has(path)) continue;

      this.loading.add(path);
      this.activeLoads++;

      loadImage(
        path,
        img => {
          this.cache.set(path, img);
          this.lastSeen.set(path, millis());
          this.loading.delete(path);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
        },
        _err => {
          // fail silently (tablet safe)
          this.loading.delete(path);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
        }
      );
    }
  }

  gc(visibleSet) {
    // LRU 방식: 최근 60초 안 본 것만 삭제
    const now = millis();
    for (const [path] of this.cache) {
      const seen = this.lastSeen.get(path) || 0;
      if (now - seen > 60000) { // 60초 미가시 = 삭제
        this.cache.delete(path);
        this.lastSeen.delete(path);
      }
    }
  }

  softReset() {
    // reset queue/loads only
    this.queue.length = 0;
    this.loading.clear();
  }
}

/* =========================
   4. POOLS & CLASSES
========================= */

class Bubble {
  constructor() {
    // hex grid anchors
    this.ax = 0; this.ay = 0;
    this.wx = 0; this.wy = 0;
    this.rBase = 0;

    // dynamic
    this.r = 0;
    this.alpha = 1;
    this.alphaTarget = 1;
    this.filtered = true;
    this.pos = createVector(0, 0); // 화면상 위치 (원본 스케치와 동일)

    // data
    this.title = "";
    this.imageFile = "";
    this.tags = null;
    this.visualTags = null;
    this.emotionalTags = null;
    this.desc = "";
    this.imgKey = "";
    this.name = ""; // 원본 스케치와 동일

    // image state
    this.imgState = 0; // 0 unloaded, 1 loading, 2 loaded, 3 failed
    this.img = null;   // reference from manager
    this.imageIndex = null; // 원본 스케치와 동일
    this.hueSeed = 1; // 원본 스케치와 동일
    this.imgPath = null; // 이미지 경로 (익스플로어와 동일)

    // sprite cache key
    this.spriteKey = 0;
  }

  setData(d, imgKey) {
    this.title = d.title;
    this.name = d.title; // 원본 스케치와 동일
    this.imageFile = d.imageFile;
    this.tags = d.tags;
    this.visualTags = d.visualTags || [];
    this.emotionalTags = d.emotionalTags || [];
    this.desc = d.description;
    this.imgKey = imgKey;
  }

  resetPlacement(x, y, r) {
    this.ax = x; this.ay = y;
    this.wx = x; this.wy = y;
    this.rBase = r;
    this.r = r;
    this.alpha = 1;
    this.alphaTarget = 1;
    this.filtered = true;
  }

  // 익스플로어와 동일한 drawAt 메서드 (직접 이미지 렌더링)
  drawAt(x, y) {
    // alpha가 너무 작으면 그리지 않음
    if (this.alpha < 0.01) return;

    push();
    translate(x, y);
    noStroke();

    // 이미지 로더에서 이미지 가져오기 (익스플로어와 동일)
    const img = this.imgPath && imageLoader ? imageLoader.get(this.imgPath) : null;

    // base - 모든 버블에 이미지 표시 (이미지가 없으면 기본 색상)
    if (img) {
      // clip to circle
      drawingContext.save();
      // 이미지 화질 개선
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      drawingContext.beginPath();
      drawingContext.arc(0, 0, this.r, 0, Math.PI * 2);
      drawingContext.clip();
      imageMode(CENTER);
      
      // 원본 비율 유지하면서 원 안에 맞추기
      const imgRatio = img.width / img.height;
      const diameter = this.r * 2;
      let drawW, drawH;
      
      if (imgRatio > 1) {
        // 가로가 더 긴 경우: 높이를 diameter로 고정
        drawH = diameter;
        drawW = imgRatio * drawH;
      } else {
        // 세로가 더 긴 경우: 너비를 diameter로 고정
        drawW = diameter;
        drawH = drawW / imgRatio;
      }
      
      drawingContext.globalAlpha = this.alpha;
      image(img, 0, 0, drawW, drawH);
      drawingContext.restore();
    } else {
      // 이미지가 없을 때 기본 색상 표시
      colorMode(HSL, 360, 100, 100, 1);
      fill(this.hueSeed, 55, 55, this.alpha);
      circle(0, 0, this.r * 2);
      colorMode(RGB, 255);
    }

    // 모든 버블에 캡 씌우기 (익스플로어와 동일)
    const bubbleCapImg = uiImages["bubble-cap.png"];
    if (bubbleCapImg && bubbleCapImg.width > 2) {
      imageMode(CENTER);
      drawingContext.globalAlpha = this.alpha;
      const s = (this.r * 2) / bubbleCapImg.width;
      push();
      scale(s);
      image(bubbleCapImg, 0, 0);
      pop();
    }

    pop();
  }
}

// 이미지 로딩은 ImageLoader가 자동으로 처리 (익스플로어와 동일)

// very small sprite cache (size bucket -> graphics)
class SpriteCache {
  constructor() {
    this.cache = Object.create(null);
    this.sizeBuckets = [24, 32, 44, 58, 74, 92, 112, 130]; // tune
  }

  bucketSize(r) {
    // linear scan small
    const bs = this.sizeBuckets;
    for (let i = 0; i < bs.length; i++) if (r <= bs[i]) return bs[i];
    return bs[bs.length - 1];
  }

  getCircle(size, gloss) {
    const key = size + (gloss ? "_g" : "_n");
    let g = this.cache[key];
    if (g) return g;

    g = createGraphics(size * 2 + 4, size * 2 + 4);
    g.clear();
    g.noStroke();
    g.fill(255, 255, 255, 18);
    g.ellipse(size + 2, size + 2, size * 2);

    if (gloss) {
      g.fill(255, 255, 255, 38);
      g.ellipse(size * 0.7 + 2, size * 0.7 + 2, size * 1.1);
      g.fill(255, 255, 255, 12);
      g.ellipse(size * 1.2 + 2, size * 1.25 + 2, size * 1.6);
    }

    this.cache[key] = g;
    return g;
  }

  invalidateAll() {
    this.cache = Object.create(null);
  }
}

// lazy image manager with fixed map (no retries / no growth)

/* =========================
   4. PRELOAD / SETUP
========================= */

function preload() {
  fontPretendard = loadFont(PATHS.font);
  // JSON은 setup에서 비동기로 로드 (preload에서 제대로 작동하지 않을 수 있음)
  // rawData는 setup에서 로드

  // UI images (익스플로어와 동일하게 수정)
  uiImages["capture-button.png"] = loadImage(PATHS.uiImgs + "capture-button.png");
  uiImages["workroom-button.png"] = loadImage(PATHS.uiImgs + "workroom-button.png");
  uiImages["navigation-bar.png"] = loadImage(PATHS.navBar); // navigation-bar.png 사용
  uiImages["bg.png"] = loadImage(PATHS.uiImgs + "bg.png");
  uiImages["bubble-cap.png"] = loadImage(PATHS.uiImgs + "bubble-cap.png");

  // 버블 터지는 소리 로드
  try {
    bubblePopSound = loadSound(PATHS.bubblePopSound);
  } catch (e) {
    console.warn("버블 터지는 소리 로드 실패:", e);
    bubblePopSound = null;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  // 익스플로어와 동일: 고해상도 디스플레이에서 픽셀 밀도 2배로 설정
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1); // tablet stability + retina clarity
  // 이미지 화질 개선
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  textFont(fontPretendard);
  textAlign(CENTER, CENTER);

  spriteCache = new SpriteCache();
  imageLoader = new ImageLoader(); // 익스플로어와 동일한 ImageLoader

  // 아크 캐러셀 슬롯 아이템 초기화 (객체 재사용)
  initArcSlotItems();

  // JSON 비동기 로드
  loadBubbleDataFromJSON();
  
  initBackground();
  initUI();

  // Pointer Events API 설정 (익스플로어와 동일, 태블릿 지원)
  setupPointerEvents();

  lastActiveTime = millis();
}

/* =========================
   5. INIT
========================= */

// JSON 비동기 로드 함수
async function loadBubbleDataFromJSON() {
  try {
    const response = await fetch(PATHS.bubblesJson);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const raw = await response.json();
    initData(raw);
  } catch (error) {
    console.error("[Gallery] JSON 로드 중 오류 발생:", error);
    // 폴백: 빈 데이터로 초기화
    initData({ imageFiles: [], bubbles: [] });
  }
}

function initData(raw) {
  const norm = DATA_SCHEMA_ADAPTER.normalize(raw);
  bubbleCount = norm.length || RENDER.totalBubblesFallback;

  // register image keys (fallback: from imageFiles)
  const files = raw.imageFiles || norm.map(d => d.imageFile).filter(Boolean);
  imageFiles = files; // 원본 스케치와 동일하게 전역 변수에 저장

  bubbles = new Array(bubbleCount);
  for (let i = 0; i < bubbleCount; i++) {
    const b = new Bubble();
    const d = norm[i % norm.length];
    const imgKey = d.imageFile || files[i % files.length] || "";
    b.setData(d, imgKey);
    // imageIndex 설정 (원본 스케치와 동일)
    b.hueSeed = i + 1; // 색상 시드 설정
    // 이미지 경로 설정 (익스플로어와 동일)
    b.imgPath = imgKey ? PATHS.bubbleImgs + imgKey : null;
    bubbles[i] = b;
  }

  tagList = DATA_SCHEMA_ADAPTER.collectTags(norm);
  
  // "온기" 카테고리가 있으면 기본 선택
  const warmthTag = tagList.find(tag => tag === "온기");
  activeTag = warmthTag || null;

  // ✅ 캐러셀 소스 캐싱
  rebuildArcSource();

  // filteredIndices init (필터링 적용)
  filteredIndices.length = 0;
  if (!activeTag) {
    // 태그가 없으면 모든 버블 표시
    for (let i = 0; i < bubbleCount; i++) filteredIndices.push(i);
  } else {
    // "온기" 태그가 있으면 필터링 적용
    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbles[i];
      if (!b) continue;
      const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
      const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
      b.filtered = hasVisualTag || hasEmotionalTag;
      if (b.filtered) filteredIndices.push(i);
    }
  }
  
  // 데이터 로드 후 월드 초기화 (이미 setup에서 호출되었을 수 있으므로 조건부)
  // 버블 이미지 지연 로딩은 ImageLoader가 자동으로 처리
}

function initBackground() {
  bgBuffer = createGraphics(width, height);
  bgBuffer.drawingContext.imageSmoothingEnabled = true;
  bgBuffer.drawingContext.imageSmoothingQuality = "high";
  
  const bgImg = uiImages["bg.png"];
  if (bgImg && bgImg.width > 0) {
    // 백그라운드 이미지 사용 (익스플로어와 동일)
    const imgRatio = bgImg.width / bgImg.height;
    const screenRatio = width / height;

    let drawW, drawH, bgOffsetX, bgOffsetY;

    // 화면을 완전히 꽉 채우도록 cover 방식 적용
    const cover = coverRect(bgImg.width, bgImg.height, width, height);
    drawW = cover.w;
    drawH = cover.h;
    bgOffsetX = cover.x;
    bgOffsetY = cover.y;

    // 클리핑 먼저 적용
    bgBuffer.drawingContext.save();
    bgBuffer.drawingContext.beginPath();
    bgBuffer.drawingContext.rect(0, 0, width, height);
    bgBuffer.drawingContext.clip();

    // 화면 전체를 채우도록 이미지 확대하여 그리기
    bgBuffer.imageMode(CORNER);
    bgBuffer.image(bgImg, bgOffsetX, bgOffsetY, drawW, drawH);

    bgBuffer.drawingContext.restore();
  } else {
    // 이미지가 없으면 기본 색상
    bgBuffer.noStroke();
    bgBuffer.background(RENDER.bgColor);
    // 아주 가벼운 노이즈 텍스처(1회)
    bgBuffer.fill(255, 255, 255, 3);
    for (let i = 0; i < 1200; i++) {
      const x = (i * 73) % width;
      const y = (i * 191) % height;
      bgBuffer.rect(x, y, 1, 1);
    }
  }
}

function initUI() {
  uiHitboxes.length = 0;
  // hitboxes are recalculated in drawUI because responsive
}

/* =========================
   6. DRAW LOOP
========================= */

function draw() {
  // idle frame skip
  const now = millis();
  deltaTime = now - (lastDrawTime || now);
  lastDrawTime = now;
  const idle = !dragging && mode === 0 && (now - lastActiveTime) > 800;
  if (idle) {
    // skip to maintain ~idleFPS
    const targetDt = 1000 / RENDER.idleFPS;
    if (deltaTime < targetDt) {
      idleFrameSkip++;
      if (idleFrameSkip % 2 === 1) return;
    }
  } else {
    idleFrameSkip = 0;
  }

  // background
  image(bgBuffer, 0, 0);

  // 나가는 애니메이션 중에는 일반 모드도 함께 그리기
  const isExiting = mode === 1 && fullscreenExitAnim > 0;
  const exitAnimProgress = isExiting ? 1 - fullscreenExitAnim : 1; // 나갈 때 0->1로 증가
  // 일반 모드가 더 부드럽게 나타나도록 제곱 적용
  const smoothExitProgress = exitAnimProgress * exitAnimProgress;
  
  if (mode === 0 || isExiting) {
    // 나가는 애니메이션 중에는 일반 모드가 페이드인되도록
    if (isExiting) {
      push();
      drawingContext.globalAlpha = smoothExitProgress;
    }
    
    drawArcCarousel();
    drawUI();
    
    // 안내 텍스트 그리기 (일반 모드일 때만)
    if (showInstructionText && !arcDragging && !isExiting) {
      drawInstructionText();
    }
    
    if (isExiting) {
      pop();
    }
  }
  
  if (mode === 1) {
    updateFullscreen();
    drawFullscreen();
  }

  if (DEV.showFPS) drawFPS();

  // --- GC 관리 (하루 종일 안정성 강화) ---
  const isTablet = width < 1200;
  const gcInterval = isTablet ? PERFORMANCE_CONFIG.tabletGCInterval : PERFORMANCE_CONFIG.desktopGCInterval;
  const softInterval = isTablet ? PERFORMANCE_CONFIG.tabletSoftReset : PERFORMANCE_CONFIG.desktopSoftReset;

  if (!window.lastGC) window.lastGC = 0;
  if (!window.lastSoftReset) window.lastSoftReset = 0;

  if (now - window.lastGC > gcInterval) {
    window.lastGC = now;
    if (imageLoader && imageLoader.gc) imageLoader.gc();
    if (spriteCache && spriteCache.invalidateAll) spriteCache.invalidateAll();
  }

  if (now - window.lastSoftReset > softInterval) {
    window.lastSoftReset = now;
    if (imageLoader && imageLoader.softReset) imageLoader.softReset();
  }
}

/* =========================
   7. ARC CAROUSEL
========================= */

// 아크 캐러셀 렌더링(필터링된 버블 사용) - 원본 스케치와 동일
function drawArcCarousel() {
  if (arcSrcCount === 0) return;

  const { arcCenterX, arcCenterY, arcRadius } = getArcMetrics();
  const s = getResponsiveScale();
  const bubbleScale = Math.max(0.7, s);
  const EDGE_GAP = 20 * s;

  // --- 1) 목표 인덱스 애니메이션 (최단 거리 보정 + 속도 완화 + deltaTime 보정) ---
  if (!arcDragging) {
    const INDEX_EPS = 0.0008;
    const VEL_EPS = 0.0008;
    
    // deltaTime 보정 (태블릿 FPS 흔들림 대응)
    const dt = Math.min(33, deltaTime || 16.666) / 16.666; // 60fps 기준 배율
    
    const diff = shortestIndexDelta(arcCurrentIndex, arcTargetIndex, arcSrcCount);
    
    // 스냅은 하되, 속도를 갑자기 0 만들지 말고 감쇠로 자연스럽게
    if (Math.abs(diff) > INDEX_EPS) {
      arcCurrentIndex = lerpIndex(arcCurrentIndex, arcTargetIndex, 0.2 * dt, arcSrcCount);
      // 스냅 중에는 속도도 조금 더 강하게 감쇠 (dt 적용)
      arcVel *= Math.pow(0.92, dt);
    } else {
      // 완전히 가까워졌고 속도도 충분히 작을 때만 완전히 고정
      if (Math.abs(arcVel) < VEL_EPS) {
        arcCurrentIndex = arcTargetIndex;
        arcVel = 0;
      } else {
        // 아직 속도가 있으면 계속 감쇠 (dt 적용)
        arcCurrentIndex = lerpIndex(arcCurrentIndex, arcTargetIndex, 0.2 * dt, arcSrcCount);
        arcVel *= Math.pow(0.92, dt);
      }
    }
  } else {
    arcCurrentIndex = arcTargetIndex;
  }

  const mid = (ARC_VISIBLE_COUNT >> 1); // 3
  const angleBase = -Math.PI / 2;

  // --- 2) 슬롯별 반지름 미리 계산(재사용 배열) ---
  let idxSlot = 0;
  for (let i = -mid; i <= mid; i++) {
    const distC = Math.abs(i) / mid;
    const sizeRatio = 1 - Math.pow(distC, 4) * 0.8;
    const maxR = (i === 0 ? ARC_HERO_R : ARC_MAX_R);
    arcRadii[idxSlot++] = lerp(ARC_MIN_R, maxR, sizeRatio) * bubbleScale;
  }

  // --- 3) 슬롯 각도 계산(angles.find 제거) ---
  // 중앙 슬롯
  arcAngles[mid] = angleBase;

  // 왼쪽
  let currentAngle = angleBase;
  for (let stepL = 1; stepL <= mid; stepL++) {
    const prevR = arcRadii[mid - stepL + 1];
    const currR = arcRadii[mid - stepL];
    const centerDist = EDGE_GAP + prevR + currR;
    currentAngle -= centerDist / arcRadius;
    arcAngles[mid - stepL] = currentAngle;
  }

  // 오른쪽
  currentAngle = angleBase;
  for (let stepR = 1; stepR <= mid; stepR++) {
    const prevR = arcRadii[mid + stepR - 1];
    const currR = arcRadii[mid + stepR];
    const centerDist = EDGE_GAP + prevR + currR;
    currentAngle += centerDist / arcRadius;
    arcAngles[mid + stepR] = currentAngle;
  }

  // arcScroll(소수 인덱스 기반)
  const step = ARC_SPREAD_RAD / Math.max(1, ARC_VISIBLE_COUNT - 1);
  const indexOffset = arcCurrentIndex - Math.floor(arcCurrentIndex);
  arcScroll = -indexOffset * step;

  // 히트박스 재사용 (길이만 조정, 객체 재사용)
  arcBubbleHitboxes.length = ARC_SLOTS;

  // --- 4) 슬롯 아이템 채우기(객체 7개만 재사용) ---
  const baseIndex = Math.floor(arcCurrentIndex);
  for (let slot = -mid; slot <= mid; slot++) {
    const slotIdx = slot + mid; // 0..6
    const ang = arcAngles[slotIdx] + arcScroll;
    const r = arcRadii[slotIdx];

    const x = arcCenterX + Math.cos(ang) * arcRadius;
    const y = arcCenterY + Math.sin(ang) * arcRadius;

    const bi = arcSrcIndices[positiveMod(baseIndex + slot, arcSrcCount)];
    const b = bubbles[bi];
    if (!b) continue;

    // slotItems 재사용 (객체 재사용으로 GC 방지)
    const it = arcSlotItems[slotIdx];
    it.x = x;
    it.y = y;
    it.r = r;
    it.bi = bi;
    it.slotIndex = slot;
    it.ySort = y;

    // 히트박스도 같은 객체 재사용
    arcBubbleHitboxes[slotIdx] = { x, y, r, bubble: b, slotIndex: slot, ySort: y };
  }

  // --- 5) 드로우(정렬 제거, 고정 order) ---
  let centerCandidate = null;

  for (let k = 0; k < ARC_DRAW_ORDER.length; k++) {
    const slot = ARC_DRAW_ORDER[k];
    const slotIdx = slot + mid;
    const it = arcSlotItems[slotIdx];
    if (!it) continue;

    const b = bubbles[it.bi];
    if (!b) continue;

    b.pos.set(it.x, it.y);
    b.r = it.r;
    b.alpha = 1.0;

    if (b.imgPath && imageLoader) {
      imageLoader.request(b.imgPath);
      imageLoader.markVisible(b.imgPath);
    }

    b.drawAt(it.x, it.y);

    if (slot === 0) centerCandidate = it;
  }

  if (imageLoader) imageLoader.update(performance.now());

  // --- 6) 중앙 텍스트 ---
  if (centerCandidate) {
    drawCenterBubbleInfo(centerCandidate, s);
  }

  updateCarouselPhysics();
}

function drawCenterBubbleInfo(centerCandidate, s) {
  const b = bubbles[centerCandidate.bi];
  const x = centerCandidate.x;
  const y = centerCandidate.y;
  const r = centerCandidate.r;

  const centerMultiplier = 1.3;

  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  noStroke();
  textAlign(CENTER, CENTER);
  if (fontPretendard) textFont(fontPretendard);

  const titleSize = 18 * s * centerMultiplier;
  const titleFontSize = titleSize * 1.2;
  drawingContext.font = `700 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
  drawingContext.fillStyle = `rgba(255, 255, 255, ${230 / 255})`;
  const infoY = y + r + 40 * s;
  drawingContext.fillText(b.name || b.title, x, infoY);

  const visualTags = (b.visualTags || []).slice(0, 2);
  const emotionalTags = (b.emotionalTags || []).slice(0, 2);
  const tagGroups = [];
  if (visualTags.length) tagGroups.push(visualTags);
  if (emotionalTags.length) tagGroups.push(emotionalTags);

  if (tagGroups.length) {
    const tagSize = 14 * s * centerMultiplier;
    const tagFontSize = tagSize * 1.3;
    const lineGap = 28 * s * centerMultiplier;
    drawingContext.font = `600 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
    drawingContext.fillStyle = `rgba(255, 255, 255, ${180 / 255})`;

    for (let i = 0; i < tagGroups.length; i++) {
      const tagText = tagGroups[i].map(t => `#${t}`).join("  ");
      drawingContext.fillText(tagText, x, infoY + 35 * s * centerMultiplier + i * lineGap);
    }
  }

  drawingContext.restore();
  pop();
}

function updateCarouselPhysics() {
  // 아크 캐러셀 물리 업데이트는 drawArcCarousel 내부에서 처리됨
  // 여기서는 관성 감쇠만 처리 (속도 완화 + deltaTime 보정)
  if (!arcDragging && Math.abs(arcVel) > 0.0005) {
    if (arcSrcCount > 0) {
      // deltaTime 보정 (태블릿 FPS 흔들림 대응)
      const dt = Math.min(33, deltaTime || 16.666) / 16.666;
      
      // 인덱스 순환 고려하여 최단 거리로 이동 (dt 적용)
      const currentTarget = arcTargetIndex;
      arcTargetIndex = currentTarget - arcVel * dt;
      
      // 인덱스 범위 정규화 (순환)
      if (arcTargetIndex < 0) arcTargetIndex += arcSrcCount;
      if (arcTargetIndex >= arcSrcCount) arcTargetIndex -= arcSrcCount;
      
      // 속도 감쇠 (갑자기 0으로 만들지 않음, dt 적용)
      arcVel *= Math.pow(ARC_DAMP, dt);
      
      // 관성이 작아지면 자동으로 가장 가까운 정수 인덱스로 스냅 (중앙 정렬 강화)
      if (Math.abs(arcVel) < 0.01) {
        const nearestIndex = Math.round(arcTargetIndex);
        const distToNearest = Math.abs(shortestIndexDelta(arcTargetIndex, nearestIndex, arcSrcCount));
        // 가까운 인덱스로 자동 스냅 (0.1 이내면 즉시 스냅)
        if (distToNearest < 0.1) {
          arcTargetIndex = nearestIndex;
          arcVel = 0;
        }
      }
      
      lastActiveTime = millis();
    }
  }
}

/* =========================
   10. TAG RENDERER (익스플로어와 동일)
========================= */

class TagRenderer {
  static gradientCache = {
    glass: null,
    highlight: null,
    edgeNormal: null,
    edgeHovered: null,
    edgeSelected: null,
  };

  static lastTagSize = { w: 0, h: 0 };
  static LOW_QUALITY_MODE = false;

  static _getGradient(type, w, h, x = 0, y = 0) {
    const needsUpdate = this.lastTagSize.w !== w || this.lastTagSize.h !== h;
    if (needsUpdate) {
      this.gradientCache = {
        glass: null,
        highlight: null,
        edgeNormal: null,
        edgeHovered: null,
        edgeSelected: null,
      };
      this.lastTagSize = { w, h };
    }

    if (this.gradientCache[type]) return this.gradientCache[type];

    const ctx = drawingContext;
    let gradient = null;

    switch (type) {
      case "glass":
        gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "rgba(15, 16, 22, 0.35)");
        gradient.addColorStop(1, "rgba(15, 16, 22, 0.55)");
        break;
      case "highlight":
        gradient = ctx.createLinearGradient(x, y, x, y + h * 0.6);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.35)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        break;
      case "edgeNormal":
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.65)");
        gradient.addColorStop(1, "rgba(255,255,255,0.2)");
        break;
      case "edgeHovered":
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.85)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.55)");
        gradient.addColorStop(1, "rgba(255,255,255,0.35)");
        break;
      case "edgeSelected":
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.75)");
        gradient.addColorStop(1, "rgba(255,255,255,0.4)");
        break;
      default:
        break;
    }

    this.gradientCache[type] = gradient;
    return gradient;
  }

  static draw(x, y, w, h, r, isSelected = false, isHovered = false) {
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

    // 배경 이미지가 있으면 블러 효과 적용
    const bgImg = uiImages["bg.png"];
    if (bgImg && bgImg.width > 2) {
      const cover = coverRect(bgImg.width, bgImg.height, width, height);
      const dw = cover.w;
      const dh = cover.h;

      const bgX = width / 2;
      const bgY = height / 2;

      // 유리감: 블러 + 채도↑ (반투명하게)
      ctx.filter = "blur(16px) saturate(140%)";
      const src = bgImg.canvas || bgImg.elt;
      ctx.drawImage(src, bgX - dw / 2, bgY - dh / 2, dw, dh);
      ctx.filter = "none";
    }

    // 3) 미묘한 어두운 오버레이 (반투명 효과)
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(x, y, w, h);

    // 4) 유리 틴트(상→하 미묘한 그라디언트)
    const tint = ctx.createLinearGradient(x, y, x, y + h);
    tint.addColorStop(0, "rgba(255,255,255,0.15)");
    tint.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, w, h);

    ctx.restore();

    // 5) 유리 테두리(대각선 그라디언트 하이라이트)
    ctx.save();
    const edge = ctx.createLinearGradient(x, y, x + w, y + h);
    edge.addColorStop(0, "rgba(255,255,255,0.75)");
    edge.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.strokeStyle = edge;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
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

function drawGlassTag(x, y, w, h, r, isSelected = false, isHovered = false) {
  TagRenderer.draw(x, y, w, h, r, isSelected, isHovered);
}

// 태그 레이아웃 랜덤 생성 (익스플로어 스타일, 충돌 방지)
function generateRandomTagLayout(tags, imageRadius, visualTags = [], emotionalTags = []) {
  const layout = [];
  const responsiveScale = getResponsiveScale();
  const fontSize = 16 * 1.4 * responsiveScale * 1.3;
  const padding = 28 * responsiveScale * 1.3;
  const tagH = 56 * responsiveScale * 1.3;
  const tagR = tagH / 2;
  const minSpacing = 10 * responsiveScale; // 태그 간 최소 간격

  textSize(fontSize);
  
  // 태그 타입 확인 헬퍼 함수
  const getTagType = (tag) => {
    const normalizedTag = tag.replace(/^#/, "").trim();
    if (visualTags.includes(normalizedTag)) return "visual";
    if (emotionalTags.includes(normalizedTag)) return "emotional";
    return "unknown";
  };

  // VR 나가기 버튼 영역 계산
  const centerX = width / 2;
  const vrButtonTopY = 60 * responsiveScale;
  const vrButtonFontSize = 16 * 1.4 * responsiveScale * 1.3;
  const vrButtonPadding = 28 * responsiveScale * 1.3;
  const vrButtonH = 56 * responsiveScale * 1.3;
  textSize(vrButtonFontSize);
  if (fontPretendard) textFont(fontPretendard);
  textStyle(BOLD);
  const vrButtonText = "<   VR모드 나가기"; // 실제 버튼 텍스트와 일치
  const vrButtonTextW = textWidth(vrButtonText);
  const vrButtonW = vrButtonTextW + vrButtonPadding * 2;
  const vrButtonX = centerX - vrButtonW / 2;
  const vrButtonY = vrButtonTopY;
  const vrButtonBottomY = vrButtonY + vrButtonH;

  // 두 태그가 겹치는지 확인하는 함수 (VR 버튼 영역도 체크)
  function checkCollision(x, y, w, h, existingLayout) {
    const nx = x - w / 2;
    const ny = y - h / 2;
    
    // VR 나가기 버튼과의 충돌 체크 (100픽셀 거리 강제)
    const vrButtonMinDistance = 100; // VR 버튼과의 최소 거리 (픽셀)
    const vrButtonExpandedX = vrButtonX - vrButtonMinDistance;
    const vrButtonExpandedY = vrButtonY - vrButtonMinDistance;
    const vrButtonExpandedW = vrButtonW + vrButtonMinDistance * 2;
    const vrButtonExpandedH = vrButtonBottomY - vrButtonY + vrButtonMinDistance * 2;
    const vrButtonExpandedBottomY = vrButtonExpandedY + vrButtonExpandedH;
    
    if (!(nx + w < vrButtonExpandedX || 
          nx > vrButtonExpandedX + vrButtonExpandedW || 
          ny + h < vrButtonExpandedY || 
          ny > vrButtonExpandedBottomY)) {
      return true; // VR 버튼과 100픽셀 이내 거리
    }
    
    // 기존 태그들과의 충돌 체크
    for (const existing of existingLayout) {
      const ex = existing.x - existing.w / 2;
      const ey = existing.baseY - existing.h / 2;
      const ew = existing.w;
      const eh = existing.h;
      
      // 사각형 충돌 감지 (여유 공간 포함)
      if (!(nx + w + minSpacing < ex || 
            nx - minSpacing > ex + ew || 
            ny + h + minSpacing < ey || 
            ny - minSpacing > ey + eh)) {
        return true; // 겹침
      }
    }
    return false; // 겹치지 않음
  }

  // 태그를 전체 화면에 흩뿌려서 배치 (충돌 방지)
  const marginX = 40 * responsiveScale; // 좌우 여백
  const marginYTop = 120 * responsiveScale; // 상단 여백 (VR 버튼 공간)
  const marginYBottom = 40 * responsiveScale; // 하단 여백
  const availableWidth = width - marginX * 2;
  const availableHeight = height - marginYTop - marginYBottom;
  
  tags.forEach((tag, i) => {
    const label = tag.startsWith("#") ? tag : `#${tag}`;
    const w = textWidth(label) + padding * 2;
    
    let x, y;
    let attempts = 0;
    const maxAttempts = 100; // 최대 시도 횟수 증가
    
    // 겹치지 않는 위치를 찾을 때까지 시도
    do {
      // 전체 화면 영역에 랜덤 배치 (방사형이 아닌 균등 분산)
      x = marginX + random(w / 2, availableWidth - w / 2);
      y = marginYTop + random(tagH / 2, availableHeight - tagH / 2);
      
      // 화면 경계 체크 및 조정
      if (x - w / 2 < marginX) x = marginX + w / 2;
      if (x + w / 2 > width - marginX) x = width - marginX - w / 2;
      if (y - tagH / 2 < marginYTop) y = marginYTop + tagH / 2;
      if (y + tagH / 2 > height - marginYBottom) y = height - marginYBottom - tagH / 2;
      
      attempts++;
      
      // 최대 시도 횟수에 도달하면 강제로 배치 (최소한의 거리만 확보)
      if (attempts >= maxAttempts) {
        // 기존 태그들로부터 최소한의 거리를 확보한 위치 찾기
        let bestX = x, bestY = y;
        let maxMinDist = 0;
        
        // 그리드 방식으로 후보 위치 탐색
        const gridSteps = 20;
        const stepX = availableWidth / gridSteps;
        const stepY = availableHeight / gridSteps;
        
        for (let gx = 0; gx <= gridSteps; gx++) {
          for (let gy = 0; gy <= gridSteps; gy++) {
            const tryX = marginX + gx * stepX;
            const tryY = marginYTop + gy * stepY;
            
            // 경계 체크
            let adjustedX = tryX;
            let adjustedY = tryY;
            if (adjustedX - w / 2 < marginX) adjustedX = marginX + w / 2;
            if (adjustedX + w / 2 > width - marginX) adjustedX = width - marginX - w / 2;
            if (adjustedY - tagH / 2 < marginYTop) adjustedY = marginYTop + tagH / 2;
            if (adjustedY + tagH / 2 > height - marginYBottom) adjustedY = height - marginYBottom - tagH / 2;
            
            // VR 버튼과의 충돌 체크 (100픽셀 거리 강제)
            const nx = adjustedX - w / 2;
            const ny = adjustedY - tagH / 2;
            const vrButtonMinDistance = 100; // VR 버튼과의 최소 거리 (픽셀)
            const vrButtonExpandedX = vrButtonX - vrButtonMinDistance;
            const vrButtonExpandedY = vrButtonY - vrButtonMinDistance;
            const vrButtonExpandedW = vrButtonW + vrButtonMinDistance * 2;
            const vrButtonExpandedH = vrButtonBottomY - vrButtonY + vrButtonMinDistance * 2;
            const vrButtonExpandedBottomY = vrButtonExpandedY + vrButtonExpandedH;
            
            const vrCollision = !(nx + w < vrButtonExpandedX || 
                                  nx > vrButtonExpandedX + vrButtonExpandedW || 
                                  ny + tagH < vrButtonExpandedY || 
                                  ny > vrButtonExpandedBottomY);
            
            if (vrCollision) continue; // VR 버튼과 100픽셀 이내 거리면 스킵
            
            // 기존 태그들과의 최소 거리 계산
            let minDistToExisting = Infinity;
            for (const existing of layout) {
              const dx = adjustedX - existing.x;
              const dy = adjustedY - existing.baseY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              minDistToExisting = Math.min(minDistToExisting, dist);
            }
            
            if (minDistToExisting > maxMinDist) {
              maxMinDist = minDistToExisting;
              bestX = adjustedX;
              bestY = adjustedY;
            }
          }
        }
        
        x = bestX;
        y = bestY;
        break;
      }
    } while (checkCollision(x, y, w, tagH, layout));

    const tagType = getTagType(tag);
    layout.push({ tag, label, x, baseY: y, w, h: tagH, r: tagR, fontSize, tagType });
  });

  return layout;
}

/* =========================
   11. FULLSCREEN MODE
========================= */

function updateFullscreen() {
  if (fullscreenExitAnim > 0) {
    // 나가는 애니메이션 (1 -> 0) - 더 부드럽고 천천히
    fullscreenExitAnim -= 0.05; // 속도를 더 느리게 조정
    if (fullscreenExitAnim <= 0) {
      fullscreenExitAnim = 0;
      // 애니메이션 완료 후 모드 전환
      mode = 0;
      fullscreenIndex = -1;
      fullscreenAnim = 0;
      fullscreenTagLayout = [];
      // VR 모드에서 나왔을 때 안내 텍스트 다시 표시
      showInstructionText = true;
    }
  } else {
    // 들어가는 애니메이션 (0 -> 1)
    fullscreenAnim += (1 - fullscreenAnim) * 0.12;
    if (fullscreenAnim > 0.999) fullscreenAnim = 1;
  }
}

function drawFullscreen() {
  // 나가는 애니메이션 중이 아닐 때만 체크
  if (fullscreenExitAnim <= 0) {
    // bubbles가 아직 초기화되지 않았으면 일반 모드로 복귀
    if (!bubbles || bubbleCount === 0 || fullscreenIndex < 0 || fullscreenIndex >= bubbleCount) {
      mode = 0;
      return;
    }
    
    const b = bubbles[fullscreenIndex];
    if (!b) { mode = 0; return; }
  } else {
    // 나가는 애니메이션 중에는 bubbles 체크만 수행
    if (!bubbles || bubbleCount === 0 || fullscreenIndex < 0 || fullscreenIndex >= bubbleCount) {
      return;
    }
  }
  
  const b = bubbles[fullscreenIndex];
  if (!b) return;

  // UI 히트박스 초기화 (매 프레임마다)
  uiHitboxes.length = 0;

  // 애니메이션 진행도 계산 (들어갈 때: 0->1, 나갈 때: 1->0)
  const anim = fullscreenExitAnim > 0 ? fullscreenExitAnim : fullscreenAnim;
  const isExiting = fullscreenExitAnim > 0;
  
  // Easing 함수 - 들어갈 때만 ease-out 사용, 나갈 때는 선형적으로 축소
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  // 나갈 때는 easing 없이 선형적으로 축소 (확대 효과 방지)
  const easedAnim = isExiting ? anim : easeOutCubic(anim);
  
  const cx = width * 0.5;
  const cy = height * 0.5;

  // 배경을 어둡게 - 나갈 때는 더 부드럽게 사라지도록
  push();
  const bgAlpha = isExiting ? anim * anim * 200 : anim * 200; // 나갈 때는 제곱하여 더 부드럽게
  fill(0, bgAlpha);
  rect(0, 0, width, height);
  pop();

  // 이미지를 화면을 꽉 채우도록 확대 (cover 방식)
  const img = b.imgPath && imageLoader ? imageLoader.get(b.imgPath) : null;
  
  if (img && img.width > 0) {
    push();
    drawingContext.save();
    // 이미지 화질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    drawingContext.globalAlpha = anim;
    
    // 화면을 완전히 꽉 채우도록 cover 방식 적용
    const imgRatio = img.width / img.height;
    const screenRatio = width / height;
    
    // 목표 크기 (화면을 꽉 채우는 크기)
    let targetW, targetH, targetOffsetX, targetOffsetY;
    
    if (imgRatio > screenRatio) {
      // 이미지가 더 넓음 → 높이에 맞춰 확대 (좌우가 잘림)
      targetH = height;
      targetW = imgRatio * targetH;
      targetOffsetX = (width - targetW) / 2;
      targetOffsetY = 0;
    } else {
      // 이미지가 더 높음 → 너비에 맞춰 확대 (상하가 잘림)
      targetW = width;
      targetH = targetW / imgRatio;
      targetOffsetX = 0;
      targetOffsetY = (height - targetH) / 2;
    }
    
    // 시작 위치와 크기 (버블의 원래 위치)
    const startX = fullscreenStartPos.x;
    const startY = fullscreenStartPos.y;
    const startR = fullscreenStartPos.r;
    const startW = startR * 2;
    const startH = startR * 2;
    const startOffsetX = startX - startR;
    const startOffsetY = startY - startR;
    
    // 애니메이션된 위치와 크기
    // 나갈 때: fullscreenExitAnim이 1→0이므로, lerp의 start/end를 올바르게 설정
    // 들어갈 때: fullscreenAnim이 0→1이므로, startW → targetW
    // 나갈 때: fullscreenExitAnim이 1→0이므로, targetW → startW (역방향)
    const currentX = isExiting 
      ? lerp(startX, cx, anim)  // 나갈 때: startX → cx (역방향)
      : lerp(startX, cx, easedAnim);  // 들어갈 때: startX → cx
    const currentY = isExiting 
      ? lerp(startY, cy, anim)  // 나갈 때: startY → cy (역방향)
      : lerp(startY, cy, easedAnim);  // 들어갈 때: startY → cy
    const currentW = isExiting 
      ? lerp(startW, targetW, anim)  // 나갈 때: targetW → startW (역방향)
      : lerp(startW, targetW, easedAnim);  // 들어갈 때: startW → targetW
    const currentH = isExiting 
      ? lerp(startH, targetH, anim)  // 나갈 때: targetH → startH (역방향)
      : lerp(startH, targetH, easedAnim);  // 들어갈 때: startH → targetH
    const currentOffsetX = isExiting 
      ? lerp(startOffsetX, targetOffsetX, anim)  // 나갈 때: targetOffsetX → startOffsetX (역방향)
      : lerp(startOffsetX, targetOffsetX, easedAnim);  // 들어갈 때: startOffsetX → targetOffsetX
    const currentOffsetY = isExiting 
      ? lerp(startOffsetY, targetOffsetY, anim)  // 나갈 때: targetOffsetY → startOffsetY (역방향)
      : lerp(startOffsetY, targetOffsetY, easedAnim);  // 들어갈 때: startOffsetY → targetOffsetY
    
    // 나갈 때는 동그란 모양으로 클리핑
    if (isExiting) {
      // 원의 중심 (이미지의 중심)
      const circleCenterX = currentOffsetX + currentW * 0.5;
      const circleCenterY = currentOffsetY + currentH * 0.5;
      // 원의 반지름 (이미지의 작은 쪽에 맞춤)
      const circleRadius = Math.min(currentW, currentH) * 0.5;
      
      // 원형 클리핑 적용
      drawingContext.beginPath();
      drawingContext.arc(circleCenterX, circleCenterY, circleRadius, 0, Math.PI * 2);
      drawingContext.clip();
    } else {
      // 들어갈 때는 기존처럼 사각형 클리핑
      drawingContext.beginPath();
      drawingContext.rect(0, 0, width, height);
      drawingContext.clip();
    }
    
    // 확대/축소 애니메이션 적용
    imageMode(CORNER);
    image(img, currentOffsetX, currentOffsetY, currentW, currentH);
    
    drawingContext.restore();
    pop();
  } else {
    // 이미지가 없으면 기본 버블 표시
    const startR = fullscreenStartPos.r;
    const targetR = min(width, height) * 0.38;
    const r = lerp(isExiting ? targetR : startR, isExiting ? startR : targetR, easedAnim);
    const currentX = lerp(isExiting ? cx : fullscreenStartPos.x, isExiting ? fullscreenStartPos.x : cx, easedAnim);
    const currentY = lerp(isExiting ? cy : fullscreenStartPos.y, isExiting ? fullscreenStartPos.y : cy, easedAnim);
    
    push();
    translate(currentX, currentY);
    tint(255, 255 * anim);
    const sprite = spriteCache.getCircle(spriteCache.bucketSize(r), true);
    imageMode(CENTER);
    image(sprite, 0, 0, r * 2, r * 2);
    noTint();
    pop();
  }

  // VR모드 나가기 버튼 (가운데 위쪽)
  drawVRExitButton(anim);

  // 태그 표시 (랜덤 배치) - 순차적으로 나타나도록
  const tagThreshold = isExiting ? 0.7 : 0.3; // 들어갈 때는 더 일찍 시작 (0.3)
  if (fullscreenTagLayout.length > 0 && anim > tagThreshold) {
    // 나갈 때는 태그 알파를 더 빠르게 감소, 들어갈 때는 전체 애니메이션 진행도 전달
    const tagAlpha = isExiting ? (anim - tagThreshold) / (1 - tagThreshold) : anim;
    drawFullscreenTags(tagAlpha, isExiting);
  }
}

// VR모드 나가기 버튼 그리기 (태그와 동일한 스타일)
function drawVRExitButton(anim) {
  const responsiveScale = getResponsiveScale();
  const centerX = width / 2;
  const topY = 60 * responsiveScale;
  
  // 태그와 동일한 크기 스타일 적용 (글자 크기 더 작게)
  const fontSize = 16 * 1.4 * responsiveScale * 1.3; // 더 작게 조정
  const padding = 28 * responsiveScale * 1.3;
  const tagH = 56 * responsiveScale * 1.3;
  const tagR = tagH / 2;
  
  // 텍스트 크기 측정
  textSize(fontSize);
  if (fontPretendard) textFont(fontPretendard);
  textStyle(BOLD);
  const buttonText = "<   VR모드 나가기";
  const textW = textWidth(buttonText);
  const buttonWidth = textW + padding * 2;
  const buttonHeight = tagH;
  const buttonX = centerX - buttonWidth / 2;
  const buttonY = topY;
  
  // 태그와 동일한 스타일로 그리기
  drawGlassLabelFullscreen(buttonX, buttonY, buttonWidth, buttonHeight, tagR, anim);
  
  // 텍스트 그리기 (태그와 동일한 스타일)
  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  drawingContext.globalAlpha = anim;
  fill(255, 255);
  textSize(fontSize);
  if (fontPretendard) textFont(fontPretendard);
  textStyle(BOLD);
  drawingContext.shadowBlur = 0; // 그림자 제거 (버블 제목과 동일)
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  const textY = buttonY + buttonHeight / 2 - 2; // 텍스트를 2픽셀 위로 이동
  // 텍스트를 약간 오프셋을 두고 여러 번 그려서 엑스트라 볼드 효과 (더 많이 그려서 더 굵게)
  text(buttonText, centerX, textY);
  text(buttonText, centerX + 0.5, textY);
  text(buttonText, centerX - 0.5, textY);
  text(buttonText, centerX, textY + 0.5);
  text(buttonText, centerX, textY - 0.5);
  text(buttonText, centerX + 0.5, textY + 0.5);
  text(buttonText, centerX - 0.5, textY - 0.5);
  drawingContext.shadowBlur = 0;
  drawingContext.restore();
  pop();
  
  // 히트박스 저장
  uiHitboxes.push({ 
    id: "vr_exit", 
    x: buttonX, 
    y: buttonY, 
    w: buttonWidth, 
    h: buttonHeight 
  });
}

// 서클 투 캡쳐 스타일 글래스 라벨 그리기 (백드롭 블러 포함)
function drawGlassLabelFullscreen(x, y, w, h, r, anim, tagType = null) {
  const ctx = drawingContext;
  
  // 태그 타입에 따른 색상 설정 (배경 틴트에만 적용, 테두리는 흰색 유지)
  let tintColor = null;
  if (tagType === "visual") {
    // 비주얼 태그: 붉은 빛 (약하게)
    tintColor = { r: 255, g: 200, b: 200, alpha: 0.1 }; // 약한 빨간 틴트
  } else if (tagType === "emotional") {
    // 감정 태그: 초록빛 (약하게)
    tintColor = { r: 200, g: 255, b: 200, alpha: 0.1 }; // 약한 초록 틴트
  }

  // 1) 아웃샤도우 (라벨 외곽 글로우)
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.shadowBlur = 18;
  ctx.shadowColor = `rgba(0,0,0,${0.25 * anim})`;
  ctx.fillStyle = "rgba(0,0,0,0.001)"; // 내용 영향 없이 그림자만
  ctx.fill();
  ctx.restore();

  // 2) 클립 후, 배경을 다시 그리면서 필터 적용 → 백드롭 블러 효과
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  // 배경 이미지 가져오기 (실제 확대된 이미지 사용)
  const b = bubbles && fullscreenIndex >= 0 ? bubbles[fullscreenIndex] : null;
  const img = b && b.imgPath && imageLoader ? imageLoader.get(b.imgPath) : null;
  
  if (img && img.width > 0) {
    // 확대된 이미지의 cover fit 계산 (drawFullscreen과 동일)
    const imgRatio = img.width / img.height;
    const screenRatio = width / height;
    
    let drawW, drawH, offsetX, offsetY;
    if (imgRatio > screenRatio) {
      drawH = height;
      drawW = imgRatio * drawH;
      offsetX = (width - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = width;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (height - drawH) / 2;
    }

    // 유리감: 블러 + 채도↑ (반투명하게)
    ctx.filter = "blur(16px) saturate(140%)";
    ctx.globalAlpha = anim; // 배경은 anim 투명도 유지
    const src = img.canvas || img.elt;
    ctx.drawImage(
      src,
      0,
      0,
      img.width,
      img.height,
      offsetX,
      offsetY,
      drawW,
      drawH
    );
    ctx.filter = "none";
  }

  // 3) 미묘한 어두운 오버레이 (반투명 효과) - 검은색 5% 추가
  ctx.globalAlpha = anim;
  ctx.fillStyle = "rgba(0,0,0,0.30)"; // 기존 5% + 추가 5% = 총 10%
  ctx.fillRect(x, y, w, h);

  // 4) 유리 틴트(상→하 미묘한 그라디언트) - 태그 타입에 따라 색상 적용
  const tint = ctx.createLinearGradient(x, y, x, y + h);
  if (tintColor) {
    // 색상 틴트 적용 (기본 흰색 틴트와 혼합)
    tint.addColorStop(0, `rgba(${tintColor.r},${tintColor.g},${tintColor.b},${0.15 + tintColor.alpha})`);
    tint.addColorStop(1, `rgba(${tintColor.r},${tintColor.g},${tintColor.b},${0.08 + tintColor.alpha})`);
  } else {
    tint.addColorStop(0, "rgba(255,255,255,0.15)");
    tint.addColorStop(1, "rgba(255,255,255,0.08)");
  }
  ctx.fillStyle = tint;
  ctx.globalAlpha = anim;
  ctx.fillRect(x, y, w, h);

  ctx.restore();

  // 5) 유리 테두리(대각선 그라디언트 하이라이트) - 항상 흰색 유지
  ctx.save();
  const edge = ctx.createLinearGradient(x, y, x + w, y + h);
  edge.addColorStop(0, "rgba(255,255,255,0.75)");
  edge.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = anim;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

// 풀스크린 태그 그리기 (서클 투 캡쳐 스타일)
function drawFullscreenTags(anim, isExiting = false) {
  const t = millis() * 0.001;
  const totalTags = fullscreenTagLayout.length;
  
  fullscreenTagLayout.forEach((L, idx) => {
    let tagAlpha;
    
    if (isExiting) {
      // 나갈 때: 모든 태그가 동시에 사라짐
      tagAlpha = anim;
    } else {
      // 들어갈 때: 각 태그마다 순차적으로 나타나도록 지연 시간 계산
      // 첫 번째 태그는 0.3부터 시작, 마지막 태그는 0.8까지
      const delayStart = 0.3;
      const delayEnd = 0.8;
      const tagDelay = delayStart + (idx / Math.max(1, totalTags - 1)) * (delayEnd - delayStart);
      
      // 현재 애니메이션 진행도가 지연 시간을 넘었는지 확인
      const tagProgress = Math.max(0, Math.min(1, (anim - tagDelay) / (1 - tagDelay)));
      
      // 부드러운 페이드인 효과 (ease-out)
      const easeOut = (t) => 1 - Math.pow(1 - t, 2);
      tagAlpha = easeOut(tagProgress);
    }
    
    // 알파가 0이면 그리지 않음
    if (tagAlpha <= 0) return;
    
    // 부드러운 떠다니는 애니메이션
    const floatY = Math.sin(t + idx) * 3 * getResponsiveScale();
    const y = L.baseY + floatY;
    
    const rectX = L.x - L.w / 2;
    const rectY = y - L.h / 2;
    
    // 태그 그리기 (서클 투 캡쳐 스타일 - 백드롭 블러 포함, 태그 타입에 따라 색상 적용)
    push();
    drawingContext.save();
    const tagType = L.tagType || null;
    drawGlassLabelFullscreen(rectX, rectY, L.w, L.h, L.r, tagAlpha, tagType);
    drawingContext.restore();
    pop();
    
    // 텍스트 그리기 (VR 나가기 버튼과 동일한 스타일)
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    drawingContext.globalAlpha = tagAlpha;
    fill(255, 255);
    textSize(L.fontSize);
    if (fontPretendard) textFont(fontPretendard);
    drawingContext.font = `600 ${L.fontSize}px "Pretendard Variable", Pretendard, sans-serif`; // 세미볼드
    drawingContext.shadowBlur = 0; // 그림자 제거
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 0;
    const textY = y - 2; // 텍스트를 2픽셀 위로 이동
    // 세미볼드 스타일로 한 번만 그리기
    text(L.label, L.x, textY);
    drawingContext.shadowBlur = 0;
    drawingContext.restore();
    pop();
  });
}

// 둥근 사각형 그리기 헬퍼 함수
function roundedRect(x, y, w, h, r) {
  drawingContext.beginPath();
  drawingContext.moveTo(x + r, y);
  drawingContext.lineTo(x + w - r, y);
  drawingContext.quadraticCurveTo(x + w, y, x + w, y + r);
  drawingContext.lineTo(x + w, y + h - r);
  drawingContext.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  drawingContext.lineTo(x + r, y + h);
  drawingContext.quadraticCurveTo(x, y + h, x, y + h - r);
  drawingContext.lineTo(x, y + r);
  drawingContext.quadraticCurveTo(x, y, x + r, y);
  drawingContext.closePath();
}

/* =========================
   11. UI DRAW (NAV, TAG CARDS)
========================= */

function drawUI() {
  // 익스플로어와 동일한 scaleAll 계산
  const baseW = 1920, baseH = 1080;
  const s = Math.min(width / baseW, height / baseH);
  const scaleAll = clamp(s, 0.5, 1.5); // 익스플로어와 동일한 clamp 적용

  // NAV BAR (익스플로어와 동일)
  const navBarTop = 20;
  const navBarImg = uiImages["navigation-bar.png"];
  const navBarH = navBarImg ? navBarImg.height * 0.455 * scaleAll : 80;
  const navBarBottom = navBarTop + navBarH;
  
  if (navBarImg) {
    push();
    drawingContext.save();
    // 이미지 화질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    imageMode(CENTER);
    const navW = navBarImg.width * 0.455 * scaleAll;
    image(navBarImg, width * 0.5, navBarTop + navBarH * 0.5, navW, navBarH);
    drawingContext.restore();
    pop();
  }

  // TOP BUTTONS (익스플로어와 동일)
  const captureImg = uiImages["capture-button.png"];
  if (captureImg) {
    push();
    drawingContext.save();
    // 이미지 화질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    const w = captureImg.width * UI.searchWRatio * scaleAll;
    const h = captureImg.height * UI.searchWRatio * scaleAll;
    imageMode(CENTER);
    image(captureImg, 30 * scaleAll + w * 0.5, 30 * scaleAll + h * 0.5, w, h);
    drawingContext.restore();
    pop();
  }

  const workImg = uiImages["workroom-button.png"];
  if (workImg) {
    push();
    drawingContext.save();
    // 이미지 화질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    const w = workImg.width * UI.searchWRatio * scaleAll;
    const h = workImg.height * UI.searchWRatio * scaleAll;
    imageMode(CENTER);
    image(workImg, width - (30 * scaleAll + w * 0.5), 30 * scaleAll + h * 0.5, w, h);
    drawingContext.restore();
    pop();
  }

  // LEFT TAG CARDS
  drawLeftCards(scaleAll);

  // HITBOXES (responsive rebuild per frame)
  const captureW = captureImg ? captureImg.width * UI.searchWRatio * scaleAll : 0;
  const captureH = captureImg ? captureImg.height * UI.searchWRatio * scaleAll : 0;
  const workW = workImg ? workImg.width * UI.searchWRatio * scaleAll : 0;
  const workH = workImg ? workImg.height * UI.searchWRatio * scaleAll : 0;
  const navW = navBarImg ? navBarImg.width * 0.455 * scaleAll : 0;
  const navH = navBarH; // 이미 위에서 계산됨
  
  // CENTER 모드로 그려지므로 중심 기준으로 히트박스 계산
  const captureX = 30 * scaleAll + captureW * 0.5;
  const captureY = 30 * scaleAll + captureH * 0.5;
  const workX = width - (30 * scaleAll + workW * 0.5);
  const workY = 30 * scaleAll + workH * 0.5;
  
  uiHitboxes.push({ id: "capture", x: captureX - captureW * 0.5, y: captureY - captureH * 0.5, w: captureW, h: captureH });
  uiHitboxes.push({ id: "workroom", x: workX - workW * 0.5, y: workY - workH * 0.5, w: workW, h: workH });
  uiHitboxes.push({ id: "nav_center", x: width * 0.5 - navW * 0.5, y: navBarTop, w: navW, h: navH });
}

function drawLeftCards(scaleAll) {
  const pad = width * UI.leftCardsPaddingRatio;
  const top = min(width, height) * 0.26;
  const cardH = (height * 0.55 - pad * 5) / 6;
  const cardR = cardH * 0.5; // 둥근 모서리 반경
  const cardGap = pad * 0.3; // 카테고리 사이 간격 줄이기
  const textPadding = 24; // 텍스트 좌우 패딩 (더 크게 설정)

  // 텍스트 크기 설정 (너비 계산용)
  textAlign(LEFT, CENTER);
  if (fontPretendard) textFont(fontPretendard);
  textSize(12 * 1.5);

  for (let i = 0; i < 6; i++) {
    const tag = tagList[i] || null;
    const tagText = tag ? `#${tag}` : "—";
    
    // 텍스트 너비에 따라 카드 너비 동적 계산
    const textW = textWidth(tagText);
    const cardW = textW + textPadding * 2;
    
    const x = pad;
    const y = top + i * (cardH + cardGap);
    const selected = (activeTag === tag);

    // 태그와 동일한 글래스 스타일로 그리기
    drawGlassTag(x, y, cardW, cardH, cardR, selected, false);

    // 선택된 카테고리에 노란색 배경 추가
    if (selected) {
      push();
      drawingContext.save();
      noStroke();
      fill(255, 255, 0, 0.05 * 255); // 노란색 0.3 투명도
      roundRectPath(drawingContext, x, y, cardW, cardH, cardR);
      drawingContext.fill();
      drawingContext.restore();
      pop();
    }

    // 텍스트 그리기 (태그와 동일한 스타일)
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    
    // 태그 이름 (세미볼드)
    textAlign(LEFT, CENTER);
    if (fontPretendard) textFont(fontPretendard);
    textSize(12 * 1.5); // 글자 크기 1.5배
    drawingContext.font = `600 ${12 * 1.5}px "Pretendard Variable", Pretendard, sans-serif`; // 세미볼드
    fill(selected ? 255 : 200);
    drawingContext.shadowBlur = 0; // 그림자 제거 (버블 제목과 동일)
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 0;
    const textX = x + textPadding;
    const textY = y + cardH * 0.5 - 2; // 텍스트를 2픽셀 위로 이동
    // 텍스트를 약간 오프셋을 두고 여러 번 그려서 더 굵게 보이게 (버블 제목과 동일)
    text(tagText, textX, textY);
    text(tagText, textX + 0.5, textY);
    text(tagText, textX, textY + 0.5);
    
    drawingContext.shadowBlur = 0;
    drawingContext.restore();
    pop();

    uiHitboxes.push({ id: "tag_" + i, x, y, w: cardW, h: cardH });
  }

  textAlign(CENTER, CENTER);
}

function countBubblesWithTag(tag) {
  if (!bubbles || bubbleCount === 0) return 0;
  
  let c = 0;
  for (let i = 0; i < bubbleCount; i++) {
    const b = bubbles[i];
    if (!b) continue;
    // visualTags 또는 emotionalTags에 태그가 포함되면 카운트
    const hasVisualTag = b.visualTags && b.visualTags.includes(tag);
    const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(tag);
    if (hasVisualTag || hasEmotionalTag) {
      c++;
    }
  }
  return c;
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
  if (fontPretendard) {
    textFont(fontPretendard);
  }
  const textY = height / 2 + 30 * responsiveScale - 150; // 화면 중앙 약간 아래쪽에서 150픽셀 위로 (50픽셀 추가 상승)

  // LED 글로우 효과를 위한 여러 레이어 그리기
  // 1단계: 뿌연 글로우 레이어들
  ctx.shadowBlur = 15;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.3})`;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fill(255, 255, 255, alpha * 0.2 * 255);
  text("버블을 터트려 채집했던 그 순간의 감각을 다시 느껴보세요.", width / 2, textY);

  // 2단계: 중간 글로우 레이어
  ctx.shadowBlur = 10;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`;
  fill(255, 255, 255, alpha * 0.4 * 255);
  text("버블을 터트려 채집했던 그 순간의 감각을 다시 느껴보세요.", width / 2, textY);

  // 3단계: 메인 LED 텍스트
  ctx.shadowBlur = 8;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.8})`;
  fill(255, 255, 255, alpha * 255);
  text("버블을 터트려 채집했던 그 순간의 감각을 다시 느껴보세요.", width / 2, textY);

  // 그림자 리셋
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.restore();
  pop();
}

/* =========================
   12. INPUT HANDLING (Unified)
========================= */

function pointerStart(x, y, id) {
  // 좌표 유효성 체크
  if (isNaN(x) || isNaN(y)) return;
  
  pointerDown = true;
  pointerId = id;
  downX = lastX = x;
  downY = lastY = y;
  lastT = millis();
  dragging = false;
  dragMode = 0;
  
  // 상호작용 시작 시 안내 텍스트 숨김
  showInstructionText = false;

  // UI hit test (풀스크린 모드에서도 작동)
  const hit = hitTestUI(x, y);
  if (hit) {
    handleUI(hit);
    pointerDown = false;
    pointerId = -1;
    return;
  }

  // 풀스크린 모드일 때는 여기서 종료
  if (mode === 1) {
    pointerDown = false;
    pointerId = -1;
    return;
  }

  // ✅ 1) 먼저 "아크 버블 자체"를 영역 제한 없이 히트테스트
  const hitArc = hitTestCenterBubble(x, y, true);

  // ✅ 2) 버블을 눌렀거나, 원래 하단 영역이면 캐러셀 드래그/클릭 모드
  if (hitArc !== -1 || y > height * (1 - UI.bottomArcHeightRatio)) {
    dragMode = 2;
    arcDragging = true;
    arcDragStartX = x;

    // 버블을 직접 눌렀다면 그 인덱스 저장 (클릭 확대용)
    clickedBubbleAtPress = hitArc;

    // 현재 필터링된 버블 목록 가져오기
    const src = activeTag !== null 
      ? bubbles.filter((b) => {
          if (!b) return false;
          const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
          const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
          return hasVisualTag || hasEmotionalTag;
        })
      : bubbles;
    arcDragStartIndex = arcCurrentIndex;
    arcTargetIndex = arcCurrentIndex;
  } else {
    // 상단 영역 드래그 비활성화 유지
    dragMode = 0;
    pointerDown = false;
    pointerId = -1;
    return;
  }

  lastActiveTime = millis();
}

function pointerMove(x, y) {
  if (!pointerDown) return;
  
  // 좌표 유효성 체크
  if (isNaN(x) || isNaN(y)) return;

  const dx = x - lastX;
  const dy = y - lastY;

  if (!dragging) {
    const d2 = (x - downX) * (x - downX) + (y - downY) * (y - downY);
    if (d2 > INTERACT.dragDeadzone * INTERACT.dragDeadzone) {
      dragging = true;
    }
  }

  if (dragging) {
    if (dragMode === 2) {
      // 아크 캐러셀 드래그 (원본 스케치와 동일)
      const src = activeTag !== null 
        ? bubbles.filter((b) => {
            if (!b) return false;
            const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
            const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
            return hasVisualTag || hasEmotionalTag;
          })
        : bubbles;
      
      if (src.length > 0) {
        const dragDelta = (x - arcDragStartX) * ARC_DRAG_SENSE;
        arcTargetIndex = arcDragStartIndex - dragDelta;
        arcCurrentIndex = arcTargetIndex; // 드래그 중에는 즉시 반응
        arcVel = -dragDelta * 0.6;
      }
      lastActiveTime = millis();
    }
  }

  lastX = x; lastY = y;
}

function pointerEnd(x, y) {
  if (!pointerDown) return;
  pointerDown = false;
  pointerId = -1;

  // drag end snap
  if (dragMode === 2) {
    arcDragging = false;
    
    if (arcSrcCount > 0) {
      // 현재 위치에서 가장 가까운 정수 인덱스 계산 (최단 거리 고려)
      let nearestIndex = Math.round(arcCurrentIndex);
      
      // 속도가 있으면 속도 방향으로 약간 보정 (더 자연스러운 스냅)
      if (Math.abs(arcVel) > 0.01) {
        // 속도 방향으로 다음/이전 인덱스 고려
        const velocityDirection = arcVel > 0 ? 1 : -1;
        const nextIndex = nearestIndex + velocityDirection;
        
        // 현재 위치와 다음 인덱스의 거리 비교
        const distToNearest = Math.abs(shortestIndexDelta(arcCurrentIndex, nearestIndex, arcSrcCount));
        const distToNext = Math.abs(shortestIndexDelta(arcCurrentIndex, nextIndex, arcSrcCount));
        
        // 다음 인덱스가 더 가까우면 그것으로 변경
        if (distToNext < distToNearest) {
          nearestIndex = nextIndex;
        }
      }
      
      // 최단 거리로 목표 인덱스 설정
      arcTargetIndex = nearestIndex;
      
      // 인덱스를 범위 내로 정규화 (순환)
      if (arcTargetIndex < 0) arcTargetIndex += arcSrcCount;
      if (arcTargetIndex >= arcSrcCount) arcTargetIndex -= arcSrcCount;
      
      // 속도는 자연스럽게 감쇠되도록 유지 (갑자기 0으로 만들지 않음)
      // drawArcCarousel의 애니메이션 로직이 자연스럽게 처리함
    }
    
    // 아크 드래그가 없었고, 버블을 클릭했으면 확대
    const totalDragDistance = Math.abs(x - arcDragStartX);
    const DRAG_THRESHOLD = 10; // 드래그 임계값
    if (totalDragDistance <= DRAG_THRESHOLD && clickedBubbleAtPress !== null && clickedBubbleAtPress !== -1) {
      enterFullscreen(clickedBubbleAtPress);
    }
    
    // 상태 초기화
    clickedBubbleAtPress = null;
  } else {
    // click on center bubble?
    if (!dragging && mode === 0) {
      const hitIdx = hitTestCenterBubble(x, y);
      if (hitIdx !== -1) enterFullscreen(hitIdx);
    }
    clickedBubbleAtPress = null;
  }

  dragging = false;
  dragMode = 0;
  lastActiveTime = millis();
}

// Pointer Events API 설정 (익스플로어와 동일, 태블릿 지원)
function setupPointerEvents() {
  const c = document.querySelector("canvas");
  if (!c) return;

  c.style.touchAction = "none";

  // 좌표 변환 헬퍼 함수 (태블릿 지원 개선)
  function getCanvasCoords(e) {
    const rect = c.getBoundingClientRect();
    // 실제 캔버스 크기와 논리적 크기의 비율 계산
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    // p5.js 캔버스 좌표계로 변환 (스케일 고려)
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // 좌표 범위 체크 및 클램핑
    const clampedX = Math.max(0, Math.min(width, x));
    const clampedY = Math.max(0, Math.min(height, y));
    return { x: clampedX, y: clampedY };
  }

  c.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);
    pointerStart(x, y, e.pointerId);
  }, { passive: false });

  c.addEventListener("pointermove", (e) => {
    // 포인터가 눌려있을 때만 처리
    if (!pointerDown || e.pointerId !== pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);
    pointerMove(x, y);
  }, { passive: false });

  c.addEventListener("pointerup", (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);
    pointerEnd(x, y);
  }, { passive: false });

  c.addEventListener("pointercancel", (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = getCanvasCoords(e);
    pointerEnd(x, y);
  }, { passive: false });

  // 포인터가 캔버스 밖으로 나갔을 때 처리 (document 레벨)
  // 캔버스 내부에서는 처리하지 않도록 체크
  const handleDocumentPointerMove = (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    // 캔버스 내부에서는 캔버스 이벤트가 처리하므로 스킵
    const rect = c.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      return; // 캔버스 내부는 스킵
    }
    // 캔버스 밖에서만 처리
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointerMove(x, y);
  };

  const handleDocumentPointerUp = (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointerEnd(x, y);
  };

  document.addEventListener("pointermove", handleDocumentPointerMove, { passive: false });
  document.addEventListener("pointerup", handleDocumentPointerUp, { passive: false });
}

// p5 events -> unified (폴백용, Pointer Events가 지원되지 않는 경우)
function mousePressed() { 
  if (!pointerDown) pointerStart(mouseX, mouseY, 0); 
}
function mouseDragged() { 
  if (pointerDown) pointerMove(mouseX, mouseY); 
}
function mouseReleased() { 
  if (pointerDown) pointerEnd(mouseX, mouseY); 
}

function touchStarted() {
  if (touches.length > 0 && !pointerDown) {
    pointerStart(touches[0].x, touches[0].y, touches[0].id || 0);
  }
  return false;
}
function touchMoved() {
  if (touches.length > 0 && pointerDown) {
    pointerMove(touches[0].x, touches[0].y);
  }
  return false;
}
function touchEnded() {
  if (pointerDown) {
    pointerEnd(lastX, lastY);
  }
  return false;
}

/* =========================
   13. UI / HIT TEST
========================= */

function hitTestUI(x, y) {
  for (let i = 0; i < uiHitboxes.length; i++) {
    const hb = uiHitboxes[i];
    if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
      return hb.id;
    }
  }
  return null;
}

function handleUI(id) {
  if (mode === 1) {
    if (id === "back_full" || id === "vr_exit") {
      exitFullscreen();
    }
    return;
  }

  if (id === "capture") {
    // 기존 캡쳐 기능 호출 훅
    // captureCurrentView();
    return;
  }
  if (id === "workroom") {
    // openWorkroomModal();
    return;
  }
  if (id === "nav_center") {
    // openNavModal();
    return;
  }
  if (id.startsWith("tag_")) {
    const idx = parseInt(id.split("_")[1], 10);
    const tag = tagList[idx] || null;
    toggleTagFilter(tag);
  }
}

function toggleTagFilter(tag) {
  if (!tag || !bubbles || bubbleCount === 0) return;
  
  const previousTag = activeTag;
  activeTag = (activeTag === tag) ? null : tag;
  
  // 카테고리가 변경되었을 때만 안내 텍스트 다시 표시
  if (previousTag !== activeTag) {
    showInstructionText = true;
  }

  // ✅ 캐러셀 소스는 여기서 한 번만 갱신!
  rebuildArcSource();

  filteredIndices.length = 0;
  if (!activeTag) {
    for (let i = 0; i < bubbleCount; i++) {
      if (bubbles[i]) {
        bubbles[i].filtered = true;
        filteredIndices.push(i);
      }
    }
  } else {
    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbles[i];
      if (!b) continue;
      // visualTags 또는 emotionalTags에 태그가 포함되면 필터링
      const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
      const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
      b.filtered = hasVisualTag || hasEmotionalTag;
      if (b.filtered) filteredIndices.push(i);
    }
  }

  lastActiveTime = millis();
}

/* =========================
   14. FULLSCREEN ENTER/EXIT
========================= */

function enterFullscreen(idx) {
  fullscreenIndex = idx;
  fullscreenAnim = 0;
  fullscreenExitAnim = 0; // 들어갈 때는 0으로 초기화
  mode = 1;
  
  // 버블 터지는 소리 재생
  if (bubblePopSound && bubblePopSound.isLoaded()) {
    try {
      bubblePopSound.setVolume(0.5); // 볼륨 설정 (0.0 ~ 1.0)
      bubblePopSound.play();
    } catch (e) {
      console.warn("버블 터지는 소리 재생 실패:", e);
    }
  }
  
  // 버블의 원래 위치와 크기 저장 (아크 캐러셀에서 중앙 버블 찾기)
  const centerBubble = arcBubbleHitboxes.find(hb => hb.slotIndex === 0);
  if (centerBubble && centerBubble.bubble) {
    fullscreenStartPos.x = centerBubble.x;
    fullscreenStartPos.y = centerBubble.y;
    fullscreenStartPos.r = centerBubble.r;
  } else {
    // 아크 캐러셀에서 찾지 못한 경우 화면 중앙으로 설정
    fullscreenStartPos.x = width * 0.5;
    fullscreenStartPos.y = height * 0.5;
    fullscreenStartPos.r = RENDER.baseBubbleRadius;
  }
  
  // 태그 레이아웃 생성
  const b = bubbles[idx];
  if (b) {
    const visualTags = b.visualTags || [];
    const emotionalTags = b.emotionalTags || [];
    const allTags = [
      ...visualTags,
      ...emotionalTags
    ];
    const imageRadius = min(width, height) * 0.38;
    fullscreenTagLayout = generateRandomTagLayout(allTags, imageRadius, visualTags, emotionalTags);
  }
  
  lastActiveTime = millis();
}

function exitFullscreen() {
  // 역방향 애니메이션 시작
  fullscreenExitAnim = 1;
  fullscreenAnim = 1; // 현재 상태 유지
  // 애니메이션이 완료되면 모드 전환 (updateFullscreen에서 처리)
  lastActiveTime = millis();
}

/* =========================
   15. HIT TEST CENTER BUBBLE
========================= */

// isCenterBubble 함수는 더 이상 사용하지 않음 (전체 탐색 영역 제거됨)

function hitTestCenterBubble(x, y, ignoreZoneCheck = false) {
  if (!bubbles || bubbleCount === 0) return -1;

  // ✅ 기존: 아크 캐러셀 영역 밖이면 바로 -1
  // if (y <= height * (1 - UI.bottomArcHeightRatio)) return -1;

  // ✅ 수정: 무시 옵션이 아닐 때만 "완화된" 게이트 적용
  if (!ignoreZoneCheck) {
    const responsiveScale = getResponsiveScale();
    const extraTop = ARC_HERO_R * responsiveScale; // 중앙 큰 버블이 위로 튀는 만큼 여유
    const gateTop = height * (1 - UI.bottomArcHeightRatio) - extraTop;

    if (y <= gateTop) return -1;
  }

  if (!arcBubbleHitboxes || arcBubbleHitboxes.length === 0) return -1;

  const sortedHitboxes = arcBubbleHitboxes
    .slice() // 7개라 GC 부담 거의 없음
    .sort((a, b) => b.ySort - a.ySort);

  for (const bp of sortedHitboxes) {
    const bubbleX = bp.bubble.pos ? bp.bubble.pos.x : bp.x;
    const bubbleY = bp.bubble.pos ? bp.bubble.pos.y : bp.y;
    const bubbleR = bp.bubble.r > 0 ? bp.bubble.r : bp.r;

    const dx = x - bubbleX;
    const dy = y - bubbleY;
    if (dx * dx + dy * dy <= bubbleR * bubbleR) {
      if (bp.bubble) {
        for (let i = 0; i < bubbleCount; i++) {
          if (bubbles[i] === bp.bubble) return i;
        }
      }
    }
  }

  return -1;
}

/* =========================
   16. HELPERS (NO ALLOC)
========================= */

function hasTag(b, tag) {
  // visualTags 또는 emotionalTags에 태그가 포함되면 true
  const hasVisualTag = b.visualTags && b.visualTags.includes(tag);
  const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(tag);
  return hasVisualTag || hasEmotionalTag;
}

function normalizeIndex(i, n) {
  if (n === 0) return 0; // bubbleCount가 0이면 0 반환
  i %= n;
  if (i < 0) i += n;
  return i;
}

// 태그 바뀔 때만 소스 갱신 함수
function rebuildArcSource() {
  arcSrcIndices.length = 0;

  if (!bubbles || bubbleCount === 0) {
    arcSrcCount = 0;
    return;
  }

  if (activeTag == null) {
    for (let i = 0; i < bubbleCount; i++) {
      if (bubbles[i]) arcSrcIndices.push(i);
    }
  } else {
    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbles[i];
      if (!b) continue;
      const hasV = b.visualTags && b.visualTags.includes(activeTag);
      const hasE = b.emotionalTags && b.emotionalTags.includes(activeTag);
      if (hasV || hasE) arcSrcIndices.push(i);
    }
  }

  arcSrcCount = arcSrcIndices.length;
  // 안전하게 인덱스 보정
  arcTargetIndex = clamp(Math.round(arcTargetIndex), 0, Math.max(0, arcSrcCount-1));
  arcCurrentIndex = arcTargetIndex;
}

// 원본 스케치와 동일한 positiveMod 함수
function positiveMod(n, m) {
  return ((n % m) + m) % m;
}

// 원본 스케치와 동일한 getResponsiveScale 함수
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

// 검색창 제거됨 - 아크 메트릭 계산용 헬퍼 함수
function getSearchMetrics() {
  const responsiveScale = getResponsiveScale();
  const NAV_Y = 20;
  const NAV_H = uiImages["navigation-bar.png"] ? uiImages["navigation-bar.png"].height * 0.455 * responsiveScale : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;
  // 검색창이 없으므로 네비게이션 바 아래 위치 반환
  const Y = NAV_BOTTOM + 20 * responsiveScale;
  return { W: 0, H: 0, X: 0, Y, bottom: Y };
}

// 원본 스케치와 동일한 getArcMetrics 함수
function getArcMetrics() {
  const responsiveScale = getResponsiveScale();
  const { bottom: SEARCH_BOTTOM } = getSearchMetrics();

  const arcCenterX = width * 0.5;
  // 더 큰 원의 일부처럼 보이도록 반지름을 크게 증가
  const arcRadius = Math.min(width, height) * 0.65 * responsiveScale; // 0.28 → 0.8로 증가 (훨씬 큰 원)
  // 원의 윗부분만 보이도록 중심을 더 아래로 이동 (더 큰 원이므로 더 아래로)
  // 원의 상단이 화면 중앙 근처에 오도록, 하단은 화면 밖으로
  const arcCenterY = height + arcRadius * 0.25 - 50; // 중심을 더 아래로 내려서 평평한 아크 만들기 (50픽셀 위로 올림)
  const arcTopY = arcCenterY - arcRadius; // 아크 상단 y
  const arcBottomY = arcCenterY + arcRadius * 0.1; // 아래쪽(실제 보이는 범위)
  return { arcCenterX, arcCenterY, arcRadius, arcTopY, arcBottomY };
}

function mod(a, m) {
  a %= m;
  return a < 0 ? a + m : a;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// cover-fit 계산 헬퍼 (반복되는 cover 계산 통합)
function coverRect(imgW, imgH, boxW, boxH) {
  const imgR = imgW / imgH;
  const boxR = boxW / boxH;
  let w, h, x, y;
  if (imgR > boxR) {
    h = boxH;
    w = imgR * h;
    x = (boxW - w) / 2;
    y = 0;
  } else {
    w = boxW;
    h = w / imgR;
    x = 0;
    y = (boxH - h) / 2;
  }
  return { w, h, x, y };
}

// 인덱스 순환에서 최단 거리 계산 (각도와 유사한 개념)
function shortestIndexDelta(current, target, count) {
  if (count === 0) return 0;
  let diff = target - current;
  if (diff > count / 2) diff -= count;
  if (diff < -count / 2) diff += count;
  return diff;
}

// 인덱스 기반 부드러운 보간 (속도 완화)
function lerpIndex(current, target, t, count) {
  const d = shortestIndexDelta(current, target, count);
  return current + d * t;
}


/* =========================
   17. DEBUG UI
========================= */

function drawFPS() {
  fpsSmoother += (frameRate() - fpsSmoother) * 0.08;
  push();
  fill(255);
  textSize(12);
  textAlign(LEFT, TOP);
  text("FPS: " + fpsSmoother.toFixed(1), 8, height - 18);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 익스플로어와 동일: 고해상도 디스플레이에서 픽셀 밀도 2배로 설정
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1);
  initBackground();
}