import type { EvaluationPoint, StructuredEvaluationDisplay } from "@/lib/evaluation-display";

export function EvaluationTextBlock({ display }: { display: StructuredEvaluationDisplay }) {
  if (display.points.length === 0) return null;

  return (
    <ol className="list-decimal pl-4 text-xs text-[#475569]">
      {display.points.map((point, index) => (
        <EvaluationPointItem key={`${index}-${point.content.slice(0, 24)}`} point={point} />
      ))}
    </ol>
  );
}

function EvaluationPointItem({ point }: { point: EvaluationPoint }) {
  const hasEvidence = Boolean(point.evidence.trim());

  return (
    <li className="mb-1 pl-0.5">
      <span className="text-[#334155]">{point.content}</span>
      {hasEvidence ? (
        <span className="mt-0.5 block pl-2 text-[11px] text-[#64748b]">
          <span className="font-semibold text-[#94a3b8]">근거</span>
          <span className="ml-1 text-[#475569]">{point.evidence}</span>
        </span>
      ) : null}
    </li>
  );
}
