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
let bubbleData = []; // 버블 제목/태그 데이터
let imageFiles = []; // 이미지 파일명 목록 (전역으로 이동)
let pretendardFont; // Pretendard 폰트
let groupImages = {}; // 집단 이미지들 (1: traveler, 2: 20s, 3: 50s, 4: housewife, 5: 10s)

explorerRuntime.registerCleanup("asset-cache", ({ keepCache } = {}) => {
  if (keepCache) return;
  bubbleImages.length = 0;
  imageFiles.length = 0;
  // ImageLoader는 별도로 관리되므로 여기서는 제거하지 않음
  
  // ResourceManager 정리
  if (resourceManager) {
    resourceManager.destroy();
  }
  
  // InputManager 정리
  if (inputManager) {
    inputManager.destroy();
  }
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

// 리소스 관리자 클래스 (버퍼 및 자산 관리)
class ResourceManager {
  constructor() {
    this.buffers = new Map(); // 버퍼 캐시 (key -> buffer)
    this.assets = {
      images: {},
      fonts: {},
      data: null
    };
  }

  // 그래픽 버퍼 가져오기 또는 업데이트 (메모리 누수 방지)
  getOrUpdateBuffer(key, width, height) {
    const existing = this.buffers.get(key);
    const needsNewBuffer = !existing || existing.width !== width || existing.height !== height;
    
    if (needsNewBuffer) {
      // 기존 버퍼가 있으면 반드시 메모리 해제 (태블릿 멈춤 방지 핵심)
      if (existing?.remove) {
        existing.remove();
      }
      const newBuffer = createGraphics(width, height);
      this.buffers.set(key, newBuffer);
      return newBuffer;
    }
    
    existing.clear();
    return existing;
  }

  // 버퍼 제거
  removeBuffer(key) {
    const buffer = this.buffers.get(key);
    if (buffer?.remove) {
      buffer.remove();
    }
    this.buffers.delete(key);
  }

  // 모든 버퍼 정리
  clearBuffers() {
    this.buffers.forEach((buffer, key) => {
      if (buffer?.remove) {
        buffer.remove();
      }
    });
    this.buffers.clear();
  }

  // 자산 검증 헬퍼
  checkAsset(asset, name, onSuccess = null) {
    const isValid = asset && (!asset.width || asset.width > 0);
    if (!isValid) {
      logError(`${name} 로딩 실패`);
      return false;
    } else if (onSuccess) {
      onSuccess();
    }
    return true;
  }

  // 버블 데이터 비동기 로드
  async loadBubbleData() {
    try {
      const response = await fetch("../public/assets/data/bubbles.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bubblesJson = await response.json();
      log("[Explorer] JSON 로드 성공:", bubblesJson);

      // 버블 이미지 데이터 정의
      if (bubblesJson && bubblesJson.imageFiles && Array.isArray(bubblesJson.imageFiles)) {
        imageFiles = bubblesJson.imageFiles;
        log(`[Explorer] JSON에서 ${imageFiles.length}개의 이미지 파일 로드됨`);
      } else {
        logError("[Explorer] JSON에서 imageFiles를 로드할 수 없습니다", bubblesJson);
      }

      // 버블 데이터
      if (bubblesJson && bubblesJson.bubbles && Array.isArray(bubblesJson.bubbles)) {
        bubbleData = bubblesJson.bubbles.map(bubble => ({
          title: bubble.title,
          tags: bubble.tags,
          attributes: bubble.attributes,
          visualTags: [],
          emotionalTags: []
        }));
        log(`[Explorer] JSON에서 ${bubbleData.length}개의 버블 데이터 로드됨`);

        // 버블 이미지 배열 초기화
        if (bubbleImageLoader) {
          for (let i = 0; i < imageFiles.length; i++) {
            bubbleImageLoader.images.push(null);
          }
          bubbleImages = bubbleImageLoader.images;
        }

        // 버블 데이터에 언어 할당
        assignLanguagesToBubbles();
        log(`[Explorer] 버블 데이터에 언어 할당 완료`);

        return true;
      } else {
        logError("[Explorer] JSON에서 bubbles를 로드할 수 없습니다", bubblesJson);
        return false;
      }
    } catch (error) {
      logError("[Explorer] JSON 로드 중 오류 발생:", error);
      bubbleData = [];
      imageFiles = [];
      return false;
    }
  }

  // 정리
  destroy() {
    this.clearBuffers();
    this.assets = {
      images: {},
      fonts: {},
      data: null
    };
  }
}

// 전역 리소스 관리자 인스턴스
let resourceManager = null;

// 그래픽 관리자 클래스 (비네팅 캐싱 및 버퍼 관리)
class GraphicsManager {
  constructor() {
    this.vignetteBuffer = null;
    this.lastVignetteSize = { w: 0, h: 0 };
    this.lastWindowSize = { w: 0, h: 0 };
    this._bgImageDrawn = false; // 배경 이미지 그리기 완료 플래그 (깜빡임 방지)
  }

  // 배경 그리기 (ResourceManager 사용, 깜빡임 방지 강화)
  drawBackground() {
    // 배경 버퍼가 없으면 즉시 생성하고 배경색으로 채우기 (깜빡임 방지)
    if (!bgBuffer) {
      if (resourceManager) {
        bgBuffer = resourceManager.getOrUpdateBuffer('bg', width, height);
      } else {
        bgBuffer = recreateGraphicsBuffer(bgBuffer, width, height);
      }
      // 배경 이미지가 로드되기 전에도 배경색으로 즉시 채우기
      bgBuffer.background(BG_COLOR);
      this._bgImageDrawn = false; // 초기화
    }
    
    // 배경 이미지가 로드되었는지 확인하고, 로드되었으면 그리기 (한 번만)
    if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
      // 배경 버퍼에 이미지가 그려져 있지 않으면 그리기
      if (!this._bgImageDrawn) {
        redrawBackgroundBuffer();
        this._bgImageDrawn = true;
      }
    }
    
    // 배경 버퍼를 메인 캔버스에 그리기 (항상 안정적으로 표시, 깜빡임 방지)
    // 태블릿에서는 더블 버퍼링 강화
    if (IS_MOBILE) {
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = 'high';
      image(bgBuffer, 0, 0);
      drawingContext.restore();
      pop();
    } else {
      image(bgBuffer, 0, 0);
    }
  }

  // 비네팅 효과 캐싱 (메모리 누수 방지)
  drawVignette() {
    // 화면 크기가 변경되었거나 버퍼가 없으면 재생성
    const needsUpdate = !this.vignetteBuffer || 
                       this.lastVignetteSize.w !== width || 
                       this.lastVignetteSize.h !== height;

    if (needsUpdate) {
      // 기존 버퍼 해제
      if (this.vignetteBuffer?.remove) {
        this.vignetteBuffer.remove();
      }

      // 새 버퍼 생성
      this.vignetteBuffer = createGraphics(width, height);
      this.vignetteBuffer.clear();
      
      // 비네팅 그리기 (한 번만)
      const gTop = this.vignetteBuffer.drawingContext.createLinearGradient(0, 0, 0, height * 0.25);
      gTop.addColorStop(0, "rgba(0,0,0,0.35)");
      gTop.addColorStop(1, "rgba(0,0,0,0)");
      this.vignetteBuffer.drawingContext.fillStyle = gTop;
      this.vignetteBuffer.noStroke();
      this.vignetteBuffer.rect(0, 0, width, height * 0.25);

      const gBot = this.vignetteBuffer.drawingContext.createLinearGradient(0, height, 0, height * 0.75);
      gBot.addColorStop(0, "rgba(0,0,0,0.35)");
      gBot.addColorStop(1, "rgba(0,0,0,0)");
      this.vignetteBuffer.drawingContext.fillStyle = gBot;
      this.vignetteBuffer.rect(0, height * 0.75, width, height * 0.25);

      this.lastVignetteSize = { w: width, h: height };
    }

    // 캐시된 비네팅 그리기
    if (this.vignetteBuffer) {
      image(this.vignetteBuffer, 0, 0);
    }
  }

  // 정리
  destroy() {
    if (this.vignetteBuffer?.remove) {
      this.vignetteBuffer.remove();
    }
    this.vignetteBuffer = null;
    this.lastVignetteSize = { w: 0, h: 0 };
  }
}

// 전역 그래픽 관리자 인스턴스
let graphicsManager = null;

// 그룹 뷰 렌더러 클래스 (그라디언트 및 태그 레이아웃 캐싱)
class GroupViewRenderer {
  static glowBuffer = null;
  static cachedTagLayouts = {}; // groupIndex -> [{tag, x, y, w, h, fontSize}]
  static lastOrbitMetrics = null;

  // 백글로우 버퍼 생성 (한 번만)
  static _createGlowBuffer(imageX, imageY, imageRadius) {
    const glowRadius = imageRadius * 1.7;
    const bufferSize = Math.ceil(glowRadius * 2) + 20;
    
    // 기존 버퍼 해제
    if (this.glowBuffer?.remove) {
      this.glowBuffer.remove();
    }

    // 새 버퍼 생성
    this.glowBuffer = createGraphics(bufferSize, bufferSize);
    this.glowBuffer.clear();
    
    const centerX = bufferSize / 2;
    const centerY = bufferSize / 2;
    
    // 빛 효과 그리기 (한 번만)
    const glowGradient = this.glowBuffer.drawingContext.createRadialGradient(
      centerX,
      centerY,
      imageRadius * 0.4,
      centerX,
      centerY,
      glowRadius
    );
    
    glowGradient.addColorStop(0, "rgba(255,255,255,0.7)");
    glowGradient.addColorStop(0.5, "rgba(255, 243, 156, 0.18)");
    glowGradient.addColorStop(1, "rgba(255, 255, 217, 0)");
    
    this.glowBuffer.drawingContext.fillStyle = glowGradient;
    this.glowBuffer.drawingContext.beginPath();
    this.glowBuffer.drawingContext.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    this.glowBuffer.drawingContext.fill();
    
    this.lastOrbitMetrics = { imageX, imageY, imageRadius };
  }

  // 태그 레이아웃 계산 (그룹 변경 시에만)
  static _calculateTagLayout(groupIndex) {
    const groupLang = BubbleDataManager.groupLanguages[groupIndex];
    if (!groupLang) return;

    const responsiveScale = LayoutManager.getScale();
    const orbitMetrics = this._getOrbitCenterMetrics();
    const { imageX, imageY, imageSize } = orbitMetrics;
    const imageRadius = imageSize / 2;

    // 태그를 4개로 제한
    const visualTags = groupLang.visual.slice(0, 2);
    const emotionalTags = groupLang.emotional.slice(0, 2);
    const selectedTags = [...visualTags, ...emotionalTags];

    const TAG_FONT_SCALE = 1.4;
    const fontSize = 16 * TAG_FONT_SCALE * responsiveScale;
    const padding = 28 * responsiveScale;
    const tagHeight = 56 * responsiveScale;

    // 텍스트 크기 계산
    push();
    if (pretendardFont) textFont(pretendardFont);
    textSize(fontSize);
    
    const tagSizes = selectedTags.map(tag => ({
      tag,
      width: textWidth(tag) + padding * 2,
      height: tagHeight
    }));
    pop();

    // 대표사진의 위아래 20% 영역 계산
    const topExcludeZone = imageY - imageRadius;
    const topExcludeEnd = imageY - imageRadius * 0.8;
    const bottomExcludeStart = imageY + imageRadius * 0.8;
    const bottomExcludeZone = imageY + imageRadius;

    // 연령별 태그 위치 설정
    const pixelToOffsetRatio = 1.0 / imageRadius;
    const groupTagPositions = {
      1: [
        { offsetX: -0.7, offsetY: -0.1 - 20 * pixelToOffsetRatio },
        { offsetX: 0.7, offsetY: -0.3 },
        { offsetX: 0.7, offsetY: 0.3 },
        { offsetX: -0.7, offsetY: 0.5 - 20 * pixelToOffsetRatio },
      ],
      2: [
        { offsetX: -0.6, offsetY: -0.4 },
        { offsetX: 0.6, offsetY: -0.3 },
        { offsetX: 0.6, offsetY: 0.5 },
        { offsetX: -0.6, offsetY: 0.4 },
      ],
      3: [
        { offsetX: -0.5, offsetY: -0.5 },
        { offsetX: 0.5, offsetY: -0.5 },
        { offsetX: 0.5, offsetY: 0.5 },
        { offsetX: -0.5, offsetY: 0.5 },
      ],
      4: [
        { offsetX: -0.65, offsetY: -0.35 },
        { offsetX: 0.65, offsetY: -0.35 - 25 * pixelToOffsetRatio },
        { offsetX: 0.65, offsetY: 0.35 - 25 * pixelToOffsetRatio },
        { offsetX: -0.65, offsetY: 0.35 },
      ],
      5: [
        { offsetX: -0.55 - 100 * pixelToOffsetRatio, offsetY: -0.45 },
        { offsetX: 0.55, offsetY: -0.45 },
        { offsetX: 0.55, offsetY: 0.45 },
        { offsetX: -0.55 - 100 * pixelToOffsetRatio, offsetY: 0.45 - 100 * pixelToOffsetRatio },
      ],
    };

    const basePositions = groupTagPositions[groupIndex] || groupTagPositions[3];
    const layout = [];

    selectedTags.forEach((tag, index) => {
      if (index >= 4) return;

      const tagSize = tagSizes[index];
      const basePos = basePositions[index];
      const angle = Math.atan2(basePos.offsetY, basePos.offsetX);
      const baseTagX = imageX + Math.cos(angle) * imageRadius;
      const baseTagY = imageY + Math.sin(angle) * imageRadius;

      // 특정 태그만 추가 조정
      let adjustY = 0;
      let adjustX = 0;
      if (tag === "핑크-옐로우") adjustY = -5;
      else if (tag === "사랑스러움") adjustY = -25;
      else if (tag === "안정된 구형") adjustY = 10;
      else if (tag === "책임감") { adjustY = -60; adjustX = -20; }
      else if (tag === "보호") { adjustY = -50; adjustX = 20; }
      else if (tag === "자기취향 강도") { adjustY = 30; adjustX = -10; }
      else if (tag === "네온 핑크") { adjustY = -30; adjustX = 10; }
      else if (tag === "흥미") adjustX = 10;

      layout.push({
        tag,
        x: baseTagX + adjustX,
        y: baseTagY + adjustY,
        w: tagSize.width,
        h: tagSize.height,
        fontSize
      });
    });

    this.cachedTagLayouts[groupIndex] = layout;
  }

  // 오비트 중심 메트릭 가져오기 (캐시된 값 사용)
  static _getOrbitCenterMetrics() {
    const responsiveScale = LayoutManager.getScale();
    const { bottom: SEARCH_BOTTOM } = LayoutManager.getSearchMetrics();
    const centerX = width / 2;
    const centerY = (SEARCH_BOTTOM + height) / 2;
    const imageSize = min(width * 0.4, height * 0.4) * responsiveScale;
    const imageX = centerX;
    const imageY = centerY - 50;
    return { centerX, centerY, imageX, imageY, imageSize };
  }

  // 이미지 그리기 (스케일링 로직 포함)
  static _drawImage(groupIndex) {
    const groupImg = groupImages[groupIndex];
    if (!groupImg || !groupImg.width || groupImg.width === 0) return;

    const { imageX, imageY, imageSize } = this._getOrbitCenterMetrics();
    const imageRadius = imageSize / 2;

    push();
    drawingContext.save();
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

    // 그룹별 스케일링
    if (groupIndex === 5) {
      drawW *= 1.5;
      drawH *= 1.5;
    } else if (groupIndex === 2) {
      drawW *= 1.4;
      drawH *= 1.4;
    }

    image(groupImg, imageX, imageY, drawW, drawH);
    drawingContext.restore();
    pop();
  }

  // 그룹 뷰 그리기 (메인 메서드)
  static draw(groupIndex) {
    if (!groupImages[groupIndex]) return;

    const { imageX, imageY, imageSize } = this._getOrbitCenterMetrics();
    const imageRadius = imageSize / 2;

    // 백글로우 그리기 (캐시된 버퍼 사용)
    if (!this.glowBuffer || 
        !this.lastOrbitMetrics ||
        this.lastOrbitMetrics.imageRadius !== imageRadius) {
      this._createGlowBuffer(imageX, imageY, imageRadius);
    }

    if (this.glowBuffer) {
      push();
      drawingContext.save();
      drawingContext.globalAlpha = 0.85;
      const bufferSize = this.glowBuffer.width;
      const offsetX = imageX - bufferSize / 2;
      const offsetY = imageY - bufferSize / 2;
      image(this.glowBuffer, offsetX, offsetY);
      drawingContext.restore();
      pop();
    }

    // 이미지 그리기
    this._drawImage(groupIndex);

    // 태그 그리기 (캐시된 레이아웃 사용)
    if (!this.cachedTagLayouts[groupIndex]) {
      this._calculateTagLayout(groupIndex);
    }

    const tagLayout = this.cachedTagLayouts[groupIndex];
    if (tagLayout) {
      push();
      drawingContext.save();
      
      // p5.js와 drawingContext 모두 중앙 정렬 설정
      textAlign(CENTER, CENTER);
      drawingContext.textBaseline = "middle";
      drawingContext.textAlign = "center";
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      if (pretendardFont) textFont(pretendardFont);
      
      tagLayout.forEach(({ tag, x, y, fontSize }) => {
        textSize(fontSize);
        text(tag, x, y);
      });
      
      drawingContext.restore();
      pop();
    }

    // 빛 효과 그리기 (버블캡 아래, 이미지 위)
    const orbitMetrics = this._getOrbitCenterMetrics();
    const lightImageX = orbitMetrics.imageX;
    const lightImageY = orbitMetrics.imageY;
    const lightImageSize = orbitMetrics.imageSize;
    const lightImageRadius = lightImageSize / 2;
    const tempBubble = {
      pos: { x: lightImageX, y: lightImageY },
      r: lightImageRadius,
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
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      image(bubbleCap, lightImageX, lightImageY, lightImageSize, lightImageSize);
      drawingContext.restore();
      pop();
    }

    // 집단 이름 텍스트 그리기
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
      
      // p5.js와 drawingContext 모두 중앙 정렬 설정
      textAlign(CENTER, CENTER);
      drawingContext.textBaseline = "middle";
      drawingContext.textAlign = "center";
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      
      if (pretendardFont) {
        textFont(pretendardFont);
      }
      
      const responsiveScale = LayoutManager.getScale();
      const { centerY } = this._getOrbitCenterMetrics();
      const textSizeValue = 32 * responsiveScale;
      textSize(textSizeValue);
      textStyle(BOLD);
      fill(255);
      text(groupName, width / 2, centerY);
      
      drawingContext.restore();
      pop();
    }
  }

  // 레이아웃 무효화 (리사이즈 시)
  static invalidateLayout() {
    this.cachedTagLayouts = {};
    if (this.glowBuffer?.remove) {
      this.glowBuffer.remove();
    }
    this.glowBuffer = null;
    this.lastOrbitMetrics = null;
  }

  // 정리
  static destroy() {
    this.invalidateLayout();
  }
}

// 오비트 시스템 클래스 (객체 생성 최소화)
class OrbitSystem {
  // 오비트 버블 위치 업데이트 (수학 계산만)
  static updateOrbitPositions(bubbles, filterFn, orbitContextKey) {
    if (!bubbles || bubbles.length === 0) return [];
    
    const targetBubbles = bubbles.filter(filterFn);
    if (targetBubbles.length === 0) return [];
    
    const { imageX, imageY, imageSize } = getOrbitCenterMetrics();
    const centerRadius = imageSize / 2;
    const minOrbitRadius = centerRadius + 100;
    const maxOrbitRadius = min(width, height) * 0.45;
    const baseTime = RotationController.state.rotationAngle;
    const tiltAngle = Math.PI / 5;
    const orbitTilt = Math.cos(tiltAngle) * 0.85;
    const orbitStretch = 1.3;
    
    const totalBubbles = targetBubbles.length;
    const isMobile = IS_MOBILE;
    const maxVisibleBubbles = isMobile ? 30 : totalBubbles;
    const visibleCount = Math.min(totalBubbles, maxVisibleBubbles);
    const angleStep = totalBubbles > 0 ? (Math.PI * 2) / totalBubbles : 0;
    
    // orbitBubblePositions 초기화
    orbitBubblePositions = [];
    
    // 버블에 zDepth 속성 추가하여 정렬에 사용
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
      
      // 오비트 버블 준비
      const justSynced = this.ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey);
      const baseEase = justSynced ? 1.0 : 0.15;
      bubble.baseRadius = lerp(bubble.baseRadius, targetBaseR, baseEase);
      
      // 애니메이션 계산
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
      
      // zDepth를 버블 객체에 저장 (정렬용, 임시 객체 생성 방지)
      bubble._zDepth = zDepth;
      bubble._finalY = finalY;
      
      // 클릭 감지용 위치 정보 저장
      orbitBubblePositions.push({ bubble, x: bubbleX, y: finalY, r: bubble.r });
    }
    
    return targetBubbles.slice(0, visibleCount);
  }

  // 오비트 버블 렌더링 (그리기만)
  static render(bubbles) {
    if (!bubbles || bubbles.length === 0) return [];
    
    const { imageY } = getOrbitCenterMetrics();
    
    // zDepth 기준으로 정렬 (뒤에서 앞으로)
    const sortedBubbles = bubbles.slice().sort((a, b) => {
      if (a._zDepth === undefined || b._zDepth === undefined) return 0;
      return a._zDepth - b._zDepth;
    });
    
    // 아래쪽 버블 먼저 그리기
    const bubblesAbove = [];
    sortedBubbles.forEach(bubble => {
      if (bubble._finalY < imageY) {
        bubble.drawAt(bubble.pos.x, bubble.pos.y);
      } else {
        bubblesAbove.push(bubble);
      }
    });
    
    return bubblesAbove;
  }

  // 오비트 버블 준비 (상태 초기화)
  static ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey) {
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

  // 오비트 버블 상태 초기화
  static resetOrbitBubbleState() {
    if (!bubbleManager || !bubbleManager.bubbles) return;
    bubbleManager.bubbles.forEach((bubble) => {
      if (bubble.isInOrbit) {
        bubble.isInOrbit = false;
        bubble.orbitContextKey = null;
      }
    });
  }
}

// 토글 관리자 클래스
class ToggleManager {
  static TOGGLE_LABELS = [
    "전체 보기",
    "여행자의 취향만 모아보고 싶어",
    "20대 여성의 취향만 모아보고 싶어",
    "50대 남성의 취향만 모아보고 싶어",
    "주부들의 취향만 모아보고 싶어",
    "10대 여성의 취향만 모아보고 싶어",
  ];

  static buttons = [];
  static layout = null;

  // 레이아웃 계산 (리사이즈 시에만)
  static calculateLayout() {
    const toggleWidth = 300;
    const toggleHeight = 50;
    const toggleX = (width - toggleWidth) / 2;
    const startY = 220;
    const spacing = 60;
    const radius = 16;
    this.layout = { toggleWidth, toggleHeight, toggleX, startY, spacing, radius };
  }

  // 토글 버튼 초기화
  static init() {
    if (!this.layout) {
      this.calculateLayout();
    }
    
    const { toggleWidth, toggleHeight, toggleX, startY, spacing, radius } = this.layout;
    
    this.buttons = this.TOGGLE_LABELS.map((label, i) => {
      const toggleY = startY + i * spacing;
      return new ToggleButton(label, i, toggleX, toggleY, toggleWidth, toggleHeight, radius);
    });
  }

  // 토글 UI 그리기
  static draw() {
    const showToggles = uiStateManager ? uiStateManager.showToggles : false;
    const selectedToggles = uiStateManager ? uiStateManager.selectedToggles : [];
    if (!showToggles) return;
    
    // 버튼이 초기화되지 않았으면 초기화
    if (this.buttons.length === 0) {
      this.init();
    }
    
    push();
    drawingContext.save();
    
    // 버튼 그리기
    this.buttons.forEach(button => button.draw(selectedToggles));
    
    drawingContext.restore();
    pop();
  }
}

// UI 렌더러 클래스 (그라디언트 캐싱 및 UI 렌더링 통합)
class UIRenderer {
  constructor() {
    this.micGlowBuffer = null;
    this.lastMicGlowSize = { size: 0 };
  }

  // 마이크 빛 효과 버퍼 생성 (한 번만 생성, 펄스 효과는 tint로 구현)
  createMicGlowBuffer(iconCenterX, iconCenterY, iconRadius) {
    const glowRadius = iconRadius * 1.2;
    const bufferSize = Math.ceil(glowRadius * 2) + 10;
    
    // 크기가 변경되었거나 버퍼가 없으면 재생성
    const needsUpdate = !this.micGlowBuffer || 
                       this.lastMicGlowSize.size !== bufferSize;

    if (needsUpdate) {
      // 기존 버퍼 해제
      if (this.micGlowBuffer?.remove) {
        this.micGlowBuffer.remove();
      }

      // 새 버퍼 생성
      this.micGlowBuffer = createGraphics(bufferSize, bufferSize);
      this.micGlowBuffer.clear();
      
      // 빛 효과 그리기 (중앙 기준)
      const centerX = bufferSize / 2;
      const centerY = bufferSize / 2;
      
      const glowGradient = this.micGlowBuffer.drawingContext.createRadialGradient(
        centerX,
        centerY,
        iconRadius * 0.2,
        centerX,
        centerY,
        glowRadius
      );
      
      glowGradient.addColorStop(0, "rgba(255, 255, 255, 1.0)");
      glowGradient.addColorStop(0.3, "rgba(255, 255, 255, 0.6)");
      glowGradient.addColorStop(0.6, "rgba(255, 255, 255, 0.3)");
      glowGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      
      this.micGlowBuffer.drawingContext.fillStyle = glowGradient;
      this.micGlowBuffer.drawingContext.beginPath();
      this.micGlowBuffer.drawingContext.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      this.micGlowBuffer.drawingContext.fill();

      this.lastMicGlowSize = { size: bufferSize };
    }

    return this.micGlowBuffer;
  }

  // 네비게이션 바 그리기
  static drawNavBar() {
    const metrics = LayoutManager.metrics.nav;
    if (!metrics) return;

    const { BUTTON_W, BUTTON_H, NAV_W, NAV_H, Y, navBarX } = metrics;

    // 캡쳐 버튼 - 왼쪽 끝
    imageMode(CORNER);
    image(captureButton, 0, Y, BUTTON_W, BUTTON_H);

    // 워크룸 버튼 - 오른쪽 끝
    image(workroomButton, width - BUTTON_W, Y, BUTTON_W, BUTTON_H);

    // 네비게이션 바 - 중앙에 배치
    push();
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    imageMode(CORNER);
    if (navBarBuffer) {
      image(navBarBuffer, navBarX, Y, NAV_W, NAV_H);
    } else {
      image(navigationBar, navBarX, Y, NAV_W, NAV_H);
    }
    pop();
  }

  // 검색창 그리기
  drawSearchBar() {
    const { W, H, X, Y } = LayoutManager.getSearchMetrics();
    const showToggles = uiStateManager ? uiStateManager.showToggles : false;

    // 마이크 아이콘 - 중앙에 배치
    if (mikeIcon) {
      const { iconX, iconY, iconSize, iconCenterX, iconCenterY, iconRadius } = LayoutManager.getMicIconRect();
      imageMode(CORNER);

      // 빛 효과 (캐시된 버퍼 사용)
      if (ANIMATION_CONFIG.enableMicGlow) {
        const glowBuffer = this.createMicGlowBuffer(iconCenterX, iconCenterY, iconRadius);
        
        if (glowBuffer) {
          push();
          drawingContext.save();
          
          // 시간에 따른 펄스 효과 (1.5초 주기)
          const pulseTime = (millis() / 1500) % 1;
          const pulseValue = (Math.sin(pulseTime * Math.PI * 2) + 1) / 2;
          const minBrightness = 0.3;
          const maxBrightness = 0.9;
          const pulseBrightness = lerp(minBrightness, maxBrightness, pulseValue);
          
          // tint로 펄스 효과 구현 (그라디언트 재생성 없이)
          drawingContext.globalAlpha = pulseBrightness;
          const bufferSize = this.lastMicGlowSize.size;
          const offsetX = iconCenterX - bufferSize / 2;
          const offsetY = iconCenterY - bufferSize / 2;
          image(glowBuffer, offsetX, offsetY);
          
          drawingContext.restore();
          pop();
        }
      }

      // 화질 개선 설정
      push();
      drawingContext.save();
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";

      tint(255, 255, 255, 200);
      image(mikeIcon, iconX, iconY, iconSize, iconSize);
      noTint();

      drawingContext.restore();
      pop();
    }

    // 선택된 토글이 있으면 마이크 아래에 텍스트 표시
    if (!showToggles) {
      push();
      drawingContext.save();
      
      drawingContext.textBaseline = "top";
      drawingContext.textAlign = "center";
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      
      noStroke();
      textAlign(CENTER, TOP);

      if (pretendardFont) {
        textFont(pretendardFont);
      }
      pop();
    }
  }

  // 정리
  destroy() {
    if (this.micGlowBuffer?.remove) {
      this.micGlowBuffer.remove();
    }
    this.micGlowBuffer = null;
    this.lastMicGlowSize = { size: 0 };
  }
}


// 레이아웃 관리자 클래스 (반응형 수치 캐싱)
class LayoutManager {
  static metrics = {
    scale: 1.0,
    nav: null,
    search: { W: 0, H: 0, X: 0, Y: 0, bottom: 0 },
    bubbleArea: { centerX: 0, centerY: 0, BUBBLE_AREA_CENTER: 0 },
    micIcon: { iconX: 0, iconY: 0, iconSize: 0, iconCenterX: 0, iconCenterY: 0, iconRadius: 0 }
  };

  // 모든 레이아웃 메트릭 계산 (windowResized에서만 호출)
  static calculateMetrics() {
    // 반응형 스케일 계산
    const baseWidth = 1920;
    const baseHeight = 1080;
    const scaleX = width / baseWidth;
    const scaleY = height / baseHeight;
    const scale = Math.min(scaleX, scaleY);
    const minScale = 0.5;
    const maxScale = 1.5;
    this.metrics.scale = Math.max(minScale, Math.min(maxScale, scale));

    // 네비게이션 바 메트릭 계산
    const responsiveScale = this.metrics.scale;
    if (captureButton && workroomButton && navigationBar) {
      const BUTTON_W = captureButton.width * 0.56 * responsiveScale;
      const BUTTON_H = captureButton.height * 0.56 * responsiveScale;
      const NAV_W = navigationBar.width * 0.455 * responsiveScale;
      const NAV_H = navigationBar.height * 0.455 * responsiveScale;
      const Y = 20;
      const navBarX = (width - NAV_W) / 2;
      this.metrics.nav = { BUTTON_W, BUTTON_H, NAV_W, NAV_H, Y, navBarX };
    } else {
      this.metrics.nav = null;
    }

    // 검색창 메트릭 계산
    const NAV_Y = 20;
    const NAV_H = navigationBar ? navigationBar.height * 0.315 * responsiveScale : 64;
    const NAV_BOTTOM = NAV_Y + NAV_H;
    const W = width * SEARCH_WIDTH_RATIO * responsiveScale * 1.3;
    const H = 75 * SEARCH_SCALE * responsiveScale * 1.3;
    const X = (width - W) / 2;
    const Y = NAV_BOTTOM + SEARCH_NAV_GAP * responsiveScale;
    this.metrics.search = { W, H, X, Y, bottom: Y + H };

    // 버블 영역 중심 계산
    const SEARCH_BOTTOM = this.metrics.search.bottom;
    const BUBBLE_AREA_TOP = SEARCH_BOTTOM + 10;
    const BUBBLE_AREA_BOTTOM = height - 10;
    const BUBBLE_AREA_CENTER = BUBBLE_AREA_TOP + (BUBBLE_AREA_BOTTOM - BUBBLE_AREA_TOP) * 0.5;
    this.metrics.bubbleArea = {
      centerX: width * CENTER_X_RATIO,
      centerY: BUBBLE_AREA_CENTER - 70, // 기본 offsetY
      BUBBLE_AREA_CENTER
    };

    // 마이크 아이콘 위치/크기 계산
    const iconSize = 40 * SEARCH_SCALE * responsiveScale * 1.5 * 1.3 * 4 * 0.7;
    const iconX = X + (W - iconSize) / 2;
    const iconY = Y + (H - iconSize) / 2 + 20;
    this.metrics.micIcon = {
      iconX,
      iconY,
      iconSize,
      iconCenterX: iconX + iconSize / 2,
      iconCenterY: iconY + iconSize / 2,
      iconRadius: iconSize / 2
    };
  }

  // 네비게이션 바 메트릭 가져오기
  static getNavMetrics() {
    return this.metrics.nav;
  }

  // 반응형 스케일 가져오기
  static getScale() {
    return this.metrics.scale;
  }

  // 검색창 메트릭 가져오기
  static getSearchMetrics() {
    return this.metrics.search;
  }

  // 버블 영역 중심 가져오기
  static getBubbleAreaCenter(offsetY = -70) {
    return {
      centerX: this.metrics.bubbleArea.centerX,
      centerY: this.metrics.bubbleArea.centerY + offsetY + 70, // 기본 offsetY 보정
      BUBBLE_AREA_CENTER: this.metrics.bubbleArea.BUBBLE_AREA_CENTER
    };
  }

  // 마이크 아이콘 위치/크기 가져오기
  static getMicIconRect() {
    return this.metrics.micIcon;
  }

  // 네비게이션 바 메트릭 가져오기
  static getNavMetrics() {
    return this.metrics.nav;
  }
}

// 하위 호환성을 위한 함수 래퍼
function recreateGraphicsBuffer(buffer, w, h) {
  if (!resourceManager) {
    // 레거시 동작 (ResourceManager가 없을 때)
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
  // ResourceManager 사용 (임시 키 사용)
  return resourceManager.getOrUpdateBuffer('_legacy', w, h);
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

// 하위 호환성을 위한 전역 변수 (ToggleManager.buttons로 대체됨)
// 주의: ToggleManager 클래스가 먼저 선언되어야 함
// 초기화는 ToggleManager.init()에서 수행됨
let toggleButtons = [];

// 하위 호환성을 위한 전역 변수 (RotationController.state를 참조)
// 주의: RotationController 클래스가 먼저 선언되어야 함
// setup()에서 초기화됨
let bubbleRotationState = null;

// 윈도우 리사이즈 추적 (미세 리사이즈 무시용)
let lastWindowSize = { w: 0, h: 0 };
const MIN_RESIZE_THRESHOLD = 50; // 50px 이하 변화는 무시

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

// 성능 최적화 플래그 (태블릿 장시간 운영 시 false로 설정)
const ENABLE_HIGH_QUALITY_FX = true; // false로 설정하면 고품질 효과 비활성화

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

const RESET_INTERVAL_MS = 3 * 60 * 1000; // 3분
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
let lastVisibleImageCheck = 0;
let resetInProgress = false;

explorerRuntime.registerCleanup("graphics-buffers", () => {
  // GraphicsManager 정리
  if (graphicsManager) {
    graphicsManager.destroy();
  }
  
  // UIRenderer 정리
  if (uiRenderer) {
    uiRenderer.destroy();
  }
  
  // ResourceManager를 통해 버퍼 정리
  if (resourceManager) {
    resourceManager.removeBuffer('bg');
    resourceManager.removeBuffer('navBar');
  } else {
    // 레거시 정리
  if (bgBuffer?.remove) {
    bgBuffer.remove();
  }
  bgBuffer = null;
  if (navBarBuffer?.remove) {
    navBarBuffer.remove();
  }
  navBarBuffer = null;
  }
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

// 그라디언트 캐시 클래스 (메모리 누수 방지)
class GradientCache {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 100; // 최대 캐시 크기
  }

  // 캐시 키 생성
  _createKey(type, ...params) {
    return `${type}_${params.map(p => Math.round(p * 100) / 100).join('_')}`;
  }

  // 백글로우 그라디언트 가져오기 또는 생성
  getBackGlowGradient(x, y, r, glowRadius) {
    const key = this._createKey('backglow', x, y, r, glowRadius);
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 캐시 크기 제한
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const gradient = drawingContext.createRadialGradient(
      x, y, r * 0.4,
      x, y, glowRadius
    );
    gradient.addColorStop(0, "rgba(255,255,255,0.7)");
    gradient.addColorStop(0.5, "rgba(255, 243, 156, 0.18)");
    gradient.addColorStop(1, "rgba(255, 255, 217, 0)");
    
    this.cache.set(key, gradient);
    return gradient;
  }

  // 버블 글로스 그라디언트 가져오기 또는 생성
  getGlossGradient(x, y, r, inner) {
    const key = this._createKey('gloss', x, y, r, inner);
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const grd = drawingContext.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.1,
      x, y, r
    );
    grd.addColorStop(0, "rgba(255,255,255,0.45)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.20)");
    grd.addColorStop(1, inner);
    
    this.cache.set(key, grd);
    return grd;
  }

  // 빛 효과 그라디언트 가져오기 또는 생성 (동적 파라미터 포함)
  getLightGradient(type, lightX, lightY, lightSize, opacity, fadeFactor) {
    // 동적 파라미터는 반올림하여 캐싱 효율성 향상
    const roundedX = Math.round(lightX);
    const roundedY = Math.round(lightY);
    const roundedSize = Math.round(lightSize * 10) / 10;
    const roundedOpacity = Math.round(opacity * 100) / 100;
    const roundedFade = Math.round(fadeFactor * 100) / 100;
    
    const key = this._createKey(`light_${type}`, roundedX, roundedY, roundedSize, roundedOpacity, roundedFade);
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    let gradient;
    if (type === 'core') {
      gradient = drawingContext.createRadialGradient(
        lightX, lightY, 0,
        lightX, lightY, lightSize * 0.3
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.4 * fadeFactor})`);
      gradient.addColorStop(0.3, `rgba(255, 255, 240, ${opacity * 0.4 * 0.9 * fadeFactor})`);
      gradient.addColorStop(0.6, `rgba(255, 250, 200, ${opacity * 0.4 * 0.6 * fadeFactor})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    } else if (type === 'chromatic') {
      gradient = drawingContext.createRadialGradient(
        lightX, lightY, lightSize * 0.2,
        lightX, lightY, lightSize * 1.2
      );
      const chromaticOpacity = opacity * 0.4 * fadeFactor;
      gradient.addColorStop(0, `rgba(255, 200, 150, ${chromaticOpacity * 0.3})`);
      gradient.addColorStop(0.2, `rgba(255, 150, 200, ${chromaticOpacity * 0.4})`);
      gradient.addColorStop(0.4, `rgba(200, 150, 255, ${chromaticOpacity * 0.5})`);
      gradient.addColorStop(0.6, `rgba(150, 200, 255, ${chromaticOpacity * 0.4})`);
      gradient.addColorStop(0.8, `rgba(150, 255, 200, ${chromaticOpacity * 0.3})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    } else if (type === 'bloom') {
      gradient = drawingContext.createRadialGradient(
        lightX, lightY, lightSize * 0.5,
        lightX, lightY, lightSize * 1.5
      );
      const bloomOpacity = opacity * 0.2 * fadeFactor;
      gradient.addColorStop(0, `rgba(255, 255, 255, ${bloomOpacity})`);
      gradient.addColorStop(0.5, `rgba(255, 255, 240, ${bloomOpacity * 0.5})`);
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    }
    
    if (gradient) {
      this.cache.set(key, gradient);
    }
    return gradient;
  }

  // 캐시 초기화
  clear() {
    this.cache.clear();
  }
}

// 전역 그라디언트 캐시 인스턴스
const gradientCache = new GradientCache();

// 버블 렌더러 클래스 (렌더링 로직 통합)
class BubbleRenderer {
  // 버블 시각적 요소 그리기
  static drawVisual(bubble, x, y, r, { isMain = false, alphaOverride = null } = {}) {
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
    if (bubble.imageIndex !== null && !hasImage && bubbleImageLoader && 
        !bubbleImageLoader.isLoading(bubble.imageIndex) && !bubbleImageLoader.isLoaded(bubble.imageIndex)) {
      requestBubbleImage(bubble.imageIndex);
    }

    // 메인 버블 백글로우
    if (isMain && ENABLE_HIGH_QUALITY_FX) {
      push();
      drawingContext.save();
      drawingContext.globalAlpha = effectiveAlpha * 0.85;
      const glowRadius = r * 1.7;
      const glowGradient = gradientCache.getBackGlowGradient(x, y, r, glowRadius);
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
      const base = Bubble.generateColor(bubble.hueSeed);
      const outer = base.outer;
      const inner = base.inner;

      drawingContext.shadowBlur = 24;
      drawingContext.shadowColor = "rgba(0,0,0,0.35)";
      fill(outer);
      circle(x, y, diameter);

      if (BUBBLE_GLOSS) {
        const grd = gradientCache.getGlossGradient(x, y, r, inner);
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
  static drawCenterImage(bubble) {
    BubbleRenderer.drawVisual(bubble, bubble.pos.x, bubble.pos.y, bubble.r, {
      isMain: true,
    });
  }

  // 중앙 버블에 빛 효과 그리기 (캡과 사진 사이)
  static drawLightEffect(bubble) {
    if (!ENABLE_HIGH_QUALITY_FX) return;
    push();
    drawingContext.save();

    // 버블 중심과 반지름
    const x = bubble.pos.x;
    const y = bubble.pos.y;
    const r = bubble.r;

    // 시간에 따라 빛이 왼쪽 위에서 오른쪽 위로 이동 (0~1 사이 값)
    const time = (millis() / 3000) % 1; // 3초 주기

    // 각도 범위: 왼쪽 위(-135도)에서 오른쪽 위(-45도)로, 약 20픽셀 아래로 이동
    const offsetPixels = 20;
    const angleOffset = Math.asin(offsetPixels / r);

    const startAngle = (-Math.PI * 3) / 4 + angleOffset;
    const endAngle = -Math.PI / 4 + angleOffset;
    const angleRange = endAngle - startAngle;
    const lightAngle = startAngle + time * angleRange;

    // 빛의 위치
    const innerRadius = r * 0.7;
    const outerRadius = r * 0.95;
    const lightRadius = outerRadius - time * (outerRadius - innerRadius);
    const lightX = x + Math.cos(lightAngle) * lightRadius;
    let lightY = y + Math.sin(lightAngle) * lightRadius;

    // 사라질 때(끝 부분) 10픽셀 위로 이동
    const fadeOutDurationForY = 0.15;
    if (time > 1 - fadeOutDurationForY) {
      const fadeOutProgress = (time - (1 - fadeOutDurationForY)) / fadeOutDurationForY;
      lightY -= 10 * fadeOutProgress;
    }

    // 클리핑 마스크로 원형으로 자르기
    drawingContext.beginPath();
    drawingContext.arc(x, y, r, 0, Math.PI * 2);
    drawingContext.clip();

    // 빛의 크기 계산
    const centerAngle = -Math.PI / 2 + angleOffset;
    const angleDiff = Math.abs(lightAngle - centerAngle);
    const maxAngleDiff = Math.PI / 4;
    const sizeFactor = 1 - (angleDiff / maxAngleDiff) * 0.5;
    const baseLightSize = r * 0.6 * 1.5;
    const lightSize = baseLightSize * sizeFactor;

    // 페이드 인/아웃 효과
    const fadeInDuration = 0.15;
    const fadeOutDuration = 0.15;
    let fadeFactor = 1.0;

    if (time < fadeInDuration) {
      fadeFactor = time / fadeInDuration;
    } else if (time > 1 - fadeOutDuration) {
      fadeFactor = (1 - time) / fadeOutDuration;
    }

    // 빛 효과 그리기
    const pulse = (Math.sin(millis() / 800) + 1) / 2;
    const baseOpacity = 0.7 + pulse * 0.25;
    const lightOpacity = baseOpacity * fadeFactor;

    // 중심부 빛 그라디언트 (캐시 사용)
    const coreGradient = gradientCache.getLightGradient('core', lightX, lightY, lightSize, baseOpacity, fadeFactor);
    if (coreGradient) {
      drawingContext.fillStyle = coreGradient;
      drawingContext.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 색수차 효과 (캐시 사용)
    const chromaticGradient = gradientCache.getLightGradient('chromatic', lightX, lightY, lightSize, baseOpacity, fadeFactor);
    if (chromaticGradient) {
      drawingContext.fillStyle = chromaticGradient;
      drawingContext.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 외곽 빛 번짐 (캐시 사용)
    const bloomGradient = gradientCache.getLightGradient('bloom', lightX, lightY, lightSize, baseOpacity, fadeFactor);
    if (bloomGradient) {
      drawingContext.fillStyle = bloomGradient;
      drawingContext.fillRect(x - r, y - r, r * 2, r * 2);
    }

    drawingContext.restore();
    pop();
  }

  // 중앙 버블 캡 그리기
  static drawCenterCap(bubble) {
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

  // 버블 정보 가져오기 (private)
  static _getBubbleInfo(bubble) {
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

  // 버블 정보 표시 통합 함수
  static drawInfoAt(bubble, x, y, alpha = 1.0, options = {}) {
    const { name, visualTags, emotionalTags } = BubbleRenderer._getBubbleInfo(bubble);
    if (!name) return;

    const comp = new BubbleInfoComponent(name, visualTags, emotionalTags);
    comp.draw(x, y, alpha, options.titleSize ?? 18, options.tagSize ?? 14);
  }

  // 센터 버블 정보 표시
  static drawCenterInfo(bubble) {
    if (!bubble) return;
    const infoY = bubble.pos.y + bubble.r + 40;
    BubbleRenderer.drawInfoAt(bubble, bubble.pos.x, infoY, 1.0, { titleSize: 18, tagSize: 14 });
  }

  // 오빗 버블 정보 표시
  static drawOrbitInfo(bubble, bubbleX, bubbleY, bubbleRadius = null, orbitInfoAlpha = 1.0) {
    if (orbitInfoAlpha < 0.01) return;

    const r = bubbleRadius !== null ? bubbleRadius : (bubble.r || 50);
    const infoY = bubbleY + r + 30;
    BubbleRenderer.drawInfoAt(bubble, bubbleX, infoY, orbitInfoAlpha, { titleSize: 16, tagSize: 13 });
  }
}
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
    // 제목 (1.2배 크기, PretendardVariable 엑스트라 볼드)
    fill(255, 255, 255, 230 * alpha);
    const titleFontSize = titleSize * 1.2;
    
    // withTextRendering에서 textFont()를 호출하므로, text() 호출 직전에 drawingContext.font를 재설정
    // PretendardVariable 폰트의 엑스트라 볼드 적용 (font-weight: 800)
    drawingContext.font = `700 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
    // p5.js의 text() 함수가 내부적으로 폰트를 재설정할 수 있으므로, 
    // 실제 텍스트 렌더링을 위해 fillText를 직접 사용
    drawingContext.fillStyle = `rgba(255, 255, 255, ${230 * alpha / 255})`;
    drawingContext.fillText(this.name, x, y);
    
    // 태그 표시 (visual/emotional 구분 없이 합쳐서 3개만, 흰색, 1.3배 크기)
    const allTags = [...this.visualTags, ...this.emotionalTags];
    const displayTags = allTags.slice(0, 3);
    
    if (displayTags.length > 0) {
      fill(255, 255, 255, 180 * alpha);
      const tagFontSize = tagSize * 1.3;
      // 태그는 일반 굵기 (400)
      drawingContext.font = `400 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
      drawingContext.fillStyle = `rgba(255, 255, 255, ${180 * alpha / 255})`;
      const tagText = displayTags.map(tag => `#${tag}`).join("  ");
      drawingContext.fillText(tagText, x, y + 35);
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
    this._drawBackground(isSelected);
    
    // 텍스트 렌더링
    this._drawText(isSelected);
  }
  
  _drawBackground(isSelected) {
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
    }
    
  _drawText(isSelected) {
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
    
    // 그림자 효과 초기화
    drawingContext.shadowBlur = 0;
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

  // 토글 선택 (전체보기 또는 카테고리)
  selectToggle(toggleIndex) {
    if (!bubbleManager || !panController) return;

    // toggleIndex: 0 = 전체 보기, 1~5 = 각 카테고리
    if (toggleIndex === 0) {
      // 전체 보기 선택
      this.previousSelectedToggles = [...this.selectedToggles];
      this.selectedToggles = [];
      this.backToMainView();

      // 버블 레이아웃 초기화 (BubbleManager에 위임)
      bubbleManager.resetLayout();

      // 원래 그리드의 중심으로 정렬
      const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
      const centerGridX = Math.floor(gridSize / 2);
      const centerGridY = Math.floor(gridSize / 2);
      const centerHexX = centerGridX * HEX_SPACING * 1.5;
      const centerHexY =
        centerGridY * HEX_SPACING * sqrt(3) +
        ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;

      const { centerX, centerY } = LayoutManager.getBubbleAreaCenter(-20);

      panController.snapTargetX = centerX - centerHexX;
      panController.snapTargetY = centerY - centerHexY;
      panController.snapCompleted = false;
    } else {
      // 카테고리 선택 (1~5)
      const categoryIndex = toggleIndex;

      // 같은 카테고리를 다시 클릭하면 선택 해제 (전체보기로 돌아가기)
      if (this.selectedGroup === categoryIndex && !this.selectedTag) {
        this.selectToggle(0);
        return;
      }

      // 중간 단계 화면으로 이동
      this.showGroupSelection(categoryIndex);
      // 주의: return 이후의 죽은 코드는 모두 삭제됨
    }

    // 토글 닫기
    this.showToggles = false;
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
        
        // 이미지가 이미 로드되어 있으면 alpha를 조정 (번쩍임 방지)
        if (imageIndex !== null && bubbleImages[imageIndex] && bubbleImages[imageIndex].width > 0) {
          bubble.alpha = 0.3; // 페이드인 시작 (0.01 -> 0.3으로 변경하여 더 부드럽게)
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
        b.stopPop();
      }
    });
  }

  // 화면 내 버블 확인 및 이미지 로딩 요청
  checkAndLoadVisibleImages(loader, imageFiles) {
    if (!this.bubbles) return;
    const now = millis();
    if (now - lastVisibleImageCheck < IMAGE_CHECK_INTERVAL) return;
    lastVisibleImageCheck = now;
    const LOAD_MARGIN = 200;
    this.bubbles.forEach((b) => {
      // 이미지 인덱스가 없으면 스킵
      if (b.imageIndex === null || b.imageIndex === undefined) return;
      // 이미 로딩 중이거나 완료된 이미지는 스킵
      if (!loader || loader.isLoading(b.imageIndex) || loader.isLoaded(b.imageIndex)) return;
      
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

  // 가시 영역 버블 가져오기 (메모리 할당 최소화)
  getVisibleBubbles(centerX, centerY, excludeBubble = null) {
    if (!this.bubbles) return [];
    
    const { bottom: SEARCH_BOTTOM } = LayoutManager.getSearchMetrics();
    const MARGIN = 50;
    
    // 임시 객체 생성 최소화: Bubble 클래스에 distToCenter 속성 추가
    const visible = [];
    
    for (const b of this.bubbles) {
      if (b.alpha < 0.01) continue;
      if (b === excludeBubble) continue;
      
      const effectiveR = b.currentRadius();
      const isOnScreen = 
        b.pos.x + effectiveR > -MARGIN && 
        b.pos.x - effectiveR < width + MARGIN &&
        b.pos.y + effectiveR > -MARGIN && 
        b.pos.y - effectiveR < height + MARGIN;
      
      if (!isOnScreen) continue;
      
      const bubbleTop = b.pos.y - effectiveR;
      const bubbleBottom = b.pos.y + effectiveR;
      const isInAllowedArea = 
        bubbleTop >= SEARCH_BOTTOM - MARGIN && 
        bubbleBottom <= height - 10 + MARGIN;
      
      if (!isInAllowedArea) continue;
      
      // distToCenter를 버블 객체에 직접 저장 (임시 객체 생성 방지)
      const dx = b.pos.x - centerX;
      const dy = b.pos.y - centerY;
      b._distToCenterSq = dx * dx + dy * dy;
      visible.push(b);
    }
    
    // 반지름 기준 정렬 (큰 버블부터)
    visible.sort((a, b) => b.r - a.r);
    
    // 상위 MAX_DRAW개만 반환
    return visible.slice(0, MAX_DRAW);
  }

  // 버블 재생성 및 초기 오프셋 설정
  rebuild() {
    this.build();

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

  // 레이아웃 초기화 (전체보기로 복원)
  resetLayout() {
    if (!this.bubbles || this.bubbles.length === 0) return;

    const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
    
    // 모든 버블을 원래 그리드 위치로 복원
    this.bubbles.forEach((b, index) => {
      // 팡 터짐 상태 초기화
      if (b.isPopping || b.alpha < 0.5) {
        b.isPopping = false;
        b.popProgress = 0;
        b.alpha = 1.0;
      }
      
      // 원래 그리드 위치로 복원
      b.gridX = index % gridSize;
      b.gridY = Math.floor(index / gridSize);
    });

    // 필터링된 버블 목록을 전체 버블로 복원
    this.currentFilteredBubbles = this.bubbles;
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

    // 크기 팩터 계산
    let sizeFactor = this._calculateSizeFactor(displayX, displayY, normalizedDist, screenCenterX, screenCenterY, screenX, screenY, centerBubblePos);

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
      // 태블릿에서 알파 전환을 더 부드럽게 (깜빡임 방지)
      const baseEase = targetAlpha > this.alpha ? 0.18 : 0.08;
      const alphaEase = IS_MOBILE ? baseEase * 0.7 : baseEase; // 태블릿은 30% 느리게
      this.alpha = lerp(this.alpha, targetAlpha, alphaEase);
    } else if (this._isFiltered && !this.isPopping) {
      // 필터링된 버블은 항상 alpha를 1.0으로 유지 (페이드아웃 로직 건너뛰기)
      this.alpha = 1.0;
    }
  }

  _calculateSizeFactor(displayX, displayY, normalizedDist, screenCenterX, screenCenterY, screenX, screenY, centerBubblePos) {
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

    return sizeFactor;
  }

  // 팡 애니메이션 메서드 (캡슐화)
  startPop(now) {
    this.isPopping = true;
    this.popStartTime = now;
    this.popProgress = 0;
  }

  stopPop() {
    this.isPopping = false;
    this.popProgress = 0;
    this.alpha = 1.0;
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

  static generateColor(seed) {
  const h = (seed * 137.5) % 360;
  return {
    outer: `hsl(${h} 70% 55% / 0.95)`,
    inner: `hsl(${(h + 20) % 360} 80% 35% / 0.75)`,
  };
  }
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

  request(index, imageFiles, onLoaded = null, onError = null) {
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
    this.processQueue(imageFiles, onLoaded, onError);
  }

  processQueue(imageFiles, onLoaded = null, onError = null) {
  while (
      this.activeLoads < this.maxConcurrent &&
      this.queue.length > 0
  ) {
      const nextIndex = this.queue.shift();
    if (nextIndex === undefined) continue;
      this.queueSet.delete(nextIndex);
      this.startLoad(nextIndex, imageFiles, onLoaded, onError);
    }
  }

  startLoad(imageIndex, imageFiles, onLoaded = null, onError = null) {
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
      this.processQueue(imageFiles, onLoaded, onError);
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
        this.processQueue(imageFiles, onLoaded, onError);
      },
      (e) => {
        // 로드 실패
        this.loading.delete(imageIndex);
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        if (onError) onError(imageIndex, e);
        this.processQueue(imageFiles, onLoaded, onError);
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
  bubbleImageLoader.request(
    imageIndex, 
    imageFiles, 
    (idx, img) => {
    // 이미지 로드 완료 후 해당 이미지를 사용하는 버블들을 부드럽게 페이드인 (번쩍임 방지)
    if (bubbleManager && bubbleManager.bubbles) {
      bubbleManager.bubbles.forEach((b) => {
        if (b.imageIndex === idx) {
          // 알파가 너무 낮으면 부드럽게 시작 (번쩍임 방지)
          if (b.alpha < 0.01) {
            b.alpha = 0.3; // 0.01 -> 0.3으로 변경하여 더 부드럽게 시작
          } else if (b.alpha < 0.5) {
            // 이미 어느 정도 보이면 더 부드럽게 증가
            b.alpha = Math.max(b.alpha, 0.3);
          }
        }
      });
      }
      // bubbleImages 배열에도 저장 (하위 호환성)
      if (bubbleImages) {
        bubbleImages[idx] = img;
      }
    },
    (idx, e) => {
      // 로드 실패 처리
      logError(
        `[Explorer] bubbleImage[${idx}] (${imageFiles[idx]}) 로딩 실패:`,
        e
      );
      // bubbleImages 배열에 null 저장 (하위 호환성)
      if (bubbleImages) {
        bubbleImages[idx] = null;
      }
      // 이 이미지를 쓰던 버블들은 색 버블로 전환
      if (bubbleManager && bubbleManager.bubbles) {
        bubbleManager.bubbles.forEach((b) => {
          if (b.imageIndex === idx) {
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

function processImageQueue() {
  if (!bubbleImageLoader) return;
  bubbleImageLoader.processQueue(imageFiles);
}

function queueVisibleBubbleImages() {
  if (!bubbleManager || !bubbleImageLoader) return;
  bubbleManager.checkAndLoadVisibleImages(bubbleImageLoader, imageFiles);
}

function _checkFilterCache(state) {
  const signature = [
    state.bubbleManagerVersion ?? 0,
    state.selectedTag ?? "__NONE__",
    state.selectedGroup ?? "__NONE__",
    state.selectedToggles.length > 0 ? state.selectedToggles.join(",") : "__ALL__",
  ].join("|");

  if (signature === filterCacheSignature) {
    return filterCacheResult;
  }
  return null;
}

function ensureFilteredBubblesState() {
  const bubbles = bubbleManager?.bubbles ?? [];
  const selectedTag = uiStateManager?.selectedTag ?? null;
  const selectedGroup = uiStateManager?.selectedGroup ?? null;
  const selectedToggles = uiStateManager?.selectedToggles ?? [];
  const previousSelectedToggles = uiStateManager?.previousSelectedToggles ?? [];
  const showGroupView = uiStateManager?.showGroupView ?? false;

  const state = {
    bubbleManagerVersion: bubbleManager?.version ?? 0,
    selectedTag,
    selectedGroup,
    selectedToggles,
    previousSelectedToggles,
    showGroupView,
  };

  const cached = _checkFilterCache(state);
  if (cached !== null) {
    return cached;
  }

  const filterResult = _calculateFilteredBubbles(bubbles, state);
  _applyFilterEffects(bubbleManager, filterResult, bubbles, state);

  const signature = [
    state.bubbleManagerVersion ?? 0,
    state.selectedTag ?? "__NONE__",
    state.selectedGroup ?? "__NONE__",
    state.selectedToggles.length > 0 ? state.selectedToggles.join(",") : "__ALL__",
  ].join("|");

  filterCacheSignature = signature;
  filterCacheResult = filterResult;

    return filterCacheResult;
  }

function _calculateFilteredBubbles(bubbles, state) {
  const { selectedTag, selectedGroup, selectedToggles, previousSelectedToggles } = state;

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
    hasTagFilter = true;
  } else if (selectedToggles.length > 0) {
    filteredBubbles = bubbles.filter((b) => {
      return (
        b.attributes &&
        b.attributes.some((attr) => selectedToggles.includes(attr))
      );
    });
  }

  return {
    filteredBubbles,
    hasTagFilter,
    selectedTag,
    selectedGroup,
  };
}

function _applyFilterEffects(manager, filterResult, bubbles, state) {
  if (!manager) return;

  const { filteredBubbles, hasTagFilter, selectedTag } = filterResult;
  const { selectedToggles, previousSelectedToggles, showGroupView } = state;

  manager.currentFilteredBubbles = filteredBubbles;

  if (selectedTag) {
    if (!showGroupView) {
      manager.startPoppingBubbles(bubbles, filteredBubbles);
    }
  } else if (selectedToggles.length > 0) {
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
    manager.startPoppingBubbles(bubbles, filteredBubbles, commonBubbles);
  } else {
    manager.stopAllPopping(bubbles);
  }
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


// 월드 메트릭스 재계산 (윈도우 리사이즈 시)
function rebuildWorldMetrics() {
  // 35개 버블을 위한 그리드 크기 계산 (대략 6x6 그리드)
  const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
  WORLD_W = gridSize * HEX_SPACING * 1.5;
  WORLD_H = gridSize * HEX_SPACING * sqrt(3);
}

// 배경 버퍼 재생성 (깜빡임 방지)
function _calculateCoverDimensions(imgW, imgH, screenW, screenH) {
  const imgRatio = imgW / imgH;
  const screenRatio = screenW / screenH;

  let w, h, x, y;

  // 화면을 완전히 꽉 채우도록 cover 방식 적용 (비율 유지, 확대하여 화면 채움)
  if (imgRatio > screenRatio) {
    // 이미지가 더 넓음 → 높이에 맞춰 확대 (좌우가 잘림)
    h = screenH;
    w = imgRatio * h;
    x = (screenW - w) / 2; // 중앙 정렬
    y = 0;
  } else {
    // 이미지가 더 높음 → 너비에 맞춰 확대 (상하가 잘림)
    w = screenW;
    h = w / imgRatio;
    x = 0;
    y = (screenH - h) / 2; // 중앙 정렬
  }

  return { x, y, w, h };
}

function redrawBackgroundBuffer() {
  // 배경 버퍼가 없거나 크기가 변경되었을 때만 재생성
  if (!bgBuffer || bgBuffer.width !== width || bgBuffer.height !== height) {
    bgBuffer = recreateGraphicsBuffer(bgBuffer, width, height);
    // 재생성 시 즉시 배경색으로 채우기 (깜빡임 방지)
    bgBuffer.background(BG_COLOR);
  }
  
  // 배경 이미지가 로드되었는지 확인
  if (
    bgImage &&
    typeof bgImage.width !== "undefined" &&
    typeof bgImage.height !== "undefined" &&
    bgImage.width > 0 &&
    bgImage.height > 0 &&
    !isNaN(bgImage.width) &&
    !isNaN(bgImage.height)
  ) {
    const { x, y, w, h } = _calculateCoverDimensions(bgImage.width, bgImage.height, width, height);

    // 넘치는 부분을 잘라내기 위해 클리핑 먼저 적용
    bgBuffer.drawingContext.save();
    bgBuffer.drawingContext.beginPath();
    bgBuffer.drawingContext.rect(0, 0, width, height);
    bgBuffer.drawingContext.clip();

    // 화면 전체를 채우도록 이미지 확대하여 그리기
    bgBuffer.imageMode(CORNER);
    bgBuffer.image(bgImage, x, y, w, h);

    bgBuffer.drawingContext.restore();
  } else {
    // 이미지가 없으면 배경색으로 채우기 (깜빡임 방지)
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

// 전역 함수 래퍼 (하위 호환성 유지)
function drawBubbleVisual(bubble, x, y, r, options = {}) {
  BubbleRenderer.drawVisual(bubble, x, y, r, options);
}

// 중앙 버블 이미지/색상만 그리기 (캡 없이)
function drawCenterBubbleImage(bubble) {
  BubbleRenderer.drawCenterImage(bubble);
}

// 중앙 버블에 빛 효과 그리기 (캡과 사진 사이)
function drawBubbleLightEffect(bubble) {
  BubbleRenderer.drawLightEffect(bubble);
}

// 중앙 버블 캡 그리기
function drawCenterBubbleCap(bubble) {
  BubbleRenderer.drawCenterCap(bubble);
}

// 버블 정보 가져오기 헬퍼 함수
function getBubbleInfo(bubble) {
  return BubbleRenderer._getBubbleInfo(bubble);
}

// 버블 정보 표시 통합 함수 (센터/오빗 공통)
function drawBubbleInfoAt(bubble, x, y, alpha = 1.0, options = {}) {
  BubbleRenderer.drawInfoAt(bubble, x, y, alpha, options);
}

// 센터 버블 정보 표시
function drawCenterBubbleInfo(bubble) {
  BubbleRenderer.drawCenterInfo(bubble);
}

// 오빗 버블 정보 표시
function drawOrbitBubbleInfo(bubble, bubbleX, bubbleY, bubbleRadius = null) {
  BubbleRenderer.drawOrbitInfo(bubble, bubbleX, bubbleY, bubbleRadius, orbitInfoAlpha);
}

// 버블 데이터 관리자 클래스
class BubbleDataManager {
  // 집단별 언어 데이터 (정적 프로퍼티)
  static groupLanguages = {
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
      "핑크-옐로우",
      "젤리 텍스처",
      "따뜻한 난색 ",
      "부드러운 곡면",
      "글로시한 윤기",
    ],
    emotional: ["활력", "사랑스러움", "자기표현", "로맨틱", "설렘"],
  },
  3: {
    // 50대 남성 (50s)
    visual: [
      "고명도 대비",
      "안정된 구형",
      "시원한 색",
      "투명한 반사광",
      "균형적 분포",
    ],
    emotional: ["보호", "책임감", "신뢰", "안정", "성취"],
  },
  4: {
    // 주부 (housewife)
    visual: [
      "소프트 톤",
      "파스텔 옐로",
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
      "K-pop 팔레트",
    ],
    emotional: [
      "흥미",
      "자기취향 강도",
      "아이코닉함",
      "통통 귀여움",
      "즉각적 몰입",
    ],
  },
};

  // 버블 데이터에 언어를 자동 할당하는 정적 메서드
  static assignLanguages(bubbleData) {
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
        const lang = BubbleDataManager.groupLanguages[attr];
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
}

// 하위 호환성을 위한 전역 변수 및 함수 (래퍼)
const groupLanguages = BubbleDataManager.groupLanguages;
function assignLanguagesToBubbles() {
  BubbleDataManager.assignLanguages(bubbleData);
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

// 공용 버블 데이터 JSON 비동기 로드 함수 (하위 호환성 래퍼)
async function loadBubbleDataFromJSON() {
  if (resourceManager) {
    return await resourceManager.loadBubbleData();
  }
  // 레거시 동작 (ResourceManager가 없을 때)
  logError("[Explorer] ResourceManager가 초기화되지 않았습니다");
  return false;
}

// 생명주기 관리자 클래스
class LifecycleManager {
  // 디바이스 설정 클래스
  static DeviceConfig = {
    // 태블릿/모바일 감지
    isMobileOrTablet() {
      const ua = navigator.userAgent.toLowerCase();
      const isMobile =
        /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
      const isTabletUA =
        /ipad|tablet/.test(ua) ||
        (/macintosh/.test(ua) && navigator.maxTouchPoints > 0);
      const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isWindowsDesktop = /windows nt/i.test(ua);

      return isMobile || isTabletUA || (isTouchDevice && !isWindowsDesktop);
    },

    // 디바이스별 설정 적용
    applyDeviceSettings(isMobile) {
      if (isMobile) {
        pixelDensity(1.25); // 화질 개선: 1 -> 1.25로 증가 (성능과 화질 균형)
        frameRate(30); // 부드러운 렌더링 유지
        MAX_DRAW = 30; // 화질 개선: 20 -> 30으로 증가 (더 많은 버블 렌더링)
        MAX_BUBBLE_RADIUS = 80; // 화질 개선: 70 -> 80으로 증가
        ANIMATION_CONFIG.enableBreathAnim = false;
        ANIMATION_CONFIG.lightEffectInterval = 4;
        ANIMATION_CONFIG.enableLightEffect = false;
        ANIMATION_CONFIG.enableMicGlow = false;
        ANIMATION_CONFIG.enableCenterPulse = false;
        ANIMATION_CONFIG.allowIdlePause = true;
        MAX_CONCURRENT_IMAGE_LOADS = 3; // 메모리 안정성: 4 -> 3으로 감소
        return 8; // 메모리 안정성: 10 -> 8로 감소
    } else {
        pixelDensity(1.5);
        frameRate(30);
        MAX_DRAW = 80;
        MAX_BUBBLE_RADIUS = 120;
        ANIMATION_CONFIG.enableBreathAnim = true;
        ANIMATION_CONFIG.lightEffectInterval = 1;
        ANIMATION_CONFIG.enableLightEffect = false;
        ANIMATION_CONFIG.enableMicGlow = false;
        ANIMATION_CONFIG.enableCenterPulse = true;
        ANIMATION_CONFIG.allowIdlePause = true;
        MAX_CONCURRENT_IMAGE_LOADS = 6;
        return MAX_IMAGE_QUEUE_LENGTH; // queueSize
      }
    }
  };

  // 소프트 리셋 (불필요한 재생성 방지)
  static softReset() {
    if (resetInProgress) return;
    resetInProgress = true;

    // 배경 버퍼 재생성 (깜빡임 방지)
    if (bgBuffer && resourceManager) {
      bgBuffer = resourceManager.getOrUpdateBuffer('bg', width, height);
      redrawBackgroundBuffer();
    } else if (bgBuffer) {
      redrawBackgroundBuffer();
    }

    // 애니메이션 상태 초기화
    if (panController) {
      panController.panVelocityX = 0;
      panController.panVelocityY = 0;
      panController.snapTargetX = null;
      panController.snapTargetY = null;
      panController.snapCompleted = true;
    }

    RotationController.state.angularVelocity = 0;

    // 버블 매니저는 데이터가 같다면 재생성하지 않고 위치만 초기화
      if (bubbleManager) {
      // 버전 체크로 불필요한 재생성 방지
      const currentVersion = bubbleManager.version;
        bubbleManager.build();
      // 버전이 같다면 위치만 초기화하는 로직 추가 가능
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

  // 메모리 정리 (태블릿 최적화, 멈춤 방지)
  static gc() {
    // 그라디언트 캐시 정리
    if (gradientCache) {
      gradientCache.clear();
    }

    // 입력 관리자 정리
    if (inputManager) {
      inputManager.cleanupStalePointers();
    }

    // 성능 메모리 API 사용 (크롬/안드로이드)
    if (performance.memory) {
      const usedMB = performance.memory.usedJSHeapSize / 1048576;
      const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
      const usagePercent = (usedMB / limitMB) * 100;

      // 메모리 사용률이 75% 이상이면 경고 (더 빠른 대응)
      if (usagePercent > 75) {
        logWarn(`[LifecycleManager] 메모리 사용률 높음: ${usagePercent.toFixed(1)}%`);
        // 그라디언트 캐시 강제 정리
        if (gradientCache) {
          gradientCache.clear();
        }
        // 필요시 softReset 호출 (85%로 낮춤)
        if (usagePercent > 85) {
          logWarn(`[LifecycleManager] 메모리 위험 수준, 소프트 리셋 실행`);
          LifecycleManager.softReset();
        }
      }
    }
    
    // 명시적 GC 호출 (가능한 경우, 태블릿 안정성 향상)
    if (typeof window !== 'undefined' && window.gc && typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {
        // GC 호출 실패는 무시
      }
    }
  }
}

// 하위 호환성을 위한 함수 래퍼
function isMobileOrTablet() {
  return LifecycleManager.DeviceConfig.isMobileOrTablet();
}

function softReset() {
  LifecycleManager.softReset();
}

function setup() {
  // 클래스 인스턴스 초기화
  animationController = new AnimationController();
  panController = new PanController();
  uiStateManager = new UIStateManager();
  bubbleManager = new BubbleManager();
  resourceManager = new ResourceManager();
  inputManager = new InputManager();
  graphicsManager = new GraphicsManager();
  uiRenderer = new UIRenderer();
  
  // 하위 호환성을 위한 전역 변수 초기화
  bubbleRotationState = RotationController.state;
  toggleButtons = ToggleManager.buttons;

  // 태블릿/모바일 최적화
  IS_MOBILE = LifecycleManager.DeviceConfig.isMobileOrTablet();
  const isMobile = IS_MOBILE;
  const queueSize = LifecycleManager.DeviceConfig.applyDeviceSettings(isMobile);
  
  // ImageLoader 초기화
  bubbleImageLoader = new ImageLoader(
    "../public/assets/bubble-imgs/",
    MAX_CONCURRENT_IMAGE_LOADS,
    queueSize
  );
  // bubbleImages를 ImageLoader의 images로 참조 (하위 호환성)
  bubbleImages = bubbleImageLoader.images;

  // 지연 로딩 자산 로드 시작
  loadDeferredAssets();
  
  // 태블릿/모바일 최적화: 깜빡임 방지를 위한 설정
  const canvas = createCanvas(windowWidth, windowHeight);
  canvasElement = canvas?.elt ?? null;
  explorerRuntime.setP5Instance(canvas?.pInst ?? null);
  
  // 태블릿에서 깜빡임 방지: 배경을 먼저 설정
  background(BG_COLOR);
  
  // 캔버스 렌더링 최적화 (태블릿 안정성 향상, 깜빡임 방지)
  if (canvas && canvas.elt) {
    const canvasElement = canvas.elt;
    // 하드웨어 가속 활성화 (태블릿 성능 향상)
    canvasElement.style.willChange = 'contents';
    // CSS 최적화: 깜빡임 방지
    canvasElement.style.imageRendering = 'auto';
    canvasElement.style.backfaceVisibility = 'hidden';
    canvasElement.style.transform = 'translateZ(0)'; // GPU 가속 강제
    // 렌더링 최적화 힌트
    if (canvasElement.getContext) {
      const ctx = canvasElement.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high'; // 화질 개선: 모든 디바이스에서 high 품질 사용
      }
    }
  }

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
  
  // LayoutManager 메트릭 초기 계산
  LayoutManager.calculateMetrics();
  
  // 초기 배경 버퍼 생성 (ResourceManager 사용, 깜빡임 방지)
  bgBuffer = resourceManager.getOrUpdateBuffer('bg', width, height);
  bgBuffer.background(BG_COLOR);
  
  // 배경 이미지가 이미 로드되어 있으면 즉시 그리기
  if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
    redrawBackgroundBuffer();
    if (graphicsManager) {
      graphicsManager._bgImageDrawn = true;
    }
  }
  
  // 🔧 태블릿은 무거운 작업을 살짝 뒤로 미뤄서 첫 화면이 먼저 뜨도록
  if (isMobile) {
    setTimeout(() => {
      resourceManager.loadBubbleData().then((success) => {
        if (success && bubbleManager) {
          bubbleManager.build();
          // 초기 오프셋 설정
          const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
          const centerGridX = Math.floor(gridSize / 2);
          const centerGridY = Math.floor(gridSize / 2);
          const centerHexX = centerGridX * HEX_SPACING * 1.5;
          const centerHexY = centerGridY * HEX_SPACING * sqrt(3) + ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;
          if (panController) {
            panController.offsetX = width * CENTER_X_RATIO - centerHexX;
            panController.offsetY = height * CENTER_Y_RATIO - centerHexY;
            panController.snapCompleted = false;
          }
          const firstLoadCount = IS_MOBILE ? 10 : 12;
          preloadInitialImages(firstLoadCount);
        }
      });
    }, 100);
  } else {
    resourceManager.loadBubbleData().then((success) => {
      if (success && bubbleManager) {
        bubbleManager.build();
        const gridSize = Math.ceil(Math.sqrt(TOTAL_BUBBLES));
        const centerGridX = Math.floor(gridSize / 2);
        const centerGridY = Math.floor(gridSize / 2);
        const centerHexX = centerGridX * HEX_SPACING * 1.5;
        const centerHexY = centerGridY * HEX_SPACING * sqrt(3) + ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;
        if (panController) {
          panController.offsetX = width * CENTER_X_RATIO - centerHexX;
          panController.offsetY = height * CENTER_Y_RATIO - centerHexY;
          panController.snapCompleted = false;
        }
        const firstLoadCount = IS_MOBILE ? 10 : 12;
        preloadInitialImages(firstLoadCount);
      }
    });
  }

  // 자산 로딩 확인 및 에러 체크 (ResourceManager 사용)
  resourceManager.checkAsset(mikeIcon, "mikeIcon");
  resourceManager.checkAsset(captureButton, "captureButton");
  resourceManager.checkAsset(workroomButton, "workroomButton");
  resourceManager.checkAsset(navigationBar, "navigationBar");
  resourceManager.checkAsset(bubbleCap, "bubbleCap");
  resourceManager.checkAsset(pretendardFont, "pretendardFont");
  // 배경 이미지 로드 완료 시 배경 버퍼 업데이트 (깜빡임 방지)
  resourceManager.checkAsset(bgImage, "bgImage", () => {
    redrawBackgroundBuffer();
    if (graphicsManager) {
      graphicsManager._bgImageDrawn = true;
    }
  });

  // 집단 이미지 로드 확인
  for (let i = 1; i <= 5; i++) {
    const img = groupImages[i];
    if (!img || (img.width !== undefined && img.width === 0)) {
      logError(`집단 이미지[${i}] 로딩 실패`);
    } else {
      log(`집단 이미지[${i}] 로드 성공: width=${img.width}, height=${img.height}`);
    }
  }

  // 네비게이션 바 고해상도 버퍼 생성 (ResourceManager 사용)
  if (navigationBar) {
    const responsiveScale = getResponsiveScale();
    const NAV_W = navigationBar.width * 0.455 * responsiveScale;
    const NAV_H = navigationBar.height * 0.455 * responsiveScale;
    const scaleFactor = 2;
    navBarBuffer = resourceManager.getOrUpdateBuffer('navBar', NAV_W * scaleFactor, NAV_H * scaleFactor);
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

  // 포인터 이벤트 설정 (InputManager 사용)
  if (inputManager && canvasElement) {
    inputManager.init(canvasElement);
  } else {
    setupPointerBridges(); // 레거시 fallback
  }
  
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
        LifecycleManager.softReset();
        // 메모리 정리
        LifecycleManager.gc();
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

// 입력 관리자 클래스 (이벤트 리스너 누수 방지)
class InputManager {
  constructor() {
    this.handlers = {
      down: null,
      move: null,
      up: null,
      cancel: null
    };
    this.activePointers = new Map(); // 활성 포인터 추적 (pointerId -> {x, y})
    this.canvasElement = null;
  }

  // 초기화
  init(canvasElement) {
    this.canvasElement = canvasElement;
    this.destroy(); // 기존 리스너 제거 (중복 방지)
    this.activePointers.clear();

    // 포인터 다운 이벤트
    this.handlers.down = (e) => {
      const canvas = this.canvasElement;
      if (!canvas || !canvas.contains(e.target)) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.activePointers.set(e.pointerId, { x, y });

      const handled = handlePointerDown(x, y, e.pointerId);

      if (e.pointerType !== "mouse" && handled) {
        e.preventDefault();
      }
    };
    window.addEventListener("pointerdown", this.handlers.down, { passive: false });

    // 포인터 이동 이벤트
    this.handlers.move = (e) => {
      if (!this.activePointers.has(e.pointerId)) return;

      const canvas = this.canvasElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.activePointers.set(e.pointerId, { x, y });

      handlePointerMove(x, y, e.pointerId);

      if (panController && panController.isDragging && e.pointerType !== "mouse") {
        e.preventDefault();
      }
    };
    window.addEventListener("pointermove", this.handlers.move, { passive: false });

    // 포인터 업 이벤트
    this.handlers.up = (e) => {
      if (!this.activePointers.has(e.pointerId)) return;

      const canvas = this.canvasElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      handlePointerUp(x, y, e.pointerId);
      this.activePointers.delete(e.pointerId);

      if (e.pointerType !== "mouse") {
        e.preventDefault();
      }
    };
    window.addEventListener("pointerup", this.handlers.up, { passive: false });

    // 포인터 취소 이벤트 (태블릿 안전장치)
    this.handlers.cancel = (e) => {
      if (!this.activePointers.has(e.pointerId)) return;

      const canvas = this.canvasElement;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      handlePointerUp(x, y, e.pointerId);
      this.activePointers.delete(e.pointerId);

      if (e.pointerType !== "mouse") {
        e.preventDefault();
      }
    };
    window.addEventListener("pointercancel", this.handlers.cancel, { passive: false });
  }

  // 정리 (메모리 누수 방지 핵심)
  destroy() {
    if (this.handlers.down) {
      window.removeEventListener("pointerdown", this.handlers.down);
    }
    if (this.handlers.move) {
      window.removeEventListener("pointermove", this.handlers.move);
    }
    if (this.handlers.up) {
      window.removeEventListener("pointerup", this.handlers.up);
    }
    if (this.handlers.cancel) {
      window.removeEventListener("pointercancel", this.handlers.cancel);
    }

    this.handlers = {
      down: null,
      move: null,
      up: null,
      cancel: null
    };
    this.activePointers.clear();
  }

  // 비정상적으로 많은 포인터가 남아있을 때 강제 정리 (태블릿 안전장치)
  cleanupStalePointers() {
    if (this.activePointers.size > 10) {
      this.activePointers.clear();
    }
  }
}

// 전역 입력 관리자 인스턴스
let inputManager = null;

// 하위 호환성을 위한 전역 변수 및 함수
let pointerEventHandlers = {
  down: null,
  move: null,
  up: null,
  cancel: null
};
let activePointers = new Map();
let lastMemoryCleanup = 0;
const MEMORY_CLEANUP_INTERVAL = 30000;
let isPageVisible = true;

// 하위 호환성을 위한 함수 래퍼
function setupPointerBridges() {
  if (inputManager && canvasElement) {
    inputManager.init(canvasElement);
  } else {
    // 레거시 동작 (InputManager가 없을 때)
  if (pointerEventHandlers.down) {
    window.removeEventListener("pointerdown", pointerEventHandlers.down);
    window.removeEventListener("pointermove", pointerEventHandlers.move);
    window.removeEventListener("pointerup", pointerEventHandlers.up);
    window.removeEventListener("pointercancel", pointerEventHandlers.cancel);
  }
  
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

    // 레거시 cleanup 등록
  explorerRuntime.registerCleanup("pointer-events", () => {
      if (inputManager) {
        inputManager.destroy();
      } else {
        // 레거시 정리
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
      }
  });
  }
}


function softReset() {
  if (resetInProgress) return;
  resetInProgress = true;
  // clear() 제거: 배경 버퍼를 재사용하여 깜빡임 방지
  // 배경 버퍼가 있으면 재생성, 없으면 기본 배경 설정
  if (bgBuffer) {
    redrawBackgroundBuffer();
  }
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

// 상태 업데이트 함수 (데이터 변경만 수행)
function updateState() {
  const now = millis();

  // 리셋 체크 (태블릿 안정성 향상: 2분마다)
  const resetInterval = IS_MOBILE ? 2 * 60 * 1000 : RESET_INTERVAL_MS; // 태블릿은 2분
  if (!resetInProgress && now - lastResetTime > resetInterval) {
    LifecycleManager.softReset();
    lastResetTime = now;
  }

  // 주기적 메모리 정리 (태블릿 안정성 향상: 20초마다)
  const memoryCleanupInterval = IS_MOBILE ? 20000 : MEMORY_CLEANUP_INTERVAL; // 태블릿은 20초
  if (now - lastMemoryCleanup > memoryCleanupInterval) {
    if (inputManager) {
      inputManager.cleanupStalePointers();
    } else if (activePointers.size > 10) {
      activePointers.clear();
    }
    LifecycleManager.gc();
    lastMemoryCleanup = now;
  }
  
  // 상태 변수 추출
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedGroup = uiStateManager ? uiStateManager.selectedGroup : null;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  const bubbles = bubbleManager?.bubbles ?? [];
  const filterState = ensureFilteredBubblesState();
  const hasTagFilter = filterState.hasTagFilter;
  const filteredBubbles = filterState.filteredBubbles;

  // 오빗 모드 상태 확인
  const orbitModeActive = !!showGroupView;
  if (!orbitModeActive) {
    resetOrbitBubbleState();
  }

  // 버블 회전 각도 업데이트
  if (hasTagFilter || showGroupView) {
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

  // 패닝 애니메이션 업데이트
  if (panController) {
    if (!showGroupView && !hasTagFilter) {
      panController.update();
      if (
        !panController.isDragging &&
        abs(panController.panVelocityX) < 0.1 &&
        abs(panController.panVelocityY) < 0.1
      ) {
        panController.panVelocityX = 0;
        panController.panVelocityY = 0;
        if (
          panController.snapTargetX === null &&
          panController.snapTargetY === null &&
          !panController.snapCompleted
        ) {
          snapToCenterBubble();
        }
      }
    } else if (showGroupView || hasTagFilter) {
      panController.update();
    }
  }

  // 상태 변수 추출
  const offsetX = panController?.offsetX ?? 0;
  const offsetY = panController?.offsetY ?? 0;
  const { centerX, centerY } = getBubbleAreaCenter();
  const alignAfterPopStartTime = bubbleManager?.alignAfterPopStartTime ?? null;

  // 팡 터지는 애니메이션 업데이트
  const popNow = millis();
  bubbles.filter(b => b.isPopping).forEach((b) => {
    b.updatePop(popNow);
  });

  // 팡 애니메이션 정렬 처리
  if (alignAfterPopStartTime !== null) {
    const elapsedSinceStart = millis() - alignAfterPopStartTime;
    const POP_START_DELAY = 200;
    if (elapsedSinceStart >= POP_START_DELAY) {
      if (filteredBubbles.length > 0) {
        const filteredCount = filteredBubbles.length;
        const gridSize = Math.ceil(Math.sqrt(filteredCount));
        filteredBubbles.forEach((b, index) => {
          b.gridX = index % gridSize;
          b.gridY = Math.floor(index / gridSize);
        });
        const centerGridX = Math.floor(gridSize / 2);
        const centerGridY = Math.floor((filteredCount - 1) / gridSize / 2);
        const centerHexX = centerGridX * HEX_SPACING * 1.5;
        const centerHexY = centerGridY * HEX_SPACING * sqrt(3) + ((centerGridX % 2) * HEX_SPACING * sqrt(3)) / 2;
        if (panController) {
          panController.snapTargetX = centerX - centerHexX;
          panController.snapTargetY = centerY - centerHexY;
          panController.snapCompleted = false;
        }
        startAnim();
        bubbleManager.alignAfterPopStartTime = null;
      }
    }
  }

  // 버블 업데이트 (일반 보기)
  if (!selectedGroup) {
    const shouldUpdateBubbles = !IS_MOBILE || frameCount % 3 === 0;
    
    if (shouldUpdateBubbles) {
      filteredBubbles.forEach((b) => {
        if (!b.isPopping) {
          if (b.imageIndex !== null) {
            const hasImage = bubbleImages[b.imageIndex] && bubbleImages[b.imageIndex].width > 0;
            if (hasImage) {
              // 이미지가 로드되었으면 부드럽게 페이드인 (번쩍임 방지)
              if (b.alpha < 0.3) {
                b.alpha = lerp(b.alpha, 0.3, 0.15); // 부드럽게 증가
              }
            } else {
              if (bubbleImageLoader && 
                  !bubbleImageLoader.isLoading(b.imageIndex) && !bubbleImageLoader.isLoaded(b.imageIndex)) {
                requestBubbleImage(b.imageIndex);
                // 로딩 시작 시에도 부드럽게 (번쩍임 방지)
                if (b.alpha < 0.1) {
                  b.alpha = lerp(b.alpha, 0.1, 0.1);
                }
              } else if (bubbleImageLoader && bubbleImageLoader.isLoaded(b.imageIndex)) {
                // 이미지 로드 완료 시 부드럽게 증가 (번쩍임 방지)
                if (b.alpha < 0.5) {
                  b.alpha = lerp(b.alpha, 0.5, 0.12);
                }
              }
            }
          } else {
            if (b.alpha < 0.01) b.alpha = 1.0;
          }
        }
        b._isFiltered = true;
        b.update(centerX, centerY, offsetX, offsetY, null);
        b._isFiltered = false;
      });
    }

    if (shouldUpdateBubbles) {
      bubbles.filter(b => b.isPopping && b.alpha > 0.01).forEach((b) => {
        b.update(centerX, centerY, offsetX, offsetY, null);
      });
    }

    // 중앙 버블 찾기
    let centerBubble = null;
    if (shouldUpdateBubbles || !centerBubble) {
      centerBubble = filteredBubbles.reduce((closest, b) => {
        const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
        const closestDist = closest ? dist(closest.pos.x, closest.pos.y, centerX, centerY) : Infinity;
        return distToCenter < closestDist ? b : closest;
      }, null);
    }

    // 중앙 버블 상호작용 스케일 및 투명도 조정
    if (centerBubble) {
      const targetInteractionScale = 1.05;
      const interactionEase = 0.08;
      centerBubble.interactionScale = lerp(centerBubble.interactionScale, targetInteractionScale, interactionEase);
      
      if (shouldUpdateBubbles) {
        const centerBubbleX = centerBubble.pos.x;
        const centerBubbleY = centerBubble.pos.y;
        
        filteredBubbles.forEach((b) => {
          if (b === centerBubble || b.isPopping) return;
          if (b.imageIndex !== null) {
            const hasImage = bubbleImages[b.imageIndex] && bubbleImages[b.imageIndex].width > 0;
            if (!hasImage) return;
          }
          
          const distToCenter = dist(b.pos.x, b.pos.y, centerBubbleX, centerBubbleY);
          let targetAlpha;
          if (distToCenter <= CENTER_INFLUENCE_RADIUS) {
            targetAlpha = 1.0;
          } else if (distToCenter >= ALPHA_FADE_RADIUS) {
            targetAlpha = MIN_ALPHA;
          } else {
            const fadeRange = ALPHA_FADE_RADIUS - CENTER_INFLUENCE_RADIUS;
            const fadeProgress = (distToCenter - CENTER_INFLUENCE_RADIUS) / fadeRange;
            targetAlpha = lerp(1.0, MIN_ALPHA, fadeProgress);
          }
          // 태블릿에서 알파 전환을 더 부드럽게 (깜빡임 방지)
          const alphaEase = IS_MOBILE ? 0.08 : 0.12; // 태블릿은 더 느리게
          b.alpha = lerp(b.alpha, targetAlpha, alphaEase);
        });
      }
      centerBubble.alpha = 1.0;
    }
  }

  // orbitInfoAlpha 업데이트 (태블릿에서 더 부드럽게)
  const shouldShowInfo = selectedOrbitBubble && hasTagFilter && !isOrbitInfoFadingOut;
  const orbitAlphaEase = IS_MOBILE ? 0.10 : 0.15; // 태블릿은 더 느리게
  if (shouldShowInfo) {
    orbitInfoAlpha = lerp(orbitInfoAlpha, 1.0, orbitAlphaEase);
  } else if (selectedOrbitBubble) {
    orbitInfoAlpha = lerp(orbitInfoAlpha, 0.0, orbitAlphaEase);
    if (orbitInfoAlpha < 0.01) {
      selectedOrbitBubble = null;
      orbitInfoAlpha = 0.0;
      isOrbitInfoFadingOut = false;
    }
  } else {
    orbitInfoAlpha = lerp(orbitInfoAlpha, 0.0, orbitAlphaEase);
    isOrbitInfoFadingOut = false;
  }
}

// 렌더링 함수 (그리기만 수행, 깜빡임 방지 최적화)
function renderScene() {
  // 배경 그리기 (항상 먼저 그려서 깜빡임 방지)
  if (graphicsManager) {
    graphicsManager.drawBackground();
  } else {
    // 레거시 fallback
    if (!bgBuffer) {
      if (resourceManager) {
        bgBuffer = resourceManager.getOrUpdateBuffer('bg', width, height);
      } else {
        bgBuffer = recreateGraphicsBuffer(bgBuffer, width, height);
      }
      bgBuffer.background(BG_COLOR);
    }
    // 배경 이미지가 로드되었으면 그리기 (한 번만)
    if (bgImage && bgImage.width > 0 && bgImage.height > 0) {
      redrawBackgroundBuffer();
    }
    image(bgBuffer, 0, 0);
  }

  // 태블릿에서도 더 자주 실행하여 화질 향상 (성능은 다른 최적화로 보완)
  const shouldRunHeavyPass = !IS_MOBILE || frameCount % 3 === 0; // 4 -> 3으로 변경하여 더 자주 실행
  
  // 상태 변수 추출
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedGroup = uiStateManager ? uiStateManager.selectedGroup : null;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  const bubbles = bubbleManager?.bubbles ?? [];
  const filterState = ensureFilteredBubblesState();
  const hasTagFilter = filterState.hasTagFilter;
  const filteredBubbles = filterState.filteredBubbles;
  const { centerX, centerY } = getBubbleAreaCenter();
  const offsetX = panController?.offsetX ?? 0;
  const offsetY = panController?.offsetY ?? 0;
  const isDragging = panController?.isDragging ?? false;
  const snapTargetX = panController?.snapTargetX ?? null;
  const snapTargetY = panController?.snapTargetY ?? null;
  const panVelocityX = panController?.panVelocityX ?? 0;
  const panVelocityY = panController?.panVelocityY ?? 0;
  const showToggles = uiStateManager?.showToggles ?? false;

  // 중앙 버블 찾기 (렌더링용)
  let centerBubble = null;
  if (!selectedGroup) {
    centerBubble = filteredBubbles.reduce((closest, b) => {
      const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
      const closestDist = closest ? dist(closest.pos.x, closest.pos.y, centerX, centerY) : Infinity;
      return distToCenter < closestDist ? b : closest;
    }, null);
  }

  // 버블 그리기 (일반 보기)
  if (!selectedGroup) {
    // 가시 영역 버블 가져오기 (최적화)
    const visible = bubbleManager ? bubbleManager.getVisibleBubbles(centerX, centerY, centerBubble) : [];
    visible.forEach(b => b.draw());

    // 중앙 버블 그리기
    if (centerBubble) {
      const originalRadius = centerBubble.r;
      let centerPulseScale = 1.0;
      if (!ANIMATION_CONFIG.enableBreathAnim && ANIMATION_CONFIG.enableCenterPulse) {
        const t = millis() * 0.001;
        centerPulseScale = 1 + 0.03 * Math.sin(t * 1.5);
        centerBubble.r = originalRadius * centerPulseScale;
      }
      drawCenterBubbleImage(centerBubble);
      if (
        ANIMATION_CONFIG.enableLightEffect &&
        centerBubble.r > 60 &&
        frameCount % ANIMATION_CONFIG.lightEffectInterval === 0
      ) {
        drawBubbleLightEffect(centerBubble);
      }
      drawCenterBubbleCap(centerBubble);
      centerBubble.r = originalRadius;
      startAnim();
    } else {
      const showModal = uiStateManager ? uiStateManager.showModal : false;
      if (
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
        startAnim();
      }
    }
  }

  // 태그 필터링된 상태나 중간 단계 화면일 때는 애니메이션 계속 실행
  if (hasTagFilter || showGroupView) {
    startAnim();
  }

  // 이미지 로딩 체크 (무거운 작업)
  if (shouldRunHeavyPass) {
    queueVisibleBubbleImages();
  }

  // 비네팅 효과 (캐시 사용)
  if (shouldRunHeavyPass) {
    if (graphicsManager) {
      graphicsManager.drawVignette();
    } else {
      vignette(); // 레거시 fallback
    }
  }

  // 오빗 버블 정보 표시
  if (selectedOrbitBubble && orbitInfoAlpha > 0.01) {
    const bubblePos = orbitBubblePositions.find(p => p.bubble === selectedOrbitBubble);
    if (bubblePos) {
      drawOrbitBubbleInfo(selectedOrbitBubble, bubblePos.x, bubblePos.y, bubblePos.r);
    } else if (selectedOrbitBubble.pos) {
      drawOrbitBubbleInfo(selectedOrbitBubble, selectedOrbitBubble.pos.x, selectedOrbitBubble.pos.y, selectedOrbitBubble.r);
    }
  }

  // 중간 단계 화면 표시
  let bubblesAbove = [];
  if (selectedGroup) {
    if (hasTagFilter) {
      bubblesAbove = drawTagFilteredBubbles(selectedTag, selectedGroup) || [];
    }
    drawGroupView(selectedGroup);
    bubblesAbove.forEach((bubble) => {
      if (bubble && bubble.drawAt && bubble.pos) {
        bubble.drawAt(bubble.pos.x, bubble.pos.y);
      }
    });
  }

  // 토글 오버레이
  if (showToggles) {
    push();
    fill(0, 0, 0, 180);
    noStroke();
    rect(0, 0, width, height);
    pop();
  }

  // UI 그리기
  drawNavBar();
  drawSearchBar();
  if (showToggles) {
    drawToggles();
  }

  if (centerBubble && !showGroupView && !showToggles) {
    drawCenterBubbleInfo(centerBubble);
  }
}

// 태블릿 깜빡임 방지를 위한 프레임 관리
let lastFrameTime = 0;
let frameSkipCounter = 0;
const TARGET_FRAME_TIME = 1000 / 30; // 30fps 목표

function draw() {
  // 페이지가 보이지 않으면 렌더링 중단 (깜빡임 방지를 위해 clear() 대신 배경만 그리기)
  if (!isPageVisible) {
    // clear() 대신 배경만 그려서 깜빡임 최소화
    background(BG_COLOR);
    return;
  }

  // 태블릿에서 프레임 드롭 감지 및 대응 (깜빡임 방지)
  if (IS_MOBILE) {
    const currentTime = millis();
    const frameDelta = currentTime - lastFrameTime;
    
    // 프레임이 너무 빠르게 실행되면 스킵 (드래그 중이 아닐 때만)
    if (frameDelta < TARGET_FRAME_TIME * 0.7 && !panController?.isDragging) {
      frameSkipCounter++;
      if (frameSkipCounter < 2) {
        // 배경만 그려서 깜빡임 방지
        if (graphicsManager) {
          graphicsManager.drawBackground();
        } else if (bgBuffer) {
          image(bgBuffer, 0, 0);
        } else {
          background(BG_COLOR);
        }
        return;
      }
      frameSkipCounter = 0;
    } else {
      frameSkipCounter = 0;
    }
    lastFrameTime = currentTime;
  }

  // 1. 상태 업데이트 (데이터 변경)
  updateState();

  // 2. 렌더링 (그리기)
  renderScene();

  // 태블릿에서는 더 많은 프레임 스킵으로 CPU/GPU 부담 감소 (프레임레이트는 유지)
  const shouldRunHeavyPass = !IS_MOBILE || frameCount % 4 === 0;

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
    if (!RotationController.state.isDragging) {
      // 자동 회전
      RotationController.state.rotationAngle += RotationController.state.autoSpeed;
      
      // 관성 회전
      RotationController.state.rotationAngle += RotationController.state.angularVelocity;
      RotationController.state.angularVelocity *= 0.92;
      if (Math.abs(RotationController.state.angularVelocity) < 0.0001) {
        RotationController.state.angularVelocity = 0;
      }
    }
    
    // 각도 정규화 (오버플로우 방지) - 2π로 모듈로 연산하여 0~2π 범위로 유지
    const TWO_PI = Math.PI * 2;
    RotationController.state.rotationAngle = ((RotationController.state.rotationAngle % TWO_PI) + TWO_PI) % TWO_PI;
  } else {
    // 태그/그룹 뷰가 아닐 때는 회전 상태 초기화
    RotationController.state.rotationAngle = 0;
    RotationController.state.angularVelocity = 0;
    RotationController.state.isDragging = false;
    RotationController.state.didDrag = false;
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
    // 태블릿에서는 업데이트 빈도를 더 줄여서 CPU/GPU 부담 감소 (프레임레이트는 유지)
    const shouldUpdateBubbles = !IS_MOBILE || frameCount % 3 === 0;
    
    if (shouldUpdateBubbles) {
      // 먼저 모든 버블 업데이트하여 중앙 버블 찾기 (1차 업데이트)
      // 필터링된 버블들은 이미지 로드 상태 확인 (거리 기반 투명도는 나중에 적용)
      filteredBubbles.forEach((b) => {
        if (!b.isPopping) {
          if (b.imageIndex !== null) {
            const hasImage = bubbleImages[b.imageIndex] && bubbleImages[b.imageIndex].width > 0;
            if (hasImage) {
              // 이미지가 로드되면 부드럽게 페이드인 (번쩍임 방지)
              if (b.alpha < 0.3) {
                b.alpha = lerp(b.alpha, 0.3, 0.15); // 부드럽게 증가
              }
              // 거리 기반 투명도는 중앙 버블 찾은 후 적용되므로 여기서는 최소값만 설정
            } else {
              // 아직 로딩 시도조차 안 했으면 로딩 시도
              if (bubbleImageLoader && 
                  !bubbleImageLoader.isLoading(b.imageIndex) && !bubbleImageLoader.isLoaded(b.imageIndex)) {
                requestBubbleImage(b.imageIndex);
                // 로딩 중인 버블도 부드럽게 (번쩍임 방지)
                if (b.alpha < 0.1) {
                  b.alpha = lerp(b.alpha, 0.1, 0.1);
                }
              }
              // 이미 로드 완료된 이미지인 경우 (실패한 경우는 error 콜백에서 imageIndex를 null로 바꿔주므로 여기 올 일이 거의 없음)
              else if (bubbleImageLoader && bubbleImageLoader.isLoaded(b.imageIndex)) {
                // 방어적으로 alpha를 부드럽게 올려줌 (번쩍임 방지)
                if (b.alpha < 0.5) {
                  b.alpha = lerp(b.alpha, 0.5, 0.12);
                }
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
    }

    // 팡 터지는 버블도 위치 업데이트 (애니메이션을 위해)
    // 태블릿에서는 업데이트 빈도 줄이기
    if (shouldUpdateBubbles) {
      bubbles.filter(b => b.isPopping && b.alpha > 0.01).forEach((b) => {
        b.update(centerX, centerY, offsetX, offsetY, null);
      });
    }

    // 중앙에 가장 가까운 버블 찾기 (간소화)
    // 태블릿에서는 찾기 빈도 줄이기
    if (shouldUpdateBubbles || !centerBubble) {
      centerBubble = filteredBubbles.reduce((closest, b) => {
        const distToCenter = dist(b.pos.x, b.pos.y, centerX, centerY);
        const closestDist = closest ? dist(closest.pos.x, closest.pos.y, centerX, centerY) : Infinity;
        return distToCenter < closestDist ? b : closest;
      }, null);
    }

    // 중앙 버블을 최대 크기로 부드럽게 설정 (interactionScale 사용)
    if (centerBubble) {
      // 주변보다 약간만 더 크게 (과하게 부풀지 않게)
      const targetInteractionScale = 1.05; // 5% 더 크게
      // interactionScale을 부드럽게 변화시킴 (실제 r은 update에서 계산됨)
      const interactionEase = 0.08;
      centerBubble.interactionScale = lerp(centerBubble.interactionScale, targetInteractionScale, interactionEase);
      
      // 중앙 버블로부터의 거리에 따라 투명도 조정 (바깥으로 갈수록 투명해짐)
      // 태블릿에서는 투명도 계산 빈도 줄이기
      if (shouldUpdateBubbles) {
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
        // 태블릿에서 알파 전환을 더 부드럽게 (깜빡임 방지)
        const alphaEase = IS_MOBILE ? 0.08 : 0.12; // 태블릿은 더 느리게
        b.alpha = lerp(b.alpha, targetAlpha, alphaEase);
        });
      }
      
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
      // 태블릿과 데스크탑 모두 유휴 시 애니메이션 정지
      if (
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
    bubblesAbove.forEach((bubble) => {
      if (bubble && bubble.drawAt && bubble.pos) {
        bubble.drawAt(bubble.pos.x, bubble.pos.y);
      }
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
  UIRenderer.drawNavBar();
  if (uiRenderer) {
    uiRenderer.drawSearchBar();
  } else {
    drawSearchBar(); // 레거시 fallback
  }

  // 토글 표시
  if (showToggles) {
    drawToggles();
  }

  if (centerBubble && !showGroupView && !showToggles) {
    drawCenterBubbleInfo(centerBubble);
  }

}

function windowResized() {
  const currentW = windowWidth;
  const currentH = windowHeight;
  
  // 미세 리사이즈 무시 (모바일 주소창 등으로 인한 빈번한 리사이즈 방지)
  const widthDiff = Math.abs(currentW - lastWindowSize.w);
  const heightDiff = Math.abs(currentH - lastWindowSize.h);
  
  if (widthDiff < MIN_RESIZE_THRESHOLD && heightDiff < MIN_RESIZE_THRESHOLD && lastWindowSize.w > 0) {
    // 미세한 변화는 무시하고 캔버스만 조정
    resizeCanvas(currentW, currentH);
    return;
  }
  
  lastWindowSize = { w: currentW, h: currentH };
  
  resizeCanvas(currentW, currentH);
  rebuildWorldMetrics(); // 월드 메트릭스 재계산
  
  // LayoutManager 메트릭 재계산 (반응형 수치 캐싱)
  LayoutManager.calculateMetrics();
  
  // ResourceManager를 사용하여 버퍼 재생성 (메모리 누수 방지)
  if (resourceManager) {
    bgBuffer = resourceManager.getOrUpdateBuffer('bg', width, height);
    redrawBackgroundBuffer();
  } else {
    redrawBackgroundBuffer(); // 레거시 fallback
  }
  
  // GraphicsManager 비네팅 버퍼 무효화 (재생성 필요)
  if (graphicsManager) {
    graphicsManager.lastVignetteSize = { w: 0, h: 0 };
  }
  
  // TagRenderer 캐시 무효화 (태그 크기가 변경될 수 있음)
  TagRenderer.invalidateCache();
  
  buildBubbles(); // 버블 재생성
  initToggleButtons(); // 토글 버튼 재초기화

  // 네비게이션 바 고해상도 버퍼 재생성 (ResourceManager 사용)
  if (navigationBar) {
    const responsiveScale = LayoutManager.getScale();
    const NAV_W = navigationBar.width * 0.455 * responsiveScale;
    const NAV_H = navigationBar.height * 0.455 * responsiveScale;
    const scaleFactor = 2;
    
    if (resourceManager) {
      navBarBuffer = resourceManager.getOrUpdateBuffer('navBar', NAV_W * scaleFactor, NAV_H * scaleFactor);
    } else {
      navBarBuffer = recreateGraphicsBuffer(navBarBuffer, NAV_W * scaleFactor, NAV_H * scaleFactor);
    }
    
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
// 하위 호환성을 위한 함수 래퍼
function getResponsiveScale() {
  return LayoutManager.getScale();
}

function getSearchMetrics() {
  return LayoutManager.getSearchMetrics();
}

function getBubbleAreaCenter(offsetY = -70) {
  return LayoutManager.getBubbleAreaCenter(offsetY);
}

function getMicIconRect() {
  return LayoutManager.getMicIconRect();
}

// 상호작용 관리자 클래스 (클릭 감지 최적화)
class InteractionManager {
  // 디버그 모드 (전시 환경에서는 false)
  static DEBUG_MODE = false;

  // 태그 필터링된 버블 클릭 감지
  static checkOrbitBubbleClick(x, y) {
  if (orbitBubblePositions.length === 0) return null;
  
  let clickedBubble = null;
  let minDist = Infinity;
  
  orbitBubblePositions.forEach(({ bubble, x: bubbleX, y: bubbleY, r }) => {
    const distToBubble = dist(x, y, bubbleX, bubbleY);
    if (distToBubble <= r && distToBubble < minDist) {
      minDist = distToBubble;
      clickedBubble = bubble;
    }
  });
  
  return clickedBubble;
}

  // 버블 클릭 감지 (최적화: b.update() 호출 제거)
  static checkBubbleClick(x, y) {
  if (!bubbleManager) return;
  
  const bubbles = bubbleManager.bubbles;
  const currentFilteredBubbles = bubbleManager.currentFilteredBubbles || [];
  const bubblesToCheck = currentFilteredBubbles.length > 0 ? currentFilteredBubbles : bubbles;
  
  // 현재 화면 상태 확인
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
  
  // 중간 단계 화면이나 태그 필터링된 상태에서는 버블 클릭 감지 안 함
  if (showGroupView || selectedTag) return;
  
  // 클릭 위치에서 가장 가까운 버블 찾기
    // 주의: b.update()를 호출하지 않고, 이미 계산된 b.pos를 사용
  let clickedBubble = null;
  let minDist = Infinity;
  
  bubblesToCheck.forEach((b) => {
    // 버블이 화면에 보이는지 확인
    if (b.alpha < 0.01) return;
    
      // 클릭 위치와 버블 중심 사이의 거리 (이미 계산된 pos 사용)
    const distToBubble = dist(x, y, b.pos.x, b.pos.y);
    
    // 버블 반지름 내에 클릭이 있는지 확인
    if (distToBubble <= b.r && distToBubble < minDist) {
      minDist = distToBubble;
      clickedBubble = b;
    }
  });
  
    // 디버그 모드일 때만 로그 출력 (메모리 누수 방지)
    if (clickedBubble && this.DEBUG_MODE) {
    const bubbleInfo = clickedBubble.imageIndex !== null && bubbleData && bubbleData[clickedBubble.imageIndex]
      ? bubbleData[clickedBubble.imageIndex]
      : null;
    
    log("=== 버블 클릭 감지 ===");
    log("버블 인덱스:", clickedBubble.imageIndex);
    if (bubbleInfo) {
      log("버블 제목:", bubbleInfo.title);
    }
    log("====================");
  }
}

  // 중앙 버블을 화면 중앙에 고정 (타겟만 설정)
  static snapToCenterBubble() {
    const { centerX, centerY } = LayoutManager.getBubbleAreaCenter();

    // 필터링된 버블만 사용
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

    // 중앙에 가장 가까운 버블 찾기
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
    let hexX = centerBubble.gridX * HEX_SPACING * 1.5;
    let hexY =
      centerBubble.gridY * HEX_SPACING * sqrt(3) +
      ((centerBubble.gridX % 2) * HEX_SPACING * sqrt(3)) / 2;

    let targetOffsetX = offsetX;
    let targetOffsetY = offsetY;

    // 반복적으로 조정하여 정확한 위치 찾기 (최대 5회)
    for (let iter = 0; iter < 5; iter++) {
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

      // 타겟 오프셋 설정
    if (panController) {
      panController.snapTargetX = targetOffsetX;
      panController.snapTargetY = targetOffsetY;
        // 애니메이션이 필요할 때만 시작
        if (panController.snapTargetX !== offsetX || panController.snapTargetY !== offsetY) {
          startAnim();
        }
      }
    }
  }
}

// 하위 호환성을 위한 함수 래퍼
function checkOrbitBubbleClick(x, y) {
  return InteractionManager.checkOrbitBubbleClick(x, y);
}

function checkBubbleClick(x, y) {
  InteractionManager.checkBubbleClick(x, y);
}

function snapToCenterBubble() {
  InteractionManager.snapToCenterBubble();
}

// 하위 호환성을 위한 함수 래퍼
function buildBubbles() {
  if (bubbleManager) {
    bubbleManager.rebuild();
  }
}

// 입력 컨트롤러 클래스 (포인터 이벤트 핸들러 통합)
class InputController {
  static longPressState = {
    pressedBubble: null,
    pressStartTime: null,
    isPressing: false
  };

  static lastInteractionTime = 0;
  static IDLE_TIMEOUT = 300000; // 5분 (밀리초)

  // UI 상호작용 처리
  static _handleUIInteraction(x, y) {
    // 검색창 클릭 확인 (캐시된 메트릭 사용)
    const isSearchBarClick = this.checkSearchBarClick(x, y);
    
    if (isSearchBarClick) {
      if (uiStateManager && uiStateManager.selectedToggles.length > 0) {
        toggleSelect(0);
      }
      if (uiStateManager) {
        uiStateManager.showToggles = true;
        if (uiStateManager.showGroupView) {
          uiStateManager.backToMainView();
        }
      }
      this.lastInteractionTime = millis();
      return true;
    }

    // 중간 단계 화면 클릭 처리
    if (uiStateManager && uiStateManager.showGroupView && uiStateManager.selectedGroup) {
      const clickedTag = checkTagClick(x, y, uiStateManager.selectedGroup);
      if (clickedTag) {
        const isSameTag = uiStateManager.selectedTag === clickedTag;
        if (isSameTag) {
          uiStateManager.selectedTag = null;
          resetOrbitBubbleInfo();
        } else {
          uiStateManager.selectTag(clickedTag);
          uiStateManager.selectedToggles = [uiStateManager.selectedGroup];
        }
        this.lastInteractionTime = millis();
        return true;
      }
      if (!uiStateManager.selectedTag) {
        return true;
      }
    }

    // 토글 클릭 확인
    if (uiStateManager && uiStateManager.showToggles) {
      const clickedToggle = this.checkToggleClick(x, y);
      if (clickedToggle !== null) {
        toggleSelect(clickedToggle);
        this.lastInteractionTime = millis();
        return true;
      }
      if (!isSearchBarClick) {
        uiStateManager.showToggles = false;
      }
    }

    return false;
  }

  // 버블 상호작용 처리
  static _handleBubbleInteraction(x, y) {
    const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
    const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
    
    if (showGroupView || selectedTag) {
      if (handleRotationStart(x, y)) {
        return false; // 회전 제어 시작
      }
      
      const hoveredBubble = checkOrbitBubbleClick(x, y);
      if (hoveredBubble) {
        this.longPressState.pressedBubble = hoveredBubble;
        this.longPressState.pressStartTime = millis();
        this.longPressState.isPressing = false;
      }
    }
    
    return true;
  }

  // 포인터 다운 처리
  static handlePointerDown(x, y, pointerId) {
    // UI 상호작용 처리
    if (this._handleUIInteraction(x, y)) {
      startAnim();
      return true;
    }

    // 버블 상호작용 처리
    const canPan = this._handleBubbleInteraction(x, y);
    if (!canPan) {
      return false;
    }

    // 패닝 시작
    if (panController) {
      panController.startDrag(x, y);
    }

    this.lastInteractionTime = millis();
    return false;
  }

  // 포인터 이동 처리
  static handlePointerMove(x, y, pointerId) {
    const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
    const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
    
    // 버블 회전 제어
    if (RotationController.state.isDragging) {
      handleRotationDrag(x, y);
      this.lastInteractionTime = millis();
      return;
    }
    
    // 패닝 업데이트
    if (panController && panController.isDragging) {
      panController.updateDrag(x, y);
      this.lastInteractionTime = millis();
    }
    
    // 길게 누르기 상태 업데이트
    if (this.longPressState.pressedBubble && this.longPressState.pressStartTime) {
      const elapsed = millis() - this.longPressState.pressStartTime;
      if (elapsed > 300 && !this.longPressState.isPressing) {
        this.longPressState.isPressing = true;
      }
    }
  }

  // 포인터 업 처리
  static handlePointerUp(x, y, pointerId) {
    // 버블 회전 제어 종료
    if (RotationController.state.isDragging) {
      const didRotationDrag = RotationController.state.didDrag;
      handleRotationEnd();
      if (didRotationDrag) {
        this.lastInteractionTime = millis();
        return;
      }
    }
    
    // 카테고리/태그 선택 시 버블 클릭 감지
    const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
    const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
    const selectedGroup = uiStateManager ? uiStateManager.selectedGroup : null;
    
    if (showGroupView || selectedTag) {
      const clickedBubble = checkOrbitBubbleClick(x, y);
      if (clickedBubble) {
        if (selectedOrbitBubble === clickedBubble) {
          isOrbitInfoFadingOut = true;
        } else {
          selectedOrbitBubble = clickedBubble;
          orbitInfoAlpha = 0.0;
          isOrbitInfoFadingOut = false;
        }
        this.lastInteractionTime = millis();
        return;
      }
    }
    
    // 버블 클릭 감지
    checkBubbleClick(x, y);
    
    if (!panController || !panController.isDragging) {
      this.lastInteractionTime = millis();
      return;
    }

    panController.endDrag();
    snapToCenterBubble();
    this.lastInteractionTime = millis();
  }

  // 유휴 모드 체크 (5분 이상 입력 없음)
  static checkIdleMode() {
    const now = millis();
    const timeSinceLastInteraction = now - this.lastInteractionTime;
    
    if (timeSinceLastInteraction > this.IDLE_TIMEOUT && this.lastInteractionTime > 0) {
      // 유휴 모드: 애니메이션 정지
      if (ANIMATION_CONFIG.allowIdlePause) {
        stopAnim();
      }
      return true;
    }
    return false;
  }

  // 검색창 클릭 확인 (마이크 이미지 영역만) - 캐시된 메트릭 사용
  static checkSearchBarClick(x, y) {
    const micIcon = LayoutManager.getMicIconRect();
    if (!micIcon) return false;

    const { iconX, iconY, iconSize } = micIcon;

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
  static checkToggleClick(x, y) {
    if (!uiStateManager) return null;
    
    const showToggles = uiStateManager.showToggles;
    if (!showToggles) return null;
    
    // 버튼이 초기화되지 않았으면 초기화
    if (ToggleManager.buttons.length === 0) {
      ToggleManager.init();
    }
    
    // 토글 클릭 확인
    for (let i = 0; i < ToggleManager.buttons.length; i++) {
      const button = ToggleManager.buttons[i];
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
}

// 하위 호환성을 위한 함수 래퍼
function handlePointerDown(x, y, pointerId) {
  return InputController.handlePointerDown(x, y, pointerId);
}

function handlePointerMove(x, y, pointerId) {
  InputController.handlePointerMove(x, y, pointerId);
}

function handlePointerUp(x, y, pointerId) {
  InputController.handlePointerUp(x, y, pointerId);
}

// ---------- POINTER EVENTS (통합 입력 처리) ----------
// 레거시 함수 (하위 호환성)
function handlePointerDownLegacy(x, y, pointerId) {
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
        InputController.longPressState.pressedBubble = hoveredBubble;
        InputController.longPressState.pressStartTime = millis();
        InputController.longPressState.isPressing = false;
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
  if (RotationController.state.isDragging) {
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
  if (InputController.longPressState.pressedBubble && InputController.longPressState.pressStartTime) {
    const elapsed = millis() - InputController.longPressState.pressStartTime;
    if (elapsed > 300 && !InputController.longPressState.isPressing) {
      // 300ms 이상 누르고 있으면 정보 표시
      InputController.longPressState.isPressing = true;
    }
  }
}

function handlePointerUp(x, y, pointerId) {
  // 버블 회전 제어 종료
  if (RotationController.state.isDragging) {
    const didRotationDrag = RotationController.state.didDrag;
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

// 하위 호환성을 위한 함수 래퍼
function drawNavBar() {
  UIRenderer.drawNavBar();
}

// 하위 호환성을 위한 함수 래퍼
function getNavMetrics() {
  return LayoutManager.getNavMetrics();
}

// 네비게이션 바 클릭 확인 (실제 네비게이션 바 이미지 영역만)
function checkNavBarClick(x, y) {
  const metrics = LayoutManager.getNavMetrics();
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

// 하위 호환성을 위한 함수 래퍼
function drawSearchBar() {
  if (uiRenderer) {
    uiRenderer.drawSearchBar();
  }
}

// 하위 호환성을 위한 함수 래퍼
function checkSearchBarClick(x, y) {
  return InteractionManager.checkSearchBarClick(x, y);
}

function checkToggleClick(x, y) {
  return InteractionManager.checkToggleClick(x, y);
}

// 하위 호환성을 위한 함수 래퍼
function toggleSelect(toggleIndex) {
  if (uiStateManager) {
    uiStateManager.selectToggle(toggleIndex);
    startAnim(); // 애니메이션 시작
  }
}

// 하위 호환성을 위한 함수 래퍼
function initToggleButtons() {
  ToggleManager.init();
  // 전역 변수 동기화
  toggleButtons = ToggleManager.buttons;
}

function drawToggles() {
  ToggleManager.draw();
}

function getToggleLayout() {
  if (!ToggleManager.layout) {
    ToggleManager.calculateLayout();
  }
  return ToggleManager.layout;
}

// 하위 호환성을 위한 함수 래퍼
function resetOrbitBubbleState() {
  OrbitSystem.resetOrbitBubbleState();
}

function ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey) {
  return OrbitSystem.ensureOrbitBubbleReady(bubble, targetBaseR, orbitContextKey);
}

// 하위 호환성을 위한 함수 래퍼 (OrbitSystem 사용)
function drawOrbitBubbles({ bubbles, orbitContextKey, filterFn }) {
  // 위치 업데이트 (수학 계산)
  const updatedBubbles = OrbitSystem.updateOrbitPositions(bubbles, filterFn, orbitContextKey);
  // 렌더링 (그리기)
  return OrbitSystem.render(updatedBubbles);
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

// 하위 호환성을 위한 함수 래퍼 (캐시된 레이아웃 사용)
function forEachGroupTag(groupIndex, cb) {
  // GroupViewRenderer의 캐시된 레이아웃 사용
  if (!GroupViewRenderer.cachedTagLayouts[groupIndex]) {
    GroupViewRenderer._calculateTagLayout(groupIndex);
  }
  const tagLayout = GroupViewRenderer.cachedTagLayouts[groupIndex];
  if (tagLayout) {
    tagLayout.forEach(({ tag, x, y, w, h, fontSize }) => {
      cb({ tag, x, y, w, h, fontSize });
    });
  }
}

// 하위 호환성을 위한 함수 래퍼
function drawGroupView(groupIndex) {
  push();
  drawingContext.save();

  // GroupViewRenderer로 백글로우, 이미지, 빛 효과, 버블캡, 집단 이름 그리기
  GroupViewRenderer.draw(groupIndex);

  // 태그 표시 (집단 이미지 주변에 원형으로 배치)
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;

    push();
    drawingContext.save();
    
    // p5.js와 drawingContext 모두 중앙 정렬 설정
    textAlign(CENTER, CENTER);
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";

    if (pretendardFont) {
      textFont(pretendardFont);
    }

  // 캐시된 태그 레이아웃 사용
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
      
      // p5.js와 drawingContext 모두 중앙 정렬 설정
      textAlign(CENTER, CENTER);
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
      const textY = tagY; // -8 오프셋 제거하여 정확히 중앙에 배치
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

// 태그 렌더러 클래스 (글래스모피즘 최적화 및 그라디언트 캐싱)
class TagRenderer {
  // 그라디언트 캐시 (크기별로 캐싱)
  static gradientCache = {
    glass: null,        // 글래스 배경 그라디언트
    highlight: null,   // 하이라이트 그라디언트
    edgeNormal: null,  // 일반 테두리 그라디언트
    edgeHovered: null, // hover 테두리 그라디언트
    edgeSelected: null // 선택된 테두리 그라디언트
  };
  
  static lastTagSize = { w: 0, h: 0 };
  static LOW_QUALITY_MODE = false; // 태블릿 성능 모드 (블러 비활성화)

  // 그라디언트 생성 및 캐싱
  static _getGradient(type, w, h, x = 0, y = 0) {
    const needsUpdate = this.lastTagSize.w !== w || this.lastTagSize.h !== h;
    
    if (needsUpdate) {
      // 기존 그라디언트 캐시 초기화
      this.gradientCache = {
        glass: null,
        highlight: null,
        edgeNormal: null,
        edgeHovered: null,
        edgeSelected: null
      };
      this.lastTagSize = { w, h };
    }

    // 캐시된 그라디언트가 있으면 반환
    if (this.gradientCache[type]) {
      return this.gradientCache[type];
    }

    // 새 그라디언트 생성 및 캐싱
    const ctx = drawingContext;
    let gradient;
    
    switch (type) {
      case 'glass':
        gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "rgba(0, 0, 0, 0.08)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0.10)");
        break;
      case 'highlight':
        gradient = ctx.createLinearGradient(x, y, x, y + h * 0.5);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        break;
      case 'edgeNormal':
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.75)");
        gradient.addColorStop(1, "rgba(255,255,255,0.05)");
        break;
      case 'edgeHovered':
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.7)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.5)");
        gradient.addColorStop(1, "rgba(255,255,255,0.2)");
        break;
      case 'edgeSelected':
        gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.8)");
        gradient.addColorStop(1, "rgba(255,255,255,0.3)");
        break;
      default:
        return null;
    }
    
    this.gradientCache[type] = gradient;
    return gradient;
  }

  // 글래스 태그 그리기 (최적화된 버전)
  static draw(x, y, w, h, r, isSelected = false, isHovered = false) {
  const ctx = drawingContext;

  // 1) 아웃샤도우 (태그 외곽 글로우, hover 시 더 강하게)
  ctx.save();
  const shadowOffsetY = isHovered ? -2 : 0;
  roundRectPath(ctx, x, y + shadowOffsetY, w, h, r);
    ctx.shadowBlur = isHovered ? 24 : 18;
  ctx.shadowColor = isHovered ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.25)";
  ctx.shadowOffsetY = shadowOffsetY;
    ctx.fillStyle = "rgba(0,0,0,0.001)";
  ctx.fill();
  ctx.restore();

  // 2) 클립 후, 배경을 다시 그리면서 필터 적용 → 백드롭 블러 효과
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.globalAlpha = 0.5;
    
    // 백드롭 블러 효과 (성능 모드에 따라 조건부 실행)
    if (!this.LOW_QUALITY_MODE) {
  if (bgBuffer) {
    ctx.filter = "blur(5px) saturate(120%) brightness(80%)";
    const src = bgBuffer.canvas || bgBuffer.elt;
    ctx.drawImage(src, 0, 0);
    ctx.filter = "none";
  } else if (bgImage && bgImage.width > 0) {
    ctx.filter = "blur(5px) saturate(120%) brightness(80%)";
    const src = bgImage.canvas || bgImage.elt;
    ctx.drawImage(src, 0, 0, width, height);
    ctx.filter = "none";
  } else {
    ctx.fillStyle = BG_COLOR;
        ctx.fillRect(x, y, w, h);
      }
    } else {
      // 저품질 모드: 단순 투명도 조절로 대체
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(x, y, w, h);
  }

    // 3) 글래스모피즘 그라디언트 배경 (캐시된 그라디언트 사용)
    const glassGradient = this._getGradient('glass', w, h, x, y);
  ctx.fillStyle = glassGradient;
  ctx.fillRect(x, y, w, h);

    // 4) 내부 하이라이트 그라디언트 (캐시된 그라디언트 사용)
    const innerHighlight = this._getGradient('highlight', w, h, x, y);
  ctx.fillStyle = innerHighlight;
  ctx.fillRect(x, y, w, h * 0.5);
  
  ctx.globalAlpha = 1.0;

    // 5) 유리 테두리 (캐시된 그라디언트 사용)
    let edgeGradient;
    let lineWidth;
  if (isSelected) {
      edgeGradient = this._getGradient('edgeSelected', w, h, x, y);
      lineWidth = 3;
  } else if (isHovered) {
      edgeGradient = this._getGradient('edgeHovered', w, h, x, y);
      lineWidth = 2.5;
  } else {
      edgeGradient = this._getGradient('edgeNormal', w, h, x, y);
      lineWidth = 1.5;
    }
    
    ctx.strokeStyle = edgeGradient;
    ctx.lineWidth = lineWidth;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.restore();
  }

  // 캐시 무효화 (리사이즈 시)
  static invalidateCache() {
    this.gradientCache = {
      glass: null,
      highlight: null,
      edgeNormal: null,
      edgeHovered: null,
      edgeSelected: null
    };
    this.lastTagSize = { w: 0, h: 0 };
  }
}

// 하위 호환성을 위한 함수 래퍼
function drawGlassTag(x, y, w, h, r, isSelected = false, isHovered = false) {
  TagRenderer.draw(x, y, w, h, r, isSelected, isHovered);
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

// 하위 호환성을 위한 함수 래퍼 (GraphicsManager 사용)
function vignette() {
  if (graphicsManager) {
    graphicsManager.drawVignette();
  } else {
    // 레거시 fallback (비네팅 버퍼가 없을 때만)
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
}

// 회전 제어 컨트롤러 클래스 (입력 로직 분리)
class RotationController {
  // 회전 상태 (전역 bubbleRotationState를 대체)
  static state = {
    rotationAngle: 0,
    angularVelocity: 0,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    autoSpeed: 0.005, // 카테고리 선택 시 회전 속도 (2배 느리게: 0.01 -> 0.005)
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
  static start(x, y) {
  // 태그 필터링 또는 그룹 뷰가 활성화된 경우에만 회전 제어
  const showGroupView = uiStateManager ? uiStateManager.showGroupView : false;
  const selectedTag = uiStateManager ? uiStateManager.selectedTag : null;
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
  
  // 마지막 드래그 속도를 관성으로 저장 (튕겨 나가는 느낌)
  const timeDelta = deltaTime / 1000; // 초 단위
  if (timeDelta > 0 && Math.abs(angleDelta) > 0.001) {
      // 최대/최소 속도 제한 (견고성 향상)
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
      autoSpeed: 0.01,
      didDrag: false
    };
  }
}

// 하위 호환성을 위한 함수 래퍼
function handleRotationStart(x, y) {
  // 중심 위치 계산 및 업데이트
  const { centerX, centerY } = getOrbitCenterMetrics();
  const imageSize = min(width * 0.4, height * 0.4) * getResponsiveScale();
  const maxRadius = min(width, height) * 0.45;
  const controlRadius = maxRadius + 100;
  
  RotationController.update(centerX, centerY, controlRadius);
  return RotationController.start(x, y);
}

function handleRotationDrag(x, y) {
  RotationController.drag(x, y);
}

function handleRotationEnd() {
  RotationController.end();
}
