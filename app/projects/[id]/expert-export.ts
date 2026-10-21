"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ExpertMemo } from "@/lib/types";

/**
 * 전문가 분석 다운로드 — 원본 PDF에 화면과 같은 모양의 핀·의견을 새겨 내보낸다.
 * - 의견이 있는 페이지에만 투명 이미지(핀+메모 카드)를 겹쳐 그린다 → 원본 글자·도면은 벡터 그대로.
 * - 한글은 브라우저 글꼴로 캔버스에 그리므로 PDF에 별도 글꼴을 넣을 필요가 없다.
 * - 회전된 페이지는 화면 모습 그대로 이미지로 바꿔 넣는다.
 */

export type ExportMemo = { memo: ExpertMemo; label: string; point: { x: number; y: number }; color?: string };

/** 화면 뷰어에서 페이지가 표시되는 대략적인 폭(px) — 이 폭 기준으로 핀·글자 크기를 맞춘다 */
const REFERENCE_PAGE_WIDTH = 1150;
/** 겹칠 이미지 해상도 (PDF 1pt당 픽셀) */
const OVERLAY_SCALE = 3;
const PIN_PATH = "M10 25.5C10 25.5 19 15.6 19 9.6A9 9 0 0 0 1 9.6C1 15.6 10 25.5 10 25.5Z";

function shortDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      const next = line + char;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 캔버스(페이지 크기)에 핀·메모 카드를 화면과 같은 비례로 그린다 */
function drawAnnotations(ctx: CanvasRenderingContext2D, width: number, height: number, items: ExportMemo[]) {
  const u = width / REFERENCE_PAGE_WIDTH; // 화면 1px에 해당하는 캔버스 픽셀
  const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  const pin = new Path2D(PIN_PATH);

  for (const { memo, label, point, color: pinColor } of items) {
    const color = pinColor ?? "#b45309";
    const px = point.x * width;
    const py = point.y * height;

    // 메모 카드
    ctx.font = `${12 * u}px ${fontFamily}`;
    const textLines = wrapLines(ctx, memo.text, 224 * u);
    const meta = `${memo.reviewerName ? `${memo.reviewerName} 위원` : memo.authorName}  ${shortDateTime(memo.updatedAt ?? memo.createdAt)}`;
    let contentWidth = Math.max(...textLines.map((line) => ctx.measureText(line).width));
    ctx.font = `600 ${10 * u}px ${fontFamily}`;
    contentWidth = Math.max(contentWidth, ctx.measureText(meta).width);
    const boxW = Math.min(240 * u, Math.max(120 * u, contentWidth + 20 * u));
    const boxH = 6 * u + textLines.length * 16 * u + 4 * u + 12 * u + 6 * u;
    const flipLeft = point.x > 0.72;
    const flipUp = point.y > 0.75;
    const boxX = flipLeft ? px + 10 * u - boxW : px - 10 * u;
    const boxY = flipUp ? py - 30 * u - boxH : py + 4 * u;

    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 8 * u;
    ctx.shadowOffsetY = 2 * u;
    roundRect(ctx, boxX, boxY, boxW, boxH, 6 * u);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.fill();
    ctx.restore();
    // 위원 색 테마 — 옅은 바탕 + 왼쪽 색 막대 (화면과 동일)
    roundRect(ctx, boxX, boxY, boxW, boxH, 6 * u);
    ctx.fillStyle = `${color}12`;
    ctx.fill();
    ctx.save();
    roundRect(ctx, boxX, boxY, boxW, boxH, 6 * u);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(boxX, boxY, 4 * u, boxH);
    ctx.restore();
    roundRect(ctx, boxX, boxY, boxW, boxH, 6 * u);
    ctx.lineWidth = 1 * u;
    ctx.strokeStyle = `${color}66`;
    ctx.stroke();

    ctx.textBaseline = "top";
    ctx.fillStyle = "#1e293b";
    ctx.font = `${12 * u}px ${fontFamily}`;
    textLines.forEach((line, index) => ctx.fillText(line, boxX + 10 * u, boxY + 6 * u + index * 16 * u + 2 * u));
    ctx.fillStyle = color;
    ctx.font = `700 ${10 * u}px ${fontFamily}`;
    ctx.fillText(meta, boxX + 10 * u, boxY + 6 * u + textLines.length * 16 * u + 4 * u);

    // 핀 (끝이 지점을 가리킴)
    ctx.save();
    ctx.translate(px - 10 * u, py - 25.5 * u);
    ctx.scale(u, u);
    ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = color;
    ctx.fill(pin);
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke(pin);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 9px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(label, 10, 12.8);
    ctx.restore();
  }
}

async function canvasToBytes(canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg"): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  if (!blob) throw new Error("이미지를 만들지 못했습니다.");
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportExpertPdf(params: {
  doc: PDFDocumentProxy;
  /** 페이지 번호 → 그 페이지의 의견 */
  byPage: Map<number, ExportMemo[]>;
  fileName: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { doc, byPage, fileName, onProgress } = params;
  const { PDFDocument } = await import("pdf-lib");
  const original = await doc.getData();
  const out = await PDFDocument.load(original, { ignoreEncryption: true });
  const pages = [...byPage.keys()].filter((page) => page >= 1 && page <= out.getPageCount()).sort((a, b) => a - b);

  let done = 0;
  for (const pageNumber of pages) {
    const items = byPage.get(pageNumber) ?? [];
    const target = out.getPage(pageNumber - 1);
    const rotation = ((target.getRotation().angle % 360) + 360) % 360;
    const pdfPage = await doc.getPage(pageNumber);

    if (rotation === 0) {
      // 원본은 그대로 두고 투명 이미지만 겹침
      const { width, height } = target.getSize();
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * OVERLAY_SCALE);
      canvas.height = Math.round(height * OVERLAY_SCALE);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      drawAnnotations(ctx, canvas.width, canvas.height, items);
      const png = await out.embedPng(await canvasToBytes(canvas, "image/png"));
      const box = target.getCropBox();
      target.drawImage(png, { x: box.x, y: box.y, width: box.width, height: box.height });
    } else {
      // 회전된 페이지 — 화면에 보이는 모습 그대로 이미지로 만들어 교체
      const viewport = pdfPage.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) continue;
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      drawAnnotations(ctx, canvas.width, canvas.height, items);
      const jpg = await out.embedJpg(await canvasToBytes(canvas, "image/jpeg"));
      const base = pdfPage.getViewport({ scale: 1 });
      const replacement = out.insertPage(pageNumber - 1, [base.width, base.height]);
      replacement.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height });
      out.removePage(pageNumber);
    }
    done += 1;
    onProgress?.(done, pages.length);
  }

  const bytes = await out.save({ useObjectStreams: true });
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
