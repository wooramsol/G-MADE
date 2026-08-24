"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT, type ToastPayload } from "./toast";

const toneClassName: Record<NonNullable<ToastPayload["tone"]>, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  info: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-950",
};

export default function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      setToast((event as CustomEvent<ToastPayload>).detail);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  const tone = toast.tone ?? "success";

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] w-[min(92vw,420px)] -translate-x-1/2">
      <div
        aria-live="polite"
        className={`rounded-md border px-5 py-4 text-center text-sm font-semibold leading-6 shadow-lg ${toneClassName[tone]}`}
        role="status"
      >
        {toast.message}
      </div>
    </div>
  );
}
