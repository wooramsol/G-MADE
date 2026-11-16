import Link from "next/link";
import { MutedText, PageTitle } from "@/components/typography";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/project-store";
import { canAccessProject, canEditProjectInfo, isOfficialRole, projectForViewer, projectStageStatus } from "@/lib/roles";
import DeleteProjectButton from "../delete-project-button";
import ProjectWorkflow from "./project-workflow";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectLocationEditor from "./project-location-editor";
import ProjectMetadataEditor from "./project-metadata-editor";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const found = await getProjectById(id);
  // 지원자는 자기 프로젝트만 — 남의 프로젝트는 '없음'으로 표시
  const official = isOfficialRole(session?.user?.role);
  const project = found && canAccessProject(session?.user, found) ? projectForViewer(found, official) : undefined;
  const editable = project ? canEditProjectInfo(session?.user, project) : false;

  if (!project) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-md border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>프로젝트를 찾을 수 없습니다.</PageTitle>
          <MutedText className="mt-2">요청한 프로젝트가 없거나 휴지통으로 이동했습니다.</MutedText>
          <Link className="primary-action-blue mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold" href="/projects">
            프로젝트 관리로 이동
          </Link>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 pt-8">
        <Link
          className="mb-3 inline-flex items-center gap-1 text-sm font-bold !text-[#2463b3] hover:underline"
          href="/projects"
        >
          ← {official ? "프로젝트 목록으로" : "내 심의 신청 목록으로"}
        </Link>
        {/* 사업명 + 프로젝트 개요 — 한 카드로 */}
        <div className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <PageTitle>{project.name}</PageTitle>
                <span className="rounded-[3px] border border-[#d0d5dd] bg-white px-2 py-0.5 text-xs font-semibold text-[#475569]">
                  접수 {project.receivedAt}
                </span>
                <span className="rounded-[3px] border border-[#c9d6e6] bg-white px-2 py-0.5 text-xs font-bold text-[#2463b3]">
                  {projectStageStatus(project)}
                </span>
              </div>
              {/* 사업위치 · 시행자 · 심의종류 — 사업명 아래 한 줄 */}
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <Meta label="사업위치" value={project.location} />
                <Meta label="시행자" value={project.client} />
                <Meta label="심의종류" value={project.reviewType} />
                {project.contactPhone || project.contactEmail ? (
                  <Meta label="담당자" value={[project.contactPhone, project.contactEmail].filter(Boolean).join(" · ")} />
                ) : null}
              </dl>
              {project.summary ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs font-bold text-[#475569] hover:text-[#15345b]">사업개요</summary>
                  <p className="mt-1.5 max-w-4xl whitespace-pre-wrap leading-6 text-[#172033]">{project.summary}</p>
                </details>
              ) : null}
              {editable ? (
                <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1 [&>div]:basis-full">
                  <ProjectMetadataEditor project={project} />
                  <ProjectLocationEditor project={project} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-[#94a3b8]">도서가 접수되어 기본정보는 담당 공무원만 수정할 수 있습니다.</p>
              )}
            </div>
            {official ? (
              <DeleteProjectButton projectId={project.id} projectName={project.name} redirectTo="/projects" />
            ) : null}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section id="project-management" className="space-y-5">
          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} projectId={project.id} />
          <ProjectWorkflow official={official} project={project} />
        </section>
      </div>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-[#64748b]">{label}</dt>
      <dd className="min-w-0 font-semibold text-[#172033]">{value || "-"}</dd>
    </div>
  );
}
