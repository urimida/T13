/* =========================
   설정 상수들
========================= */

const PATHS = {
  bubblesJson: "../public/assets/data/bubbles.json",
  bubbleImgs: "../public/assets/bubble-imgs/",      // *.webp 폴더
  uiImgs: "../public/assets/public-imgs/",         // UI png 폴더
  font: "../public/assets/fonts/PretendardVariable.ttf",
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
  idleFPS: 30,
};

const INTERACT = {
  panSensitivity: 0.6,
  snapSpeed: 0.14,
  inertiaDecay: 0.94,
  dragDeadzone: 6,
  tapMoveThreshold: 15,
  tapTimeThreshold: 400,
};

const RECOMM_BUBBLE_CONFIG = {
  radius: 61,
};

const PERFORMANCE_CONFIG = {
  imageCheckInterval: 150,
  maxImageQueueLength: 60,
  maxDraw: 140,
  tabletGCInterval: 20000,
  desktopGCInterval: 30000,
  tabletSoftReset: 120000,
  desktopSoftReset: 180000,
  maxSimulImageLoads: 5,
};

const RECO_COUNT = 3;
const SQRT3 = Math.sqrt(3);
const MAX_WAKE_LOCK_RETRIES = 5;


