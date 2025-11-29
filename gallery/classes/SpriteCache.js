/* =========================
   SpriteCache - 스프라이트 캐시
========================= */

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

