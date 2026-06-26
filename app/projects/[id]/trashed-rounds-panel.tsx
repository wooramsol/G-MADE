"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Caption, SubsectionTitle } from "@/components/typography";
import { getProjectEvaluationRounds } from "@/lib/evaluation-rounds";
import { formatEvaluationRoundLabel, formatUploadDateTime } from "@/lib/format-datetime";
import type { EvaluationRound, Project } from "@/lib/types";
import { showToast } from "../../toast";
import { restoreLocalProjectRound } from "../local-project-storage";

type TrashedRoundsPanelProps = {
  project: Project;
  trashedRounds: EvaluationRound[];
  onRestored?: (
    activeRounds: EvaluationRound[],
    trashedRounds: EvaluationRound[],
    restoredRoundId?: string,
  ) => void;
};

export default function TrashedRoundsPanel({ project, trashedRounds, onRestored }: TrashedRoundsPanelProps) {
  const [restoringRoundId, setRestoringRoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (trashedRounds.length === 0) return null;

  const restoringRound = trashedRounds.find((round) => round.id === restoringRoundId);

  async function restoreRound() {
    if (!restoringRoundId) return;

    const roundId = restoringRoundId;
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/evaluation-rounds/${roundId}/restore`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
      };

      let activeRounds = [...(project.evaluationRounds ?? [])];
      let nextTrashed = trashedRounds.filter((round) => round.id !== roundId);

      if (response.ok && payload.project) {
        activeRounds = getProjectEvaluationRounds(payload.project);
        nextTrashed = payload.project.trashedEvaluationRounds ?? nextTrashed;
      } else if (response.status === 404) {
        const restored = restoreLocalProjectRound(project.id, roundId);
        if (restored) {
          activeRounds = getProjectEvaluationRounds(restored);
          nextTrashed = restored.trashedEvaluationRounds ?? nextTrashed;
        }
      } else {
        throw new Error(payload.error ?? "평가 기록 복원에 실패했습니다.");
      }

      onRestored?.(activeRounds, nextTrashed, roundId);
      setRestoringRoundId(null);
      showToast({ message: "평가 기록이 복원되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "평가 기록 복원에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-dashed border-[#d7dee8] bg-[#f8fafc] p-5">
      <SubsectionTitle>휴지통에 보관된 평가</SubsectionTitle>
      <Caption className="mt-1 text-[#64748b]">
        삭제한 평가 {trashedRounds.length}건이 보관되어 있습니다. 복원하면 통합 평가 결과에 다시 표시됩니다.
      </Caption>

      <div className="mt-4 space-y-2">
        {trashedRounds.map((round) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d7dee8] bg-white px-4 py-3"
            key={round.id}
          >
            <div>
              <p className="text-sm font-bold text-[#15345b]">
                {formatEvaluationRoundLabel(round.evaluatedAt)}
              </p>
              <p className="mt-1 text-xs text-[#64748b]">
                {round.deletedAt ? `삭제일 ${formatUploadDateTime(round.deletedAt)}` : "삭제됨"}
              </p>
            </div>
            <button
              className="rounded-lg border border-[#d7dee8] bg-white px-3 py-2 text-sm font-bold text-[#15345b] transition hover:bg-[#f8fafc]"
              type="button"
              onClick={() => setRestoringRoundId(round.id)}
            >
              복원
            </button>
          </div>
        ))}
      </div>

      <ConfirmDialog
        confirmLabel="복원"
        confirmTone="primary"
        description={
          restoringRound
            ? `${formatEvaluationRoundLabel(restoringRound.evaluatedAt)} 평가를 복원합니다.`
            : "선택한 평가 기록을 복원합니다."
        }
        loading={loading}
        open={Boolean(restoringRoundId)}
        title="평가 기록 복원"
        onCancel={() => {
          if (!loading) setRestoringRoundId(null);
        }}
        onConfirm={restoreRound}
      />
    </section>
  );
}
