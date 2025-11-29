/* =========================
   PanController - 카메라/팬 컨트롤러
========================= */

class PanController {
  constructor() {
    this.camX = 0;
    this.camY = 0;
    this.velX = 0;
    this.velY = 0;
    this.dragging = false;
    this.hasDragged = false;
    this.snapTargetX = null;
    this.snapTargetY = null;
  }

  onDown() {
    this.dragging = true;
    this.hasDragged = false;
    this.snapTargetX = this.snapTargetY = null;
  }

  onDrag(dx, dy) {
    const s = INTERACT.panSensitivity;
    this.camX -= dx * s;
    this.camY -= dy * s;
    this.velX = -dx * s;
    this.velY = -dy * s;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      this.hasDragged = true;
    }
  }

  onUp() {
    this.dragging = false;
    this.hasDragged = false;
    // 드래그 종료 시 주인공 버블이 중앙에 오도록 자동 스냅
    this.snapToCenterBubble();
  }
  
  // 주인공 버블이 중앙에 오도록 카메라 스냅
  snapToCenterBubble() {
    if (!bubbleManager) return;
    
    // 현재 가장 가까운 버블 찾기
    const centerBubble = bubbleManager.getCenterBubble();
    if (!centerBubble) return;
    
    // 주인공 버블의 월드 좌표
    const bubbleWorldX = centerBubble.x;
    const bubbleWorldY = centerBubble.y;
    
    // 현재 카메라 위치에서 가장 가까운 torus wrap된 타겟 위치 계산
    const currentCamX = this.camX;
    const currentCamY = this.camY;
    
    // wrapDelta를 사용하여 가장 가까운 타겟 위치 찾기
    const targetX = currentCamX + wrapDelta(bubbleWorldX - currentCamX, bubbleManager.worldW);
    const targetY = currentCamY + wrapDelta(bubbleWorldY - currentCamY, bubbleManager.worldH);
    
    // 부드럽게 이동하기 위해 스냅 타겟 설정
    this.velX = 0;
    this.velY = 0;
    this.snapTargetX = targetX;
    this.snapTargetY = targetY;
  }

  update(worldW, worldH) {
    if (!this.dragging) {
      // snap lerp
      if (this.snapTargetX != null) {
        const dx = this.snapTargetX - this.camX;
        const dy = this.snapTargetY - this.camY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) {
          this.camX = this.snapTargetX;
          this.camY = this.snapTargetY;
          this.snapTargetX = this.snapTargetY = null;
          this.velX = this.velY = 0;
        } else {
          const dynamicSpeed = Math.min(INTERACT.snapSpeed * (1 + dist / 1000), 0.25);
          this.camX = lerp(this.camX, this.snapTargetX, dynamicSpeed);
          this.camY = lerp(this.camY, this.snapTargetY, dynamicSpeed);
          this.velX = 0;
          this.velY = 0;
        }
      } else {
        // 관성
        this.camX += this.velX;
        this.camY += this.velY;
        this.velX *= INTERACT.inertiaDecay;
        this.velY *= INTERACT.inertiaDecay;
      }
    }
    // torus wrap camera
    this.camX = (this.camX % worldW + worldW) % worldW;
    this.camY = (this.camY % worldH + worldH) % worldH;
  }
}

