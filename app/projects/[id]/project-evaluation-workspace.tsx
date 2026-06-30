"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import {
  Badge,
  BodyText,
  Caption,
  FieldLabel,
  MutedText,
  ScoreValue,
  SectionDescription,
  SectionTitle,
  SubsectionTitle,
  TabTitle,
} from "@/components/typography";
import { formatProviderBadgeLabel, getProviderBadgeClass } from "@/lib/ai/provider-labels";
import { formatEvaluationRoundLabel } from "@/lib/format-datetime";
import { resolveDocumentSectionsForDisplay } from "@/lib/ai/document-section-summary";
import { combineAiEvaluationText, formatEvaluationText } from "@/lib/format-evaluation-text";
import LegacyDemoAnalysisBanner from "@/components/legacy-demo-analysis-banner";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { dedupeWarnings } from "@/lib/analysis-warnings";
import { dedupeReferenceLaws } from "@/lib/dedupe-reference-laws";
import { pickRelatedReferenceLaws, lawMatchesCitation } from "@/lib/related-reference-laws";
import {
  guidelineMatchesCitation,
  pickRelatedReferenceGuidelines,
} from "@/lib/related-reference-guidelines";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { collectUniqueRoundFiles } from "@/lib/evaluation-round-files";
import { buildHybridViewFromRound } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult, Project } from "@/lib/types";
import { showToast } from "../../toast";

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
  const previousRoundCountRef = useRef(rounds.length);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingRoundId, setDeletingRoundId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const referenceGuidelines = pickRelatedReferenceGuidelines({
    pool: selectedRound?.aiAnalysis.referenceGuidelines ?? [],
    evaluationPreview: selectedRound?.aiAnalysis.evaluationPreview,
    evaluationItems: selectedRound?.evaluationItems,
  }).filter((guide) => buildAdmrulReferenceUrl(guide.title, guide.sourceUrl) !== null);
  const analysisWarnings = dedupeWarnings(selectedRound?.aiAnalysis.warnings ?? []);

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
    if (rounds.length > previousRoundCountRef.current && sorted[0]) {
      setSelectedId(sorted[0].id);
    }
    previousRoundCountRef.current = rounds.length;
  }, [rounds.length, sorted]);

  useEffect(() => {
    if (!focusRoundId) return;

    if (sorted.some((round) => round.id === focusRoundId)) {
      setSelectedId(focusRoundId);
      onFocusRoundHandled?.();
    }
  }, [focusRoundId, onFocusRoundHandled, sorted]);

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
          <WorkspaceSectionHeading
            title="통합 평가 결과"
            description="AI·전문가 자료를 함께 분석한 평가별 통합 결과와 종합 점수입니다."
          />
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
              <p className={`text-sm leading-6 text-[#475569] ${selectedRound.expertSummary ? "mt-2" : "mt-2"}`}>
                {selectedRound.aiAnalysis.summary}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
            <div className="mb-5">
              <SubsectionTitle>종합 평가 결과</SubsectionTitle>
              <p className="mt-1 text-sm font-semibold text-[#2463b3]">
                종합 점수 {hybridView.projectScore} / {selectedRound.totalPoints}점
              </p>
            </div>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <WeightBar label="AI 평가" value={hybridView.settings.aiWeight} color="#2463b3" />
              <WeightBar label="전문가 평가" value={hybridView.settings.humanWeight} color="#15345b" />
            </div>

            {selectedRound.aiAnalysis.documentSections.length > 0 ? (
              <DocumentSectionsBlock sections={resolveDocumentSectionsForDisplay(selectedRound)} />
            ) : null}

            <FieldLabel as="p" className="mb-3">
              평가항목 총 {hybridView.results.length}개
            </FieldLabel>
            <EvaluationTable
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

function WorkspaceSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <SectionDescription>{description}</SectionDescription>
    </div>
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
        AI가 심의 자료 전체(텍스트·PDF·도면·이미지)를 읽어 확인한 항목별 요약입니다. 스캔 품질이 낮거나 도면이
        매우 복잡한 경우 일부 세부는 심사위원 확인이 필요할 수 있습니다.
      </MutedText>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <div
            className="rounded-xl border border-[#d7dee8] bg-white p-3"
            key={section.label}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-bold text-[#15345b]">{section.label}</p>
              <span className="shrink-0 rounded-full bg-[#e8f1ff] px-2 py-0.5 text-[11px] font-bold text-[#2463b3]">
                문서이해도 {section.confidence}%
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#64748b]">
              {formatEvaluationText(section.summary)}
            </p>
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

function EvaluationTable({
  results,
  evaluationPreview,
  referenceLaws,
  referenceGuidelines,
  roundId,
}: {
  results: HybridResult[];
  evaluationPreview: EvaluationRound["aiAnalysis"]["evaluationPreview"];
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>;
  referenceGuidelines: NonNullable<EvaluationRound["aiAnalysis"]["referenceGuidelines"]>;
  roundId: string;
}) {
  return (
    <div className="rounded-xl border border-[#d7dee8]">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[36px]" />
          <col className="w-[14%]" />
          <col className="w-[52px]" />
          <col className="w-[56px]" />
          <col className="w-[72px]" />
          <col className="w-[64px]" />
          <col />
        </colgroup>
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-2 py-2.5 text-center">#</th>
            <th className="px-3 py-2.5">평가항목</th>
            <th className="px-2 py-2.5 text-center">배점</th>
            <th className="px-2 py-2.5 text-center">AI</th>
            <th className="px-2 py-2.5 text-center">전문가</th>
            <th className="px-2 py-2.5 text-center">최종</th>
            <th className="px-3 py-2.5">평가 근거 / 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result, index) => {
            const preview =
              evaluationPreview.find((row) => row.itemId === result.item.id) ??
              evaluationPreview.find((row) => row.itemName === result.item.detailItem);
            const itemLawLinks = matchItemReferenceLaws(preview, referenceLaws);
            const itemGuidelineLinks = matchItemReferenceGuidelines(preview, referenceGuidelines);

            return (
              <tr key={result.item.id}>
                <td className="px-2 py-3 align-top text-center text-xs font-bold text-[#64748b]">
                  {index + 1}
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="text-sm font-bold leading-5 text-[#15345b]">{result.item.detailItem}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#64748b]">
                    {result.item.majorCategory} · {result.item.middleCategory}
                  </p>
                </td>
                <td className="px-2 py-3 align-top text-center font-semibold text-[#15345b]">
                  {result.item.points}
                </td>
                <td className="px-2 py-3 align-top text-center font-bold text-[#2463b3]">
                  {result.aiEvaluation.score}
                </td>
                <td className="px-2 py-3 align-top text-center font-bold text-[#15345b]">
                  {result.humanEvaluation.score}
                </td>
                <td className="px-2 py-3 align-top text-center">
                  <ScoreValue>{result.finalScore}</ScoreValue>
                  <p className="text-[10px] leading-4 text-[#64748b]">
                    {result.finalGrade}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  <EvaluationRationaleCell
                    guidelineLinks={itemGuidelineLinks}
                    lawLinks={itemLawLinks}
                    result={result}
                    roundId={roundId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EvaluationRationaleCell({
  result,
  lawLinks,
  guidelineLinks,
  roundId,
}: {
  result: HybridResult;
  lawLinks: Array<{ title: string; article: string; href: string | null }>;
  guidelineLinks: Array<{ title: string; section: string; href: string | null }>;
  roundId: string;
}) {
  const aiText = formatEvaluationText(
    combineAiEvaluationText(result.aiEvaluation.rationale, result.aiEvaluation.recommendation),
  );
  const expertText = formatEvaluationText(result.humanEvaluation.comment ?? "");

  return (
    <div className="space-y-2 text-xs leading-5 text-[#64748b]">
      {aiText ? (
        <div>
          <p className="font-semibold text-[#2463b3]">AI</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[#475569]">{aiText}</p>
        </div>
      ) : null}
      {expertText ? (
        <div>
          <p className="font-semibold text-[#15345b]">전문가</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[#475569]">{expertText}</p>
        </div>
      ) : null}
      {lawLinks.length > 0 || guidelineLinks.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[#e2e8f0] pt-2">
          {lawLinks.map((law) => (
            <span key={`${roundId}-${law.title}-${law.article}`}>
              {law.href ? (
                <ReferenceLinkTitle title={`${law.title} ${law.article}`} href={law.href} />
              ) : (
                <span className="text-[#2463b3]">
                  {law.title} {law.article}
                </span>
              )}
            </span>
          ))}
          {guidelineLinks.map((guide) => (
            <span key={`${roundId}-${guide.title}-${guide.section}`}>
              {guide.href ? (
                <ReferenceLinkTitle title={`${guide.title} ${guide.section}`} href={guide.href} />
              ) : (
                <span className="text-[#2463b3]">
                  {guide.title} {guide.section}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function matchItemReferenceLaws(
  preview: EvaluationRound["aiAnalysis"]["evaluationPreview"][number] | undefined,
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>,
) {
  const citations = preview?.laws ?? [];
  const matched = referenceLaws.filter((law) =>
    citations.some((citation) => lawMatchesCitation(law, citation)),
  );

  if (matched.length > 0) {
    return matched.map((law) => ({
      title: law.title,
      article: law.article,
      href: buildLawReferenceUrl(law.title, law.sourceUrl),
    }));
  }

  return citations.map((citation) => ({
    title: citation,
    article: "",
    href: null,
  }));
}

function matchItemReferenceGuidelines(
  preview: EvaluationRound["aiAnalysis"]["evaluationPreview"][number] | undefined,
  referenceGuidelines: NonNullable<EvaluationRound["aiAnalysis"]["referenceGuidelines"]>,
) {
  const citations = preview?.guidelines ?? [];
  const matched = referenceGuidelines.filter((guide) =>
    citations.some((citation) => guidelineMatchesCitation(guide, citation)),
  );

  if (matched.length > 0) {
    return matched.map((guide) => ({
      title: guide.title,
      section: guide.section,
      href: buildAdmrulReferenceUrl(guide.title, guide.sourceUrl),
    }));
  }

  return citations.map((citation) => ({
    title: citation,
    section: "",
    href: null,
  }));
}
