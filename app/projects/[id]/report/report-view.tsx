"use client";

import { useEffect, useState } from "react";
import type { ChecklistReview } from "@/lib/checklist-review/types";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { Project } from "@/lib/types";
import ChecklistReviewResults from "../checklist-review-results";
import LandscapeZonePanel from "../landscape-zone-panel";

/** 인쇄(PDF 저장) 화면 — 지도·지형·근거 캡처가 그려질 시간을 기다린 뒤 인쇄 창을 연다 */
export default function ReportView({ project, review, statusLabel }: { project: Project; review: ChecklistReview; statusLabel: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const waitImages = async () => {
      // 지도 타일·3D 지형·근거 캡처 로딩 대기 (최대 15초)
      const started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 3500));
      while (!cancelled && Date.now() - started < 15_000) {
        const pending = [...document.images].filter((image) => !image.complete);
        const loadingText = document.body.innerText.includes("캡처 불러오는 중");
        if (pending.length === 0 && !loadingText) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (cancelled) return;
      setReady(true);
      window.print();
    };
    void waitImages();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033] print:bg-white">
      <div className="sticky top-9 z-[1500] border-b border-[#d7dee8] bg-white/95 px-6 py-3 print:hidden">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3">
          <p className="text-sm text-[#475569]">
            {ready
              ? "인쇄 창에서 대상을 ‘PDF로 저장’으로 선택해 저장하세요."
              : "지도·지형·근거 캡처를 불러오는 중… 잠시 후 인쇄 창이 열립니다."}
          </p>
          <div className="flex gap-2">
            <button className="primary-action-blue rounded-md px-4 py-2 text-sm font-bold" onClick={() => window.print()} type="button">
              PDF로 저장
            </button>
            <button className="rounded-md border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#475569]" onClick={() => window.close()} type="button">
              닫기
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] space-y-5 px-6 py-6 print:max-w-none print:px-0 print:py-0">
        {/* 표지 정보 */}
        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <p className="text-xs font-bold tracking-[0.14em] text-[#2463b3]">경관심의 사전검토 결과 · AI 에이전트 분석</p>
          <h1 className="mt-2 text-2xl font-bold text-[#15345b]">{project.name}</h1>
          <p className="mt-2 text-sm text-[#475569]">
            분석 일시 {formatUploadDateTime(review.reviewedAt)} · 검토 자료 {review.files.map((file) => file.originalName.normalize("NFC")).join(", ")} ·
            진행 상태 {statusLabel}
          </p>
        </section>

        {/* 프로젝트 개요 */}
        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <h2 className="text-lg font-bold text-[#15345b]">프로젝트 개요</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <p className="text-lg font-bold text-[#15345b]">{project.name}</p>
            <span className="rounded-[3px] border border-[#d0d5dd] bg-white px-2 py-0.5 text-xs font-semibold text-[#475569]">접수 {project.receivedAt}</span>
          </div>
          <div className="mt-3 rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
            <p className="text-xs font-bold text-[#64748b]">사업개요</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6">{project.summary || "—"}</p>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
            <div className="col-span-2 rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
              <p className="text-xs font-bold text-[#64748b]">사업위치</p>
              {project.locationPoint?.adminRegion ? <p className="mt-2 font-semibold text-[#15345b]">{project.locationPoint.adminRegion}</p> : null}
              <p className="mt-1 font-semibold">{project.location}</p>
            </div>
            <div className="rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
              <p className="text-xs font-bold text-[#64748b]">시행자</p>
              <p className="mt-2 font-semibold">{project.client || "—"}</p>
            </div>
            <div className="rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
              <p className="text-xs font-bold text-[#64748b]">심의종류</p>
              <p className="mt-2 font-semibold">{project.reviewType || "—"}</p>
            </div>
          </div>
        </section>

        {/* 대상지 현황 · 지형 분석 (화면과 같은 카드) */}
        <div className="grid grid-cols-2 items-stretch gap-5 print-avoid-break">
          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} projectId={project.id} />
        </div>

        {/* 체크리스트 검토 결과 */}
        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow print:shadow-none" style={{ breakBefore: "page" }}>
          <ChecklistReviewResults printMode projectId={project.id} review={review} />
        </section>

        <p className="pb-4 text-center text-[11px] text-[#94a3b8]">
          G-MADE HIVE · AI 분석 결과는 참고자료이며 최종 판단은 담당 공무원·심의위원회가 합니다.
        </p>
      </div>
    </main>
  );
}
