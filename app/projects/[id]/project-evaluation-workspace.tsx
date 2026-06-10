"use client";

import { useMemo, useState } from "react";
import { buildHybridViewFromRound } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult, Project } from "@/lib/types";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  rounds: EvaluationRound[];
  onRoundsChange?: (rounds: EvaluationRound[]) => void;
};

export default function ProjectEvaluationWorkspace({ project, rounds, onRoundsChange }: Props) {
  const sorted = useMemo(
    () =>
      [...rounds].sort(
        (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
      ),
    [rounds],
  );

  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const selectedRound = sorted.find((round) => round.id === selectedId) ?? sorted[0];
  const roundNumber = selectedRound
    ? sorted.length - sorted.findIndex((round) => round.id === selectedRound.id)
    : 0;

  const hybridView = selectedRound ? buildHybridViewFromRound(selectedRound, roundNumber) : null;

  async function deleteRound(roundId: string) {
    if (!window.confirm("이 평가 차수를 삭제할까요?")) return;

    let next = sorted.filter((round) => round.id !== roundId);

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
        AI·전문가 자료를 업로드하고 하이브리드 평가 분석을 실행하면 종합 점수가 이 영역에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section id="ai-document-analysis">
        <SectionTitle
          eyebrow="Hybrid Evaluation"
          title="통합 평가 결과"
          description={`${roundNumber}차 평가 · ${selectedRound.reviewerName} 전문가와 AI 병행 분석`}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {sorted.map((round, index) => (
            <button
              key={round.id}
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-bold ${
                round.id === selectedRound.id ? "bg-[#15345b] text-white" : "bg-[#eef4fb] text-[#15345b]"
              }`}
              onClick={() => setSelectedId(round.id)}
            >
              {sorted.length - index}차
            </button>
          ))}
        </div>
      </section>

      <section id="hybrid-score-engine">
        <div className="mt-5 space-y-5">
          <Panel
            title="현재 가중치"
            action={
              <button
                type="button"
                className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                onClick={() => deleteRound(selectedRound.id)}
              >
                이 차수 삭제
              </button>
            }
          >
            <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
            <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
          </Panel>

          <Panel title={`종합 점수 ${hybridView.projectScore}점`}>
            <EvaluationTable results={hybridView.results} reviewerName={selectedRound.reviewerName} />
          </Panel>
        </div>
      </section>

      <section id="explainable-ai">
        <SectionTitle
          eyebrow="Explainable AI"
          title="AI 평가 근거"
          description="선택 차수의 AI 분석 근거입니다."
        />
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

      <section>
        <SectionTitle
          eyebrow="Document Analysis"
          title="AI 문서 섹션 추출"
          description={`${roundNumber}차 AI 자료 분석 결과`}
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
    <div className="mb-4">
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
