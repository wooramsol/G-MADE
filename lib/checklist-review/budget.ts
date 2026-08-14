/**
 * 검토 1건당 AI 비용 상한과 추정 헬퍼.
 *
 * 상한을 넘길 것으로 예상되면 분석을 실패시키는 대신 규모를 줄여서(배치 수 축소,
 * 선택 단계 생략) 상한 안에서 완료하는 "우아한 축소" 방식을 씁니다 — 검토가 아예
 * 안 되는 것보다 일관성·부가기능을 일부 양보하는 쪽이 낫습니다.
 */

/** 검토 1건당 AI 비용 상한 (USD) */
export const MAX_COST_USD_PER_REVIEW = 2;

/** 비전 페이지(또는 고해상도 타일)당 추정 입력 토큰 — Anthropic 공식 가이드(1,500~3,000)의 중간값 */
export const EST_TOKENS_PER_VISION_PAGE = 2_000;

/** sonnet 입력 단가 ($/token) */
const SONNET_INPUT_USD_PER_TOKEN = 3 / 1_000_000;
/** sonnet 출력 단가 ($/token) */
const SONNET_OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;
/** 항목당 추정 출력 토큰 (evaluate-items의 OUTPUT_TOKENS_PER_ITEM과 동일 근거) */
const EST_OUTPUT_TOKENS_PER_ITEM = 480;

/** 비전 페이지 N장을 한 번 전송하는 입력 비용 추정 (USD) */
export function estimateVisionPagesUsd(pages: number): number {
  return pages * EST_TOKENS_PER_VISION_PAGE * SONNET_INPUT_USD_PER_TOKEN;
}

/** 평가 배치 1회의 비용 추정: 문서 재전송(입력) + 항목 판정(출력) */
export function estimateBatchUsd(visionPages: number, itemCount: number): number {
  return estimateVisionPagesUsd(visionPages) + itemCount * EST_OUTPUT_TOKENS_PER_ITEM * SONNET_OUTPUT_USD_PER_TOKEN;
}
