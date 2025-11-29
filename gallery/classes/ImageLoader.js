/* =========================
   ImageLoader - 이미지 로딩 및 캐시 관리
   전시용: 6시간 이상 장시간 실행 최적화
========================= */

class ImageLoader {
  constructor() {
    this.cache = new Map();           // path -> p5.Image
    this.queue = [];                  // pending paths
    this.loading = new Set();         // currently loading
    this.lastCheck = 0;
    this.activeLoads = 0;
    this.lastSeen = new Map();       // path -> timestamp (LRU용)
  }

  has(path){ return this.cache.has(path); }

  get(path){ return this.cache.get(path); }

  request(path, priority = false) {
    if (!path) return;
    if (this.cache.has(path) || this.loading.has(path)) return;
    if (this.queue.length >= PERFORMANCE_CONFIG.maxImageQueueLength) {
      if (priority) {
        this.queue.pop();
      } else {
        return;
      }
    }
    if (priority) {
      this.queue.unshift(path);
    } else {
      this.queue.push(path);
    }
    this.lastSeen.set(path, millis());
  }

  markVisible(path) {
    if (path) {
      this.lastSeen.set(path, millis());
    }
  }

  update(now) {
    if (now - this.lastCheck < PERFORMANCE_CONFIG.imageCheckInterval) return;
    this.lastCheck = now;

    // 전시용 최적화: 더 빠른 이미지 로딩을 위해 동시 로드 수만큼 즉시 처리
    while (this.activeLoads < PERFORMANCE_CONFIG.maxSimulImageLoads && this.queue.length > 0) {
      const path = this.queue.shift();
      if (this.cache.has(path) || this.loading.has(path)) continue;

      this.loading.add(path);
      this.activeLoads++;

      // 타임아웃 설정 (10초) - 전시용 안정성
      const loadStartTime = now;
      const timeoutId = setTimeout(() => {
        if (this.loading.has(path)) {
          console.warn(`[Gallery] 이미지 로드 타임아웃: ${path}`);
          this.loading.delete(path);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
        }
      }, 10000);

      loadImage(
        path,
        img => {
          clearTimeout(timeoutId);
          if (img && img.width > 0 && img.height > 0) {
            this.cache.set(path, img);
            this.lastSeen.set(path, millis());
          } else {
            console.warn(`[Gallery] 유효하지 않은 이미지: ${path}`);
          }
          this.loading.delete(path);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
        },
        err => {
          clearTimeout(timeoutId);
          // 전시용: 에러 로깅만 하고 계속 진행
          console.warn(`[Gallery] 이미지 로드 실패: ${path}`, err);
          this.loading.delete(path);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
        }
      );
    }
  }

  gc(protectedPaths) {
    // LRU 방식: 최근 6시간 안 본 것만 삭제 (전시용 안정성 강화)
    // 확대 모드에 있는 이미지는 항상 보존
    const now = millis();
    let deletedCount = 0;
    const maxCacheSize = 200; // 최대 캐시 크기 제한 (메모리 관리)
    
    // 캐시 크기가 너무 크면 오래된 것부터 삭제
    if (this.cache.size > maxCacheSize) {
      const entries = Array.from(this.cache.entries()).map(([path, img]) => ({
        path,
        img,
        seen: this.lastSeen.get(path) || 0
      }));
      entries.sort((a, b) => a.seen - b.seen); // 오래된 것부터 정렬
      
      const toDelete = entries.slice(0, this.cache.size - maxCacheSize);
      for (const entry of toDelete) {
        // 보호된 이미지는 삭제하지 않음
        if (protectedPaths && protectedPaths.has(entry.path)) continue;
        this.cache.delete(entry.path);
        this.lastSeen.delete(entry.path);
        deletedCount++;
      }
    }
    
    // 6시간 이상 보지 않은 이미지 삭제
    for (const [path] of this.cache) {
      // 확대 모드에 있는 이미지는 절대 삭제하지 않음
      if (protectedPaths && protectedPaths.has(path)) {
        // 확대 모드 이미지는 항상 최신으로 표시
        this.lastSeen.set(path, now);
        continue;
      }
      
      const seen = this.lastSeen.get(path) || 0;
      // 6시간(21600000ms) 미가시 = 삭제 (전시용 안정성 강화)
      if (now - seen > 21600000) { // 6시간 = 21600000ms
        this.cache.delete(path);
        this.lastSeen.delete(path);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0 && DEV.logMemory) {
      console.log(`[Gallery] GC: ${deletedCount}개 이미지 삭제, 남은 캐시: ${this.cache.size}개`);
    }
  }

  softReset() {
    // reset queue/loads only
    this.queue.length = 0;
    this.loading.clear();
  }
}


