import type { EvaluationContext } from "../evaluation-context";
import type { UploadedFileSummary } from "./analysis-types";
import type { EvaluationItem } from "../types";

export const PROBE_SAMPLE_TEXT =
  "건축개요: 본 사업은 기존 시설 증축으로 2층 옥외 휴게공간과 고령 이용자 휴게·교류 공간을 확보합니다. 배치도: 남측에 계단과 옥외 데크가 계획되어 있습니다.";

export const PROBE_EVALUATION_ITEMS: EvaluationItem[] = [
  {
    id: "probe-public-space",
    majorCategory: "공공성",
    middleCategory: "공공공간",
    detailItem: "공개공지 활용성과 체류성",
    points: 10,
    description: "휴게, 그늘, 안내체계 검토",
    criteria: "공개공지는 실질적으로 이용 가능한 체류 공간으로 계획되어야 한다.",
    lawIds: [],
    guidelineIds: [],
  },
];

export const PROBE_UPLOADED_FILES: UploadedFileSummary[] = [
  {
    id: "probe-file",
    originalName: "probe-summary.txt",
    fileType: "TXT",
    sizeBytes: PROBE_SAMPLE_TEXT.length,
    storagePath: "probe/probe-summary.txt",
    extractedTextPreview: PROBE_SAMPLE_TEXT,
  },
];

export const PROBE_EVALUATION_CONTEXT: EvaluationContext = {
  project: {
    id: "probe-project",
    name: "API 심의 분석 시험",
    location: "시험 주소",
    reviewType: "경관사전심의",
    projectType: "공공시설",
  },
  spatial: null,
  referenceLaws: [],
  referenceGuidelines: [],
  guidelines: [],
  lawSource: "demo-fallback",
  guidelineSource: "demo-fallback",
  fetchedAt: new Date().toISOString(),
  warnings: [],
};
