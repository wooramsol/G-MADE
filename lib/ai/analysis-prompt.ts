import { evaluationItems as defaultEvaluationItems } from "../demo-data";
import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary } from "./analysis-types";
import type { AnalysisPromptOptions } from "./analysis-prompt-options";

export function buildAnalysisPrompt(
  files: UploadedFileSummary[],
  context: EvaluationContext,
  items: EvaluationItem[] = defaultEvaluationItems,
  options?: AnalysisPromptOptions,
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
      ? `실시간 법령·자치법규 근거 (${context.lawSource}, ${context.fetchedAt}):
${context.referenceLaws
  .map(
    (law, index) =>
      `${index + 1}. ${law.title} ${law.article}
   요약: ${law.summary}
   출처: ${law.sourceUrl}`,
  )
  .join("\n")}`
      : "실시간 법령·자치법규 근거: 없음";

  const guidelineBlock =
    context.guidelines.length > 0
      ? `실시간 행정규칙·지침 근거 (${context.guidelineSource}, ${context.fetchedAt}):
${context.guidelines
  .map(
    (guide, index) =>
      `${index + 1}. ${guide.title} ${guide.section}
   요약: ${guide.summary}
   출처: ${guide.sourceUrl ?? "내장 요약"}`,
  )
  .join("\n")}`
      : "";

  return `업로드된 심의 자료를 면밀히 분석하고 경관·공공디자인 심의 관점에서 평가하라.
반드시 아래 실시간 법령·경관지구 정보를 근거로 활용하고, rationale에 어떤 법령·경관지구 맥락을 참고했는지 명시하라.
업로드 자료에서 확인한 층수, 공간명(옥외·옥상·공개공지·증축부 등), 이용자 유형(고령·보행약자 등), 동선, 마감·조경·조명 계획을 evaluationPreview의 rationale과 recommendation에 구체적으로 반영하라.

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
- evaluationPreview는 아래 평가항목 후보 전체에 대해 각 1개씩, 같은 순서로 작성하고, itemName에는 평가항목 후보의 이름을 글자 그대로 복사하라.
- evaluationPreview의 lawRefs에는 해당 항목 점수 산정에 실제로 참고한 법령·조문만 적어라. 위 법령 목록에 없는 조문은 인용하지 마라.
- evaluationPreview의 guidelineRefs에는 해당 항목에 실제로 참고한 행정규칙·지침만 적어라. 위 지침 목록에 없는 항목은 인용하지 마라.
{
  "summary": "전체 분석 요약 (법령·경관지구 맥락 반영)",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "추출 요약" }],
  "evaluationPreview": [{
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "점수 산정 근거 (인용한 법령 조문·경관지구명·자료에서 확인한 공간·계획 요소 포함)",
    "recommendation": "심의위원 평가의견형 개선권고 (아래 작성 규칙 준수)",
    "lawRefs": ["경관의 법률 제28조"],
    "guidelineRefs": ["서울색 적용 가이드 4.4"]
  }]
}

평가항목 후보:
${items
  .map((item) => `- ${item.detailItem} (배점 ${item.points}): ${item.criteria}`)
  .join("\n")}

recommendation 작성 규칙 (필수):
- 심의위원이 실시설계 단계에 전달하는 평가의견 문체로 작성한다. 종결은 "~하시기 바랍니다." 형식을 사용한다.
- 업로드 자료에서 실제로 확인한 공간·층수·이용자·시설 요소를 문장 안에 명시한다. 자료에 없는 내용은 추측하지 말고, 확인된 범위 안에서만 쓴다.
- 보완이 필요한 경우 난간 높이, 계단 단 높이·경사, 바닥 미끄럼 방지, 차양·그늘, 조도·눈부심, 식재·관리, 색채·마감재, 보행 동선 등 실행 가능한 설계·시공 조치를 2~4개 나열한다.
- "심사위원 검토가 필요합니다", "보완 여부를 확인해야 합니다"처럼 항목명만 바꾼 일반 문구는 금지한다.
- 점수가 우수해도 유지·강화가 필요한 세부 조치가 있으면 recommendation에 구체적으로 적는다.

recommendation 작성 예시:
"본 사업으로 가능하다면 증축으로 확보되는 2층 옥외공간이 고령 이용자의 휴게·교류 공간으로 안정적으로 활용될 수 있도록, 난간 높이, 계단 단 높이 조정, 바닥 미끄럼 방지, 차양(계단에서 출입구 이동) 등 안전·쾌적성 확보 방안을 실시설계 단계에서 보다 구체화 하시기 바랍니다."${
    options?.compact
      ? `

출력 길이 제한 (필수):
- rationale은 200자 이내, recommendation은 350자 이내로 작성한다.
- documentSections.summary도 각 120자 이내로 간결히 작성한다.`
      : ""
  }${
    options?.evaluationOnly
      ? `

이번 응답 범위:
- documentSections는 반드시 빈 배열 []로 반환한다.
- evaluationPreview만 아래 평가항목 후보에 대해 작성한다.`
      : ""
  }`;
}
