"use client";

import { useEffect, useMemo, useState } from "react";
import { Caption, MutedText, SubsectionTitle } from "@/components/typography";
import {
  EVALUATION_ANALYSIS_BUDGET_SECONDS,
  EVALUATION_ANALYSIS_STEPS,
  formatRemainingSeconds,
  type EvaluationAnalysisProgressEvent,
} from "@/lib/evaluation-analysis-progress";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type AnalysisBlockingOverlayProps = {
  startedAt: number;
  progress?: EvaluationAnalysisProgressEvent | null;
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
  const remainingSeconds = Math.max(0, EVALUATION_ANALYSIS_BUDGET_SECONDS - elapsedSeconds);
  const activeStepIndex = Math.max(0, (progress?.stepIndex ?? 1) - 1);

  const stepItems = useMemo(
    () =>
      EVALUATION_ANALYSIS_STEPS.map((step, index) => ({
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
      <div className="w-full max-w-md rounded-2xl border border-[#d7dee8] bg-white p-6 shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]"
        />
        <SubsectionTitle className="mt-4 text-center">분석 중</SubsectionTitle>
        <MutedText className="mt-2 text-center">
          {statusMessage ?? progress?.label ?? "하이브리드 평가를 준비하고 있습니다."}
        </MutedText>

        <div className="mt-4 rounded-xl bg-[#f8fafc] px-4 py-3 text-center">
          <p className="text-sm font-bold text-[#15345b]">
            남은 예상 시간 {formatRemainingSeconds(remainingSeconds)}
          </p>
          <Caption className="mt-1 text-[#64748b]">경과 {elapsedSeconds}초</Caption>
        </div>

        <ol className="mt-4 space-y-2">
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
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
