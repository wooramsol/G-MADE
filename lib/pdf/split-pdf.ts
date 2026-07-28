import crypto from "node:crypto";
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

export type ExtractedPdfPages = {
  base64: string;
  /** 실제로 포함된 원본 페이지 번호(오름차순, 1-based) — 요청한 목록 중 유효 범위만 반영 */
  pages: number[];
  sizeBytes: number;
};

/**
 * 지정된 페이지 번호(1-based, 중복·순서 무관, 비연속 허용)만 뽑아 새 PDF를 만듭니다.
 * 배치별 관련 페이지만 전송해 비용을 줄이는 페이지 관련도 필터링에 사용합니다
 * (splitPdfIntoChunks의 "연속 구간 분할"과 달리, 원본 어디에 있든 필요한 페이지만 모읍니다).
 * 유효한 페이지가 하나도 없으면 null을 반환합니다.
 */
export async function extractPdfPages(base64: string, pageNumbers: number[]): Promise<ExtractedPdfPages | null> {
  const sourceBytes = Buffer.from(base64, "base64");
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const pageCount = source.getPageCount();

  const pages = [...new Set(pageNumbers)]
    .filter((page) => Number.isFinite(page) && page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  if (pages.length === 0) return null;

  const indices = pages.map((page) => page - 1);
  const target = await PDFDocument.create();
  const copied = await target.copyPages(source, indices);
  for (const page of copied) {
    target.addPage(page);
  }
  const bytes = await target.save({ useObjectStreams: true });

  return {
    base64: Buffer.from(bytes).toString("base64"),
    pages,
    sizeBytes: bytes.length,
  };
}

/** 페이지 단위 내용 해시 계산 시 처리할 최대 페이지 수 — 초과하면 계산을 포기합니다. */
const MAX_PAGES_FOR_HASHING = 400;

/**
 * PDF의 각 페이지를 개별 PDF로 직렬화해 sha256으로 해시합니다. 텍스트뿐 아니라 도면·
 * 이미지 등 페이지의 모든 내용(원본 페이지 객체 그래프)을 반영하므로, 텍스트는 그대로인데
 * 도면만 바뀐 경우도 감지할 수 있습니다. 동일 문서 재제출 시 "어느 페이지가 실제로
 * 바뀌었는지" 판별해 바뀌지 않은 페이지 근거의 항목은 재분석을 건너뛰는 데 사용합니다.
 * 반환값의 인덱스 i는 원본 p.(i+1)에 해당합니다. 페이지 수가 너무 많으면(비용 상한)
 * null을 반환합니다 — 호출자는 이 경우 파일 전체 단위로만 변경 여부를 판단해야 합니다.
 */
export async function hashPdfPages(base64: string): Promise<string[] | null> {
  const sourceBytes = Buffer.from(base64, "base64");
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const pageCount = source.getPageCount();
  if (pageCount === 0) return [];
  if (pageCount > MAX_PAGES_FOR_HASHING) return null;

  const hashes: string[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const target = await PDFDocument.create();
    const [copied] = await target.copyPages(source, [index]);
    target.addPage(copied);
    const bytes = await target.save({ useObjectStreams: false });
    hashes.push(crypto.createHash("sha256").update(bytes).digest("hex"));
  }
  return hashes;
}
