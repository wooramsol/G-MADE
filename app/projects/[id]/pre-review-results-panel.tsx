"use client";

import { useMemo, useState } from "react";
import { Badge, SubsectionTitle } from "@/components/typography";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { buildPreReviewResults } from "@/lib/pre-review/build-pre-review-results";
import type { DesignIssue, LawReviewEntry } from "@/lib/pre-review/types";
import type { EvaluationRound } from "@/lib/types";
import ChecklistEvaluationList from "./checklist-evaluation-list";

type TabId = "issues" | "checklist" | "laws";

type Props = {
  round: EvaluationRound;
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>;
  checklistProps: Omit<React.ComponentProps<typeof ChecklistEvaluationList>, "checklistRows">;
};

const TAB_LABELS: Record<TabId, string> = {
  issues: "① 오류·누락",
  checklist: "② 체크리스트",
  laws: "③ 법령·지침",
};

export default function PreReviewResultsPanel({
  round,
  referenceLaws,
  checklistProps,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("issues");
  const results = useMemo(
    () => buildPreReviewResults(round, referenceLaws),
    [round, referenceLaws],
  );

  const issueCount = results.designIssues.length;
  const checklistIssueCount = results.checklistRows.filter((row) => row.status !== "양호").length;
  const lawReviewCount = results.lawReviewEntries.filter((entry) => entry.status === "검토필요").length;

  return (
    <div
      className="rounded-2xl border border-[#2463b3]/20 bg-white p-5 panel-shadow"
      id="pre-review-results"
    >
      <div className="mb-4">
        <SubsectionTitle>사전검토 AI 보조 결과</SubsectionTitle>
        <p className="mt-1 text-sm leading-6 text-[#64748b]">
          AI 보조 초안입니다. 최종 판단은 담당 공무원·심의위원회 확인이 필요합니다.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as TabId[]).map((tab) => {
          const count =
            tab === "issues" ? issueCount : tab === "checklist" ? checklistIssueCount : lawReviewCount;
          const active = activeTab === tab;
          return (
            <button
              className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                active
                  ? "bg-[#15345b] text-white"
                  : "border border-[#d7dee8] bg-[#f8fafc] text-[#475569] hover:bg-white"
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {TAB_LABELS[tab]}
              {count > 0 ? (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-white/20" : "bg-[#e8f1ff] text-[#2463b3]"}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "issues" ? (
        <DesignIssuesTab issues={results.designIssues} missingDocuments={results.missingDocuments} />
      ) : null}
      {activeTab === "checklist" ? (
        <ChecklistEvaluationList {...checklistProps} checklistRows={results.checklistRows} />
      ) : null}
      {activeTab === "laws" ? <LawReviewTab entries={results.lawReviewEntries} /> : null}
    </div>
  );
}

function DesignIssuesTab({
  issues,
  missingDocuments,
}: {
  issues: DesignIssue[];
  missingDocuments: Array<{ id: string; label: string; found: boolean; matchedIn?: string }>;
}) {
  const missing = missingDocuments.filter((doc) => !doc.found);

  if (issues.length === 0) {
    return (
      <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
        자동 탐지된 오류·누락 항목이 없습니다. 담당자 확인은 계속 필요합니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-950">필수 제출 자료 누락 의심</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {missing.map((doc) => (
              <li key={doc.id}>· {doc.label}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-2">
        {issues.map((issue) => (
          <article className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={issue.id}>
            <div className="flex flex-wrap items-center gap-2">
              <IssueBadge label={issue.type} tone="type" />
              <IssueBadge label={issue.severity} tone={issue.severity === "높음" ? "high" : "normal"} />
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
    </div>
  );
}

function LawReviewTab({ entries }: { entries: LawReviewEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
        연결된 법령·지침 근거가 없습니다. LAW_OC 설정과 분석 재실행을 확인해 주세요.
      </p>
    );
  }

  return (
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
  );
}

function IssueBadge({
  label,
  tone,
}: {
  label: string;
  tone: "type" | "high" | "normal" | "source";
}) {
  const className =
    tone === "high"
      ? "bg-red-100 text-red-800"
      : tone === "type"
        ? "bg-[#e8f1ff] text-[#2463b3]"
        : tone === "source"
          ? "bg-slate-100 text-slate-700"
          : "bg-amber-100 text-amber-900";

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}
