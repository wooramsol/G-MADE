"use client";

import { useMemo, useState } from "react";
import { buildHybridViewFromSession } from "@/lib/upload-to-hybrid";
import type { HumanEvaluationSession, HybridResult, Project, UploadAnalysisSession } from "@/lib/types";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  analyses: UploadAnalysisSession[];
  humanEvaluations: HumanEvaluationSession[];
  onAnalysesChange?: (analyses: UploadAnalysisSession[]) => void;
  onHumanEvaluationsChange?: (sessions: HumanEvaluationSession[]) => void;
};

export default function ProjectEvaluationWorkspace({
  project,
  analyses,
  humanEvaluations,
  onAnalysesChange,
  onHumanEvaluationsChange,
}: Props) {
  const sortedAnalyses = useMemo(
    () =>
      [...analyses].sort(
        (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
      ),
    [analyses],
  );

  const sortedHumanEvaluations = useMemo(
    () =>
      [...humanEvaluations].sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      ),
    [humanEvaluations],
  );

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(sortedAnalyses[0]?.id ?? null);
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(
    sortedHumanEvaluations[0]?.id ?? null,
  );

  const selectedSession = sortedAnalyses.find((session) => session.id === selectedAnalysisId) ?? sortedAnalyses[0];
  const selectedHumanSession =
    sortedHumanEvaluations.find((session) => session.id === selectedHumanId) ?? sortedHumanEvaluations[0];

  const aiRound = selectedSession
    ? sortedAnalyses.length - sortedAnalyses.findIndex((session) => session.id === selectedSession.id)
    : 0;
  const humanRound = selectedHumanSession
    ? sortedHumanEvaluations.length -
      sortedHumanEvaluations.findIndex((session) => session.id === selectedHumanSession.id)
    : 0;

  const hybridView = selectedSession
    ? buildHybridViewFromSession(selectedSession, aiRound, selectedHumanSession)
    : null;

  async function deleteAnalysisSession(sessionId: string) {
    if (!window.confirm("이 AI 분석 결과를 삭제할까요?")) return;

    let next = sortedAnalyses.filter((session) => session.id !== sessionId);

    try {
      const response = await fetch(`/api/projects/${project.id}/analyses/${sessionId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: { uploadAnalyses?: UploadAnalysisSession[] };
      };

      if (response.ok) {
        next = payload.project?.uploadAnalyses ?? next;
      } else if (response.status !== 404) {
        throw new Error(payload.error ?? "삭제에 실패했습니다.");
      }

      onAnalysesChange?.(next);
      if (selectedAnalysisId === sessionId) {
        setSelectedAnalysisId(next[0]?.id ?? null);
      }
      showToast({ message: "AI 분석 결과가 삭제되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    }
  }

  async function deleteHumanSession(sessionId: string) {
    if (!window.confirm("이 전문가 평가 결과를 삭제할까요?")) return;

    let next = sortedHumanEvaluations.filter((session) => session.id !== sessionId);

    try {
      const response = await fetch(`/api/projects/${project.id}/expert-evaluations/${sessionId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: { humanEvaluationSessions?: HumanEvaluationSession[] };
      };

      if (response.ok) {
        next = payload.project?.humanEvaluationSessions ?? next;
      } else if (response.status !== 404) {
        throw new Error(payload.error ?? "삭제에 실패했습니다.");
      }

      onHumanEvaluationsChange?.(next);
      if (selectedHumanId === sessionId) {
        setSelectedHumanId(next[0]?.id ?? null);
      }
      showToast({ message: "전문가 평가 결과가 삭제되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    }
  }

  if (!selectedSession || !hybridView) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b]">
        AI 분석과 전문가 평가 자료를 각각 업로드하면 종합 점수가 이 영역에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section id="ai-document-analysis">
        <SectionTitle
          eyebrow="AI Document Analysis"
          title="업로드 자료 자동 추출"
          description={`${aiRound}차 AI 분석 기준 문서 섹션 추출 결과입니다.`}
        />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {selectedSession.analysis.documentSections.map((section) => (
            <div className="rounded-2xl border border-[#d7dee8] bg-white p-4 panel-shadow" key={section.label}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-[#15345b]">{section.label}</p>
                <span className="text-sm font-bold text-[#2463b3]">{section.confidence}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${section.confidence}%` }} />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#64748b]">{section.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="hybrid-score-engine">
        <SectionTitle
          eyebrow="Hybrid Score Engine"
          title="AI 평가와 전문가 평가의 종합 산출"
          description="선택한 AI 분석 차수와 전문가 평가 차수를 가중 합산합니다."
        />
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#d7dee8] bg-white p-4">
              <p className="text-sm font-bold text-[#2463b3]">AI 분석 차수</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sortedAnalyses.map((session, index) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`rounded-lg px-3 py-2 text-sm font-bold ${
                      session.id === selectedSession.id
                        ? "bg-[#2463b3] text-white"
                        : "bg-[#eef4fb] text-[#15345b]"
                    }`}
                    onClick={() => setSelectedAnalysisId(session.id)}
                  >
                    {sortedAnalyses.length - index}차
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#d7dee8] bg-white p-4">
              <p className="text-sm font-bold text-[#15345b]">전문가 평가 차수</p>
              {sortedHumanEvaluations.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sortedHumanEvaluations.map((session, index) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`rounded-lg px-3 py-2 text-sm font-bold ${
                        session.id === selectedHumanSession?.id
                          ? "bg-[#15345b] text-white"
                          : "bg-slate-100 text-[#15345b]"
                      }`}
                      onClick={() => setSelectedHumanId(session.id)}
                    >
                      {sortedHumanEvaluations.length - index}차 · {session.reviewerName}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#64748b]">
                  전문가 평가 자료를 업로드하면 차수별 점수가 반영됩니다.
                </p>
              )}
            </div>
          </div>

          <Panel title="현재 가중치 설정" action={`AI ${aiRound}차 · 전문가 ${humanRound || "-"}차`}>
            <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
            <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
          </Panel>

          {!selectedHumanSession ? (
            <div className="rounded-xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm leading-6 text-[#9a3412]">
              전문가 평가 자료가 아직 없습니다. 상단의 인간 전문가 평가 영역에서 자료를 업로드하고 항목별 점수를
              등록해 주세요.
            </div>
          ) : null}

          <Panel
            title={`종합 점수 ${hybridView.projectScore}점`}
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                  onClick={() => deleteAnalysisSession(selectedSession.id)}
                >
                  AI 차수 삭제
                </button>
                {selectedHumanSession ? (
                  <button
                    type="button"
                    className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                    onClick={() => deleteHumanSession(selectedHumanSession.id)}
                  >
                    전문가 차수 삭제
                  </button>
                ) : null}
              </div>
            }
          >
            <EvaluationTable results={hybridView.results} humanReviewer={selectedHumanSession?.reviewerName} />
          </Panel>
        </div>
      </section>

      <section id="explainable-ai">
        <SectionTitle eyebrow="Explainable AI" title="점수 산정 근거 추적" description="선택한 AI 분석 차수의 평가 근거입니다." />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {hybridView.results.slice(0, 4).map((result) => (
            <Panel
              title={result.item.detailItem}
              action={`${result.aiEvaluation.score}점 · ${result.aiEvaluation.grade}`}
              key={result.item.id}
            >
              <p className="text-sm leading-6 text-[#475569]">{result.aiEvaluation.rationale}</p>
              <div className="mt-4 space-y-3">
                {result.aiEvaluation.scoreTrace.map((trace) => (
                  <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={trace.label}>
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{trace.label}</span>
                      <span>
                        {trace.weight}% · {trace.score}점
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#64748b]">{trace.evidence}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-xl bg-[#fff7ed] p-3 text-sm leading-6 text-[#9a3412]">
                개선권고사항: {result.aiEvaluation.recommendation}
              </p>
            </Panel>
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
        {action ? (
          typeof action === "string" ? (
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{action}</span>
          ) : (
            action
          )
        ) : null}
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
  humanReviewer,
}: {
  results: HybridResult[];
  humanReviewer?: string;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#d7dee8]">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-4 py-3">평가항목</th>
            <th className="px-4 py-3">AI 점수</th>
            <th className="px-4 py-3">전문가 점수{humanReviewer ? ` (${humanReviewer})` : ""}</th>
            <th className="px-4 py-3">최종 점수</th>
            <th className="px-4 py-3">평가 근거 / 개선 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result) => (
            <tr key={result.item.id}>
              <td className="px-4 py-4">
                <p className="font-bold text-[#15345b]">{result.item.detailItem}</p>
                <p className="mt-1 text-xs text-[#64748b]">
                  {result.item.majorCategory} · {result.item.middleCategory} · {result.item.points}점
                </p>
              </td>
              <td className="px-4 py-4 font-bold text-[#2463b3]">{result.aiEvaluation.score}</td>
              <td className="px-4 py-4">
                <p className="font-bold text-[#15345b]">
                  {humanReviewer ? result.humanEvaluation.score : "-"}
                </p>
                {humanReviewer && result.humanEvaluation.comment ? (
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
