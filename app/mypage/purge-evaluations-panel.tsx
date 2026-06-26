"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { SectionDescription, SubsectionTitle } from "@/components/typography";
import { purgeAllLocalEvaluationRounds } from "@/app/projects/local-project-storage";
import { showToast } from "../toast";

export default function PurgeEvaluationsPanel() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  async function handlePurge() {
    setPurging(true);

    try {
      const response = await fetch("/api/evaluation-rounds/purge", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        projectsUpdated?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "평가 기록을 삭제하지 못했습니다.");
      }

      purgeAllLocalEvaluationRounds();
      setConfirmOpen(false);
      showToast({
        message: `모든 평가 기록 ${payload.projectsUpdated ?? 0}개 프로젝트에서 삭제했습니다.`,
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

  return (
    <>
      <section className="rounded-2xl border border-[#f5d0d0] bg-[#fff8f8] p-6 panel-shadow">
        <SubsectionTitle>평가 데이터 관리</SubsectionTitle>
        <SectionDescription className="mt-2">
          모든 프로젝트의 AI·전문가 평가 차수(활성·휴지통)를 서버와 브라우저 저장소에서 영구 삭제합니다. 프로젝트
          자체는 유지됩니다.
        </SectionDescription>
        <button
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={purging}
          onClick={() => setConfirmOpen(true)}
          type="button"
        >
          모든 평가 기록 삭제
        </button>
      </section>

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="모두 삭제"
        confirmTone="danger"
        description="모든 프로젝트의 평가 차수가 영구 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
        loading={purging}
        loadingLabel="삭제 중..."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handlePurge}
        open={confirmOpen}
        title="모든 평가 기록을 삭제하시겠습니까?"
      />
    </>
  );
}
