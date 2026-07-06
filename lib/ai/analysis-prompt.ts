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
- documentSections의 summary는 **평가·판단·보완 요청을 절대 쓰지 말고**, 해당 label(도면·계획 유형)을 이해하기 위해 **읽은 위치만** 나열한다. 형식: 「파일명」 p.N 도면명·목차·섹션명 — (해당 위치에서 확인한 사실 1줄, 인용 가능). 여러 위치는 줄바꿈으로 1. 2. 3. 목록. "미기재", "불명확", "보완 필요", "심사위원 재확인", "미흡", "저촉" 등 평가·검토 표현 금지.

documentSections 작성 예시 (위치 목록만, 평가 없음):
"1. 「심의도서.pdf」 p.2 01. 사업개요 — 사업명·위치·규모 기재\n2. 「심의도서.pdf」 p.2 02. 경관자원 및 특성 2.1~2.4 — 주변 경관·식생 현황\n3. 「심의도서.pdf」 p.11 공공디자인 체크리스트 — 편의시설·점자블록 항목 표"
- 추출된 본문과 첨부 비전 자료(PDF·이미지)를 모두 활용하라. 글자 수 제한 없이 자료 전체를 꼼꼼히 읽어라.
- evaluationPreview의 lawRefs에는 해당 항목 점수 산정에 실제로 참고한 법령·조문만 적어라. 위 법령 목록에 없는 조문은 인용하지 마라.
- evaluationPreview의 guidelineRefs에는 해당 항목에 실제로 참고한 행정규칙·지침만 적어라. 위 지침 목록에 없는 항목은 인용하지 마라.
{
  "summary": "심사위원이 우선 재확인해야 할 누락·모순·리스크·보완 필요 사항 중심 요약 (잘된 점·칭찬 금지)",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "「파일명」 p.N 섹션명 — 확인한 사실 (평가·판단 없이 읽은 위치 목록)" }],
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

공통 작성 원칙 (rationale·recommendation·summary 적용, documentSections 제외):
- **잘된 점·칭찬·긍정 평가를 쓰지 말 것.** "우수", "적절", "잘 반영", "충분", "양호", "만족" 등 긍정 표현 금지.
- **수정·보완·재검토·추가 확인이 필요한 사항만** 상세히 쓸 것. 점수가 높아도(매우우수·우수) 자료에서 확인되지 않았거나 약한 부분·심사위원이 현장·도면에서 다시 봐야 할 쟁점만 지적.
- 각 항목마다 **2~4개**의 구체적 검토 포인트. **항목당 1줄·80자 내외**로 간결히. 같은 문장·근거 반복 금지.
- **파일명「…」은 rationale 첫 줄에 한 번만** 쓰고, 번호 목록 항목에는 **p.N·도면명만** 적는다.
- **목차·차례 페이지는 배치도·입면도 등 도면 근거로 인용하지 말 것.** 목차에 도면명이 나열되어 있어도, 해당 도면이 실제로 있는 페이지만 p.N으로 적는다.
- **섹션 제목만 있는 페이지(예: "03 배치도" 타이틀 슬라이드)는 도면 본문 페이지가 아니다.** 같은 이름의 실제 도면·수치·표가 있는 다음 페이지를 인용하라.
- **"02 경관자원 및 경관특성"처럼 장·절 구분 타이틀 페이지도 근거로 쓰지 말 것.** 본문·도면·사진·지도가 실제로 있는 페이지만 p.N으로 적는다.
- 근거 자료(「파일명」 p.N 또는 N면, 도면명, 본문 인용), 위치·공간, 문제, 법령·지침 조항, 보완·검토 조치를 반드시 포함.
- PDF·PPTX·다면 문서에서 문제를 지적할 때는 **반드시 페이지(면) 번호**를 적는다. 예: 「사업계획서.pdf」 p.3 배치도, 「제출자료.pptx」 5면.
- 추출 본문의 "--- 「파일명」 p.N ---" 구분선을 참고해 페이지를 특정한다. 비전(PDF 원본)으로 읽은 경우에도 PDF 뷰어 기준 페이지를 적는다.

rationale 작성 규칙 (평가 근거 — 법령·지침 저촉 중심):
- 평가기준(${items.length > 0 ? "각 항목 criteria 참고" : "항목별 criteria"}) 대비 **어떤 부분이 미흡·누락·모순·불명확한지**를 중심으로 쓴다.
- **각 검토 포인트마다** 아래 3요소를 한 줄에 연결: ①「파일명」 p.N 도면·섹션·본문 인용 ② 위 내용의 문제(누락·모순·미달) ③ 위 실시간 법령·지침 목록의 **구체 조항**(예: 경관의 법률 제28조, ○○ 지침 N.N)과 **어떻게 저촉·미달되는지**.
- 구조: 1. 2. 3. 번호 목록. 각 항목은 "p.N 도면·섹션 — (문제) — (법령·지침 조항) 저촉·미달" 형태. **서두 설명 중복 금지.**
- lawRefs·guidelineRefs에 적은 조항과 rationale 본문 인용이 **일치**해야 한다. 목록에 없는 조문은 쓰지 마라.
- 도면·계획서에 **없거나**, **수치·재료·시공 상세가 빠졌거나**, **동선·공간 관계가 불명확한** 항목을 구체적으로 적는다.
- 점수 산정 이유는 간략히 포함하되, **감점·보류·재검토 사유** 위주로 쓴다. rationale에 recommendation과 동일한 보완 지시 문장을 넣지 마라.

recommendation 작성 규칙 (수정·보완·검토 지시 — rationale 비반복):
- rationale에서 이미 쓴 근거·문제 설명·법령 인용을 **다시 쓰지 말 것.** 실행 가능한 보완·검토 조치만 적는다.
- 심의위원이 실시설계·보완 단계에 전달하는 **검토·보완 요청** 문체. 종결은 "~하시기 바랍니다." 또는 "~재확인 하시기 바랍니다."
- 구조: [보완 대상 위치 「파일명」 p.N] → [조치 2~4개를 1. 2. 3. 형식으로 각 줄에 하나씩 나열].
- ①②③ 같은 원문자 번호는 쓰지 말고, 반드시 1. 2. 3. 같은 단순 숫자만 사용한다. 각 번호 앞에는 줄바꿈(\\n)을 넣어 가독성을 높인다.
- 각 문제마다 **어느 파일·몇 페이지(면)·어느 도면·어느 공간**인지를 명시한다.
- 보완 조치 예: 난간 높이, 계단 단·경사, 미끄럼 방지, 차양·그늘, 조도·눈부심, 식재·관리, 색채·마감재, 보행 동선, 도면 누락, 수치·재료 명시, 시공 상세도 추가 등.
- 자료에 없는 내용은 추측하지 말고, 확인된 범위 안에서만 쓴다.
- 본문 인용("…")·파일명·법령 인용 규칙은 기존과 동일(환각 금지).
- 모호한 일반 문구 금지:
  × "핵심적인 접근성 및 안전성 확보 방안에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."
  × "○○ 항목에 대한 구체적인 계획이 미흡하여 보완이 필요합니다."

rationale 작성 예시 (페이지·법령 저촉 명시):
"1. 「심의도서.pdf」 p.12 공공디자인 경관체크리스트 '고광택 재료 회피' 항목 — p.31 색채계획의 Steel N7 마감재가 고광택 소재로 해석될 여지 — 경관의 법률 제28조 및 경관 심의 운영 지침 색채·재료 기준 관련 저촉 검토 필요\n2. 「심의도서.pdf」 p.25 주차·보행 동선도 — 장애인 주차 3면 위치 표기 없음 — 장애인·노인·임산부 등의 편의증진 보장에 관한 법률 제19조 주차시설 설치 기준 미달"

recommendation 작성 예시 (조치만, rationale 비반복):
"「심의도서.pdf」 p.31·p.12 관련:\n1. Steel N7 마감재의 광택도·반사율 수치를 p.31 색채계획에 명시하고 p.12 체크리스트와 대조표를 추가하시기 바랍니다.\n2. p.25 주차·보행 동선도에 장애인 주차 3면 위치·규격을 표기하시기 바랍니다."

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
