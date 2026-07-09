"use client";

import { useEffect, useMemo, useState } from "react";
import { Caption, MutedText, SubsectionTitle } from "@/components/typography";
import {
  CHECKLIST_REVIEW_STEPS,
  type ChecklistReviewProgressEvent,
} from "@/lib/checklist-review/progress";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const REVIEW_BUDGET_SECONDS = 285;

function formatRemainingSeconds(seconds: number): string {
  if (seconds <= 0) return "잠시만요";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest}초`;
  return `${minutes}분 ${rest}초`;
}

type AnalysisBlockingOverlayProps = {
  startedAt: number;
  progress?: ChecklistReviewProgressEvent | null;
  statusMessage?: string;
};

export default function AnalysisBlockingOverlay({
  startedAt,
  progress,
  statusMessage,
}: AnalysisBlockingOverlayProps) {
  useBodyScrollLock(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const remainingSeconds = Math.max(0, REVIEW_BUDGET_SECONDS - elapsedSeconds);
  const activeStepIndex = Math.max(0, (progress?.stepIndex ?? 1) - 1);

  const stepItems = useMemo(
    () =>
      CHECKLIST_REVIEW_STEPS.map((step, index) => ({
        ...step,
        state: index < activeStepIndex ? "done" : index === activeStepIndex ? "active" : "pending",
      })),
    [activeStepIndex],
  );

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#172033]/50 p-4"
      role="alertdialog"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[#d7dee8] bg-white shadow-xl">
        <div className="shrink-0 border-b border-[#e2e8f0] p-6 pb-4">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="mt-0.5 h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]"
            />
            <div className="min-w-0 flex-1">
              <SubsectionTitle>체크리스트 검토 중</SubsectionTitle>
              <MutedText className="mt-1">
                {statusMessage ?? progress?.label ?? "체크리스트 검토를 준비하고 있습니다."}
              </MutedText>
              <div className="mt-3 inline-flex rounded-xl bg-[#f8fafc] px-4 py-2">
                <p className="text-sm font-bold text-[#15345b]">
                  남은 예상 시간 {formatRemainingSeconds(remainingSeconds)}
                </p>
                <Caption className="ml-3 self-center text-[#64748b]">경과 {elapsedSeconds}초</Caption>
              </div>
            </div>
          </div>
        </div>

        <ol className="space-y-2 px-6 pb-6 pt-2">
          {stepItems.map((step, index) => (
            <li
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                step.state === "active"
                  ? "bg-[#eef4fb] font-semibold text-[#15345b]"
                  : step.state === "done"
                    ? "text-[#64748b]"
                    : "text-[#94a3b8]"
              }`}
              key={step.id}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.state === "active"
                    ? "bg-[#2463b3] text-white"
                    : step.state === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[#e2e8f0] text-[#64748b]"
                }`}
              >
                {step.state === "done" ? "✓" : index + 1}
              </span>
              <span>{step.state === "active" && progress?.label ? progress.label : step.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
