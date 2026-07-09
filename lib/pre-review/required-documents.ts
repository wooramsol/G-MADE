import { isTocPageText, scoreDrawingPageText } from "@/lib/ai/page-citation";
import type { RequiredDocumentStatus } from "./types";

export type RequiredDocumentDefinition = {
  id: string;
  label: string;
  keywords: string[];
};

const MIN_DRAWING_PAGE_SCORE = 3;

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
  {
    id: "elevation",
    label: "입면도",
    keywords: [
      "입면도",
      "입면계획",
      "정면도",
      "측면도",
      "좌측면도",
      "우측면도",
      "배면도",
      "elevation",
    ],
  },
  { id: "perspective", label: "조감도·투시도", keywords: ["조감도", "투시도", "birdseye", "aerial"] },
  { id: "color", label: "색채계획", keywords: ["색채계획", "색채 계획", "마감재계획", "마감재 계획"] },
  {
    id: "landscape",
    label: "조경·외부공간",
    keywords: ["조경계획", "조경도", "외부공간계획", "대지조경", "landscapeplan", "조경"],
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

type PageBlock = {
  fileName: string;
  page: string;
  text: string;
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

function parsePageBlocks(corpus: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  const parts = corpus.split(/(?=--- 「[^」]+」 p\.\d+ ---)/g);

  for (const part of parts) {
    const header = part.match(/^--- 「([^」]+)」 p\.(\d+) ---\n?/);
    if (!header?.[1] || !header[2]) continue;

    const text = part.slice(header[0].length).trim();
    if (!text) continue;

    blocks.push({
      fileName: header[1],
      page: header[2],
      text,
    });
  }

  return blocks;
}

function isSubstantiveDrawingPage(text: string, keyword: string): boolean {
  if (isTocPageText(text)) return false;
  return scoreDrawingPageText(text, keyword) >= MIN_DRAWING_PAGE_SCORE;
}

function findBestDrawingPage(
  blocks: PageBlock[],
  keywords: string[],
): { fileName: string; page: string; keyword: string; score: number } | null {
  let best: { fileName: string; page: string; keyword: string; score: number } | null = null;

  for (const block of blocks) {
    for (const keyword of keywords) {
      if (!findMatch(block.text, [keyword])) continue;

      const score = scoreDrawingPageText(block.text, keyword);
      if (score < MIN_DRAWING_PAGE_SCORE) continue;

      if (!best || score > best.score) {
        best = { fileName: block.fileName, page: block.page, keyword, score };
      }
    }
  }

  return best;
}

function findPageBlock(blocks: PageBlock[], fileName: string, page: string): PageBlock | undefined {
  return blocks.find(
    (block) =>
      block.page === page &&
      (!fileName ||
        block.fileName === fileName ||
        block.fileName.includes(fileName) ||
        fileName.includes(block.fileName)),
  );
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
    return null;
  }

  const best = findBestDrawingPage(blocks, keywords);
  if (best) {
    return {
      level: "confirmed",
      matchedIn: `「${best.fileName}」 p.${best.page} ${best.keyword}`,
    };
  }

  for (const block of blocks) {
    if (!findMatch(block.text, keywords)) continue;

    const source = `「${block.fileName}」 p.${block.page}`;
    if (isTocPageText(block.text)) {
      return { level: "mentioned", matchedIn: `${source} (목차·색인)` };
    }

    return { level: "mentioned", matchedIn: `${source} (제목·본문 언급)` };
  }

  return null;
}

function matchInDocumentSections(
  sections: DocumentSectionRef[],
  keywords: string[],
  pageCorpus?: string,
): { level: "confirmed" | "mentioned"; matchedIn: string } | null {
  const blocks = pageCorpus ? parsePageBlocks(pageCorpus) : [];
  let mentioned: { matchedIn: string } | null = null;

  for (const section of sections) {
    if (/목차|차례/.test(section.label)) continue;

    const combined = `${section.label}\n${section.summary}`;
    const matchedKeyword = findMatch(combined, keywords);
    if (!matchedKeyword) continue;

    const pageMatch = section.summary.match(/p\.(\d{1,3})/i);
    if (pageMatch && blocks.length > 0) {
      const page = pageMatch[1];
      const fileMatch = section.summary.match(/「([^」]+)」/);
      const fileName = fileMatch?.[1]?.trim() ?? "";
      const block = findPageBlock(blocks, fileName, page);

      if (block) {
        const keyword = findMatch(block.text, keywords) ?? matchedKeyword;
        if (isSubstantiveDrawingPage(block.text, keyword)) {
          return {
            level: "confirmed",
            matchedIn: `「${block.fileName}」 p.${block.page} ${keyword}`,
          };
        }

        mentioned = {
          matchedIn: `「${block.fileName}」 p.${block.page} (목차·제목 페이지 — 실제 도면 아님)`,
        };
        continue;
      }
    }

    if (/p\.\d+/.test(combined) && blocks.length === 0) {
      mentioned = {
        matchedIn: `${section.label} (페이지 인용 — 본문 색인 미확인)`,
      };
      continue;
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

    const sectionHit = matchInDocumentSections(sections, doc.keywords, input.pageCorpus);
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
