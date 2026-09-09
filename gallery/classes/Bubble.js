/* =========================
   Bubble - 버블 클래스
========================= */

class Bubble {
  constructor(i, x, y, data, imgPath, hueSeed) {
    // 월드 좌표
    this.id = i;
    this.x = x;
    this.y = y;
    
    // 데이터
    this.data = data || {};
    this.title = this.data.title || "";
    this.name = this.title;
    this.imageFile = this.data.imageFile || "";
    this.tags = this.data.tags || [];
    this.visualTags = this.data.visualTags || [];
    this.emotionalTags = this.data.emotionalTags || [];
    this.desc = this.data.description || "";
    this.attributes = this.data.attributes || [];
    
    // 이미지 경로
    this.imgPath = imgPath || null;
    this.hueSeed = hueSeed || (i * 360 / 100) % 360;
    
    // 렌더링 상태
    this.displayX = 0;
    this.displayY = 0;
    this.displayR = RENDER.baseBubbleRadius;
    this.alpha = 1.0;
    this.isCenter = false;
    this.visible = true;
    this.filtered = true;
    
    // 애니메이션 시드 (sin만 사용 — noise 제거로 CPU 절약)
    this.breathSpeed = 0.6 + (i % 7) * 0.08;
    this.pulseOffset = (i * 0.37) % (Math.PI * 2);
  }

  updateDisplay(app, relX, relY, distFromCenter, normalizedDist) {
    const cx = app.centerX;
    const cy = app.centerY;

    // fisheye
    const fisheyeFactor = 1 + (1 - normalizedDist) * RENDER.fisheyeStrength;
    this.displayX = cx + relX * fisheyeFactor;
    this.displayY = cy + relY * fisheyeFactor;

    // size factor from spec
    let sizeFactor = 1.0;
    if (distFromCenter <= RENDER.centerInfluenceRadius) {
      sizeFactor = lerp(1.0, 5.9, 1 - normalizedDist);
    } else if (distFromCenter <= RENDER.alphaFadeRadius) {
      const fadeProgress = (distFromCenter - RENDER.centerInfluenceRadius) /
                           (RENDER.alphaFadeRadius - RENDER.centerInfluenceRadius);
      sizeFactor = lerp(5.9, 1.36, fadeProgress);
    } else {
      const farProg = clamp((distFromCenter - RENDER.alphaFadeRadius) / 400, 0, 1);
      sizeFactor = lerp(1.36, 0.68, farProg);
    }

    // breathing only (cheap sin) — Perlin noise 제거
    const t = appTime;
    const animFactor = lerp(0.96, 1.04, (Math.sin(t * this.breathSpeed + this.pulseOffset) + 1) * 0.5);

    const baseR = RENDER.baseBubbleRadius;
    const r = baseR * sizeFactor * animFactor;

    this.displayR = clamp(r, RENDER.minBubbleRadius, RENDER.maxBubbleRadius);

    // alpha falloff
    const alphaN = clamp(distFromCenter / maxDist, 0, 1);
    this.alpha = lerp(1.0, RENDER.minAlpha, alphaN);
  }

  contains(px, py) {
    const dx = px - this.displayX;
    const dy = py - this.displayY;
    return (dx * dx + dy * dy) <= (this.displayR * this.displayR);
  }
  
  draw() {
    if (!this.visible) return;

    const img = this.imgPath && imageLoader ? imageLoader.get(this.imgPath) : null;
    const capImg = uiImages ? uiImages["bubble-cap.png"] : null;
    const drawY = this.displayY + (this.isCenter ? -20 : 0);

    // 스프라이트 캐시: clip + cap을 오프스크린에서 1회만 합성
    if (spriteCache) {
      const sprite = spriteCache.getBubbleSprite(
        this.imgPath,
        img,
        this.displayR,
        this.hueSeed,
        capImg
      );
      if (sprite) {
        push();
        translate(this.displayX, drawY);
        drawingContext.globalAlpha = this.alpha;
        imageMode(CENTER);
        image(sprite, 0, 0, this.displayR * 2, this.displayR * 2);
        drawingContext.globalAlpha = 1;

        if (this.isCenter) {
          this._drawCenterAccent();
        }
        pop();
        return;
      }
    }

    // 폴백 (캐시 미준비 시)
    push();
    translate(this.displayX, drawY);
    noStroke();

    if (img) {
      drawingContext.save();
      drawingContext.beginPath();
      drawingContext.arc(0, 0, this.displayR, 0, Math.PI * 2);
      drawingContext.clip();
      imageMode(CENTER);
      const imgRatio = img.width / img.height;
      const diameter = this.displayR * 2;
      let drawW, drawH;
      if (imgRatio > 1) {
        drawH = diameter;
        drawW = imgRatio * drawH;
      } else {
        drawW = diameter;
        drawH = drawW / imgRatio;
      }
      drawingContext.globalAlpha = this.alpha;
      image(img, 0, 0, drawW, drawH);
      drawingContext.restore();
    } else {
      colorMode(HSL, 360, 100, 100, 1);
      fill(this.hueSeed, 55, 55, this.alpha);
      circle(0, 0, this.displayR * 2);
      colorMode(RGB, 255);
    }

    if (capImg && capImg.width > 2) {
      imageMode(CENTER);
      drawingContext.globalAlpha = this.alpha;
      image(capImg, 0, 0, this.displayR * 2, this.displayR * 2);
      drawingContext.globalAlpha = 1;
    }

    if (this.isCenter) {
      this._drawCenterAccent();
    }
    pop();
  }

  // 센터 버블 강조 — shadowBlur 없이 저비용 하이라이트만
  _drawCenterAccent() {
    const t = appTime;
    noStroke();
    fill(255, 255 * 0.22 * this.alpha);
    circle(-this.displayR * 0.35, -this.displayR * 0.35, this.displayR * 0.9);
    fill(255, 255 * 0.1 * this.alpha);
    circle(this.displayR * 0.15, this.displayR * 0.15, this.displayR * 1.15);

    const sparkleAngle = t * 1.5 + this.pulseOffset;
    const sparkleDist = this.displayR * 1.25;
    const sparkleAlpha = (0.45 + 0.25 * Math.sin(t * 3)) * this.alpha;
    fill(255, sparkleAlpha * 255);
    circle(Math.cos(sparkleAngle) * sparkleDist, Math.sin(sparkleAngle) * sparkleDist, this.displayR * 0.28);
    circle(Math.cos(sparkleAngle + Math.PI) * sparkleDist, Math.sin(sparkleAngle + Math.PI) * sparkleDist, this.displayR * 0.18);
  }
  
  // 호환성을 위한 drawAt 메서드
  drawAt(x, y) {
    const oldX = this.displayX;
    const oldY = this.displayY;
    this.displayX = x;
    this.displayY = y;
    this.draw();
    this.displayX = oldX;
    this.displayY = oldY;
  }
}
