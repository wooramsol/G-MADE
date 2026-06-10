"use client";

import { useMemo, useState } from "react";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { buildLawReferenceUrl, dedupeReferenceLaws } from "@/lib/reference-links";
import { buildHybridViewFromRound } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult, Project } from "@/lib/types";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  rounds: EvaluationRound[];
  onRoundsChange?: (rounds: EvaluationRound[]) => void;
};

type RoundWithNumber = EvaluationRound & { roundNumber: number };

export default function ProjectEvaluationWorkspace({ project, rounds, onRoundsChange }: Props) {
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
  const selectedRound = sorted.find((round) => round.id === selectedId) ?? sorted[0];
  const hybridView = selectedRound ? buildHybridViewFromRound(selectedRound, selectedRound.roundNumber) : null;
  const referenceLaws = useMemo(
    () =>
      dedupeReferenceLaws(selectedRound?.aiAnalysis.referenceLaws ?? []).filter(
        (law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null,
      ),
    [selectedRound],
  );

  const aiAvg =
    selectedRound && selectedRound.aiAnalysis.evaluationPreview.length > 0
      ? Math.round(
          selectedRound.aiAnalysis.evaluationPreview.reduce((sum, row) => sum + row.score, 0) /
            selectedRound.aiAnalysis.evaluationPreview.length,
        )
      : null;
  const expertAvg =
    selectedRound && selectedRound.expertItemScores.length > 0
      ? Math.round(
          selectedRound.expertItemScores.reduce((sum, row) => sum + row.score, 0) /
            selectedRound.expertItemScores.length,
        )
      : null;

  async function deleteRound(roundId: string) {
    if (!window.confirm("이 평가 차수를 삭제할까요?")) return;

    let next: EvaluationRound[] = sorted.filter((round) => round.id !== roundId);

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
      } else if (response.status !== 404) {
        throw new Error(payload.error ?? "삭제에 실패했습니다.");
      }

      onRoundsChange?.(next);
      if (selectedId === roundId) {
        setSelectedId(next[0]?.id ?? null);
      }
      showToast({ message: "평가 차수가 삭제되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    }
  }

  if (!selectedRound || !hybridView) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b]">
        AI·전문가 자료를 업로드하고 하이브리드 평가 분석을 실행하면 통합 평가 결과가 이 영역에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section id="hybrid-evaluation-results">
        <SectionTitle
          eyebrow="Hybrid Evaluation"
          title="통합 평가 결과"
          description="AI·전문가 자료를 함께 분석한 차수별 통합 결과와 종합 점수입니다."
        />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
            총 {sorted.length}차
          </span>
          <button
            type="button"
            className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
            onClick={() => deleteRound(selectedRound.id)}
          >
            이 차수 삭제
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7dee8] bg-white p-1">
          <div className="flex min-w-max gap-1">
            {sorted.map((round) => {
              const active = round.id === selectedRound.id;
              return (
                <button
                  key={round.id}
                  type="button"
                  className={`rounded-lg px-3 py-2 text-left transition sm:min-w-[160px] ${
                    active
                      ? "bg-[#eef4fb] text-[#15345b] shadow-sm ring-1 ring-[#2463b3]/25"
                      : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#15345b]"
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

          <Panel title={`종합 점수 ${hybridView.projectScore}점`}>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
              <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
            </div>
            <EvaluationTable results={hybridView.results} reviewerName={selectedRound.reviewerName} />
          </Panel>

          {referenceLaws.length > 0 ? (
            <div className="rounded-xl border border-[#d7dee8] bg-white p-3 text-sm">
              <p className="font-bold text-[#15345b]">
                법령 근거 ({selectedRound.aiAnalysis.lawSource === "law.go.kr" ? "국가법령정보" : "내장 요약"})
              </p>
              <p className="mt-1 text-xs leading-5 text-[#64748b]">
                이번 분석에 참고한 법령 목록입니다. 항목별 평가 근거는 위 표에서 확인할 수 있습니다.
              </p>
              {referenceLaws.map((law) => (
                <div className="mt-2 text-[#64748b]" key={`${selectedRound.id}-${law.title}-${law.article}`}>
                  <ReferenceLinkTitle
                    title={`${law.title} ${law.article}`}
                    href={buildLawReferenceUrl(law.title, law.sourceUrl)}
                  />
                  {law.summary ? <p className="mt-0.5 text-xs leading-5">{law.summary}</p> : null}
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

      {selectedRound.aiAnalysis.documentSections.length > 0 ? (
        <section id="ai-document-analysis">
          <details className="rounded-2xl border border-[#d7dee8] bg-white panel-shadow">
            <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
              <SectionTitle
                eyebrow="Document Analysis"
                title="업로드 자료 구성 점검"
                description="AI가 업로드 문서에서 식별한 주요 구성 항목(건축개요, 배치도, 입면도 등)과 각 항목의 확인 신뢰도입니다."
              />
            </summary>
            <div className="border-t border-[#d7dee8] px-5 pb-5">
              {selectedRound.aiAnalysis.mode === "demo" ? (
                <p className="mt-4 rounded-xl border border-[#fdba74] bg-[#fff7ed] px-3 py-2 text-xs leading-5 text-[#9a3412]">
                  데모 분석 모드에서는 예시 항목이 표시됩니다. AI API 연동 후 실제 업로드 자료에서 추출한 결과가
                  표시됩니다.
                </p>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {selectedRound.aiAnalysis.documentSections.map((section) => (
                  <div className="rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={section.label}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-[#15345b]">{section.label}</p>
                      <span className="text-sm font-bold text-[#2463b3]">{section.confidence}%</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#64748b]">{section.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{title}</h2>
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
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-4 py-3">평가항목</th>
            <th className="px-4 py-3">배점</th>
            <th className="px-4 py-3">AI 점수</th>
            <th className="px-4 py-3">전문가 점수 ({reviewerName})</th>
            <th className="px-4 py-3">최종 점수</th>
            <th className="px-4 py-3">평가 근거 / 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result) => (
            <tr key={result.item.id}>
              <td className="px-4 py-4">
                <p className="font-bold text-[#15345b]">{result.item.detailItem}</p>
                <p className="mt-1 text-xs text-[#64748b]">
                  {result.item.majorCategory} · {result.item.middleCategory}
                </p>
              </td>
              <td className="px-4 py-4 font-semibold text-[#15345b]">{result.item.points}</td>
              <td className="px-4 py-4 font-bold text-[#2463b3]">{result.aiEvaluation.score}</td>
              <td className="px-4 py-4">
                <p className="font-bold text-[#15345b]">{result.humanEvaluation.score}</p>
                {result.humanEvaluation.comment ? (
                  <p className="mt-1 text-xs leading-5 text-[#64748b]">{result.humanEvaluation.comment}</p>
                ) : null}
              </td>
              <td className="px-4 py-4">
                <p className="text-lg font-black text-[#15345b]">{result.finalScore}</p>
                <p className="text-xs text-[#64748b]">{result.finalGrade}</p>
              </td>
              <td className="px-4 py-4 leading-6 text-[#64748b]">
                <p>{result.aiEvaluation.rationale}</p>
                <p className="mt-2 font-semibold text-[#9a3412]">{result.aiEvaluation.recommendation}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
