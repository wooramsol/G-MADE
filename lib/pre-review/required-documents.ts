import type { RequiredDocumentStatus } from "./types";

export type RequiredDocumentDefinition = {
  id: string;
  label: string;
  keywords: string[];
};

/** 단어 일부(개요·배치·입면 등)만으로 오탐하지 않도록 구체 키워드만 사용 */
export const REQUIRED_DOCUMENTS: RequiredDocumentDefinition[] = [
  {
    id: "overview",
    label: "건축·사업개요",
    keywords: ["건축개요", "사업개요", "건축물개요", "사업 개요"],
  },
  { id: "layout", label: "배치도", keywords: ["배치도", "배치계획", "배치도면", "siteplan"] },
  { id: "plan", label: "평면도", keywords: ["평면도", "평면계획", "각층평면", "floorplan"] },
  { id: "section", label: "단면도", keywords: ["단면도", "종단면", "횡단면", "종·횡단면"] },
  { id: "elevation", label: "입면도", keywords: ["입면도", "입면계획", "elevation"] },
  { id: "perspective", label: "조감도·투시도", keywords: ["조감도", "투시도", "birdseye", "aerial"] },
  { id: "color", label: "색채계획", keywords: ["색채계획", "색채 계획", "마감재계획", "마감재 계획"] },
  {
    id: "landscape",
    label: "조경·외부공간",
    keywords: ["조경계획", "조경도", "외부공간계획", "대지조경", "landscapeplan"],
  },
  { id: "nightscape", label: "야간경관", keywords: ["야간경관", "야간조명", "조명계획", "야간투시"] },
  { id: "signage", label: "옥외광고물", keywords: ["옥외광고", "옥외광고물", "간판계획", "사인계획"] },
  {
    id: "checklist",
    label: "경관체크리스트",
    keywords: ["경관체크리스트", "체크리스트", "자체점검표", "별지7", "별지 7"],
  },
];

type DocumentSectionRef = {
  label: string;
  summary: string;
};

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

function parsePageBlocks(corpus: string): Array<{ fileName: string; page: string; text: string }> {
  const blocks: Array<{ fileName: string; page: string; text: string }> = [];
  const pattern = /^--- 「([^」]+)」 p\.(\d+) ---\n([\s\S]*?)(?=\n--- 「|$)/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(corpus)) !== null) {
    blocks.push({
      fileName: match[1],
      page: match[2],
      text: match[3].trim(),
    });
  }

  return blocks;
}

function isDrawingTitleLine(line: string, keywords: string[]): boolean {
  const matched = findMatch(line, keywords);
  if (!matched) return false;

  if (/(?:도면|plan|drawing|fig|그림|조감|투시|체크리스트)/i.test(line)) {
    return true;
  }

  if (/(?:도|도면|계획|조경|조명|광고|개요)$/i.test(matched)) {
    return true;
  }

  return normalizeText(matched).length >= 5;
}

function matchInFileNames(fileNames: string[], keywords: string[]): string | null {
  for (const name of fileNames) {
    if (findMatch(name, keywords)) {
      return name;
    }
  }
  return null;
}

function matchInPageCorpus(
  corpus: string,
  keywords: string[],
): { level: "confirmed" | "mentioned"; matchedIn: string } | null {
  const blocks = parsePageBlocks(corpus);

  if (blocks.length === 0) {
    const lines = corpus.split("\n").map((line) => line.trim()).filter(Boolean);
    let mentionedLine: string | null = null;

    for (const line of lines) {
      if (!findMatch(line, keywords)) continue;
      if (/^p\.\d+/.test(line) && isDrawingTitleLine(line, keywords)) {
        return { level: "confirmed", matchedIn: line.slice(0, 80) };
      }
      mentionedLine = line.slice(0, 80);
    }

    return mentionedLine ? { level: "mentioned", matchedIn: `${mentionedLine} (본문·색인 언급)` } : null;
  }

  let mentioned: { matchedIn: string } | null = null;

  for (const block of blocks) {
    const lines = block.text.split("\n").map((line) => line.trim()).filter(Boolean);
    const titleArea = lines.slice(0, 2).join(" ");
    const source = `「${block.fileName}」 p.${block.page}`;

    if (isDrawingTitleLine(titleArea, keywords)) {
      return { level: "confirmed", matchedIn: source };
    }

    if (findMatch(block.text, keywords)) {
      mentioned = { matchedIn: `${source} (본문 언급)` };
    }
  }

  return mentioned ? { level: "mentioned", matchedIn: mentioned.matchedIn } : null;
}

function matchInDocumentSections(
  sections: DocumentSectionRef[],
  keywords: string[],
): { level: "confirmed" | "mentioned"; matchedIn: string } | null {
  let mentioned: { matchedIn: string } | null = null;

  for (const section of sections) {
    const combined = `${section.label}\n${section.summary}`;
    if (!findMatch(combined, keywords)) continue;

    const hasPageRef = /p\.\d+/.test(combined);
    if (hasPageRef) {
      return { level: "confirmed", matchedIn: `${section.label} (${section.summary.split("\n")[0]?.slice(0, 60) ?? ""})` };
    }

    mentioned = { matchedIn: `${section.label} (항목명·요약 언급)` };
  }

  return mentioned ? { level: "mentioned", matchedIn: mentioned.matchedIn } : null;
}

/** 업로드 파일명·페이지 색인·문서 섹션에서 필수 도면·서류 존재 여부를 검사합니다. */
export function checkRequiredDocuments(input: {
  fileNames: string[];
  pageCorpus?: string;
  documentSections?: DocumentSectionRef[];
  /** @deprecated documentSections 사용 권장 */
  documentSummaries?: string[];
}): RequiredDocumentStatus[] {
  const sections: DocumentSectionRef[] =
    input.documentSections ??
    (input.documentSummaries ?? []).map((summary, index) => ({
      label: `section-${index + 1}`,
      summary,
    }));

  return REQUIRED_DOCUMENTS.map((doc) => {
    const fileHit = matchInFileNames(input.fileNames, doc.keywords);
    if (fileHit) {
      return {
        id: doc.id,
        label: doc.label,
        found: true,
        matchLevel: "confirmed",
        matchedIn: fileHit,
      };
    }

    const pageHit = input.pageCorpus ? matchInPageCorpus(input.pageCorpus, doc.keywords) : null;
    if (pageHit?.level === "confirmed") {
      return {
        id: doc.id,
        label: doc.label,
        found: true,
        matchLevel: "confirmed",
        matchedIn: pageHit.matchedIn,
      };
    }

    const sectionHit = matchInDocumentSections(sections, doc.keywords);
    if (sectionHit?.level === "confirmed") {
      return {
        id: doc.id,
        label: doc.label,
        found: true,
        matchLevel: "confirmed",
        matchedIn: sectionHit.matchedIn,
      };
    }

    const weakHit = pageHit ?? sectionHit;
    if (weakHit) {
      return {
        id: doc.id,
        label: doc.label,
        found: false,
        matchLevel: "mentioned",
        matchedIn: weakHit.matchedIn,
      };
    }

    return {
      id: doc.id,
      label: doc.label,
      found: false,
      matchLevel: "missing",
    };
  });
}
