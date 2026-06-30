import { evaluationItems as defaultEvaluationItems } from "../demo-data";
import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import type { UploadedFileSummary } from "./analysis-types";
import type { AnalysisPromptOptions } from "./analysis-prompt-options";
import { summarizeVisionCoverage } from "./multimodal-payload";

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
첨부된 PDF 원본·페이지 이미지·사진을 모두 읽어 배치도·입면도·조감도·스캔 문서 속 글자(OCR)까지 확인하라. 텍스트 추출본만으로 놓칠 수 있는 도면·그림·표·범례·치수·주석도 비전 자료에서 직접 검토하라.
반드시 아래 실시간 법령·경관지구 정보를 근거로 활용하고, rationale에 어떤 법령·경관지구 맥락을 참고했는지 명시하라.
업로드 자료에서 확인한 층수, 공간명(옥외·옥상·공개공지·증축부 등), 이용자 유형(고령·보행약자 등), 동선, 마감·조경·조명 계획을 evaluationPreview의 rationale과 recommendation에 구체적으로 반영하라.
예상치 못한 누락·모순·안전·접근성·경관 저해 요소가 있으면 반드시 지적하라.

${projectBlock}

${spatialBlock}

${lawBlock}

${guidelineBlock}

비전 분석 범위: ${summarizeVisionCoverage(files)}

파일 목록:
${files
  .map(
    (file, index) =>
      `${index + 1}. ${file.originalName} (${file.fileType}, ${file.sizeBytes} bytes)\n추출된 본문(전체): ${file.extractedTextPreview || "텍스트 추출 불가 — 비전 자료로 분석"}`,
  )
  .join("\n\n")}

반환 JSON 스키마:
- documentSections는 건축개요, 배치도, 입면도, 조감도, 색채계획, 야간경관, 보행동선, 녹지계획, 공공공간, 주변현황 등 업로드 자료에서 실제로 확인한 항목만 작성하라.
- 추출된 본문과 첨부 비전 자료(PDF·이미지)를 모두 활용하라. 글자 수 제한 없이 자료 전체를 꼼꼼히 읽어라.
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
- 반드시 [근거 자료] + [확인된 위치·공간] + [구체적 문제] + [실행 가능한 보완 조치] 순서로 쓴다.
- 근거 자료에는 파일명·도면명(배치도, 입면도, 조감도 등) 또는 본문에서 확인한 구절을 인용한다.
- 업로드 자료에서 실제로 확인한 공간·층수·이용자·시설 요소를 문장 안에 명시한다. 자료에 없는 내용은 추측하지 말고, 확인된 범위 안에서만 쓴다.
- 본문 인용("…")은 추출 텍스트·비전에서 실제로 읽은 문장만 사용한다. 자료에 없는 문장을 만들어 인용하지 마라.
- 파일명·도면명은 업로드 목록에 있는 이름만 쓴다. 목록에 없는 도면·파일을 지어내지 마라.
- 법령·지침 인용은 위에 제공된 실시간 조회 목록에 있는 조문·항목만 사용한다.
- 보완이 필요한 경우 난간 높이, 계단 단 높이·경사, 바닥 미끄럼 방지, 차양·그늘, 조도·눈부심, 식재·관리, 색채·마감재, 보행 동선 등 실행 가능한 설계·시공 조치를 2~4개 나열한다.
- "심사위원 검토가 필요합니다", "보완 여부를 확인해야 합니다"처럼 항목명만 바꾼 일반 문구는 금지한다.
- 아래와 같이 항목명만 바꾼 모호한 문장은 금지한다:
  × "핵심적인 접근성 및 안전성 확보 방안에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."
  × "○○ 항목에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."
- rationale에도 동일하게 적용한다. 점수 근거에는 어떤 자료·도면·공간에서 무엇을 확인했는지 반드시 적는다.
- 점수가 우수해도 유지·강화가 필요한 세부 조치가 있으면 recommendation에 구체적으로 적는다.

recommendation 작성 예시:
"본 사업으로 가능하다면 증축으로 확보되는 2층 옥외공간이 고령 이용자의 휴게·교류 공간으로 안정적으로 활용될 수 있도록, 난간 높이, 계단 단 높이 조정, 바닥 미끄럼 방지, 차양(계단에서 출입구 이동) 등 안전·쾌적성 확보 방안을 실시설계 단계에서 보다 구체화 하시기 바랍니다."${
    options?.compact
      ? `

분할 분석 안내:
- 이번 응답은 일부 평가항목만 다룬다. 각 항목의 rationale·recommendation은 자료에서 확인한 구체적 근거를 충분히 서술하라.`
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
