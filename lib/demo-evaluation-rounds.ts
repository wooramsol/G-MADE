import type { EvaluationItem, EvaluationRound } from "./types";

const DEMO_SECTIONS = [
  { label: "건축개요", confidence: 92, summary: "용도, 규모, 시행자 정보가 확인되었습니다." },
  { label: "배치도", confidence: 88, summary: "주 출입구와 공개공지 위치가 확인되었습니다." },
  { label: "입면도", confidence: 84, summary: "입면 분절과 마감재 계획이 확인되었습니다." },
  { label: "조감도", confidence: 80, summary: "주요 조망축에서의 매스 영향이 확인되었습니다." },
];

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
      aiWeight: 30,
      expertWeight: 70,
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
        summary: `${roundNumber}차 AI·전문가 하이브리드 평가 분석이 완료되었습니다.`,
        documentSections: DEMO_SECTIONS,
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
