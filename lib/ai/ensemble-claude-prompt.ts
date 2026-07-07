import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary } from "./analysis-types";
import { buildCompactPageCorpus } from "./page-citation";

const MAX_PAGE_CORPUS_CHARS = 12_000;

export function buildEnsembleClaudeInitialPrompt(
  files: UploadedFileSummary[],
  context: EvaluationContext,
  items: EvaluationItem[],
): string {
  const pageCorpus = buildCompactPageCorpus(files).slice(0, MAX_PAGE_CORPUS_CHARS);
  const itemList = items
    .map((item, index) => `${index + 1}. [${item.id}] ${item.detailItem} (배점 ${item.points})`)
    .join("\n");

  const lawHints =
    context.referenceLaws.length > 0
      ? context.referenceLaws
          .slice(0, 6)
          .map((law) => `- ${law.title} ${law.article}`)
          .join("\n")
      : "없음";

  return `경관·공공디자인 심의 자료를 분석하고 평가하세요. 아래 페이지 색인과 평가항목만 사용하세요. 추측·환각 금지.

프로젝트: ${context.project?.name ?? "미지정"} · ${context.project?.location ?? ""}

## 페이지 색인
${pageCorpus || "색인 없음 — 제출 자료 추출본이 비어 있습니다. 누락·미확인 항목만 지적하세요."}

## 참고 법령(일부)
${lawHints}

## 평가항목
${itemList}

## 작성 규칙
- rationale·recommendation: 누락·모순·기준 미달만. 칭찬 금지.
- 「파일명」 p.N 형식 인용.
- 항목당 rationale 2~3줄, recommendation 1~2줄로 간결히.

## 출력(JSON만)
{
  "summary": "심사위원 재확인 사항 요약",
  "documentSections": [],
  "evaluationPreview": [{
    "itemId": "항목 id",
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "근거",
    "recommendation": "보완 조치",
    "lawRefs": [],
    "guidelineRefs": []
  }]
}`;
}
