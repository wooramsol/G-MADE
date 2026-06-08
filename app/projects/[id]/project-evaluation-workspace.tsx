"use client";

import { useMemo, useState } from "react";
import { caseStudies, guidelines } from "@/lib/demo-data";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { buildGuidelineReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { buildHybridViewFromSession } from "@/lib/upload-to-hybrid";
import type { HybridResult, Project, UploadAnalysisSession } from "@/lib/types";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  analyses: UploadAnalysisSession[];
  onAnalysesChange?: (analyses: UploadAnalysisSession[]) => void;
};

export default function ProjectEvaluationWorkspace({ project, analyses, onAnalysesChange }: Props) {
  const sorted = useMemo(
    () =>
      [...analyses].sort(
        (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
      ),
    [analyses],
  );

  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [humanScores, setHumanScores] = useState<Record<string, number>>({});
  const [lawQuery, setLawQuery] = useState("");
  const [lawResults, setLawResults] = useState<
    Array<{ title: string; article: string; summary: string; sourceUrl: string }>
  >([]);

  const selectedSession = sorted.find((s) => s.id === selectedId) ?? sorted[0];
  const round = selectedSession
    ? sorted.length - sorted.findIndex((s) => s.id === selectedSession.id)
    : 0;

  const hybridView = selectedSession
    ? buildHybridViewFromSession(selectedSession, round, humanScores)
    : null;

  async function deleteSession(sessionId: string) {
    if (!window.confirm("이 분석 결과를 삭제할까요?")) return;

    let next = sorted.filter((session) => session.id !== sessionId);

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
      if (selectedId === sessionId) {
        setSelectedId(next[0]?.id ?? null);
      }
      showToast({ message: "분석 결과가 삭제되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    }
  }

  async function searchLaws() {
    if (lawQuery.trim().length < 2) return;
    try {
      const res = await fetch(
        `/api/law/search?q=${encodeURIComponent(lawQuery)}&articles=true`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "검색 실패");
      setLawResults(data.references ?? []);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "법령 검색 실패",
        tone: "error",
      });
    }
  }

  function exportReport(format: "pdf" | "docx") {
    if (!selectedSession) {
      showToast({ message: "보낼 분석 결과가 없습니다.", tone: "error" });
      return;
    }
    const url = `/api/projects/${project.id}/report?format=${format}&sessionId=${selectedSession.id}`;
    window.open(url, "_blank");
  }

  if (!selectedSession || !hybridView) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b]">
        업로드 분석을 실행하면 AI 평가·하이브리드 점수·법령 근거가 이 영역에 표시됩니다.
      </div>
    );
  }

  const referenceLaws =
    selectedSession.analysis.referenceLaws?.length
      ? selectedSession.analysis.referenceLaws
      : lawResults;

  return (
    <div className="space-y-8">
      <section id="ai-document-analysis">
        <SectionTitle
          eyebrow="AI Document Analysis"
          title="업로드 자료 자동 추출"
          description={`${round}차 분석 기준 문서 섹션 추출 결과입니다.`}
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
          title="AI 평가와 인간 평가의 종합 산출"
          description="선택한 분석 차수의 AI 점수와 심사위원 점수를 가중 합산합니다."
        />
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            {sorted.map((session, index) => (
              <button
                key={session.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  session.id === selectedSession.id
                    ? "bg-[#15345b] text-white"
                    : "bg-[#eef4fb] text-[#15345b]"
                }`}
                onClick={() => setSelectedId(session.id)}
              >
                {sorted.length - index}차
              </button>
            ))}
          </div>

          <Panel title="현재 가중치 설정" action={`${round}차 분석`}>
            <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
            <WeightBar label="인간 심사위원 평가" value={hybridView.settings.humanWeight} color="#15345b" />
          </Panel>

          <Panel
            title={`종합 점수 ${hybridView.projectScore}점`}
            action={
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3] hover:bg-[#d6e8ff]"
                  onClick={() => exportReport("pdf")}
                >
                  PDF(인쇄)
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3] hover:bg-[#d6e8ff]"
                  onClick={() => exportReport("docx")}
                >
                  한글(DOCX)
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
                  onClick={() => deleteSession(selectedSession.id)}
                >
                  이 차수 삭제
                </button>
              </div>
            }
          >
            <EvaluationTable
              results={hybridView.results}
              humanScores={humanScores}
              onHumanScoreChange={(itemId, score) =>
                setHumanScores((current) => ({ ...current, [itemId]: score }))
              }
            />
          </Panel>
        </div>
      </section>

      <section id="explainable-ai">
        <SectionTitle eyebrow="Explainable AI" title="점수 산정 근거 추적" description="선택 차수의 AI 평가 근거입니다." />
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

      <section id="laws-and-case-search" className="grid gap-5 xl:grid-cols-3">
        <Panel title="관련 법령 (실시간)" action={selectedSession.analysis.lawSource ?? "law.go.kr"}>
          <div className="mb-3 flex gap-2">
            <input
              className="w-full rounded-lg border border-[#d7dee8] px-3 py-2 text-sm"
              placeholder="법령 검색"
              value={lawQuery}
              onChange={(e) => setLawQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchLaws()}
            />
            <button
              type="button"
              className="shrink-0 rounded-lg bg-[#eef4fb] px-3 py-2 text-xs font-bold text-[#15345b]"
              onClick={searchLaws}
            >
              검색
            </button>
          </div>
          <div className="space-y-3">
            {referenceLaws
              .filter((law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null)
              .slice(0, 6)
              .map((law) => (
                <ReferenceCard
                  title={`${law.title} ${law.article}`}
                  href={buildLawReferenceUrl(law.title, law.sourceUrl)}
                  body={law.summary}
                  key={`${law.title}-${law.article}`}
                />
              ))}
          </div>
        </Panel>
        <Panel title="관련 지침" action="지침 관리">
          <div className="space-y-3">
            {guidelines
              .filter((guide) => buildGuidelineReferenceUrl(guide) !== null)
              .slice(0, 5)
              .map((guide) => (
                <ReferenceCard
                  title={guide.title}
                  href={buildGuidelineReferenceUrl(guide)}
                  body={guide.summary}
                  key={guide.id}
                />
              ))}
          </div>
        </Panel>
        <Panel title="유사사례 검색" action="사례 추천">
          <div className="space-y-3">
            {caseStudies.map((item) => (
              <ReferenceCard
                title={item.title}
                meta={`${item.location} · 유사도 ${item.similarityScore}%`}
                body={item.keyLearning}
                key={item.id}
              />
            ))}
          </div>
        </Panel>
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
  humanScores,
  onHumanScoreChange,
}: {
  results: HybridResult[];
  humanScores: Record<string, number>;
  onHumanScoreChange: (itemId: string, score: number) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-[#d7dee8]">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-4 py-3">평가항목</th>
            <th className="px-4 py-3">AI 점수</th>
            <th className="px-4 py-3">인간 점수</th>
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
                <input
                  className="w-16 rounded border border-[#d7dee8] px-2 py-1 text-sm font-bold text-[#15345b]"
                  type="number"
                  min={0}
                  max={100}
                  value={humanScores[result.item.id] ?? result.humanEvaluation.score}
                  onChange={(e) => onHumanScoreChange(result.item.id, Number(e.target.value))}
                />
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

function ReferenceCard({
  title,
  href,
  meta,
  body,
}: {
  title: string;
  href?: string | null;
  meta?: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <ReferenceLinkTitle title={title} href={href} />
      {meta ? <p className="mt-1 text-xs font-semibold text-[#64748b]">{meta}</p> : null}
      <p className="mt-2 text-sm leading-6 text-[#64748b]">{body}</p>
    </div>
  );
}
