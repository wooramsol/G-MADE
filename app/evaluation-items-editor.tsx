"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AutoResizeTextarea from "@/components/auto-resize-textarea";
import { MutedText, StepTitle } from "@/components/typography";
import { interactiveCardClassName } from "@/components/interactive-card";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import { createEmptyEvaluationItem, isCustomEvaluationItem } from "@/lib/evaluation-rounds";
import type { EvaluationItem, Project } from "@/lib/types";
import { showToast } from "./toast";

type EvaluationItemsEditorProps = {
  project: Project;
  items: EvaluationItem[];
  onItemsChange: (items: EvaluationItem[]) => void;
  onSaved?: (items: EvaluationItem[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const CATEGORY_COL_WIDTH = "w-[176px]";
const PLACEHOLDERS = {
  majorCategory: "대분류 입력",
  middleCategory: "중분류 입력",
  detailItem: "세부 평가항목 입력",
  criteria: "평가 기준을 입력합니다.",
} as const;

function serializeItems(items: EvaluationItem[]): string {
  return JSON.stringify(items);
}

export default function EvaluationItemsEditor({
  project,
  items,
  onItemsChange,
  onSaved,
  onDirtyChange,
}: EvaluationItemsEditorProps) {
  const totalPoints = items.reduce((sum, item) => sum + Number(item.points || 0), 0);
  const pendingFocusItemIdRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    serializeItems(project.savedEvaluationItems ?? items),
  );

  const isDirty = useMemo(() => serializeItems(items) !== savedSnapshot, [items, savedSnapshot]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const focusItemId = pendingFocusItemIdRef.current;
    if (!focusItemId) return;
    pendingFocusItemIdRef.current = null;

    const row = document.querySelector<HTMLElement>(`[data-evaluation-item-id="${focusItemId}"]`);
    const input = row?.querySelector<HTMLInputElement>("input, textarea");
    input?.focus();
  }, [items]);

  function updateItem(itemId: string, patch: Partial<EvaluationItem>) {
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    if (items.length <= 1) return;
    onItemsChange(items.filter((item) => item.id !== itemId));
  }

  function addItem() {
    const newItem = createEmptyEvaluationItem(items.length + 1);
    pendingFocusItemIdRef.current = newItem.id;
    onItemsChange([newItem, ...items]);
  }

  async function saveItems() {
    if (saving || !isDirty) return;

    const validItems = items.filter(
      (item) =>
        item.majorCategory.trim() ||
        item.middleCategory.trim() ||
        item.detailItem.trim() ||
        item.criteria.trim(),
    );

    if (validItems.length === 0) {
      showToast({ message: "저장할 평가항목 내용을 입력해 주세요.", tone: "error" });
      return;
    }

    setSaving(true);

    try {
      const response = await clientFetchWithTimeout(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedEvaluationItems: validItems }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
      };

      if (!response.ok || !payload.project?.savedEvaluationItems) {
        throw new Error(payload.error ?? "평가항목 저장에 실패했습니다.");
      }

      const nextItems = payload.project.savedEvaluationItems;
      onItemsChange(nextItems);
      setSavedSnapshot(serializeItems(nextItems));
      onSaved?.(nextItems);
      showToast({ message: "평가항목이 저장되었습니다.", tone: "success" });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "평가항목 저장에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-xl border border-[#d7dee8] bg-white p-4 ${interactiveCardClassName}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <StepTitle>1. 공통 평가항목 · 배점</StepTitle>
          <MutedText className="mt-1">
            AI와 전문가가 동일한 평가항목과 배점을 기준으로 평가합니다. 심사마다 항목을 추가·삭제할 수
            있습니다. 총 {items.length}개 항목 · 배점 {totalPoints}점
          </MutedText>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              저장되지 않은 변경
            </span>
          ) : null}
          <button
            className="rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm font-bold text-[#15345b] hover:bg-white"
            type="button"
            onClick={addItem}
          >
            + 항목 추가
          </button>
          <button
            className="primary-action rounded-lg px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={saving || !isDirty}
            type="button"
            onClick={saveItems}
          >
            {saving ? "저장 중..." : "평가항목 저장"}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#d7dee8]">
        <table className="w-full min-w-[1040px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[44px]" />
            <col className={CATEGORY_COL_WIDTH} />
            <col className={CATEGORY_COL_WIDTH} />
            <col className={CATEGORY_COL_WIDTH} />
            <col className="w-[72px]" />
            <col />
            <col className="w-[56px]" />
          </colgroup>
          <thead className="bg-[#eef4fb] text-[#15345b]">
            <tr>
              <th className="px-2 py-3 text-center">#</th>
              <th className="px-3 py-3">대분류</th>
              <th className="px-3 py-3">중분류</th>
              <th className="px-3 py-3">세부항목</th>
              <th className="px-3 py-3">배점</th>
              <th className="px-3 py-3">평가기준</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dee8] bg-white">
            {items.map((item, index) => {
              const isNew = isCustomEvaluationItem(item);
              return (
                <tr data-evaluation-item-id={item.id} key={item.id}>
                  <td className="align-top px-2 py-3 text-center text-xs font-bold text-[#64748b]">
                    {index + 1}
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      aria-label={`${index + 1}행 대분류`}
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.majorCategory : undefined}
                      value={item.majorCategory}
                      onChange={(event) => updateItem(item.id, { majorCategory: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      aria-label={`${index + 1}행 중분류`}
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.middleCategory : undefined}
                      value={item.middleCategory}
                      onChange={(event) => updateItem(item.id, { middleCategory: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      aria-label={`${index + 1}행 세부항목`}
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm font-semibold outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white"
                      placeholder={isNew ? PLACEHOLDERS.detailItem : undefined}
                      value={item.detailItem}
                      onChange={(event) => updateItem(item.id, { detailItem: event.target.value })}
                    />
                  </td>
                  <td className="align-top px-3 py-3">
                    <input
                      aria-label={`${index + 1}행 배점`}
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
                    <AutoResizeTextarea
                      placeholder={PLACEHOLDERS.criteria}
                      value={item.criteria}
                      onChange={(value) => updateItem(item.id, { criteria: value })}
                    />
                  </td>
                  <td className="align-top px-2 py-3">
                    <button
                      className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold leading-none text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
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
