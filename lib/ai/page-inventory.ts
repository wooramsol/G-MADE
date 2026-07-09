import type { UploadedFileSummary } from "./analysis-types";
import { isVisionCapableFile } from "../document-content";
import {
  extractSectionLabel,
  isTitleOnlyPageText,
  isTocPageText,
  parsePageSlices,
  scoreDrawingPageText,
} from "./page-citation";
import { truncateGraphemes } from "../document-text-utils";

export type PageContentKind =
  | "목차"
  | "제목·구분"
  | "도면·본문"
  | "텍스트"
  | "비어있음"
  | "이미지·스캔";

export type PageInventoryEntry = {
  fileName: string;
  page: number;
  charCount: number;
  textPreview: string;
  hasText: boolean;
  contentKind: PageContentKind;
  sectionLabel: string | null;
  drawingScore: number;
  detectedElements: string[];
};

export type FilePageInventory = {
  fileName: string;
  fileType: string;
  totalPages: number;
  hasVisionAssets: boolean;
  visionAssetLabels: string[];
  pages: PageInventoryEntry[];
  notes: string[];
};

const SLIDE_MARKER_PATTERN = /^---\s*「([^」]+)」\s*슬라이드\s*(\d+)\s*---\n?/;

const DRAWING_KEYWORD_PATTERN =
  /배치도|입면도|단면도|조감도|투시도|색채|야간|보행|주차|건축계획|경관체크리스트|공공디자인|조경|식재|동선|면적|㎡|m²/;

function classifyPageContent(
  text: string,
  sectionLabel: string | null,
): { contentKind: PageContentKind; drawingScore: number } {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { contentKind: "비어있음", drawingScore: -1 };
  }

  if (isTocPageText(normalized)) {
    return { contentKind: "목차", drawingScore: -1 };
  }

  if (isTitleOnlyPageText(normalized, sectionLabel ?? undefined)) {
    return { contentKind: "제목·구분", drawingScore: -1 };
  }

  const drawingScore = scoreDrawingPageText(normalized, sectionLabel ?? "도면");
  if (drawingScore >= 3 || (sectionLabel && DRAWING_KEYWORD_PATTERN.test(normalized))) {
    return { contentKind: "도면·본문", drawingScore };
  }

  return { contentKind: "텍스트", drawingScore };
}

function collectDetectedElements(
  text: string,
  sectionLabel: string | null,
  contentKind: PageContentKind,
  hasVisionOnFile: boolean,
): string[] {
  const elements = new Set<string>();

  if (contentKind === "목차") elements.add("목차·차례");
  if (contentKind === "제목·구분") elements.add("섹션 제목·구분 페이지");
  if (contentKind === "도면·본문") elements.add("도면·수치·본문");
  if (contentKind === "텍스트") elements.add("일반 텍스트");
  if (contentKind === "비어있음") elements.add("추출된 텍스트 없음");
  if (contentKind === "이미지·스캔") elements.add("이미지·스캔 자료");

  if (sectionLabel) elements.add(sectionLabel);

  const keywordHits = text.match(DRAWING_KEYWORD_PATTERN) ?? [];
  for (const hit of keywordHits.slice(0, 4)) {
    elements.add(hit);
  }

  if (/표|체크|규격|조도|lux|kW|mm|cm|층|대/.test(text)) {
    elements.add("수치·표·체크 항목");
  }

  if (hasVisionOnFile && (contentKind === "비어있음" || contentKind === "이미지·스캔")) {
    elements.add("AI 비전 분석 대상");
  }

  return [...elements];
}

function buildPageEntry(
  fileName: string,
  page: number,
  text: string,
  hasVisionOnFile: boolean,
): PageInventoryEntry {
  const sectionLabel = extractSectionLabel(text);
  const { contentKind, drawingScore } = classifyPageContent(text, sectionLabel);
  const normalized = text.replace(/\s+/g, " ").trim();

  return {
    fileName,
    page,
    charCount: normalized.length,
    textPreview: truncateGraphemes(normalized, 480),
    hasText: normalized.length > 0,
    contentKind,
    sectionLabel,
    drawingScore,
    detectedElements: collectDetectedElements(text, sectionLabel, contentKind, hasVisionOnFile),
  };
}

function parseSlideSlices(file: UploadedFileSummary): Array<{ fileName: string; page: number; text: string }> {
  const corpus = file.extractedTextPreview ?? "";
  if (!corpus.trim()) return [];

  const slices: Array<{ fileName: string; page: number; text: string }> = [];
  const parts = corpus.split(/(?=---\s*「[^」]+」\s*슬라이드\s*\d+\s*---)/g);

  for (const part of parts) {
    const header = part.match(SLIDE_MARKER_PATTERN);
    if (!header?.[1] || !header[2]) continue;
    const text = part.slice(header[0].length).trim();
    slices.push({
      fileName: header[1],
      page: Number(header[2]),
      text,
    });
  }

  return slices;
}

function buildPdfLikeInventory(file: UploadedFileSummary): FilePageInventory {
  const fileName = file.originalName;
  const hasVision = Boolean(file.visionAssets?.length) || isVisionCapableFile(fileName);
  const visionAssetLabels = (file.visionAssets ?? []).map((asset) => asset.label);
  const notes: string[] = [];

  if (hasVision) {
    notes.push("PDF·이미지는 AI 비전(도면·스캔 글자) 분석에도 사용됩니다.");
  }

  const slices = parsePageSlices([file]);
  const slideSlices = slices.length === 0 ? parseSlideSlices(file) : [];
  const markerSlices = slices.length > 0 ? slices : slideSlices;

  const pages: PageInventoryEntry[] = markerSlices.map((slice) =>
    buildPageEntry(slice.fileName, slice.page, slice.text, hasVision),
  );

  const totalPages = file.totalPages ?? (pages.length > 0 ? Math.max(...pages.map((p) => p.page)) : 1);

  if (pages.length === 0 && totalPages > 0) {
    const corpus = file.extractedTextPreview ?? "";
    const noTextLayer = /텍스트 레이어 없음|비전 자료로 분석/.test(corpus);

    if (noTextLayer) {
      notes.push("PDF 텍스트 레이어가 없어 페이지별 글자 추출이 되지 않았습니다. 전체 PDF를 비전 분석합니다.");

      for (let page = 1; page <= totalPages; page += 1) {
        pages.push({
          fileName,
          page,
          charCount: 0,
          textPreview: "",
          hasText: false,
          contentKind: "이미지·스캔",
          sectionLabel: null,
          drawingScore: -1,
          detectedElements: collectDetectedElements("", null, "이미지·스캔", hasVision),
        });
      }
    } else {
      for (let page = 1; page <= totalPages; page += 1) {
        pages.push(
          buildPageEntry(
            fileName,
            page,
            page === 1 && corpus && !corpus.includes("--- 「") ? corpus : "",
            hasVision,
          ),
        );
      }
    }
  }

  return {
    fileName,
    fileType: file.fileType || fileName.split(".").pop()?.toUpperCase() || "PDF",
    totalPages,
    hasVisionAssets: hasVision,
    visionAssetLabels,
    pages,
    notes,
  };
}

function buildPlainTextInventory(file: UploadedFileSummary): FilePageInventory {
  const fileName = file.originalName;
  const text = (file.extractedTextPreview ?? "").trim();
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  return {
    fileName,
    fileType: file.fileType || extension.toUpperCase() || "FILE",
    totalPages: 1,
    hasVisionAssets: Boolean(file.visionAssets?.length),
    visionAssetLabels: (file.visionAssets ?? []).map((asset) => asset.label),
    pages: [buildPageEntry(fileName, 1, text, Boolean(file.visionAssets?.length))],
    notes: text ? [`${extension.toUpperCase()} 파일은 페이지 구분 없이 본문 전체를 1개 블록으로 읽습니다.`] : ["추출된 본문이 없습니다."],
  };
}

function buildImageInventory(file: UploadedFileSummary): FilePageInventory {
  const fileName = file.originalName;
  const text = (file.extractedTextPreview ?? "").trim();

  return {
    fileName,
    fileType: file.fileType || "IMAGE",
    totalPages: 1,
    hasVisionAssets: true,
    visionAssetLabels: (file.visionAssets ?? []).map((asset) => asset.label),
    pages: [
      {
        fileName,
        page: 1,
        charCount: text.length,
        textPreview: truncateGraphemes(text, 480),
        hasText: text.length > 0,
        contentKind: "이미지·스캔",
        sectionLabel: null,
        drawingScore: -1,
        detectedElements: collectDetectedElements(text, null, "이미지·스캔", true),
      },
    ],
    notes: ["이미지 파일은 AI 비전 분석으로 도면·사진 속 글자와 그림을 읽습니다."],
  };
}

/** 추출 직후 업로드 파일별 페이지·텍스트·도면·비전 자료 인벤토리를 만듭니다. */
export function buildPageInventory(files: UploadedFileSummary[]): FilePageInventory[] {
  return files.map((file) => {
    const extension = file.originalName.split(".").pop()?.toLowerCase() ?? "";

    if (extension === "pdf" || extension === "pptx") {
      return buildPdfLikeInventory(file);
    }
    if (["jpg", "jpeg", "png"].includes(extension)) {
      return buildImageInventory(file);
    }
    return buildPlainTextInventory(file);
  });
}

export function countPageInventoryEntries(inventory: FilePageInventory[]): number {
  return inventory.reduce((sum, file) => sum + file.pages.length, 0);
}
