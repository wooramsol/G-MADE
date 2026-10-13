import { getProjectById, setProjectExpertMemos } from "./project-store";
import { isR2Configured, r2DeleteObject, r2GetObject, r2ListKeys, r2PutObject } from "./r2-storage";
import type { ExpertMemo } from "./types";

/**
 * 전문가 메모 저장소 — 메모 1건 = R2 객체 1개.
 * 프로젝트 전체 JSON에 넣으면 메모 두 개를 연달아 저장할 때 서로 다른 서버가 동시에
 * 프로젝트를 읽고 써서 앞의 메모가 사라졌다(덮어쓰기). 메모마다 따로 저장해 충돌을 없앤다.
 * R2가 없으면(로컬 개발) 프로젝트 JSON에 저장.
 */

const prefixOf = (projectId: string) => `expert-memos/${projectId}/`;
const keyOf = (projectId: string, memoId: string) => `${prefixOf(projectId)}${memoId}.json`;

async function putMemo(projectId: string, memo: ExpertMemo) {
  await r2PutObject(keyOf(projectId, memo.id), Buffer.from(JSON.stringify(memo), "utf8"), "application/json");
}

/** 과거 프로젝트 JSON에 저장된 메모를 R2로 옮김 (1회) */
async function migrateLegacy(projectId: string, legacy: ExpertMemo[]) {
  if (legacy.length === 0) return;
  await Promise.all(legacy.map((memo) => putMemo(projectId, memo)));
  await setProjectExpertMemos(projectId, []);
}

export async function listExpertMemos(projectId: string): Promise<ExpertMemo[]> {
  const project = await getProjectById(projectId);
  const legacy = project?.expertMemos ?? [];
  if (!isR2Configured()) return legacy;

  if (legacy.length > 0) {
    try {
      await migrateLegacy(projectId, legacy);
    } catch (error) {
      console.warn("[expert-memos] 이전 메모 이관 실패", error instanceof Error ? error.message : error);
    }
  }

  const keys = await r2ListKeys(prefixOf(projectId));
  const loaded = await Promise.all(
    keys.map(async (key) => {
      const bytes = await r2GetObject(key);
      if (!bytes) return null;
      try {
        return JSON.parse(bytes.toString("utf8")) as ExpertMemo;
      } catch {
        return null;
      }
    }),
  );
  const byId = new Map<string, ExpertMemo>();
  for (const memo of legacy) byId.set(memo.id, memo);
  for (const memo of loaded) if (memo) byId.set(memo.id, memo);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getExpertMemo(projectId: string, memoId: string): Promise<ExpertMemo | null> {
  if (isR2Configured()) {
    const bytes = await r2GetObject(keyOf(projectId, memoId));
    if (bytes) return JSON.parse(bytes.toString("utf8")) as ExpertMemo;
  }
  const project = await getProjectById(projectId);
  return (project?.expertMemos ?? []).find((memo) => memo.id === memoId) ?? null;
}

export async function saveExpertMemo(projectId: string, memo: ExpertMemo): Promise<void> {
  if (isR2Configured()) {
    await putMemo(projectId, memo);
    return;
  }
  const project = await getProjectById(projectId);
  const others = (project?.expertMemos ?? []).filter((entry) => entry.id !== memo.id);
  await setProjectExpertMemos(projectId, [...others, memo]);
}

export async function deleteExpertMemo(projectId: string, memoId: string): Promise<void> {
  if (isR2Configured()) {
    await r2DeleteObject(keyOf(projectId, memoId));
  }
  const project = await getProjectById(projectId);
  if ((project?.expertMemos ?? []).some((memo) => memo.id === memoId)) {
    await setProjectExpertMemos(
      projectId,
      (project?.expertMemos ?? []).filter((memo) => memo.id !== memoId),
    );
  }
}
