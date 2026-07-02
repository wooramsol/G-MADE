"use client";

import { extractApiErrorMessage } from "@/lib/extract-api-error-message";
import type { Project } from "@/lib/types";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

export async function ensureProjectOnServer(project: Project): Promise<void> {
  const response = await clientFetchWithTimeout(`/api/projects/${project.id}/ensure`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, "프로젝트를 서버에 동기화하지 못했습니다."));
  }
}
