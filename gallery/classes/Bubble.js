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
    
    // 애니메이션 시드
    this.breathSpeed = random(0.6, 1.2);
    this.pulseOffset = random(0, TWO_PI);
    this.noiseOffset = random(0, 1000);
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

    // breathing + noise jitter
    let animFactor = 1.0;
    const t = appTime;
    animFactor *= lerp(0.95, 1.05, (sin(t * this.breathSpeed + this.pulseOffset) + 1) * 0.5);
    animFactor *= lerp(0.98, 1.02, noise(this.noiseOffset + t * 0.2));

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

    push();
    translate(this.displayX, this.displayY + (this.isCenter ? -20 : 0));
    noStroke();

    // 주인공 버블 후광 (흰색 후광 + 반짝이는 효과)
    if (this.isCenter) {
      const t = appTime;
      const glowRadius = this.displayR * 2.2;
      const glowLayers = 5;
      
      // 기본 흰색 후광
      for (let i = glowLayers; i > 0; i--) {
        const layerRadius = glowRadius * (i / glowLayers);
        const baseAlpha = 0.25 / glowLayers;
        const sparkle = 0.15 * Math.sin(t * 2 + this.pulseOffset);
        const layerAlpha = (baseAlpha + sparkle) * this.alpha;
        fill(255, 255, 255, Math.max(0, Math.min(255, layerAlpha * 255)));
        circle(0, 0, layerRadius * 2);
      }
      
      // 추가 반짝이는 하이라이트
      const sparkleAngle = t * 1.5 + this.pulseOffset;
      const sparkleDist = this.displayR * 1.3;
      const sparkleX = Math.cos(sparkleAngle) * sparkleDist;
      const sparkleY = Math.sin(sparkleAngle) * sparkleDist;
      const sparkleSize = this.displayR * 0.4;
      const sparkleAlpha = (0.6 + 0.4 * Math.sin(t * 3)) * this.alpha;
      
      fill(255, 255, 255, sparkleAlpha * 255);
      drawingContext.shadowBlur = sparkleSize * 2;
      drawingContext.shadowColor = "rgba(255, 255, 255, 0.8)";
      circle(sparkleX, sparkleY, sparkleSize);
      
      const sparkleX2 = Math.cos(sparkleAngle + Math.PI) * sparkleDist;
      const sparkleY2 = Math.sin(sparkleAngle + Math.PI) * sparkleDist;
      circle(sparkleX2, sparkleY2, sparkleSize * 0.7);
      
      drawingContext.shadowBlur = 0;
    }

    // base - 이미지 표시
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

    // gloss highlight - 주인공 버블만
    if (this.isCenter) {
      fill(255, 255 * 0.25 * this.alpha);
      circle(-this.displayR * 0.35, -this.displayR * 0.35, this.displayR * 0.9);
      fill(255, 255 * 0.12 * this.alpha);
      circle(this.displayR * 0.15, this.displayR * 0.15, this.displayR * 1.2);
    }

    // 모든 버블에 캡 씌우기
    const bubbleCapImg = uiImages["bubble-cap.png"];
    if (bubbleCapImg && bubbleCapImg.width > 2) {
      imageMode(CENTER);
      drawingContext.globalAlpha = this.alpha;
      const s = (this.displayR * 2) / bubbleCapImg.width;
      push();
      scale(s);
      image(bubbleCapImg, 0, 0);
      pop();
    }

    pop();
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


