"use client";

import { useEffect, useMemo, useState } from "react";
import { createEmptyEvaluationItem, isCustomEvaluationItem } from "@/lib/evaluation-rounds";
import type { EvaluationItem, Project } from "@/lib/types";
import { getLocalProjects, saveLocalProjectEvaluationItems } from "./projects/local-project-storage";
import { showToast } from "./toast";

type EvaluationItemsEditorProps = {
  project: Project;
  items: EvaluationItem[];
  onItemsChange: (items: EvaluationItem[]) => void;
  onSaved?: (items: EvaluationItem[]) => void;
};

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
}: EvaluationItemsEditorProps) {
  const totalPoints = items.reduce((sum, item) => sum + Number(item.points || 0), 0);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    serializeItems(project.savedEvaluationItems ?? items),
  );

  const isDirty = useMemo(() => serializeItems(items) !== savedSnapshot, [items, savedSnapshot]);

  useEffect(() => {
    if (!focusItemId) return;

    const row = document.querySelector<HTMLElement>(`[data-evaluation-item-id="${focusItemId}"]`);
    const input = row?.querySelector<HTMLInputElement>("input, textarea");
    input?.focus();
    setFocusItemId(null);
  }, [focusItemId, items]);

  function updateItem(itemId: string, patch: Partial<EvaluationItem>) {
    onItemsChange(items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function removeItem(itemId: string) {
    if (items.length <= 1) return;
    onItemsChange(items.filter((item) => item.id !== itemId));
  }

  function addItem() {
    const newItem = createEmptyEvaluationItem(items.length + 1);
    onItemsChange([newItem, ...items]);
    setFocusItemId(newItem.id);
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
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedEvaluationItems: validItems }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
      };

      let nextItems = validItems;

      if (response.ok && payload.project?.savedEvaluationItems) {
        nextItems = payload.project.savedEvaluationItems;
        saveLocalProjectEvaluationItems(project.id, payload.project, nextItems);
      } else if (response.status === 404 || response.status === 401) {
        saveLocalProjectEvaluationItems(project.id, project, validItems);
      } else if (!response.ok) {
        throw new Error(payload.error ?? "평가항목 저장에 실패했습니다.");
      } else {
        saveLocalProjectEvaluationItems(project.id, project, validItems);
      }

      onItemsChange(nextItems);
      setSavedSnapshot(serializeItems(nextItems));
      onSaved?.(nextItems);
      showToast({ message: "평가항목이 저장되었습니다.", tone: "success" });
    } catch (error) {
      const local = getLocalProjects().find((item) => item.id === project.id);
      const validItems = items.filter(
        (item) =>
          item.majorCategory.trim() ||
          item.middleCategory.trim() ||
          item.detailItem.trim() ||
          item.criteria.trim(),
      );
      saveLocalProjectEvaluationItems(project.id, local ?? project, validItems);
      onItemsChange(validItems);
      setSavedSnapshot(serializeItems(validItems));
      onSaved?.(validItems);
      showToast({
        message:
          error instanceof Error
            ? `${error.message} 브라우저 저장소에 임시 저장했습니다.`
            : "서버 저장에 실패해 브라우저 저장소에 임시 저장했습니다.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
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
        <div className="flex flex-wrap items-center gap-2">
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
        <table className="w-full min-w-[1280px] table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[264px]" />
            <col className="w-[264px]" />
            <col className="w-[360px]" />
            <col className="w-[72px]" />
            <col />
            <col className="w-[56px]" />
          </colgroup>
          <thead className="bg-[#eef4fb] text-[#15345b]">
            <tr>
              <th className="px-3 py-3">대분류</th>
              <th className="px-3 py-3">중분류</th>
              <th className="px-3 py-3">세부항목</th>
              <th className="px-3 py-3">배점</th>
              <th className="px-3 py-3">평가기준</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dee8] bg-white">
            {items.map((item) => {
              const isNew = isCustomEvaluationItem(item);
              return (
                <tr data-evaluation-item-id={item.id} key={item.id}>
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
