"use client";

import { createEmptyEvaluationItem, isCustomEvaluationItem } from "@/lib/evaluation-rounds";
import type { EvaluationItem } from "@/lib/types";

type EvaluationItemsEditorProps = {
  items: EvaluationItem[];
  onItemsChange: (items: EvaluationItem[]) => void;
};

const PLACEHOLDERS = {
  majorCategory: "대분류 입력",
  middleCategory: "중분류 입력",
  detailItem: "세부 평가항목 입력",
  criteria: "평가 기준을 입력합니다.",
} as const;

export default function EvaluationItemsEditor({ items, onItemsChange }: EvaluationItemsEditorProps) {
  const totalPoints = items.reduce((sum, item) => sum + Number(item.points || 0), 0);

  function updateItem(itemId: string, patch: Partial<EvaluationItem>) {
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    if (items.length <= 1) return;
    onItemsChange(items.filter((item) => item.id !== itemId));
  }

  function addItem() {
    onItemsChange([...items, createEmptyEvaluationItem(items.length + 1)]);
  }

  return (
    <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">공통 평가항목 · 배점</p>
          <p className="mt-1 text-sm text-[#64748b]">
            AI와 전문가가 동일한 평가항목과 배점을 기준으로 평가합니다. 심사마다 항목을 추가·삭제할 수
            있습니다. 현재 총 배점 {totalPoints}점
          </p>
        </div>
        <button
          className="rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm font-bold text-[#15345b] hover:bg-white"
          type="button"
          onClick={addItem}
        >
          + 항목 추가
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[#d7dee8]">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead className="bg-[#eef4fb] text-[#15345b]">
            <tr>
              <th className="px-3 py-3">대분류</th>
              <th className="px-3 py-3">중분류</th>
              <th className="px-3 py-3">세부항목</th>
              <th className="w-24 px-3 py-3">배점</th>
              <th className="min-w-[280px] px-3 py-3">평가기준</th>
              <th className="w-16 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dee8] bg-white">
            {items.map((item) => {
              const isNew = isCustomEvaluationItem(item);
              return (
                <tr key={item.id}>
                  <td className="align-top px-3 py-3">
                    <input
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.majorCategory : undefined}
                      value={item.majorCategory}
                      onChange={(event) => updateItem(item.id, { majorCategory: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.middleCategory : undefined}
                      value={item.middleCategory}
                      onChange={(event) => updateItem(item.id, { middleCategory: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm font-semibold outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.detailItem : undefined}
                      value={item.detailItem}
                      onChange={(event) => updateItem(item.id, { detailItem: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm font-bold outline-none focus:border-[#2463b3] focus:bg-white"
                      min="0"
                      type="number"
                      value={item.points}
                      onChange={(event) =>
                        updateItem(item.id, { points: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <textarea
                      className="min-h-20 w-full resize-y rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={PLACEHOLDERS.criteria}
                      rows={3}
                      value={item.criteria}
                      onChange={(event) => updateItem(item.id, { criteria: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3 text-center">
                    <button
                      className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={items.length <= 1}
                      type="button"
                      onClick={() => removeItem(item.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
