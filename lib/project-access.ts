import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { requireApiSession } from "./api-auth";
import { getProjectById } from "./project-store";
import { canAccessProject, isOfficialRole } from "./roles";
import type { Project } from "./types";

type Result =
  | { session: Session; project: Project; official: boolean; response: null }
  | { session: null; project: null; official: false; response: NextResponse };

/**
 * 프로젝트 API 공통 권한 검사 — 지원자는 자기 프로젝트만, officialOnly면 공무원만.
 * 다른 사람의 프로젝트는 존재 여부도 알리지 않도록 404로 응답.
 */
export async function requireProjectAccess(projectId: string, options: { officialOnly?: boolean } = {}): Promise<Result> {
  const auth = await requireApiSession();
  if (auth.response) return { session: null, project: null, official: false, response: auth.response };
  const user = auth.session.user;
  const official = isOfficialRole(user.role);
  if (options.officialOnly && !official) {
    return {
      session: null,
      project: null,
      official: false,
      response: NextResponse.json({ error: "공무원만 사용할 수 있는 기능입니다." }, { status: 403 }),
    };
  }
  const project = projectId ? await getProjectById(projectId) : undefined;
  if (!project || !canAccessProject(user, project)) {
    return {
      session: null,
      project: null,
      official: false,
      response: NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 }),
    };
  }
  return { session: auth.session, project, official, response: null };
}

/** 공무원 전용 API 공통 검사 (프로젝트와 무관) */
export async function requireOfficial() {
  const auth = await requireApiSession();
  if (auth.response) return auth;
  if (!isOfficialRole(auth.session.user.role)) {
    return {
      session: null,
      response: NextResponse.json({ error: "공무원만 사용할 수 있는 기능입니다." }, { status: 403 }),
    } as const;
  }
  return auth;
}
