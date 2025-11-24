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
const ARC_DAMP = 0.85; // 관성 감쇠 (더 빠르게 멈춤)
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

// 캐러셀 변수 (carouselOffset, carouselVel, carouselSnapping)
let carouselOffset = 0; // 캐러셀 오프셋
let carouselVel = 0; // 캐러셀 속도
let carouselSnapping = false; // 캐러셀 스냅 상태

// 버블 스프라이트 캐시 (원본 스케치와 동일)
const SPRITES = new Map(); // 스프라이트 캐시 (key: "bucket|hue", val: {g, size})
const SPRITE_STEP = 6; // 반지름 버킷 간격(px) - 스프라이트 캐시용
const BUBBLE_GLOSS = true; // 글로스 효과 활성화

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
let visibleIndices = [];     // viewport culling result
let filteredIndices = [];    // current filter result
let tmpIndices = [];         // scratch reuse

// hex world
let worldW = 0, worldH = 0;
let camX = 0, camY = 0;
let camVX = 0, camVY = 0;

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

// 버블 색상 생성 함수 (원본 스케치와 동일)
function bubbleColor(seed) {
  const h = (seed * 137.5) % 360;
  return {
    outer: `hsl(${h} 70% 55% / 0.95)`,
    inner: `hsl(${(h + 20) % 360} 80% 35% / 0.75)`,
  };
}

// 스프라이트 캐시 시스템 (성능 최적화) - 원본 스케치와 동일
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
  g.drawingContext.imageSmoothingEnabled = true;
  g.drawingContext.imageSmoothingQuality = "high";
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
  const bubbleCapImg = uiImages["bubble-cap.png"];
  if (bubbleCapImg && bubbleCapImg.width > 0) {
    g.push();
    g.imageMode(g.CENTER);
    g.image(bubbleCapImg, bucket, bucket, size, size);
    g.pop();
  }

  const sprite = { g, size };
  SPRITES.set(key, sprite);
  return sprite;
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
class ImageManager {
  constructor() {
    this.map = Object.create(null);  // key -> {state,img}
    this.keys = [];                 // stable key list
    this.maxConcurrent = 3;
    this.loadingCount = 0;
  }

  registerKeys(files) {
    this.keys.length = 0;
    for (let i = 0; i < files.length; i++) {
      const k = files[i];
      this.map[k] = { state: 0, img: null };
      this.keys.push(k);
    }
  }

  request(key) {
    const e = this.map[key];
    if (!e) return null;
    if (e.state === 2 || e.state === 3) return e.img;

    if (e.state === 0 && this.loadingCount < this.maxConcurrent) {
      e.state = 1;
      this.loadingCount++;
      const path = PATHS.bubbleImgs + key;
      loadImage(
        path,
        (img) => {
          e.img = img;
          e.state = 2;
          this.loadingCount--;
          spriteCache.invalidateAll(); // image 들어오면 스프라이트 무효화
        },
        () => {
          e.img = null;
          e.state = 3;
          this.loadingCount--;
        }
      );
    }
    return e.img;
  }

  state(key) {
    const e = this.map[key];
    return e ? e.state : 3;
  }
}

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
  imageManager = new ImageManager();
  imageLoader = new ImageLoader(); // 익스플로어와 동일한 ImageLoader

  // JSON 비동기 로드
  loadBubbleDataFromJSON();
  
  initWorld();
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
  imageManager.registerKeys(files);

  // bubbleImages 배열 초기화 (원본 스케치와 동일)
  bubbleImages = new Array(files.length);
  for (let i = 0; i < files.length; i++) {
    bubbleImages[i] = null; // 나중에 지연 로딩
  }

  bubbles = new Array(bubbleCount);
  for (let i = 0; i < bubbleCount; i++) {
    const b = new Bubble();
    const d = norm[i % norm.length];
    const imgKey = d.imageFile || files[i % files.length] || "";
    b.setData(d, imgKey);
    // imageIndex 설정 (원본 스케치와 동일)
    b.imageIndex = files.indexOf(imgKey) >= 0 ? files.indexOf(imgKey) : null;
    b.hueSeed = i + 1; // 색상 시드 설정
    // 이미지 경로 설정 (익스플로어와 동일)
    b.imgPath = imgKey ? PATHS.bubbleImgs + imgKey : null;
    bubbles[i] = b;
  }

  tagList = DATA_SCHEMA_ADAPTER.collectTags(norm);
  activeTag = null;

  // filteredIndices init (all)
  filteredIndices.length = 0;
  for (let i = 0; i < bubbleCount; i++) filteredIndices.push(i);
  
  // 데이터 로드 후 월드 초기화 (이미 setup에서 호출되었을 수 있으므로 조건부)
  if (worldW === 0 && worldH === 0) {
    initWorld();
  }

  // 버블 이미지 지연 로딩은 ImageLoader가 자동으로 처리
}

function initWorld() {
  // bubbles가 아직 초기화되지 않았으면 스킵
  if (!bubbles || bubbleCount === 0) return;
  
  // hex grid size derived from count
  const cols = Math.ceil(Math.sqrt(bubbleCount));
  const rows = Math.ceil(bubbleCount / cols);

  const spacing = RENDER.hexSpacing;
  worldW = cols * spacing * 0.9;
  worldH = rows * spacing * 0.8;

  // place bubbles in hex pattern
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const y = r * spacing * 0.86;
    const xOffset = (r & 1) ? spacing * 0.5 : 0;
    for (let c = 0; c < cols; c++) {
      if (idx >= bubbleCount) break;
      const x = c * spacing + xOffset;
      const baseR = RENDER.baseBubbleRadius + (idx % 5);
      if (bubbles[idx]) {
        bubbles[idx].resetPlacement(x, y, baseR);
      }
      idx++;
    }
  }

  camX = worldW * 0.5 - width * 0.5;
  camY = worldH * 0.55 - height * 0.5;
  camVX = camVY = 0;
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
    if (imgRatio > screenRatio) {
      // 이미지가 더 넓음 → 높이에 맞춰 확대
      drawH = height;
      drawW = imgRatio * drawH;
      bgOffsetX = (width - drawW) / 2;
      bgOffsetY = 0;
    } else {
      // 이미지가 더 높음 → 너비에 맞춰 확대
      drawW = width;
      drawH = drawW / imgRatio;
      bgOffsetX = 0;
      bgOffsetY = (height - drawH) / 2;
    }

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
}

/* =========================
   7. UPDATE CORE
========================= */

function updatePanPhysics() {
  // inertia decay
  if (!dragging && (Math.abs(camVX) > 0.01 || Math.abs(camVY) > 0.01)) {
    camX += camVX;
    camY += camVY;
    camVX *= INTERACT.inertiaDecay;
    camVY *= INTERACT.inertiaDecay;
    lastActiveTime = millis();
  }

  // torus wrap camera
  camX = mod(camX, worldW);
  camY = mod(camY, worldH);
}

function computeVisibleIndices() {
  visibleIndices.length = 0;
  
  // bubbles가 아직 초기화되지 않았으면 스킵
  if (!bubbles || bubbleCount === 0) return;

  // viewport bounds in world coords
  const padding = RENDER.maxBubbleRadius + 40;
  const vx0 = camX - padding;
  const vy0 = camY - padding;
  const vx1 = camX + width + padding;
  const vy1 = camY + height + padding;

  // simple cull using wrap copies
  for (let i = 0; i < filteredIndices.length; i++) {
    const bi = filteredIndices[i];
    const b = bubbles[bi];
    
    // 버블이 존재하지 않으면 스킵
    if (!b) continue;

    // normalize to camera wrapped space
    const wx = wrapToCam(b.ax, camX, worldW);
    const wy = wrapToCam(b.ay, camY, worldH);

    if (wx >= vx0 && wx <= vx1 && wy >= vy0 && wy <= vy1) {
      visibleIndices.push(bi);
    }
  }
}

function updateBubbles() {
  // bubbles가 아직 초기화되지 않았으면 스킵
  if (!bubbles || bubbleCount === 0) return;
  
  const cx = camX + width * 0.5;
  const cy = camY + height * 0.55;

  for (let k = 0; k < visibleIndices.length; k++) {
    const i = visibleIndices[k];
    const b = bubbles[i];
    
    // 버블이 존재하지 않으면 스킵
    if (!b) continue;

    // apply wrap around camera to keep continuity
    const wx = wrapToCam(b.ax, camX, worldW);
    const wy = wrapToCam(b.ay, camY, worldH);
    b.wx = wx;
    b.wy = wy;

    // fisheye / size by distance (avoid sqrt when possible)
    const dx = wx - cx;
    const dy = wy - cy;
    const d2 = dx * dx + dy * dy;

    let targetR = b.rBase;
    if (d2 < RENDER.centerInfluenceRadius * RENDER.centerInfluenceRadius) {
      const d = Math.sqrt(d2); // only near center
      const t = 1 - d / RENDER.centerInfluenceRadius;
      targetR = b.rBase + t * (RENDER.maxBubbleRadius - b.rBase) * 0.6;
    }

    // cheap smoothing
    b.r += (targetR - b.r) * 0.12;

    // alpha fade by distance
    let aT = 1;
    if (d2 > RENDER.alphaFadeRadius * RENDER.alphaFadeRadius) {
      aT = RENDER.minAlpha;
    } else if (d2 > (RENDER.alphaFadeRadius * 0.5) ** 2) {
      const d = Math.sqrt(d2);
      aT = map(d, RENDER.alphaFadeRadius * 0.5, RENDER.alphaFadeRadius, 1, RENDER.minAlpha);
    }

    // filtering alpha target
    if (!b.filtered) aT = 0;

    b.alphaTarget = aT;
    b.alpha += (b.alphaTarget - b.alpha) * 0.14;

    // lazy image request only if alpha meaningful
    if (b.alpha > 0.05 && b.imgState !== 2 && b.imgState !== 3) {
      const img = imageManager.request(b.imgKey);
      b.imgState = imageManager.state(b.imgKey);
      b.img = img;
    }
  }
}

/* =========================
   8. DRAW BUBBLES
========================= */

function drawBubbles() {
  // bubbles가 아직 초기화되지 않았으면 스킵
  if (!bubbles || bubbleCount === 0) return;
  
  noStroke();

  for (let k = 0; k < visibleIndices.length; k++) {
    const i = visibleIndices[k];
    const b = bubbles[i];
    
    // 버블이 존재하지 않으면 스킵
    if (!b) continue;
    if (b.alpha <= 0.01) continue;

    const rBucket = spriteCache.bucketSize(b.r);
    const sprite = spriteCache.getCircle(rBucket, true);

    const x = b.wx - camX;
    const y = b.wy - camY;

    push();
    translate(x, y);
    tint(255, 255 * b.alpha);

    // image if loaded
    if (b.imgState === 2 && b.img) {
      imageMode(CENTER);
      image(b.img, 0, 0, b.r * 2, b.r * 2);
    } else {
      // fallback circle
      imageMode(CENTER);
      image(sprite, 0, 0, rBucket * 2, rBucket * 2);
    }

    noTint();

    // title only for near center bubble
    if (isCenterBubble(b)) {
      if (fontPretendard) textFont(fontPretendard);
      fill(255, 255, 255, 230 * b.alpha);
      textSize(clamp(b.r * 0.28, 11, 20));
      textStyle(BOLD);
      text(b.title, 0, b.r + 18);
    }

    pop();
  }
}

/* =========================
   9. ARC CAROUSEL
========================= */

// 아크 캐러셀 렌더링(필터링된 버블 사용) - 원본 스케치와 동일
function drawArcCarousel() {
  // 필터링된 버블 사용 (원본 스케치와 동일)
  const src = activeTag !== null 
    ? bubbles.filter((b, idx) => {
        if (!b) return false;
        const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
        const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
        return hasVisualTag || hasEmotionalTag;
      })
    : bubbles;
  
  if (!src || src.length === 0) return;

  const { arcCenterX, arcCenterY, arcRadius, arcTopY, arcBottomY } = getArcMetrics();

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
  // 히트박스 정보 초기화 (매 프레임마다 업데이트)
  arcBubbleHitboxes.length = 0;
  
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
    const b = src[idx];
    if (!b) continue;
    
    drawList.push({ x, y, r, bubble: b, ySort: y, slotIndex: i });
    
    // 히트박스 정보 저장 (실제 그려지는 위치와 크기)
    arcBubbleHitboxes.push({
      x: x,
      y: y,
      r: r,
      bubble: b,
      slotIndex: i,
      ySort: y
    });
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

    // 이미지 요청 (익스플로어와 동일)
    if (b.imgPath && imageLoader) {
      imageLoader.request(b.imgPath);
      imageLoader.markVisible(b.imgPath);
    }

    // 그림
    b.drawAt(b.pos.x, b.pos.y);

    // 중앙 후보(슬롯 인덱스가 0인 것)
    if (it.slotIndex === 0) {
      centerCandidate = it;
    }
  }

  // 이미지 로더 업데이트 (익스플로어와 동일)
  if (imageLoader) {
    imageLoader.update(performance.now());
  }

  // 중앙 후보에만 텍스트를 추가 (익스플로어 스타일)
  if (centerCandidate) {
    const b = centerCandidate.bubble;
    const x = centerCandidate.x;
    const y = centerCandidate.y;
    const r = centerCandidate.r;
    
    const s = responsiveScale;
    const centerMultiplier = 1.3; // 주인공 버블 1.3배 확대
    
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    noStroke();
    textAlign(CENTER, CENTER);
    if (fontPretendard) textFont(fontPretendard);
    
    // 제목 (1.2배 크기, 700 굵기, 흰색, alpha 230) - 익스플로어와 동일
    const titleSize = 18 * s * centerMultiplier;
    const titleFontSize = titleSize * 1.2;
    drawingContext.font = `700 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
    drawingContext.fillStyle = `rgba(255, 255, 255, ${230 / 255})`;
    const infoY = y + r + 40 * s;
    drawingContext.fillText(b.name || b.title, x, infoY);
    
    // 감정 2개, 비주얼 2개만 표시 (상위 4개) - 익스플로어와 동일
    const visualTags = (b.visualTags || []).filter(Boolean).slice(0, 2);
    const emotionalTags = (b.emotionalTags || []).filter(Boolean).slice(0, 2);
    const tagGroups = [
      { list: visualTags },
      { list: emotionalTags }
    ].filter(group => group.list.length > 0);
    
    if (tagGroups.length > 0) {
      const tagSize = 14 * s * centerMultiplier;
      const tagFontSize = tagSize * 1.3;
      const lineGap = 28 * s * centerMultiplier;
      drawingContext.font = `400 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
      drawingContext.fillStyle = `rgba(255, 255, 255, ${180 / 255})`;
      
      tagGroups.forEach((group, idx) => {
        const tagText = group.list.map(tag => `#${tag}`).join("  ");
        drawingContext.fillText(tagText, x, infoY + 35 * s * centerMultiplier + idx * lineGap);
      });
    }
    
    drawingContext.restore();
    pop();
  }

  updateCarouselPhysics();
}

function updateCarouselPhysics() {
  // 아크 캐러셀 물리 업데이트는 drawArcCarousel 내부에서 처리됨
  // 여기서는 관성 감쇠만 처리
  if (!arcDragging && Math.abs(arcVel) > 0.0005) {
    const src = activeTag !== null 
      ? bubbles.filter((b) => {
          if (!b) return false;
          const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
          const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
          return hasVisualTag || hasEmotionalTag;
        })
      : bubbles;
    
    if (src.length > 0) {
      arcTargetIndex -= arcVel;
      arcVel *= ARC_DAMP;
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
      const canvasRatio = width / height;
      const imgRatio = bgImg.width / bgImg.height;

      let dw, dh;
      if (imgRatio > canvasRatio) {
        dh = height;
        dw = height * imgRatio;
      } else {
        dw = width;
        dh = width / imgRatio;
      }

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

  // 두 태그가 겹치는지 확인하는 함수
  function checkCollision(x, y, w, h, existingLayout) {
    for (const existing of existingLayout) {
      const ex = existing.x - existing.w / 2;
      const ey = existing.baseY - existing.h / 2;
      const ew = existing.w;
      const eh = existing.h;
      
      const nx = x - w / 2;
      const ny = y - h / 2;
      
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
    
    // 클리핑 먼저 적용 (화면 밖으로 나가는 부분 제거)
    drawingContext.beginPath();
    drawingContext.rect(0, 0, width, height);
    drawingContext.clip();
    
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

  // 태그 표시 (랜덤 배치) - 나갈 때는 더 빨리 사라지도록
  const tagThreshold = isExiting ? 0.7 : 0.5; // 나갈 때는 0.7 이상일 때만 표시
  if (fullscreenTagLayout.length > 0 && anim > tagThreshold) {
    // 나갈 때는 태그 알파를 더 빠르게 감소
    const tagAlpha = isExiting ? (anim - tagThreshold) / (1 - tagThreshold) : anim;
    drawFullscreenTags(tagAlpha);
  }
}

// VR모드 나가기 버튼 그리기 (태그와 동일한 스타일)
function drawVRExitButton(anim) {
  const responsiveScale = getResponsiveScale();
  const centerX = width / 2;
  const topY = 60 * responsiveScale;
  
  // 태그와 동일한 크기 스타일 적용
  const fontSize = 16 * 1.4 * responsiveScale * 1.3;
  const padding = 28 * responsiveScale * 1.3;
  const tagH = 56 * responsiveScale * 1.3;
  const tagR = tagH / 2;
  
  // 텍스트 크기 측정
  textSize(fontSize);
  if (fontPretendard) textFont(fontPretendard);
  const buttonText = "> VR모드 나가기";
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
  drawingContext.font = `700 ${fontSize}px "Pretendard Variable", Pretendard, sans-serif`;
  drawingContext.shadowBlur = 4;
  drawingContext.shadowColor = "rgba(0,0,0,0.25)";
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 2;
  text(buttonText, centerX, buttonY + buttonHeight / 2);
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
function drawFullscreenTags(anim) {
  const t = millis() * 0.001;
  
  fullscreenTagLayout.forEach((L, idx) => {
    // 부드러운 떠다니는 애니메이션
    const floatY = Math.sin(t + idx) * 3 * getResponsiveScale();
    const y = L.baseY + floatY;
    
    const rectX = L.x - L.w / 2;
    const rectY = y - L.h / 2;
    
    // 태그 그리기 (서클 투 캡쳐 스타일 - 백드롭 블러 포함, 태그 타입에 따라 색상 적용)
    push();
    drawingContext.save();
    const tagType = L.tagType || null;
    drawGlassLabelFullscreen(rectX, rectY, L.w, L.h, L.r, anim, tagType);
    drawingContext.restore();
    pop();
    
    // 텍스트 그리기 (원래대로)
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    drawingContext.globalAlpha = anim;
    fill(255, 255);
    textSize(L.fontSize);
    if (fontPretendard) textFont(fontPretendard);
    drawingContext.font = `700 ${L.fontSize}px "Pretendard Variable", Pretendard, sans-serif`;
    drawingContext.shadowBlur = 4;
    drawingContext.shadowColor = "rgba(0,0,0,0.25)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 2;
    text(L.label, L.x, y);
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

    // 텍스트 그리기 (태그와 동일한 스타일)
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    
    // 태그 이름
    textAlign(LEFT, CENTER);
    if (fontPretendard) textFont(fontPretendard);
    textSize(12 * 1.5); // 글자 크기 1.5배
    fill(selected ? 255 : 200);
    drawingContext.shadowBlur = selected ? 4 : 2;
    drawingContext.shadowColor = "rgba(0,0,0,0.25)";
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 1;
    text(tagText, x + textPadding, y + cardH * 0.5);
    
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
  const textY = height / 2 + 30 * responsiveScale - 100; // 화면 중앙 약간 아래쪽에서 100픽셀 위로

  // LED 글로우 효과를 위한 여러 레이어 그리기
  // 1단계: 뿌연 글로우 레이어들
  ctx.shadowBlur = 15;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.3})`;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  fill(255, 255, 255, alpha * 0.2 * 255);
  text("버블을 터트려 채집 환경으로 돌아가보세요.", width / 2, textY);

  // 2단계: 중간 글로우 레이어
  ctx.shadowBlur = 10;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`;
  fill(255, 255, 255, alpha * 0.4 * 255);
  text("버블을 터트려 채집 환경으로 돌아가보세요.", width / 2, textY);

  // 3단계: 메인 LED 텍스트
  ctx.shadowBlur = 8;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.8})`;
  fill(255, 255, 255, alpha * 255);
  text("버블을 터트려 채집 환경으로 돌아가보세요.", width / 2, textY);

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
    // 스냅: 가장 가까운 정수 인덱스로 이동
    const src = activeTag !== null 
      ? bubbles.filter((b) => {
          if (!b) return false;
          const hasVisualTag = b.visualTags && b.visualTags.includes(activeTag);
          const hasEmotionalTag = b.emotionalTags && b.emotionalTags.includes(activeTag);
          return hasVisualTag || hasEmotionalTag;
        })
      : bubbles;
    
    if (src.length > 0) {
      arcTargetIndex = Math.round(arcCurrentIndex);
      // 인덱스를 범위 내로 정규화
      if (arcTargetIndex < 0) arcTargetIndex += src.length;
      if (arcTargetIndex >= src.length) arcTargetIndex -= src.length;
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

  // 좌표 변환 헬퍼 함수 (익스플로어와 동일한 방식)
  function getCanvasCoords(e) {
    const rect = c.getBoundingClientRect();
    // p5.js 캔버스 좌표계로 변환
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
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
  
  activeTag = (activeTag === tag) ? null : tag;

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
  const arcCenterY = height + arcRadius * 0.25; // 중심을 더 아래로 내려서 평평한 아크 만들기
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

function wrapToCam(pos, cam, size) {
  // keep pos near cam (torus)
  let p = pos;
  const half = size * 0.5;
  const d = p - cam;
  if (d > half) p -= size;
  else if (d < -half) p += size;
  return p;
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