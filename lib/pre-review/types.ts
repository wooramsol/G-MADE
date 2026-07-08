export type DesignIssueType =
  | "누락"
  | "모순"
  | "수치미기재"
  | "도면간불일치"
  | "체크리스트불일치"
  | "법령저촉"
  | "기타";

export type DesignIssueSeverity = "높음" | "중간" | "낮음";

export type DesignIssue = {
  id: string;
  type: DesignIssueType;
  severity: DesignIssueSeverity;
  description: string;
  file?: string;
  page?: string;
  itemId?: string;
  itemName?: string;
  source: "rule" | "ai";
};

export type RequiredDocumentStatus = {
  id: string;
  label: string;
  /** 도면·서류가 실제로 확인된 경우만 true (matchLevel === confirmed) */
  found: boolean;
  matchLevel: "confirmed" | "mentioned" | "missing";
  matchedIn?: string;
};

export type ChecklistItemStatus = "미흡" | "확인필요" | "양호";

/** 세종 자가점검·설문조사 UI에 맞춘 표시용 상태 (AI 도출) */
export type ChecklistDisplayStatus = "반영" | "미반영" | "검토필요" | "해당없음";

export type ChecklistReviewRow = {
  itemId: string;
  itemName: string;
  majorCategory: string;
  middleCategory: string;
  points: number;
  status: ChecklistItemStatus;
  displayStatus: ChecklistDisplayStatus;
  issueCount: number;
  hasDocumentSection: boolean;
  rationalePreview?: string;
};

export type ChecklistSummary = {
  total: number;
  reflected: number;
  notReflected: number;
  reviewNeeded: number;
  notApplicable: number;
  progressPercent: number;
};

export type LawReviewEntry = {
  id: string;
  title: string;
  article: string;
  summary: string;
  sourceUrl: string;
  status: "검토필요" | "참고";
  relatedItems: string[];
  citations: string[];
};

export type PreReviewResults = {
  missingDocuments: RequiredDocumentStatus[];
  designIssues: DesignIssue[];
  checklistRows: ChecklistReviewRow[];
  lawReviewEntries: LawReviewEntry[];
};
