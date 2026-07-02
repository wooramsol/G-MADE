"use client";

import { useEffect } from "react";

const LEGACY_STORAGE_KEY = "gmadehive.localProjects";

/** 브라우저 localStorage에 남은 레거시 프로젝트 캐시를 제거합니다. */
export default function ClearLegacyLocalProjects() {
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // private mode / quota
    }
  }, []);

  return null;
}
