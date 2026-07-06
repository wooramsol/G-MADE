import ReferenceLinkTitle from "@/components/reference-link-title";
import type { EvaluationPoint, StructuredEvaluationDisplay } from "@/lib/evaluation-display";

export function EvaluationTextBlock({ display }: { display: StructuredEvaluationDisplay }) {
  if (display.points.length === 0) return null;

  return (
    <ol className="list-decimal space-y-3 pl-4 text-xs text-[#475569]">
      {display.points.map((point, index) => (
        <EvaluationPointItem key={`${index}-${point.content.slice(0, 24)}`} point={point} />
      ))}
    </ol>
  );
}

function EvaluationPointItem({ point }: { point: EvaluationPoint }) {
  const hasEvidence = Boolean(point.evidence.trim());
  const hasReferences = point.references.length > 0;

  return (
    <li className="pl-0.5 leading-5">
      <p className="text-[#334155]">{point.content}</p>
      {hasEvidence || hasReferences ? (
        <p className="mt-1 pl-2 text-[11px] leading-4 text-[#64748b]">
          <span className="font-semibold text-[#94a3b8]">근거</span>
          {hasEvidence ? <span className="ml-1 text-[#475569]">{point.evidence}</span> : null}
          {hasReferences ? (
            <span className={hasEvidence ? "ml-2" : "ml-1"}>
              {point.references.map((reference) => (
                <span className="mr-2 inline-block" key={`${reference.title}-${reference.subtitle}`}>
                  {reference.href ? (
                    <ReferenceLinkTitle
                      className="text-[11px]"
                      href={reference.href}
                      title={
                        reference.subtitle
                          ? `${reference.title} ${reference.subtitle}`
                          : reference.title
                      }
                    />
                  ) : (
                    <span className="text-[#2463b3]">
                      {reference.subtitle
                        ? `${reference.title} ${reference.subtitle}`
                        : reference.title}
                    </span>
                  )}
                </span>
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
