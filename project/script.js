// SVG Displacement Map 기반 Liquid Glass (전체 화면 SVG 렌즈)
// - 배경은 #background CSS background-image: cover
// - 렌즈는 동일 이미지를 SVG <image>로 cover 정렬하여 표시 후 feDisplacementMap 적용

// 요소 참조
const bg = document.getElementById("background");
const lensSvg = document.getElementById("lens-svg");
const lensImage = document.getElementById("lens-image");
const lensPathEl = document.getElementById("lens-path");
const lensStrokeEl = document.getElementById("lens-stroke");
const dispCanvas = document.getElementById("displacement-canvas");
const dispImage = document.getElementById("displacement-map");

// 설정값
const LENS_RADIUS = 160; // 픽셀 기준 렌즈 반경
const LENS_SCALE = 50; // feDisplacementMap scale (필터 속성에도 적용됨)
const LENS_SHAPE = "rounded"; // "circle" | "rounded"

// 내부 상태
let viewW = 0;
let viewH = 0;
let mouseX = 0;
let mouseY = 0;
let imgMeta = null; // {w, h}

// 커버 맞춤 계산 (background-size: cover 과 동일)
function coverFit(imgW, imgH, vw, vh) {
  const imgRatio = imgW / imgH;
  const viewRatio = vw / vh;
  let drawW, drawH, offsetX, offsetY;
  if (imgRatio > viewRatio) {
    // 너비가 더 긴 이미지 → 높이에 맞춤, 좌우 잘림
    drawH = vh;
    drawW = imgRatio * drawH;
    offsetX = (vw - drawW) / 2;
    offsetY = 0;
  } else {
    // 세로가 더 긴 이미지 → 너비에 맞춤, 상하 잘림
    drawW = vw;
    drawH = drawW / imgRatio;
    offsetX = 0;
    offsetY = (vh - drawH) / 2;
  }
  return { drawW, drawH, offsetX, offsetY };
}

// 라운드 사각형 경로 생성
function roundedRectPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + rr} ${y}`,
    `H ${x + w - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V ${y + h - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H ${x + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V ${y + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    "Z",
  ].join(" ");
}

function updateViewSize() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  // SVG 크기 동기화
  if (lensSvg) {
    lensSvg.setAttribute("width", String(viewW));
    lensSvg.setAttribute("height", String(viewH));
    lensSvg.setAttribute("viewBox", `0 0 ${viewW} ${viewH}`);
  }
}

function loadBackgroundImageMeta(srcUrl, cb) {
  const img = new Image();
  img.src = srcUrl;
  img.onload = function () {
    cb({ w: img.naturalWidth, h: img.naturalHeight });
  };
}

// 배경 이미지 경로 (CSS와 동일 이미지 사용)
function resolveBackgroundUrl() {
  // CSS의 background-image: url("...") 값 추출
  const cs = window.getComputedStyle(bg);
  const val = cs.backgroundImage; // url("...") 혹은 none
  if (!val || val === "none") return null;
  const match = val.match(/url\(["']?(.*?)["']?\)/);
  return match ? match[1] : null;
}

function updateLensImagePlacement() {
  if (!imgMeta) return;
  const { drawW, drawH, offsetX, offsetY } = coverFit(
    imgMeta.w,
    imgMeta.h,
    viewW,
    viewH
  );
  lensImage.setAttribute("x", String(offsetX));
  lensImage.setAttribute("y", String(offsetY));
  lensImage.setAttribute("width", String(drawW));
  lensImage.setAttribute("height", String(drawH));
  lensImage.setAttribute("preserveAspectRatio", "none");
}

function updateLensPath() {
  const r = LENS_RADIUS;
  if (LENS_SHAPE === "circle") {
    const d = `M ${mouseX} ${mouseY} m -${r},0 a ${r},${r} 0 1,0 ${
      r * 2
    },0 a ${r},${r} 0 1,0 -${r * 2},0`;
    lensPathEl.setAttribute("d", d);
    lensStrokeEl.setAttribute("d", d);
  } else {
    const rw = r * 2.0;
    const rh = r * 1.4;
    const rr = Math.min(26, Math.min(rw, rh) * 0.2);
    const x = mouseX - rw / 2;
    const y = mouseY - rh / 2;
    const d = roundedRectPath(x, y, rw, rh, rr);
    lensPathEl.setAttribute("d", d);
    lensStrokeEl.setAttribute("d", d);
  }
}

function updateDisplacementMap() {
  if (!dispCanvas) return;
  dispCanvas.width = viewW;
  dispCanvas.height = viewH;
  const ctx = dispCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  // 배경 중립값
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, viewW, viewH);

  // 렌즈 그라디언트 (중앙 강하고 가장자리 약함)
  const r = LENS_RADIUS;
  const grad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, r);
  const dx = 14; // X 방향 편향
  const dy = 14; // Y 방향 편향
  grad.addColorStop(0.0, `rgb(${128 + dx},${128 + dy},128)`);
  grad.addColorStop(0.8, `rgb(${128 + dx * 0.25},${128 + dy * 0.25},128)`);
  grad.addColorStop(1.0, "rgb(128,128,128)");

  ctx.fillStyle = grad;
  if (LENS_SHAPE === "circle") {
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const rw = r * 2.0;
    const rh = r * 1.4;
    const rr = Math.min(26, Math.min(rw, rh) * 0.2);
    const x = mouseX - rw / 2;
    const y = mouseY - rh / 2;
    // 라운드 사각 채우기
    const path = new Path2D(roundedRectPath(x, y, rw, rh, rr));
    ctx.fill(path);
  }

  // feImage 갱신 (href + size 전부 userSpaceOnUse에 맞춤)
  const url = dispCanvas.toDataURL();
  dispImage.setAttribute("href", url);
  // Safari 호환
  dispImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
  dispImage.setAttribute("x", "0");
  dispImage.setAttribute("y", "0");
  dispImage.setAttribute("width", String(viewW));
  dispImage.setAttribute("height", String(viewH));
}

function tick() {
  updateLensPath();
  updateDisplacementMap();
  requestAnimationFrame(tick);
}

// 초기화
(function init() {
  updateViewSize();
  const src = resolveBackgroundUrl();
  if (src) {
    lensImage.setAttribute("href", src);
    lensImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", src);
    loadBackgroundImageMeta(src, function (meta) {
      imgMeta = meta;
      updateLensImagePlacement();
    });
  }

  // 필터 scale 값 동기화
  const filter = document.getElementById("liquid-glass-filter");
  if (filter) {
    const feDisp = filter.querySelector("feDisplacementMap");
    if (feDisp) feDisp.setAttribute("scale", String(LENS_SCALE));
  }

  window.addEventListener("resize", function () {
    updateViewSize();
    updateLensImagePlacement();
  });

  window.addEventListener("mousemove", function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  requestAnimationFrame(tick);
})();
