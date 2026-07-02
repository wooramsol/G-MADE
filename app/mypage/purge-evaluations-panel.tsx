"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { SectionDescription, SubsectionTitle } from "@/components/typography";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import { showToast } from "../toast";

type ProjectOption = {
  id: string;
  name: string;
};

export default function PurgeEvaluationsPanel({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  function toggleExcluded(projectId: string) {
    setExcludedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  async function handlePurge() {
    setPurging(true);

    try {
      const response = await clientFetchWithTimeout("/api/evaluation-rounds/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeProjectIds: Array.from(excludedIds) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectsUpdated?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "평가 기록을 삭제하지 못했습니다.");
      }

      setConfirmOpen(false);
      showToast({
        message: `평가 기록을 ${payload.projectsUpdated ?? 0}개 프로젝트에서 삭제했습니다.`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "평가 기록을 삭제하지 못했습니다.",
        tone: "error",
      });
    } finally {
      setPurging(false);
    }
  }

  const excludedCount = excludedIds.size;

  return (
    <>
      <section className="rounded-2xl border border-[#f5d0d0] bg-[#fff8f8] p-6 panel-shadow">
        <SubsectionTitle>평가 데이터 관리</SubsectionTitle>
        <SectionDescription className="mt-2">
          프로젝트의 AI·전문가 평가 차수(활성·휴지통)를 데이터베이스에서 영구 삭제합니다. 프로젝트 자체는
          유지됩니다. 아래에서 평가를 유지할 프로젝트를 선택하면 해당 프로젝트는 제외됩니다.
        </SectionDescription>

        {projects.length > 0 ? (
          <div className="mt-4 rounded-xl border border-[#f0dada] bg-white p-3">
            <p className="text-xs font-bold text-[#8a4b4b]">평가를 유지할 프로젝트 (선택)</p>
            <ul className="mt-2 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#475569] hover:bg-[#fdf3f3]">
                    <input
                      checked={excludedIds.has(project.id)}
                      type="checkbox"
                      onChange={() => toggleExcluded(project.id)}
                    />
                    <span className="truncate">{project.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={purging}
          onClick={() => setConfirmOpen(true)}
          type="button"
        >
          {excludedCount > 0 ? `선택 ${excludedCount}개 제외하고 평가 기록 삭제` : "모든 평가 기록 삭제"}
        </button>
      </section>

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="삭제"
        confirmTone="danger"
        description={
          excludedCount > 0
            ? `선택한 ${excludedCount}개 프로젝트를 제외한 모든 프로젝트의 평가 차수가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
            : "모든 프로젝트의 평가 차수가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        }
        loading={purging}
        loadingLabel="삭제 중..."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handlePurge}
        open={confirmOpen}
        title="평가 기록을 삭제하시겠습니까?"
      />
    </>
  );
}
