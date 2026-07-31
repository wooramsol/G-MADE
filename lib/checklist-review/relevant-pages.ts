import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import type { ChecklistItem, ChecklistSourcePage } from "./types";

/**
 * 배치별 항목과 관련성 높은 원본 페이지만 선별합니다 — 매 배치마다 문서 전체(또는 전체 구간)를
 * 재전송하던 기존 방식 대비 재전송 페이지 수를 줄여 비용을 낮추는 용도입니다.
 * 텍스트 레이어 기반 키워드 매칭이므로 스캔본(텍스트 없음) 문서에는 적용할 수 없고,
 * 이 경우 호출자는 기존 전체/구간 전송 방식으로 폴백해야 합니다(skippedFiles 참고).
 */

const STOPWORDS = new Set([
  "있는", "있도록", "위한", "위하여", "대한", "관련", "등의", "등을", "등이", "하는", "되는",
  "경우", "사항", "여부", "검토", "계획", "확인", "반영", "고려", "필요", "적용", "작성",
  "체크리스트", "항목", "충족", "부분", "미충족", "판정",
]);

function tokenize(text: string): string[] {
  const matches = text.match(/[가-힣a-zA-Z0-9]{2,}/g) ?? [];
  return matches.map((token) => token.toLowerCase()).filter((token) => !STOPWORDS.has(token));
}

/** 항목당 상위 관련 페이지 수 — recall 확보를 위해 항목마다 개별 선별 후 합집합 */
const TOP_PAGES_PER_ITEM = 6;
/** 이 페이지 수 이하 파일은 필터링하지 않고 전체 전송 (이득보다 정확도 리스크가 큼) */
const SKIP_FILTER_AT_OR_BELOW_PAGES = 20;
/** 선별 결과가 파일 전체 페이지의 이 비율 이상이면 필터링 이득이 적어 전체 전송 */
const SKIP_FILTER_ABOVE_RATIO = 0.7;
/** 파일당 최종 선별 페이지 상한 — 초과하면 필터링을 포기하고 전체 전송 */
const MAX_SELECTED_PAGES_PER_FILE = 40;
/** 키워드 매칭이 약해 선별 결과가 이보다 적으면 안전을 위해 페이지를 보충 */
const MIN_TOTAL_SELECTED_PAGES = 8;
/**
 * 텍스트 레이어가 있는 페이지 비율이 이보다 낮으면 필터링을 생략하고 전체를 전송.
 * 키워드 선별은 텍스트가 있는 페이지만 후보로 삼기 때문에, 도면·이미지 위주 문서에서는
 * 정작 근거가 되는 도면 페이지가 체계적으로 발췌에서 빠져 "도면 확인 불가" 오판과
 * 엉뚱한 페이지 인용을 만든다 — 이런 문서는 비용을 더 쓰더라도 전체를 보여줘야 한다.
 */
const MIN_TEXT_COVERAGE_RATIO = 0.6;

export type RelevantPageSelection = {
  /** fileName -> 선별된 원본 페이지 번호(오름차순, 중복 없음). 필터링을 적용할 파일만 포함. */
  pagesByFile: Map<string, number[]>;
  /** 필터링을 적용하지 않기로 한(=전체 문서 그대로 전송) 파일명 집합 */
  skippedFiles: Set<string>;
};

export function selectRelevantPagesForBatch(
  files: UploadedFileSummary[],
  batchItems: ChecklistItem[],
  checklistPages: ChecklistSourcePage[] = [],
): RelevantPageSelection {
  const pagesByFile = new Map<string, number[]>();
  const skippedFiles = new Set<string>();

  for (const file of files) {
    const totalPages = file.totalPages ?? 0;
    const slices = parsePageSlices([file]);

    if (slices.length === 0 || totalPages === 0 || totalPages <= SKIP_FILTER_AT_OR_BELOW_PAGES) {
      skippedFiles.add(file.originalName);
      continue;
    }

    // 도면·이미지 위주 문서(텍스트 페이지 비율 낮음)는 필터링 생략 — 도면 페이지 누락 방지
    const pagesWithText = new Set(slices.map((slice) => slice.page)).size;
    if (pagesWithText / totalPages < MIN_TEXT_COVERAGE_RATIO) {
      console.log(
        `[checklist-review] 페이지 필터링 생략 「${file.originalName}」 — 텍스트 페이지 ${pagesWithText}/${totalPages} ` +
          `(도면 위주 문서로 판단, 전체 전송)`,
      );
      skippedFiles.add(file.originalName);
      continue;
    }

    const pageTokens = new Map<number, Set<string>>();
    for (const slice of slices) {
      pageTokens.set(slice.page, new Set(tokenize(slice.text)));
    }

    if (pageTokens.size === 0) {
      skippedFiles.add(file.originalName);
      continue;
    }

    const documentFrequency = new Map<string, number>();
    for (const tokens of pageTokens.values()) {
      for (const token of tokens) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
    }
    const tokenWeight = (token: string): number => {
      const df = documentFrequency.get(token) ?? 0;
      if (df === 0) return 0;
      return 1 / Math.log2(2 + df);
    };

    const selected = new Set<number>();

    for (const item of batchItems) {
      const queryTokens = new Set(tokenize(item.text));
      if (queryTokens.size === 0) continue;

      const scored = [...pageTokens.entries()]
        .map(([page, tokens]) => {
          let score = 0;
          for (const token of queryTokens) {
            if (tokens.has(token)) score += tokenWeight(token);
          }
          return { page, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score);

      for (const entry of scored.slice(0, TOP_PAGES_PER_ITEM)) {
        selected.add(entry.page);
      }
    }

    // 체크리스트 표 페이지는 항상 포함 (반영여부 등 근거로 참조되는 경우가 많아 저비용 안전장치)
    for (const entry of checklistPages) {
      if (entry.fileName === file.originalName && pageTokens.has(entry.page)) {
        selected.add(entry.page);
      }
    }

    // 키워드 매칭이 약해 선별 결과가 너무 적으면 문서 앞부분을 보태 최소 커버리지 확보
    if (selected.size < MIN_TOTAL_SELECTED_PAGES) {
      for (const slice of slices) {
        if (selected.size >= MIN_TOTAL_SELECTED_PAGES) break;
        selected.add(slice.page);
      }
    }

    const ratio = selected.size / totalPages;
    if (ratio >= SKIP_FILTER_ABOVE_RATIO || selected.size > MAX_SELECTED_PAGES_PER_FILE || selected.size === 0) {
      skippedFiles.add(file.originalName);
      continue;
    }

    pagesByFile.set(file.originalName, [...selected].sort((left, right) => left - right));
  }

  return { pagesByFile, skippedFiles };
}
