"use client";

export const TOAST_EVENT = "gmadehive:toast";

export type ToastPayload = {
  message: string;
  tone?: "success" | "info" | "error";
};

export function showToast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}
