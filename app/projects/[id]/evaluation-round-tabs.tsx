"use client";

import { TabTitle } from "@/components/typography";
import { formatEvaluationRoundLabel } from "@/lib/format-datetime";
import { collectUniqueRoundFiles } from "@/lib/evaluation-round-files";
import type { EvaluationRound } from "@/lib/types";

export default function EvaluationRoundTabs({
  rounds,
  selectedRoundId,
  onSelect,
  onRequestDelete,
}: {
  rounds: EvaluationRound[];
  selectedRoundId: string;
  onSelect: (roundId: string) => void;
  onRequestDelete: (roundId: string) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7dee8] bg-white p-1">
      <div className="flex min-w-max gap-1">
        {rounds.map((round) => {
          const active = round.id === selectedRoundId;
          return (
            <div
              key={round.id}
              className={`relative rounded-lg sm:min-w-[210px] ${
                active ? "bg-[#eef4fb] shadow-sm ring-1 ring-[#2463b3]/25" : "hover:bg-[#f8fafc]"
              }`}
            >
              <button
                type="button"
                aria-label={`${formatEvaluationRoundLabel(round.evaluatedAt)} 평가 삭제`}
                className="absolute right-1 top-1 z-10 rounded p-0.5 text-[10px] font-bold leading-none text-red-500 hover:bg-red-50 hover:text-red-700"
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestDelete(round.id);
                }}
              >
                ✕
              </button>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                className={`w-full rounded-lg px-3 py-2 pr-6 text-left transition ${
                  active ? "text-[#15345b]" : "text-[#64748b] hover:text-[#15345b]"
                }`}
                onClick={() => onSelect(round.id)}
              >
                <TabTitle className="block">{formatEvaluationRoundLabel(round.evaluatedAt)}</TabTitle>
                <span className="mt-1 block text-[11px] text-[#64748b]">
                  자료 {collectUniqueRoundFiles(round).length}개
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
