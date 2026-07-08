"use client";

import { formatEvaluationRoundLabel } from "@/lib/format-datetime";
import type { PreReviewSummaryReport } from "@/lib/pre-review/build-summary-report";

type Props = {
  report: PreReviewSummaryReport;
};

export default function PreReviewSummaryTab({ report }: Props) {
  const statusClass =
    report.completionStatus === "완료"
      ? "bg-emerald-600"
      : report.completionStatus === "보완필요"
        ? "bg-red-600"
        : "bg-amber-500";

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="pre-review-summary space-y-4" id="pre-review-summary-print">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#15345b]">{report.projectName || "사업명 미입력"}</p>
          <p className="text-[11px] text-[#64748b]">
            {formatEvaluationRoundLabel(report.evaluatedAt)}
            {report.reviewType ? ` · ${report.reviewType}` : ""}
            {report.location ? ` · ${report.location}` : ""}
          </p>
        </div>
        <button
          className="rounded-lg bg-[#15345b] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#2463b3]"
          onClick={handlePrint}
          type="button"
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div className={`rounded-xl px-4 py-3 text-white ${statusClass}`}>
        <p className="text-xs font-semibold opacity-90">사전검토 종합 상태</p>
        <p className="text-2xl font-bold">{report.completionStatus}</p>
        <p className="mt-1 text-[11px] opacity-90">
          AI 보조 결과입니다. 최종 판단은 담당 공무원·심의위원회 확인이 필요합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStatCard label="체크리스트 전체" tone="blue" value={report.checklist.total} />
        <SummaryStatCard label="반영" tone="green" value={report.checklist.reflected} />
        <SummaryStatCard label="미반영" tone="red" value={report.checklist.notReflected} />
        <SummaryStatCard label="검토필요" tone="amber" value={report.checklist.reviewNeeded} />
      </div>

      {report.chapters.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-[#d7dee8]">
          <div className="bg-[#15345b] px-4 py-2.5">
            <p className="text-sm font-bold text-white">챕터별 반영률</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#f8fafc] text-left text-[11px] font-bold text-[#64748b]">
                <tr>
                  <th className="px-4 py-2">구분</th>
                  <th className="px-4 py-2">전체</th>
                  <th className="px-4 py-2">반영</th>
                  <th className="px-4 py-2">미반영</th>
                  <th className="px-4 py-2">반영률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eef5]">
                {report.chapters.map((chapter) => (
                  <tr key={chapter.chapter}>
                    <td className="px-4 py-2 font-semibold text-[#15345b]">{chapter.chapter}</td>
                    <td className="px-4 py-2 text-[#475569]">{chapter.total}</td>
                    <td className="px-4 py-2 text-emerald-700">{chapter.reflected}</td>
                    <td className="px-4 py-2 text-red-700">{chapter.notReflected}</td>
                    <td className="px-4 py-2 font-bold text-[#2463b3]">{chapter.reflectionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
        <p className="text-sm font-bold text-[#15345b]">필수 도면·서류</p>
        <p className="mt-1 text-sm text-[#475569]">
          도면 확인 {report.documents.confirmed} · 언급만 {report.documents.mentioned} · 누락{" "}
          {report.documents.missing} / {report.documents.total}
        </p>
      </section>

      {report.actionItemCount > 0 ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-900">보완·확인 필요 {report.actionItemCount}건</p>
        </section>
      ) : null}

      {report.notReflectedItems.length > 0 ? (
        <ActionList
          items={report.notReflectedItems.map((row) => ({
            id: row.itemId,
            title: row.itemName,
            subtitle: row.majorCategory,
            detail: row.rationalePreview,
          }))}
          title="미반영 체크리스트"
          tone="red"
        />
      ) : null}

      {report.documents.missingItems.length > 0 ? (
        <ActionList
          items={report.documents.missingItems.map((doc) => ({
            id: doc.id,
            title: doc.label,
            subtitle: "필수 도면·서류",
          }))}
          title="누락 의심 도면·서류"
          tone="red"
        />
      ) : null}

      {report.highPriorityIssues.length > 0 ? (
        <ActionList
          items={report.highPriorityIssues.map((issue) => ({
            id: issue.id,
            title: issue.description,
            subtitle: `${issue.type} · ${issue.source === "rule" ? "규칙" : "AI"}`,
          }))}
          title="중요 오류·누락"
          tone="amber"
        />
      ) : null}

      {report.reviewNeededItems.length > 0 ? (
        <ActionList
          items={report.reviewNeededItems.map((row) => ({
            id: row.itemId,
            title: row.itemName,
            subtitle: row.majorCategory,
            detail: row.rationalePreview,
          }))}
          title="검토 필요 체크리스트"
          tone="amber"
        />
      ) : null}

      {report.lawReviewNeeded.length > 0 ? (
        <ActionList
          items={report.lawReviewNeeded.map((entry) => ({
            id: entry.id,
            title: `${entry.title} ${entry.article}`.trim(),
            subtitle: entry.summary,
          }))}
          title="법령·지침 검토 필요"
          tone="blue"
        />
      ) : null}

      {report.actionItemCount === 0 ? (
        <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
          자동 탐지된 보완·확인 항목이 없습니다. 담당자 최종 확인은 계속 필요합니다.
        </p>
      ) : null}

      <p className="print-only hidden text-[11px] text-[#64748b]">
        G-MADE 사전검토 AI 보조 종합결과 · {formatEvaluationRoundLabel(report.evaluatedAt)}
      </p>
    </div>
  );
}

function SummaryStatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-[#d7dee8] bg-white text-[#15345b]";

  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${toneClass}`}>
      <p className="text-[10px] font-semibold opacity-80">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function ActionList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber" | "blue";
  items: Array<{ id: string; title: string; subtitle?: string; detail?: string }>;
}) {
  const borderClass =
    tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : "border-[#d7dee8]";

  return (
    <section className={`rounded-xl border ${borderClass} bg-white p-4`}>
      <p className="mb-2 text-sm font-bold text-[#15345b]">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li className="rounded-lg border border-[#e8eef5] bg-[#f8fafc] px-3 py-2" key={item.id}>
            <p className="text-sm font-semibold text-[#172033]">{item.title}</p>
            {item.subtitle ? <p className="text-[11px] text-[#64748b]">{item.subtitle}</p> : null}
            {item.detail ? <p className="mt-1 text-xs text-[#475569]">{item.detail}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
