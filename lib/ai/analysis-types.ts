import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";

export type UploadedFileSummary = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
  extractedTextPreview: string;
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
  provider: "demo" | "openai" | "gemini" | "claude";
  mode: "demo" | "live";
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
};
