"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT, TOAST_STORAGE_KEY, type ToastPayload } from "./toast";

export default function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const queuedTimeout = window.setTimeout(() => {
      const queued = window.sessionStorage.getItem(TOAST_STORAGE_KEY);
      if (queued) {
        window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
        setToast(JSON.parse(queued));
      }
    }, 0);

    const onToast = (event: Event) => {
      setToast((event as CustomEvent<ToastPayload>).detail);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.clearTimeout(queuedTimeout);
      window.removeEventListener(TOAST_EVENT, onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;

  const toneClass = toast.tone === "error"
    ? "border-red-200 bg-red-50/90 text-red-800"
    : "border-blue-200 bg-white/85 text-[#15345b]";

  return (
    <div className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2">
      <div className={`rounded-3xl border px-6 py-4 text-center text-sm font-bold shadow-2xl backdrop-blur-md ${toneClass}`}>
        {toast.message}
      </div>
    </div>
  );
}
