import { getProjectById, isCreatedProjectId } from "@/lib/project-store";
import DeleteProjectButton from "../delete-project-button";
import ProjectUploadSection from "./project-upload-section";
import LocalProjectDetail from "./local-project-detail";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectLocationEditor from "./project-location-editor";

const supportedFiles = ["PDF", "DOCX", "PPTX", "JPG", "PNG", "DWG", "ZIP"];
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
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">프로젝트 상세 평가 워크스페이스</p>
              <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{project.name}</h2>
            </div>
            {canDelete ? <DeleteProjectButton projectId={project.id} projectName={project.name} redirectTo="/projects" /> : null}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section id="project-management" className="space-y-5">
          <Panel title="Project Overview" action="프로젝트 정보">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="사업명" value={project.name} />
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]">사업위치</p>
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
          <Panel title="AI · 전문가 병행 평가" action="자료 업로드">
            <p className="mb-4 text-sm leading-6 text-[#64748b]">
              프로젝트 자료는 AI가 자동 분석하고, 심사위원·전문가 평가 자료는 별도로 업로드하여 항목별 점수를
              등록합니다. 두 평가 결과를 가중 합산해 종합 점수를 산출합니다.
            </p>
            <div className="mb-5 flex flex-wrap gap-2">
              {supportedFiles.map((file) => (
                <Badge tone="gray" key={file}>
                  {file}
                </Badge>
              ))}
              <Badge tone="gray">XLSX</Badge>
              <Badge tone="gray">HWP</Badge>
            </div>
            {project.files.length > 0 ? (
              <div className="mb-5 space-y-3">
                {project.files.map((file) => (
                  <div
                    className="flex items-center justify-between rounded-xl border border-[#d7dee8] bg-white p-4"
                    key={file.id}
                  >
                    <div>
                      <p className="font-semibold text-[#172033]">{file.fileName}</p>
                      <p className="text-sm text-[#64748b]">{file.fileType} · S3 호환 저장소 연결 구조</p>
                    </div>
                    <Badge tone="blue">{file.analysisStatus}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
            <ProjectUploadSection project={project} />
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-[#15345b]">{title}</h3>
        {action ? <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{action}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "blue" | "gray" }) {
  const toneClass = tone === "blue" ? "bg-[#e8f1ff] text-[#2463b3]" : "bg-[#eef2f7] text-[#475569]";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}
