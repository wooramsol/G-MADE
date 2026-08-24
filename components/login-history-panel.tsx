"use client";

import { useState } from "react";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { LoginHistoryEntry } from "@/lib/login-history";

const INITIAL_VISIBLE_COUNT = 5;

type LoginHistoryPanelProps = {
  entries: LoginHistoryEntry[];
};

export default function LoginHistoryPanel({ entries }: LoginHistoryPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleEntries = expanded ? entries : entries.slice(0, INITIAL_VISIBLE_COUNT);
  const hiddenCount = Math.max(entries.length - INITIAL_VISIBLE_COUNT, 0);

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
        아직 기록된 로그인 이력이 없습니다. 다음 로그인부터 누적됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-[#d7dee8]">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[#eef4fb] text-[#15345b]">
            <tr>
              <th className="px-4 py-3">접속 IP</th>
              <th className="px-4 py-3">로그인 일시</th>
              <th className="px-4 py-3">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dee8] bg-white">
            {visibleEntries.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-4 font-semibold text-[#15345b]">{row.ipAddress}</td>
                <td className="px-4 py-4 text-[#475569]">{formatUploadDateTime(row.loggedAt)}</td>
                <td className="px-4 py-4">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#64748b]">
        <p>총 {entries.length}건 누적 · 최신순</p>
        {hiddenCount > 0 || expanded ? (
          <button
            className="rounded-lg border border-[#d7dee8] bg-white px-3 py-1.5 text-sm font-bold text-[#15345b] hover:bg-[#f8fafc]"
            type="button"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "접기" : `더 보기 (${hiddenCount}건)`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isSuccess = status.toUpperCase() === "SUCCESS" || status === "성공";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        isSuccess ? "bg-emerald-50 text-emerald-700" : "bg-[#ffedd5] text-[#9a3412]"
      }`}
    >
      {isSuccess ? "성공" : status}
    </span>
  );
}
