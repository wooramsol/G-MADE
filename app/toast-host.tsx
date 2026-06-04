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

  const toneClass = toast.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-white text-[#15345b]";

  return (
    <div className="fixed right-5 top-16 z-[60] max-w-sm">
      <div className={`rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${toneClass}`}>
        {toast.message}
      </div>
    </div>
  );
}
