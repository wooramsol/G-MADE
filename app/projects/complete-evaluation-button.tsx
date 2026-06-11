"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { isProjectEvaluationComplete } from "@/lib/project-evaluation-status";
import type { Project } from "@/lib/types";
import { getLocalProjects, saveLocalProject } from "./local-project-storage";
import { showToast } from "../toast";

type CompleteEvaluationButtonProps = {
  project: Project;
  onUpdated?: (project: Project) => void;
};

export default function CompleteEvaluationButton({ project, onUpdated }: CompleteEvaluationButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isProjectEvaluationComplete(project)) {
    return null;
  }

  async function completeEvaluation() {
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "완료" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
      };

      let updatedProject: Project;

      if (response.ok && payload.project) {
        updatedProject = payload.project;
      } else if (response.status === 404 || response.status === 401) {
        const local = getLocalProjects().find((item) => item.id === project.id);
        updatedProject = {
          ...(local ?? project),
          status: "완료",
          updatedAt: new Date().toISOString(),
        };
      } else {
        throw new Error(payload.error ?? "평가완료 처리에 실패했습니다.");
      }

      saveLocalProject(updatedProject);
      onUpdated?.(updatedProject);
      setConfirmOpen(false);
      showToast({ message: "프로젝트가 평가완료로 처리되었습니다.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "평가완료 처리에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        type="button"
        onClick={() => setConfirmOpen(true)}
      >
        평가완료
      </button>
      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="평가완료"
        confirmTone="primary"
        description={`"${project.name}" 프로젝트를 평가완료로 처리합니다. 이후 대시보드의 평가완료 통계에 반영됩니다.`}
        loading={loading}
        loadingLabel="처리 중..."
        open={confirmOpen}
        title="평가완료 처리"
        onCancel={() => {
          if (!loading) setConfirmOpen(false);
        }}
        onConfirm={completeEvaluation}
      />
    </>
  );
}
