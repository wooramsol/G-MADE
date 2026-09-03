import { parsePageSlices, type PageSlice } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import type { ChecklistFinding } from "./types";

/**
 * 수치 인용 검증 — AI가 근거(note·anchorText)에 인용한 치수·수치가, 인용한
 * 페이지의 "추출 텍스트"에 실제로 존재하는지 대조한다.
 *
 * 오류 최소화 원칙:
 * - 텍스트가 풍부한(벡터형) 페이지에서 수치가 원문에 없으면 → 환각 가능성.
 *   판정을 바꾸지 않고 reviewFlag("확인 필요")만 달아 담당자 검증으로 넘긴다.
 * - 텍스트가 빈약한 페이지(도면이 이미지로 삽입된 보고서형)는 검증 불가 —
 *   이 경우는 "확대 판독:" 접두어 규칙(고해상도에서 또렷이 읽은 것만 인용)과
 *   근거 캡처가 검증 수단이므로 여기서는 건너뛴다.
 */

/** 단위·기호가 붙었거나 3자리 이상인 수치만 검사 (연도·페이지 번호 등 오탐 방지) */
const NUMERIC_CLAIM_PATTERN =
  /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:mm|cm|km|m|M|㎡|㎥|m2|m3|층|호|대|%|°)|[HhWwLlDd]\s*=\s*\d+(?:\.\d+)?|1\s*\/\s*\d{2,5}|\d{3,}(?:\.\d+)?/g;

/** 벡터형(검증 가능) 페이지로 판단하는 최소 텍스트 길이 */
const MIN_VERIFIABLE_PAGE_CHARS = 200;

function digitsAndUnits(text: string): string {
  // 공백·쉼표를 제거해 "7,621.00 ㎡" ↔ "7621.00㎡" 표기 차이를 흡수
  return text.replace(/[\s,]/g, "").toLowerCase();
}

function extractNumericClaims(text: string): string[] {
  const claims = new Set<string>();
  for (const match of text.matchAll(NUMERIC_CLAIM_PATTERN)) {
    const raw = match[0].trim();
    // 숫자 부분만 정규화해 검사 토큰으로 사용 (단위는 표기 변형이 많아 제외)
    const digits = raw.replace(/[^\d.]/g, "").replace(/\.$/, "");
    if (digits.replace(/\D/g, "").length >= 2) claims.add(digits);
  }
  return [...claims];
}

export type NumericVerificationResult = {
  flagged: number;
  checked: number;
};

/**
 * findings를 제자리에서 보강: 검증 실패한 수치 인용이 있는 항목에 reviewFlag를
 * 단다 (기존 플래그가 있으면 유지). 판정(status)은 절대 바꾸지 않는다.
 */
export function verifyNumericCitations(
  findings: ChecklistFinding[],
  files: UploadedFileSummary[],
): NumericVerificationResult {
  const slices = parsePageSlices(files);
  const sliceByPage = new Map<number, PageSlice>();
  for (const slice of slices) sliceByPage.set(slice.page, slice);

  let flagged = 0;
  let checked = 0;

  for (const finding of findings) {
    const unverified: string[] = [];

    for (const evidence of finding.evidence) {
      const note = evidence.note ?? "";
      // 확대 판독(래스터 도면) 인용은 텍스트 검증 대상이 아님 — 캡처가 검증 수단
      if (note.startsWith("확대 판독")) continue;

      const slice = sliceByPage.get(Number(evidence.page));
      if (!slice || slice.text.length < MIN_VERIFIABLE_PAGE_CHARS) continue;

      const claims = extractNumericClaims(`${note} ${evidence.anchorText ?? ""}`);
      if (claims.length === 0) continue;
      checked += 1;

      const haystack = digitsAndUnits(slice.text);
      for (const claim of claims) {
        if (!haystack.includes(claim.toLowerCase())) unverified.push(`p.${evidence.page} "${claim}"`);
      }
    }

    if (unverified.length > 0) {
      flagged += 1;
      const reason = `인용 수치(${unverified.slice(0, 3).join(", ")})가 해당 페이지 원문 텍스트에서 확인되지 않음 — 도서 원본과 직접 대조 필요`;
      finding.reviewFlag = finding.reviewFlag ? `${finding.reviewFlag} / ${reason}` : reason;
    }
  }

  return { flagged, checked };
}
