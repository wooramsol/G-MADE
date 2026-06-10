import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { addProjectHumanEvaluationSession } from "@/lib/project-store";
import { isFileLike, saveUploadedFiles, toProjectFiles } from "@/lib/save-uploaded-files";
import type { HumanEvaluationItemScore, HumanEvaluationSession } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authSession = await auth();
    if (!authSession?.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const formData = await request.formData();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const reviewerName = String(formData.get("reviewerName") ?? "").trim();
    const summary = String(formData.get("summary") ?? "").trim();
    const entries = formData.getAll("files");
    const files = entries.filter(isFileLike);

    if (!projectId) {
      return NextResponse.json({ error: "프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    if (!reviewerName) {
      return NextResponse.json({ error: "평가자 이름을 입력해 주세요." }, { status: 400 });
    }

    if (files.length === 0) {
      return NextResponse.json({ error: "전문가 평가 자료 파일을 선택해 주세요." }, { status: 400 });
    }

    const itemScores = parseItemScores(formData.get("itemScores"));
    if (itemScores.length === 0) {
      return NextResponse.json({ error: "항목별 점수를 입력해 주세요." }, { status: 400 });
    }

    const savedFiles = await saveUploadedFiles(files);
    const uploadedAt = new Date().toISOString();
    const persistedFiles = toProjectFiles(savedFiles, uploadedAt);

    const session: HumanEvaluationSession = {
      id: `expert-${Date.now()}-${crypto.randomUUID()}`,
      uploadedAt,
      reviewerName,
      summary: summary || undefined,
      files: savedFiles.map((file) => ({
        id: file.id,
        originalName: file.originalName,
        fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
        sizeBytes: file.sizeBytes,
      })),
      itemScores,
    };

    const updatedProject = await addProjectHumanEvaluationSession(projectId, session, persistedFiles);
    if (!updatedProject) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ session, files: savedFiles, project: updatedProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "전문가 평가 자료 업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseItemScores(value: FormDataEntryValue | null): HumanEvaluationItemScore[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as Array<{
      itemId?: string;
      score?: number;
      comment?: string;
    }>;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((row) => typeof row.itemId === "string" && row.itemId.trim())
      .map((row) => ({
        itemId: row.itemId!.trim(),
        score: Math.max(0, Math.min(100, Number(row.score) || 0)),
        comment: row.comment?.trim() || undefined,
      }));
  } catch {
    return [];
  }
}
