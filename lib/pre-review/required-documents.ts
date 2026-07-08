import type { RequiredDocumentStatus } from "./types";

export type RequiredDocumentDefinition = {
  id: string;
  label: string;
  keywords: string[];
};

export const REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
  { id: "layout", label: "배치도", keywords: ["배치도", "배치 계획", "배치도면", "배치"] },
  { id: "elevation", label: "입면도", keywords: ["입면도", "입면 계획", "입면"] },
  { id: "perspective", label: "조감도", keywords: ["조감도", "투시도", "조감"] },
  { id: "color", label: "색채계획", keywords: ["색채", "색채계획", "마감재 계획"] },
  { id: "nightscape", label: "야간경관", keywords: ["야간경관", "야간 조명", "조명계획", "야간"] },
  { id: "checklist", label: "경관체크리스트", keywords: ["체크리스트", "자체점검", "별지"] },
  { id: "overview", label: "건축·사업개요", keywords: ["건축개요", "사업개요", "건축 계획"] },
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function findMatch(text: string, keywords: string[]): string | null {
  const normalized = normalizeText(text);
  for (const keyword of keywords) {
    if (normalized.includes(normalizeText(keyword))) {
      return keyword;
    }
  }
  return null;
}

/** 업로드 파일명·페이지 색인·문서 요약에서 필수 도면·서류 존재 여부를 검사합니다. */
export function checkRequiredDocuments(input: {
  fileNames: string[];
  pageCorpus?: string;
  documentSummaries?: string[];
}): RequiredDocumentStatus[] {
  const corpusParts = [
    ...input.fileNames,
    input.pageCorpus ?? "",
    ...(input.documentSummaries ?? []),
  ];

  return REQUIRED_DOCUMENTS.map((doc) => {
    for (const part of corpusParts) {
      const matched = findMatch(part, doc.keywords);
      if (matched) {
        const source =
          input.fileNames.find((name) => findMatch(name, doc.keywords)) ??
          (input.pageCorpus && findMatch(input.pageCorpus, doc.keywords) ? "페이지 색인" : matched);
        return {
          id: doc.id,
          label: doc.label,
          found: true,
          matchedIn: source,
        };
      }
    }

    return {
      id: doc.id,
      label: doc.label,
      found: false,
    };
  });
}
