import { evaluationItems as defaultEvaluationItems } from "../demo-data";
import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary } from "./analysis-types";

export function buildAnalysisPrompt(
  files: UploadedFileSummary[],
  context: EvaluationContext,
  items: EvaluationItem[] = defaultEvaluationItems,
): string {
  const projectBlock = context.project
    ? `프로젝트 정보:
- 사업명: ${context.project.name}
- 사업위치: ${context.project.location}
- 심의종류: ${context.project.reviewType}
- 사업유형: ${context.project.projectType}
- 좌표: ${context.project.locationPoint ? `${context.project.locationPoint.y}, ${context.project.locationPoint.x}` : "미지정"}`
    : "프로젝트 정보: 없음 (파일만 분석)";

  const spatialBlock = context.spatial
    ? `경관지구 공간정보 (브이월드 실시간, ${context.fetchedAt}):
- 조회 주소: ${context.spatial.address}
- 경관지구 해당: ${context.spatial.inLandscapeZone ? "해당 가능" : "인근 조회 결과 없음"}
- 매칭 경관지구: ${
        context.spatial.matchedZones.length > 0
          ? context.spatial.matchedZones
              .map((zone) => `${zone.name}(코드 ${zone.code}, ${zone.jurisdiction}, 지정 ${zone.designationYear})`)
              .join("; ")
          : "없음"
      }
- 참고: ${context.spatial.disclaimer}`
    : "경관지구 공간정보: 조회 불가 또는 미연동";

  const lawBlock =
    context.referenceLaws.length > 0
      ? `실시간 법령 근거 (${context.lawSource}, ${context.fetchedAt}):
${context.referenceLaws
  .map(
    (law, index) =>
      `${index + 1}. ${law.title} ${law.article}
   요약: ${law.summary}
   출처: ${law.sourceUrl}`,
  )
  .join("\n")}`
      : "실시간 법령 근거: 없음";

  const guidelineBlock =
    context.guidelines.length > 0
      ? `관련 지침 후보:
${context.guidelines.map((guide) => `- ${guide.title} ${guide.section}: ${guide.summary}`).join("\n")}`
      : "";

  return `업로드된 심의 자료를 분석하고 경관·공공디자인 심의 관점에서 평가하라.
반드시 아래 실시간 법령·경관지구 정보를 근거로 활용하고, rationale에 어떤 법령·경관지구 맥락을 참고했는지 명시하라.

${projectBlock}

${spatialBlock}

${lawBlock}

${guidelineBlock}

파일 목록:
${files
  .map(
    (file, index) =>
      `${index + 1}. ${file.originalName} (${file.fileType}, ${file.sizeBytes} bytes)\n추출된 본문: ${file.extractedTextPreview || "텍스트 추출 불가 또는 이미지/도면 자료"}`,
  )
  .join("\n\n")}

반환 JSON 스키마:
- documentSections는 건축개요, 배치도, 입면도, 조감도, 색채계획, 야간경관, 보행동선, 녹지계획, 공공공간, 주변현황 등 업로드 자료에서 실제로 확인한 항목만 작성하라.
- PDF·DOCX·PPTX에서 추출된 본문을 우선 활용하라. 매우 긴 문서는 앞부분만 포함될 수 있다.
- evaluationPreview의 lawRefs에는 해당 항목 점수 산정에 실제로 참고한 법령·조문만 적어라. 위 법령 목록에 없는 조문은 인용하지 마라.
{
  "summary": "전체 분석 요약 (법령·경관지구 맥락 반영)",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "추출 요약" }],
  "evaluationPreview": [{
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "점수 산정 근거 (인용한 법령 조문·경관지구명 포함)",
    "recommendation": "개선권고사항",
    "lawRefs": ["경관의 법률 제28조"],
    "guidelineRefs": ["서울색 적용 가이드 4.4"]
  }]
}

평가항목 후보:
${items
  .map((item) => `- ${item.detailItem} (배점 ${item.points}): ${item.criteria}`)
  .join("\n")}`;
}
