/**
 * 근거의 "원문 인용구(앵커)" 수집 — PDF 글자 좌표 탐색으로 정확한 위치를
 * 표시하기 위한 검색어. 서버·클라이언트 양쪽에서 동일하게 계산되어야 하므로
 * 외부 의존성 없이 순수 함수로 유지한다.
 *
 * 우선순위: ① 모델이 명시한 anchorText(원문 그대로 복사 지시)
 *          ② note 안의 따옴표 인용구('반영', "옥상조경" 등) — 과거 검토 소급 적용
 */
export function buildEvidenceAnchors(evidence: { note?: string; anchorText?: string; kind?: string; region?: unknown }): string[] {
  // 이미지 관찰 근거는 글자가 아니라 그림 부위(region)를 표시 — 위치가 있으면 글자 검색을 하지 않음
  if (evidence.kind === "visual" && evidence.region) return [];
  const anchors: string[] = [];
  const push = (value: string | undefined) => {
    // 긴 인용(체크리스트 항목 원문 등)은 버리지 않고 앞 60자만 사용 — 위치 탐색은 앞부분으로 충분
    const text = value?.trim().slice(0, 60).trim();
    if (!text || text.length < 2) return;
    if (!anchors.includes(text)) anchors.push(text);
  };

  push(evidence.anchorText);

  const note = evidence.note ?? "";
  for (const match of note.matchAll(/['‘“"「『]([^'’”"」』]{2,40})['’”"」』]/g)) {
    push(match[1]);
  }

  return anchors.slice(0, 3);
}

/** 앵커 목록의 결정적 캐시 접미사 (djb2 해시) — 앵커가 없으면 빈 문자열 */
export function anchorCacheSuffix(anchors: string[]): string {
  if (anchors.length === 0) return "";
  const joined = anchors.join("|");
  let hash = 5381;
  for (let index = 0; index < joined.length; index += 1) {
    hash = ((hash << 5) + hash + joined.charCodeAt(index)) >>> 0;
  }
  return `-a${hash.toString(16)}`;
}
