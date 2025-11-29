/* =========================
   Wake Lock 관리 (화면 꺼짐 방지)
========================= */

let wakeLock = null;
let wakeLockRetryCount = 0;

async function initWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLockRetryCount = 0;
      retryWakeLock();
    });
  } catch (err) {
    console.warn('[Gallery] Wake Lock 실패:', err);
  }
}

async function retryWakeLock() {
  if (wakeLockRetryCount >= MAX_WAKE_LOCK_RETRIES) return;
  if (document.visibilityState === 'visible') {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLockRetryCount = 0;
    } catch (err) {
      wakeLockRetryCount++;
      setTimeout(() => retryWakeLock(), 2000);
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && wakeLock === null) {
      wakeLockRetryCount = 0;
      await retryWakeLock();
    }
  });
}


