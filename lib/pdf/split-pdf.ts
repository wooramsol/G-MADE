import { PDFDocument } from "pdf-lib";

export type PdfChunk = {
  base64: string;
  /** 원본 기준 시작 페이지 (1-based, 포함) */
  startPage: number;
  /** 원본 기준 끝 페이지 (1-based, 포함) */
  endPage: number;
  sizeBytes: number;
};

export type SplitPdfOptions = {
  maxBytesPerChunk: number;
  maxPagesPerChunk: number;
};

/**
 * 대용량 PDF를 바이트·페이지 한도 내 연속 구간들로 분할합니다.
 * Anthropic 요청 한도(용량·100페이지)를 넘는 문서를 구간별 병렬 분석하기 위한 용도입니다.
 * 암호화된 PDF 등 분할 불가 문서는 예외를 던집니다.
 */
export async function splitPdfIntoChunks(base64: string, options: SplitPdfOptions): Promise<PdfChunk[]> {
  const { maxBytesPerChunk, maxPagesPerChunk } = options;
  const sourceBytes = Buffer.from(base64, "base64");
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const pageCount = source.getPageCount();
  if (pageCount === 0) return [];

  const avgPageBytes = Math.max(1, Math.ceil(sourceBytes.length / pageCount));
  const initialPagesPerChunk = Math.min(
    Math.max(1, Math.floor(maxBytesPerChunk / avgPageBytes)),
    maxPagesPerChunk,
  );

  const chunks: PdfChunk[] = [];
  let cursor = 0;

  while (cursor < pageCount) {
    let take = Math.min(initialPagesPerChunk, pageCount - cursor);

    // 직렬화 후 한도를 넘으면 페이지 수를 절반씩 줄여 재시도
    for (;;) {
      const chunkBytes = await serializePageRange(source, cursor, take);
      if (chunkBytes.length <= maxBytesPerChunk || take === 1) {
        chunks.push({
          base64: Buffer.from(chunkBytes).toString("base64"),
          startPage: cursor + 1,
          endPage: cursor + take,
          sizeBytes: chunkBytes.length,
        });
        cursor += take;
        break;
      }
      take = Math.max(1, Math.ceil(take / 2));
    }
  }

  return chunks;
}

async function serializePageRange(source: PDFDocument, startIndex: number, count: number): Promise<Uint8Array> {
  const target = await PDFDocument.create();
  const indices = Array.from({ length: count }, (_, offset) => startIndex + offset);
  const pages = await target.copyPages(source, indices);
  for (const page of pages) {
    target.addPage(page);
  }
  return target.save({ useObjectStreams: true });
}
