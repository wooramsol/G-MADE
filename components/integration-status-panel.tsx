import { MutedText, SubsectionTitle } from "@/components/typography";
import type { IntegrationGroup, IntegrationRow, IntegrationTone } from "@/lib/integrations/status";
import { formatKoreaCheckedAt } from "@/lib/format-datetime";

type IntegrationStatusPanelProps = {
  group: IntegrationGroup;
  checkedAt?: string;
};

const toneClasses: Record<IntegrationTone, string> = {
  active: "bg-[#dcfce7] text-[#166534]",
  inactive: "bg-[#ffedd5] text-[#9a3412]",
  fallback: "bg-[#e8f1ff] text-[#2463b3]",
};

export default function IntegrationStatusPanel({ group, checkedAt }: IntegrationStatusPanelProps) {
  const activeCount = group.rows.filter((row) => row.configured && row.tone === "active").length;

  return (
    <div className="flex h-full min-h-[148px] flex-col rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SubsectionTitle>{group.title}</SubsectionTitle>
          <MutedText className="mt-1 line-clamp-2">{group.description}</MutedText>
        </div>
        <span className="shrink-0 rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-bold text-[#475569]">
          {activeCount}/{group.rows.length} 연동
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-2">
        {group.rows.map((row) => (
          <IntegrationStatusRow key={row.id} row={row} />
        ))}
      </div>

      {checkedAt ? (
        <p className="mt-4 border-t border-[#e2e8f0] pt-3 text-xs text-[#94a3b8]">
          연동 확인 · 한국시간 {formatKoreaCheckedAt(checkedAt)}
        </p>
      ) : null}
    </div>
  );
}

function IntegrationStatusRow({ row }: { row: IntegrationRow }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[#15345b]">{row.name}</p>
          <p className="truncate text-xs text-[#64748b]">{row.provider}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-bold ${toneClasses[row.tone]}`}
        >
          {row.statusLabel}
        </span>
      </div>

      {row.detail ? (
        <p className="mt-1.5 text-xs leading-5 text-[#64748b]" title={row.detail}>
          {row.detail}
        </p>
      ) : null}

      {row.envKeys?.length ? (
        <p className="mt-1 text-[11px] font-medium text-[#94a3b8]">
          환경 변수: {row.envKeys.join(", ")}
        </p>
      ) : null}

      {!row.configured && row.fallback ? (
        <p className="mt-1 text-[11px] leading-5 text-[#b45309]">대체: {row.fallback}</p>
      ) : null}
    </div>
  );
}
