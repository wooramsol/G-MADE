import type { IntegrationGroup, IntegrationRow, IntegrationTone } from "@/lib/integrations/status";

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
    <div className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-[#15345b]">{group.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">{group.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-bold text-[#475569]">
          {activeCount}/{group.rows.length} 연동
        </span>
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-3">
        {group.rows.map((row) => (
          <IntegrationStatusRow key={row.id} row={row} />
        ))}
      </div>

      {checkedAt ? (
        <p className="mt-4 text-xs text-[#94a3b8]">서버 기준 {formatCheckedAt(checkedAt)} 확인</p>
      ) : null}
    </div>
  );
}

function IntegrationStatusRow({ row }: { row: IntegrationRow }) {
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

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
