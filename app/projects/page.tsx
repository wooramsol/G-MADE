import Link from "next/link";
import { FormLabel, MutedText, PageTitle } from "@/components/typography";
import ProjectManagementGrid from "./project-management-grid";
import { auth } from "@/auth";
import { getAllProjects } from "@/lib/project-store";
import { canAccessProject, isOfficialRole, projectForViewer, projectStage } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ProjectManagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const official = isOfficialRole(session?.user?.role);
  // 지원자는 자기가 등록한 사업만
  const projects = (await getAllProjects())
    .filter((project) => canAccessProject(session?.user, project))
    .map((project) => projectForViewer(project, official))
    // 목록에는 분석 결과가 필요 없음 — 단계만 확정해 두고 무거운 분석 기록은 브라우저로 보내지 않음
    .map((project) => ({ ...project, stage: projectStage(project), checklistReviews: [], files: [] }));
  const params = await searchParams;
  const query = (params?.q ?? "").trim();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>{official ? "심의 프로젝트 목록" : "내 심의 신청"}</PageTitle>
          </div>
          {official ? (
            <Link
              aria-label="휴지통"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#d7dee8] bg-white text-[#475569] shadow-sm transition hover:bg-[#f8fafc] hover:text-[#15345b]"
              href="/projects/trash"
              title="휴지통"
            >
              <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="20">
                <path d="M4 7h16" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12" />
                <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
              </svg>
            </Link>
          ) : null}
        </div>

        <form action="/projects" className="rounded-md border border-[#d7dee8] bg-white p-4 panel-shadow">
          <FormLabel as="label" className="block" htmlFor="project-search">
            프로젝트 검색
          </FormLabel>
          <div className="mt-2 grid gap-3 md:grid-cols-[1fr_120px]">
            <input
              className="w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
              defaultValue={query}
              id="project-search"
              name="q"
              placeholder="사업명, 위치, 시행자, 사업유형, 심의종류를 검색하세요."
              type="search"
            />
            <button className="primary-action-blue rounded-md px-4 py-3 text-sm font-bold" type="submit">
              검색
            </button>
          </div>
          {query ? <MutedText className="mt-3 font-semibold">“{query}” 검색 결과</MutedText> : null}
        </form>

        <div className="grid items-stretch gap-5 xl:grid-cols-3">
          <ProjectManagementGrid addLabel={official ? "새 프로젝트 추가" : "새 심의 신청"} serverProjects={projects} query={query} />
        </div>
      </div>

    </main>
  );
}

