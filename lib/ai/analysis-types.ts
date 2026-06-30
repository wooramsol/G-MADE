import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";

import type { VisionAsset } from "../document-content";

export type UploadedFileSummary = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
  /** 추출된 전체 본문(글자 수 제한 없음) */
  extractedTextPreview: string;
  /** PDF 원본·페이지 렌더·이미지 등 비전 분석 자료 */
  visionAssets?: VisionAsset[];
};

export type UploadAnalysisReferenceLaw = {
  title: string;
  article: string;
  summary: string;
  sourceUrl: string;
};

export type UploadAnalysisReferenceGuideline = {
  title: string;
  section: string;
  summary: string;
  sourceUrl: string;
};

export type UploadAnalysisResult = {
  provider: "openai" | "gemini" | "claude" | "none" | "demo";
  mode: "live" | "skipped" | "demo";
  summary: string;
  documentSections: Array<{
    label: string;
    confidence: number;
    summary: string;
  }>;
  evaluationPreview: Array<{
    itemId: string;
    itemName: string;
    score: number;
    grade: string;
    rationale: string;
    recommendation: string;
    laws: string[];
    guidelines: string[];
  }>;
  referenceLaws: UploadAnalysisReferenceLaw[];
  referenceGuidelines: UploadAnalysisReferenceGuideline[];
  spatialContext: EvaluationContext["spatial"];
  lawSource: EvaluationContext["lawSource"];
  guidelineSource: EvaluationContext["guidelineSource"];
  contextFetchedAt: string;
  warnings: string[];
};

export type AnalyzeUploadedFilesInput = {
  providerPreference: import("./types").AiProviderPreference;
  files: UploadedFileSummary[];
  evaluationContext: EvaluationContext;
  evaluationItems?: EvaluationItem[];
  onAnalysisProgress?: (label: string) => void;
};
