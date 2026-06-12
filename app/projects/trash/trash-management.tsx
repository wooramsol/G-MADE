"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { CardTitle, Eyebrow, MutedText } from "@/components/typography";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { mergeProjectWithLocal } from "@/lib/merge-project-state";
import { getTrashedEvaluationRounds, isProjectTrashed } from "@/lib/trash";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import {
  getLocalProjects,
  purgeLocalProject,
  restoreLocalProject,
} from "../local-project-storage";

type TrashManagementProps = {
  serverTrashedProjects: Project[];
};

type ConfirmAction =
  | { type: "restore"; project: Project }
  | { type: "purge"; project: Project };

export default function TrashManagement({ serverTrashedProjects }: TrashManagementProps) {
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLocalProjects(getLocalProjects());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const trashedProjects = useMemo(() => {
    const localById = new Map(localProjects.map((project) => [project.id, project]));
    const mergedServer = serverTrashedProjects.map((project) => {
      const local = localById.get(project.id);
      return local ? mergeProjectWithLocal(project, local) : project;
    });
    const serverIds = new Set(serverTrashedProjects.map((project) => project.id));
    const localOnly = localProjects.filter((project) => !serverIds.has(project.id) && isProjectTrashed(project));
    const byId = new Map<string, Project>();

    for (const project of [...mergedServer, ...localOnly]) {
      if (isProjectTrashed(project)) {
        byId.set(project.id, project);
      }
    }

    return Array.from(byId.values()).sort((left, right) =>
      (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""),
    );
  }, [localProjects, serverTrashedProjects]);

  async function handleConfirm() {
    if (!confirmAction) return;

    setLoading(true);

    try {
      if (confirmAction.type === "restore") {
        const response = await fetch(`/api/projects/${confirmAction.project.id}/restore`, { method: "POST" });
        const payload = (await response.json().catch(() => ({}))) as { error?: string; project?: Project };

        if (!response.ok && response.status !== 404) {
          throw new Error(payload.error ?? "프로젝트 복원에 실패했습니다.");
        }

        restoreLocalProject(confirmAction.project.id);
        showToast({ message: "프로젝트가 복원되었습니다.", tone: "success" });
      } else {
        const response = await fetch(`/api/projects/${confirmAction.project.id}?permanent=true`, {
          method: "DELETE",
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        if (!response.ok && response.status !== 404) {
          throw new Error(payload.error ?? "영구 삭제에 실패했습니다.");
        }

        purgeLocalProject(confirmAction.project.id);
        showToast({ message: "프로젝트가 영구 삭제되었습니다.", tone: "success" });
      }

      setLocalProjects(getLocalProjects());
      setConfirmAction(null);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "요청 처리에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!hydrated && serverTrashedProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm font-semibold text-[#64748b]">
        휴지통을 불러오는 중입니다.
      </div>
    );
  }

  if (trashedProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b]">
        휴지통이 비어 있습니다.{" "}
        <Link className="font-bold text-[#2463b3]" href="/projects">
          프로젝트 관리로 이동
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2">
        {trashedProjects.map((project) => {
          const trashedRounds = getTrashedEvaluationRounds(project);

          return (
            <article
              className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow"
              key={project.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Eyebrow>삭제된 프로젝트</Eyebrow>
                  <CardTitle className="mt-2">{project.name}</CardTitle>
                  <MutedText className="mt-2">
                    삭제일 {project.deletedAt ? formatUploadDateTime(project.deletedAt) : "-"}
                  </MutedText>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-[#d7dee8] bg-white px-3 py-2 text-sm font-bold text-[#15345b] transition hover:bg-[#f8fafc]"
                    type="button"
                    onClick={() => setConfirmAction({ type: "restore", project })}
                  >
                    복원
                  </button>
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
                    type="button"
                    onClick={() => setConfirmAction({ type: "purge", project })}
                  >
                    영구 삭제
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-[#475569]">
                <p>
                  <span className="font-semibold text-[#15345b]">위치</span> {project.location}
                </p>
                <p>
                  <span className="font-semibold text-[#15345b]">평가 차수</span>{" "}
                  {(project.evaluationRounds ?? []).length}건
                  {trashedRounds.length > 0 ? ` · 휴지통 차수 ${trashedRounds.length}건` : ""}
                </p>
              </div>

              {trashedRounds.length > 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-[#d7dee8] bg-[#f8fafc] p-3">
                  <p className="text-xs font-bold text-[#64748b]">휴지통에 보관된 평가 차수</p>
                  <ul className="mt-2 space-y-1 text-sm text-[#475569]">
                    {trashedRounds.map((round, index) => (
                      <li key={round.id}>
                        {trashedRounds.length - index}차 ·{" "}
                        {round.deletedAt ? formatUploadDateTime(round.deletedAt) : "삭제됨"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <ConfirmDialog
        confirmLabel={confirmAction?.type === "purge" ? "영구 삭제" : "복원"}
        confirmTone={confirmAction?.type === "purge" ? "danger" : "primary"}
        description={
          confirmAction?.type === "restore"
            ? `"${confirmAction.project.name}" 프로젝트를 복원합니다.`
            : confirmAction?.type === "purge"
              ? `"${confirmAction.project.name}" 프로젝트와 평가 결과가 영구 삭제됩니다. 되돌릴 수 없습니다.`
              : ""
        }
        loading={loading}
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "purge" ? "영구 삭제" : "프로젝트 복원"}
        onCancel={() => {
          if (!loading) setConfirmAction(null);
        }}
        onConfirm={handleConfirm}
      />
    </>
  );
}
