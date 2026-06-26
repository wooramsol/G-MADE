export type RoleCode = "ADMIN" | "REVIEWER" | "OFFICER";

export type EvaluationGrade = "매우우수" | "우수" | "보통" | "미흡" | "매우미흡";

export type ScoreTrace = {
  label: string;
  weight: number;
  score: number;
  evidence: string;
};

export type EvaluationItem = {
  id: string;
  majorCategory: string;
  middleCategory: string;
  detailItem: string;
  points: number;
  description: string;
  criteria: string;
  lawIds: string[];
  guidelineIds: string[];
};

export type LawReference = {
  id: string;
  title: string;
  article: string;
  summary: string;
  jurisdiction: string;
};

export type Guideline = {
  id: string;
  title: string;
  section: string;
  summary: string;
  sourceUrl?: string;
};

export type CaseStudy = {
  id: string;
  title: string;
  location: string;
  projectType: string;
  similarityScore: number;
  keyLearning: string;
  sourceUrl?: string;
};

export type ProjectFile = {
  id: string;
  fileName: string;
  fileType: string;
  analysisStatus: "대기" | "분석중" | "완료";
  uploadedAt?: string;
  sizeBytes?: number;
  /** Vercel Blob pathname */
  storageKey?: string;
  blobUrl?: string;
};

export type HumanEvaluationItemScore = {
  itemId: string;
  score: number;
  comment?: string;
};

export type HumanEvaluationSession = {
  id: string;
  uploadedAt: string;
  reviewerName: string;
  summary?: string;
  files: Array<{
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
  }>;
  itemScores: HumanEvaluationItemScore[];
};

export type UploadAnalysisSession = {
  id: string;
  analyzedAt: string;
  aiWeight: number;
  expertWeight: number;
  totalPoints: number;
  files: Array<{
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
  }>;
  analysis: {
    provider: "openai" | "gemini" | "claude" | "none" | "demo";
    mode: "live" | "skipped" | "demo";
    summary: string;
    documentSections: Array<{ label: string; confidence: number; summary: string }>;
    evaluationPreview: Array<{
      itemId?: string;
      itemName: string;
      score: number;
      grade: string;
      rationale: string;
      recommendation: string;
      laws: string[];
      guidelines: string[];
    }>;
    referenceLaws?: Array<{
      title: string;
      article: string;
      summary: string;
      sourceUrl: string;
    }>;
    referenceGuidelines?: Array<{
      title: string;
      section: string;
      summary: string;
      sourceUrl: string;
    }>;
    spatialContext?: {
      address: string;
      inLandscapeZone: boolean;
      matchedZones: Array<{
        name: string;
        code: string;
        jurisdiction: string;
        designationYear: string;
      }>;
    } | null;
    lawSource?: "law.go.kr" | "demo-fallback";
    contextFetchedAt?: string;
    warnings: string[];
  };
};

export type EvaluationSessionFile = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  /** Vercel Blob pathname */
  storageKey?: string;
  blobUrl?: string;
};

export type EvaluationRound = {
  id: string;
  /** 휴지통으로 이동한 시각 (ISO). trashedEvaluationRounds에 보관될 때 설정됩니다. */
  deletedAt?: string;
  evaluatedAt: string;
  aiWeight: number;
  expertWeight: number;
  evaluationItems: EvaluationItem[];
  totalPoints: number;
  reviewerName: string;
  expertSummary?: string;
  aiFiles: EvaluationSessionFile[];
  expertFiles: EvaluationSessionFile[];
  aiAnalysis: UploadAnalysisSession["analysis"];
  expertItemScores: HumanEvaluationItemScore[];
};

export type ProjectLocationPoint = {
  x: number;
  y: number;
  source: "address" | "place" | "map";
  note?: string;
};

export type Project = {
  id: string;
  name: string;
  location: string;
  locationPoint?: ProjectLocationPoint;
  client: string;
  designer: string;
  projectType: string;
  scale: string;
  reviewType: string;
  receivedAt: string;
  summary?: string;
  updatedAt?: string;
  status: "접수" | "심사 진행중" | "완료";
  files: ProjectFile[];
  savedEvaluationItems?: EvaluationItem[];
  uploadAnalyses?: UploadAnalysisSession[];
  humanEvaluationSessions?: HumanEvaluationSession[];
  evaluationRounds?: EvaluationRound[];
  /** 휴지통에 보관된 평가 차수 */
  trashedEvaluationRounds?: EvaluationRound[];
  /** 휴지통으로 이동한 시각 (ISO). 설정되면 목록에서 숨깁니다. */
  deletedAt?: string;
};

export type AiEvaluation = {
  itemId: string;
  score: number;
  grade: EvaluationGrade;
  rationale: string;
  recommendation: string;
  scoreTrace: ScoreTrace[];
  lawIds: string[];
  guidelineIds: string[];
  caseStudyIds: string[];
};

export type HumanEvaluation = {
  itemId: string;
  reviewerName: string;
  score: number;
  comment: string;
  attachmentName?: string;
};

export type HybridSettings = {
  aiWeight: number;
  humanWeight: number;
};

export type HybridResult = {
  item: EvaluationItem;
  aiEvaluation: AiEvaluation;
  humanEvaluation: HumanEvaluation;
  finalScore: number;
  finalGrade: EvaluationGrade;
  finalComment: string;
};

export type ExtractedDocumentSection = {
  label: string;
  confidence: number;
  summary: string;
};
