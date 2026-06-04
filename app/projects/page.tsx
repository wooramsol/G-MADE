import Link from "next/link";
import DeleteProjectButton from "./delete-project-button";
import { getAllProjects, isCreatedProjectId } from "@/lib/project-store";

export const dynamic = "force-dynamic";

export default async function ProjectManagementPage() {
  const projects = await getAllProjects();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Project Management</p>
            <h3 className="mt-2 text-2xl font-bold text-[#15345b]">심의 프로젝트 목록</h3>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">
              프로젝트를 클릭하면 해당 프로젝트 안에서 AI Document Analysis, Hybrid Score Engine, Explainable AI, 결과 확인 메뉴를 사용할 수 있습니다.
            </p>
          </div>
          <Link href="/projects/new" className="primary-action-blue rounded-lg px-4 py-3 text-sm font-bold shadow-sm">
            새 프로젝트 추가하기
          </Link>
        </div>

        <div className="grid gap-5 xl:grid-cols-3">
          {projects.map((project) => {
            const canDelete = isCreatedProjectId(project.id);

            return (
              <article
                className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:-translate-y-0.5 hover:border-[#2463b3]"
                key={project.id}
              >
                <Link href={`/projects/${project.id}`} className="block">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2463b3]">{project.reviewType}</p>
                      <h4 className="mt-3 text-lg font-bold leading-7 text-[#15345b]">{project.name}</h4>
                    </div>
                    <StatusBadge status={project.status} />
                  </div>
                  <dl className="mt-5 space-y-3 text-sm text-[#475569]">
                    <Info label="사업위치" value={project.location} />
                    <Info label="시행자" value={project.client} />
                    <Info label="사업유형" value={project.projectType} />
                    <Info label="접수일" value={project.receivedAt} />
                  </dl>
                  <div className="primary-action-blue mt-5 rounded-xl px-4 py-3 text-sm font-bold">
                    프로젝트 상세 평가로 이동
                  </div>
                </Link>
                {canDelete ? (
                  <div className="mt-3 border-t border-[#d7dee8] pt-3">
                    <DeleteProjectButton projectId={project.id} projectName={project.name} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3">
      <dt className="font-semibold text-[#64748b]">{label}</dt>
      <dd className="font-semibold text-[#172033]">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "완료" ? "bg-emerald-50 text-emerald-700" : status === "접수" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700";
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}
