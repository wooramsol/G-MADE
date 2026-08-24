import { head, put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getBlobAccess } from "@/lib/blob-config";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
import { downscaleJpeg, renderRegionSnippet } from "@/lib/pdf/render-page";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const SIZES = { thumb: 520, full: 1400 } as const;

/**
 * 스토어 실제 접근 모드 기억 — BLOB_DEFAULT_ACCESS 설정(private)과 실제 스토어(public)가
 * 어긋나면 put이 실패하므로("Cannot use private access on a public store" 실측),
 * 실패 시 public으로 재시도하고 성공한 모드를 기억합니다.
 */
let resolvedBlobAccess: "public" | "private" | null = null;

async function putSnippetCache(pathname: string, buffer: Buffer): Promise<void> {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback: "public" | "private" = first === "private" ? "public" : "private";
    if (/access on a (public|private) store/i.test(message)) {
      try {
        await attempt(fallback);
        return;
      } catch (retryError) {
        console.warn(
          "[checklist-review] 캡처 캐시 저장 실패(재시도 포함):",
          retryError instanceof Error ? retryError.message : retryError,
        );
        return;
      }
    }
    console.warn("[checklist-review] 캡처 캐시 저장 실패:", message);
  }
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

  // 결정적 캐시 경로 — 같은 캡처는 한 번만 렌더링
  const regionKey = region
    ? `${region.x.toFixed(4)}-${region.y.toFixed(4)}-${region.width.toFixed(4)}-${region.height.toFixed(4)}`
    : "page";
  const cachePathFor = (variant: keyof typeof SIZES) =>
    `projects/${projectId}/snippets/${reviewId}/${fileId}-p${page}-${variant}-${regionKey}.jpg`;

  if (isBlobStorageEnabled()) {
    try {
      // head는 public/private 스토어 모두에서 동작 — URL을 얻어 스트리밍
      const cached = await head(cachePathFor(size));
      if (cached?.url) {
        const upstream = await fetch(cached.downloadUrl ?? cached.url);
        if (upstream.ok && upstream.body) {
          return new Response(upstream.body, { headers: jpegHeaders });
        }
      }
    } catch {
      // 캐시 미스 — 아래에서 새로 렌더링
    }
  }

  try {
    const bytes = await readSavedUploadFile({
      id: file.id,
      originalName: file.originalName,
      fileType: file.fileType,
      sizeBytes: file.sizeBytes,
      storageKey: file.storageKey ?? "",
      blobUrl: file.blobUrl,
    });

    // 캐시 미스 시 고해상도(full)로 한 번만 렌더링하고 썸네일은 축소로 파생 —
    // 카드가 보인 시점(썸네일 요청)에 확대본까지 캐시돼, 라이트박스 클릭이 즉시 뜸.
    const fullSnippet = await renderRegionSnippet(Buffer.from(bytes).toString("base64"), page, region, SIZES.full);
    if (!fullSnippet) {
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
