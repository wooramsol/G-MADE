import { getProjectRecordById, upsertProjectRecord } from "@/lib/project-store";
import { projectFromClientSnapshot } from "@/lib/safe-project-snapshot";
import type { Project } from "@/lib/types";

/** 서버 JSON 저장소에 프로젝트가 없으면 클라이언트 스냅샷으로 생성합니다. */
export async function ensureProjectRecordFromSnapshot(snapshot: Project): Promise<Project> {
  const existing = await getProjectRecordById(snapshot.id);
  if (existing) return existing;

  return upsertProjectRecord(projectFromClientSnapshot(snapshot));
}
