import { head, put } from "@vercel/blob";
import { getBlobAccess, isBlobStorageConfigured } from "@/lib/blob-config";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
import { isR2Configured, r2GetObject, r2HeadObject, r2PutObject } from "@/lib/r2-storage";
import { downscaleJpeg, renderRegionSnippet } from "@/lib/pdf/render-page";
import type { ChecklistFinding, EvidenceRegion } from "./types";

/**
 * 근거 캡처(JPEG) 캐시 공통 모듈.
 *
 * 핵심 원칙: 원본 PDF(수십~수백 MB) 다운로드는 "분석 시 1회"로 끝나야 한다.
 * 분석이 끝나면 이미 메모리에 있는 버퍼로 모든 근거 캡처를 미리 생성해 캐시하고
 * (prewarmEvidenceSnippets — 추가 다운로드 0회), 캡처 라우트는 캐시만 스트리밍한다.
 * 과거처럼 캐시 결함이 원본 반복 다운로드 폭주(전송량 한도 초과)로 이어지지 않도록
 * 라우트 쪽에는 별도의 다운로드 횟수 제한이 있다.
 */

export const SNIPPET_SIZES = { thumb: 520, full: 1400 } as const;
export type SnippetVariant = keyof typeof SNIPPET_SIZES;

export function snippetRegionKey(region: EvidenceRegion | null | undefined): string {
  return region
    ? `${region.x.toFixed(4)}-${region.y.toFixed(4)}-${region.width.toFixed(4)}-${region.height.toFixed(4)}`
    : "page";
}

/**
 * 결정적(내용 주소) 캐시 경로 — 같은 파일·페이지·영역이면 회차와 무관하게 동일.
 */
export function snippetCachePath(
  projectId: string,
  fileId: string,
  page: number,
  variant: SnippetVariant,
  regionKey: string,
): string {
  return `projects/${projectId}/snippets/${fileId}-p${page}-${variant}-${regionKey}.jpg`;
}

/**
 * 스토어 실제 접근 모드 기억 — BLOB_DEFAULT_ACCESS 설정(private)과 실제 스토어(public)가
 * 어긋나면 put이 실패하므로, 실패 시 반대 모드로 재시도하고 성공한 모드를 기억한다.
 */
let resolvedBlobAccess: "public" | "private" | null = null;

export async function putSnippetCache(pathname: string, buffer: Buffer): Promise<boolean> {
  if (isR2Configured()) {
    try {
      await r2PutObject(pathname, buffer, "image/jpeg");
      return true;
    } catch (error) {
      console.warn(
        "[checklist-review] 캡처 캐시 저장 실패(R2):",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }
  if (!isBlobStorageConfigured()) return false;

  const attempt = async (access: "public" | "private") => {
    await put(pathname, buffer, {
      access: access as "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    resolvedBlobAccess = access;
  };

  const first = resolvedBlobAccess ?? getBlobAccess();
  try {
    await attempt(first);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback: "public" | "private" = first === "private" ? "public" : "private";
    if (/access on a (public|private) store/i.test(message)) {
      try {
        await attempt(fallback);
        return true;
      } catch (retryError) {
        console.warn(
          "[checklist-review] 캡처 캐시 저장 실패(재시도 포함):",
          retryError instanceof Error ? retryError.message : retryError,
        );
        return false;
      }
    }
    console.warn("[checklist-review] 캡처 캐시 저장 실패:", message);
    return false;
  }
}

/** 캐시된 캡처 존재 여부 — R2 우선, 레거시 Vercel Blob 차선. */
export async function hasSnippetCache(pathname: string): Promise<boolean> {
  if (isR2Configured()) {
    try {
      return await r2HeadObject(pathname);
    } catch {
      return false;
    }
  }
  if (!isBlobStorageConfigured()) return false;
  try {
    await head(pathname);
    return true;
  } catch {
    return false;
  }
}

/** 캐시된 캡처 읽기 — R2 우선, 레거시 Vercel Blob(head+fetch) 차선. 없으면 null. */
export async function readSnippetCache(pathname: string): Promise<Buffer | null> {
  if (isR2Configured()) {
    try {
      const bytes = await r2GetObject(pathname);
      if (bytes) return bytes;
    } catch {
      // 레거시 폴백으로
    }
  }
  if (!isBlobStorageConfigured()) return null;
  try {
    const cached = await head(pathname);
    const url = cached.downloadUrl ?? cached.url;
    if (!url) return null;
    let upstream = await fetch(url);
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!upstream.ok && (upstream.status === 401 || upstream.status === 403) && token) {
      upstream = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    }
    if (!upstream.ok) return null;
    return Buffer.from(await upstream.arrayBuffer());
  } catch {
    return null;
  }
}

// 사실상 전량 선생성 — 실측 60개 상한이 모자라 일부 캡처가 조회 시 생성으로 밀렸음.
// 시간 예산 가드(PREWARM_MIN_REMAINING_MS)가 안전판 역할을 한다.
const MAX_PREWARM_CAPTURES = 200;
const PREWARM_MIN_REMAINING_MS = 8_000;

type PrewarmTarget = { page: number; region: EvidenceRegion | null; regionKey: string };

/**
 * 검토 결과의 모든 근거 캡처(썸네일+확대본)를 미리 생성해 Blob에 캐시한다.
 * 분석 파이프라인이 이미 갖고 있는 PDF 버퍼를 그대로 사용하므로 원본 다운로드가
 * 전혀 발생하지 않는다. 시간 예산이 모자라면 우선순위(화면 표시 순서)대로 만들고
 * 나머지는 조회 시 생성으로 넘긴다 (실패해도 검토 결과에는 영향 없음).
 */
export async function prewarmEvidenceSnippets(options: {
  projectId: string;
  fileId: string;
  pdfBytes: Uint8Array | Buffer;
  findings: ChecklistFinding[];
  getRemainingBudgetMs: () => number;
}): Promise<void> {
  if (!isBlobStorageEnabled()) return;

  const { projectId, fileId, pdfBytes, findings, getRemainingBudgetMs } = options;

  // 화면 표시 순서대로 고유한 (페이지, 영역) 목록 수집 — 검토 자료는 파일 1개이므로
  // 모든 근거가 이 파일 소속이다.
  const seen = new Set<string>();
  const targets: PrewarmTarget[] = [];
  for (const finding of findings) {
    for (const evidence of finding.evidence) {
      if (!Number.isFinite(evidence.page) || evidence.page < 1) continue;
      const region = evidence.region ?? null;
      const regionKey = snippetRegionKey(region);
      const key = `${evidence.page}#${regionKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ page: evidence.page, region, regionKey });
      if (targets.length >= MAX_PREWARM_CAPTURES) break;
    }
    if (targets.length >= MAX_PREWARM_CAPTURES) break;
  }
  if (targets.length === 0) return;

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let index = 0;
  for (; index < targets.length; index += 1) {
    if (getRemainingBudgetMs() < PREWARM_MIN_REMAINING_MS) break;
    const target = targets[index];
    const thumbPath = snippetCachePath(projectId, fileId, target.page, "thumb", target.regionKey);
    const fullPath = snippetCachePath(projectId, fileId, target.page, "full", target.regionKey);
    // 이미 캐시돼 있으면 건너뜀 (재분석 시 같은 파일이면 전부 이 경로)
    if (await hasSnippetCache(thumbPath)) {
      skipped += 1;
      continue;
    }
    try {
      const full = await renderRegionSnippet(pdfBytes, target.page, target.region, SNIPPET_SIZES.full);
      if (!full) {
        failed += 1;
        continue;
      }
      const thumb = await downscaleJpeg(full.base64, SNIPPET_SIZES.thumb);
      const saves = [putSnippetCache(fullPath, Buffer.from(full.base64, "base64"))];
      if (thumb) saves.push(putSnippetCache(thumbPath, Buffer.from(thumb.base64, "base64")));
      await Promise.all(saves);
      done += 1;
    } catch (error) {
      failed += 1;
      console.warn(
        `[checklist-review] 캡처 선생성 실패 p=${target.page}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const leftover = targets.length - index;
  console.log(
    `[checklist-review] snippet-prewarm total=${targets.length} done=${done} cached=${skipped} failed=${failed} leftover=${leftover}`,
  );
}
