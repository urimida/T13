/* Explorer Interactive Bubble Explorer (Tablet-Optimized)
 * p5.js v1.9.3 global mode
 * Single-file modular architecture
 */

/* =========================
   0. CONFIG
========================= */

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
  inertiaDecay: 0.95,
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
  maxDraw: 140,
  tabletGCInterval: 20000,
  desktopGCInterval: 30000,
  tabletSoftReset: 120000,
  desktopSoftReset: 180000,
  maxSimulImageLoads: 2,
};

const ANIMATION_CONFIG = {
  enableBreathAnim: true,
  enableCenterPulse: true,
  allowIdlePause: true,
};

const PATHS = {
  data: "../public/assets/data/bubbles.json",
  bg: "../public/assets/public-imgs/bg.png",
  navBar: "../public/assets/public-imgs/navigation-bar.png",
  captureBtn: "../public/assets/public-imgs/capture-button.png",
  workroomBtn: "../public/assets/public-imgs/workroom-button.png",
  bubbleCap: "../public/assets/public-imgs/bubble-cap.png",
  mic: "../public/assets/public-imgs/mike.png",
  fonts: "../public/assets/fonts/PretendardVariable.ttf",
  bubbleImgsRoot: "../public/assets/bubble-imgs/",
  groupImgs: {
    1: "../public/assets/public-imgs/traveler.png",
    2: "../public/assets/public-imgs/20s.png",
    3: "../public/assets/public-imgs/50s.png",
    4: "../public/assets/public-imgs/housewife.png",
    5: "../public/assets/public-imgs/10s.png",
  }
};

const DEFAULT_GROUP_LANGUAGES = {
  1: { visual: ["깊이감","미드나잇 톤","메탈릭 쉐이드","자연광 리플렉션","풍경 반사감"],
       emotional: ["탐험","긴장과 기대","미지로 향함","고독한 낭만","체험의 몰입"] },
  2: { visual: ["따뜻한 난색", "글로시한 윤기","파스텔 옐로","젤리 텍스처","부드러운 곡면"],
       emotional: ["활력","사랑스러움","자기표현","로맨틱","설렘"] },
  3: { visual: ["균형적 분포","안정된 구형","고명도 대비","투명한 반사광","시원한 색"],
       emotional: ["사랑스러움","보호","책임감","신뢰","안정"] },
  4: { visual: ["부드러운 난반사","소프트 톤","파스텔 옐로","투명한 안정감","깨끗한 정결 이미지"],
       emotional: ["평온","따뜻한 일상", "배려","온기","안정",] },
  5: { visual: ["네온 핑크","사이버 파스텔","디지털 글로시","높은 채도","K-pop 팔레트"],
       emotional: ["자기취향 강도","통통 귀여움","흥미","아이코닉함","즉각적 몰입"] },
};

let groupLanguages = cloneGroupLanguages(DEFAULT_GROUP_LANGUAGES);

function cloneGroupLanguages(src){
  const clone = {};
  for (const key in src){
    clone[key] = {
      visual: [...(src[key].visual || [])],
      emotional: [...(src[key].emotional || [])]
    };
  }
  return clone;
}

function normalizeTagList(list){
  if (!Array.isArray(list)) return [];
  return list
    .map(tag => (tag ?? "").toString().replace(/^#/, "").trim())
    .filter(tag => tag.length > 0);
}

function refreshGroupLanguagesFromData(dataList){
  if (!Array.isArray(dataList) || dataList.length === 0) {
    groupLanguages = cloneGroupLanguages(DEFAULT_GROUP_LANGUAGES);
    return;
  }

  const updated = cloneGroupLanguages(DEFAULT_GROUP_LANGUAGES);
  const ensureGroup = (g) => {
    if (!updated[g]) {
      updated[g] = { visual: [], emotional: [] };
    }
    return updated[g];
  };

  dataList.forEach(entry => {
    const attrs = Array.isArray(entry.attributes) ? entry.attributes : [];
    const visualTags = normalizeTagList(entry.visualTags || entry.tags || []);
    const emotionalTags = normalizeTagList(entry.emotionalTags || []);

    attrs.forEach(attr => {
      const store = ensureGroup(attr);

      visualTags.forEach(tag => {
        if (!store.visual.includes(tag)) store.visual.push(tag);
      });
      emotionalTags.forEach(tag => {
        if (!store.emotional.includes(tag)) store.emotional.push(tag);
      });
    });
  });

  groupLanguages = updated;
}

/* =========================
   1. GLOBAL STATE
========================= */

let app;              // App instance
let isTablet = false; // heuristic

function preload() {
  app = new App();
  app.preload();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1); // tablet stability + retina clarity
  frameRate(30);

  isTablet = (min(windowWidth, windowHeight) <= 1200);
  TagRenderer.LOW_QUALITY_MODE = isTablet;

  app.setup();
}

function draw() {
  app.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (typeof TagRenderer !== "undefined") {
    TagRenderer.invalidateCache();
  }
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1);
  isTablet = (min(windowWidth, windowHeight) <= 1200);
  TagRenderer.LOW_QUALITY_MODE = isTablet;
  app.onResize();
}

/* =========================
   2. UTILS
========================= */

const SQRT3 = Math.sqrt(3);

function wrapDelta(d, size) {
  // nearest torus delta
  d = (d + size * 0.5) % size;
  if (d < 0) d += size;
  return d - size * 0.5;
}

function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

function normTag(t){
  return (t ?? "")
    .toString()
    .trim()
    .replace(/^#/, "")   // 앞 # 제거
    .toLowerCase();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGlassToggleButton(x, y, w, h, r, { active = false } = {}){
  const ctx = drawingContext;

  // 외곽 글로우
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.shadowBlur = active ? 30 : 20;
  ctx.shadowColor = active ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.3)";
  ctx.shadowOffsetY = active ? -2 : -3;
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fill();
  ctx.restore();

  // 글래스 본체
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();

  // 기본 서리 레이어
  ctx.fillStyle = active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.08)";
  ctx.fillRect(x, y, w, h);

  // 메인 그라디언트 (더 부드러운 변화)
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.18)");
  gradient.addColorStop(0.3, active ? "rgba(255,255,255,0.20)" : "rgba(255,255,255,0.12)");
  gradient.addColorStop(0.7, active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)");
  gradient.addColorStop(1, active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);

  // 상단 하이라이트 (더 부드럽고 자연스럽게)
  const highlight = ctx.createLinearGradient(x, y, x, y + h * 0.4);
  highlight.addColorStop(0, "rgba(255,255,255,0.25)");
  highlight.addColorStop(0.5, "rgba(255,255,255,0.12)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.globalAlpha = 1.0;
  ctx.fillRect(x, y, w, h * 0.4);
  ctx.restore();

  // 테두리 (더 부드럽게)
  ctx.save();
  ctx.lineWidth = active ? 2.0 : 1.5;
  ctx.strokeStyle = active ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.40)";
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

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

    ctx.save();
    const shadowOffsetY = isHovered ? -2 : -4;
    roundRectPath(ctx, x, y + shadowOffsetY, w, h, r);
    ctx.shadowBlur = isHovered ? 26 : 18;
    ctx.shadowColor = isHovered ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
    ctx.fillStyle = "rgba(0,0,0,0.01)";
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();

    const frostGradient = ctx.createLinearGradient(x, y, x, y + h);
    frostGradient.addColorStop(0, "rgba(255,255,255,0.2)");
    frostGradient.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = frostGradient;
    ctx.globalAlpha = this.LOW_QUALITY_MODE ? 0.85 : 1.0;
    ctx.fillRect(x, y, w, h);

    const highlight = this._getGradient("highlight", w, h, x, y);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = highlight;
    ctx.fillRect(x, y, w, h * 0.55);

    ctx.restore();

    ctx.save();
    const edgeGradient = this._getGradient(
      isSelected ? "edgeSelected" : isHovered ? "edgeHovered" : "edgeNormal",
      w,
      h,
      x,
      y
    );
    ctx.lineWidth = isSelected ? 3 : isHovered ? 2.4 : 1.6;
    ctx.strokeStyle = edgeGradient;
    roundRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }

  static invalidateCache() {
    this.gradientCache = {
      glass: null,
      highlight: null,
      edgeNormal: null,
      edgeHovered: null,
      edgeSelected: null,
    };
    this.lastTagSize = { w: 0, h: 0 };
  }
}

function drawGlassTag(x, y, w, h, r, isSelected = false, isHovered = false){
  TagRenderer.draw(x, y, w, h, r, isSelected, isHovered);
}

/* =========================
   3. RESOURCE / IMAGE LOADER
========================= */

class ImageLoader {
  constructor() {
    this.cache = new Map();           // path -> p5.Image
    this.queue = [];                  // pending paths
    this.loading = new Set();         // currently loading
    this.lastCheck = 0;
    this.activeLoads = 0;
  }

  has(path){ return this.cache.has(path); }

  get(path){ return this.cache.get(path); }

  request(path) {
    if (!path) return;
    if (this.cache.has(path) || this.loading.has(path)) return;
    if (this.queue.length >= PERFORMANCE_CONFIG.maxImageQueueLength) return;
    this.queue.push(path);
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
    // remove images not visible recently
    for (const key of this.cache.keys()) {
      if (!visibleSet.has(key)) {
        this.cache.delete(key);
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
   4. INPUT MANAGER (Pointer)
========================= */

class InputManager {
  constructor(app) {
    this.app = app;

    this.isDown = false;
    this.downX = 0; this.downY = 0;
    this.lastX = 0; this.lastY = 0;
    this.totalMoveSq = 0;

    this.downTime = 0;
    this.pointerId = null;

    this.attach();
  }

  attach() {
    const c = document.querySelector("canvas");
    if (!c) return;

    c.style.touchAction = "none";

    c.addEventListener("pointerdown", (e) => this.onDown(e), {passive:false});
    c.addEventListener("pointermove", (e) => this.onMove(e), {passive:false});
    c.addEventListener("pointerup", (e) => this.onUp(e), {passive:false});
    c.addEventListener("pointercancel", (e) => this.onUp(e), {passive:false});
  }

  onDown(e){
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.isDown = true;
    this.downX = this.lastX = e.clientX;
    this.downY = this.lastY = e.clientY;
    this.totalMoveSq = 0;
    this.downTime = performance.now();

    this.app.onPointerDown(this.downX, this.downY);
  }

  onMove(e){
    if (!this.isDown || e.pointerId !== this.pointerId) return;
    e.preventDefault();

    const x = e.clientX, y = e.clientY;
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    this.totalMoveSq += dx*dx + dy*dy;

    this.lastX = x; this.lastY = y;

    this.app.onPointerMove(x, y, dx, dy);
  }

  onUp(e){
    if (!this.isDown || e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.isDown = false;

    const upX = e.clientX, upY = e.clientY;
    const dt = performance.now() - this.downTime;

    const isClick = this.totalMoveSq < 16*16; // 16px tolerance
    this.app.onPointerUp(upX, upY, dt, isClick);
  }
}

/* =========================
   5. PAN / SNAP CONTROLLER
========================= */

class PanController {
  constructor(app){
    this.app = app;
    this.camX = 0; this.camY = 0;
    this.velX = 0; this.velY = 0;

    this.dragging = false;
    this.hasDragged = false; // 실제 드래그가 있었는지 추적

    this.snapTargetX = null;
    this.snapTargetY = null;
  }

  onDown(){
    this.dragging = true;
    this.hasDragged = false; // 드래그 시작 시 초기화
    this.velX = this.velY = 0;
    this.snapTargetX = this.snapTargetY = null;
  }

  onDrag(dx, dy){
    // finger moves content with it => camera moves opposite
    const s = INTERACTION_CONFIG.panSensitivity;
    this.camX -= dx * s;
    this.camY -= dy * s;

    // update velocity for inertia
    this.velX = -dx * s;
    this.velY = -dy * s;
    
    // 실제 드래그가 있었음을 표시
    if (abs(dx) > 1 || abs(dy) > 1) {
      this.hasDragged = true;
    }
  }

  onUp(){
    this.dragging = false;
    // snap to nearest bubble after release (실제 드래그가 있었을 때만)
    if (this.hasDragged) {
    const nearest = this.app.bubbleManager.findNearestToCam(this.camX, this.camY);
    if (nearest) {
      this.snapTargetX = nearest.x;
      this.snapTargetY = nearest.y;
    }
    }
    this.hasDragged = false;
  }

  update(){
    if (!this.dragging) {
      // inertia
      this.camX += this.velX;
      this.camY += this.velY;
      this.velX *= INTERACTION_CONFIG.inertiaDecay;
      this.velY *= INTERACTION_CONFIG.inertiaDecay;

      // snap lerp
      if (this.snapTargetX != null) {
        this.camX = lerp(this.camX, this.snapTargetX, INTERACTION_CONFIG.snapSpeed);
        this.camY = lerp(this.camY, this.snapTargetY, INTERACTION_CONFIG.snapSpeed);

        if (abs(this.camX - this.snapTargetX) < 0.5 &&
            abs(this.camY - this.snapTargetY) < 0.5) {
          this.snapTargetX = this.snapTargetY = null;
          this.velX = this.velY = 0;
        }
      }
    }

    // torus wrap camera
    const bm = this.app.bubbleManager;
    this.camX = (this.camX % bm.worldW + bm.worldW) % bm.worldW;
    this.camY = (this.camY % bm.worldH + bm.worldH) % bm.worldH;
  }
}

/* =========================
   5. ROTATION CONTROLLER
========================= */

class RotationController {
  // 회전 상태 (원본과 동일)
  static state = {
    rotationAngle: 0,
    angularVelocity: 0,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    autoSpeed: 0.005, // 카테고리 선택 시 회전 속도
    didDrag: false
  };

  // 중심점 좌표 (외부에서 주입)
  static centerX = 0;
  static centerY = 0;
  static controlRadius = 0;

  // 중심점 업데이트 (매 프레임 또는 리사이즈 시)
  static update(centerX, centerY, controlRadius) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.controlRadius = controlRadius;
  }

  // 회전 시작 확인
  static start(x, y, ui) {
    // 태그 필터링 또는 그룹 뷰가 활성화된 경우에만 회전 제어
    const showGroupView = ui ? ui.showGroupView : false;
    const selectedTag = ui ? ui.activeTag : null;
    const hasTagFilter = selectedTag !== null;
    
    if (!hasTagFilter && !showGroupView) {
      return false; // 회전 제어 모드가 아님
    }
    
    // 중심에서의 거리 계산
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // 회전 제어 영역 내부인지 확인
    if (dist <= this.controlRadius) {
      this.state.isDragging = true;
      this.state.lastX = x;
      this.state.lastY = y;
      this.state.didDrag = false;
      return true; // 회전 제어 시작됨
    }
    
    return false; // 회전 제어 영역이 아님
  }

  // 회전 드래그 처리
  static drag(x, y) {
    if (!this.state.isDragging) {
      return;
    }
    
    // 이전 위치와 현재 위치의 각도 차이 계산
    const prevDx = this.state.lastX - this.centerX;
    const prevDy = this.state.lastY - this.centerY;
    const prevAngle = Math.atan2(prevDy, prevDx);
    
    const currDx = x - this.centerX;
    const currDy = y - this.centerY;
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
    const dragSensitivity = 1.0;
    
    // 회전 각도 업데이트
    this.state.rotationAngle += angleDelta * dragSensitivity;
    
    // 각도 정규화 (드래그 중에도 오버플로우 방지)
    const TWO_PI = Math.PI * 2;
    this.state.rotationAngle = ((this.state.rotationAngle % TWO_PI) + TWO_PI) % TWO_PI;
    
    // 마지막 드래그 속도를 관성으로 저장
    const timeDelta = deltaTime / 1000; // 초 단위
    if (timeDelta > 0 && Math.abs(angleDelta) > 0.001) {
      // 최대/최소 속도 제한
      const rawVelocity = (angleDelta * dragSensitivity) / timeDelta * 0.5;
      const MAX_VELOCITY = 5.0; // 최대 회전 속도
      const MIN_VELOCITY = 0.0001; // 최소 회전 속도
      this.state.angularVelocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, rawVelocity));
    }
    
    if (Math.abs(angleDelta) > 0.0005) {
      this.state.didDrag = true;
    }
    
    // 마지막 위치 업데이트
    this.state.lastX = x;
    this.state.lastY = y;
  }

  // 회전 종료 처리
  static end() {
    if (this.state.isDragging) {
      this.state.isDragging = false;
    
      // 거의 안 움직인 상태에서 떼면 그냥 멈춘 느낌 나도록
      if (Math.abs(this.state.angularVelocity) < 0.0001) {
        this.state.angularVelocity = 0;
      }
    }

    if (this.state.didDrag) {
      this.state.didDrag = false;
    }
  }

  // 회전 상태 초기화
  static reset() {
    this.state = {
      rotationAngle: 0,
      angularVelocity: 0,
      isDragging: false,
      lastX: 0,
      lastY: 0,
      autoSpeed: 0.005,
      didDrag: false
    };
  }
}

/* =========================
   6. UI STATE MANAGER
========================= */

class UIStateManager {
  constructor(app){
    this.app = app;

    this.activeGroup = 0;   // 0 = all
    this.activeTag = null;  // string
    this.searchQuery = "";

    this.infoBubble = null; // bubble currently showing info
    this.showInfoUntil = 0;

    // group mode orbit (RotationController 사용)
    this.groupMode = false;

    // category selection mode
    this.showCategorySelection = false;
    
    // group view (중간 단계: 대표 이미지와 태그들이 둥둥 떠다니는 화면)
    this.showGroupView = false;
  }

  setGroup(g){
    this.activeGroup = g;
    this.infoBubble = null;
    this.showCategorySelection = false; // 카테고리 선택 후 모드 종료
    
    // 전체 보기(0) 선택 시 최초 화면으로 리셋
    if (g === 0) {
      this.activeTag = null;
      this.searchQuery = "";
      this.showGroupView = false;
      this.groupMode = false;
      // 카메라를 그리드 중심으로 부드럽게 이동 (스냅 타겟만 설정)
      if (this.app && this.app.bubbleManager && this.app.pan) {
        const bm = this.app.bubbleManager;
        const spacing = RENDER_CONFIG.hexSpacing;
        const fallbackGrid = Math.ceil(Math.sqrt(RENDER_CONFIG.totalBubbles));
        const fallbackCenterGridX = Math.floor(fallbackGrid / 2);
        const fallbackCenterGridY = Math.floor(fallbackGrid / 2);
        const fallbackX = fallbackCenterGridX * spacing * 1.5;
        const fallbackY = fallbackCenterGridY * spacing * SQRT3 + 
                          ((fallbackCenterGridX % 2) * spacing * SQRT3) / 2;
        const centerPos = (bm && typeof bm.getCenterHexPosition === "function")
          ? bm.getCenterHexPosition()
          : { x: fallbackX, y: fallbackY };
        const centerHexX = centerPos.x;
        const centerHexY = centerPos.y;
        
        // 현재 카메라 위치에서 가장 가까운 torus wrap된 타겟 위치 계산
        const currentCamX = this.app.pan.camX;
        const currentCamY = this.app.pan.camY;
        
        // wrapDelta를 사용하여 가장 가까운 타겟 위치 찾기
        const targetX = currentCamX + wrapDelta(centerHexX - currentCamX, bm.worldW);
        const targetY = currentCamY + wrapDelta(centerHexY - currentCamY, bm.worldH);
        
        // 부드럽게 이동하기 위해 스냅 타겟만 설정 (즉시 이동하지 않음)
        this.app.pan.velX = 0;
        this.app.pan.velY = 0;
        this.app.pan.snapTargetX = targetX;
        this.app.pan.snapTargetY = targetY;
      }
    } else {
      // 카테고리 선택 시 중간 단계 화면으로 이동 (태그 선택 화면)
      this.showGroupView = true;
      this.activeTag = null;
      this.groupMode = false; // 태그 선택 전까지는 행성 모드 아님
      this.infoBubble = null; // 그룹 뷰에서는 정보 표시하지 않음
    }
  }

  setTag(tag){
    this.activeTag = tag;
    this.infoBubble = null;
    // 태그 선택 시 행성 모드로 전환
    if (this.activeTag && this.activeGroup !== 0) {
      this.groupMode = true;
      // showGroupView는 유지 (태그 선택을 자유롭게 할 수 있도록)
    }
  }

  toggleCategorySelection(){
    this.showCategorySelection = !this.showCategorySelection;
  }

  setSearch(q){
    this.searchQuery = q.toLowerCase();
    this.infoBubble = null;
  }

  showBubbleInfo(bubble){
    this.infoBubble = bubble;
    this.showInfoUntil = millis() + 20000; // auto hide after 20s idle
  }

  update(){
    if (this.infoBubble && millis() > this.showInfoUntil) {
      this.infoBubble = null;
    }
    // 회전 각도 업데이트는 App.draw()에서 RotationController로 처리
  }

  onOrbitDown(x, y){
    // 중심 위치 계산 및 업데이트
    const centerX = width / 2;
    const centerY = height / 2;
    // 그룹별 이미지 크기 배율 적용
    const g = this.activeGroup;
    let sizeMultiplier = 1.0;
    if (g === 1) sizeMultiplier = 1.1;      // 여행자
    else if (g === 2) sizeMultiplier = 1.4;  // 20대 여성
    else if (g === 5) sizeMultiplier = 1.5;  // 10대 여성
    const imageSize = min(width * 0.4, height * 0.4) * (this.app ? this.app.scaleAll : 1) * sizeMultiplier;
    const maxRadius = min(width, height) * 0.45;
    const controlRadius = maxRadius + 100;
    
    RotationController.update(centerX, centerY, controlRadius);
    return RotationController.start(x, y, this);
  }

  onOrbitDrag(x, y){
    RotationController.drag(x, y);
  }

  onOrbitUp(){
    RotationController.end();
  }
}

/* =========================
   7. BUBBLE
========================= */

class Bubble {
  constructor(i, x, y, data, imgPath, hueSeed){
    this.id = i;
    this.x = x; this.y = y; // world position

    this.data = data || {};
    this.attributes = this.data.attributes || [];
    // bubbles.json의 tags 속성 사용 (이미 # 포함)
    const tags = this.data.tags || [];
    this.visualTags = this.data.visualTags || [];
    this.emotionalTags = this.data.emotionalTags || [];
    // tags가 있으면 visualTags로 사용 (원본과 호환)
    if (tags.length > 0 && this.visualTags.length === 0) {
      this.visualTags = tags;
    }
    this.title = this.data.title || `Bubble ${i}`;

    this.imgPath = imgPath || null;
    this.hueSeed = hueSeed || random(0, 360);

    // render state (updated each frame)
    this.displayX = 0; this.displayY = 0;
    this.displayR = RENDER_CONFIG.baseBubbleRadius;
    this.alpha = 1.0;

    this.isCenter = false;
    this.visible = true;

    // animation seeds
    this.breathSpeed = random(0.6, 1.2);
    this.pulseOffset = random(0, TWO_PI);
    this.noiseOffset = random(0, 1000);
    
    // orbit state (원본과 동일)
    this.isInOrbit = false;
    this.orbitContextKey = null;
    this.baseRadius = RENDER_CONFIG.baseBubbleRadius;
    this.interactionScale = 1.0;
    
    // 태그 정규화 Set (성능 최적화: 매 프레임 배열 합치기/순회 비용 제거)
    this._normTagSet = new Set(
      [...(this.visualTags || []), ...(this.emotionalTags || [])]
        .map(normTag)
        .filter(Boolean)
    );
  }

  matchesFilter(ui){
    if (ui.activeGroup !== 0) {
      if (!this.attributes.includes(ui.activeGroup)) return false;
    }
    if (ui.activeTag) {
      const key = normTag(ui.activeTag);
      if (!this._normTagSet || !this._normTagSet.has(key)) return false;
    }
    if (ui.searchQuery && ui.searchQuery.length > 0) {
      const q = ui.searchQuery;
      const inTitle = this.title.toLowerCase().includes(q);
      const inTags = this.visualTags.join(" ").toLowerCase().includes(q) ||
                     this.emotionalTags.join(" ").toLowerCase().includes(q);
      if (!inTitle && !inTags) return false;
    }
    return true;
  }

  updateDisplay(app, relX, relY, distFromCenter, normalizedDist){
    const cx = app.centerX, cy = app.centerY;

    // fisheye
    const fisheyeFactor = 1 + (1 - normalizedDist) * RENDER_CONFIG.fisheyeStrength;
    this.displayX = cx + relX * fisheyeFactor;
    this.displayY = cy + relY * fisheyeFactor;

    // size factor from spec
    let sizeFactor = 1.0;
    if (distFromCenter <= RENDER_CONFIG.centerInfluenceRadius) {
      sizeFactor = lerp(1.0, 5.9, 1 - normalizedDist);
    } else if (distFromCenter <= RENDER_CONFIG.alphaFadeRadius) {
      const fadeProgress = (distFromCenter - RENDER_CONFIG.centerInfluenceRadius) /
                           (RENDER_CONFIG.alphaFadeRadius - RENDER_CONFIG.centerInfluenceRadius);
      sizeFactor = lerp(5.9, 1.36, fadeProgress);
    } else {
      const farProg = clamp((distFromCenter - RENDER_CONFIG.alphaFadeRadius) / 400, 0, 1);
      sizeFactor = lerp(1.36, 0.68, farProg);
    }

    // breathing + noise jitter
    let animFactor = 1.0;
    if (ANIMATION_CONFIG.enableBreathAnim) {
      const t = app.t;
      animFactor *= lerp(0.95, 1.05, (sin(t * this.breathSpeed + this.pulseOffset) + 1) * 0.5);
      animFactor *= lerp(0.98, 1.02, noise(this.noiseOffset + t * 0.2));
    }

    const baseR = RENDER_CONFIG.baseBubbleRadius;
    const r = baseR * sizeFactor * animFactor;

    this.displayR = clamp(r, RENDER_CONFIG.minBubbleRadiusBase, RENDER_CONFIG.maxBubbleRadius);

    // alpha falloff
    const alphaN = clamp(distFromCenter / (app.maxDist), 0, 1);
    this.alpha = lerp(1.0, RENDER_CONFIG.minAlpha, alphaN);
  }

  contains(px, py){
    const dx = px - this.displayX;
    const dy = py - this.displayY;
    return (dx*dx + dy*dy) <= (this.displayR*this.displayR);
  }

  draw(app){
    if (!this.visible) return;

    const img = this.imgPath ? app.imageLoader.get(this.imgPath) : null;

    push();
    translate(this.displayX, this.displayY);
    noStroke();

    // base - 모든 버블에 이미지 표시 (이미지가 없으면 기본 색상)
    if (img) {
      // clip to circle
      drawingContext.save();
      drawingContext.beginPath();
      drawingContext.arc(0,0,this.displayR,0,Math.PI*2);
      drawingContext.clip();
      imageMode(CENTER);
      image(img, 0, 0, this.displayR*2, this.displayR*2);
      drawingContext.restore();
    } else {
      // 이미지가 없을 때 기본 색상 표시
      colorMode(HSL, 360, 100, 100, 1);
      fill(this.hueSeed, 55, 55, this.alpha);
      circle(0,0,this.displayR*2);
      colorMode(RGB,255);
    }

    // gloss highlight - 주인공 버블만
    if (RENDER_CONFIG.bubbleGloss && this.isCenter) {
      fill(255, 255 * 0.25 * this.alpha);
      circle(-this.displayR*0.35, -this.displayR*0.35, this.displayR*0.9);
      fill(255, 255 * 0.12 * this.alpha);
      circle(this.displayR*0.15, this.displayR*0.15, this.displayR*1.2);
    }

    // 모든 버블에 캡 씌우기
    if (app.assets.bubbleCap && app.assets.bubbleCap.width > 2) {
      imageMode(CENTER);
      const s = (this.displayR*2) / app.assets.bubbleCap.width;
      push();
      scale(s);
      image(app.assets.bubbleCap, 0, 0);
      pop();
    }

    pop();
  }
}

/* =========================
   8. BUBBLE MANAGER
========================= */

class BubbleManager {
  constructor(app){
    this.app = app;
    this.bubbles = [];

    this.gridSize = 1;
    this.totalBubbles = 0;
    this.worldW = this.gridSize * RENDER_CONFIG.hexSpacing * 1.5;
    this.worldH = this.gridSize * RENDER_CONFIG.hexSpacing * SQRT3;

    this.visibleImgSet = new Set(); // for GC
    this._bubblesAbove = []; // 위쪽 버블들 (대표 이미지 앞에 그려야 할 버블들)
    this.activeOrbitBubbles = [];
  }

  build(dataList){
    this.bubbles.length = 0;

    const spacing = RENDER_CONFIG.hexSpacing;
    const dataCount = Array.isArray(dataList) ? dataList.length : 0;
    const total = dataCount > 0 ? dataCount : RENDER_CONFIG.totalBubbles;
    this.totalBubbles = total;
    this.gridSize = Math.max(1, Math.ceil(Math.sqrt(total)));
    this.worldW = this.gridSize * spacing * 1.5;
    this.worldH = this.gridSize * spacing * SQRT3;

    const gs = this.gridSize;

    let idx = 0;
    for (let gx=0; gx<gs && idx<total; gx++){
      for (let gy=0; gy<gs && idx<total; gy++){
        const hexX = gx * spacing * 1.5;
        const hexY = gy * spacing * SQRT3 + ((gx % 2) * spacing * SQRT3) / 2;

        const data = dataList[idx] || {};
        const imgName = data.image || data.img || null;
        const imgPath = imgName ? (PATHS.bubbleImgsRoot + imgName) : null;
        const hueSeed = (idx * 360 / total) % 360;

        this.bubbles.push(new Bubble(idx, hexX, hexY, data, imgPath, hueSeed));
        idx++;
      }
    }
  }

  getCenterHexPosition(){
    const spacing = RENDER_CONFIG.hexSpacing;
    const centerGridX = Math.floor(this.gridSize / 2);
    const centerGridY = Math.floor(this.gridSize / 2);
    const hexX = centerGridX * spacing * 1.5;
    const hexY = centerGridY * spacing * SQRT3 + ((centerGridX % 2) * spacing * SQRT3) / 2;
    return { x: hexX, y: hexY };
  }

  findNearestToCam(camX, camY){
    let best = null;
    let bestD = Infinity;

    for (let i=0; i<this.bubbles.length; i++){
      const b = this.bubbles[i];
      const dx = wrapDelta(b.x - camX, this.worldW);
      const dy = wrapDelta(b.y - camY, this.worldH);
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) {
        bestD = d2; best = b;
      }
    }
    return best;
  }

  updateAndDraw(){
    const app = this.app;
    const ui = app.ui;

    this.visibleImgSet.clear();

    // culling radius (cheap)
    const cullR = app.maxDist * 1.1;
    const cullR2 = cullR * cullR;

    let drawCount = 0;
    let centerCandidate = null;
    let centerBestD2 = Infinity;

    for (let i=0; i<this.bubbles.length; i++){
      const b = this.bubbles[i];

      // filter
      if (!b.matchesFilter(ui)) { b.visible = false; continue; }

      // nearest torus relative pos
      const relX = wrapDelta(b.x - app.pan.camX, this.worldW);
      const relY = wrapDelta(b.y - app.pan.camY, this.worldH);

      const d2 = relX*relX + relY*relY;
      if (d2 > cullR2) { b.visible = false; continue; }

      const distFromCenter = Math.sqrt(d2);
      const normalizedDist = Math.min(distFromCenter / app.maxDist, 1);

      b.visible = true;
      b.isCenter = false;

      b.updateDisplay(app, relX, relY, distFromCenter, normalizedDist);

      // request visible image lazy-load
      if (b.imgPath) {
        app.imageLoader.request(b.imgPath);
        this.visibleImgSet.add(b.imgPath);
      }

      // choose center bubble
      if (d2 < centerBestD2) {
        centerBestD2 = d2;
        centerCandidate = b;
      }

      // draw limit
      if (drawCount < PERFORMANCE_CONFIG.maxDraw) {
        b.draw(app);
        drawCount++;
      }
    }

    if (centerCandidate) {
      centerCandidate.isCenter = true;
      // 중앙 버블 저장 (정보 표시용)
      this._centerBubble = centerCandidate;
    } else {
      this._centerBubble = null;
    }

    // update loader
    app.imageLoader.update(performance.now());
  }

  getCenterBubble(){
    return this._centerBubble || null;
  }

  updateAndDrawGroupOrbit(){
    const app = this.app;
    const ui = app.ui;

    // 위쪽 버블 배열 초기화
    this._bubblesAbove = [];
    this.activeOrbitBubbles = [];

    // 기본적으로 모든 버블을 숨김 처리 (그룹 모드에서는 선택 버블만 보이도록)
    for (let i=0; i<this.bubbles.length; i++){
      const b = this.bubbles[i];
      b.visible = false;
      b.isCenter = false;
    }

    // 필터링된 버블 수집 (그룹 + 태그 필터링)
    // 원본 코드와 동일한 로직: selectedTag가 있으면 해당 태그만 필터링
    const filteredBubbles = [];
    for (let i=0; i<this.bubbles.length; i++){
      const b = this.bubbles[i];
      // 그룹 필터링
      if (ui.activeGroup !== 0 && !b.attributes.includes(ui.activeGroup)) continue;
      // 태그 필터링 (정규화된 태그로 정확 매칭)
      if (ui.activeTag) {
        const key = normTag(ui.activeTag);
        if (!b._normTagSet || !b._normTagSet.has(key)) continue;
      }
      filteredBubbles.push(b);
    }

    if (filteredBubbles.length === 0) return;

    // 중심 이미지 위치 계산 (원본과 동일하게)
    const centerX = width / 2;
    const centerY = height / 2;
    // 그룹별 이미지 크기 배율 적용
    const g = ui.activeGroup;
    let sizeMultiplier = 1.0;
    if (g === 1) sizeMultiplier = 1.1;      // 여행자
    else if (g === 2) sizeMultiplier = 1.4;  // 20대 여성
    else if (g === 5) sizeMultiplier = 1.5;  // 10대 여성
    const centerSize = min(width * 0.4, height * 0.4) * app.scaleAll * sizeMultiplier;
    const centerRadius = centerSize / 2;

    // 모든 필터링된 버블을 궤도에 배치
    const minOrbitRadius = centerRadius + 100 * app.scaleAll;
    const maxOrbitRadius = min(width, height) * 0.45;
    const baseTime = RotationController.state.rotationAngle;
    const tiltAngle = PI / 5;
    const orbitTilt = cos(tiltAngle) * 0.85;
    const orbitStretch = 1.3;
    const totalBubbles = filteredBubbles.length;
    const angleStep = totalBubbles > 0 ? TWO_PI / totalBubbles : 0;
    const maxVisibleBubbles = isTablet ? 30 : totalBubbles;
    const visibleCount = min(totalBubbles, maxVisibleBubbles);

    // 궤도 컨텍스트 키 (태그별로 구분)
    const orbitContextKey = ui.activeTag ? `tag-${ui.activeGroup}-${ui.activeTag}` : `group-${ui.activeGroup}`;
    
    // 각 버블을 궤도에 배치 (원본과 동일한 로직)
    for (let i=0; i<visibleCount; i++){
      const b = filteredBubbles[i];
      const angleOffset = i * angleStep;
      const currentAngle = baseTime + angleOffset;
      
      // 궤도 반지름 변화 (여러 궤도 레이어)
      const radiusVariation = 0.4 + (i % 3) * 0.15;
      const orbitRadius = minOrbitRadius + (maxOrbitRadius - minOrbitRadius) * radiusVariation;
      
      // zDepth 계산 (3D 효과)
      const zDepth = sin(currentAngle);
      const smoothZ = zDepth * zDepth * (3 - 2 * zDepth);
      const depthAlpha = 0.7 + (smoothZ + 1) * 0.15;
      
      // 위치 계산
      const bubbleX = centerX + cos(currentAngle) * orbitRadius * orbitStretch;
      const bubbleY = centerY + sin(currentAngle) * orbitRadius * orbitTilt;
      const zOffsetY = smoothZ * 20 * app.scaleAll;
      const finalY = bubbleY + zOffsetY;
      
      // 크기 계산 (앞쪽이 더 큼)
      const frontFactor = (sin(currentAngle) + 1) / 2;
      const MIN_R = 50 * app.scaleAll;
      const MAX_R = 85 * app.scaleAll;
      const targetBaseR = lerp(MIN_R, MAX_R, frontFactor);
      
      // 오비트 버블 준비 (원본과 동일)
      const justSynced = this.ensureOrbitBubbleReady(b, targetBaseR, orbitContextKey);
      const baseEase = justSynced ? 1.0 : 0.15;
      b.baseRadius = lerp(b.baseRadius, targetBaseR, baseEase);
      
      // 애니메이션 계산 (원본과 동일)
      const t = millis() * 0.001;
      const breathSpeed = 0.5 + (b.hueSeed % 7) * 0.1;
      const breath = sin(t * breathSpeed + b.pulseOffset);
      const breathFactor = map(breath, -1, 1, 0.95, 1.05);
      const noiseOffset = b.noiseOffset || (b.hueSeed * 100);
      const n = noise(noiseOffset + t * 0.2);
      const noiseFactor = map(n, 0, 1, 0.97, 1.03);
      
      if (!b.interactionScale) b.interactionScale = 1.0;
      const finalR = b.baseRadius * breathFactor * noiseFactor * b.interactionScale;
      
      // 버블 속성 설정 (원본과 동일)
      if (!b.pos) b.pos = createVector(0, 0);
      b.pos.set(bubbleX, finalY);
      b.displayX = bubbleX;
      b.displayY = finalY;
      b.displayR = finalR;
      b.alpha = depthAlpha;
      b.visible = true;
      b.isCenter = false;
      b._zDepth = zDepth; // 정렬용
      b._finalY = finalY; // 렌더링 순서용
      
      // 이미지 요청
      if (b.imgPath) {
        app.imageLoader.request(b.imgPath);
        this.visibleImgSet.add(b.imgPath);
      }
    }

    // zDepth 기준으로 정렬 (뒤에서 앞으로)
    const orbitBubbles = filteredBubbles.slice(0, visibleCount);
    const sortedBubbles = orbitBubbles.slice().sort((a, b) => {
      const zA = a._zDepth !== undefined ? a._zDepth : 0;
      const zB = b._zDepth !== undefined ? b._zDepth : 0;
      return zA - zB;
    });

    // 아래쪽 버블 먼저 그리기 (대표 이미지 뒤)
    // centerY는 drawGroupView와 동일한 위치 사용
    const imageCenterY = height / 2;
    const bubblesAbove = [];
    for (let i=0; i<sortedBubbles.length; i++){
      const b = sortedBubbles[i];
      if (b.visible && b._zDepth !== undefined) {
        if (b._finalY < imageCenterY) {
      b.draw(app);
        } else {
          bubblesAbove.push(b);
        }
      }
    }

    // 위쪽 버블은 나중에 그려야 하므로 저장만 함
    // (drawGroupView에서 대표 이미지를 그린 후에 그려짐)
    this._bubblesAbove = bubblesAbove;
    this.activeOrbitBubbles = orbitBubbles;

    app.imageLoader.update(performance.now());
  }

  // 오비트 버블 준비 (원본과 동일)
  ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey) {
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
}

/* =========================
   9. UI RENDERER
========================= */

class UIRenderer {
  constructor(app){
    this.app = app;
  }

  layout(){
    // layout removed for search input
  }

  draw(){
    this.layout();

    const app = this.app;
    const s = app.scaleAll;

    // nav bar
    if (app.assets.navBar){
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = false;
      imageMode(CENTER);
      const navW = app.assets.navBar.width * 0.455 * s;
      const navH = app.assets.navBar.height * 0.455 * s;
      image(app.assets.navBar, width*0.5, 20 + navH*0.5, navW, navH);
      drawingContext.restore();
      pop();
    }

    // top buttons
    if (app.assets.captureBtn){
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = false;
      const w = app.assets.captureBtn.width * UI_CONFIG.searchWRatio * s;
      const h = app.assets.captureBtn.height * UI_CONFIG.searchWRatio * s;
      image(app.assets.captureBtn, 30*s + w*0.5, 30*s + h*0.5, w, h);
      drawingContext.restore();
      pop();
    }
    if (app.assets.workroomBtn){
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = false;
      const w = app.assets.workroomBtn.width * UI_CONFIG.searchWRatio * s;
      const h = app.assets.workroomBtn.height * UI_CONFIG.searchWRatio * s;
      image(app.assets.workroomBtn, width - (30*s + w*0.5), 30*s + h*0.5, w, h);
      drawingContext.restore();
      pop();
    }

    // mic icon below nav bar
    if (app.assets.mic){
      const navBarTop = 20;
      const navBarH = app.assets.navBar ? app.assets.navBar.height * 0.455 * s : 80;
      const navBarBottom = navBarTop + navBarH;
      const micW = app.assets.mic.width * 0.6 * s;
      const micH = app.assets.mic.height * 0.6 * s;
      const micY = navBarBottom + 20*s + micH*0.5;
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = false;
      imageMode(CENTER);
      image(app.assets.mic, width*0.5, micY, micW, micH);
      drawingContext.restore();
      pop();
      
      // 마이크 히트박스 저장
      app._micHit = {
        x: width*0.5,
        y: micY,
        w: micW,
        h: micH
      };
    }

    // 카테고리 선택 모드일 때만 토글 표시
    if (app.ui.showCategorySelection) {
      // 어두운 오버레이
      fill(0, 180);
      rectMode(CORNER);
      rect(0, 0, width, height);
      
    this.drawToggles();
    }
    
    this.drawInfo();
  }

  drawToggles(){
    const app = this.app;
    const ui = app.ui;
    const s = app.scaleAll;

    const labels = [
      "전체 보기",
      "여행자의 취향만",
      "20대 여성의 취향만",
      "50대 남성의 취향만",
      "주부들의 취향만",
      "10대 여성의 취향만",
    ];

    const btnW = 300*s;
    const btnH = 50*s;
    const gap = 60*s;
    
    // 화면 중앙 기준으로 정렬
    const totalHeight = (labels.length - 1) * gap;
    const startY = height * 0.5 - totalHeight * 0.5;

    for (let i=0; i<labels.length; i++){
      const x = width*0.5;
      const y = startY + i*gap;

      const isActive = (ui.activeGroup === i);
      const rectX = x - btnW * 0.5;
      const rectY = y - btnH * 0.5;

      drawGlassToggleButton(rectX, rectY, btnW, btnH, 16*s, { active: isActive });

      this.withTextRendering(() => {
        drawingContext.shadowBlur = isActive ? 8 : 4;
        drawingContext.shadowColor = isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.1)";
        drawingContext.shadowOffsetY = 0;
        fill(255, isActive ? 180 : 140);
        textSize(16*s);
        text(labels[i], x, y);
        drawingContext.shadowBlur = 0;
      });
    }

    // store toggle hit boxes for click
    app._toggleHit.startY = startY;
    app._toggleHit.btnW = btnW;
    app._toggleHit.btnH = btnH;
    app._toggleHit.gap = gap;
    app._toggleHit.count = labels.length;
    app._toggleHit.cx = width*0.5;
  }

  drawInfo(){
    const ui = this.app.ui;
    // 태그 선택 전 그룹 뷰 단계에서는 정보 표시하지 않음
    if (ui.showGroupView && !ui.groupMode) return;
    
    const b = ui.infoBubble;
    if (!b || !b.title) return;

    const s = this.app.scaleAll;
    const x = b.isCenter ? this.app.centerX : b.displayX;
    let infoY;
    if (ui.showGroupView && ui.groupMode) {
      infoY = b.displayY + b.displayR + 40 * s;
    } else {
      infoY = b.isCenter ? (this.app.centerY + b.displayR + 40*s) : (b.displayY + b.displayR + 30*s);
    }

    // 원본 스타일: withTextRendering 헬퍼 사용
    this.withTextRendering(() => {
      // 제목 (1.2배 크기, 700 굵기, 흰색, alpha 230)
      const titleSize = 18 * s;
      const titleFontSize = titleSize * 1.2;
      drawingContext.font = `700 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
      drawingContext.fillStyle = `rgba(255, 255, 255, ${230 / 255})`;
      drawingContext.fillText(b.title, x, infoY);

      // 감정/비주얼 태그를 각각 모두 표시 (JSON 구조 변경 대응)
      const visualTags = (b.visualTags || []).filter(Boolean);
      const emotionalTags = (b.emotionalTags || []).filter(Boolean);
      const tagGroups = [
        { list: visualTags },
        { list: emotionalTags }
      ].filter(group => group.list.length > 0);

      if (tagGroups.length > 0) {
        const tagSize = 14 * s;
        const tagFontSize = tagSize * 1.3;
        const lineGap = 28 * s;
        drawingContext.font = `400 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
        drawingContext.fillStyle = `rgba(255, 255, 255, ${180 / 255})`;

        tagGroups.forEach((group, idx) => {
          const tagText = group.list.map(tag => `#${tag}`).join("  ");
          drawingContext.fillText(tagText, x, infoY + 35 * s + idx * lineGap);
        });
      }
    });
  }

  withTextRendering(fn){
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    noStroke();
    textAlign(CENTER, CENTER);
    if (this.app.font) textFont(this.app.font);
    
    fn();
    
    drawingContext.restore();
    pop();
  }
}

/* =========================
   10. APP ROOT
========================= */

class App {
  constructor(){
    this.assets = {};
    this.font = null;
    this.bubbleData = null;

    this.imageLoader = new ImageLoader();
    this.bubbleManager = new BubbleManager(this);
    this.pan = new PanController(this);
    this.ui = new UIStateManager(this);
    this.uiRenderer = new UIRenderer(this);
    this.input = null;

    // cached scratch
    this.centerX = 0;
    this.centerY = 0;
    this.maxDist = 0;
    this.scaleAll = 1;
    this.t = 0;

    this._orbitCache = [];
    this._toggleHit = {};
    this._micHit = null;
    this._tagHitBoxes = [];

    this._lastGC = 0;
    this._lastSoftReset = 0;
  }

  preload(){
    // data
    this.bubbleData = loadJSON(PATHS.data, 
      data => data, 
      _err => null
    );

    // images (optional safe)
    this.assets.bg = loadImage(PATHS.bg, _=>{}, _=>{});
    this.assets.navBar = loadImage(PATHS.navBar, _=>{}, _=>{});
    this.assets.captureBtn = loadImage(PATHS.captureBtn, _=>{}, _=>{});
    this.assets.workroomBtn = loadImage(PATHS.workroomBtn, _=>{}, _=>{});
    this.assets.bubbleCap = loadImage(PATHS.bubbleCap, _=>{}, _=>{});
    this.assets.mic = loadImage(PATHS.mic, _=>{}, _=>{});

    // group images lazy (request when needed)
    for (const k in PATHS.groupImgs){
      this.assets[`group_${k}`] = loadImage(PATHS.groupImgs[k], _=>{}, _=>{});
    }

    // font
    this.font = loadFont(PATHS.fonts, _=>{}, _=>{});
  }

  setup(){
    if (this.font) textFont(this.font);

    const dataList = this.extractDataList(this.bubbleData);
    refreshGroupLanguagesFromData(dataList);
    this.bubbleManager.build(dataList);

    this.recalcLayout();
    
    // 초기 카메라 위치를 그리드 중심으로 설정
    const spacing = RENDER_CONFIG.hexSpacing;
    const fallbackGrid = Math.ceil(Math.sqrt(RENDER_CONFIG.totalBubbles));
    const fallbackCenterGridX = Math.floor(fallbackGrid / 2);
    const fallbackCenterGridY = Math.floor(fallbackGrid / 2);
    const fallbackCenter = {
      x: fallbackCenterGridX * spacing * 1.5,
      y: fallbackCenterGridY * spacing * SQRT3 + ((fallbackCenterGridX % 2) * spacing * SQRT3) / 2
    };
    const centerPos = (this.bubbleManager && typeof this.bubbleManager.getCenterHexPosition === "function")
      ? this.bubbleManager.getCenterHexPosition()
      : fallbackCenter;
    const centerHexX = centerPos.x;
    const centerHexY = centerPos.y;
    
    // 화면 중심에 그리드 중심이 오도록 카메라 위치 설정
    this.pan.camX = centerHexX;
    this.pan.camY = centerHexY;
    this.pan.velX = 0;
    this.pan.velY = 0;
    this.pan.snapTargetX = null;
    this.pan.snapTargetY = null;
    
    this.input = new InputManager(this);
  }

  extractDataList(json){
    if (!json) {
      // dummy fallback
      const arr = [];
      for (let i=0; i<RENDER_CONFIG.totalBubbles; i++){
        arr.push({
          title: `버블 ${i+1}`,
          attributes: [ (i%5)+1 ],
          visualTags: groupLanguages[(i%5)+1].visual.slice(0,2),
          emotionalTags: groupLanguages[(i%5)+1].emotional.slice(0,2),
          image: null
        });
      }
      return arr;
    }

    if (Array.isArray(json)) return json;
    if (json.bubbles && Array.isArray(json.bubbles)) return json.bubbles;
    return [];
  }

  recalcLayout(){
    this.centerX = width * RENDER_CONFIG.centerXRatio;
    this.centerY = height * RENDER_CONFIG.centerYRatio;

    this.maxDist = Math.sqrt(width*width + height*height) / 2;

    // responsive scale
    const baseW = 1920, baseH = 1080;
    const s = Math.min(width/baseW, height/baseH);
    this.scaleAll = clamp(s, 0.5, 1.5);
  }

  onResize(){
    this.recalcLayout();
  }

  draw(){
    this.t = millis() / 1000;

    this.recalcLayout(); // cheap; keeps ratios stable
    this.ui.update();

    // 회전 각도 업데이트 (원본과 동일)
    if (this.ui.groupMode && this.ui.activeTag) {
      if (!RotationController.state.isDragging) {
        RotationController.state.rotationAngle += RotationController.state.autoSpeed;
        RotationController.state.rotationAngle += RotationController.state.angularVelocity;
        RotationController.state.angularVelocity *= 0.92;
        if (Math.abs(RotationController.state.angularVelocity) < 0.0001) {
          RotationController.state.angularVelocity = 0;
        }
      }
      const TWO_PI = Math.PI * 2;
      RotationController.state.rotationAngle = ((RotationController.state.rotationAngle % TWO_PI) + TWO_PI) % TWO_PI;
    } else {
      RotationController.state.rotationAngle = 0;
      RotationController.state.angularVelocity = 0;
      RotationController.state.isDragging = false;
      RotationController.state.didDrag = false;
    }

    // camera update
    if (!this.ui.groupMode) this.pan.update();

    // background
    this.drawBackground();

    // render bubbles
    if (this.ui.showGroupView && this.ui.activeTag) {
      // 태그 선택 시: 행성처럼 돌아가는 버블들
      // 1. 아래쪽 버블 먼저 그리기 (대표 이미지 뒤)
      this.bubbleManager.updateAndDrawGroupOrbit();
      // 2. 대표 이미지와 태그 그리기
      this.drawGroupView();
      // 3. 위쪽 버블 나중에 그리기 (대표 이미지 앞)
      const bubblesAbove = this.bubbleManager._bubblesAbove || [];
      for (let i=0; i<bubblesAbove.length; i++){
        const b = bubblesAbove[i];
        if (b && b.visible) {
          b.draw(this);
        }
      }
    } else if (this.ui.showGroupView) {
      // 중간 단계: 대표 이미지와 태그들이 둥둥 떠다니는 화면
      this.drawGroupView();
    } else {
      this.bubbleManager.updateAndDraw();
      // 캡은 이제 각 버블의 draw 메서드에서 처리됨
      
      // 중앙 버블 정보 자동 표시 (그룹 뷰가 아닐 때만)
      if (!this.ui.showGroupView) {
        const centerBubble = this.bubbleManager.getCenterBubble();
        if (centerBubble) {
          // 중앙 버블이 변경되면 항상 업데이트
          if (this.ui.infoBubble !== centerBubble) {
            this.ui.infoBubble = centerBubble;
          }
        } else {
          this.ui.infoBubble = null;
        }
      }
    }

    // UI overlay
    this.uiRenderer.draw();

    // periodic memory GC / soft reset
    this.handleMaintenance();
  }

  drawBackground(){
    background(RENDER_CONFIG.bgColor);

    const bg = this.assets.bg;
    if (bg && bg.width > 2) {
      const canvasRatio = width/height;
      const imgRatio = bg.width/bg.height;

      let dw, dh;
      if (imgRatio > canvasRatio) {
        dh = height; dw = height * imgRatio;
      } else {
        dw = width; dh = width / imgRatio;
      }
      imageMode(CENTER);
      image(bg, width/2, height/2, dw, dh);
    }

    // vignette (cheap gradient)
    noFill();
    for (let i=0; i<6; i++){
      const a = map(i,0,5,0,120);
      stroke(0, a);
      rectMode(CENTER);
      rect(width/2, height/2, width - i*40, height - i*40);
    }
  }

  drawCenterCapIfNeeded(){
    // draw cap on center bubble if any
    let centerBubble = null;
    const bubbles = this.bubbleManager.bubbles;
    for (let i=0; i<bubbles.length; i++){
      if (bubbles[i].isCenter) { centerBubble = bubbles[i]; break; }
    }
    if (!centerBubble) return;

    if (this.assets.bubbleCap && this.assets.bubbleCap.width > 2){
      push();
      imageMode(CENTER);
      translate(centerBubble.displayX, centerBubble.displayY);
      const s = (centerBubble.displayR*2) / this.assets.bubbleCap.width;
      scale(s);
      image(this.assets.bubbleCap, 0,0);
      pop();
    }
  }

  drawGroupCenterImage(){
    const g = this.ui.activeGroup;
    if (g === 0) return;
    const img = this.assets[`group_${g}`];
    if (!img || img.width <= 2) return;

    const s = this.scaleAll * 0.9;
    const w = img.width * s;
    const h = img.height * s;

    imageMode(CENTER);
    image(img, this.centerX, this.centerY, w, h);
  }

  drawGroupView(){
    const g = this.ui.activeGroup;
    if (g === 0) return;
    
    // 태그 히트박스 초기화
    this._tagHitBoxes = [];
    
    const s = this.scaleAll;
    const centerX = width / 2;
    const centerY = height / 2;
    // 그룹별 이미지 크기 배율 적용
    let sizeMultiplier = 1.0;
    if (g === 1) sizeMultiplier = 1.1;      // 여행자
    else if (g === 2) sizeMultiplier = 1.4;  // 20대 여성
    else if (g === 5) sizeMultiplier = 1.5;  // 10대 여성
    const baseImageSize = min(width * 0.4, height * 0.4) * s;
    const imageSize = baseImageSize * sizeMultiplier;
    const imageRadius = imageSize / 2;
    
    // 대표 이미지 그리기
    const groupImg = this.assets[`group_${g}`];
    if (groupImg && groupImg.width > 2) {
      imageMode(CENTER);
      image(groupImg, centerX, centerY, imageSize, imageSize);
      
      // 버블캡 (원래 크기 기준으로 유지)
      if (this.assets.bubbleCap && this.assets.bubbleCap.width > 2) {
        const capScale = baseImageSize / this.assets.bubbleCap.width;
        push();
        translate(centerX, centerY);
        scale(capScale);
        image(this.assets.bubbleCap, 0, 0);
        pop();
      }
    }
    
    // 태그들 그리기 (글래스모피즘 스타일)
    const groupLang = groupLanguages[g];
    if (groupLang) {
      const visualTags = groupLang.visual.slice(0, 2);
      const emotionalTags = groupLang.emotional.slice(0, 2);
      const selectedTags = [...visualTags, ...emotionalTags];

      const fontSize = 16 * 1.4 * s;
      const padding = 28 * s;
      const tagHeight = 56 * s;
      const tagRadius = tagHeight / 2;

      const tagPositions = [
        { offsetX: -0.8, offsetY: -0.15 },
        { offsetX: 0.85, offsetY: -0.35 },
        { offsetX: 0.85, offsetY: 0.35 },
        { offsetX: -0.8, offsetY: 0.55 },
      ];

      if (this.font) textFont(this.font);
      textAlign(CENTER, CENTER);
      textSize(fontSize);

      selectedTags.forEach((tag, index) => {
        if (index >= tagPositions.length) return;

        const pos = tagPositions[index] || tagPositions[0];
        const angle = Math.atan2(pos.offsetY, pos.offsetX);
        const ringRadius = imageRadius + 10 * s;
        const tagCenterX = centerX + Math.cos(angle) * ringRadius;
        const tagCenterY = centerY + Math.sin(angle) * ringRadius;

        const t = millis() * 0.001;
        const floatY = Math.sin(t + index) * 3 * s;
        const finalY = tagCenterY + floatY;

        const label = tag.startsWith("#") ? tag : `#${tag}`;
        const tagW = textWidth(label) + padding * 2;
        const rectX = tagCenterX - tagW / 2;
        const rectY = finalY - tagHeight / 2;

        const isSelected = this.ui.activeTag === tag;

        drawGlassTag(rectX, rectY, tagW, tagHeight, tagRadius, isSelected, false);

        push();
        drawingContext.save();
        drawingContext.textBaseline = "middle";
        drawingContext.textAlign = "center";
        drawingContext.imageSmoothingEnabled = true;
        drawingContext.imageSmoothingQuality = "high";
        fill(255, isSelected ? 255 : 225);
        textSize(fontSize);
        drawingContext.shadowBlur = isSelected ? 18 : 10;
        drawingContext.shadowColor = isSelected ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)";
        text(label, tagCenterX, finalY);
        drawingContext.shadowBlur = 0;
        drawingContext.restore();
        pop();

        this._tagHitBoxes.push({
          tag,
          x: tagCenterX,
          y: finalY,
          w: tagW,
          h: tagHeight,
          group: g
        });
      });
    }
  }

  handleMaintenance(){
    const now = millis();
    const gcInterval = isTablet ? PERFORMANCE_CONFIG.tabletGCInterval : PERFORMANCE_CONFIG.desktopGCInterval;
    const softResetInterval = isTablet ? PERFORMANCE_CONFIG.tabletSoftReset : PERFORMANCE_CONFIG.desktopSoftReset;

    if (now - this._lastGC > gcInterval){
      this.imageLoader.gc(this.bubbleManager.visibleImgSet);
      this._lastGC = now;
    }

    if (now - this._lastSoftReset > softResetInterval){
      this.imageLoader.softReset();
      this._lastSoftReset = now;
    }
  }

  /* ========= pointer handlers ========= */

  onPointerDown(x, y){
    // 마이크 클릭 체크
    if (this.checkMicHit(x, y)) {
      this.ui.toggleCategorySelection();
      return;
    }

    // 카테고리 선택 모드일 때만 토글 클릭 가능
    if (this.ui.showCategorySelection) {
      if (this.checkToggleHit(x,y)) return;
      // 카테고리 선택 모드에서 다른 곳 클릭하면 모드 종료
      this.ui.showCategorySelection = false;
      return;
    }

    // 그룹 모드에서 회전 제어 시도
    if (this.ui.groupMode && this.ui.activeTag) {
      if (this.ui.onOrbitDown(x, y)) {
        return; // 회전 제어가 시작되었으면 패닝 제어 중단
      }
    }

    this.pan.onDown();
  }

  onPointerMove(x, y, dx, dy){
    if (this.ui.groupMode && this.ui.activeTag && RotationController.state.isDragging){
      this.ui.onOrbitDrag(x, y);
      return;
    }
    this.pan.onDrag(dx, dy);
  }

  onPointerUp(x, y, dt, isClick){
    // 그룹 뷰에서 태그 클릭 체크 (원본과 동일하게 onPointerUp에서 처리)
    if (this.ui.showGroupView && this.ui.activeGroup !== 0) {
      const clickedTag = this.checkTagClick(x, y);
      if (clickedTag) {
        // 태그 선택 시 회전 제어 상태 초기화 (자동 회전 유지)
        this.ui.onOrbitUp();
        const isSameTag = this.ui.activeTag === clickedTag;
        if (isSameTag) {
          // 같은 태그를 다시 클릭하면 선택 해제
          this.ui.activeTag = null;
          this.ui.groupMode = false;
        } else {
          // 새로운 태그 선택
          this.ui.setTag(clickedTag);
        }
        return;
      }
      // 태그가 아직 선택되지 않았다면 다른 영역 클릭은 무시 (원본과 동일)
      if (!this.ui.activeTag) {
        return;
      }
    }

    if (this.ui.groupMode){
      this.ui.onOrbitUp();
      if (isClick) this.checkBubbleClick(x,y,true,dt);
      return;
    }

    this.pan.onUp();

    if (isClick) {
      this.checkBubbleClick(x,y,false,dt);
    }
  }

  checkBubbleClick(x, y, groupMode, dt){
    const bubbles = (groupMode && this.bubbleManager.activeOrbitBubbles && this.bubbleManager.activeOrbitBubbles.length > 0)
      ? this.bubbleManager.activeOrbitBubbles
      : this.bubbleManager.bubbles;

    // hit test (front-to-back approximate: larger first)
    let hit = null;
    let bestR = -1;
    for (let i=0;i<bubbles.length;i++){
      const b = bubbles[i];
      if (!b.visible) continue;
      if (b.contains(x,y) && b.displayR > bestR){
        bestR = b.displayR;
        hit = b;
      }
    }

    if (!hit) return;

    const isLongPress = dt >= INTERACTION_CONFIG.longPressDuration;
    if (hit.isCenter || isLongPress || groupMode){
      this.ui.showBubbleInfo(hit);
    } else {
      // short tap on orbit/off-center: still show
      this.ui.showBubbleInfo(hit);
    }
  }

  checkMicHit(x, y){
    const h = this._micHit;
    if (!h) return false;
    
    const dx = abs(x - h.x);
    const dy = abs(y - h.y);
    return (dx <= h.w*0.5 && dy <= h.h*0.5);
  }

  checkTagClick(x, y){
    // 원본과 동일하게 태그 레이아웃을 직접 계산하여 클릭 감지
    const ui = this.ui;
    const g = ui.activeGroup;
    if (g === 0) return null;
    
    const groupLang = groupLanguages[g];
    if (!groupLang) return null;
    
    const s = this.scaleAll;
    const centerX = width / 2;
    const centerY = height / 2;
    // 그룹별 이미지 크기 배율 적용
    let sizeMultiplier = 1.0;
    if (g === 1) sizeMultiplier = 1.1;      // 여행자
    else if (g === 2) sizeMultiplier = 1.4;  // 20대 여성
    else if (g === 5) sizeMultiplier = 1.5;  // 10대 여성
    const imageSize = min(width * 0.4, height * 0.4) * s * sizeMultiplier;
    const imageRadius = imageSize / 2;
    
    const visualTags = groupLang.visual.slice(0, 2);
    const emotionalTags = groupLang.emotional.slice(0, 2);
    const selectedTags = [...visualTags, ...emotionalTags];
    
    const fontSize = 16 * 1.4 * s;
    const padding = 28 * s;
    const tagHeight = 56 * s;
    
    const tagPositions = [
      { offsetX: -0.8, offsetY: -0.15 },
      { offsetX: 0.85, offsetY: -0.35 },
      { offsetX: 0.85, offsetY: 0.35 },
      { offsetX: -0.8, offsetY: 0.55 },
    ];
    
    // 폰트 설정
    if (this.font) textFont(this.font);
    textSize(fontSize);
    
    let clicked = null;
    
    selectedTags.forEach((tag, index) => {
      if (index >= 4 || clicked) return;
      
      const pos = tagPositions[index] || tagPositions[0];
      const angle = Math.atan2(pos.offsetY, pos.offsetX);
      const ringRadius = imageRadius + 10 * s;
      const tagX = centerX + Math.cos(angle) * ringRadius;
      const tagY = centerY + Math.sin(angle) * ringRadius;
      
      // 둥둥 떠다니는 효과 고려
      const t = millis() * 0.001;
      const floatY = Math.sin(t + index) * 3 * s;
      const finalY = tagY + floatY;
      
      // 태그에 # 추가 (표시용)
      const tagWithHash = tag.startsWith('#') ? tag : `#${tag}`;
      
      // 태그 크기 계산 (표시용 태그로 계산)
      const tagW = textWidth(tagWithHash) + padding * 2;
      
      // 클릭 감지 (원본과 동일한 로직)
      if (
        x >= tagX - tagW / 2 &&
        x <= tagX + tagW / 2 &&
        y >= finalY - tagHeight / 2 &&
        y <= finalY + tagHeight / 2
      ) {
        // 원본과 동일하게 # 없이 태그 반환
        clicked = tag;
      }
    });
    
    return clicked;
  }

  checkToggleHit(x,y){
    const h = this._toggleHit;
    if (!h.count) return false;
    
    // 카테고리 선택 모드가 아닐 때는 클릭 불가
    if (!this.ui.showCategorySelection) return false;

    const dx = abs(x - h.cx);
    if (dx > h.btnW*0.5) return false;

    for (let i=0;i<h.count;i++){
      const by = h.startY + i*h.gap;
      if (abs(y - by) <= h.btnH*0.5){
        this.ui.setGroup(i);
        return true;
      }
    }
    return false;
  }
}