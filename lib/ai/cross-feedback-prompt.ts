import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary, UploadAnalysisResult } from "./analysis-types";
import { formatProviderBadgeLabel } from "./provider-labels";
import type { AiProviderId } from "./types";
import { buildCompactPageCorpus } from "./page-citation";

function summarizePeerAnalysis(provider: AiProviderId, analysis: UploadAnalysisResult): string {
  const rows = analysis.evaluationPreview
    .map(
      (row) =>
        `- ${row.itemName}: 점수 ${row.score} (${row.grade})
  근거: ${row.rationale.slice(0, 600)}${row.rationale.length > 600 ? "…" : ""}
  보완: ${row.recommendation.slice(0, 400)}${row.recommendation.length > 400 ? "…" : ""}`,
    )
    .join("\n");

  return `### ${formatProviderBadgeLabel(provider)} 초기 분석
요약: ${analysis.summary}
${rows}`;
}

export function buildCrossFeedbackPrompt(input: {
  selfProvider: AiProviderId;
  selfAnalysis: UploadAnalysisResult;
  peerAnalyses: Array<{ provider: AiProviderId; analysis: UploadAnalysisResult }>;
  files: UploadedFileSummary[];
  context: EvaluationContext;
  items: EvaluationItem[];
}): string {
  const { selfProvider, selfAnalysis, peerAnalyses, files, context, items } = input;
  const pageCorpus = buildCompactPageCorpus(files);
  const peerBlock =
    peerAnalyses.length > 0
      ? peerAnalyses.map((peer) => summarizePeerAnalysis(peer.provider, peer.analysis)).join("\n\n")
      : "다른 AI 분석 없음";

  const itemList = items
    .map((item, index) => `${index + 1}. [${item.id}] ${item.detailItem} (배점 ${item.points})`)
    .join("\n");

  return `당신은 ${formatProviderBadgeLabel(selfProvider)} AI 평가 보조자입니다.
업로드 자료와 다른 AI 엔진의 초기 분석을 검토한 뒤, 잘못된 추측·환각·근거 없는 주장을 바로잡고 누락된 리스크를 보완하여 **최종 평가안**을 작성하세요.

## 검토 원칙
- 다른 AI가 지적한 누락·모순이 자료에 실제로 있으면 반영하세요.
- 자료에 없는 내용을 근거로 삼은 분석은 제거하거나 "자료 미확인"으로 명시하세요.
- 점수는 근거가 강화되면 조정하고, 근거가 약해지면 낮추세요.
- rationale·recommendation에는 칭찬·긍정 평가를 쓰지 말고, 누락·미기재·모순·기준 미달만 구체적으로 적으세요.
- PDF·도면 인용은 「파일명」 p.N 형식을 유지하세요.

## 평가항목
${itemList}

## 자료 페이지 색인 (요약)
${pageCorpus || "페이지 색인 없음 — 추출 본문·비전 자료를 참고"}

## 당신의 초기 분석
${summarizePeerAnalysis(selfProvider, selfAnalysis)}

## 다른 AI 엔진 초기 분석
${peerBlock}

## 출력
아래 JSON 스키마만 반환하세요. documentSections는 생략해도 됩니다(빈 배열).
{
  "summary": "상호 검토 후 심사위원이 우선 재확인할 누락·모순·리스크 중심 요약",
  "documentSections": [],
  "evaluationPreview": [{
    "itemId": "항목 id",
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "상호 검토를 반영한 근거 (다른 AI 지적 중 자료로 확인된 사항 명시)",
    "recommendation": "보완·검토 조치",
    "lawRefs": [],
    "guidelineRefs": []
  }]
}

프로젝트: ${context.project?.name ?? "미지정"} · ${context.project?.location ?? ""}`;
}

export function buildArbiterSynthesisPrompt(input: {
  arbiterProvider: AiProviderId;
  providerAnalyses: Array<{ provider: AiProviderId; analysis: UploadAnalysisResult }>;
  files: UploadedFileSummary[];
  context: EvaluationContext;
  items: EvaluationItem[];
}): string {
  const { arbiterProvider, providerAnalyses, files, context, items } = input;
  const pageCorpus = buildCompactPageCorpus(files);
  const analysesBlock = providerAnalyses
    .map((entry) => summarizePeerAnalysis(entry.provider, entry.analysis))
    .join("\n\n");

  const itemList = items
    .map((item, index) => `${index + 1}. [${item.id}] ${item.detailItem} (배점 ${item.points})`)
    .join("\n");

  return `당신은 ${formatProviderBadgeLabel(arbiterProvider)} AI 평가 **중재자**입니다.
Gemini·ChatGPT·Claude 등 여러 AI 엔진의 초기 분석을 교차 검토하고, 잘못된 추측·환각·근거 없는 주장을 걸러낸 **최종 종합 평가안**을 작성하세요.

## 검토 원칙
- 여러 AI가 공통으로 지적한 사항은 우선 반영하세요.
- 한 AI만 주장하고 자료로 확인되지 않으면 제외하거나 "자료 미확인"으로 명시하세요.
- 점수는 근거가 가장 탄탄한 방향으로 조정하되, 엔진 간 차이가 크면 보수적으로 책정하세요.
- rationale·recommendation에는 칭찬·긍정 평가를 쓰지 말고, 누락·미기재·모순·기준 미달만 구체적으로 적으세요.
- PDF·도면 인용은 「파일명」 p.N 형식을 유지하세요.

## 평가항목
${itemList}

## 자료 페이지 색인 (요약)
${pageCorpus || "페이지 색인 없음"}

## 각 AI 엔진 초기 분석
${analysesBlock}

## 출력
아래 JSON 스키마만 반환하세요. documentSections는 생략해도 됩니다(빈 배열).
{
  "summary": "다중 AI 교차 검토 후 심사위원이 우선 재확인할 누락·모순·리스크 중심 요약",
  "documentSections": [],
  "evaluationPreview": [{
    "itemId": "항목 id",
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "교차 검토를 반영한 근거",
    "recommendation": "보완·검토 조치",
    "lawRefs": [],
    "guidelineRefs": []
  }]
}

프로젝트: ${context.project?.name ?? "미지정"} · ${context.project?.location ?? ""}`;
}
