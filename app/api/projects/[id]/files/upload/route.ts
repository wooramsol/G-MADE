import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  getExtension,
  validateUploadExtension,
} from "@/lib/upload-validation";
import { getProjectById } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedContentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/zip",
  "application/x-zip-compressed",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/markdown",
  "application/octet-stream",
];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id: projectId } = await context.params;
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`projects/${projectId}/files/`)) {
          throw new Error("허용되지 않은 업로드 경로입니다.");
        }

        const fileName = pathname.split("/").pop() ?? "";
        const extension = getExtension(fileName);
        if (!extension) {
          throw new Error("파일 확장자를 확인할 수 없습니다.");
        }

        validateUploadExtension(fileName);

        return {
          allowedContentTypes,
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ projectId }),
        };
      },
      onUploadCompleted: async () => {
        // 평가 완료 시 project.files에 메타데이터가 저장됩니다.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일 업로드에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
