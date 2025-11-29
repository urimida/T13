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

    // culling radius
    const cullR = maxDist * 1.1;
    const cullR2 = cullR * cullR;

    let drawCount = 0;
    let centerCandidate = null;
    let centerBestD2 = Infinity;

    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];

      // 항상 모든 버블 표시 (필터링 없음)
      // filter 제거됨

      // nearest torus relative pos
      const relX = wrapDelta(b.x - panController.camX, this.worldW);
      const relY = wrapDelta(b.y - panController.camY, this.worldH);

      const d2 = relX * relX + relY * relY;
      if (d2 > cullR2) {
        b.visible = false;
        continue;
      }

      const distFromCenter = Math.sqrt(d2);
      const normalizedDist = Math.min(distFromCenter / maxDist, 1);

      b.visible = true;
      b.isCenter = false;

      b.updateDisplay({ centerX, centerY }, relX, relY, distFromCenter, normalizedDist);

      // request visible image lazy-load
      if (b.imgPath && imageLoader) {
        imageLoader.request(b.imgPath, true);
        imageLoader.markVisible(b.imgPath);
      }

      // choose center bubble
      if (d2 < centerBestD2) {
        centerBestD2 = d2;
        centerCandidate = b;
      }

      // draw limit
      if (drawCount < PERFORMANCE_CONFIG.maxDraw) {
        b.draw();
        drawCount++;
      }
    }

    if (centerCandidate) {
      centerCandidate.isCenter = true;
      this._centerBubble = centerCandidate;
    } else {
      this._centerBubble = null;
    }

    // update loader
    if (imageLoader) imageLoader.update(performance.now());
  }

  getCenterBubble() {
    return this._centerBubble || null;
  }
}


