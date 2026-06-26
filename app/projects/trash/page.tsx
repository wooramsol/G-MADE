import Link from "next/link";
import { MutedText, PageTitle, SectionDescription } from "@/components/typography";
import { getTrashedProjects } from "@/lib/project-store";
import TrashManagement from "./trash-management";

export const dynamic = "force-dynamic";

export default async function ProjectTrashPage() {
  const trashedProjects = await getTrashedProjects();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>프로젝트 휴지통</PageTitle>
            <SectionDescription>
              삭제한 프로젝트와 평가 기록이 여기에 보관됩니다. 복원하거나 영구 삭제할 수 있습니다.
            </SectionDescription>
            <MutedText className="mt-2">
              프로젝트를 삭제하면 목록에서 숨겨지며, 평가만 삭제한 경우 해당 프로젝트 상세 화면 하단에서 복원할 수
              있습니다.
            </MutedText>
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
