"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { deleteLocalProject } from "./local-project-storage";
import { showToast } from "../toast";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
  redirectTo?: "/projects";
};

export default function DeleteProjectButton({ projectId, projectName, redirectTo }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function deleteProject() {
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok && response.status !== 404) {
        throw new Error(payload.error ?? "프로젝트 삭제에 실패했습니다.");
      }

      deleteLocalProject(projectId);
      setConfirmOpen(false);
      showToast({ message: "프로젝트가 삭제되었습니다.", tone: "success" });

      if (redirectTo) {
        window.setTimeout(() => router.push(redirectTo), 650);
      } else {
        router.refresh();
      }
    } catch (deleteError) {
      showToast({
        message: deleteError instanceof Error ? deleteError.message : "프로젝트 삭제에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        type="button"
        onClick={() => setConfirmOpen(true)}
      >
        프로젝트 삭제
      </button>
      <ConfirmDialog
        description={`"${projectName}" 프로젝트와 평가 결과가 삭제됩니다. 평가 진행 중이어도 삭제할 수 있으며, 되돌릴 수 없습니다.`}
        loading={loading}
        open={confirmOpen}
        onCancel={() => {
          if (!loading) setConfirmOpen(false);
        }}
        onConfirm={deleteProject}
      />
    </>
  );
}
