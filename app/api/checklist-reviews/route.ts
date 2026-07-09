import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import {
  runChecklistReview,
  type RunChecklistReviewInput,
} from "@/lib/checklist-review/run-checklist-review";
import {
  CHECKLIST_SERVER_DEADLINE_MESSAGE,
  CHECKLIST_SERVER_DEADLINE_MS,
} from "@/lib/checklist-review/progress";
import { isFileLike } from "@/lib/save-uploaded-files";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const rateKey = `checklist-review:${authResult.session.user?.id ?? authResult.session.user?.email ?? "anonymous"}`;
  const rate = checkRateLimit(rateKey, RATE_LIMITS.evaluation.limit, RATE_LIMITS.evaluation.windowMs);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `검토 요청이 너무 잦습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  try {
    const formData = await request.formData();
    const wantsStream = String(formData.get("stream") ?? "") === "1";

    const projectId = String(formData.get("projectId") ?? "").trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
    }

    const fileRefs = parseStoredFileRefs(formData.get("fileRefs"));
    const invalidRef = fileRefs.find(
      (ref) => !ref.storageKey.startsWith(`projects/${projectId}/files/`),
    );
    if (invalidRef) {
      return NextResponse.json(
        { error: "다른 프로젝트의 파일은 참조할 수 없습니다." },
        { status: 400 },
      );
    }

    const files = formData.getAll("files").filter(isFileLike) as File[];

    const input: RunChecklistReviewInput = {
      projectId,
      fileRefs,
      files,
      projectSnapshot: parseProjectSnapshot(formData.get("projectSnapshot")),
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const write = (payload: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          const heartbeat = setInterval(() => {
            write({ type: "heartbeat", at: Date.now() });
          }, 12_000);

          try {
            const result = await Promise.race([
              runChecklistReview(input, (event) => write(event)),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(CHECKLIST_SERVER_DEADLINE_MESSAGE)), CHECKLIST_SERVER_DEADLINE_MS);
              }),
            ]);
            write({
              type: "complete",
              review: result.review,
              project: result.project,
              warnings: result.warnings,
            });
            try {
              revalidateProjectViews(input.projectId);
            } catch {
              // 완료 응답 이후 캐시 갱신 실패는 결과에 영향 없음
            }
          } catch (error) {
            console.error("[checklist-review] failed:", error);
            write({
              type: "error",
              error: error instanceof Error ? error.message : "체크리스트 검토 중 오류가 발생했습니다.",
            });
          } finally {
            clearInterval(heartbeat);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await runChecklistReview(input);
    revalidateProjectViews(input.projectId);
    return NextResponse.json({
      review: result.review,
      project: result.project,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "체크리스트 검토 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseProjectSnapshot(value: FormDataEntryValue | null): Project | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as Project;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function parseStoredFileRefs(value: FormDataEntryValue | null): StoredFileRef[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as StoredFileRef[];
    return Array.isArray(parsed)
      ? parsed
          .filter((ref) => ref.id && ref.storageKey && ref.originalName)
          .map((ref) => ({
            id: String(ref.id),
            originalName: String(ref.originalName),
            fileType: String(ref.fileType ?? ""),
            sizeBytes: Math.max(0, Number(ref.sizeBytes) || 0),
            storageKey: String(ref.storageKey),
            blobUrl: ref.blobUrl ? String(ref.blobUrl) : undefined,
            uploadedAt: ref.uploadedAt ? String(ref.uploadedAt) : undefined,
          }))
      : [];
  } catch {
    return [];
  }
}
