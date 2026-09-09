/* =========================
   SpriteCache - 버블 스프라이트 캐시
   원형 클립 + 캡을 미리 합성해 매 프레임 clip/scale 비용을 제거
========================= */

class SpriteCache {
  constructor() {
    this.cache = new Map(); // key -> p5.Graphics
    this.sizeBuckets = [28, 36, 44, 52, 64, 80, 96, 112, 130];
    this.maxEntries = 180;
  }

  bucketSize(r) {
    const bs = this.sizeBuckets;
    for (let i = 0; i < bs.length; i++) if (r <= bs[i]) return bs[i];
    return bs[bs.length - 1];
  }

  _makeKey(pathOrHue, bucket, hasCap) {
    return (pathOrHue || "none") + "|" + bucket + (hasCap ? "|c" : "|n");
  }

  getBubbleSprite(imgPath, img, radius, hueSeed, capImg) {
    const bucket = this.bucketSize(radius);
    const hasCap = !!(capImg && capImg.width > 2);
    const hasImg = !!(img && img.width > 0);
    // 이미지가 아직 없으면 path 키로 캐시하지 않음 (로드 후 색상 플레이스홀더가 남는 버그 방지)
    const key = this._makeKey(
      hasImg ? imgPath : ("hue:" + Math.floor(hueSeed || 0)),
      bucket,
      hasCap
    );

    let g = this.cache.get(key);
    if (g) return g;

    // 캐시 상한: 오래된 것부터 제거 (Map은 삽입 순서 유지)
    while (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      const oldG = this.cache.get(oldest);
      if (oldG && typeof oldG.remove === "function") {
        try { oldG.remove(); } catch (_) {}
      }
      this.cache.delete(oldest);
    }

    const size = bucket * 2;
    g = createGraphics(size, size);
    g.pixelDensity(1);
    g.drawingContext.imageSmoothingEnabled = true;
    g.drawingContext.imageSmoothingQuality = "medium";
    g.clear();
    g.noStroke();

    const cx = bucket;
    const cy = bucket;

    if (hasImg) {
      g.drawingContext.save();
      g.drawingContext.beginPath();
      g.drawingContext.arc(cx, cy, bucket, 0, Math.PI * 2);
      g.drawingContext.clip();

      const imgRatio = img.width / img.height;
      let drawW, drawH;
      if (imgRatio > 1) {
        drawH = size;
        drawW = imgRatio * drawH;
      } else {
        drawW = size;
        drawH = drawW / imgRatio;
      }
      g.imageMode(CENTER);
      g.image(img, cx, cy, drawW, drawH);
      g.drawingContext.restore();
    } else {
      g.colorMode(HSL, 360, 100, 100, 1);
      g.fill(hueSeed || 0, 55, 55, 1);
      g.circle(cx, cy, size);
      g.colorMode(RGB, 255);
    }

    if (hasCap) {
      g.imageMode(CENTER);
      g.image(capImg, cx, cy, size, size);
    }

    this.cache.set(key, g);
    return g;
  }

  // 하위 호환 (풀스크린 등에서 사용)
  getCircle(size, gloss) {
    const key = "circle|" + size + (gloss ? "_g" : "_n");
    let g = this.cache.get(key);
    if (g) return g;

    g = createGraphics(size * 2 + 4, size * 2 + 4);
    g.pixelDensity(1);
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

    this.cache.set(key, g);
    return g;
  }

  invalidateAll() {
    for (const g of this.cache.values()) {
      if (g && typeof g.remove === "function") {
        try { g.remove(); } catch (_) {}
      }
    }
    this.cache.clear();
  }
}
