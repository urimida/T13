# 리팩토링 명령어 모음

이 문서는 `explorer/sketch.js` 파일의 리팩토링을 위한 구체적인 명령어들을 포함합니다.

## 작업 순서

리팩토링은 다음 순서로 진행하는 것을 권장합니다:
1. bubbleColor 이동 (가장 쉬움, 워밍업)
2. redrawBackgroundBuffer 계산 로직 분리 (렌더링 로직 정리)
3. ensureFilteredBubblesState 분해 (핵심 로직 정리)
4. 이미지 로딩 통합 (가장 복잡하므로 마지막에 진행)

---

## 1. bubbleColor 함수를 Bubble 클래스의 정적 메서드로 이동

**[명령]**

`bubbleColor` 함수를 `Bubble` 클래스의 정적 메서드 `Bubble.generateColor(seed)`로 이동하고, 기존에 이 함수를 호출하던 곳(`drawBubbleVisual` 함수 내부)을 `Bubble.generateColor(bubble.hueSeed)`로 수정해줘.

---

## 2. redrawBackgroundBuffer의 이미지 비율 계산 로직 추출

**[명령]**

`redrawBackgroundBuffer` 함수 내에서 **이미지를 화면에 꽉 채우기 위한 좌표와 크기 계산 로직** (const imgRatio = bgImage.width / bgImage.height; 부터 bgOffsetY = (height - drawH) / 2; 까지)을 `_calculateCoverDimensions(imgW, imgH, screenW, screenH)`라는 순수 함수로 추출해줘. 이 함수는 `{ x, y, w, h }` 형태의 객체를 반환해야 해. 그리고 `redrawBackgroundBuffer` 함수에서는 이 함수를 호출하여 반환된 값을 사용하도록 수정해줘.

---

## 3. ensureFilteredBubblesState의 캐싱 로직 분리

**[명령]**

`ensureFilteredBubblesState` 함수에서 **필터 캐시 시그니처 생성 및 확인 로직** (const signature = [...] 부터 if (signature === filterCacheSignature) { return filterCacheResult; } 블록까지)을 `_checkFilterCache(state)` (private) 헬퍼 함수로 추출해줘. 이 함수는 캐시가 있으면 `filterCacheResult`를 반환하고, 없으면 `null`을 반환해야 해.

---

## 4. ensureFilteredBubblesState의 필터링 로직과 효과 적용 분리

**[명령]**

`ensureFilteredBubblesState` 함수를 리팩토링하여, **순수하게 필터링된 버블 목록만 반환**하는 `_calculateFilteredBubbles(bubbles, state)` 함수와, 그 결과를 바탕으로 **버블을 터뜨리거나 멈추는 사이드 이펙트**를 처리하는 `_applyFilterEffects(manager, filteredBubbles, bubbles, state)` 함수로 로직을 분리해줘. `_calculateFilteredBubbles`는 `{ filteredBubbles, hasTagFilter, selectedTag, selectedGroup }` 객체를 반환하고, `_applyFilterEffects`는 void를 반환해야 해.

---

## 5. queueVisibleBubbleImages를 BubbleManager 클래스로 이동

**[명령]**

전역 함수 `queueVisibleBubbleImages`의 로직(화면 내 버블 확인 및 로딩 요청)을 `BubbleManager` 클래스의 `checkAndLoadVisibleImages(loader, imageFiles)` 메서드로 이동해줘. 이 메서드는 `ImageLoader` 인스턴스와 `imageFiles` 배열을 매개변수로 받아야 해. 그리고 기존 `queueVisibleBubbleImages` 함수는 이 메서드를 호출하는 래퍼 함수로 변경하거나, 호출하는 곳을 직접 `bubbleManager.checkAndLoadVisibleImages(bubbleImageLoader, imageFiles)`로 수정해줘.

---

## 6. 중복된 이미지 로딩 로직 통합 및 전역 함수 제거

**[명령]**

전역 함수 `startBubbleImageLoad`는 `ImageLoader` 클래스의 기능과 중복되므로 삭제해줘. `ImageLoader` 클래스의 `startLoad` 메서드가 로드 성공 시 버블의 `alpha` 값을 업데이트하는 로직과, 로드 실패 시 버블의 `imageIndex`를 `null`로 설정하고 `alpha`를 `1.0`으로 설정하는 로직을 `onLoaded` 콜백과 `onError` 콜백을 통해 처리하도록 확장해줘. `startLoad` 메서드의 시그니처를 `startLoad(imageIndex, imageFiles, onLoaded = null, onError = null)`로 변경하고, 기존 `startBubbleImageLoad`를 호출하던 모든 곳을 `bubbleImageLoader.request()` 또는 적절한 방법으로 대체해줘.

---

## 7. 전역 이미지 상태 변수 정리 (선택사항)

**[명령]**

`startBubbleImageLoad` 함수를 삭제한 후, 더 이상 사용되지 않는 전역 변수들(`imageLoading`, `imageLoaded`, `activeImageLoads`)을 찾아서 삭제해줘. 단, 다른 곳에서 사용 중인지 먼저 확인해야 해.

---

## 참고사항

- 각 명령을 순서대로 실행하는 것을 권장합니다.
- 각 명령 실행 후 린터 오류를 확인하고 수정하세요.
- 테스트를 통해 기능이 정상적으로 동작하는지 확인하세요.

