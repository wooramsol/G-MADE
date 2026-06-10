import { EVALUATION_GRADE_SCALE } from "@/lib/hybrid-evaluation";

export default function EvaluationGradeLegend() {
  return (
    <div
      aria-label="등급 기준"
      className="max-w-md rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-[11px] leading-5 text-[#64748b]"
    >
      <p className="mb-1 font-bold text-[#15345b]">등급 기준 (점수 ÷ 배점 %)</p>
      <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
        {EVALUATION_GRADE_SCALE.map((entry) => (
          <li key={entry.grade}>
            <span className="font-semibold text-[#475569]">{entry.grade}</span> {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
