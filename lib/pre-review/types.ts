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
  found: boolean;
  matchedIn?: string;
};

export type ChecklistItemStatus = "미흡" | "확인필요" | "양호";

export type ChecklistReviewRow = {
  itemId: string;
  itemName: string;
  majorCategory: string;
  middleCategory: string;
  points: number;
  status: ChecklistItemStatus;
  issueCount: number;
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
