"use client";

import { useEffect } from "react";
import { MutedText, SubsectionTitle } from "@/components/typography";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

type ConfirmDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title = "삭제하시겠습니까?",
  description,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || loading) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loading, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/45 p-4"
      onClick={loading ? undefined : onCancel}
    >
      <div
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <SubsectionTitle id="confirm-dialog-title">{title}</SubsectionTitle>
        {description ? <MutedText className="mt-2">{description}</MutedText> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#475569] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            type="button"
            onClick={onConfirm}
          >
            {loading ? "삭제 중..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
