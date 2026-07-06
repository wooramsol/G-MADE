import type { StructuredEvaluationDisplay } from "@/lib/evaluation-display";

function EvaluationList({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ol className={`list-decimal space-y-1.5 pl-4 ${className ?? ""}`}>
      {items.map((item, index) => (
        <li className="pl-0.5 leading-5" key={`${index}-${item.slice(0, 24)}`}>
          {item}
        </li>
      ))}
    </ol>
  );
}

export function EvaluationTextBlock({ display }: { display: StructuredEvaluationDisplay }) {
  const hasContent =
    display.sources || display.summary || display.grounds.length > 0 || display.actions.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-2.5">
      {display.sources ? (
        <p className="text-[11px] leading-4 text-[#64748b]">
          <span className="mr-1.5 font-semibold text-[#94a3b8]">근거 자료</span>
          <span className="font-medium text-[#475569]">{display.sources}</span>
        </p>
      ) : null}

      {display.summary ? (
        <p className="text-xs leading-5 text-[#64748b]">{display.summary}</p>
      ) : null}

      {display.grounds.length > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[#2463b3]">평가 근거</p>
          <EvaluationList className="text-xs text-[#475569]" items={display.grounds} />
        </div>
      ) : null}

      {display.actions.length > 0 ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold text-[#0f766e]">보완·검토</p>
          <EvaluationList className="text-xs text-[#475569]" items={display.actions} />
        </div>
      ) : null}
    </div>
  );
}
