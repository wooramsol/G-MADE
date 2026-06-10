import Link from "next/link";
import ProjectManagementGrid from "./project-management-grid";
import { getAllProjects } from "@/lib/project-store";

export const dynamic = "force-dynamic";

export default async function ProjectManagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const projects = await getAllProjects();
  const params = await searchParams;
  const query = (params?.q ?? "").trim();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Project Management</p>
            <h3 className="mt-2 text-2xl font-bold text-[#15345b]">심의 프로젝트 목록</h3>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">
              프로젝트를 선택하면 평가항목·배점 설정, AI·전문가 자료 업로드, 하이브리드 평가 분석과 통합 평가 결과
              확인을 한 화면에서 진행할 수 있습니다.
            </p>
          </div>
          <Link href="/projects/new" className="primary-action-blue rounded-lg px-4 py-3 text-sm font-bold shadow-sm">
            새 프로젝트 추가하기
          </Link>
        </div>

        <form action="/projects" className="rounded-2xl border border-[#d7dee8] bg-white p-4 panel-shadow">
          <label className="block text-sm font-bold text-[#15345b]" htmlFor="project-search">
            프로젝트 검색
          </label>
          <div className="mt-2 grid gap-3 md:grid-cols-[1fr_120px]">
            <input
              className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
              defaultValue={query}
              id="project-search"
              name="q"
              placeholder="사업명, 위치, 시행자, 사업유형, 심의종류를 검색하세요."
              type="search"
            />
            <button className="primary-action-blue rounded-xl px-4 py-3 text-sm font-bold" type="submit">
              검색
            </button>
          </div>
          {query ? <p className="mt-3 text-sm font-semibold text-[#64748b]">“{query}” 검색 결과</p> : null}
        </form>

        <div className="grid gap-5 xl:grid-cols-3">
          <ProjectManagementGrid serverProjects={projects} query={query} />
        </div>
      </div>

    </main>
  );
}

