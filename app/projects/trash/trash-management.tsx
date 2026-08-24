"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { CardTitle, Eyebrow, MutedText } from "@/components/typography";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";

type TrashManagementProps = {
  serverTrashedProjects: Project[];
};

type ConfirmAction =
  | { type: "restore"; project: Project }
  | { type: "purge"; project: Project };

export default function TrashManagement({ serverTrashedProjects }: TrashManagementProps) {
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [loading, setLoading] = useState(false);

  const trashedProjects = useMemo(
    () =>
      [...serverTrashedProjects].sort((left, right) =>
        (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""),
      ),
    [serverTrashedProjects],
  );

  async function handleConfirm() {
    if (!confirmAction) return;

    setLoading(true);

    try {
      if (confirmAction.type === "restore") {
        const response = await fetch(`/api/projects/${confirmAction.project.id}/restore`, { method: "POST" });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; project?: Project };

        if (!response.ok) {
          throw new Error(payload.error ?? "프로젝트 복원에 실패했습니다.");
        }

        showToast({ message: "프로젝트가 복원되었습니다.", tone: "success" });
      } else {
        const project = confirmAction.project;
        const response = await fetch(`/api/projects/${project.id}?permanent=true`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "영구 삭제에 실패했습니다.");
        }

        showToast({ message: "프로젝트가 영구 삭제되었습니다.", tone: "success" });
      }

      setConfirmAction(null);
      router.refresh();
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  if (trashedProjects.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b]">
        휴지통이 비어 있습니다.{" "}
        <Link className="font-bold text-[#2463b3]" href="/projects">
          프로젝트 관리로 이동
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {trashedProjects.map((project) => {

          return (
            <div className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow" key={project.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Eyebrow>{project.reviewType}</Eyebrow>
                  <CardTitle className="mt-2">{project.name}</CardTitle>
                  <MutedText className="mt-2">
                    삭제일 {project.deletedAt ? formatUploadDateTime(project.deletedAt) : "-"}
                  </MutedText>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#15345b] hover:bg-[#f8fafc]"
                    type="button"
                    onClick={() => setConfirmAction({ type: "restore", project })}
                  >
                    복원
                  </button>
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100"
                    type="button"
                    onClick={() => setConfirmAction({ type: "purge", project })}
                  >
                    영구 삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        confirmLabel={confirmAction?.type === "restore" ? "복원" : "영구 삭제"}
        confirmTone={confirmAction?.type === "restore" ? "primary" : "danger"}
        description={
          confirmAction
            ? confirmAction.type === "restore"
              ? `"${confirmAction.project.name}" 프로젝트를 복원합니다.`
              : `"${confirmAction.project.name}" 프로젝트를 영구 삭제합니다. 되돌릴 수 없습니다.`
            : ""
        }
        loading={loading}
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "restore" ? "프로젝트 복원" : "프로젝트 영구 삭제"}
        onCancel={() => {
          if (!loading) setConfirmAction(null);
        }}
        onConfirm={handleConfirm}
      />
    </>
  );
}
