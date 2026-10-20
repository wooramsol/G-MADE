import Link from "next/link";
import { FormLabel, MutedText, PageTitle, SectionDescription } from "@/components/typography";
import ProjectManagementGrid from "./project-management-grid";
import { auth } from "@/auth";
import { getAllProjects } from "@/lib/project-store";
import { canAccessProject, isOfficialRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ProjectManagementPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const official = isOfficialRole(session?.user?.role);
  // 지원자는 자기가 등록한 사업만
  const projects = (await getAllProjects()).filter((project) => canAccessProject(session?.user, project));
  const params = await searchParams;
  const query = (params?.q ?? "").trim();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>{official ? "심의 프로젝트 목록" : "내 심의 신청"}</PageTitle>
            <SectionDescription>
              {official
                ? "도서접수 → 사전심의 → 본심의 순서로 진행합니다. 프로젝트를 선택해 단계별 작업을 진행하세요."
                : "사업을 등록하고 심의 도서를 접수하세요. 사전심의에서 보완 요청을 받으면 보완 도서를 다시 제출할 수 있습니다."}
            </SectionDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            {official ? (
              <Link
                className="rounded-lg border border-[#d7dee8] bg-white px-4 py-3 text-sm font-bold text-[#15345b] shadow-sm transition hover:bg-[#f8fafc]"
                href="/projects/trash"
              >
                휴지통
              </Link>
            ) : null}
            <Link href="/projects/new" className="primary-action-blue rounded-lg px-4 py-3 text-sm font-bold shadow-sm">
              {official ? "새 프로젝트 추가하기" : "새 심의 신청"}
            </Link>
          </div>
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
          <ProjectManagementGrid serverProjects={projects} query={query} />
        </div>
      </div>

    </main>
  );
}

