import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, rgb, type RGB } from "pdf-lib";
import type { ChecklistItemStatus, ChecklistReview, EvidenceRegion } from "./types";

/** 원본 PDF 위에 AI 근거 영역을 번호·색상 레이어로 표시한 '표시 도면 PDF'를 생성합니다. */

const STATUS_COLORS: Record<ChecklistItemStatus, RGB> = {
  충족: rgb(0.13, 0.66, 0.37),
  부분충족: rgb(0.92, 0.6, 0.04),
  미충족: rgb(0.86, 0.21, 0.21),
  확인불가: rgb(0.39, 0.45, 0.55),
};

export type PdfAnnotation = {
  index: number;
  page: number;
  region: EvidenceRegion;
  status: ChecklistItemStatus;
  itemText: string;
  note: string;
};

/** 해당 파일에 좌표가 있는 근거들을 페이지 순서로 수집합니다. */
export function collectAnnotationsForFile(review: ChecklistReview, fileName: string): PdfAnnotation[] {
  const itemById = new Map(review.items.map((item) => [item.id, item]));
  const collected: Omit<PdfAnnotation, "index">[] = [];

  for (const finding of review.findings) {
    for (const evidence of finding.evidence) {
      if (evidence.fileName !== fileName || !evidence.region || evidence.page < 1) continue;
      collected.push({
        page: evidence.page,
        region: evidence.region,
        status: finding.status,
        itemText: itemById.get(finding.itemId)?.text ?? "",
        note: evidence.note,
      });
    }
  }

  return collected
    .sort((left, right) => left.page - right.page)
    .map((entry, index) => ({ ...entry, index: index + 1 }));
}

export async function buildAnnotatedPdf(
  originalBytes: Uint8Array,
  annotations: PdfAnnotation[],
  fontBytes: ArrayBuffer,
  meta: { fileName: string; reviewedAt: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const pages = doc.getPages();

  for (const annotation of annotations) {
    const page = pages[annotation.page - 1];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const width = annotation.region.width * pageWidth;
    const height = annotation.region.height * pageHeight;
    const x = annotation.region.x * pageWidth;
    const y = pageHeight - annotation.region.y * pageHeight - height;
    const color = STATUS_COLORS[annotation.status];

    page.drawRectangle({
      x,
      y,
      width,
      height,
      borderColor: color,
      borderWidth: 2.4,
      color,
      opacity: 0.08,
      borderOpacity: 0.95,
    });

    // 번호 배지 (영역 왼쪽 위)
    const radius = 12;
    const badgeX = Math.min(Math.max(x + radius, radius + 2), pageWidth - radius - 2);
    const badgeY = Math.min(Math.max(y + height - radius, radius + 2), pageHeight - radius - 2);
    page.drawCircle({ x: badgeX, y: badgeY, size: radius, color, opacity: 0.95 });
    const label = String(annotation.index);
    const labelSize = 12;
    const labelWidth = font.widthOfTextAtSize(label, labelSize);
    page.drawText(label, {
      x: badgeX - labelWidth / 2,
      y: badgeY - labelSize * 0.36,
      size: labelSize,
      font,
      color: rgb(1, 1, 1),
    });
  }

  appendIndexPages(doc, font, annotations, meta);
  return doc.save({ useObjectStreams: true });
}

/** 마지막에 번호별 주석 목록 페이지를 덧붙입니다. */
function appendIndexPages(
  doc: PDFDocument,
  font: PDFFont,
  annotations: PdfAnnotation[],
  meta: { fileName: string; reviewedAt: string },
): void {
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const margin = 48;
  const bodySize = 10;
  const lineHeight = 15;

  let page = doc.addPage(pageSize);
  let cursorY = pageSize[1] - margin;

  const drawLine = (text: string, size = bodySize, color = rgb(0.09, 0.13, 0.2), indent = 0) => {
    const maxWidth = pageSize[0] - margin * 2 - indent;
    for (const line of wrapText(text, font, size, maxWidth)) {
      if (cursorY < margin + lineHeight) {
        page = doc.addPage(pageSize);
        cursorY = pageSize[1] - margin;
      }
      page.drawText(line, { x: margin + indent, y: cursorY, size, font, color });
      cursorY -= lineHeight;
    }
  };

  drawLine("AI 검토 표시 주석 목록 — G-MADE HIVE", 14, rgb(0.08, 0.2, 0.36));
  cursorY -= 4;
  drawLine(`대상: ${meta.fileName} · 검토일시: ${meta.reviewedAt}`, 9, rgb(0.39, 0.45, 0.55));
  drawLine("표시 색상: 초록=충족 · 주황=부분충족 · 빨강=미충족 · 회색=확인불가 (영역 위치는 AI 추정 근사치)", 9, rgb(0.39, 0.45, 0.55));
  cursorY -= 8;

  for (const annotation of annotations) {
    const color = STATUS_COLORS[annotation.status];
    drawLine(`[${annotation.index}] p.${annotation.page} · ${annotation.status}`, 11, color);
    if (annotation.itemText) drawLine(`항목: ${annotation.itemText}`, bodySize, rgb(0.09, 0.13, 0.2), 14);
    if (annotation.note) drawLine(`확인: ${annotation.note}`, bodySize, rgb(0.28, 0.33, 0.41), 14);
    cursorY -= 6;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const sanitized = text.replace(/\s+/g, " ").trim();
  if (!sanitized) return [];

  const lines: string[] = [];
  let current = "";
  for (const char of sanitized) {
    const candidate = current + char;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = char === " " ? "" : char;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}
