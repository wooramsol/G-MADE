"use client";

import { useMemo, useState } from "react";
import { Badge, SubsectionTitle } from "@/components/typography";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { buildPreReviewResults } from "@/lib/pre-review/build-pre-review-results";
import { buildPreReviewSummaryReport } from "@/lib/pre-review/build-summary-report";
import type { DesignIssue, LawReviewEntry } from "@/lib/pre-review/types";
import type { EvaluationRound } from "@/lib/types";
import ChecklistEvaluationList from "./checklist-evaluation-list";
import PreReviewSummaryTab from "./pre-review-summary-tab";

type TabId = "summary" | "checklist" | "issues" | "laws";

type Props = {
  round: EvaluationRound;
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>;
  checklistProps: Omit<React.ComponentProps<typeof ChecklistEvaluationList>, "checklistRows">;
  projectName?: string;
  projectLocation?: string;
  projectReviewType?: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "summary", label: "종합결과" },
  { id: "checklist", label: "체크리스트" },
  { id: "issues", label: "오류·누락" },
  { id: "laws", label: "법령·지침" },
];

export default function PreReviewResultsPanel({
  round,
  referenceLaws,
  checklistProps,
  projectName = "",
  projectLocation,
  projectReviewType,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const results = useMemo(
    () => buildPreReviewResults(round, referenceLaws),
    [round, referenceLaws],
  );
  const summaryReport = useMemo(
    () =>
      buildPreReviewSummaryReport({
        results,
        projectName,
        evaluatedAt: round.evaluatedAt,
        reviewType: projectReviewType,
        location: projectLocation,
      }),
    [results, projectName, round.evaluatedAt, projectReviewType, projectLocation],
  );

  const highPriorityIssues = summaryReport.highPriorityIssues;
  const missingDocCount = results.missingDocuments.filter((doc) => doc.matchLevel === "missing").length;
  const issuesTabCount = highPriorityIssues.length + missingDocCount;
  const otherIssueCount = results.designIssues.filter((issue) => issue.severity !== "높음").length;

  return (
    <div
      className="rounded-2xl border border-[#2463b3]/20 bg-white p-5 panel-shadow"
      id="pre-review-results"
    >
      <div className="mb-4">
        <SubsectionTitle>사전검토 AI 보조 결과</SubsectionTitle>
        <p className="mt-1 text-sm leading-6 text-[#64748b]">
          AI 보조 초안입니다. <span className="font-semibold text-[#15345b]">종합결과</span>를 먼저
          확인하고, 필요할 때만 상세 탭을 열어 주세요. 최종 판단은 담당 공무원 확인이 필요합니다.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(({ id, label }) => {
          const active = activeTab === id;
          const badgeCount =
            id === "summary"
              ? summaryReport.actionItemCount
              : id === "issues" && issuesTabCount > 0
                ? issuesTabCount
                : 0;

          return (
            <button
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                active
                  ? "bg-[#15345b] text-white"
                  : "border border-[#d7dee8] bg-[#f8fafc] text-[#475569] hover:bg-white"
              }`}
              key={id}
              onClick={() => setActiveTab(id)}
              type="button"
            >
              {label}
              {badgeCount > 0 ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${
                    active ? "bg-white/20" : "bg-[#e8f1ff] text-[#2463b3]"
                  }`}
                >
                  {badgeCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "summary" ? <PreReviewSummaryTab report={summaryReport} /> : null}
      {activeTab === "checklist" ? (
        <ChecklistEvaluationList {...checklistProps} checklistRows={results.checklistRows} />
      ) : null}
      {activeTab === "issues" ? (
        <DesignIssuesTab
          highPriorityIssues={highPriorityIssues}
          missingDocuments={results.missingDocuments}
          otherIssueCount={otherIssueCount}
        />
      ) : null}
      {activeTab === "laws" ? <LawReviewTab entries={results.lawReviewEntries} /> : null}
    </div>
  );
}

function DesignIssuesTab({
  highPriorityIssues,
  missingDocuments,
  otherIssueCount,
}: {
  highPriorityIssues: DesignIssue[];
  missingDocuments: Array<{
    id: string;
    label: string;
    found: boolean;
    matchLevel?: "confirmed" | "mentioned" | "missing";
    matchedIn?: string;
  }>;
  otherIssueCount: number;
}) {
  const confirmedCount = missingDocuments.filter((doc) => doc.matchLevel === "confirmed" || doc.found).length;
  const mentionedCount = missingDocuments.filter((doc) => doc.matchLevel === "mentioned").length;
  const missingCount = missingDocuments.filter(
    (doc) => doc.matchLevel === "missing" || (!doc.found && doc.matchLevel !== "mentioned"),
  ).length;

  return (
    <div className="space-y-4">
      {missingDocuments.length > 0 ? (
        <section className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-[#15345b]">필수 도면·서류</p>
            <p className="text-sm font-bold text-[#2463b3]">
              도면 확인 {confirmedCount} / {missingDocuments.length}
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {missingDocuments.map((doc) => {
              const level = doc.matchLevel ?? (doc.found ? "confirmed" : "missing");
              const toneClass =
                level === "confirmed"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : level === "mentioned"
                    ? "border-amber-200 bg-amber-50 text-amber-950"
                    : "border-red-200 bg-red-50 text-red-900";
              const badgeClass =
                level === "confirmed"
                  ? "bg-emerald-600"
                  : level === "mentioned"
                    ? "bg-amber-600"
                    : "bg-red-600";
              const badgeLabel =
                level === "confirmed" ? "도면 확인" : level === "mentioned" ? "언급만" : "누락";

              return (
                <li className={`rounded-lg border px-3 py-2 text-sm ${toneClass}`} key={doc.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{doc.label}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-white ${badgeClass}`}>
                      {badgeLabel}
                    </span>
                  </div>
                  {doc.matchedIn ? (
                    <p className="mt-1 text-[10px] leading-4 opacity-80">근거: {doc.matchedIn}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {mentionedCount > 0 || missingCount > 0 ? (
            <p className="mt-3 text-[11px] text-[#64748b]">
              언급만 {mentionedCount}건 · 누락 {missingCount}건
            </p>
          ) : null}
        </section>
      ) : null}

      {highPriorityIssues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-bold text-[#15345b]">중요 AI 지적사항</p>
          {highPriorityIssues.map((issue) => (
            <article className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={issue.id}>
              <div className="flex flex-wrap items-center gap-2">
                <IssueBadge label={issue.type} tone="type" />
                <IssueBadge label={issue.source === "rule" ? "규칙 검사" : "AI 분석"} tone="source" />
                {issue.file ? (
                  <span className="text-[11px] font-semibold text-[#64748b]">
                    {issue.file}
                    {issue.page ? ` ${issue.page}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6 text-[#172033]">{issue.description}</p>
              {issue.itemName ? (
                <p className="mt-1 text-[11px] font-semibold text-[#64748b]">관련 항목: {issue.itemName}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      {highPriorityIssues.length === 0 && missingCount === 0 && mentionedCount === 0 ? (
        <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
          중요 오류·누락 항목이 없습니다. 세부 검토는 체크리스트 탭을 참고하세요.
        </p>
      ) : null}

      {otherIssueCount > 0 ? (
        <p className="text-[11px] text-[#64748b]">
          그 외 AI 지적 {otherIssueCount}건은 「체크리스트」 탭 항목별 상세에 포함되어 있습니다.
        </p>
      ) : null}
    </div>
  );
}

function LawReviewTab({ entries }: { entries: LawReviewEntry[] }) {
  const reviewNeeded = entries.filter((entry) => entry.status === "검토필요");

  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
        연결된 법령·지침 근거가 없습니다. LAW_OC 설정과 분석 재실행을 확인해 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reviewNeeded.length > 0 ? (
        <p className="text-sm font-bold text-[#15345b]">검토 필요 {reviewNeeded.length}건</p>
      ) : null}
      <div className="space-y-2">
        {entries.map((entry) => (
          <article className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={entry.id}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={entry.status === "검토필요" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}>
                {entry.status}
              </Badge>
              {entry.sourceUrl ? (
                <ReferenceLinkTitle
                  href={
                    entry.id.startsWith("guide::")
                      ? buildAdmrulReferenceUrl(entry.title, entry.sourceUrl) ?? entry.sourceUrl
                      : buildLawReferenceUrl(entry.title, entry.sourceUrl) ?? entry.sourceUrl
                  }
                  title={`${entry.title} ${entry.article}`.trim()}
                />
              ) : (
                <span className="text-sm font-bold text-[#15345b]">
                  {entry.title} {entry.article}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#475569]">{entry.summary}</p>
            {entry.relatedItems.length > 0 ? (
              <p className="mt-2 text-[11px] font-semibold text-[#64748b]">
                관련 체크리스트: {entry.relatedItems.join(", ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function IssueBadge({
  label,
  tone,
}: {
  label: string;
  tone: "type" | "source";
}) {
  const className =
    tone === "type"
      ? "bg-[#e8f1ff] text-[#2463b3]"
      : "bg-slate-100 text-slate-700";

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}
