export type UploadedFileSummary = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
  extractedTextPreview: string;
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
  warnings: string[];
};
