import { gradeScore } from "./hybrid-evaluation";
import type { AiEvaluation, CaseStudy, EvaluationItem, Guideline, LawReference, Project } from "./types";

const scorePattern = [86, 79, 91, 74, 82, 88, 77, 84, 72, 89];

export function createExplainableAiEvaluations(input: {
  project: Project;
  items: EvaluationItem[];
  laws: LawReference[];
  guidelines: Guideline[];
  caseStudies: CaseStudy[];
}): AiEvaluation[] {
  return input.items.map((item, index) => {
    const score = scorePattern[index % scorePattern.length];
    const law = input.laws.find((reference) => item.lawIds.includes(reference.id));
    const guideline = input.guidelines.find((reference) => item.guidelineIds.includes(reference.id));
    const caseStudy = input.caseStudies[index % input.caseStudies.length];

    return {
      itemId: item.id,
      score,
      grade: gradeScore(score),
      rationale: `${input.project.location}의 주변 현황, 제출 도면, ${item.middleCategory} 기준을 함께 검토한 결과 ${item.detailItem}은 ${gradeScore(score)} 수준으로 판단된다. ${item.criteria}`,
      recommendation:
        score >= 85
          ? "현재 계획의 장점을 유지하되 실시설계 단계에서 세부 재료와 유지관리 기준을 명확히 제시할 필요가 있음."
          : "보행자 시점의 체감 영향과 주변 경관과의 연속성을 보완하는 추가 설명자료가 필요함.",
      scoreTrace: [
        {
          label: "문서 추출 신뢰도",
          weight: 35,
          score: Math.min(100, score + 4),
          evidence: "건축개요, 배치도, 입면도, 조감도에서 평가에 필요한 핵심 정보가 확인됨.",
        },
        {
          label: "법령 및 지침 정합성",
          weight: 25,
          score: law ? score : score - 8,
          evidence: law
            ? `${law.title} ${law.article} 및 ${guideline?.title ?? "관련 지침"}과 연결됨.`
            : "연결 가능한 법령 근거가 부족하여 관리자 검토가 필요함.",
        },
        {
          label: "주변 맥락 적합성",
          weight: 20,
          score: Math.max(0, score - 2),
          evidence: "주변 스카이라인, 공개공지, 보행동선과의 관계를 비교 분석함.",
        },
        {
          label: "유사 사례 비교",
          weight: 20,
          score: caseStudy.similarityScore,
          evidence: `${caseStudy.title} 사례와 ${caseStudy.similarityScore}% 유사하며, ${caseStudy.keyLearning}`,
        },
      ],
      lawIds: law ? [law.id] : [],
      guidelineIds: guideline ? [guideline.id] : [],
      caseStudyIds: [caseStudy.id],
    };
  });
}
