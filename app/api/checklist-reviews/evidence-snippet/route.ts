import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
import {
  putSnippetCache,
  readSnippetCache,
  SNIPPET_SIZES,
  snippetCachePath,
  snippetRegionKey,
} from "@/lib/checklist-review/snippet-cache";
import { anchorCacheSuffix } from "@/lib/checklist-review/evidence-anchors";
import { downscaleJpeg, renderRegionSnippet } from "@/lib/pdf/render-page";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SIZES = SNIPPET_SIZES;

/**
 * 파일 읽기 in-flight 공유 — 결과 화면 첫 조회 때 썸네일 수십 개가 동시에 같은
 * 원본 PDF(수십 MB)를 각자 다운로드하던 것을 인스턴스당 1회로 합칩니다.
 * 완료 후 짧게 유지했다가 정리(대용량 버퍼를 오래 붙들지 않도록).
 */
const inflightFileReads = new Map<string, Promise<Buffer>>();
const FILE_READ_LINGER_MS = 30_000;

function readFileShared(key: string, reader: () => Promise<Buffer>): Promise<Buffer> {
  const existing = inflightFileReads.get(key);
  if (existing) return existing;
  const promise = reader();
  inflightFileReads.set(key, promise);
  promise
    .then(() => setTimeout(() => inflightFileReads.delete(key), FILE_READ_LINGER_MS))
    .catch(() => inflightFileReads.delete(key));
  return promise;
}

/**
 * 원본 PDF 다운로드 회로 차단기 — 캡처는 분석 직후 선생성돼 캐시에서만 읽는 것이
 * 정상 경로이므로, 이 라우트에서의 원본 다운로드는 예외적(과거 검토·선생성 누락분)
 * 이어야 한다. 캐시가 고장 나도 파일당 10분에 3회를 넘는 원본 다운로드를 차단해
 * 전송량 폭주(요금 한도 초과)를 원천 방지한다.
 */
const ORIGINAL_DOWNLOAD_WINDOW_MS = 10 * 60_000;
// R2 전환으로 다운로드 전송료가 없어져 제한 목적은 메모리 보호로 축소 — 10회로 완화
const MAX_ORIGINAL_DOWNLOADS_PER_WINDOW = 10;
const originalDownloadLog = new Map<string, number[]>();

function tryReserveOriginalDownload(fileKey: string): boolean {
  const now = Date.now();
  const recent = (originalDownloadLog.get(fileKey) ?? []).filter(
    (at) => now - at < ORIGINAL_DOWNLOAD_WINDOW_MS,
  );
  if (recent.length >= MAX_ORIGINAL_DOWNLOADS_PER_WINDOW) {
    originalDownloadLog.set(fileKey, recent);
    return false;
  }
  recent.push(now);
  originalDownloadLog.set(fileKey, recent);
  return true;
}

/**
 * 근거 페이지/부위 캡처(JPEG)를 반환합니다 — 결과 카드의 인라인 썸네일용.
 * - region이 있으면 해당 부위를 잘라 빨간 테두리 표시, 없으면 페이지 전체.
 * - 속도: 생성한 캡처를 Blob에 결정적 경로로 캐시해, 같은 캡처는 (누가 보든)
 *   렌더링 없이 즉시 스트리밍됩니다. 브라우저 캐시도 병행.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId")?.trim() ?? "";
  const reviewId = params.get("reviewId")?.trim() ?? "";
  const fileId = params.get("fileId")?.trim() ?? "";
  const page = Number(params.get("page"));
  const size: keyof typeof SIZES = params.get("size") === "full" ? "full" : "thumb";
  const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : NaN);
  const rawRegion = {
    x: clamp01(Number(params.get("x"))),
    y: clamp01(Number(params.get("y"))),
    width: clamp01(Number(params.get("w"))),
    height: clamp01(Number(params.get("h"))),
  };
  const region =
    [rawRegion.x, rawRegion.y, rawRegion.width, rawRegion.height].every((value) => Number.isFinite(value)) &&
    rawRegion.width > 0 &&
    rawRegion.height > 0
      ? rawRegion
      : null;

  if (!projectId || !reviewId || !fileId || !Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "projectId·reviewId·fileId·page가 필요합니다." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  const review = (project?.checklistReviews ?? []).find((entry) => entry.id === reviewId);
  const file = review?.files.find((entry) => entry.id === fileId);
  if (!project || !review || !file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const jpegHeaders = {
    "Content-Type": "image/jpeg",
    // 검토 결과는 불변 — 브라우저 캐시를 길게 (재방문 시 요청 자체가 없음)
    "Cache-Control": "private, max-age=604800, immutable",
  };

  // 원문 인용구(앵커) — 글자 좌표 탐색으로 정확한 위치 표시 (|로 구분, 최대 3개)
  const anchors = (params.get("anchors") ?? "")
    .split("|")
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 60)
    .slice(0, 3);

  // 결정적 캐시 경로 — 같은 파일·페이지·영역·앵커면 회차가 바뀌어도 같은 캡처
  const regionKey = `${snippetRegionKey(region)}${anchorCacheSuffix(anchors)}`;
  const cachePathFor = (variant: keyof typeof SIZES) =>
    snippetCachePath(projectId, fileId, page, variant, regionKey);

  if (isBlobStorageEnabled()) {
    const cached = await readSnippetCache(cachePathFor(size));
    if (cached) {
      return new NextResponse(new Uint8Array(cached), { headers: jpegHeaders });
    }
  }

  // 캐시 미스 → 원본이 필요. 인스턴스에 이미 읽어둔 게 없다면 다운로드 횟수 제한 확인.
  const fileKey = `${projectId}/${fileId}`;
  if (!inflightFileReads.has(fileKey) && !tryReserveOriginalDownload(fileKey)) {
    console.warn(`[checklist-review] 원본 다운로드 제한 발동 file=${fileId} (10분 3회 초과)`);
    return NextResponse.json(
      { error: "캡처 생성 요청이 몰려 잠시 제한 중입니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  try {
    const bytes = await readFileShared(fileKey, () =>
      readSavedUploadFile({
        id: file.id,
        originalName: file.originalName,
        fileType: file.fileType,
        sizeBytes: file.sizeBytes,
        storageKey: file.storageKey ?? "",
        blobUrl: file.blobUrl,
      }),
    );

    // 캐시 미스 시 고해상도(full)로 한 번만 렌더링하고 썸네일은 축소로 파생 —
    // 카드가 보인 시점(썸네일 요청)에 확대본까지 캐시돼, 라이트박스 클릭이 즉시 뜸.
    // bytes를 그대로 전달 (base64 문자열 변환은 대용량 파일에서 메모리를 배로 씀)
    const fullSnippet = await renderRegionSnippet(bytes, page, region, SIZES.full, anchors);
    if (!fullSnippet) {
      console.warn(`[checklist-review] 캡처 생성 실패(null) file=${fileId} p=${page} region=${regionKey}`);
      return NextResponse.json({ error: "근거 캡처를 생성하지 못했습니다." }, { status: 404 });
    }
    const thumbSnippet = await downscaleJpeg(fullSnippet.base64, SIZES.thumb);

    if (isBlobStorageEnabled()) {
      const saves: Array<{ pathname: string; base64: string }> = [
        { pathname: cachePathFor("full"), base64: fullSnippet.base64 },
      ];
      if (thumbSnippet) saves.push({ pathname: cachePathFor("thumb"), base64: thumbSnippet.base64 });
      await Promise.all(saves.map((entry) => putSnippetCache(entry.pathname, Buffer.from(entry.base64, "base64"))));
    }

    const chosen = size === "thumb" && thumbSnippet ? thumbSnippet : fullSnippet;
    return new NextResponse(new Uint8Array(Buffer.from(chosen.base64, "base64")), { headers: jpegHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "근거 캡처를 불러오지 못했습니다.";
    console.error(`[checklist-review] 캡처 라우트 오류 file=${fileId} p=${page}:`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
