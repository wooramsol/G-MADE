import { Eyebrow, PageTitle } from "@/components/typography";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { getProjectById } from "@/lib/project-store";
import CompleteEvaluationButton from "../complete-evaluation-button";
import DeleteProjectButton from "../delete-project-button";
import ProjectUploadSection from "./project-upload-section";
import LocalProjectDetail from "./local-project-detail";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectOverviewPanel from "./project-overview-panel";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return <LocalProjectDetail projectId={id} />;
  }
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 pt-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>사업명</Eyebrow>
                <EvaluationStatusBadge project={project} />
              </div>
              <PageTitle className="mt-2">{project.name}</PageTitle>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <DeleteProjectButton projectId={project.id} projectName={project.name} redirectTo="/projects" />
              <CompleteEvaluationButton project={project} />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section id="project-management" className="space-y-5">
          <ProjectOverviewPanel badgeLabel="프로젝트 정보" project={project} />
          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} />
          <ProjectUploadSection project={project} />
        </section>
      </div>
    </main>
  );
}
