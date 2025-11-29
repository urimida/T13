/* =========================
   데이터 스키마 어댑터
========================= */

const DATA_SCHEMA_ADAPTER = {
  normalize(raw) {
    const list = raw.bubbles || [];
    const out = new Array(list.length);
    // GC 최소화: 재사용 가능한 배열 사용
    if (!window._tempTagsArray) window._tempTagsArray = [];
    const tempTags = window._tempTagsArray;
    
    for (let i = 0; i < list.length; i++) {
      const b = list[i] || {};
      // 스프레드 연산자 대신 직접 병합 (GC 감소)
      tempTags.length = 0;
      const visualTags = b.visualTags || [];
      const emotionalTags = b.emotionalTags || [];
      for (let j = 0; j < visualTags.length; j++) tempTags.push(visualTags[j]);
      for (let j = 0; j < emotionalTags.length; j++) tempTags.push(emotionalTags[j]);
      
      out[i] = {
        title: b.title || "",
        imageFile: b.image || b.imageFile || "",
        tags: tempTags.slice(), // 필요한 경우에만 복사
        visualTags: visualTags,
        emotionalTags: emotionalTags,
        attributes: b.attributes || [],
        description: b.description || "",
      };
    }
    return out;
  },
};

