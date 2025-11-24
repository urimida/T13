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
  mic: "../public/assets/public-imgs/mike.png", // 마이크 버튼
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
  searchScaleRatio: 0.7 * 0.7, // 원본 스케치와 동일
  searchWidthRatio: 0.2, // 원본 스케치와 동일
  leftCardsWidthRatio: 0.17,
  leftCardsPaddingRatio: 0.02,
  bottomArcHeightRatio: 0.28,
  glassAlpha: 0.22,
  searchWRatio: 0.56, // 익스플로어와 동일
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

// 버블 스프라이트 캐시 (원본 스케치와 동일)
const SPRITES = new Map(); // 스프라이트 캐시 (key: "bucket|hue", val: {g, size})
const SPRITE_STEP = 6; // 반지름 버킷 간격(px) - 스프라이트 캐시용
const BUBBLE_GLOSS = true; // 글로스 효과 활성화

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

// modes
let mode = 0; // 0 normal, 1 fullscreen
let fullscreenIndex = -1;
let fullscreenAnim = 0; // 0 -> 1

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
   3. POOLS & CLASSES
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

    // data
    this.title = "";
    this.imageFile = "";
    this.tags = null;
    this.visualTags = null;
    this.emotionalTags = null;
    this.desc = "";
    this.imgKey = "";

    // image state
    this.imgState = 0; // 0 unloaded, 1 loading, 2 loaded, 3 failed
    this.img = null;   // reference from manager

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

  // 원본 스케치와 동일한 drawAt 메서드
  drawAt(x, y) {
    // alpha가 너무 작으면 그리지 않음
    if (this.alpha < 0.01) return;

    // 스프라이트 캐시 사용 (성능 최적화)
    const { g, size } = getBubbleSprite(this.r, this.hueSeed, this.imageIndex);
    push();
    drawingContext.save();

    drawingContext.globalAlpha = this.alpha; // 투명도 적용
    imageMode(CENTER);
    image(g, x, y, size, size); // 매 프레임 경량 복사만

    drawingContext.restore();
    pop();
  }
}

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
  uiImages["mike.png"] = loadImage(PATHS.mic); // 마이크 버튼 추가
  uiImages["lucide_search.svg"] = loadImage(PATHS.uiImgs + "lucide_search.svg");
  uiImages["bg.png"] = loadImage(PATHS.uiImgs + "bg.png");
  uiImages["bubble-cap.png"] = loadImage(PATHS.uiImgs + "bubble-cap.png");
}

function setup() {
  pixelDensity(1); // tablet 안정성
  createCanvas(windowWidth, windowHeight);
  textFont(fontPretendard);
  textAlign(CENTER, CENTER);

  spriteCache = new SpriteCache();
  imageManager = new ImageManager();

  // JSON 비동기 로드
  loadBubbleDataFromJSON();
  
  initWorld();
  initBackground();
  initUI();

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
  imageManager.registerKeys(files);

  bubbles = new Array(bubbleCount);
  for (let i = 0; i < bubbleCount; i++) {
    const b = new Bubble();
    const d = norm[i % norm.length];
    const imgKey = d.imageFile || files[i % files.length] || "";
    b.setData(d, imgKey);
    // imageIndex 설정 (원본 스케치와 동일)
    b.imageIndex = files.indexOf(imgKey) >= 0 ? files.indexOf(imgKey) : null;
    b.hueSeed = i + 1; // 색상 시드 설정
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

  if (mode === 0) {
    drawArcCarousel();
    drawUI();
  } else {
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

function drawArcCarousel() {
  // bubbles가 아직 초기화되지 않았으면 스킵
  if (!bubbles || bubbleCount === 0) return;
  
  const arcH = height * UI.bottomArcHeightRatio;
  const centerY = height + arcH * 0.25;
  const centerX = width * 0.5;
  const radius = width * 0.52;

  // slots: -3..3 around center
  const baseIndex = normalizeIndex(Math.round(carouselOffset), bubbleCount);
  const frac = carouselOffset - Math.round(carouselOffset);

  for (let s = -3; s <= 3; s++) {
    const idx = normalizeIndex(baseIndex + s, bubbleCount);
    const b = bubbles[idx];
    
    // 버블이 존재하지 않으면 스킵
    if (!b) continue;

    const t = (s - frac) / 3; // -1..1
    const angle = t * Math.PI * 0.55; // semicircle top
    const bx = centerX + Math.sin(angle) * radius;
    const by = centerY - Math.cos(angle) * radius;

    const scale = 1 - Math.abs(t) * 0.55;
    const r = clamp(RENDER.maxBubbleRadius * 0.42 * scale, 18, 70);

    // show only filtered bubbles in carousel
    if (!b.filtered) continue;

    push();
    translate(bx, by);
    let alpha = (s === 0) ? 1 : 0.7;
    tint(255, 255 * alpha);

    if (b.imgState === 2 && b.img) {
      imageMode(CENTER);
      image(b.img, 0, 0, r * 2, r * 2);
    } else {
      const sprite = spriteCache.getCircle(spriteCache.bucketSize(r), true);
      imageMode(CENTER);
      image(sprite, 0, 0, r * 2, r * 2);
    }
    noTint();

    // highlight center slot
    if (s === 0) {
      if (fontPretendard) textFont(fontPretendard);
      fill(255, 255, 255, 255);
      textSize(20);
      textStyle(BOLD);
      text(b.title, 0, r + 30);
      
      let currentY = r + 55;
      // visualTags 표시 (흰색, 최대 3개)
      if (b.visualTags && b.visualTags.length > 0) {
        fill(255, 255, 255, 220);
        textSize(14);
        textStyle(NORMAL);
        const visualTagsText = b.visualTags.slice(0, 3).map(tag => `#${tag}`).join("  ");
        text(visualTagsText, 0, currentY);
        currentY += 25;
      }
      // emotionalTags 표시 (노란색, 최대 3개)
      if (b.emotionalTags && b.emotionalTags.length > 0) {
        fill(255, 255, 0, 220);
        textSize(14);
        textStyle(NORMAL);
        const emotionalTagsText = b.emotionalTags.slice(0, 3).map(tag => `#${tag}`).join("  ");
        text(emotionalTagsText, 0, currentY);
      }
    }
    pop();
  }

  updateCarouselPhysics();
}

function updateCarouselPhysics() {
  if (!dragging && Math.abs(carouselVel) > 0.0005) {
    carouselOffset += carouselVel;
    carouselVel *= INTERACT.inertiaDecay;
    lastActiveTime = millis();
  }

  if (!dragging && carouselSnapping) {
    const target = Math.round(carouselOffset);
    carouselOffset += (target - carouselOffset) * INTERACT.snapSpeed;
    if (Math.abs(target - carouselOffset) < 0.001) {
      carouselOffset = target;
      carouselSnapping = false;
    }
    lastActiveTime = millis();
  }
}

/* =========================
   10. FULLSCREEN MODE
========================= */

function updateFullscreen() {
  fullscreenAnim += (1 - fullscreenAnim) * 0.12;
  if (fullscreenAnim > 0.999) fullscreenAnim = 1;
}

function drawFullscreen() {
  // bubbles가 아직 초기화되지 않았으면 일반 모드로 복귀
  if (!bubbles || bubbleCount === 0 || fullscreenIndex < 0 || fullscreenIndex >= bubbleCount) {
    mode = 0;
    return;
  }
  
  const b = bubbles[fullscreenIndex];
  if (!b) { mode = 0; return; }

  // dim background
  push();
  fill(0, 180);
  rect(0, 0, width, height);
  pop();

  const anim = fullscreenAnim;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const r = lerp(RENDER.maxBubbleRadius * 0.5, min(width, height) * 0.38, anim);

  push();
  translate(cx, cy);
  tint(255, 255);

  if (b.imgState === 2 && b.img) {
    imageMode(CENTER);
    image(b.img, 0, 0, r * 2, r * 2);
  } else {
    const sprite = spriteCache.getCircle(spriteCache.bucketSize(r), true);
    imageMode(CENTER);
    image(sprite, 0, 0, r * 2, r * 2);
  }
  noTint();

  fill(255);
  textSize(22);
  text(b.title, 0, r + 30);

  pop();

  drawFullscreenBars();
}

function drawFullscreenBars() {
  const responsiveScale = min(width, height) / 800;
  const barH = 40 * responsiveScale;
  const topY = 60 * responsiveScale;
  const centerX = width / 2;
  
  // 날씨 바
  const weatherBarWidth = 200 * responsiveScale;
  const weatherBarHeight = 40 * responsiveScale;
  const weatherBarX = centerX - weatherBarWidth / 2;
  const weatherBarY = topY;
  
  push();
  drawingContext.save();
  const weatherGradient = drawingContext.createLinearGradient(
    weatherBarX, weatherBarY,
    weatherBarX, weatherBarY + weatherBarHeight
  );
  weatherGradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  weatherGradient.addColorStop(1, "rgba(255, 255, 255, 0.1)");
  drawingContext.fillStyle = weatherGradient;
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.3)";
  roundedRect(weatherBarX, weatherBarY, weatherBarWidth, weatherBarHeight, 20 * responsiveScale);
  drawingContext.fill();
  drawingContext.restore();
  pop();
  
  if (fontPretendard) textFont(fontPretendard);
  textAlign(CENTER, CENTER);
  fill(255, 255, 255, 255);
  textSize(16 * responsiveScale);
  textStyle(NORMAL);
  text("☀️ 맑음 22°C", centerX, weatherBarY + weatherBarHeight / 2);
  
  // 조도 바
  const lightBarWidth = 200 * responsiveScale;
  const lightBarHeight = 40 * responsiveScale;
  const lightBarX = centerX - lightBarWidth / 2;
  const lightBarY = topY + weatherBarHeight + 15 * responsiveScale;
  
  push();
  drawingContext.save();
  const lightGradient = drawingContext.createLinearGradient(
    lightBarX, lightBarY,
    lightBarX, lightBarY + lightBarHeight
  );
  lightGradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
  lightGradient.addColorStop(1, "rgba(255, 255, 255, 0.1)");
  drawingContext.fillStyle = lightGradient;
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.3)";
  roundedRect(lightBarX, lightBarY, lightBarWidth, lightBarHeight, 20 * responsiveScale);
  drawingContext.fill();
  drawingContext.restore();
  pop();
  
  fill(255, 255, 255, 255);
  textSize(16 * responsiveScale);
  text("💡 조도 850 lux", centerX, lightBarY + lightBarHeight / 2);
  
  // 뒤로가기 버튼
  const backButtonWidth = 120 * responsiveScale;
  const backButtonHeight = 40 * responsiveScale;
  const backButtonX = centerX - backButtonWidth / 2;
  const backButtonY = lightBarY + lightBarHeight + 15 * responsiveScale;
  
  push();
  drawingContext.save();
  const backGradient = drawingContext.createLinearGradient(
    backButtonX, backButtonY,
    backButtonX, backButtonY + backButtonHeight
  );
  backGradient.addColorStop(0, "rgba(255, 255, 255, 0.25)");
  backGradient.addColorStop(1, "rgba(255, 255, 255, 0.15)");
  drawingContext.fillStyle = backGradient;
  drawingContext.shadowBlur = 15;
  drawingContext.shadowColor = "rgba(0, 0, 0, 0.4)";
  roundedRect(backButtonX, backButtonY, backButtonWidth, backButtonHeight, 20 * responsiveScale);
  drawingContext.fill();
  drawingContext.restore();
  pop();
  
  fill(255, 255, 255, 255);
  textSize(16 * responsiveScale);
  textStyle(BOLD);
  text("← 뒤로", centerX, backButtonY + backButtonHeight / 2);

  // hitbox refresh
  uiHitboxes.length = 0;
  uiHitboxes.push({ id: "back_full", x: backButtonX, y: backButtonY, w: backButtonWidth, h: backButtonHeight });
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
   11. UI DRAW (NAV, SEARCH, TAG CARDS)
========================= */

function drawUI() {
  // 익스플로어와 동일한 scaleAll 계산
  const baseW = 1920, baseH = 1080;
  const s = Math.min(width / baseW, height / baseH);
  const scaleAll = clamp(s, 0.5, 1.5); // 익스플로어와 동일한 clamp 적용

  // NAV BAR (익스플로어와 동일)
  const navBarImg = uiImages["navigation-bar.png"];
  if (navBarImg) {
    push();
    drawingContext.save();
    drawingContext.imageSmoothingEnabled = false;
    imageMode(CENTER);
    const navW = navBarImg.width * 0.455 * scaleAll;
    const navH = navBarImg.height * 0.455 * scaleAll;
    image(navBarImg, width * 0.5, 20 + navH * 0.5, navW, navH);
    drawingContext.restore();
    pop();
  }

  // TOP BUTTONS (익스플로어와 동일)
  const captureImg = uiImages["capture-button.png"];
  if (captureImg) {
    push();
    drawingContext.save();
    drawingContext.imageSmoothingEnabled = false;
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
    drawingContext.imageSmoothingEnabled = false;
    const w = workImg.width * UI.searchWRatio * scaleAll;
    const h = workImg.height * UI.searchWRatio * scaleAll;
    imageMode(CENTER);
    image(workImg, width - (30 * scaleAll + w * 0.5), 30 * scaleAll + h * 0.5, w, h);
    drawingContext.restore();
    pop();
  }

  // MIC ICON BELOW NAV BAR (익스플로어와 동일)
  const micImg = uiImages["mike.png"];
  if (micImg) {
    const navBarTop = 20;
    const navBarH = navBarImg ? navBarImg.height * 0.455 * scaleAll : 80;
    const navBarBottom = navBarTop + navBarH;
    const micW = micImg.width * 0.6 * scaleAll;
    const micH = micImg.height * 0.6 * scaleAll;
    const micY = navBarBottom + 20 * scaleAll + micH * 0.5;
    push();
    drawingContext.save();
    drawingContext.imageSmoothingEnabled = false;
    imageMode(CENTER);
    image(micImg, width * 0.5, micY, micW, micH);
    drawingContext.restore();
    pop();
    
    // 마이크 히트박스 저장
    uiHitboxes.push({ id: "mic", x: width * 0.5 - micW * 0.5, y: micY - micH * 0.5, w: micW, h: micH });
  }

  // SEARCH BAR (마이크 아래에 배치)
  const navBarTop = 20;
  const navBarH = navBarImg ? navBarImg.height * 0.455 * scaleAll : 80;
  const navBarBottom = navBarTop + navBarH;
  const micH = micImg ? micImg.height * 0.6 * scaleAll : 0;
  const searchScale = UI.searchScaleRatio * scaleAll;
  const searchW = width * 0.36;
  const searchH = 44 * searchScale;
  const searchX = width * 0.5 - searchW * 0.5;
  const searchY = navBarBottom + 20 * scaleAll + micH + 20 * scaleAll;

  push();
  noStroke();
  fill(255, 255 * UI.glassAlpha);
  rect(searchX, searchY, searchW, searchH, 14);
  pop();

  const searchImg = uiImages["lucide_search.svg"];
  if (searchImg) image(searchImg, searchX + 12, searchY + 8, 28, 28);

  fill(220);
  textSize(13 * searchScale);
  textAlign(LEFT, CENTER);
  text("Search...", searchX + 48, searchY + searchH * 0.5);
  textAlign(CENTER, CENTER);

  // LEFT TAG CARDS
  drawLeftCards(scaleAll);

  // HITBOXES (responsive rebuild per frame)
  // 마이크 히트박스는 위에서 이미 추가됨
  const captureW = captureImg ? captureImg.width * UI.searchWRatio * scaleAll : 0;
  const captureH = captureImg ? captureImg.height * UI.searchWRatio * scaleAll : 0;
  const workW = workImg ? workImg.width * UI.searchWRatio * scaleAll : 0;
  const workH = workImg ? workImg.height * UI.searchWRatio * scaleAll : 0;
  const navW = navBarImg ? navBarImg.width * 0.455 * scaleAll : 0;
  const navH = navBarImg ? navBarImg.height * 0.455 * scaleAll : 0;
  
  // CENTER 모드로 그려지므로 중심 기준으로 히트박스 계산
  const captureX = 30 * scaleAll + captureW * 0.5;
  const captureY = 30 * scaleAll + captureH * 0.5;
  const workX = width - (30 * scaleAll + workW * 0.5);
  const workY = 30 * scaleAll + workH * 0.5;
  
  uiHitboxes.push({ id: "capture", x: captureX - captureW * 0.5, y: captureY - captureH * 0.5, w: captureW, h: captureH });
  uiHitboxes.push({ id: "workroom", x: workX - workW * 0.5, y: workY - workH * 0.5, w: workW, h: workH });
  uiHitboxes.push({ id: "nav_center", x: width * 0.5 - navW * 0.5, y: navBarTop, w: navW, h: navH });
  uiHitboxes.push({ id: "search", x: searchX, y: searchY, w: searchW, h: searchH });
}

function drawLeftCards(scaleAll) {
  const cardW = width * UI.leftCardsWidthRatio;
  const pad = width * UI.leftCardsPaddingRatio;
  const top = min(width, height) * 0.26;
  const cardH = (height * 0.55 - pad * 5) / 6;

  for (let i = 0; i < 6; i++) {
    const tag = tagList[i] || null;
    const x = pad;
    const y = top + i * (cardH + pad);
    const selected = (activeTag === tag);

    push();
    noStroke();
    fill(selected ? 255 : 255, selected ? 40 : 15);
    rect(x, y, cardW, cardH, 12);

    fill(selected ? 255 : 200);
    textAlign(LEFT, CENTER);
    if (fontPretendard) textFont(fontPretendard);
    textSize(12 * 1.5); // 글자 크기 1.5배
    text(tag || "—", x + 12, y + cardH * 0.5);

    // bubble count
    const cnt = tag ? countBubblesWithTag(tag) : bubbleCount;
    textAlign(RIGHT, CENTER);
    textSize(11 * 1.5); // 글자 크기 1.5배
    fill(160);
    text(cnt, x + cardW - 10, y + cardH * 0.5);

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

/* =========================
   12. INPUT HANDLING (Unified)
========================= */

function pointerStart(x, y, id) {
  pointerDown = true;
  pointerId = id;
  downX = lastX = x;
  downY = lastY = y;
  lastT = millis();
  dragging = false;
  dragMode = 0;

  // UI hit test
  const hit = hitTestUI(x, y);
  if (hit) {
    handleUI(hit);
    pointerDown = false;
    pointerId = -1;
    return;
  }

  // carousel zone only
  if (y > height * (1 - UI.bottomArcHeightRatio)) {
    dragMode = 2;
  } else {
    // 상단 영역 드래그 비활성화
    dragMode = 0;
    pointerDown = false;
    pointerId = -1;
    return;
  }

  lastActiveTime = millis();
}

function pointerMove(x, y) {
  if (!pointerDown) return;

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
      const d = dx / 120;
      carouselOffset -= d;
      carouselVel = -d * 0.6;
      carouselSnapping = false;
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
    carouselSnapping = true;
  } else {
    // click on center bubble?
    if (!dragging && mode === 0) {
      const hitIdx = hitTestCenterBubble(x, y);
      if (hitIdx !== -1) enterFullscreen(hitIdx);
    }
  }

  dragging = false;
  dragMode = 0;
  lastActiveTime = millis();
}

// p5 events -> unified
function mousePressed() { pointerStart(mouseX, mouseY, 0); }
function mouseDragged() { pointerMove(mouseX, mouseY); }
function mouseReleased() { pointerEnd(mouseX, mouseY); }

function touchStarted() {
  if (touches.length > 0) pointerStart(touches[0].x, touches[0].y, touches[0].id || 0);
  return false;
}
function touchMoved() {
  if (touches.length > 0) pointerMove(touches[0].x, touches[0].y);
  return false;
}
function touchEnded() {
  pointerEnd(lastX, lastY);
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
    if (id === "back_full") exitFullscreen();
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
  if (id === "search") {
    // 검색창 클릭 시 전체보기로 전환 (익스플로어와 동일)
    if (activeTag !== null) {
      toggleTagFilter(activeTag); // 현재 태그를 다시 클릭하여 전체보기로 전환
    }
    return;
  }
  if (id === "mic") {
    // 마이크 클릭 시 전체보기로 전환 (익스플로어와 유사)
    if (activeTag !== null) {
      toggleTagFilter(activeTag); // 현재 태그를 다시 클릭하여 전체보기로 전환
    }
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
  mode = 1;
  lastActiveTime = millis();
}

function exitFullscreen() {
  mode = 0;
  fullscreenIndex = -1;
  fullscreenAnim = 0;
  lastActiveTime = millis();
}

/* =========================
   15. HIT TEST CENTER BUBBLE
========================= */

// isCenterBubble 함수는 더 이상 사용하지 않음 (전체 탐색 영역 제거됨)

function hitTestCenterBubble(x, y) {
  // 아크 캐러셀의 중앙 버블만 체크
  if (!bubbles || bubbleCount === 0) return -1;
  
  // 아크 캐러셀 영역이 아니면 -1 반환
  if (y <= height * (1 - UI.bottomArcHeightRatio)) return -1;
  
  // 아크 캐러셀의 중앙 슬롯 버블 체크
  const arcH = height * UI.bottomArcHeightRatio;
  const centerY = height + arcH * 0.25;
  const centerX = width * 0.5;
  const radius = width * 0.52;
  
  const baseIndex = normalizeIndex(Math.round(carouselOffset), bubbleCount);
  const idx = normalizeIndex(baseIndex, bubbleCount);
  const b = bubbles[idx];
  
  if (!b) return -1;
  
  // 중앙 버블 위치 계산
  const angle = -Math.PI / 2; // 위 방향
  const bx = centerX + Math.sin(angle) * radius;
  const by = centerY - Math.cos(angle) * radius;
  const r = RENDER.maxBubbleRadius * 0.42;
  
  const dx = x - bx;
  const dy = y - by;
  if (dx * dx + dy * dy <= r * r) return idx;
  
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

// 원본 스케치와 동일한 getSearchMetrics 함수 (아크 메트릭 계산에 필요)
function getSearchMetrics() {
  const responsiveScale = getResponsiveScale();
  const NAV_Y = 20;
  const NAV_H = uiImages["navigation-bar.png"] ? uiImages["navigation-bar.png"].height * 0.455 * responsiveScale : 64;
  const NAV_BOTTOM = NAV_Y + NAV_H;
  const micH = uiImages["mike.png"] ? uiImages["mike.png"].height * 0.6 * responsiveScale : 0;
  const searchScale = UI.searchScaleRatio * responsiveScale;
  const W = width * UI.searchWidthRatio * responsiveScale * 1.3;
  const H = 75 * UI.searchScaleRatio * responsiveScale * 1.3;
  const X = (width - W) / 2;
  const gapScale = Math.min(1, responsiveScale * 0.3);
  const gap = 40 * gapScale;
  const Y = NAV_BOTTOM + gap + 20 * responsiveScale + micH + 20 * responsiveScale;
  return { W, H, X, Y, bottom: Y + H };
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
  initBackground();
}