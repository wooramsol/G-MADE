"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Badge,
  SectionDescription,
  SectionTitle,
  SubsectionTitle,
  TabTitle,
} from "@/components/typography";
import { formatProviderBadgeLabel, getProviderBadgeClass } from "@/lib/ai/provider-labels";
import { formatEvaluationRoundLabel } from "@/lib/format-datetime";
import { resolveDocumentSectionsForDisplay } from "@/lib/ai/document-section-summary";
import LegacyDemoAnalysisBanner from "@/components/legacy-demo-analysis-banner";
import { filterUserFacingAnalysisWarnings } from "@/lib/analysis-warnings";
import { dedupeReferenceLaws } from "@/lib/dedupe-reference-laws";
import { pickRelatedReferenceLaws } from "@/lib/related-reference-laws";
import { buildLawReferenceUrl } from "@/lib/reference-links";
import { collectUniqueRoundFiles } from "@/lib/evaluation-round-files";
import { buildHybridViewFromRound, buildPageCitationSummaries } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult, Project } from "@/lib/types";
import PreReviewResultsPanel from "./pre-review-results-panel";
import { showToast } from "../../toast";

type Props = {
  project: Project;
  rounds: EvaluationRound[];
  trashedRoundCount?: number;
  focusRoundId?: string | null;
  showHeader?: boolean;
  onFocusRoundHandled?: () => void;
  onRoundsChange?: (rounds: EvaluationRound[], trashedRounds?: EvaluationRound[]) => void;
};

export default function ProjectEvaluationWorkspace({
  project,
  rounds,
  trashedRoundCount = 0,
  focusRoundId,
  showHeader = true,
  onFocusRoundHandled,
  onRoundsChange,
}: Props) {
  const sorted = useMemo(() => {
    return [...rounds].sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
    );
  }, [rounds]);

  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingRoundId, setDeletingRoundId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [scoresExpanded, setScoresExpanded] = useState(false);

  const totalRoundCount = sorted.length + trashedRoundCount;

  // 새 평가가 추가되면 최신 평가를 선택한다 (렌더 중 상태 보정 패턴).
  const [prevRoundCount, setPrevRoundCount] = useState(rounds.length);
  if (rounds.length !== prevRoundCount) {
    setPrevRoundCount(rounds.length);
    if (rounds.length > prevRoundCount && sorted[0]) {
      setSelectedId(sorted[0].id);
    }
  }

  // 복원 등으로 특정 평가에 포커스 요청이 오면 해당 탭을 선택한다.
  const [handledFocusId, setHandledFocusId] = useState<string | null>(null);
  if (focusRoundId && focusRoundId !== handledFocusId && sorted.some((round) => round.id === focusRoundId)) {
    setHandledFocusId(focusRoundId);
    setSelectedId(focusRoundId);
  }

  // selectedId가 목록에 없으면 최신 평가로 대체 (별도 effect 불필요)
  const selectedRound = sorted.find((round) => round.id === selectedId) ?? sorted[0];
  const hybridView = selectedRound ? buildHybridViewFromRound(selectedRound) : null;

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
  const referenceLaws = dedupeReferenceLaws(
    pickRelatedReferenceLaws({
      pool: selectedRound?.aiAnalysis.referenceLaws ?? [],
      evaluationPreview: selectedRound?.aiAnalysis.evaluationPreview,
      evaluationItems: selectedRound?.evaluationItems,
    }),
  ).filter((law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null);
  const analysisWarnings = filterUserFacingAnalysisWarnings(selectedRound?.aiAnalysis.warnings ?? []);

  useEffect(() => {
    if (focusRoundId && handledFocusId === focusRoundId) {
      onFocusRoundHandled?.();
    }
  }, [focusRoundId, handledFocusId, onFocusRoundHandled]);

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
        project?: { evaluationRounds?: EvaluationRound[]; trashedEvaluationRounds?: EvaluationRound[] };
      };

      let nextTrashedRounds: EvaluationRound[] | undefined;

      if (response.ok && payload.project) {
        next = payload.project.evaluationRounds ?? next;
        nextTrashedRounds = payload.project.trashedEvaluationRounds;
      } else {
        throw new Error(payload.error ?? "삭제에 실패했습니다.");
      }

      onRoundsChange?.(next, nextTrashedRounds);
      setSelectedId((current) => {
        if (current === roundId) {
          return next[0]?.id ?? null;
        }
        return current && next.some((round) => round.id === current) ? current : (next[0]?.id ?? null);
      });
      setDeleteConfirmOpen(false);
      setDeletingRoundId(null);
      showToast({ message: "평가 기록이 휴지통으로 이동했습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "삭제에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function clearAllRounds() {
    setClearingAll(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/evaluation-rounds`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        deletedCount?: number;
        project?: { evaluationRounds?: EvaluationRound[]; trashedEvaluationRounds?: EvaluationRound[] };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "평가 기록을 삭제하지 못했습니다.");
      }

      onRoundsChange?.([], []);
      setSelectedId(null);
      setClearAllConfirmOpen(false);
      showToast({
        message: `통합 평가 ${payload.deletedCount ?? totalRoundCount}건을 삭제했습니다.`,
        tone: "success",
      });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "평가 기록을 삭제하지 못했습니다.",
        tone: "error",
      });
    } finally {
      setClearingAll(false);
    }
  }

  const clearAllButton = totalRoundCount > 0 ? (
    <button
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={clearingAll || deleting}
      onClick={() => setClearAllConfirmOpen(true)}
      type="button"
    >
      통합 평가 전체 삭제
    </button>
  ) : null;

  const clearAllConfirmDialog = (
    <ConfirmDialog
      cancelLabel="취소"
      confirmLabel="전체 삭제"
      confirmTone="danger"
      description={
        trashedRoundCount > 0
          ? `활성 평가 ${sorted.length}건과 휴지통 ${trashedRoundCount}건을 영구 삭제합니다. 되돌릴 수 없습니다.`
          : `활성 평가 ${sorted.length}건을 영구 삭제합니다. 되돌릴 수 없습니다.`
      }
      loading={clearingAll}
      loadingLabel="삭제 중..."
      onCancel={() => {
        if (!clearingAll) setClearAllConfirmOpen(false);
      }}
      onConfirm={clearAllRounds}
      open={clearAllConfirmOpen}
      title="통합 평가를 모두 삭제하시겠습니까?"
    />
  );

  if (!selectedRound || !hybridView) {
    if (totalRoundCount > 0) {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[#64748b]">
              활성 평가가 없습니다. 휴지통에 {trashedRoundCount}건이 있습니다.
            </p>
            {clearAllButton}
          </div>
          {clearAllConfirmDialog}
        </div>
      );
    }

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
          <WorkspaceSectionHeading
            title="통합 평가 결과"
            description="AI·전문가 자료를 함께 분석한 평가별 통합 결과와 종합 점수입니다."
          />
        ) : null}

        <div className={`flex flex-wrap items-center gap-3 ${showHeader ? "mt-5" : ""}`}>
          <Badge className="bg-[#e8f1ff] text-[#2463b3]">평가 {sorted.length}건</Badge>
          {clearAllButton}
        </div>

        <ConfirmDialog
          description={
            deletingRound
              ? `${formatEvaluationRoundLabel(deletingRound.evaluatedAt)} 평가 결과를 휴지통으로 이동합니다. 프로젝트 상세 화면 하단에서 복원할 수 있습니다.`
              : "선택한 평가 기록을 휴지통으로 이동합니다. 프로젝트 상세 화면 하단에서 복원할 수 있습니다."
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

        {clearAllConfirmDialog}

        <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7dee8] bg-white p-1">
          <div className="flex min-w-max gap-1">
            {sorted.map((round) => {
              const active = round.id === selectedRound.id;
              return (
                <div
                  key={round.id}
                  className={`relative rounded-lg sm:min-w-[210px] ${
                    active
                      ? "bg-[#eef4fb] shadow-sm ring-1 ring-[#2463b3]/25"
                      : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`${formatEvaluationRoundLabel(round.evaluatedAt)} 평가 삭제`}
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
                    <TabTitle className="block">{formatEvaluationRoundLabel(round.evaluatedAt)}</TabTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-[#64748b]">
                        자료 {collectUniqueRoundFiles(round).length}개
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${getProviderBadgeClass(round.aiAnalysis.provider)}`}
                      >
                        {formatProviderBadgeLabel(round.aiAnalysis.provider)}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 space-y-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
          {selectedRound.aiWeight > 0 && selectedRound.aiAnalysis.mode === "demo" ? (
            <LegacyDemoAnalysisBanner warnings={analysisWarnings} />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[#15345b] text-white">
              {formatEvaluationRoundLabel(selectedRound.evaluatedAt)}
            </Badge>
            <Badge className="bg-[#e8f1ff] text-[#2463b3]">
              AI {selectedRound.aiWeight}% · 전문가 {selectedRound.expertWeight}%
            </Badge>
            <Badge className={getProviderBadgeClass(selectedRound.aiAnalysis.provider)}>
              {formatProviderBadgeLabel(selectedRound.aiAnalysis.provider)}
            </Badge>
            <Badge className="bg-slate-100 text-slate-700">{selectedRound.reviewerName}</Badge>
            <Badge className="bg-slate-100 text-slate-700">총 배점 {selectedRound.totalPoints}점</Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FileList
              title="평가 자료"
              files={collectUniqueRoundFiles(selectedRound)}
              projectId={project.id}
            />

            <div className="rounded-xl border border-[#d7dee8] bg-white p-3">
              <p className="text-sm font-bold text-[#15345b]">분석 요약</p>
              {selectedRound.expertSummary ? (
                <p className="mt-2 text-sm leading-6 text-[#475569]">{selectedRound.expertSummary}</p>
              ) : null}
              <p className={`text-sm leading-6 text-[#475569] ${selectedRound.expertSummary ? "mt-2" : "mt-2"}`}>
                {selectedRound.aiAnalysis.summary}
              </p>
            </div>
          </div>

          <PreReviewResultsPanel
            checklistProps={{
              documentSections: resolveDocumentSectionsForDisplay(selectedRound),
              evaluationPreview: selectedRound.aiAnalysis.evaluationPreview,
              expertWeight: selectedRound.expertWeight,
              fileSummaries: buildPageCitationSummaries(selectedRound),
              results: hybridView.results,
            }}
            projectLocation={project.location}
            projectName={project.name}
            projectReviewType={project.reviewType}
            referenceLaws={referenceLaws}
            round={selectedRound}
          />

          <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
            <button
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setScoresExpanded((value) => !value)}
              type="button"
            >
              <div>
                <SubsectionTitle>종합 평가·점수</SubsectionTitle>
                <p className="mt-1 text-sm font-semibold text-[#2463b3]">
                  종합 {hybridView.projectScore} / {selectedRound.totalPoints}점
                  {aiAvg !== null ? ` · AI 평균 ${aiAvg}` : ""}
                  {expertAvg !== null && selectedRound.expertWeight > 0 ? ` · 전문가 평균 ${expertAvg}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold text-[#64748b]">
                {scoresExpanded ? "접기" : "펼치기"}
              </span>
            </button>

            {scoresExpanded ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
                  <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
                </div>
                <CompactScoreTable expertWeight={selectedRound.expertWeight} results={hybridView.results} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#64748b]">
                점수·항목별 배점은 펼친 뒤 확인하세요. 검토 의견은 「사전검토 AI 보조 결과」에서 확인합니다.
              </p>
            )}
          </div>

          {analysisWarnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-bold">분석 참고 사항</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">
                {analysisWarnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>
                    <AnalysisWarningText warning={warning} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-xs text-[#64748b]">
            AI 엔진:{" "}
            {selectedRound.ensembleProvidersUsed?.length
              ? selectedRound.ensembleProvidersUsed.map((provider) => formatProviderBadgeLabel(provider)).join(" · ")
              : formatProviderBadgeLabel(selectedRound.aiAnalysis.provider)}{" "}
            ·{" "}
            {selectedRound.aiAnalysis.mode === "live"
              ? "실제 API 분석"
              : selectedRound.aiAnalysis.mode === "skipped"
                ? "가중치 0% 생략"
                : "구버전 데모 결과"}
          </p>
        </div>
      </section>
    </div>
  );
}

function AnalysisWarningText({ warning }: { warning: string }) {
  const match = warning.match(/^「(.+?)」 법령 조회 실패 — (.+)$/);
  if (!match) return <span>{warning}</span>;

  return (
    <span>
      <span className="font-semibold text-amber-950">「{match[1]}」</span>
      <span className="text-amber-900"> 법령 조회 실패 — </span>
      <span className="text-amber-800">{match[2]}</span>
    </span>
  );
}

function WorkspaceSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <SectionDescription>{description}</SectionDescription>
    </div>
  );
}

function CompactScoreTable({
  results,
  expertWeight,
}: {
  results: HybridResult[];
  expertWeight: number;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#d7dee8]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[#f8fafc] text-xs font-bold text-[#64748b]">
          <tr>
            <th className="px-4 py-3">체크리스트 항목</th>
            <th className="px-4 py-3">AI</th>
            <th className="px-4 py-3">전문가</th>
            <th className="px-4 py-3">종합</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr className="border-t border-[#e8eef5]" key={result.item.id}>
              <td className="px-4 py-3 font-semibold text-[#15345b]">{result.item.detailItem}</td>
              <td className="px-4 py-3 text-[#2463b3]">{result.aiEvaluation.score}</td>
              <td className="px-4 py-3 text-[#15345b]">
                {expertWeight > 0 ? result.humanEvaluation.score : "-"}
              </td>
              <td className="px-4 py-3 font-bold text-[#172033]">{result.finalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  projectId,
}: {
  title: string;
  files: EvaluationRound["aiFiles"];
  projectId: string;
}) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-white p-3">
      <p className="text-sm font-bold text-[#15345b]">
        {title} ({files.length})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-[#64748b]">
        {files.map((file) => (
          <li key={file.id}>
            {file.blobUrl ? (
              <a
                className="font-semibold text-[#2463b3] underline-offset-2 hover:underline"
                href={file.blobUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {file.originalName}
              </a>
            ) : file.storageKey ? (
              <a
                className="font-semibold text-[#2463b3] underline-offset-2 hover:underline"
                href={`/api/projects/${projectId}/files/${file.id}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                {file.originalName}
              </a>
            ) : (
              file.originalName
            )}{" "}
            · {file.fileType}
          </li>
        ))}
      </ul>
    </div>
  );
}
