import { Badge, Eyebrow, PageTitle, SubsectionTitle } from "@/components/typography";
import { getProjectById, isCreatedProjectId } from "@/lib/project-store";
import DeleteProjectButton from "../delete-project-button";
import ProjectUploadSection from "./project-upload-section";
import LocalProjectDetail from "./local-project-detail";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectLocationEditor from "./project-location-editor";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return <LocalProjectDetail projectId={id} />;
  }
  const canDelete = isCreatedProjectId(project.id);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 pt-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow>사업명</Eyebrow>
              <PageTitle className="mt-2">{project.name}</PageTitle>
            </div>
            {canDelete ? <DeleteProjectButton projectId={project.id} projectName={project.name} redirectTo="/projects" /> : null}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section id="project-management" className="space-y-5">
          <Panel title="프로젝트 개요" action="프로젝트 정보">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="사업명" value={project.name} />
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
                <Eyebrow>사업위치</Eyebrow>
                <p className="mt-2 font-semibold leading-6 text-[#172033]">{project.location}</p>
                <ProjectLocationEditor project={project} />
              </div>
              <Info label="시행자" value={project.client} />
              <Info label="설계자" value={project.designer} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="규모" value={project.scale} />
              <Info label="심의종류" value={project.reviewType} />
              <Info label="접수일" value={project.receivedAt} />
            </div>
          </Panel>
          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} />
          <ProjectUploadSection project={project} />
        </section>
      </div>
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <SubsectionTitle>{title}</SubsectionTitle>
        {action ? <Badge className="bg-[#e8f1ff] text-[#2463b3]">{action}</Badge> : null}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}
