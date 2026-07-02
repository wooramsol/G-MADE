"use client";

import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Badge,
  FieldLabel,
  MutedText,
  SectionDescription,
  SectionTitle,
  SubsectionTitle,
} from "@/components/typography";
import EvaluationGradeLegend from "@/components/evaluation-grade-legend";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatEvaluationRoundLabel } from "@/lib/format-datetime";
import LegacyDemoAnalysisBanner from "@/components/legacy-demo-analysis-banner";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import { dedupeWarnings } from "@/lib/analysis-warnings";
import { dedupeReferenceLaws } from "@/lib/dedupe-reference-laws";
import { pickRelatedReferenceLaws } from "@/lib/related-reference-laws";
import { pickRelatedReferenceGuidelines } from "@/lib/related-reference-guidelines";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { collectUniqueRoundFiles } from "@/lib/evaluation-round-files";
import { buildHybridViewFromRound } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, Project } from "@/lib/types";
import { trashLocalProjectRound } from "../local-project-storage";
import { showToast } from "../../toast";
import EvaluationResultsTable from "./evaluation-results-table";
import EvaluationRoundTabs from "./evaluation-round-tabs";

type Props = {
  project: Project;
  rounds: EvaluationRound[];
  focusRoundId?: string | null;
  showHeader?: boolean;
  onFocusRoundHandled?: () => void;
  onRoundsChange?: (rounds: EvaluationRound[], trashedRounds?: EvaluationRound[]) => void;
};

export default function ProjectEvaluationWorkspace({
  project,
  rounds,
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

  useEffect(() => {
    if (focusRoundId && handledFocusId === focusRoundId) {
      onFocusRoundHandled?.();
    }
  }, [focusRoundId, handledFocusId, onFocusRoundHandled]);

  // selectedId가 목록에 없으면 최신 평가로 대체 (별도 effect 없이 렌더에서 처리)
  const selectedRound = sorted.find((round) => round.id === selectedId) ?? sorted[0];
  const hybridView = useMemo(
    () => (selectedRound ? buildHybridViewFromRound(selectedRound) : null),
    [selectedRound],
  );

  const { aiAvg, expertAvg } = useMemo(() => {
    if (!hybridView || hybridView.results.length === 0) {
      return { aiAvg: null as number | null, expertAvg: null as number | null };
    }
    const count = hybridView.results.length;
    return {
      aiAvg: Math.round((hybridView.results.reduce((sum, row) => sum + row.aiEvaluation.score, 0) / count) * 10) / 10,
      expertAvg:
        Math.round((hybridView.results.reduce((sum, row) => sum + row.humanEvaluation.score, 0) / count) * 10) / 10,
    };
  }, [hybridView]);

  const deletingRound = sorted.find((round) => round.id === deletingRoundId);

  const referenceLaws = useMemo(
    () =>
      dedupeReferenceLaws(
        pickRelatedReferenceLaws({
          pool: selectedRound?.aiAnalysis.referenceLaws ?? [],
          evaluationPreview: selectedRound?.aiAnalysis.evaluationPreview,
          evaluationItems: selectedRound?.evaluationItems,
        }),
      ).filter((law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null),
    [selectedRound],
  );
  const referenceGuidelines = useMemo(
    () =>
      pickRelatedReferenceGuidelines({
        pool: selectedRound?.aiAnalysis.referenceGuidelines ?? [],
        evaluationPreview: selectedRound?.aiAnalysis.evaluationPreview,
        evaluationItems: selectedRound?.evaluationItems,
      }).filter((guide) => buildAdmrulReferenceUrl(guide.title, guide.sourceUrl) !== null),
    [selectedRound],
  );
  const analysisWarnings = useMemo(
    () => dedupeWarnings(selectedRound?.aiAnalysis.warnings ?? []),
    [selectedRound],
  );

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
      const response = await clientFetchWithTimeout(
        `/api/projects/${project.id}/evaluation-rounds/${roundId}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: { evaluationRounds?: EvaluationRound[]; trashedEvaluationRounds?: EvaluationRound[] };
      };

      let nextTrashedRounds: EvaluationRound[] | undefined;

      if (response.ok && payload.project) {
        next = payload.project.evaluationRounds ?? next;
        nextTrashedRounds = payload.project.trashedEvaluationRounds;
      } else if (response.status === 404) {
        const trashedProject = trashLocalProjectRound(project.id, roundId);
        if (trashedProject) {
          next = trashedProject.evaluationRounds ?? next;
          nextTrashedRounds = trashedProject.trashedEvaluationRounds;
        }
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
          <div>
            <SectionTitle>통합 평가 결과</SectionTitle>
            <SectionDescription>
              AI·전문가 자료를 함께 분석한 평가별 통합 결과와 종합 점수입니다.
            </SectionDescription>
          </div>
        ) : null}

        <div className={`flex flex-wrap items-center gap-3 ${showHeader ? "mt-5" : ""}`}>
          <Badge className="bg-[#e8f1ff] text-[#2463b3]">평가 {sorted.length}건</Badge>
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

        <EvaluationRoundTabs
          rounds={sorted}
          selectedRoundId={selectedRound.id}
          onRequestDelete={requestDeleteRound}
          onSelect={setSelectedId}
        />

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
            <Badge className="bg-slate-100 text-slate-700">{selectedRound.reviewerName}</Badge>
            <Badge className="bg-slate-100 text-slate-700">총 배점 {selectedRound.totalPoints}점</Badge>
            {aiAvg !== null ? (
              <Badge className="bg-[#e8f1ff] text-[#2463b3]">AI 평균 {aiAvg}점</Badge>
            ) : null}
            {expertAvg !== null ? (
              <Badge className="bg-slate-100 text-slate-700">전문가 평균 {expertAvg}점</Badge>
            ) : null}
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
              <p className="mt-2 text-sm leading-6 text-[#475569]">{selectedRound.aiAnalysis.summary}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <SubsectionTitle>종합 평가 결과</SubsectionTitle>
                <p className="mt-1 text-sm font-semibold text-[#2463b3]">
                  종합 점수 {hybridView.projectScore} / {selectedRound.totalPoints}점
                </p>
              </div>
              <EvaluationGradeLegend />
            </div>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
              <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
            </div>

            {selectedRound.aiAnalysis.documentSections.length > 0 ? (
              <DocumentSectionsBlock sections={selectedRound.aiAnalysis.documentSections} />
            ) : null}

            <FieldLabel as="p" className="mb-3">
              평가항목 총 {hybridView.results.length}개
            </FieldLabel>
            <EvaluationResultsTable
              evaluationPreview={selectedRound.aiAnalysis.evaluationPreview}
              referenceGuidelines={referenceGuidelines}
              referenceLaws={referenceLaws}
              results={hybridView.results}
              roundId={selectedRound.id}
            />
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
            AI 엔진: {formatProviderBadgeLabel(selectedRound.aiAnalysis.provider)} ·{" "}
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

function DocumentSectionsBlock({
  sections,
}: {
  sections: EvaluationRound["aiAnalysis"]["documentSections"];
}) {
  return (
    <div className="mb-5 rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <FieldLabel as="p">업로드 자료 문서 이해</FieldLabel>
      <MutedText className="mt-1">
        AI가 심의 자료에서 확인한 항목별 요약입니다. PDF 내 도면·이미지나 텍스트 추출이 어려운 페이지는 문서이해도가
        낮게 표시될 수 있습니다.
      </MutedText>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div className="rounded-xl border border-[#d7dee8] bg-white p-3" key={section.label}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-bold text-[#15345b]">{section.label}</p>
              <span className="shrink-0 rounded-full bg-[#e8f1ff] px-2 py-0.5 text-[11px] font-bold text-[#2463b3]">
                문서이해도 {section.confidence}%
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#64748b]">{section.summary}</p>
          </div>
        ))}
      </div>
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
            {file.blobUrl || file.storageKey ? (
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
