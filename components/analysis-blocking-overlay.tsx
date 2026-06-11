"use client";

import { useEffect } from "react";
import { Caption, MutedText, SubsectionTitle } from "@/components/typography";

type AnalysisBlockingOverlayProps = {
  message?: string;
  estimatedSeconds?: number;
};

export default function AnalysisBlockingOverlay({
  message = "하이브리드 평가를 분석하고 있습니다. 잠시만 기다려 주세요.",
  estimatedSeconds = 120,
}: AnalysisBlockingOverlayProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const estimatedLabel =
    estimatedSeconds >= 60
      ? `최대 ${Math.round(estimatedSeconds / 60)}분`
      : `최대 ${estimatedSeconds}초`;

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#172033]/50 p-4"
      role="alertdialog"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#d7dee8] bg-white p-6 text-center shadow-xl">
        <div
          aria-hidden="true"
          className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]"
        />
        <SubsectionTitle className="mt-4">분석 중</SubsectionTitle>
        <MutedText className="mt-2">{message}</MutedText>
        <Caption className="mt-3 text-[#94a3b8]">{estimatedLabel} 정도 소요될 수 있습니다.</Caption>
      </div>
    </div>
  );
}
