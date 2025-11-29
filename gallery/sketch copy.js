

let imageFiles = []; // 이미지 파일명 목록
let imageLoader = null; // ImageLoader 인스턴스

let bubbles = null;
let bubbleCount = 0;

// pooled arrays / temp buffers (no per-frame alloc)

// input
let pointerDown = false;
let pointerId = -1;
let downX = 0, downY = 0;
let lastX = 0, lastY = 0;
let lastT = 0;
let dragging = false;
let dragMode = 0; // 0 none, 1 pan, 3 image drag
let clickedBubbleAtPress = null;

let panController = null;
let bubbleManager = null;
let centerX = 0, centerY = 0, maxDist = 0;
let scaleAll = 1;
let appTime = 0;

let mode = 0; // 0 normal, 1 fullscreen, 2 name input, 3 analysis, 4 onboarding
let fullscreenIndex = -1;
let fullscreenAnim = 0, fullscreenExitAnim = 0;
let fullscreenTagLayout = [];
let fullscreenStartPos = { x: 0, y: 0, r: 0 };
let fullscreenImageOffset = { x: 0, y: 0 };
let fullscreenImageDragStart = { x: 0, y: 0 };
let fullscreenImageDragging = false;
let selectedTag = null;
let recommendedBubbles = [];
let recommendedBubblesAnim = 0;

let fontPretendard = null;
let uiImages = {};
let uiHitboxes = [];
let bubblePopSound = null;
let tagIndexMap = Object.create(null);
let recommendedHitboxes = [];

let onboardingImages = [];
let slidingHandImage = null; // 슬라이딩 손 이미지
let slidingHandAnimTime = 0; // 슬라이딩 손 애니메이션 시간
let onboardingCurrentPage = 0; // 현재 페이지 인덱스 (0부터 시작)
let onboardingOffsetX = 0; // 애니메이션 오프셋
let onboardingTargetPage = 0; // 목표 페이지
let onboardingAnimProgress = 0; // 애니메이션 진행도 (0~1)
let onboardingIsAnimating = false; // 애니메이션 중인지
let onboardingAnimFromOffset = 0; // 애니메이션 시작 시 기준 오프셋
let onboardingInputBlockUntil = 0; // 터치 입력 차단 시간 (밀리초)
let onboardingLastPageChangeTime = 0; // 마지막 페이지 변경 시간 (밀리초)
let bgBuffer = null;
let spriteCache = null;
let fpsSmoother = 60;
let idleFrameSkip = 0;
let lastActiveTime = 0;
let deltaTime = 16.666;
let lastDrawTime = 0;
let showInstructionText = true;
let instructionPulseTime = 0;
let userName = "";
let favoriteBubbles = [];
let nameInputElement = null;
let pendingNameConfirm = false;
let analysisResult = null;

function preload() {
  fontPretendard = loadFont(PATHS.font);
  // JSON은 setup에서 비동기로 로드 (preload에서 제대로 작동하지 않을 수 있음)
  // rawData는 setup에서 로드

  // UI images (익스플로어와 동일하게 수정)
  uiImages["background"] = loadImage(PATHS.uiImgs + "background.webp");
  uiImages["bubble-cap.png"] = loadImage(PATHS.uiImgs + "bubble-cap.png");

  // 온보딩 이미지 로드
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding1.webp"));
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding2.webp"));
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding3.webp"));
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding4.webp"));
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding6.webp"));
  onboardingImages.push(loadImage(PATHS.uiImgs + "onboarding7.webp"));
  
  // 슬라이딩 손 이미지 로드
  slidingHandImage = loadImage(PATHS.uiImgs + "sliding-hand.png");

  // 버블 터지는 소리 로드 (p5.sound 라이브러리가 있는 경우에만)
  if (typeof loadSound !== 'undefined') {
    try {
      bubblePopSound = loadSound(PATHS.bubblePopSound);
    } catch (e) {
      console.warn("버블 터지는 소리 로드 실패:", e);
      bubblePopSound = null;
    }
  } else {
    bubblePopSound = null;
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1);
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  textFont(fontPretendard);
  textAlign(CENTER, CENTER);
  spriteCache = new SpriteCache();
  imageLoader = new ImageLoader();
  panController = new PanController();
  bubbleManager = new BubbleManager();
  recalcLayout();
  loadBubbleDataFromJSON();
  initBackground();
  initUI();
  setupPointerEvents();
  createNameInputElement();
  mode = 4; // 온보딩 화면부터 시작
  onboardingCurrentPage = 0;
  onboardingOffsetX = 0;
  onboardingTargetPage = 0;
  onboardingAnimProgress = 0;
  onboardingIsAnimating = false;
  onboardingLastPageChangeTime = millis(); // 초기 페이지 변경 시간 설정
  lastActiveTime = millis();
  initWakeLock();
}

function recalcLayout() {
  centerX = width * 0.5;
  centerY = height * 0.5;
  maxDist = Math.sqrt(width * width + height * height) / 2;
  const baseW = 1920, baseH = 1080;
  const s = Math.min(width / baseW, height / baseH);
  scaleAll = clamp(s, 0.5, 1.5);
}

async function loadBubbleDataFromJSON() {
  try {
    const response = await fetch(PATHS.bubblesJson);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    initData(await response.json());
  } catch (error) {
    console.error("[Gallery] JSON 로드 실패:", error);
    initData({ imageFiles: [], bubbles: [] });
  }
}

function initData(raw) {
  const norm = DATA_SCHEMA_ADAPTER.normalize(raw);
  bubbleCount = norm.length || RENDER.totalBubblesFallback;
  imageFiles = raw.imageFiles || norm.map(d => d.imageFile).filter(Boolean);
  bubbleManager.build(norm);
  bubbles = bubbleManager.bubbles;
  buildTagIndex();
  const centerPos = bubbleManager.getCenterHexPosition();
  panController.camX = centerPos.x;
  panController.camY = centerPos.y;
  panController.velX = panController.velY = 0;
  panController.snapTargetX = panController.snapTargetY = null;
}

function buildTagIndex() {
  tagIndexMap = Object.create(null);
  if (!bubbles) return;

  for (let i = 0; i < bubbleCount; i++) {
    const b = bubbles[i];
    if (!b) continue;
    const vs = b.visualTags || [];
    const es = b.emotionalTags || [];

    for (let j = 0; j < vs.length; j++) {
      const t = vs[j];
      (tagIndexMap[t] || (tagIndexMap[t] = [])).push(i);
    }
    for (let j = 0; j < es.length; j++) {
      const t = es[j];
      (tagIndexMap[t] || (tagIndexMap[t] = [])).push(i);
    }
  }
}

function initBackground() {
  bgBuffer = createGraphics(width, height);
  bgBuffer.drawingContext.imageSmoothingEnabled = true;
  bgBuffer.drawingContext.imageSmoothingQuality = "high";
  
  const bgImg = uiImages["background"];
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
}

function draw() {
  const now = millis();
  deltaTime = now - (lastDrawTime || now);
  lastDrawTime = now;
  appTime = now / 1000;

  // 아이들 모드 프레임 스킵 개선 (6시간 장시간 실행 최적화)
  const idle = !dragging && mode === 0 && (now - lastActiveTime) > 800;
  if (idle) {
    const targetDt = 1000 / RENDER.idleFPS;
    if (deltaTime < targetDt) {
      idleFrameSkip++;
      // 아이들 모드에서는 더 많은 프레임 스킵 (배터리 절약)
      if (idleFrameSkip % 3 !== 0) return; // 3프레임 중 1프레임만 렌더링
    }
  } else {
    idleFrameSkip = 0;
  }

  // 배경
  image(bgBuffer, 0, 0);

  const isExiting = mode === 1 && fullscreenExitAnim > 0;
  const exitAnimProgress = isExiting ? 1 - fullscreenExitAnim : 1;
  const smoothExitProgress = exitAnimProgress * exitAnimProgress;

  if (mode === 0 || isExiting) {
    if (isExiting) {
      push();
      drawingContext.globalAlpha = smoothExitProgress;
    }

    // 카메라 업데이트 → 그리드 + 버블 업데이트/그리기
    if (bubbleManager && panController) {
      panController.update(bubbleManager.worldW, bubbleManager.worldH);
      drawGridLayout();  // 여기서 bubbleManager.updateAndDraw(panController) 호출됨
    }

    // 센터 버블 정보 텍스트는 그리드 위에 올려서 더 잘 보이게
    const centerBubble = bubbleManager ? bubbleManager.getCenterBubble() : null;
    if (centerBubble && !isExiting) {
      drawCenterBubbleInfo(centerBubble, scaleAll);
    }

    drawUI();

    if (showInstructionText && !dragging && !isExiting) {
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

  // 이름 입력 모달
  if (mode === 2) {
    drawNameInputModal();
  } else {
    // 모달이 아닐 때는 input 숨김
    if (nameInputElement) {
      nameInputElement.style("display", "none");
    }
  }

  // 분석 결과 화면
  if (mode === 3) {
    drawAnalysisResult();
  }

  // 온보딩 화면
  if (mode === 4) {
    updateOnboarding();
    drawOnboarding();
  }

  // 감각 알아보기 버튼 (일반 모드에서만, 이름이 입력된 경우)
  if (mode === 0 && userName) {
    drawTasteAnalysisButton();
  }

  if (DEV.showFPS) drawFPS?.();

  // --- GC 관리 (전시용 안정성 강화) ---
  const isTablet = width < 1200;
  const gcInterval = isTablet ? PERFORMANCE_CONFIG.tabletGCInterval : PERFORMANCE_CONFIG.desktopGCInterval;
  const softInterval = isTablet ? PERFORMANCE_CONFIG.tabletSoftReset : PERFORMANCE_CONFIG.desktopSoftReset;

  if (!window.lastGC) window.lastGC = 0;
  if (!window.lastSoftReset) window.lastSoftReset = 0;
  if (!window.lastHealthCheck) window.lastHealthCheck = 0;

  // GC 실행 (Set 재사용으로 GC 최소화)
  if (now - window.lastGC > gcInterval) {
    window.lastGC = now;

    if (!window._protectedPathsSet) window._protectedPathsSet = new Set();
    const protectedPaths = window._protectedPathsSet;
    protectedPaths.clear(); // 재사용
    
    if (mode === 1 && bubbles && fullscreenIndex >= 0 && bubbles[fullscreenIndex]) {
      const mainImgPath = bubbles[fullscreenIndex].imgPath;
      if (mainImgPath) protectedPaths.add(mainImgPath);

      for (let i = 0; i < recommendedBubbles.length; i++) {
        const rec = recommendedBubbles[i];
        if (rec && rec.bubble && rec.bubble.imgPath) {
          protectedPaths.add(rec.bubble.imgPath);
        }
      }
    }
    if (imageLoader && imageLoader.gc) {
      imageLoader.gc(protectedPaths.size > 0 ? protectedPaths : null);
    }
  }

  // 소프트 리셋 (큐 정리)
  if (now - window.lastSoftReset > softInterval) {
    window.lastSoftReset = now;
    if (imageLoader && imageLoader.softReset) imageLoader.softReset();
  }

  // 전시용 건강 체크 (10분마다) - 6시간 장시간 실행 최적화
  if (now - window.lastHealthCheck > 600000) { // 10분 = 600000ms (5분에서 10분으로 증가)
    window.lastHealthCheck = now;
    
    // 메모리 사용량 체크 (가능한 경우)
    if (performance.memory) {
      const usedMB = performance.memory.usedJSHeapSize / 1048576;
      const limitMB = performance.memory.jsHeapSizeLimit / 1048576;
      
      if (DEV.logMemory) {
        console.log(`[Gallery] 메모리 사용량: ${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB`);
      }
      
      // 메모리 사용량이 75% 이상이면 강제 GC (80%에서 75%로 낮춤 - 더 적극적인 관리)
      if (usedMB / limitMB > 0.75) {
        console.warn('[Gallery] 메모리 사용량이 높습니다. 강제 GC 실행...');
        if (imageLoader && imageLoader.gc) {
          imageLoader.gc(null); // 보호 없이 강제 GC
        }
        // 브라우저에게 GC 힌트 제공
        if (window.gc) {
          window.gc();
        }
      }
    }
    
    // Wake Lock 상태 확인 및 재요청
    if (wakeLock === null && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      console.log('[Gallery] 건강 체크: Wake Lock 재요청...');
      wakeLockRetryCount = 0;
      retryWakeLock();
    }
  }
}

// 그리드 레이아웃 렌더링 (익스플로어와 동일)
function drawGridLayout() {
  if (!bubbleManager || !panController) return;
  
  // BubbleManager 업데이트 및 그리기 (버블 위치 계산 + 그리기)
  bubbleManager.updateAndDraw(panController);
}

// 중앙 버블 정보 표시 (익스플로어 스타일)
function drawCenterBubbleInfo(centerBubble, s) {
  if (!centerBubble) return;
  
  // 익스플로어 스타일: 주인공 버블은 항상 화면 중앙에 표시
  const x = centerBubble.isCenter ? centerX : centerBubble.displayX;
  const r = centerBubble.displayR;
  const s_scale = s || scaleAll || 1;
  
  // 주인공 버블은 20픽셀 위로 올라가고, 텍스트는 20픽셀 아래로 내림 (익스플로어와 동일)
  let infoY;
  if (centerBubble.isCenter) {
    infoY = centerY - 20 + r + 40 * s_scale + 20;
  } else {
    infoY = centerBubble.displayY + r + 30 * s_scale;
  }

  // 주인공 버블일 때 1.3배 확대 (익스플로어와 동일)
  const centerMultiplier = centerBubble.isCenter ? 1.3 : 1.0;

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
  const titleSize = 18 * s_scale * centerMultiplier;
  const titleFontSize = titleSize * 1.2;
  drawingContext.font = `700 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
  drawingContext.fillStyle = `rgba(255, 255, 255, ${230 / 255})`;
  drawingContext.fillText(centerBubble.name || centerBubble.title, x, infoY);

  // 감정 2개, 비주얼 2개만 표시 (상위 4개) - 익스플로어와 동일
  const visualTags = (centerBubble.visualTags || []).filter(Boolean).slice(0, 2);
  const emotionalTags = (centerBubble.emotionalTags || []).filter(Boolean).slice(0, 2);
  const tagGroups = [
    { list: visualTags },
    { list: emotionalTags }
  ].filter(group => group.list.length > 0);

  if (tagGroups.length > 0) {
    const tagSize = 14 * s_scale * centerMultiplier;
    const tagFontSize = tagSize * 1.3;
    const lineGap = 28 * s_scale * centerMultiplier;
    drawingContext.font = `400 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`;
    drawingContext.fillStyle = `rgba(255, 255, 255, ${180 / 255})`;

    tagGroups.forEach((group, idx) => {
      const tagText = group.list.map(tag => `#${tag}`).join("  ");
      drawingContext.fillText(tagText, x, infoY + 35 * s_scale * centerMultiplier + idx * lineGap);
    });
  }

  drawingContext.restore();
  pop();
}

// 태그 레이아웃 랜덤 생성 (이미지 좌표계 기준, 익스플로어 스타일, 충돌 방지)
function generateRandomTagLayout(tags, imageWidth, imageHeight, visualTags = [], emotionalTags = []) {
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

  // 이미지 좌표계에서 태그를 배치 (이미지의 중앙을 (0, 0)으로 하는 상대 좌표)
  // 이미지 크기를 기준으로 태그 배치 영역 계산
  const marginX = 40 * responsiveScale; // 좌우 여백
  const marginYTop = 120 * responsiveScale; // 상단 여백 (VR 버튼 공간)
  const marginYBottom = 40 * responsiveScale; // 하단 여백
  const availableImageWidth = imageWidth - marginX * 2;
  const availableImageHeight = imageHeight - marginYTop - marginYBottom;

  // 두 태그가 겹치는지 확인하는 함수
  function checkCollision(x, y, w, h, existingLayout) {
    const nx = x - w / 2;
    const ny = y - h / 2;
    
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
  
  tags.forEach((tag, i) => {
    const label = tag.startsWith("#") ? tag : `#${tag}`;
    const w = textWidth(label) + padding * 2;
    
    let x, y;
    let attempts = 0;
    const maxAttempts = 100; // 최대 시도 횟수 증가
    
    // 겹치지 않는 위치를 찾을 때까지 시도
    do {
      // 이미지 좌표계에서 랜덤 배치 (이미지의 중앙을 기준으로 상대 좌표)
      // 이미지의 중앙을 (0, 0)으로 하는 좌표계 사용
      const relativeX = random(-availableImageWidth / 2 + w / 2, availableImageWidth / 2 - w / 2);
      const relativeY = random(-availableImageHeight / 2 + tagH / 2, availableImageHeight / 2 - tagH / 2);
      
      // 이미지 좌표계에서의 절대 좌표로 변환 (이미지의 중앙이 (0, 0))
      x = relativeX;
      y = relativeY;
      
      // 경계 체크 및 조정
      if (x - w / 2 < -imageWidth / 2 + marginX) x = -imageWidth / 2 + marginX + w / 2;
      if (x + w / 2 > imageWidth / 2 - marginX) x = imageWidth / 2 - marginX - w / 2;
      if (y - tagH / 2 < -imageHeight / 2 + marginYTop) y = -imageHeight / 2 + marginYTop + tagH / 2;
      if (y + tagH / 2 > imageHeight / 2 - marginYBottom) y = imageHeight / 2 - marginYBottom - tagH / 2;
      
      attempts++;
      
      // 최대 시도 횟수에 도달하면 강제로 배치 (최소한의 거리만 확보)
      if (attempts >= maxAttempts) {
        // 기존 태그들로부터 최소한의 거리를 확보한 위치 찾기
        let bestX = x, bestY = y;
        let maxMinDist = 0;
        
        // 그리드 방식으로 후보 위치 탐색
        const gridSteps = 20;
        const stepX = availableImageWidth / gridSteps;
        const stepY = availableImageHeight / gridSteps;
        
        for (let gx = 0; gx <= gridSteps; gx++) {
          for (let gy = 0; gy <= gridSteps; gy++) {
            const tryX = -availableImageWidth / 2 + gx * stepX;
            const tryY = -availableImageHeight / 2 + gy * stepY;
            
            // 경계 체크
            let adjustedX = tryX;
            let adjustedY = tryY;
            if (adjustedX - w / 2 < -imageWidth / 2 + marginX) adjustedX = -imageWidth / 2 + marginX + w / 2;
            if (adjustedX + w / 2 > imageWidth / 2 - marginX) adjustedX = imageWidth / 2 - marginX - w / 2;
            if (adjustedY - tagH / 2 < -imageHeight / 2 + marginYTop) adjustedY = -imageHeight / 2 + marginYTop + tagH / 2;
            if (adjustedY + tagH / 2 > imageHeight / 2 - marginYBottom) adjustedY = imageHeight / 2 - marginYBottom - tagH / 2;
            
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
    // 이미지 좌표계 기준으로 저장 (이미지의 중앙이 (0, 0))
    layout.push({ tag, label, x, baseY: y, w, h: tagH, r: tagR, fontSize, tagType });
  });

  return layout;
}

// fullscreen 이미지 위치 계산 (drawFullscreen과 checkTagClick에서 공통 사용)
function getFullscreenImageRect() {
  if (!bubbles || fullscreenIndex < 0) return null;

  const b = bubbles[fullscreenIndex];
  const img = b && b.imgPath && imageLoader ? imageLoader.get(b.imgPath) : null;
  const isExiting = fullscreenExitAnim > 0;
  const anim = isExiting ? fullscreenExitAnim : fullscreenAnim;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easedAnim = isExiting ? anim : easeOutCubic(anim);

  if (img && img.width > 0) {
    const imgRatio = img.width / img.height;
    const screenRatio = width / height;
    const zoomFactor = 1.4;

    let targetW, targetH, targetOffsetX, targetOffsetY;
    if (imgRatio > screenRatio) {
      targetH = height * zoomFactor;
      targetW = imgRatio * targetH;
      targetOffsetX = (width - targetW) / 2;
      targetOffsetY = (height - targetH) / 2;
    } else {
      targetW = width * zoomFactor;
      targetH = targetW / imgRatio;
      targetOffsetX = (width - targetW) / 2;
      targetOffsetY = (height - targetH) / 2;
    }

    const startX = fullscreenStartPos.x;
    const startY = fullscreenStartPos.y;
    const startR = fullscreenStartPos.r;
    const startW = startR * 2;
    const startH = startR * 2;
    const startOffsetX = startX - startR;
    const startOffsetY = startY - startR;

    let currentW = isExiting ? lerp(startW, targetW, anim)
                             : lerp(startW, targetW, easedAnim);
    let currentH = isExiting ? lerp(startH, targetH, anim)
                             : lerp(startH, targetH, easedAnim);
    let currentOffsetX = isExiting ? lerp(startOffsetX, targetOffsetX, anim)
                                   : lerp(startOffsetX, targetOffsetX, easedAnim);
    let currentOffsetY = isExiting ? lerp(startOffsetY, targetOffsetY, anim)
                                   : lerp(startOffsetY, targetOffsetY, easedAnim);

    if (!isExiting && fullscreenAnim > 0.99) {
      currentOffsetX += fullscreenImageOffset.x;
      currentOffsetY += fullscreenImageOffset.y;

      const minOffsetX = width - currentW;
      const maxOffsetX = 0;
      const minOffsetY = height - currentH;
      const maxOffsetY = 0;

      currentOffsetX = clamp(currentOffsetX, minOffsetX, maxOffsetX);
      currentOffsetY = clamp(currentOffsetY, minOffsetY, maxOffsetY);
    }

    return { x: currentOffsetX, y: currentOffsetY, w: currentW, h: currentH };
  } else {
    // 이미지 없는 fallback 버블
    const bubbleStartR = fullscreenStartPos.r;
    const bubbleTargetR = min(width, height) * 0.38;
    const bubbleR = lerp(
      isExiting ? bubbleTargetR : bubbleStartR,
      isExiting ? bubbleStartR : bubbleTargetR,
      easedAnim
    );
    const cx = width * 0.5;
    const cy = height * 0.5;
    const bubbleCurrentX = lerp(
      isExiting ? cx : fullscreenStartPos.x,
      isExiting ? fullscreenStartPos.x : cx,
      easedAnim
    );
    const bubbleCurrentY = lerp(
      isExiting ? cy : fullscreenStartPos.y,
      isExiting ? fullscreenStartPos.y : cy,
      easedAnim
    );

    return {
      x: bubbleCurrentX - bubbleR,
      y: bubbleCurrentY - bubbleR,
      w: bubbleR * 2,
      h: bubbleR * 2,
    };
  }
}

function resetToInitialView() {
  // 카메라를 그리드 중심으로 리셋 (익스플로어와 동일)
  if (bubbleManager && panController) {
    const centerPos = bubbleManager.getCenterHexPosition();
    panController.snapTargetX = centerPos.x;
    panController.snapTargetY = centerPos.y;
    panController.velX = 0;
    panController.velY = 0;
  }

  clearSelectedTagState();

  // 이미지 드래그 오프셋 초기화
  fullscreenImageOffset.x = 0;
  fullscreenImageOffset.y = 0;
  fullscreenImageDragging = false;

  showInstructionText = true;
}

function updateFullscreen() {
  if (fullscreenExitAnim > 0) {
    // 나가는 애니메이션 (1 -> 0) - 더 부드럽고 천천히
    fullscreenExitAnim -= 0.05; // 속도를 더 느리게 조정
    if (fullscreenExitAnim <= 0) {
      fullscreenExitAnim = 0;
      
      // 현재 버블의 위치로 카메라 이동
      if (bubbles && fullscreenIndex >= 0 && fullscreenIndex < bubbles.length && bubbleManager && panController) {
        const currentBubble = bubbles[fullscreenIndex];
        if (currentBubble) {
          // 현재 버블의 월드 좌표로 카메라 이동
          const bubbleWorldX = currentBubble.x;
          const bubbleWorldY = currentBubble.y;
          
          // 현재 카메라 위치에서 가장 가까운 torus wrap된 타겟 위치 계산
          const currentCamX = panController.camX;
          const currentCamY = panController.camY;
          
          // wrapDelta를 사용하여 가장 가까운 타겟 위치 찾기
          const targetX = currentCamX + wrapDelta(bubbleWorldX - currentCamX, bubbleManager.worldW);
          const targetY = currentCamY + wrapDelta(bubbleWorldY - currentCamY, bubbleManager.worldH);
          
          // 부드럽게 이동하기 위해 스냅 타겟 설정
          panController.snapTargetX = targetX;
          panController.snapTargetY = targetY;
          panController.velX = 0;
          panController.velY = 0;
        }
      }
      
      // 애니메이션 완료 후 모드 전환
      mode = 0;
      const savedIndex = fullscreenIndex; // 인덱스 저장
      fullscreenIndex = -1;
      fullscreenAnim = 0;
      fullscreenTagLayout = [];

      // 초기 상태 리셋 (카메라 이동은 위에서 처리)
      clearSelectedTagState();
      fullscreenImageOffset.x = 0;
      fullscreenImageOffset.y = 0;
      fullscreenImageDragging = false;
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
  
  // ✅ 확대 모드에 있는 이미지는 항상 visible로 표시 (GC 방지)
  if (b.imgPath && imageLoader) {
    imageLoader.markVisible(b.imgPath);
  }
  
  // 이미지 렌더링 위치 계산 (공통 함수 사용)
  const finalImageRect = getFullscreenImageRect();
  
  if (img && img.width > 0 && finalImageRect) {
    push();
    drawingContext.save();
    // 이미지 화질 개선
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    drawingContext.globalAlpha = anim;
    
    // 나갈 때는 동그란 모양으로 클리핑
    if (isExiting) {
      // 원의 중심 (이미지의 중심)
      const circleCenterX = finalImageRect.x + finalImageRect.w * 0.5;
      const circleCenterY = finalImageRect.y + finalImageRect.h * 0.5;
      // 원의 반지름 (이미지의 작은 쪽에 맞춤)
      const circleRadius = Math.min(finalImageRect.w, finalImageRect.h) * 0.5;
      
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
    image(img, finalImageRect.x, finalImageRect.y, finalImageRect.w, finalImageRect.h);
    
    drawingContext.restore();
    pop();
    
  } else if (finalImageRect) {
    // 이미지가 없으면 기본 버블 표시
    const bubbleR = finalImageRect.w * 0.5;
    const bubbleCurrentX = finalImageRect.x + bubbleR;
    const bubbleCurrentY = finalImageRect.y + bubbleR;
    
    push();
    translate(bubbleCurrentX, bubbleCurrentY);
    tint(255, 255 * anim);
    const sprite = spriteCache.getCircle(spriteCache.bucketSize(bubbleR), true);
    imageMode(CENTER);
    image(sprite, 0, 0, bubbleR * 2, bubbleR * 2);
    noTint();
    pop();
  }

  // 태그 표시 (랜덤 배치) - 순차적으로 나타나도록
  const tagThreshold = isExiting ? 0.7 : 0.3; // 들어갈 때는 더 일찍 시작 (0.3)
  if (fullscreenTagLayout.length > 0 && anim > tagThreshold) {
    // 나갈 때는 태그 알파를 더 빠르게 감소, 들어갈 때는 전체 애니메이션 진행도 전달
    const tagAlpha = isExiting ? (anim - tagThreshold) / (1 - tagThreshold) : anim;
    
    // 이미지 렌더링 위치를 태그에도 사용 (동일한 오프셋 보장)
    drawFullscreenTags(tagAlpha, isExiting, finalImageRect);
  }
  
  // 연관 버블 표시 (태그가 선택되었을 때만)
  if (selectedTag !== null && recommendedBubbles.length > 0 && anim > 0.5) {
    // 어두운 오버레이 추가
    const overlayAlpha = recommendedBubblesAnim * 0.6; // 추천 버블 애니메이션과 동기화
    push();
    fill(0, overlayAlpha * 255);
    rect(0, 0, width, height);
    pop();
    
    drawRecommendedBubbles(anim, isExiting);
  }

  // 하트 버튼 (좋아요) - 풀스크린 모드에서만 표시
  if (fullscreenIndex >= 0) {
    drawHeartButton(anim);
    
    // 하트 버튼을 누르기 전까지 안내 텍스트 표시
    const currentBubbleIsFavorite = favoriteBubbles.includes(fullscreenIndex);
    if (!currentBubbleIsFavorite && !dragging && anim > 0.5) {
      drawFullscreenInstructionText(anim);
    }
  }

  // VR모드 나가기 버튼 (가운데 위쪽) - 가장 앞쪽 레이어에 표시
  drawVRExitButton(anim);
}

function clearSelectedTagState() {
  selectedTag = null;
  recommendedBubbles.length = 0;
  recommendedHitboxes.length = 0;
  recommendedBubblesAnim = 0;
}

function selectTag(tag) {
  if (!tag) return;

  if (selectedTag === tag) {
    // 같은 태그 다시 누르면 추천 숨김
    clearSelectedTagState();
    return;
  }

  selectedTag = tag;
  computeRecommendedBubbles(tag);
  
  // 추천 버블 이미지 미리 로딩 요청
  if (imageLoader && recommendedBubbles.length > 0) {
    for (let i = 0; i < recommendedBubbles.length; i++) {
      const b = recommendedBubbles[i].bubble;
      if (b && b.imgPath) {
        imageLoader.request(b.imgPath, true);
        imageLoader.markVisible(b.imgPath);
      }
    }
  }
  
  recommendedBubblesAnim = 0;
  lastActiveTime = millis();
}

function computeRecommendedBubbles(tag) {
  recommendedBubbles.length = 0;
  recommendedHitboxes.length = 0;
  if (!bubbles || bubbleCount === 0 || fullscreenIndex < 0) return;

  const curr = bubbles[fullscreenIndex];
  const currTags = (curr && curr.tags) ? curr.tags : [];
  const cand = tagIndexMap[tag] || [];

  // top-3 유지 (작은 삽입 정렬)
  const topIdx = [-1, -1, -1];
  const topScore = [-1, -1, -1];

  for (let k = 0; k < cand.length; k++) {
    const ci = cand[k];
    if (ci === fullscreenIndex) continue;
    const cb = bubbles[ci];
    if (!cb) continue;

    // 유사도: 현재 버블과 태그 겹침 수
    let s = 0;
    const ctags = cb.tags || [];
    for (let a = 0; a < ctags.length; a++) {
      const t = ctags[a];
      for (let bti = 0; bti < currTags.length; bti++) {
        if (t === currTags[bti]) { s++; break; }
      }
    }
    if (s === 0) s = 0.1; // 최소 점수

    for (let pos = 0; pos < RECO_COUNT; pos++) {
      if (s > topScore[pos]) {
        for (let sh = RECO_COUNT - 1; sh > pos; sh--) {
          topScore[sh] = topScore[sh - 1];
          topIdx[sh] = topIdx[sh - 1];
        }
        topScore[pos] = s;
        topIdx[pos] = ci;
        break;
      }
    }
  }

  for (let i = 0; i < RECO_COUNT; i++) {
    if (topIdx[i] !== -1 && bubbles[topIdx[i]]) {
      recommendedBubbles.push({ index: topIdx[i], bubble: bubbles[topIdx[i]] });
    }
  }

  // 3개가 안 채워지면 주변에서 채움(결정적 규칙)
  if (recommendedBubbles.length < RECO_COUNT) {
    let step = 13, tries = 0, seed = fullscreenIndex + 7;
    while (recommendedBubbles.length < RECO_COUNT && tries < bubbleCount) {
      const idx = (seed + tries * step) % bubbleCount;
      if (idx !== fullscreenIndex && bubbles[idx]) {
        let exists = false;
        for (let r = 0; r < recommendedBubbles.length; r++) {
          if (recommendedBubbles[r].index === idx) { exists = true; break; }
        }
        if (!exists) recommendedBubbles.push({ index: idx, bubble: bubbles[idx] });
      }
      tries++;
    }
  }
}

function drawRecommendedBubbles(anim, isExiting = false) {
  if (!recommendedBubbles || recommendedBubbles.length === 0) return;

  const s = getResponsiveScale();
  const n = recommendedBubbles.length;

  // 등장 애니메이션
  if (!isExiting) {
    recommendedBubblesAnim += (1 - recommendedBubblesAnim) * 0.12;
  }
  const a = isExiting ? anim : (recommendedBubblesAnim * anim);

  const baseY = height - 170 * s;
  const gap = 170 * s;

  // ✅ 고정 반지름 (화면 비율만 반영)
  const fixedR = RECOMM_BUBBLE_CONFIG.radius * s;

  const startX = width * 0.5 - gap * (n - 1) * 0.5;

  recommendedHitboxes.length = n;

  push();
  for (let i = 0; i < n; i++) {
    const rec = recommendedBubbles[i];
    const b = rec.bubble;
    if (!b) continue;

    const x = startX + i * gap;
    const y = baseY;

    // 이미지 요청 (지연 로딩)
    if (b.imgPath && imageLoader) {
      imageLoader.request(b.imgPath, true);
      imageLoader.markVisible(b.imgPath);
    }

    // ✅ 원래 상태 백업
    const prevAlpha = b.alpha;
    const prevIsCenter = b.isCenter;
    const prevDisplayR = b.displayR;

    // ✅ 추천 버블은 완전 고정 크기 & 후광 없음
    b.alpha = a;
    b.displayR = fixedR;
    b.isCenter = false;

    b.drawAt(x, y);

    // ✅ 원래 상태 복구
    b.alpha = prevAlpha;
    b.isCenter = prevIsCenter;
    b.displayR = prevDisplayR;

    // ✅ 히트박스도 고정 반지름 기준
    recommendedHitboxes[i] = { x, y, r: fixedR, index: rec.index };
  }
  pop();

  // 이미지 로더 업데이트
  if (imageLoader) {
    imageLoader.update(performance.now());
  }

  // 아래 LED 텍스트 부분은 기존 코드 그대로 유지
  if (selectedTag && a > 0.1) {
    const textY = baseY - fixedR - 40 * s - 20;
    const particle = getKoreanParticle(selectedTag);
    const tagText = `#${selectedTag}${particle} 유사한 레퍼런스를 가져왔어요`;

    const pulseTime = millis() * 0.001;
    const pulse = (Math.sin(pulseTime * 2) + 1) * 0.5;
    const textAlpha = a * (0.7 + pulse * 0.3);

    push();
    const ctx = drawingContext;
    ctx.save();

    textAlign(CENTER, CENTER);
    textSize(30 * s);
    if (fontPretendard) textFont(fontPretendard);

    ctx.shadowBlur = 15;
    ctx.shadowColor = `rgba(255, 255, 255, ${textAlpha * 0.3})`;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    fill(255, 255, 255, textAlpha * 0.2 * 255);
    text(tagText, width / 2, textY);

    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(255, 255, 255, ${textAlpha * 0.5})`;
    fill(255, 255, 255, textAlpha * 0.4 * 255);
    text(tagText, width / 2, textY);

    ctx.shadowBlur = 8;
    ctx.shadowColor = `rgba(255, 255, 255, ${textAlpha * 0.8})`;
    fill(255, 255, 255, textAlpha * 255);
    text(tagText, width / 2, textY);

    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.restore();
    pop();
  }
}

// 원 안에 점이 있는지 확인하는 헬퍼 함수

function checkRecommendedBubbleClick(x, y) {
  if (!recommendedHitboxes || recommendedHitboxes.length === 0) return -1;

  for (let i = 0; i < recommendedHitboxes.length; i++) {
    const hb = recommendedHitboxes[i];
    if (pointInCircle(x, y, hb.x, hb.y, hb.r)) {
      return hb.index;
    }
  }
  return -1;
}

// 하트 버튼 그리기 (풀스크린 모드) - VR 나가기 버튼 옆에 배치
function drawHeartButton(anim) {
  const responsiveScale = getResponsiveScale();
  const buttonSize = 60 * responsiveScale;
  
  // VR 나가기 버튼 위치 계산 (drawVRExitButton과 동일한 로직)
  const centerX = width / 2;
  const topY = 60 * responsiveScale;
  const fontSize = 16 * 1.4 * responsiveScale * 1.3;
  const padding = 28 * responsiveScale * 1.3;
  const tagH = 56 * responsiveScale * 1.3;
  
  textSize(fontSize);
  if (fontPretendard) textFont(fontPretendard);
  textStyle(BOLD);
  const buttonText = "<   VR모드 나가기";
  const textW = textWidth(buttonText);
  const vrButtonWidth = textW + padding * 2;
  const vrButtonX = centerX - vrButtonWidth / 2;
  
  // VR 나가기 버튼 바로 옆에 배치
  const buttonX = vrButtonX + vrButtonWidth + 15 * responsiveScale; // 15px 간격
  const buttonY = topY + 4; // 2픽셀 아래로
  
  const isFavorite = favoriteBubbles.includes(fullscreenIndex);
  const heartStyle = isFavorite ? "favorite" : "favorite_idle";

  // 태그와 동일한 글래스모피즘 적용 (단일 컴포넌트)
  drawGlassLabelFullscreen(buttonX, buttonY, buttonSize, buttonSize, buttonSize / 2, anim, heartStyle);
  
  // 하트 아이콘 (간단한 텍스트로 표현)
  push();
  textAlign(CENTER, CENTER);
  textSize(30 * responsiveScale);
  if (fontPretendard) textFont(fontPretendard);
  fill(isFavorite ? color(255, 255, 255, 255 * anim) : color(255, 255, 255, 220 * anim));
  const heartSymbol = isFavorite ? "♥" : "♡";
  text(heartSymbol, buttonX + buttonSize / 2, buttonY + buttonSize / 2 - 1); // 1픽셀 위로
  pop();
  
  // 히트박스 저장 (태블릿 터치 감도 개선: 클릭 영역 약간 확대)
  const hitboxPadding = 5 * responsiveScale; // 5px 여유 공간 추가
  uiHitboxes.push({
    id: "heart_button",
    x: buttonX - hitboxPadding,
    y: buttonY - hitboxPadding,
    w: buttonSize + hitboxPadding * 2,
    h: buttonSize + hitboxPadding * 2
  });
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
    // 비주얼 태그: 붉은 빛 (더 진하게)
    tintColor = { r: 255, g: 150, b: 150, alpha: 0.2 }; // 진한 핑크 틴트
  } else if (tagType === "emotional") {
    // 감정 태그: 초록빛 (더 진하게)
    tintColor = { r: 150, g: 255, b: 150, alpha: 0.2 }; // 진한 초록 틴트
  } else if (tagType === "favorite") {
    // 선택된 하트: 따뜻한 핑크 틴트
    tintColor = { r: 255, g: 140, b: 180, alpha: 0.25 };
  } else if (tagType === "favorite_idle") {
    // 비선택 하트: 기본 글래스에 은은한 화이트 틴트
    tintColor = { r: 255, g: 255, b: 255, alpha: 0.05 };
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

  // 배경 이미지 가져오기 (확대 모드일 때는 확대된 이미지, 아니면 기본 배경)
  const b = bubbles && fullscreenIndex >= 0 ? bubbles[fullscreenIndex] : null;
  const img = b && b.imgPath && imageLoader ? imageLoader.get(b.imgPath) : null;
  
  if (img && img.width > 0 && mode === 1) {
    // 확대 모드: 확대된 이미지의 cover fit 계산 (drawFullscreen과 동일)
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

    // 유리감: 블러 + 채도↑ (반투명하게) - 블러 강화
    ctx.filter = "blur(18px) saturate(140%)";
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
  } else {
    // 분석 결과 화면 등: 기본 배경 이미지 사용
    const bgImg = uiImages["background"];
    if (bgImg && bgImg.width > 0) {
      ctx.filter = "blur(32px) saturate(140%)";
      ctx.globalAlpha = anim * 0.3;
      const cover = coverRect(bgImg.width, bgImg.height, width, height);
      ctx.drawImage(
        bgImg.canvas || bgImg.elt,
        0, 0, bgImg.width, bgImg.height,
        cover.x, cover.y, cover.w, cover.h
      );
      ctx.filter = "none";
    }
  }

  // 3) 미묘한 어두운 오버레이 (반투명 효과) - 더 어둡게 처리하여 배경이 잘 안 보이도록
  ctx.globalAlpha = anim;
  ctx.fillStyle = "rgba(0,0,0,0.50)"; // 30%에서 50%로 증가하여 배경이 더 잘 안 보이도록
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
function drawFullscreenTags(anim, isExiting = false, imageRect = null) {
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
    
    // 태그 위치 계산: 이미지 좌표계를 화면 좌표계로 변환
    // 태그 레이아웃은 이미지 좌표계로 저장되어 있음 (이미지의 중앙이 (0, 0))
    let screenX, screenY;
    
    if (imageRect && !isExiting) {
      // 이미지 좌표계를 화면 좌표계로 변환
      // 이미지의 중앙이 (0, 0)이므로, 이미지의 실제 렌더링 위치를 기준으로 변환
      screenX = imageRect.x + imageRect.w / 2 + L.x;
      screenY = imageRect.y + imageRect.h / 2 + L.baseY;
    } else {
      // 애니메이션 중이거나 나갈 때는 기존 방식 사용
      screenX = L.x;
      screenY = L.baseY;
    }
    
    // 부드러운 떠다니는 애니메이션
    const floatY = Math.sin(t + idx) * 3 * getResponsiveScale();
    const y = screenY + floatY;
    
    const rectX = screenX - L.w / 2;
    const rectY = y - L.h / 2;
    const rectRight = rectX + L.w;
    const rectBottom = rectY + L.h;
    
    // 화면 경계 체크: 화면 안에 완전히 들어온 태그만 그리기 (경계에 걸친 것은 제외)
    if (imageRect && !isExiting) {
      if (rectX < 0 || rectRight > width || rectY < 0 || rectBottom > height) {
        return; // 화면 경계에 걸치거나 화면 밖에 있으면 스킵
      }
    }
    
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
    // 세미볼드 스타일로 한 번만 그리기 (이미지 좌표계 기준)
    text(L.label, screenX, textY);
    drawingContext.shadowBlur = 0;
    drawingContext.restore();
    pop();
  });
}

function drawUI() {
  // ✅ 일반 모드 hitbox 누적 방지
  uiHitboxes.length = 0;
  // UI 요소 제거됨 (네비게이션 바, 카메라 버튼, 작업대 버튼)
}

// LED 안내문 텍스트 한 줄을 그리는 공통 헬퍼
function drawLedTextLine(textStr, y, baseAlpha = 1, scale = null) {
  const responsiveScale = scale || getResponsiveScale();

  instructionPulseTime += 0.05;
  const pulse = (Math.sin(instructionPulseTime) + 1) * 0.5;
  const alpha = (0.3 + pulse * 0.7) * baseAlpha;

  const ctx = drawingContext;
  push();
  ctx.save();

  textAlign(CENTER, CENTER);
  textSize(24 * responsiveScale);
  if (fontPretendard) textFont(fontPretendard);

  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.shadowBlur = 15;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.3})`;
  fill(255, 255, 255, alpha * 0.2 * 255);
  text(textStr, width / 2, y);

  ctx.shadowBlur = 10;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.5})`;
  fill(255, 255, 255, alpha * 0.4 * 255);
  text(textStr, width / 2, y);

  ctx.shadowBlur = 8;
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.8})`;
  fill(255, 255, 255, alpha * 255);
  text(textStr, width / 2, y);

  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  ctx.restore();
  pop();
}

// 안내 텍스트 그리기 (LED 깜빡임 효과)
function drawInstructionText() {
  const responsiveScale = getResponsiveScale();
  const textY = height / 2 + 30 * responsiveScale - 150 - height * 0.05;

  drawLedTextLine(
    "버블을 터트려 채집했던 그 순간의 감각을 다시 느껴보세요.",
    textY,
    1,
    responsiveScale
  );
}

// 풀스크린 모드 안내 텍스트 그리기 (LED 깜빡임 효과)
function drawFullscreenInstructionText(anim) {
  const responsiveScale = getResponsiveScale();
  const topY = 60 * responsiveScale;
  const tagH = 56 * responsiveScale * 1.3;
  const textY = topY + tagH + 40 * responsiveScale;

  drawLedTextLine(
    "좋아하는 사진에는 하트를 눌러 내 감각을 분석해보세요.",
    textY,
    anim,
    responsiveScale
  );
}

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

  // 온보딩 화면 처리
  if (mode === 4) {
    // 이름 입력 후 1초간 터치 입력 차단
    if (millis() < onboardingInputBlockUntil) {
      pointerDown = false;
      pointerId = -1;
      return;
    }
    
    return;
  }

  // 이름 입력 모달 또는 분석 결과 화면에서 UI 클릭 처리
  if (mode === 2 || mode === 3) {
    const hit = hitTestUI(x, y);
    if (hit) {
      handleUI(hit);
      pointerDown = false;
      pointerId = -1;
      return;
    }
    // 모달 외부 클릭은 무시
    pointerDown = false;
    pointerId = -1;
    return;
  }
  
  // 일반 모드에서 감각 알아보기 버튼 클릭 처리
  if (mode === 0) {
    const hit = hitTestUI(x, y);
    if (hit === "taste_analysis") {
      handleUI(hit);
      pointerDown = false;
      pointerId = -1;
      return;
    }
  }

  // UI hit test (풀스크린 모드에서도 작동)
  // 단, 하트 버튼은 pointerEnd에서 처리하도록 pointerDown 유지
  const hit = hitTestUI(x, y);
  if (hit) {
    // 하트 버튼은 pointerEnd에서 처리하도록 pointerDown 유지
    // (태블릿 터치 감도 문제 해결)
    if (hit === "heart_button" && mode === 1) {
      // pointerDown은 유지하여 pointerEnd에서 처리
      // dragMode를 특별한 값으로 설정하여 드래그로 인식되지 않도록 함
      dragMode = 4; // 하트 버튼 클릭 모드
      return;
    }
    handleUI(hit);
    pointerDown = false;
    pointerId = -1;
    return;
  }

  // 풀스크린 모드일 때는 이미지 드래그 모드 설정
  if (mode === 1) {
    // UI 요소(태그, 버튼)가 아닌 경우 이미지 드래그 모드
    fullscreenImageDragStart.x = x;
    fullscreenImageDragStart.y = y;
    fullscreenImageDragging = false;
    dragMode = 3; // VR 이미지 드래그 모드
    // pointerDown은 true로 유지하여 pointerEnd에서 태그 클릭 처리 가능하도록
    return;
  }

  // 그리드 레이아웃 모드: 버블 클릭 감지 (익스플로어와 동일)
  const hitBubble = hitTestGridBubble(x, y);
  
  if (hitBubble !== -1) {
    clickedBubbleAtPress = hitBubble;
  }
  
  // 패닝 시작 (익스플로어와 동일)
  if (panController) {
    panController.onDown();
  }
  dragMode = 1;

  lastActiveTime = millis();
}

function pointerMove(x, y) {
  if (!pointerDown) return;
  
  // 좌표 유효성 체크
  if (isNaN(x) || isNaN(y)) return;

  // 온보딩 화면에서는 move 이벤트 무시 (스와이프 없음)
  if (mode === 4) {
    lastX = x;
    lastY = y;
    return;
  }

  const dx = x - lastX;
  const dy = y - lastY;

  // 하트 버튼 클릭 모드일 때는 드래그로 인식하지 않음
  if (dragMode !== 4) {
    if (!dragging) {
      const d2 = (x - downX) * (x - downX) + (y - downY) * (y - downY);
      if (d2 > INTERACT.dragDeadzone * INTERACT.dragDeadzone) {
        dragging = true;
      }
    }
  }

  if (dragging) {
    if (dragMode === 1 && panController) {
      // 그리드 패닝 (익스플로어와 동일)
      const dx = x - lastX;
      const dy = y - lastY;
      panController.onDrag(dx, dy);
      lastActiveTime = millis();
    } else if (dragMode === 3) {
      // VR 모드 이미지 드래그
      if (!fullscreenImageDragging) {
        fullscreenImageDragging = true;
      }
      const dragDx = x - fullscreenImageDragStart.x;
      const dragDy = y - fullscreenImageDragStart.y;
      fullscreenImageOffset.x += dragDx;
      fullscreenImageOffset.y += dragDy;
      fullscreenImageDragStart.x = x;
      fullscreenImageDragStart.y = y;
      lastActiveTime = millis();
    }
  }

  lastX = x; lastY = y;
}

function checkTagClick(x, y) {
  // 1) VR 나가기 버튼 (uiHitboxes에 vr_exit 저장됨)
  for (let i = 0; i < uiHitboxes.length; i++) {
    const hb = uiHitboxes[i];
    if (hb.id === "vr_exit") {
      if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
        return "VR_EXIT";
      }
    }
  }

  // 2) 태그들 (이미지 좌표계 기준)
  if (!fullscreenTagLayout || mode !== 1) return null;
  
  // 이미지 크기와 위치 계산 (공통 함수 사용)
  const imageRect = getFullscreenImageRect();
  const isExiting = fullscreenExitAnim > 0;
  
  // 떠다니는 애니메이션 시간 (drawFullscreenTags와 동일)
  const t = millis() * 0.001;
  
  for (let i = 0; i < fullscreenTagLayout.length; i++) {
    const L = fullscreenTagLayout[i];
    
    // 태그 위치 계산 (drawFullscreenTags와 정확히 동일한 로직)
    let screenX, screenY;
    
    if (imageRect && !isExiting) {
      // 이미지 좌표계를 화면 좌표계로 변환
      screenX = imageRect.x + imageRect.w / 2 + L.x;
      screenY = imageRect.y + imageRect.h / 2 + L.baseY;
    } else {
      // 애니메이션 중이거나 나갈 때는 기존 방식 사용
      screenX = L.x;
      screenY = L.baseY;
    }
    
    // 부드러운 떠다니는 애니메이션 (drawFullscreenTags와 동일)
    const floatY = Math.sin(t + i) * 3 * getResponsiveScale();
    const currentY = screenY + floatY;
    
    // 태그의 실제 렌더링 위치와 정확히 동일하게 계산
    const rectX = screenX - L.w / 2;
    const rectY = currentY - L.h / 2;
    const rectRight = rectX + L.w;
    const rectBottom = rectY + L.h;
    
    // 태그 크기에 딱 맞춘 클릭 감지 (사각형 경계 정확히 체크)
    if (x >= rectX && x <= rectRight && y >= rectY && y <= rectBottom) {
      return L.tag;
    }
  }
  return null;
}

function pointerEnd(x, y) {
  // 좌표 유효성 체크
  if (isNaN(x) || isNaN(y)) {
    if (pointerDown) {
      pointerDown = false;
      pointerId = -1;
    }
    return;
  }
  
  // ✅ 온보딩 모드: 터치만으로 다음 페이지로 이동
  if (mode === 4) {
    // 이름 입력 후 1초간 터치 입력 차단
    if (millis() < onboardingInputBlockUntil) {
      if (pointerDown) {
        pointerDown = false;
        pointerId = -1;
      }
      return;
    }
    
    // 페이지 전환 후 0.7초 지연 확인
    const timeSinceLastPageChange = millis() - onboardingLastPageChangeTime;
    if (timeSinceLastPageChange < 700) {
      if (pointerDown) {
        pointerDown = false;
        pointerId = -1;
      }
      return;
    }
    
    // 단순히 터치하면 다음 페이지로 이동
    // 7번 페이지(마지막 페이지)에서 터치하면 이름 입력 모달로 이동
    if (onboardingCurrentPage === onboardingImages.length - 1) {
      // 마지막 페이지에서 터치하면 이름 입력 모달로 전환
      mode = 2;
      if (nameInputElement) {
        nameInputElement.style("display", "block");
        nameInputElement.elt.focus();
      }
    } else if (onboardingCurrentPage < onboardingImages.length - 1) {
      // 마지막 페이지가 아니면 다음 페이지로 이동
      onboardingTargetPage = onboardingCurrentPage + 1;
      onboardingAnimFromOffset = 0;
      onboardingAnimProgress = 0;
      onboardingIsAnimating = true;
      onboardingOffsetX = 0;
    }
    
    if (pointerDown) {
      pointerDown = false;
      pointerId = -1;
    }
    return;
  }
  
  // 전체 화면 모드에서 하트 버튼 클릭 확인
  // dragMode가 4이면 하트 버튼 클릭 모드로 인식
  if (mode === 1 && dragMode === 4) {
    const hit = hitTestUI(x, y);
    if (hit === "heart_button") {
      toggleFavoriteBubble();
      pointerDown = false;
      pointerId = -1;
      dragMode = 0;
      return;
    }
  }
  
  // pointerDown 체크 전에 하트 버튼을 다시 확인 (dragMode가 설정되지 않은 경우 대비)
  if (mode === 1 && pointerDown) {
    const hit = hitTestUI(x, y);
    if (hit === "heart_button") {
      // 약간의 움직임이 있어도 하트 버튼은 클릭 가능하도록
      const dt = millis() - lastT;
      const dx = x - downX;
      const dy = y - downY;
      const movedTooMuch = dx * dx + dy * dy > INTERACT.tapMoveThreshold * INTERACT.tapMoveThreshold;
      const isHeartTap = dt < INTERACT.tapTimeThreshold && !movedTooMuch && !dragging;
      if (isHeartTap) {
        toggleFavoriteBubble();
        pointerDown = false;
        pointerId = -1;
        dragMode = 0;
        return;
      }
    }
  }
  
  if (!pointerDown) return;
  
  // 드래그 vs 탭 구분
  const dt = millis() - lastT;
  const dx = x - downX;
  const dy = y - downY;
  const movedTooMuch = dx * dx + dy * dy > INTERACT.tapMoveThreshold * INTERACT.tapMoveThreshold;
  const isTap = dt < INTERACT.tapTimeThreshold && !movedTooMuch && !dragging;
  
  pointerDown = false;
  pointerId = -1;

  // 전체 화면 모드에서 태그/연관 버블 클릭 처리
  if (mode === 1) {
    
    // 탭으로 판정된 경우에만 다른 클릭 처리
    if (isTap) {
      // VR 나가기 버튼 클릭 확인
      const clickedTag = checkTagClick(x, y);
      if (clickedTag === "VR_EXIT") {
        exitFullscreen();
        return;
      }
      
      // ✅ 추천 버블 클릭을 먼저 확인 (태그보다 우선순위 높음)
      const clickedBubbleIdx = checkRecommendedBubbleClick(x, y);
      if (clickedBubbleIdx !== -1) {
        // 선택된 연관 버블로 이동
        enterFullscreen(clickedBubbleIdx);
        return;
      }
      
      // 태그 클릭 확인 (추천 버블이 클릭되지 않았을 때만)
      if (clickedTag !== null) {
        selectTag(clickedTag);
        return;
      }

      // 추천 레이어 표시 중 배경을 탭하면 해제
      if (selectedTag !== null && clickedTag === null) {
        clearSelectedTagState();
        return;
      }
    }
  }
  
  // 이름 입력 모달 또는 분석 결과 화면에서 클릭 처리
  if (mode === 2 || mode === 3) {
    if (isTap) {
      const hit = hitTestUI(x, y);
      if (hit) {
        handleUI(hit);
        return;
      }
    }
  }
  
  // 일반 모드에서 감각 알아보기 버튼 클릭
  if (mode === 0 && isTap) {
    const hit = hitTestUI(x, y);
    if (hit === "taste_analysis") {
      handleUI(hit);
      return;
    }
  }

  // 그리드 레이아웃 모드: 버블 클릭 처리 (익스플로어와 동일)
  if (dragMode === 1) {
    if (panController) {
      panController.onUp();
    }
    
    // 드래그가 없었고, 버블을 클릭했으면 확대
    const totalDragDistance = Math.sqrt((x - downX) * (x - downX) + (y - downY) * (y - downY));
    const DRAG_THRESHOLD = 10;
    if (!dragging && clickedBubbleAtPress !== null && clickedBubbleAtPress !== -1) {
      enterFullscreen(clickedBubbleAtPress);
    }
    
    clickedBubbleAtPress = null;
  } else {
    // 다른 모드에서도 버블 클릭 감지
    if (!dragging && mode === 0) {
      const hitIdx = hitTestGridBubble(x, y);
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

  // 좌표 변환 헬퍼 함수 (태블릿 지원 개선, 기기별 픽셀 밀도 고려)
  function getCanvasCoords(e) {
    const rect = c.getBoundingClientRect();
    // devicePixelRatio 고려 (아이패드 엠포 등 고해상도 기기 대응)
    const dpr = window.devicePixelRatio || 1;
    // 실제 캔버스 크기와 논리적 크기의 비율 계산
    // p5.js는 이미 devicePixelRatio를 고려하므로 rect.width/height를 그대로 사용
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

    // 캔버스의 실제 렌더 영역
    const rect = c.getBoundingClientRect();

    // 캔버스 안쪽이면 캔버스 이벤트에 맡기고 패스
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      return;
    }

    // ✅ 캔버스 밖에서도 동일한 스케일/클램핑 로직 사용
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const clampedX = Math.max(0, Math.min(width, x));
    const clampedY = Math.max(0, Math.min(height, y));

    pointerMove(clampedX, clampedY);
  };

  const handleDocumentPointerUp = (e) => {
    if (!pointerDown || e.pointerId !== pointerId) return;

    const rect = c.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const clampedX = Math.max(0, Math.min(width, x));
    const clampedY = Math.max(0, Math.min(height, y));

    pointerEnd(clampedX, clampedY);
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
    // 풀스크린 모드
    if (id === "back_full" || id === "vr_exit") {
      exitFullscreen();
    } else if (id === "heart_button") {
      // 하트 버튼 클릭
      toggleFavoriteBubble();
    }
    return;
  } else if (mode === 4) {
    // 온보딩 화면 (시작하기 버튼은 더 이상 사용하지 않음)
    return;
  } else if (mode === 2) {
    // 이름 입력 모달
    if (id === "name_input") {
      // input 요소에 포커스
      if (nameInputElement) {
        nameInputElement.elt.focus();
      }
    } else if (id === "name_confirm") {
      confirmNameInput();
    } else if (id === "name_skip") {
      skipNameInput();
    }
    return;
  } else if (mode === 3) {
    // 분석 결과 화면
    if (id === "restart") {
      // 다시 시작
      userName = "";
      favoriteBubbles = [];
      analysisResult = null;
      mode = 2; // 이름 입력 모달로
      if (nameInputElement) {
        nameInputElement.style("display", "block");
        nameInputElement.elt.focus();
      }
      resetToInitialView();
    }
    return;
  } else if (mode === 0) {
    // 일반 모드
    if (id === "taste_analysis") {
      // 감각 알아보기 버튼 클릭
      if (favoriteBubbles.length > 0) {
        analysisResult = analyzeFavoriteTags();
        mode = 3; // 분석 결과 화면으로
      } else {
        // 선택한 버블이 없으면 알림 (간단히 콘솔에만)
        console.log("먼저 하트 버튼으로 좋아하는 사진을 선택해주세요!");
      }
    }
    return;
  }
}

function enterFullscreen(idx) {
  fullscreenIndex = idx;
  fullscreenAnim = 0;
  fullscreenExitAnim = 0; // 들어갈 때는 0으로 초기화
  mode = 1;
  
  // 이미지 드래그 오프셋 초기화
  fullscreenImageOffset.x = 0;
  fullscreenImageOffset.y = 0;
  fullscreenImageDragging = false;
  
  // 선택된 태그와 연관 버블 초기화 (새 버블로 이동할 때)
  clearSelectedTagState();
  
  // 버블 터지는 소리 재생
  if (bubblePopSound && bubblePopSound.isLoaded()) {
    try {
      bubblePopSound.setVolume(0.5); // 볼륨 설정 (0.0 ~ 1.0)
      bubblePopSound.play();
    } catch (e) {
      console.warn("버블 터지는 소리 재생 실패:", e);
    }
  }
  
  // 버블의 원래 위치와 크기 저장 (익스플로어와 동일)
  const clickedBubble = bubbles && bubbles[idx] ? bubbles[idx] : null;
  if (clickedBubble && clickedBubble.displayX && clickedBubble.displayY) {
    fullscreenStartPos.x = clickedBubble.displayX;
    fullscreenStartPos.y = clickedBubble.displayY;
    fullscreenStartPos.r = clickedBubble.displayR || RENDER.baseBubbleRadius;
  } else {
    // 버블을 찾지 못한 경우 화면 중앙으로 설정
    fullscreenStartPos.x = width * 0.5;
    fullscreenStartPos.y = height * 0.5;
    fullscreenStartPos.r = RENDER.baseBubbleRadius;
  }
  
  // ✅ 확대 모드 진입 시 해당 버블이 화면 중앙에 오도록 카메라 이동
  if (clickedBubble && bubbleManager && panController) {
    const bubbleWorldX = clickedBubble.x;
    const bubbleWorldY = clickedBubble.y;
    
    // 현재 카메라 위치에서 가장 가까운 torus wrap된 타겟 위치 계산
    const currentCamX = panController.camX;
    const currentCamY = panController.camY;
    
    // wrapDelta를 사용하여 가장 가까운 타겟 위치 찾기
    const targetX = currentCamX + wrapDelta(bubbleWorldX - currentCamX, bubbleManager.worldW);
    const targetY = currentCamY + wrapDelta(bubbleWorldY - currentCamY, bubbleManager.worldH);
    
    // 즉시 카메라 위치 설정 (애니메이션 없이 바로 이동)
    panController.camX = targetX;
    panController.camY = targetY;
    panController.velX = 0;
    panController.velY = 0;
    panController.snapTargetX = null;
    panController.snapTargetY = null;
  }
  
  // 태그 레이아웃 생성 (이미지 크기 계산)
  const b = bubbles[idx];
  if (b) {
    const visualTags = b.visualTags || [];
    const emotionalTags = b.emotionalTags || [];
    const allTags = [
      ...visualTags,
      ...emotionalTags
    ];
    
    // 이미지 크기 계산 (drawFullscreen과 동일한 로직)
    const img = b.imgPath && imageLoader ? imageLoader.get(b.imgPath) : null;
    if (img && img.width > 0) {
      const imgRatio = img.width / img.height;
      const screenRatio = width / height;
      const zoomFactor = 1.4; // 기본 확대 배율 (40% 더 확대)
      
      let imageWidth, imageHeight;
      if (imgRatio > screenRatio) {
        // 이미지가 더 넓음 → 높이에 맞춰 확대 (좌우가 잘림) + 추가 확대
        imageHeight = height * zoomFactor;
        imageWidth = imgRatio * imageHeight;
      } else {
        // 이미지가 더 높음 → 너비에 맞춰 확대 (상하가 잘림) + 추가 확대
        imageWidth = width * zoomFactor;
        imageHeight = imageWidth / imgRatio;
      }
      
      fullscreenTagLayout = generateRandomTagLayout(allTags, imageWidth, imageHeight, visualTags, emotionalTags);
    } else {
      // 이미지가 없으면 기본 크기 사용
      const imageRadius = min(width, height) * 0.38;
      fullscreenTagLayout = generateRandomTagLayout(allTags, imageRadius * 2, imageRadius * 2, visualTags, emotionalTags);
    }
  }
  
  lastActiveTime = millis();
}

function exitFullscreen() {
  // 역방향 애니메이션 시작
  fullscreenExitAnim = 1;
  fullscreenAnim = 1; // 현재 상태 유지
  // 애니메이션이 완료되면 모드 전환 (updateFullscreen에서 처리)
  
  // 초기 상태로 리셋 (VR 모드 나가기 시)
  clearSelectedTagState();
  
  lastActiveTime = millis();
}

// 그리드 레이아웃에서 버블 클릭 감지 (익스플로어와 동일)
function hitTestGridBubble(x, y) {
  if (!bubbleManager || !bubbleManager.bubbles) return -1;

  // Y 좌표 기준으로 정렬 (뒤에서 앞으로)
  const sortedBubbles = bubbleManager.bubbles
    .slice()
    .filter(b => b.visible)
    .sort((a, b) => b.displayY - a.displayY);

  for (const b of sortedBubbles) {
    if (b.contains(x, y)) {
      return b.id;
    }
  }

  return -1;
}

// 아크 캐러셀 관련 함수 제거됨 (그리드 레이아웃 사용)

// 원본 스케치와 동일한 getResponsiveScale 함수

// 한글 조사 처리: 받침 유무에 따라 "와"/"과" 선택

// cover-fit 계산 헬퍼 (반복되는 cover 계산 통합)

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 익스플로어와 동일: 고해상도 디스플레이에서 픽셀 밀도 2배로 설정
  const isHiDpi = window.devicePixelRatio && window.devicePixelRatio > 1;
  pixelDensity(isHiDpi ? 2 : 1);
  recalcLayout(); // 익스플로어와 동일
  initBackground();
  
  // 이름 입력 input 요소는 CSS transform으로 중앙 고정되어 있어서 위치 업데이트 불필요
}

// 이름 입력 HTML input 요소 생성
function createNameInputElement() {
  // 기존 요소 있으면 제거
  if (nameInputElement) {
    try {
      nameInputElement.remove();
    } catch (e) {}
  }

  // p5 input 생성
  nameInputElement = createInput("");
  nameInputElement.attribute("placeholder", "");
  
  // 브라우저 확장 프로그램과의 충돌 방지 (Cursor 자동완성 등)
  nameInputElement.attribute("autocomplete", "off");
  nameInputElement.attribute("data-cursor-ignore", "true");
  nameInputElement.attribute("data-no-autofill", "true");
  nameInputElement.attribute("spellcheck", "false");

  // 기본 p5 스타일 제거용
  nameInputElement.addClass("gallery-name-input");

  // 실제 DOM 엘리먼트
  const el = nameInputElement.elt;
  
  // 추가 속성 설정 (확장 프로그램 충돌 방지)
  el.setAttribute("autocomplete", "off");
  el.setAttribute("data-cursor-ignore", "true");
  el.setAttribute("data-no-autofill", "true");
  el.setAttribute("spellcheck", "false");
  el.setAttribute("data-form-type", "other"); // 확장 프로그램이 폼으로 인식하지 않도록

  // 화면 중앙 고정 배치 (캔버스 전체 화면이니까 viewport 기준)
  el.style.position = "absolute";
  el.style.left = "50%";
  el.style.top = "50%";
  el.style.transform = "translate(-50%, -50%)";

  // 🔹 폭: 너무 길지 않게 고정 + 반응형
  el.style.width = "min(320px, 80vw)";  // 최대 320px, 너무 작은 화면은 80vw

  // 안쪽 여백 & 박스 정리
  el.style.padding = "12px 18px";
  el.style.boxSizing = "border-box";
  el.style.borderRadius = "999px";
  el.style.border = "1px solid rgba(255,255,255,0.4)";
  el.style.background = "rgba(0,0,0,0.45)";
  el.style.backdropFilter = "blur(12px)";
  el.style.outline = "none";

  // 🔹 텍스트 가운데 정렬
  el.style.textAlign = "center";

  // 폰트 맞추기 (Pretendard 기준)
  el.style.fontFamily = `"Pretendard Variable", Pretendard, -apple-system, system-ui, sans-serif`;
  el.style.fontSize = "16px";
  el.style.color = "#ffffff";

  // placeholder 색도 살짝 연하게
  el.style.setProperty("--placeholder-color", "rgba(255,255,255,0.5)");

  // p5에서 show/hide 컨트롤할 수 있도록 기본은 block
  nameInputElement.style("display", "block");
  
  // 엔터 키로 확인 (IME 조합 중 Enter 입력 대비)
  nameInputElement.elt.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    if (e.isComposing || e.keyCode === 229) {
      pendingNameConfirm = true; // 조합 종료 후 확인
      return;
    }
    e.preventDefault();
    requestAnimationFrame(() => confirmNameInput());
  });
  
  nameInputElement.elt.addEventListener("compositionend", () => {
    if (pendingNameConfirm) {
      pendingNameConfirm = false;
      confirmNameInput();
    }
  });
  
  // 포커스 이벤트 (에러 처리 추가)
  nameInputElement.elt.addEventListener("focus", (e) => {
    try {
      el.style.border = "1px solid rgba(255,255,255,0.8)";
    } catch (err) {
      // 확장 프로그램 충돌 시 무시
      console.warn("[Gallery] Focus 이벤트 처리 중 오류 (무시됨):", err);
    }
  }, { passive: true });
  
  nameInputElement.elt.addEventListener("blur", (e) => {
    try {
      el.style.border = "1px solid rgba(255,255,255,0.4)";
    } catch (err) {
      // 확장 프로그램 충돌 시 무시
      console.warn("[Gallery] Blur 이벤트 처리 중 오류 (무시됨):", err);
    }
  }, { passive: true });
  
  // 전역 에러 핸들러로 확장 프로그램 오류 무시
  const originalErrorHandler = window.onerror;
  window.addEventListener('error', (event) => {
    // Cursor 확장 프로그램 오류는 무시
    if (event.filename && event.filename.includes('content_script.js')) {
      event.preventDefault();
      return true;
    }
  }, true);
}

function getCurrentNameInputValue() {
  if (!nameInputElement) return "";
  const el = nameInputElement.elt;
  if (el && typeof el.value === "string") {
    return el.value;
  }
  if (typeof nameInputElement.value === "function") {
    return nameInputElement.value();
  }
  return "";
}

// 이름 입력 확인
function confirmNameInput() {
  pendingNameConfirm = false;
  const inputValue = getCurrentNameInputValue().trim();
  finalizeNameInput(inputValue.length > 0 ? inputValue : "사용자");
}

function skipNameInput() {
  finalizeNameInput("사용자");
}

function finalizeNameInput(finalName) {
  const resolvedName =
    finalName && finalName.trim().length > 0 ? finalName.trim() : "사용자";
  userName = resolvedName;
  if (nameInputElement) {
    nameInputElement.value("");
    nameInputElement.style("display", "none");
    if (nameInputElement.elt && typeof nameInputElement.elt.blur === "function") {
      nameInputElement.elt.blur();
    }
  }
  // 일반 모드로 전환 (온보딩은 이미 완료됨)
  mode = 0;
  // 이름 입력 후 1초간 터치 입력 차단
  onboardingInputBlockUntil = millis() + 1000;
}

// 이름 입력 모달 그리기
function drawNameInputModal() {
  const s = getResponsiveScale();
  
  // input 요소 표시/숨김 관리 (CSS transform으로 중앙 고정되어 있어서 위치 업데이트 불필요)
  if (nameInputElement) {
    nameInputElement.style("display", "block");
  }
  
  // 어두운 배경 오버레이
  push();
  fill(0, 0, 0, 200);
  rect(0, 0, width, height);
  pop();
  
  // 모달 박스 - 좌우로 더 길게
  const modalW = 820 * s; // 더 크게 확장
  const modalH = 440 * s; // 높이 확장으로 위아래 여유 확보
  const modalX = width / 2 - modalW / 2;
  const modalY = height / 2 - modalH / 2;
  
  // 글래스 효과 모달
  push();
  drawingContext.save();
  roundRectPath(drawingContext, modalX, modalY, modalW, modalH, 50 * s);
  drawingContext.clip();
  
  // 배경 블러 효과
  const bgImg = uiImages["background"];
  if (bgImg && bgImg.width > 0) {
    drawingContext.filter = "blur(20px)";
    drawingContext.globalAlpha = 0.3;
    const cover = coverRect(bgImg.width, bgImg.height, width, height);
    drawingContext.drawImage(
      bgImg.canvas || bgImg.elt,
      0, 0, bgImg.width, bgImg.height,
      cover.x, cover.y, cover.w, cover.h
    );
    drawingContext.filter = "none";
  }
  
  // 어두운 오버레이
  drawingContext.globalAlpha = 0.7;
  drawingContext.fillStyle = "rgba(0,0,0,0.8)";
  drawingContext.fillRect(modalX, modalY, modalW, modalH);
  
  // 유리 틴트
  const tint = drawingContext.createLinearGradient(modalX, modalY, modalX, modalY + modalH);
  tint.addColorStop(0, "rgba(255,255,255,0.1)");
  tint.addColorStop(1, "rgba(255,255,255,0.05)");
  drawingContext.fillStyle = tint;
  drawingContext.fillRect(modalX, modalY, modalW, modalH);
  
  drawingContext.restore();
  pop();
  
  // 테두리
  push();
  drawingContext.save();
  const edge = drawingContext.createLinearGradient(modalX, modalY, modalX + modalW, modalY + modalH);
  edge.addColorStop(0, "rgba(160,160,170,0.45)");
  edge.addColorStop(1, "rgba(110,110,120,0.2)");
  drawingContext.strokeStyle = edge;
  drawingContext.lineWidth = 2;
  drawingContext.globalAlpha = 1;
  roundRectPath(drawingContext, modalX, modalY, modalW, modalH, 50 * s);
  drawingContext.stroke();
  drawingContext.restore();
  pop();
  
  // 입력 필드 (HTML input이 그려지므로 배경만 그림) - 패딩 늘림
  const inputW = modalW - 250 * s; // 200 -> 250 (패딩 늘림)
  const inputH = 60 * s;
  const inputX = modalX + (modalW - inputW) / 2; // 중앙 정렬
  const inputY = modalY + modalH / 2 - inputH / 2; // 중앙 정렬

  // 제목 (입력 필드와 간격 최소화)
  const titleOffset = 10 * s; // 입력 상단과 24px 정도만 띄움
  const titleY = Math.max(modalY + 40 * s, inputY - inputH / 2 - titleOffset);
  const titleLift = 20 * s;
  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  const titleFontSize = 32 * s;
  if (fontPretendard) textFont(fontPretendard);
  drawingContext.font = `600 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`; // 세미볼드
  drawingContext.fillStyle = `rgba(255, 255, 255, 1.0)`;
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  drawingContext.fillText("당신의 이름은 무엇인가요?", width / 2, titleY - titleLift);
  drawingContext.restore();
  pop();
  
  // 확인 / 건너뛰기 버튼 (태그와 동일한 스타일)
  const tagFontSize = 16 * 1.4 * s * 1.3;
  const tagPadding = 28 * s * 1.3;
  const tagH = 56 * s * 1.3;
  const tagR = tagH / 2;
  const inputValue = getCurrentNameInputValue().trim();
  const confirmLabel = "확인";
  const skipLabel = "건너뛰기";
  textSize(tagFontSize);
  if (fontPretendard) textFont(fontPretendard);
  const confirmW = textWidth(confirmLabel) + tagPadding * 2;
  const skipW = textWidth(skipLabel) + tagPadding * 2;
  const buttonSpacing = 20 * s;
  const buttonsTotalW = confirmW + skipW + buttonSpacing;
  const verticalGapBelowInput = 40 * s;
  const buttonY = inputY + inputH + verticalGapBelowInput;
  const confirmButtonX = width / 2 - buttonsTotalW / 2;
  const skipButtonX = confirmButtonX + confirmW + buttonSpacing;
  const buttonAnim = 1.0; // 두 버튼 동일한 스타일
  
  drawGlassLabelFullscreen(confirmButtonX, buttonY, confirmW, tagH, tagR, buttonAnim);
  drawGlassLabelFullscreen(skipButtonX, buttonY, skipW, tagH, tagR, buttonAnim);
  
  // 버튼 텍스트 (태그 스타일)
  const drawButtonLabel = (textStr, centerX) => {
    push();
    drawingContext.save();
    drawingContext.textBaseline = "middle";
    drawingContext.textAlign = "center";
    drawingContext.globalAlpha = buttonAnim;
    drawingContext.imageSmoothingEnabled = true;
    drawingContext.imageSmoothingQuality = "high";
    if (fontPretendard) textFont(fontPretendard);
    drawingContext.font = `600 ${tagFontSize}px "Pretendard Variable", Pretendard, sans-serif`; // 세미볼드
    drawingContext.fillStyle = `rgba(255, 255, 255, ${buttonAnim})`;
    drawingContext.shadowBlur = 0;
    drawingContext.shadowOffsetX = 0;
    drawingContext.shadowOffsetY = 0;
    const textY = buttonY + tagH / 2 + 1; // 1픽셀 아래로 이동
    drawingContext.fillText(textStr, centerX, textY);
    drawingContext.restore();
    pop();
  };
  
  drawButtonLabel(confirmLabel, confirmButtonX + confirmW / 2);
  drawButtonLabel(skipLabel, skipButtonX + skipW / 2);
  
  // 히트박스 저장
  uiHitboxes.push(
    { id: "name_input", x: inputX, y: inputY, w: inputW, h: inputH },
    { id: "name_confirm", x: confirmButtonX, y: buttonY, w: confirmW, h: tagH },
    { id: "name_skip", x: skipButtonX, y: buttonY, w: skipW, h: tagH }
  );
}

// 감각 알아보기 버튼 그리기 (오른쪽) - 태그 버튼 스타일 적용
function drawTasteAnalysisButton() {
  const s = getResponsiveScale();
  const buttonW = 360 * s; // 280 -> 360 (더 크게)
  const buttonH = 75 * s; // 60 -> 75 (더 크게)
  const buttonX = width - buttonW - 30 * s;
  const buttonY = 30 * s;
  const buttonR = buttonH / 2; // 둥근 모서리 반지름
  
  const hasFavorites = favoriteBubbles.length > 0;
  const anim = 1.0; // 항상 표시
  
  // 태그 버튼 스타일 적용 (drawGlassLabelFullscreen 사용)
  push();
  drawingContext.save();
  drawGlassLabelFullscreen(buttonX, buttonY, buttonW, buttonH, buttonR, anim, null);
  drawingContext.restore();
  pop();
  
  // 반투명한 노란색 오버레이 추가
  push();
  drawingContext.save();
  roundRectPath(drawingContext, buttonX, buttonY, buttonW, buttonH, buttonR);
  drawingContext.clip();
  drawingContext.globalAlpha = anim * 0.3; // 반투명
  drawingContext.fillStyle = "rgba(255, 235, 150, 0.4)"; // 노란색 틴트
  drawingContext.fillRect(buttonX, buttonY, buttonW, buttonH);
  drawingContext.restore();
  pop();
  
  // 버튼 텍스트 (태그 스타일과 동일)
  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  drawingContext.globalAlpha = anim;
  const fontSize = 26 * s; // 22 -> 26 (더 크게)
  if (fontPretendard) textFont(fontPretendard);
  drawingContext.font = `700 ${fontSize}px "Pretendard Variable", Pretendard, sans-serif`; // 버블 설명란 제목과 동일한 굵기
  drawingContext.fillStyle = `rgba(255, 255, 255, ${anim})`;
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  const buttonText = hasFavorites 
    ? `${userName}님의 감각 알아보기 (${favoriteBubbles.length})`
    : `${userName}님의 감각 알아보기`;
  const textY = buttonY + buttonH / 2 + 1; // 텍스트를 중앙에서 1픽셀 아래
  drawingContext.fillText(buttonText, buttonX + buttonW / 2, textY);
  drawingContext.restore();
  pop();
  
  // 히트박스 저장
  uiHitboxes.push({ id: "taste_analysis", x: buttonX, y: buttonY, w: buttonW, h: buttonH });
}

// 분석 결과 화면 그리기
function drawAnalysisResult() {
  if (!analysisResult) return;
  
  const s = getResponsiveScale();
  
  // 어두운 배경
  push();
  fill(0, 0, 0, 220);
  rect(0, 0, width, height);
  pop();
  
  // 결과 박스
  const resultW = Math.min(800 * s, width - 60 * s);
  const resultH = Math.min(860 * s, height - 60 * s); // 760 -> 860 (위아래 50픽셀 추가)
  const resultX = width / 2 - resultW / 2;
  const resultY = height / 2 - resultH / 2;
  
  // 글래스 효과
  push();
  drawingContext.save();
  roundRectPath(drawingContext, resultX, resultY, resultW, resultH, 50 * s); // 20 -> 50
  drawingContext.clip();
  
  const bgImg = uiImages["background"];
  if (bgImg && bgImg.width > 0) {
    drawingContext.filter = "blur(20px)";
    drawingContext.globalAlpha = 0.3;
    const cover = coverRect(bgImg.width, bgImg.height, width, height);
    drawingContext.drawImage(
      bgImg.canvas || bgImg.elt,
      0, 0, bgImg.width, bgImg.height,
      cover.x, cover.y, cover.w, cover.h
    );
    drawingContext.filter = "none";
  }
  
  drawingContext.globalAlpha = 0.7;
  drawingContext.fillStyle = "rgba(0,0,0,0.8)";
  drawingContext.fillRect(resultX, resultY, resultW, resultH);
  
  const tint = drawingContext.createLinearGradient(resultX, resultY, resultX, resultY + resultH);
  tint.addColorStop(0, "rgba(255,255,255,0.1)");
  tint.addColorStop(1, "rgba(255,255,255,0.05)");
  drawingContext.fillStyle = tint;
  drawingContext.fillRect(resultX, resultY, resultW, resultH);
  
  drawingContext.restore();
  pop();
  
  // 테두리
  push();
  drawingContext.save();
  const edge = drawingContext.createLinearGradient(resultX, resultY, resultX + resultW, resultY + resultH);
  edge.addColorStop(0, "rgba(255,255,255,0.5)");
  edge.addColorStop(1, "rgba(255,255,255,0.1)");
  drawingContext.strokeStyle = edge;
  drawingContext.lineWidth = 2;
  roundRectPath(drawingContext, resultX, resultY, resultW, resultH, 50 * s); // 20 -> 50
  drawingContext.stroke();
  drawingContext.restore();
  pop();
  
  // 제목
  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  const titleFontSize = 36 * s;
  if (fontPretendard) textFont(fontPretendard);
  drawingContext.font = `600 ${titleFontSize}px "Pretendard Variable", Pretendard, sans-serif`; // 세미볼드
  drawingContext.fillStyle = `rgba(255, 255, 255, 1.0)`;
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  drawingContext.fillText(`${userName}님의 감각을 분석했어요.`, width / 2, resultY + 80 * s + 20); // 10픽셀 더 아래로
  drawingContext.restore();
  pop();
  
  // 태그 컴포넌트 표시 (확대 모드 스타일)
  if (analysisResult.topTags && analysisResult.topTags.length > 0) {
    const responsiveScale = getResponsiveScale();
    const fontSize = 16 * 1.4 * responsiveScale * 1.3;
    const padding = 28 * responsiveScale * 1.3;
    const tagH = 56 * responsiveScale * 1.3;
    const tagR = tagH / 2;
    const tagSpacing = 20 * responsiveScale; // 태그 간 간격
    
    textSize(fontSize);
    if (fontPretendard) textFont(fontPretendard);
    
    let startY = resultY + 200 * s; // 150 -> 200 (추가로 50픽셀 증가)
    const centerX = width / 2;
    
    // 태그들을 세로로 배치
    analysisResult.topTags.forEach((tagData, idx) => {
      const tag = tagData.tag;
      const count = tagData.count;
      const tagType = tagData.tagType;
      const label = `#${tag}`;
      const textW = textWidth(label);
      const tagW = textW + padding * 2;
      const tagX = centerX - tagW / 2;
      const tagY = startY + idx * (tagH + tagSpacing);
      
      // 태그 컴포넌트 그리기 (확대 모드 스타일)
      push();
      drawingContext.save();
      drawGlassLabelFullscreen(tagX, tagY, tagW, tagH, tagR, 1.0, tagType);
      drawingContext.restore();
      pop();
      
      // 순위 표시 (1위, 2위 등) - 2배 크게
      push();
      textAlign(LEFT, CENTER);
      textSize(36 * responsiveScale); // 18 -> 36 (2배)
      if (fontPretendard) textFont(fontPretendard);
      fill(255, 180);
      text(`${idx + 1}위`, tagX - 66 * responsiveScale, tagY + tagH / 2); // 51 -> 66 (15픽셀 간격 추가)
      pop();
      
      // 태그 텍스트
      push();
      drawingContext.save();
      drawingContext.textBaseline = "middle";
      drawingContext.textAlign = "center";
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.imageSmoothingQuality = "high";
      drawingContext.globalAlpha = 1.0;
      fill(255, 255);
      textSize(fontSize);
      if (fontPretendard) textFont(fontPretendard);
      drawingContext.font = `600 ${fontSize}px "Pretendard Variable", Pretendard, sans-serif`;
      drawingContext.shadowBlur = 0;
      drawingContext.shadowOffsetX = 0;
      drawingContext.shadowOffsetY = 0;
      const textY = tagY + tagH / 2 - 2;
      text(label, centerX, textY);
      drawingContext.restore();
      pop();
      
      // 횟수 표시 (태그 오른쪽에 붙임) - 2배 크게
      push();
      textAlign(LEFT, CENTER);
      textSize(24 * responsiveScale); // 12 -> 24 (2배)
      if (fontPretendard) textFont(fontPretendard);
      fill(255, 150);
      const tagRightX = tagX + tagW; // 태그 오른쪽 끝
      const countText = `(${count}회)`;
      text(countText, tagRightX + 10 * responsiveScale, tagY + tagH / 2); // 태그 오른쪽에 10px 간격
      pop();
    });
  }
  
  // 다시 시작하기 버튼 (태그 스타일)
  const buttonLabel = "다시 시작 화면으로 돌아가기";
  const tagFontSizeBtn = 16 * 1.4 * s * 1.3;
  const tagPaddingBtn = 28 * s * 1.3;
  const tagHBtn = 56 * s * 1.3;
  const tagRBtn = tagHBtn / 2;
  textSize(tagFontSizeBtn);
  if (fontPretendard) textFont(fontPretendard);
  const buttonW = textWidth(buttonLabel) + tagPaddingBtn * 2;
  const buttonH = tagHBtn;
  const buttonX = width / 2 - buttonW / 2;
  const buttonY = resultY + resultH - 170 * s; // 태그 높이에 맞춰 여백 확보
  
  drawGlassLabelFullscreen(buttonX, buttonY, buttonW, buttonH, tagRBtn, 1.0);
  
  push();
  drawingContext.save();
  drawingContext.textBaseline = "middle";
  drawingContext.textAlign = "center";
  drawingContext.globalAlpha = 1.0;
  drawingContext.imageSmoothingEnabled = true;
  drawingContext.imageSmoothingQuality = "high";
  if (fontPretendard) textFont(fontPretendard);
  drawingContext.font = `400 ${tagFontSizeBtn}px "Pretendard Variable", Pretendard, sans-serif`; // 일반 굵기
  drawingContext.fillStyle = `rgba(255, 255, 255, 1.0)`;
  drawingContext.shadowBlur = 0;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;
  const restartTextY = buttonY + buttonH / 2; // 2픽셀 아래로 이동
  drawingContext.fillText(buttonLabel, width / 2, restartTextY);
  drawingContext.restore();
  pop();
  
  // 히트박스 저장
  uiHitboxes.push({ id: "restart", x: buttonX, y: buttonY, w: buttonW, h: buttonH });
}

// 하트 버튼 토글 (좋아요 추가/제거)
function toggleFavoriteBubble() {
  if (fullscreenIndex < 0) return;
  
  const idx = favoriteBubbles.indexOf(fullscreenIndex);
  if (idx >= 0) {
    // 이미 선택되어 있으면 제거
    favoriteBubbles.splice(idx, 1);
  } else {
    // 선택되어 있지 않으면 추가
    favoriteBubbles.push(fullscreenIndex);
  }
}

// 태그 분석 수행
function analyzeFavoriteTags() {
  if (!bubbles || favoriteBubbles.length === 0) return null;
  
  const tagCounts = {}; // {tag: {count, tagType}}
  
  // 선택한 버블들의 태그 수집
  favoriteBubbles.forEach(bubbleIdx => {
    const bubble = bubbles[bubbleIdx];
    if (!bubble) return;
    
    // 비주얼 태그
    (bubble.visualTags || []).forEach(tag => {
      if (!tagCounts[tag]) {
        tagCounts[tag] = { count: 0, tagType: "visual" };
      }
      tagCounts[tag].count++;
    });
    
    // 감정 태그
    (bubble.emotionalTags || []).forEach(tag => {
      if (!tagCounts[tag]) {
        tagCounts[tag] = { count: 0, tagType: "emotional" };
      } else {
        // 이미 비주얼 태그로 존재하면 타입을 둘 다로 표시하지 않고, 더 많이 나온 타입으로 결정
        // 여기서는 단순히 감정 태그로 덮어쓰지 않고 카운트만 증가
      }
      tagCounts[tag].count++;
    });
  });
  
  // Top 5 태그 추출 (비주얼/감정 구분 없이 통합)
  const topTags = Object.entries(tagCounts)
    .map(([tag, data]) => ({ 
      tag, 
      count: data.count, 
      tagType: data.tagType 
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  return {
    topTags,
    totalSelected: favoriteBubbles.length
  };
}

function updateOnboarding() {
  // 슬라이딩 손 애니메이션 업데이트 (1~4번, 6번 페이지일 때)
  if ((onboardingCurrentPage >= 0 && onboardingCurrentPage <= 3) || onboardingCurrentPage === 4) {
    slidingHandAnimTime += deltaTime / 1000; // 초 단위로 변환
  } else {
    slidingHandAnimTime = 0; // 다른 페이지로 이동하면 리셋
  }

  if (!onboardingIsAnimating) {
    // 애니메이션 중이 아니면 현재 페이지 기준에서 오프셋은 0 유지
    onboardingOffsetX = 0;
    return;
  }

  const pageWidth = width || window.innerWidth || 1;

  // 0~1 사이의 진행도 업데이트 (ease-out 느낌을 주기 위해 천천히 증가)
  onboardingAnimProgress += 0.12;
  if (onboardingAnimProgress > 1) onboardingAnimProgress = 1;

  // ease-out cubic
  const t = 1 - Math.pow(1 - onboardingAnimProgress, 3);

  // 시작 시점의 오프셋에서 목표 페이지까지 부드럽게 이동
  const targetOffset = -(onboardingTargetPage - onboardingCurrentPage) * pageWidth;
  onboardingOffsetX = lerp(onboardingAnimFromOffset, targetOffset, t);

  // 애니메이션이 거의 끝났으면 페이지를 확정하고 오프셋을 0으로 리셋
  if (onboardingAnimProgress >= 0.999) {
    onboardingCurrentPage = onboardingTargetPage;
    onboardingOffsetX = 0;
    onboardingIsAnimating = false;
    onboardingAnimProgress = 0;
    onboardingAnimFromOffset = 0;
    onboardingLastPageChangeTime = millis(); // 페이지 변경 시간 기록
  }
}

function drawOnboarding() {
  const s = getResponsiveScale();
  uiHitboxes.length = 0;
  
  // 배경
  image(bgBuffer, 0, 0);
  
  // 어두운 오버레이
  push();
  fill(0, 0, 0, 200);
  rect(0, 0, width, height);
  pop();
  
  // 현재 페이지 이미지 그리기 (스와이프 없음)
  if (onboardingCurrentPage < onboardingImages.length) {
    const currentImg = onboardingImages[onboardingCurrentPage];
    if (currentImg && currentImg.width > 0 && currentImg.height > 0) {
      push();
      imageMode(CENTER);
      
      const imgRatio = currentImg.width / currentImg.height;
      const screenRatio = width / height;
      
      let drawW, drawH;
      if (imgRatio > screenRatio) {
        drawW = width;
        drawH = drawW / imgRatio;
      } else {
        drawH = height;
        drawW = imgRatio * drawH;
      }
      
      image(currentImg, width / 2, height / 2, drawW, drawH);
      pop();
    }
  }
  
  // 첫 번째부터 네 번째, 그리고 여섯 번째 온보딩 화면에 손 애니메이션 및 텍스트 (translate 밖에서 그리기)
  if (((onboardingCurrentPage >= 0 && onboardingCurrentPage <= 3) || onboardingCurrentPage === 4) && slidingHandImage && slidingHandImage.width > 0) {
    const s = getResponsiveScale();
    
    // 손 깜빡거리는 애니메이션: 화면 중앙에서 깜빡거림
    const animDuration = 5.0; // 5초 주기 (깜빡거림 빈도 감소)
    const animProgress = (slidingHandAnimTime % animDuration) / animDuration;
    
    // 손의 위치 설정 (온보딩 이미지 좌표계 기준으로 계산하여 화면 크기가 변경되어도 일정하게 유지)
    const baseHandSize = 600 * 1.8; // 고정된 손 크기 (픽셀) - 3배 크게 + 1.8배 더 크게 = 1080
    const handSize = baseHandSize * s; // 반응형 스케일만 적용
    
    // 현재 페이지의 온보딩 이미지 가져오기
    const currentImg = onboardingImages[onboardingCurrentPage];
    if (!currentImg || currentImg.width === 0 || currentImg.height === 0) return;
    
    // 이미지가 화면에 그려지는 크기 계산 (drawOnboarding의 이미지 그리기 로직과 동일)
    const imgRatio = currentImg.width / currentImg.height;
    const screenRatio = width / height;
    
    let drawW, drawH;
    if (imgRatio > screenRatio) {
      drawW = width;
      drawH = drawW / imgRatio;
    } else {
      drawH = height;
      drawW = imgRatio * drawH;
    }
    
    // 이미지가 화면에 그려지는 위치 (중앙 정렬)
    const imgX = width / 2;
    const imgY = height / 2;
    const imgLeft = imgX - drawW / 2;
    const imgTop = imgY - drawH / 2;
    
    // 이미지 좌표계에서 손이 가리키는 위치 (이미지 크기 기준 비율)
    // 기준 이미지 크기(1920x1080) 기준으로 정의된 위치를 현재 이미지 크기에 맞게 변환
    let imageRelativeX, imageRelativeY; // 이미지 내 상대 위치 (0~1)
    if (onboardingCurrentPage === 0) {
      // 1번 페이지: 이미지의 80%, 100% 위치
      imageRelativeX = 0.8;
      imageRelativeY = 1;
    } else if (onboardingCurrentPage === 1) {
      // 2번 페이지: 이미지의 104%, 140% 위치 (오른쪽으로 더 이동)
      imageRelativeX = 0.84;
      imageRelativeY = 0.79;
    } else if (onboardingCurrentPage === 2) {
      // 3번 페이지: 이미지의 68%, 135% 위치
      imageRelativeX = 0.85;
      imageRelativeY = 1.35;
    } else if (onboardingCurrentPage === 3) {
      // 4번 페이지: 이미지의 50%, 50% 위치 (중앙)
      imageRelativeX = 0.86;
      imageRelativeY = 0.6;
    } else if (onboardingCurrentPage === 4) {
      // 6번 페이지: 이미지의 위치 (적절한 위치로 설정)
      imageRelativeX = 1.15;
      imageRelativeY = 0.58;
    }
    
    // 이미지 좌표계를 화면 좌표계로 변환
    const targetX = imgLeft + imageRelativeX * drawW;
    const targetY = imgTop + imageRelativeY * drawH;
    
    // 손 이미지의 중심점 위치 계산 (손가락 끝이 targetX, targetY를 가리키도록)
    // 손가락이 오른쪽 아래를 가리킨다고 가정하고, 손 중심점을 왼쪽 위로 오프셋
    const fingerOffsetX = handSize * 0.3; // 손가락 끝이 중심에서 오른쪽으로 30% 정도
    const fingerOffsetY = handSize * 0.3; // 손가락 끝이 중심에서 아래로 30% 정도
    const handX = targetX - fingerOffsetX;
    const handY = targetY - fingerOffsetY;
    
    // 깜빡거리는 효과: sin 함수를 사용하여 0~1 사이에서 깜빡거림
    // sin(0) = 0, sin(PI/2) = 1, sin(PI) = 0, sin(3*PI/2) = -1, sin(2*PI) = 0
    // (sin + 1) / 2를 하면 0~1 사이 값이 됨
    const blinkCycle = Math.sin(animProgress * Math.PI * 2);
    const handAlpha = (blinkCycle + 1) / 2; // 0~1 사이 값으로 변환
    const minAlpha = 0.3; // 최소 투명도
    const maxAlpha = 0.8; // 최대 투명도
    const finalAlpha = lerp(minAlpha, maxAlpha, handAlpha);
    
    // 손 그리기 (깜빡거리는 효과)
    push();
    drawingContext.save();
    drawingContext.globalAlpha = finalAlpha;
    imageMode(CENTER);
    image(slidingHandImage, handX, handY, handSize, handSize);
    drawingContext.restore();
    pop();
    
  }
  
}
