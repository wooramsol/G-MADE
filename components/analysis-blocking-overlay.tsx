"use client";

import { useEffect, useMemo, useState } from "react";
import PageInventoryPanel from "@/components/page-inventory-panel";
import { Caption, MutedText, SubsectionTitle } from "@/components/typography";
import type { FilePageInventory } from "@/lib/ai/page-inventory";
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
  pageInventory?: FilePageInventory[] | null;
};

export default function AnalysisBlockingOverlay({
  startedAt,
  progress,
  statusMessage,
  pageInventory,
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
  const showInventory = Boolean(pageInventory?.length);

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
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-[#d7dee8] bg-white shadow-xl ${
          showInventory ? "max-w-4xl" : "max-w-md"
        }`}
      >
        <div className="shrink-0 border-b border-[#e2e8f0] p-6 pb-4">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="mt-0.5 h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]"
            />
            <div className="min-w-0 flex-1">
              <SubsectionTitle>{showInventory ? "문서 페이지 확인 · 분석 계속 중" : "분석 중"}</SubsectionTitle>
              <MutedText className="mt-1">
                {showInventory
                  ? "아래는 PDF를 페이지별로 읽은 결과입니다. 확인하는 동안 AI 평가가 이어집니다."
                  : (statusMessage ?? progress?.label ?? "하이브리드 평가를 준비하고 있습니다.")}
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

        {showInventory ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <PageInventoryPanel compact inventory={pageInventory!} title="페이지별 인식 내용" />
          </div>
        ) : (
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
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        )}

        {showInventory ? (
          <div className="shrink-0 border-t border-[#e2e8f0] bg-[#f8fafc] px-6 py-3">
            <p className="text-xs font-semibold text-[#64748b]">
              현재 단계: {progress?.label ?? "AI 평가 분석"} · 문서 본문 추출이 끝났습니다.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
