"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteProjectButtonProps = {
  projectId: string;
  projectName: string;
  redirectTo?: string;
};

export default function DeleteProjectButton({ projectId, projectName, redirectTo }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function deleteProject() {
    const confirmed = window.confirm(`"${projectName}" 프로젝트를 삭제할까요?`);
    if (!confirmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "프로젝트 삭제에 실패했습니다.");
      }

      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "프로젝트 삭제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        type="button"
        onClick={deleteProject}
      >
        {loading ? "삭제 중..." : "프로젝트 삭제"}
      </button>
      {error ? <p className="text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
