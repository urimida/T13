/* =========================
   BubbleManager - 버블 관리자
========================= */

class BubbleManager {
  constructor() {
    this.bubbles = [];
    this.gridSize = 1;
    this.totalBubbles = 0;
    this.worldW = 0;
    this.worldH = 0;
    this._centerBubble = null;
    this._drawList = []; // 재사용 버퍼 (GC 방지)
  }

  build(dataList) {
    this.bubbles.length = 0;
    const spacing = RENDER.hexSpacing;
    const dataCount = Array.isArray(dataList) ? dataList.length : 0;
    const total = dataCount > 0 ? dataCount : RENDER.totalBubblesFallback;
    this.totalBubbles = total;
    this.gridSize = Math.max(1, Math.ceil(Math.sqrt(total)));
    this.worldW = this.gridSize * spacing * 1.5;
    this.worldH = this.gridSize * spacing * SQRT3;

    const gs = this.gridSize;
    let idx = 0;
    for (let gx = 0; gx < gs && idx < total; gx++) {
      for (let gy = 0; gy < gs && idx < total; gy++) {
        const hexX = gx * spacing * 1.5;
        const hexY = gy * spacing * SQRT3 + ((gx % 2) * spacing * SQRT3) / 2;
        const data = dataList[idx] || {};
        const imgName = data.imageFile || data.image || null;
        const imgPath = imgName ? (PATHS.bubbleImgs + imgName) : null;
        const hueSeed = (idx * 360 / total) % 360;
        this.bubbles.push(new Bubble(idx, hexX, hexY, data, imgPath, hueSeed));
        idx++;
      }
    }
  }

  getCenterHexPosition() {
    const spacing = RENDER.hexSpacing;
    const centerGridX = Math.floor(this.gridSize / 2);
    const centerGridY = Math.floor(this.gridSize / 2);
    const hexX = centerGridX * spacing * 1.5;
    const hexY = centerGridY * spacing * SQRT3 + ((centerGridX % 2) * spacing * SQRT3) / 2;
    return { x: hexX, y: hexY };
  }

  updateAndDraw(panController) {
    if (!panController) return;

    // culling radius (제곱 거리로 비교해 sqrt 최소화)
    const cullR = maxDist * 1.1;
    const cullR2 = cullR * cullR;
    const invMaxDist = maxDist > 0 ? 1 / maxDist : 0;

    let centerCandidate = null;
    let centerBestD2 = Infinity;
    const drawList = this._drawList;
    drawList.length = 0;

    const camX = panController.camX;
    const camY = panController.camY;
    const worldW = this.worldW;
    const worldH = this.worldH;
    const bubbles = this.bubbles;
    const app = { centerX, centerY };

    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];

      const relX = wrapDelta(b.x - camX, worldW);
      const relY = wrapDelta(b.y - camY, worldH);

      const d2 = relX * relX + relY * relY;
      if (d2 > cullR2) {
        b.visible = false;
        continue;
      }

      const distFromCenter = Math.sqrt(d2);
      const normalizedDist = Math.min(distFromCenter * invMaxDist, 1);

      b.visible = true;
      b.isCenter = false;
      b._d2 = d2;
      b.updateDisplay(app, relX, relY, distFromCenter, normalizedDist);

      // 미로드 이미지만 요청 (매 프레임 큐 오염 방지)
      if (b.imgPath && imageLoader && !imageLoader.has(b.imgPath)) {
        imageLoader.request(b.imgPath, true);
      }
      if (b.imgPath && imageLoader) {
        imageLoader.markVisible(b.imgPath);
      }

      if (d2 < centerBestD2) {
        centerBestD2 = d2;
        centerCandidate = b;
      }

      drawList.push(b);
    }

    if (centerCandidate) {
      centerCandidate.isCenter = true;
      this._centerBubble = centerCandidate;
    } else {
      this._centerBubble = null;
    }

    // 가까운 버블 우선 그리기 (maxDraw 한도 내)
    const maxDraw = PERFORMANCE_CONFIG.maxDraw;
    if (drawList.length > maxDraw) {
      drawList.sort((a, b) => a._d2 - b._d2);
    }

    const n = Math.min(drawList.length, maxDraw);
    for (let i = 0; i < n; i++) {
      drawList[i].draw();
    }

    if (imageLoader) imageLoader.update(performance.now());
  }

  getCenterBubble() {
    return this._centerBubble || null;
  }
}
