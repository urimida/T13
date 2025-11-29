/* =========================
   유틸리티 함수들
========================= */

function wrapDelta(d, size) {
  d = (d + size * 0.5) % size;
  if (d < 0) d += size;
  return d - size * 0.5;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function getResponsiveScale() {
  const baseW = 1920, baseH = 1080;
  const s = Math.min(width / baseW, height / baseH);
  return clamp(s, 0.5, 1.5);
}

function coverRect(imgW, imgH, boxW, boxH) {
  const imgRatio = imgW / imgH;
  const boxRatio = boxW / boxH;
  let w, h, x, y;
  if (imgRatio > boxRatio) {
    h = boxH;
    w = imgRatio * h;
    x = (boxW - w) * 0.5;
    y = 0;
  } else {
    w = boxW;
    h = w / imgRatio;
    x = 0;
    y = (boxH - h) * 0.5;
  }
  return { w, h, x, y };
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

function getKoreanParticle(word) {
  if (!word || word.length === 0) return "을";
  const lastChar = word[word.length - 1];
  const code = lastChar.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return "을";
  const hasJong = (code - 0xAC00) % 28 !== 0;
  return hasJong ? "을" : "를";
}

function pointInCircle(px, py, cx, cy, r) {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawFPS() {
  if (!DEV.showFPS) return;
  // fpsSmoother는 sketch copy.js에서 관리됨
  if (typeof fpsSmoother !== 'undefined') {
    fpsSmoother += (frameRate() - fpsSmoother) * 0.08;
    push();
    fill(255);
    textSize(12);
    textAlign(LEFT, TOP);
    text("FPS: " + fpsSmoother.toFixed(1), 8, height - 18);
    pop();
  } else {
    push();
    fill(255);
    textSize(16);
    textAlign(LEFT, TOP);
    text(`FPS: ${frameRate().toFixed(1)}`, 10, 10);
    pop();
  }
}

