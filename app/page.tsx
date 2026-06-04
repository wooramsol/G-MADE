import Link from "next/link";
import {
  annualStatistics,
  dashboardStats,
  hybridResults,
  projects,
  roles,
} from "@/lib/demo-data";
import SidebarBrand from "./sidebar-brand";
import { calculateProjectScore } from "@/lib/hybrid-evaluation";

export default function Dashboard() {
  const projectScore = calculateProjectScore(hybridResults);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#d7dee8] bg-[#15345b] text-white xl:block">
          <SidebarBrand />
          <nav className="space-y-2 px-4 py-6 text-sm">
            <Link href="/" className="block rounded-lg bg-white/10 px-4 py-3 text-white">
              Dashboard
            </Link>
            <Link href="/projects" className="block rounded-lg px-4 py-3 text-blue-50 transition hover:bg-white/10">
              Project Management
            </Link>
          </nav>
          <div className="mx-4 mt-8 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
            <p className="font-semibold">Dashboard</p>
            <p className="mt-2 leading-6">모든 심의 프로젝트의 현황을 확인합니다.</p>
          </div>
        </aside>

        <section className="flex-1">
          <header className="border-b border-[#d7dee8] bg-white px-6 py-4">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#2463b3]">전체 프로젝트 현황판</p>
                <h2 className="mt-1 text-2xl font-bold text-[#15345b]">Dashboard</h2>
              </div>

            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
            <section className="space-y-5">
              <SectionTitle
                eyebrow="Dashboard"
                title="전체 프로젝트 대시보드"
                description="모든 심의 프로젝트의 접수, 진행, 완료, 평균 점수를 한 화면에서 확인합니다."
              />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="접수 건수" value={dashboardStats.received.toString()} delta="전체 프로젝트 기준" />
                <MetricCard label="심사 진행중" value={dashboardStats.inReview.toString()} delta="위원 검토 대기 포함" />
                <MetricCard label="완료 건수" value={dashboardStats.completed.toString()} delta="보고서 발급 완료 포함" />
                <MetricCard label="평균 점수" value={`${projectScore}점`} delta="최근 평가 데이터 기준" />
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
              <Panel title="최근 프로젝트" action="프로젝트 선택">
                <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-[#eef4fb] text-[#15345b]">
                      <tr>
                        <th className="px-4 py-3">사업명</th>
                        <th className="px-4 py-3">심의종류</th>
                        <th className="px-4 py-3">접수일</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">이동</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#d7dee8] bg-white">
                      {projects.map((project) => (
                        <tr key={project.id}>
                          <td className="px-4 py-4 font-semibold text-[#172033]">{project.name}</td>
                          <td className="px-4 py-4 text-[#64748b]">{project.reviewType}</td>
                          <td className="px-4 py-4 text-[#64748b]">{project.receivedAt}</td>
                          <td className="px-4 py-4"><StatusBadge status={project.status} /></td>
                          <td className="px-4 py-4">
                            <Link className="font-bold text-[#2463b3]" href={`/projects/${project.id}`}>
                              상세 보기
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="사용자 권한 체계" action="역할별 접근">
                <div className="space-y-3">
                  {roles.map((role) => (
                    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={role.code}>
                      <p className="font-bold text-[#15345b]">{role.label}</p>
                      <p className="mt-1 text-sm leading-6 text-[#64748b]">{role.authority}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
              <Panel title="Project Management 진입" action="업무 시작">
                <p className="text-sm leading-6 text-[#475569]">
                  Dashboard에서는 전체 현황만 확인합니다. 개별 프로젝트의 AI Document Analysis, Hybrid Score Engine,
                  Explainable AI, 법령/사례 검색, 결과 확인은 Project Management에서 프로젝트를 선택한 뒤 진행합니다.
                </p>
                <Link className="primary-action mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold" href="/projects">
                  Project Management로 이동
                </Link>
              </Panel>

              <Panel title="연도별 평균 점수" action="통계 요약">
                <div className="space-y-4">
                  {annualStatistics.map((row) => (
                    <div className="grid gap-3 rounded-xl border border-[#d7dee8] bg-white p-4 md:grid-cols-[80px_1fr]" key={row.label}>
                      <p className="font-bold text-[#15345b]">{row.label}</p>
                      <div className="space-y-2">
                        <StatisticBar label="경관심의" value={row.landscape} />
                        <StatisticBar label="공공디자인심의" value={row.publicDesign} />
                        <StatisticBar label="경관사전심의" value={row.preliminary} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
    </div>
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

function MetricCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <p className="text-sm font-semibold text-[#64748b]">{label}</p>
      <p className="mt-3 text-3xl font-black text-[#15345b]">{value}</p>
      <p className="mt-3 text-sm text-[#2463b3]">{delta}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "완료" ? "bg-emerald-50 text-emerald-700" : status === "접수" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function StatisticBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[120px_1fr_50px] items-center gap-3 text-sm">
      <span className="font-semibold text-[#475569]">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${value}%` }} />
      </div>
      <span className="text-right font-bold text-[#15345b]">{value}</span>
    </div>
  );
}
