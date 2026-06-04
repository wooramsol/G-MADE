import Link from "next/link";
import { PROJECT_NAME, projects } from "@/lib/demo-data";

export default function ProjectManagementPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#d7dee8] bg-[#15345b] text-white xl:block">
          <div className="border-b border-white/10 px-6 py-7">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">Public Review AI</p>
            <h1 className="mt-3 text-2xl font-bold leading-tight">{PROJECT_NAME}</h1>
          </div>
          <nav className="space-y-2 px-4 py-6 text-sm">
            <Link href="/" className="block rounded-lg px-4 py-3 text-blue-50 transition hover:bg-white/10">
              Dashboard
            </Link>
            <Link href="/projects" className="block rounded-lg bg-white/10 px-4 py-3 text-white">
              Project Management
            </Link>
          </nav>
        </aside>

        <section className="flex-1">
          <header className="sticky top-0 z-10 border-b border-[#d7dee8] bg-white/95 px-6 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#2463b3]">프로젝트 선택</p>
                <h2 className="mt-1 text-2xl font-bold text-[#15345b]">Project Management</h2>
              </div>
              <Link href="/" className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-semibold text-[#15345b]">
                Dashboard로 돌아가기
              </Link>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Project Management</p>
              <h3 className="mt-2 text-2xl font-bold text-[#15345b]">심의 프로젝트 목록</h3>
              <p className="mt-2 text-sm leading-6 text-[#64748b]">
                프로젝트를 클릭하면 해당 프로젝트 안에서 AI Document Analysis, Hybrid Score Engine, Explainable AI, 보고서 생성 메뉴를 사용할 수 있습니다.
              </p>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              {projects.map((project) => (
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:-translate-y-0.5 hover:border-[#2463b3]"
                  key={project.id}
                >
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
                  <div className="mt-5 rounded-xl bg-[#e8f1ff] px-4 py-3 text-sm font-bold text-[#2463b3]">
                    프로젝트 상세 평가로 이동
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
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
