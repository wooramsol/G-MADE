import Link from "next/link";
import { PageTitle } from "@/components/typography";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTrashedProjects } from "@/lib/project-store";
import { isOfficialRole } from "@/lib/roles";
import TrashManagement from "./trash-management";

export const dynamic = "force-dynamic";

export default async function ProjectTrashPage() {
  const session = await auth();
  if (!isOfficialRole(session?.user?.role)) redirect("/projects");
  const trashedProjects = await getTrashedProjects();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>프로젝트 휴지통</PageTitle>
          </div>
          <Link
            className="rounded-lg border border-[#d7dee8] bg-white px-4 py-3 text-sm font-bold text-[#15345b] shadow-sm transition hover:bg-[#f8fafc]"
            href="/projects"
          >
            프로젝트 관리로 돌아가기
          </Link>
        </div>

        <TrashManagement serverTrashedProjects={trashedProjects} />
      </div>
    </main>
  );
}
