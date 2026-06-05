import { evaluationItems, guidelines, laws } from "../demo-data";
import type { UploadedFileSummary } from "./analysis-types";

export function buildAnalysisPrompt(files: UploadedFileSummary[]): string {
  return `업로드된 심의 자료를 분석해라.

파일 목록:
${files
  .map(
    (file, index) =>
      `${index + 1}. ${file.originalName} (${file.fileType}, ${file.sizeBytes} bytes)\n텍스트 미리보기: ${file.extractedTextPreview || "텍스트 추출 불가 또는 이미지/도면 자료"}`,
  )
  .join("\n\n")}

반환 JSON 스키마:
{
  "summary": "전체 분석 요약",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "추출 요약" }],
  "evaluationPreview": [{
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "점수 산정 근거",
    "recommendation": "개선권고사항"
  }]
}

평가항목 후보:
${evaluationItems
  .slice(0, 6)
  .map((item) => `- ${item.detailItem}: ${item.criteria}`)
  .join("\n")}

관련 법령 후보:
${laws
  .slice(0, 3)
  .map((law) => `- ${law.title} ${law.article}: ${law.summary}`)
  .join("\n")}

관련 지침 후보:
${guidelines
  .slice(0, 3)
  .map((guide) => `- ${guide.title} ${guide.section}: ${guide.summary}`)
  .join("\n")}`;
}
