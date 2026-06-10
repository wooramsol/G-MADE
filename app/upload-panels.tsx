"use client";

import { useEffect, useMemo, useState } from "react";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { dedupeReferenceLaws } from "@/lib/dedupe-reference-laws";
import { buildLawReferenceUrl } from "@/lib/reference-links";
import {
  Badge,
  BodyText,
  Caption,
  MicroText,
  MutedText,
  SubsectionTitle,
  SummaryTitle,
  TabTitle,
} from "@/components/typography";
import { dedupeWarnings } from "@/lib/analysis-warnings";
import { filterStaleLawWarnings, hadLawOcMissingWarning } from "@/lib/law/warnings";
import type { UploadAnalysisSession } from "@/lib/types";

type SessionWithRound = UploadAnalysisSession & { round: number };

export function UploadAnalysisResultsPanel({ sessions }: { sessions: UploadAnalysisSession[] }) {
  const sortedSessions = useMemo<SessionWithRound[]>(() => {
    const ordered = [...sessions].sort(
      (left, right) => new Date(right.analyzedAt).getTime() - new Date(left.analyzedAt).getTime(),
    );
    const total = ordered.length;
    return ordered.map((session, index) => ({
      ...session,
      round: total - index,
    }));
  }, [sessions]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lawApiConfigured, setLawApiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/law/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { configured?: boolean } | null) => {
        if (!cancelled) {
          setLawApiConfigured(Boolean(payload?.configured));
        }
      })
      .catch(() => {
        if (!cancelled) setLawApiConfigured(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sortedSessions.length === 0) return;
    const stillExists = sortedSessions.some((session) => session.id === selectedId);
    if (!selectedId || !stillExists) {
      const timeout = window.setTimeout(() => setSelectedId(sortedSessions[0].id), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [sortedSessions, selectedId]);

  if (sortedSessions.length === 0) return null;

  const selectedSession = sortedSessions.find((session) => session.id === selectedId) ?? sortedSessions[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SubsectionTitle>분석 결과</SubsectionTitle>
          <MutedText className="mt-1">
            차수별로 결과를 선택해 확인합니다. 최신 분석이 기본으로 표시됩니다.
          </MutedText>
        </div>
        <Badge className="bg-[#e8f1ff] text-[#2463b3]">총 {sortedSessions.length}회</Badge>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-1">
        <div className="flex min-w-max gap-1">
          {sortedSessions.map((session) => {
            const isActive = session.id === selectedSession.id;
            const fileCount = session.files.length;
            return (
              <button
                key={session.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left transition sm:min-w-[148px] ${
                  isActive
                    ? "bg-white text-[#15345b] shadow-sm ring-1 ring-[#2463b3]/20"
                    : "text-[#64748b] hover:bg-white/70 hover:text-[#15345b]"
                }`}
                onClick={() => setSelectedId(session.id)}
              >
                <TabTitle className="block">{session.round}차 분석</TabTitle>
                <MicroText className="mt-0.5 block">
                  {formatUploadDateTime(session.analyzedAt)}
                </MicroText>
                <MicroText className="mt-1 block">
                  {fileCount}개 파일 · {formatProviderBadgeLabel(session.analysis.provider)}
                </MicroText>
              </button>
            );
          })}
        </div>
      </div>

      {lawApiConfigured === false ? (
        <div className="rounded-xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm leading-6 text-[#9a3412]">
          <p className="font-bold">법령 API 미설정</p>
          <p className="mt-2">
            Vercel 환경 변수 <code className="rounded bg-white/80 px-1">LAW_OC</code>에 발급받은 OC(
            <code className="rounded bg-white/80 px-1">gmadehive0515</code>)를 넣고 Redeploy한 뒤, 파일을 다시
            업로드·분석해 주세요.
          </p>
        </div>
      ) : null}

      <AnalysisSessionDetail lawApiConfigured={lawApiConfigured} session={selectedSession} />
    </div>
  );
}

function AnalysisSessionDetail({
  lawApiConfigured,
  session,
}: {
  lawApiConfigured: boolean | null;
  session: SessionWithRound;
}) {
  const warnings = dedupeWarnings(
    filterStaleLawWarnings(session.analysis.warnings, lawApiConfigured),
  );
  const showStaleLawNotice =
    lawApiConfigured === true &&
    hadLawOcMissingWarning(session.analysis.warnings) &&
    session.analysis.lawSource !== "law.go.kr";

  const avgScore =
    session.analysis.evaluationPreview.length > 0
      ? Math.round(
          session.analysis.evaluationPreview.reduce((sum, row) => sum + row.score, 0) /
            session.analysis.evaluationPreview.length,
        )
      : null;

  return (
    <article className="space-y-4 rounded-xl border border-[#d7dee8] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#15345b] text-white">{session.round}차 분석</Badge>
        <Badge className="bg-slate-100 text-slate-700">{formatUploadDateTime(session.analyzedAt)}</Badge>
        <Badge className="bg-[#e8f1ff] text-[#2463b3]">
          {formatProviderBadgeLabel(session.analysis.provider)}
        </Badge>
        <Badge className="bg-slate-100 text-slate-700">
          {session.analysis.mode === "live" ? "실제 AI API 분석" : "데모 분석"}
        </Badge>
        <Badge className="bg-[#eef4fb] text-[#15345b]">
          AI {session.aiWeight}% · 전문가 {session.expertWeight}%
        </Badge>
        <Badge className="bg-[#eef4fb] text-[#15345b]">총 배점 {session.totalPoints}점</Badge>
        {avgScore !== null ? (
          <Badge className="bg-[#e8f1ff] text-[#2463b3]">평균 {avgScore}점</Badge>
        ) : null}
      </div>

      <BodyText>{session.analysis.summary}</BodyText>

      {session.analysis.spatialContext || (session.analysis.referenceLaws?.length ?? 0) > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {session.analysis.spatialContext ? (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3 text-sm">
              <SubsectionTitle className="text-base">경관지구 (브이월드)</SubsectionTitle>
              <p className="mt-1 text-[#64748b]">{session.analysis.spatialContext.address}</p>
              <p className="mt-2 font-semibold text-[#15345b]">
                {session.analysis.spatialContext.inLandscapeZone ? "경관지구 해당 가능" : "인근 조회 결과 없음"}
              </p>
              {session.analysis.spatialContext.matchedZones.slice(0, 2).map((zone) => (
                <p className="mt-1 text-xs text-[#64748b]" key={`${session.id}-${zone.code}`}>
                  {zone.name} · {zone.jurisdiction}
                </p>
              ))}
            </div>
          ) : null}
          {(session.analysis.referenceLaws?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3 text-sm">
              <SubsectionTitle className="text-base">
                실시간 법령 근거 ({session.analysis.lawSource === "law.go.kr" ? "국가법령정보" : "내장 요약"})
              </SubsectionTitle>
              {dedupeReferenceLaws(session.analysis.referenceLaws ?? [])
                .filter((law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null)
                .map((law) => (
                  <div className="mt-2 text-[#64748b]" key={`${session.id}-${law.title}-${law.article}`}>
                    <ReferenceLinkTitle
                      title={`${law.title} ${law.article}`}
                      href={buildLawReferenceUrl(law.title, law.sourceUrl)}
                    />
                    <p className="mt-0.5 text-xs leading-5">{law.summary}</p>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="rounded-xl border border-[#d7dee8] bg-[#f8fafc]">
        <SummaryTitle>업로드 파일 ({session.files.length}건)</SummaryTitle>
        <div className="overflow-hidden border-t border-[#d7dee8]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">파일명</th>
                <th className="px-4 py-3">형식</th>
                <th className="px-4 py-3">크기</th>
                <th className="px-4 py-3">분석상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {session.files.map((file) => (
                <tr key={file.id}>
                  <td className="px-4 py-4 font-semibold text-[#15345b]">{file.originalName}</td>
                  <td className="px-4 py-4 text-[#64748b]">{file.fileType}</td>
                  <td className="px-4 py-4 text-[#64748b]">{formatBytes(file.sizeBytes)}</td>
                  <td className="px-4 py-4">
                    <Badge className="bg-blue-50 text-blue-700">분석 완료</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {showStaleLawNotice ? (
        <div className="rounded-xl border border-[#93c5fd] bg-[#eff6ff] p-4 text-sm leading-6 text-[#1e40af]">
          <p className="font-bold">법령 API는 현재 연결되어 있습니다</p>
          <p className="mt-2">
            이 결과는 API 설정 전에 분석된 차수입니다. 실시간 법령 근거를 쓰려면 파일을 다시 업로드·분석해 주세요.
          </p>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm leading-6 text-[#9a3412]">
          <p className="font-bold">AI 호출 안내</p>
          {warnings.map((warning) => (
            <p className="mt-2" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <details className="rounded-xl border border-[#d7dee8] bg-white" open>
        <SummaryTitle>문서 섹션 분석 ({session.analysis.documentSections.length}건)</SummaryTitle>
        <div className="grid gap-3 border-t border-[#d7dee8] p-4 md:grid-cols-2 xl:grid-cols-3">
          {session.analysis.documentSections.map((section) => (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={`${session.id}-${section.label}`}>
              <div className="type-tab-title flex justify-between">
                <span>{section.label}</span>
                <span>{section.confidence}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${section.confidence}%` }} />
              </div>
              <p className="mt-2 text-xs leading-5 text-[#64748b]">{section.summary}</p>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-xl border border-[#d7dee8] bg-white" open>
        <SummaryTitle>평가 항목 ({session.analysis.evaluationPreview.length}건)</SummaryTitle>
        <div className="space-y-3 border-t border-[#d7dee8] p-4">
          {session.analysis.evaluationPreview.map((row) => (
            <div className="rounded-xl border border-[#d7dee8] p-3" key={`${session.id}-${row.itemName}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SubsectionTitle className="text-base">{row.itemName}</SubsectionTitle>
                <Badge className="bg-[#e8f1ff] text-[#2463b3]">
                  {row.score}점 · {row.grade}
                </Badge>
              </div>
              <BodyText className="mt-2">{row.rationale}</BodyText>
              {row.laws.length > 0 ? (
                <p className="mt-2 text-xs leading-5 text-[#64748b]">법령 근거: {row.laws.join(" · ")}</p>
              ) : null}
              <p className="mt-2 text-sm font-semibold leading-6 text-[#9a3412]">개선권고: {row.recommendation}</p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
