import { formatUploadDateTime } from "@/lib/format-datetime";
import { DEFAULT_AI_WEIGHT, DEFAULT_EXPERT_WEIGHT } from "./evaluation-weight-requirements";
import type { EvaluationItem, EvaluationRound } from "./types";

function buildDemoDocumentSections(items: EvaluationItem[]) {
  const demoSummaries: Record<string, string> = {
    "item-urban-scale": "1. 「사업계획서.pdf」 p.12 조감도 — 주변 건물 높이·매스 배치 확인",
    "item-facade": "1. 「사업계획서.pdf」 p.14 입면도 — 입면 분절·마감재 계획 확인",
    "item-color": "1. 「사업계획서.pdf」 p.16 색채계획 — 주조색·강조색 팔레트 확인",
    "item-nightscape": "1. 「사업계획서.pdf」 p.18 야간경관 — 조명 배치·휘도 계획 확인",
    "item-walk": "1. 「사업계획서.pdf」 p.11 배치도 — 보행 동선·주차장 배치 확인",
    "item-green": "1. 「사업계획서.pdf」 p.20 녹지계획 — 식재·조경 계획 확인",
    "item-public-space": "1. 「사업계획서.pdf」 p.11 배치도 — 공개공지·휴게 공간 위치 확인",
    "item-context-document": "1. 「사업계획서.pdf」 p.2 건축개요 — 사업명·규모·제출 도면 목록 확인",
  };

  return items.map((item, index) => ({
    itemId: item.id,
    label: item.detailItem,
    confidence: 92 - index * 2,
    summary: demoSummaries[item.id] ?? `1. 「사업계획서.pdf」 — ${item.detailItem} 관련 제출 자료 확인`,
  }));
}

export function createDemoEvaluationRounds(
  projectId: string,
  count: number,
  items: EvaluationItem[],
  baseDate = "2026-06-04",
): EvaluationRound[] {
  const previewItems = items.slice(0, 4);

  return Array.from({ length: count }, (_, index) => {
    const roundNumber = index + 1;
    const evaluatedAt = new Date(baseDate);
    evaluatedAt.setDate(evaluatedAt.getDate() - (count - roundNumber) * 3);

    return {
      id: `${projectId}-round-${roundNumber}`,
      evaluatedAt: evaluatedAt.toISOString(),
      aiWeight: DEFAULT_AI_WEIGHT,
      expertWeight: DEFAULT_EXPERT_WEIGHT,
      evaluationItems: previewItems.map((item) => ({ ...item })),
      totalPoints: previewItems.reduce((sum, item) => sum + item.points, 0),
      reviewerName: roundNumber % 2 === 1 ? "김민정 위원" : "박준호 위원",
      expertSummary:
        roundNumber === count ? "전반적으로 계획 방향은 적정하나 실시설계 단계 보완이 필요합니다." : undefined,
      aiFiles: [
        {
          id: `${projectId}-ai-${roundNumber}`,
          originalName: "사업계획서.pdf",
          fileType: "PDF",
          sizeBytes: 2_048_000,
        },
      ],
      expertFiles: [
        {
          id: `${projectId}-expert-${roundNumber}`,
          originalName: "전문가평가표.xlsx",
          fileType: "XLSX",
          sizeBytes: 512_000,
        },
      ],
      aiAnalysis: {
        provider: "demo",
        mode: "demo",
        summary: `${formatUploadDateTime(evaluatedAt.toISOString())} AI·전문가 하이브리드 평가 분석이 완료되었습니다.`,
        documentSections: buildDemoDocumentSections(previewItems),
        evaluationPreview: previewItems.map((item, itemIndex) => ({
          itemId: item.id,
          itemName: item.detailItem,
          score: 82 - itemIndex * 2,
          grade: "B+",
          rationale: item.criteria,
          recommendation: "심사위원 검토 후 보완 여부를 확인해야 합니다.",
          laws: [],
          guidelines: [],
        })),
        warnings: ["데모 분석 모드로 생성된 예시 평가 결과입니다."],
      },
      expertItemScores: previewItems.map((item, itemIndex) => ({
        itemId: item.id,
        score: 78 + itemIndex,
        comment: "전문가 평가 자료를 바탕으로 점수를 산정했습니다.",
      })),
    };
  });
}
