import type { IntegrationGroup, IntegrationRow, IntegrationTone } from "@/lib/integrations/status";
import { formatKoreaCheckedAt } from "@/lib/format-datetime";

type IntegrationStatusPanelProps = {
  group: IntegrationGroup;
  checkedAt?: string;
  variant?: "default" | "compact";
};

const toneClasses: Record<IntegrationTone, string> = {
  active: "bg-[#dcfce7] text-[#166534]",
  inactive: "bg-[#ffedd5] text-[#9a3412]",
  fallback: "bg-[#e8f1ff] text-[#2463b3]",
};

export default function IntegrationStatusPanel({
  group,
  checkedAt,
  variant = "default",
}: IntegrationStatusPanelProps) {
  const activeCount = group.rows.filter((row) => row.configured && row.tone === "active").length;
  const isCompact = variant === "compact";

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[#d7dee8] bg-white panel-shadow ${
        isCompact ? "p-4" : "h-full p-6"
      }`}
    >
      <div className={`flex items-start justify-between gap-2 ${isCompact ? "" : "gap-3"}`}>
        <div className="min-w-0">
          <h3 className={`font-bold text-[#15345b] ${isCompact ? "text-base" : "text-xl"}`}>
            {group.title}
          </h3>
          {!isCompact ? (
            <p className="mt-2 text-sm leading-6 text-[#64748b]">{group.description}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-[#f8fafc] px-2.5 py-0.5 text-[11px] font-bold text-[#475569]">
          {activeCount}/{group.rows.length}
        </span>
      </div>

      <div className={`flex flex-col ${isCompact ? "mt-3 gap-2" : "mt-5 flex-1 gap-3"}`}>
        {group.rows.map((row) => (
          <IntegrationStatusRow compact={isCompact} key={row.id} row={row} />
        ))}
      </div>

      {!isCompact && checkedAt ? (
        <p className="mt-4 text-xs text-[#94a3b8]">한국시간 기준 {formatKoreaCheckedAt(checkedAt)} 확인</p>
      ) : null}
    </div>
  );
}

function IntegrationStatusRow({ row, compact }: { row: IntegrationRow; compact: boolean }) {
  if (compact) {
    return (
      <div className="rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#15345b]">{row.name}</p>
            <p className="truncate text-[11px] text-[#64748b]">{row.provider}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${toneClasses[row.tone]}`}
          >
            {row.statusLabel}
          </span>
        </div>
        {row.detail ? (
          <p className="mt-1.5 truncate text-[11px] leading-4 text-[#64748b]" title={row.detail}>
            {row.detail}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3">
      <div className="grid items-center gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-sm font-bold text-[#15345b]">{row.name}</p>
          <p className="mt-0.5 text-xs text-[#64748b]">{row.provider}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-center text-xs font-bold ${toneClasses[row.tone]}`}
        >
          {row.statusLabel}
        </span>
      </div>

      {row.detail ? <p className="mt-2 text-xs leading-5 text-[#64748b]">{row.detail}</p> : null}

      {row.envKeys?.length ? (
        <p className="mt-2 text-[11px] font-medium text-[#94a3b8]">
          환경 변수: {row.envKeys.join(", ")}
        </p>
      ) : null}

      {!row.configured && row.fallback ? (
        <p className="mt-1 text-[11px] leading-5 text-[#b45309]">대체: {row.fallback}</p>
      ) : null}
    </div>
  );
}
