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
첨부된 PDF 원본·페이지 이미지·사진을 모두 읽어 배치도·입면도·조감도·스캔 문서 속 글자(OCR)까지 확인하라.
이 시스템의 목적은 심사위원이 재확인할 **수정·보완·검토 사항**을 상세히 제공하는 것이다. 잘된 점·칭찬·긍정 평가는 쓰지 말고, 문제·누락·모순·불명확·기준 미달·추가 확인이 필요한 사항만 구체적으로 적어라.
반드시 아래 실시간 법령·경관지구 정보를 근거로 활용하고, 평가기준 대비 어떤 부분이 미흡한지 rationale에 명시하라.
예상치 못한 누락·모순·안전·접근성·경관 저해 요소가 있으면 반드시 지적하라. 글자 수 제한 없이 필요한 만큼 길게 써도 된다.

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
- documentSections는 업로드 자료에서 실제로 확인한 항목만 작성하라. **각 label마다 summary 내용이 서로 달라야 한다.** 모든 항목에 동일한 문장을 반복하지 마라.
- documentSections의 summary는 해당 도면·계획 유형(건축개요, 배치도 등)에서 **확인된 내용 1~2문장**과 **그 유형에서 누락·불명확·추가 검토 필요 사항**만 적는다. 칭찬·긍정 평가 금지.
- 추출된 본문과 첨부 비전 자료(PDF·이미지)를 모두 활용하라. 글자 수 제한 없이 자료 전체를 꼼꼼히 읽어라.
- evaluationPreview의 lawRefs에는 해당 항목 점수 산정에 실제로 참고한 법령·조문만 적어라. 위 법령 목록에 없는 조문은 인용하지 마라.
- evaluationPreview의 guidelineRefs에는 해당 항목에 실제로 참고한 행정규칙·지침만 적어라. 위 지침 목록에 없는 항목은 인용하지 마라.
{
  "summary": "심사위원이 우선 재확인해야 할 누락·모순·리스크·보완 필요 사항 중심 요약 (잘된 점·칭찬 금지)",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "해당 자료에서 확인된 내용과 누락·불명확·추가 제출 필요 사항" }],
  "evaluationPreview": [{
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "평가기준 대비 미흡·누락·모순·불명확·추가 검토 필요 사항 (아래 작성 규칙 준수)",
    "recommendation": "심의위원이 실시설계·보완 시 확인할 수정·보완·검토 사항 (아래 작성 규칙 준수)",
    "lawRefs": ["경관의 법률 제28조"],
    "guidelineRefs": ["서울색 적용 가이드 4.4"]
  }]
}

평가항목 후보:
${items
  .map((item) => `- ${item.detailItem} (배점 ${item.points}): ${item.criteria}`)
  .join("\n")}

공통 작성 원칙 (rationale·recommendation·summary 모두 적용):
- **잘된 점·칭찬·긍정 평가를 쓰지 말 것.** "우수", "적절", "잘 반영", "충분", "양호", "만족" 등 긍정 표현 금지.
- **수정·보완·재검토·추가 확인이 필요한 사항만** 상세히 쓸 것. 점수가 높아도(매우우수·우수) 자료에서 확인되지 않았거나 약한 부분·심사위원이 현장·도면에서 다시 봐야 할 쟁점만 지적.
- 각 항목마다 **최소 3개 이상**의 구체적 검토 포인트를 제시할 것. 가능한 한 길고 상세하게.
- 근거 자료(「파일명」, 도면명, 본문 인용), 위치·공간, 문제, 보완·검토 조치를 반드시 포함.

rationale 작성 규칙 (검토 필요 사항 중심):
- 평가기준(${items.length > 0 ? "각 항목 criteria 참고" : "항목별 criteria"}) 대비 **어떤 부분이 미흡·누락·모순·불명확한지**를 중심으로 쓴다.
- 구조: [근거 자료에서 확인한 사실 1문장] → [평가기준 대비 문제·누락·모순 나열] → [법령·경관지구 맥락에서 추가 검토 필요 사항].
- 도면·계획서에 **없거나**, **수치·재료·시공 상세가 빠졌거나**, **동선·공간 관계가 불명확한** 항목을 구체적으로 적는다.
- 점수 산정 이유는 간략히 포함하되, **감점·보류·재검토 사유** 위주로 쓴다.

recommendation 작성 규칙 (수정·보완·검토 지시 중심):
- 심의위원이 실시설계·보완 단계에 전달하는 **검토·보완 요청** 문체. 종결은 "~하시기 바랍니다." 또는 "~재확인 하시기 바랍니다."
- 구조: [근거 자료·위치] → [구체적 문제 2~5개를 ①②③으로 각 줄에 하나씩 나열] → [실행 가능한 보완·검토 조치].
- ①②③ 번호 앞에는 반드시 줄바꿈(\\n)을 넣어 가독성을 높인다.
- 각 문제마다 **어느 도면·어느 공간·무엇이 빠졌는지**를 명시한다.
- 보완 조치 예: 난간 높이, 계단 단·경사, 미끄럼 방지, 차양·그늘, 조도·눈부심, 식재·관리, 색채·마감재, 보행 동선, 도면 누락, 수치·재료 명시, 시공 상세도 추가 등.
- 자료에 없는 내용은 추측하지 말고, 확인된 범위 안에서만 쓴다.
- 본문 인용("…")·파일명·법령 인용 규칙은 기존과 동일(환각 금지).
- 모호한 일반 문구 금지:
  × "핵심적인 접근성 및 안전성 확보 방안에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."
  × "○○ 항목에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."

recommendation 작성 예시 (문제·검토 중심):
"「사업계획서.pdf」 배치도·보행동선도 기준, 증축으로 확보되는 2층 옥외공간 관련하여 다음 사항의 수정·보완·재확인이 필요합니다.\n① 고령 이용자 휴게·이동 동선상 계단 단 높이·경사 및 미끄럼 방지 바닥재 기준이 도면·계획서에 수치로 제시되지 않음\n② 옥외 휴게 구간 난간 높이·차양(계단에서 출입구 이동) 설치 위치가 도면에 표기되지 않음\n③ 해당 구간 조도·그늘 확보 방안이 야간경관·조경 계획과 연계되어 있지 않아 실시설계 단계에서 상호 검토가 필요함\n\n위 항목을 관련 도면에 수치·재료·시공 상세와 함께 구체화 하시기 바랍니다."

summary 작성 규칙:
- 전체 자료에서 심사위원이 **우선 재확인해야 할** 누락·모순·리스크·항목 간 불일치만 요약한다. 잘된 점·전반적 칭찬 금지.${
    options?.compact
      ? `

분할 분석 안내:
- 이번 응답은 일부 평가항목만 다룬다. 각 항목의 rationale·recommendation은 **검토·보완 필요 사항**을 자료 근거와 함께 충분히 길게 서술하라.`
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
