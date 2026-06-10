"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import EvaluationGradeLegend from "@/components/evaluation-grade-legend";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { dedupeReferenceLaws } from "@/lib/dedupe-reference-laws";
import { buildLawReferenceUrl } from "@/lib/reference-links";
import { toAchievementPercent } from "@/lib/hybrid-evaluation";
import { buildHybridViewFromRound } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult, Project } from "@/lib/types";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  rounds: EvaluationRound[];
  showHeader?: boolean;
  onRoundsChange?: (rounds: EvaluationRound[]) => void;
};

type RoundWithNumber = EvaluationRound & { roundNumber: number };

export default function ProjectEvaluationWorkspace({
  project,
  rounds,
  showHeader = true,
  onRoundsChange,
}: Props) {
  const sorted = useMemo<RoundWithNumber[]>(() => {
    const ordered = [...rounds].sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
    );
    return ordered.map((round, index) => ({
      ...round,
      roundNumber: ordered.length - index,
    }));
  }, [rounds]);

  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const previousRoundCountRef = useRef(rounds.length);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingRoundId, setDeletingRoundId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectedRound = sorted.find((round) => round.id === selectedId) ?? sorted[0];
  const hybridView = selectedRound ? buildHybridViewFromRound(selectedRound, selectedRound.roundNumber) : null;

  const aiAvg =
    hybridView && hybridView.results.length > 0
      ? Math.round(
          (hybridView.results.reduce((sum, row) => sum + row.aiEvaluation.score, 0) /
            hybridView.results.length) *
            10,
        ) / 10
      : null;
  const expertAvg =
    hybridView && hybridView.results.length > 0
      ? Math.round(
          (hybridView.results.reduce((sum, row) => sum + row.humanEvaluation.score, 0) /
            hybridView.results.length) *
            10,
        ) / 10
      : null;

  const deletingRound = sorted.find((round) => round.id === deletingRoundId);
  const referenceLaws = dedupeReferenceLaws(selectedRound?.aiAnalysis.referenceLaws ?? []).filter(
    (law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null,
  );

  useEffect(() => {
    if (sorted.length === 0) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => {
      if (!current || !sorted.some((round) => round.id === current)) {
        return sorted[0].id;
      }
      return current;
    });
  }, [sorted]);

  useEffect(() => {
    if (rounds.length <= previousRoundCountRef.current) {
      previousRoundCountRef.current = rounds.length;
      return;
    }

    const latestRoundId = sorted[0]?.id;
    previousRoundCountRef.current = rounds.length;
    if (!latestRoundId) return;

    setSelectedId(latestRoundId);

    const timeout = window.setTimeout(() => {
      requestAnimationFrame(() => {
        const element = document.getElementById("hybrid-evaluation-results");
        if (!element) return;

        const offset = 24;
        const top = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [rounds.length, sorted]);

  function requestDeleteRound(roundId: string) {
    setDeletingRoundId(roundId);
    setDeleteConfirmOpen(true);
  }

  async function deleteRound() {
    if (!deletingRoundId) return;

    const roundId = deletingRoundId;
    let next: EvaluationRound[] = sorted.filter((round) => round.id !== roundId);

    setDeleting(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/evaluation-rounds/${roundId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: { evaluationRounds?: EvaluationRound[] };
      };

      if (response.ok) {
        next = payload.project?.evaluationRounds ?? next;
      } else if (response.status === 404) {
        // 브라우저 전용 프로젝트 등 서버에 없는 경우 로컬 상태만 반영합니다.
      } else {
        throw new Error(payload.error ?? "삭제에 실패했습니다.");
      }

      onRoundsChange?.(next);
      if (selectedId === roundId) {
        setSelectedId(next[0]?.id ?? null);
      }
      setDeleteConfirmOpen(false);
      setDeletingRoundId(null);
      showToast({ message: "평가 차수가 삭제되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  if (!selectedRound || !hybridView) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-[#f8fafc] p-8 text-center text-sm text-[#64748b]">
        AI·전문가 자료를 업로드하고 하이브리드 평가 분석을 실행하면 통합 평가 결과가 이 영역에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        {showHeader ? (
          <SectionTitle
            title="통합 평가 결과"
            description="AI·전문가 자료를 함께 분석한 차수별 통합 결과와 종합 점수입니다."
          />
        ) : null}

        <div className={`flex flex-wrap items-center gap-3 ${showHeader ? "mt-5" : ""}`}>
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
            총 {sorted.length}차
          </span>
        </div>

        <ConfirmDialog
          description={
            deletingRound
              ? `${deletingRound.roundNumber}차 평가 결과가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`
              : "선택한 평가 차수가 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
          }
          loading={deleting}
          open={deleteConfirmOpen}
          onCancel={() => {
            if (!deleting) {
              setDeleteConfirmOpen(false);
              setDeletingRoundId(null);
            }
          }}
          onConfirm={deleteRound}
        />

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7dee8] bg-white p-1">
          <div className="flex min-w-max gap-1">
            {sorted.map((round) => {
              const active = round.id === selectedRound.id;
              return (
                <div
                  key={round.id}
                  className={`relative rounded-lg sm:min-w-[160px] ${
                    active
                      ? "bg-[#eef4fb] shadow-sm ring-1 ring-[#2463b3]/25"
                      : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`${round.roundNumber}차 평가 삭제`}
                    className="absolute right-1 top-1 z-10 rounded p-0.5 text-[10px] font-bold leading-none text-red-500 hover:bg-red-50 hover:text-red-700"
                    onClick={(event) => {
                      event.stopPropagation();
                      requestDeleteRound(round.id);
                    }}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 pr-6 text-left transition ${
                      active ? "text-[#15345b]" : "text-[#64748b] hover:text-[#15345b]"
                    }`}
                    onClick={() => setSelectedId(round.id)}
                  >
                    <span className="block text-sm font-bold">{round.roundNumber}차 평가</span>
                    <span className="mt-0.5 block text-[11px] text-[#64748b]">
                      {formatUploadDateTime(round.evaluatedAt)}
                    </span>
                    <span className="mt-1 block text-[11px] text-[#64748b]">
                      AI {round.aiFiles.length} · 전문가 {round.expertFiles.length}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#15345b] px-3 py-1 text-xs font-bold text-white">
              {selectedRound.roundNumber}차
            </span>
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
              AI {selectedRound.aiWeight}% · 전문가 {selectedRound.expertWeight}%
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {selectedRound.reviewerName}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              총 배점 {selectedRound.totalPoints}점
            </span>
            {aiAvg !== null ? (
              <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
                AI 평균 {aiAvg}점
              </span>
            ) : null}
            {expertAvg !== null ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                전문가 평균 {expertAvg}점
              </span>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FileList title="AI 평가 자료" files={selectedRound.aiFiles} tone="ai" />
            <FileList title="전문가 평가 자료" files={selectedRound.expertFiles} tone="expert" />
          </div>

          {selectedRound.expertSummary ? (
            <p className="rounded-xl bg-white p-3 text-sm leading-6 text-[#475569]">{selectedRound.expertSummary}</p>
          ) : null}

          <p className="text-sm leading-6 text-[#475569]">{selectedRound.aiAnalysis.summary}</p>

          <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[#15345b]">
                종합 점수 {hybridView.projectScore} / {selectedRound.totalPoints}점
              </h3>
              <EvaluationGradeLegend />
            </div>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
              <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
            </div>
            <p className="mb-3 text-xs font-bold text-[#64748b]">평가항목 총 {hybridView.results.length}개</p>
            <EvaluationTable results={hybridView.results} reviewerName={selectedRound.reviewerName} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {hybridView.results.map((result) => (
              <div className="rounded-xl border border-[#d7dee8] bg-white p-3" key={`${selectedRound.id}-${result.item.id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#15345b]">{result.item.detailItem}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#e8f1ff] px-2.5 py-1 text-[11px] font-bold text-[#2463b3]">
                      AI {result.aiEvaluation.score}점
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      전문가 {result.humanEvaluation.score}점
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#475569]">{result.aiEvaluation.rationale}</p>
                {result.humanEvaluation.comment ? (
                  <p className="mt-2 text-xs leading-5 text-[#64748b]">
                    전문가 의견: {result.humanEvaluation.comment}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {referenceLaws.length > 0 ? (
            <div className="rounded-xl border border-[#d7dee8] bg-white p-3 text-sm">
              <p className="font-bold text-[#15345b]">법령 근거</p>
              {referenceLaws.map((law) => (
                <div className="mt-2 text-[#64748b]" key={`${selectedRound.id}-${law.title}-${law.article}`}>
                  <ReferenceLinkTitle
                    title={`${law.title} ${law.article}`}
                    href={buildLawReferenceUrl(law.title, law.sourceUrl)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-[#64748b]">
            AI 엔진: {formatProviderBadgeLabel(selectedRound.aiAnalysis.provider)} ·{" "}
            {selectedRound.aiAnalysis.mode === "live" ? "실제 API 분석" : "데모 분석"}
          </p>
        </div>
      </section>

      <section id="explainable-ai">
        <SectionTitle title="AI 평가 근거" description="선택 차수의 AI 분석 근거입니다." />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {hybridView.results.slice(0, 4).map((result) => (
            <Panel
              title={result.item.detailItem}
              action={`AI ${result.aiEvaluation.score}점 · 전문가 ${result.humanEvaluation.score}점`}
              key={result.item.id}
            >
              <p className="text-sm leading-6 text-[#475569]">{result.aiEvaluation.rationale}</p>
              {result.humanEvaluation.comment ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-[#475569]">
                  전문가 의견: {result.humanEvaluation.comment}
                </p>
              ) : null}
              <p className="mt-4 rounded-xl bg-[#fff7ed] p-3 text-sm leading-6 text-[#9a3412]">
                개선권고: {result.aiEvaluation.recommendation}
              </p>
            </Panel>
          ))}
        </div>
      </section>

      <section id="ai-document-analysis">
        <SectionTitle
          title="AI 문서 섹션 추출"
          description={`${selectedRound.roundNumber}차 AI 자료 분석 결과`}
        />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {selectedRound.aiAnalysis.documentSections.map((section) => (
            <div className="rounded-2xl border border-[#d7dee8] bg-white p-4 panel-shadow" key={section.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-[#15345b]">{section.label}</p>
                <span className="text-sm font-bold text-[#2463b3]">{section.confidence}%</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#64748b]">{section.summary}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-[#15345b]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-[#15345b]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function WeightBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm font-bold text-[#15345b]">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function FileList({
  title,
  files,
  tone,
}: {
  title: string;
  files: EvaluationRound["aiFiles"];
  tone: "ai" | "expert";
}) {
  const headerClass = tone === "ai" ? "text-[#2463b3]" : "text-[#15345b]";
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-white p-3">
      <p className={`text-sm font-bold ${headerClass}`}>
        {title} ({files.length})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-[#64748b]">
        {files.map((file) => (
          <li key={file.id}>
            {file.originalName} · {file.fileType}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvaluationTable({
  results,
  reviewerName,
}: {
  results: HybridResult[];
  reviewerName: string;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#d7dee8]">
      <table className="w-full min-w-[920px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[40px]" />
          <col className="w-[13%]" />
          <col className="w-[6%]" />
          <col className="w-[9%]" />
          <col className="w-[9%]" />
          <col className="w-[8%]" />
          <col className="w-[52%]" />
        </colgroup>
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-2 py-2.5 text-center">#</th>
            <th className="px-3 py-2.5">평가항목</th>
            <th className="px-3 py-2.5 text-center">배점</th>
            <th className="px-3 py-2.5 text-center">AI 점수</th>
            <th className="px-3 py-2.5 text-center">전문가 점수 ({reviewerName})</th>
            <th className="px-3 py-2.5 text-center">최종점수</th>
            <th className="px-3 py-2.5">평가 근거 / 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result, index) => (
            <tr key={result.item.id}>
              <td className="px-2 py-2.5 align-top text-center text-xs font-bold text-[#64748b]">
                {index + 1}
              </td>
              <td className="px-3 py-2.5 align-top">
                <p className="line-clamp-2 text-sm font-bold leading-5 text-[#15345b]" title={result.item.detailItem}>
                  {result.item.detailItem}
                </p>
                <p
                  className="mt-0.5 truncate text-[10px] text-[#64748b]"
                  title={`${result.item.majorCategory} · ${result.item.middleCategory}`}
                >
                  {result.item.majorCategory} · {result.item.middleCategory}
                </p>
              </td>
              <td className="px-3 py-2.5 align-top text-center font-semibold text-[#15345b]">{result.item.points}</td>
              <td className="px-3 py-2.5 align-top text-center font-bold text-[#2463b3]">
                {result.aiEvaluation.score}
              </td>
              <td className="px-3 py-2.5 align-top text-center font-bold text-[#15345b]">
                {result.humanEvaluation.score}
              </td>
              <td className="px-3 py-2.5 align-top text-center">
                <p className="text-base font-black text-[#15345b]">{result.finalScore}</p>
                <p className="text-[11px] text-[#64748b]">
                  {result.finalGrade} (
                  {Math.round(toAchievementPercent(result.finalScore, result.item.points) * 10) / 10}%)
                </p>
              </td>
              <td className="px-3 py-2.5 align-top">
                <div className="max-h-[4.5rem] space-y-1 overflow-y-auto pr-1 text-xs leading-5 text-[#64748b]">
                  <p title={result.aiEvaluation.rationale}>{result.aiEvaluation.rationale}</p>
                  {result.humanEvaluation.comment ? (
                    <p className="text-[#475569]" title={result.humanEvaluation.comment}>
                      <span className="font-semibold text-[#15345b]">전문가:</span> {result.humanEvaluation.comment}
                    </p>
                  ) : null}
                  <p className="font-semibold text-[#9a3412]" title={result.aiEvaluation.recommendation}>
                    {result.aiEvaluation.recommendation}
                  </p>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
