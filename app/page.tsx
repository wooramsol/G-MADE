import {
  annualStatistics,
  caseStudies,
  dashboardStats,
  evaluationItems,
  extractedDocumentSections,
  guidelines,
  hybridResults,
  hybridSettings,
  laws,
  PROJECT_NAME,
  projects,
  roles,
} from "@/lib/demo-data";
import { calculateProjectScore } from "@/lib/hybrid-evaluation";
import type { HybridResult } from "@/lib/types";

const supportedFiles = ["PDF", "DOCX", "PPTX", "JPG", "PNG", "DWG", "ZIP"];
const weightPresets = [
  { ai: 20, human: 80 },
  { ai: 30, human: 70 },
  { ai: 50, human: 50 },
  { ai: 0, human: 100 },
  { ai: 100, human: 0 },
];

export default function Home() {
  const project = projects[0];
  const projectScore = calculateProjectScore(hybridResults);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#d7dee8] bg-[#15345b] text-white xl:block">
          <div className="border-b border-white/10 px-6 py-7">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">Public Review AI</p>
            <h1 className="mt-3 text-2xl font-bold leading-tight">{PROJECT_NAME}</h1>
          </div>
          <nav className="space-y-2 px-4 py-6 text-sm">
            {[
              "Dashboard",
              "Project Management",
              "AI Document Analysis",
              "Hybrid Score Engine",
              "Explainable AI",
              "Laws & Case Search",
              "Reports & Statistics",
              "Admin Settings",
            ].map((item) => (
              <a
                href={`#${item.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}`}
                className="block rounded-lg px-4 py-3 text-blue-50 transition hover:bg-white/10"
                key={item}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="mx-4 mt-8 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
            <p className="font-semibold">핵심 원칙</p>
            <p className="mt-2 leading-6">AI는 심사를 대체하지 않고, 인간 심사위원의 최종판단을 지원합니다.</p>
          </div>
        </aside>

        <section className="flex-1">
          <header className="sticky top-0 z-10 border-b border-[#d7dee8] bg-white/95 px-6 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#2463b3]">경관사전심의 지원을 위한 AI 기반 하이브리드 평가 플랫폼</p>
                <h2 className="mt-1 text-2xl font-bold text-[#15345b]">{PROJECT_NAME}</h2>
              </div>
              <div className="hidden items-center gap-3 lg:flex">
                <Badge tone="blue">AI {hybridSettings.aiWeight}%</Badge>
                <Badge tone="gray">인간 {hybridSettings.humanWeight}%</Badge>
                <button className="rounded-lg bg-[#15345b] px-4 py-2 text-sm font-semibold text-white shadow-sm">
                  보고서 생성
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
            <section id="dashboard" className="space-y-5">
              <SectionTitle eyebrow="Dashboard" title="메인 현황판" description="접수, 진행, 완료, 평균 점수를 한 화면에서 확인합니다." />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="접수 건수" value={dashboardStats.received.toString()} delta="전월 대비 +12%" />
                <MetricCard label="심사 진행중" value={dashboardStats.inReview.toString()} delta="위원 검토 9건 대기" />
                <MetricCard label="완료 건수" value={dashboardStats.completed.toString()} delta="보고서 발급 21건" />
                <MetricCard label="평균 점수" value={`${dashboardStats.averageScore}점`} delta="최근 12개월 기준" />
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
                <Panel title="최근 프로젝트" action="전체 보기">
                  <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-[#eef4fb] text-[#15345b]">
                        <tr>
                          <th className="px-4 py-3">사업명</th>
                          <th className="px-4 py-3">심의종류</th>
                          <th className="px-4 py-3">접수일</th>
                          <th className="px-4 py-3">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#d7dee8] bg-white">
                        {projects.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-4 font-semibold text-[#172033]">{item.name}</td>
                            <td className="px-4 py-4 text-[#64748b]">{item.reviewType}</td>
                            <td className="px-4 py-4 text-[#64748b]">{item.receivedAt}</td>
                            <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
                <Panel title="사용자 권한 체계" action="권한 관리">
                  <div className="space-y-3">
                    {roles.map((role) => (
                      <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={role.code}>
                        <p className="font-bold text-[#15345b]">{role.label}</p>
                        <p className="mt-1 text-sm leading-6 text-[#64748b]">{role.authority}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </section>

            <section id="project-management" className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Project Management" action="사업 등록">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <Info label="사업명" value={project.name} />
                  <Info label="사업위치" value={project.location} />
                  <Info label="시행자" value={project.client} />
                  <Info label="설계자" value={project.designer} />
                  <Info label="사업유형" value={project.projectType} />
                  <Info label="규모" value={project.scale} />
                  <Info label="심의종류" value={project.reviewType} />
                  <Info label="접수일" value={project.receivedAt} />
                </div>
              </Panel>
              <Panel title="자료 업로드 및 AI 자동 분석" action="파일 추가">
                <div className="mb-4 flex flex-wrap gap-2">
                  {supportedFiles.map((file) => <Badge tone="gray" key={file}>{file}</Badge>)}
                </div>
                <div className="space-y-3">
                  {project.files.map((file) => (
                    <div className="flex items-center justify-between rounded-xl border border-[#d7dee8] bg-white p-4" key={file.id}>
                      <div>
                        <p className="font-semibold text-[#172033]">{file.fileName}</p>
                        <p className="text-sm text-[#64748b]">{file.fileType} · S3 호환 저장소 연결 구조</p>
                      </div>
                      <Badge tone="blue">{file.analysisStatus}</Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section id="ai-document-analysis">
              <SectionTitle eyebrow="AI Document Analysis" title="업로드 자료 자동 추출" description="도면과 문서에서 평가에 필요한 항목을 추출하고 신뢰도를 기록합니다." />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {extractedDocumentSections.map((section) => (
                  <div className="rounded-2xl border border-[#d7dee8] bg-white p-4 panel-shadow" key={section.label}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-[#15345b]">{section.label}</p>
                      <span className="text-sm font-bold text-[#2463b3]">{section.confidence}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                      <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${section.confidence}%` }} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#64748b]">{section.summary}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="hybrid-score-engine">
              <SectionTitle eyebrow="Hybrid Score Engine" title="AI 평가와 인간 평가의 종합 산출" description="관리자가 설정한 AI/인간 가중치를 기준으로 최종점수를 자동 계산합니다." />
              <div className="mt-5 grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
                <Panel title="현재 가중치 설정" action="관리자 설정">
                  <div className="space-y-5">
                    <WeightBar label="AI 평가" value={hybridSettings.aiWeight} color="#2463b3" />
                    <WeightBar label="인간 심사위원 평가" value={hybridSettings.humanWeight} color="#15345b" />
                    <div className="rounded-xl bg-[#eef4fb] p-4 text-sm leading-6 text-[#15345b]">
                      최종점수 = (AI평가 × AI가중치) + (인간평가 × 인간가중치). AI 0%부터 100%까지 설정할 수 있으며 최종 결정권자는 인간 심사위원입니다.
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {weightPresets.map((preset) => (
                        <div className="rounded-lg border border-[#d7dee8] bg-white px-3 py-2 text-sm" key={`${preset.ai}-${preset.human}`}>
                          AI {preset.ai}% · 인간 {preset.human}%
                        </div>
                      ))}
                    </div>
                  </div>
                </Panel>
                <Panel title={`종합 점수 ${projectScore}점`} action="평가표 내보내기">
                  <EvaluationTable results={hybridResults} />
                </Panel>
              </div>
            </section>

            <section id="explainable-ai">
              <SectionTitle eyebrow="Explainable AI" title="점수 산정 근거 추적" description="모든 AI 점수는 왜 해당 점수가 산출되었는지 근거, 법령, 유사사례와 함께 표시됩니다." />
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                {hybridResults.slice(0, 4).map((result) => (
                  <Panel title={result.item.detailItem} action={`${result.aiEvaluation.score}점 · ${result.aiEvaluation.grade}`} key={result.item.id}>
                    <p className="text-sm leading-6 text-[#475569]">{result.aiEvaluation.rationale}</p>
                    <div className="mt-4 space-y-3">
                      {result.aiEvaluation.scoreTrace.map((trace) => (
                        <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={trace.label}>
                          <div className="flex items-center justify-between text-sm font-semibold">
                            <span>{trace.label}</span>
                            <span>{trace.weight}% · {trace.score}점</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#64748b]">{trace.evidence}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 rounded-xl bg-[#fff7ed] p-3 text-sm leading-6 text-[#9a3412]">개선권고사항: {result.aiEvaluation.recommendation}</p>
                  </Panel>
                ))}
              </div>
            </section>

            <section id="laws-and-case-search" className="grid gap-5 xl:grid-cols-3">
              <Panel title="관련 법령 자동 연결" action="법령 DB">
                <div className="space-y-3">
                  {laws.slice(0, 5).map((law) => (
                    <ReferenceCard title={`${law.title} ${law.article}`} subtitle={law.jurisdiction} body={law.summary} key={law.id} />
                  ))}
                </div>
              </Panel>
              <Panel title="관련 지침 자동 연결" action="지침 관리">
                <div className="space-y-3">
                  {guidelines.slice(0, 5).map((guide) => (
                    <ReferenceCard title={guide.title} subtitle={`Section ${guide.section}`} body={guide.summary} key={guide.id} />
                  ))}
                </div>
              </Panel>
              <Panel title="유사사례 검색" action="사례 추천">
                <div className="space-y-3">
                  {caseStudies.map((item) => (
                    <ReferenceCard
                      title={item.title}
                      subtitle={`${item.location} · 유사도 ${item.similarityScore}%`}
                      body={item.keyLearning}
                      key={item.id}
                    />
                  ))}
                </div>
              </Panel>
            </section>

            <section id="reports-and-statistics" className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <Panel title="보고서 생성 구성" action="PDF 생성">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    "사업개요",
                    "평가표",
                    "종합점수",
                    "AI 의견",
                    "심사위원 의견",
                    "최종결론",
                    "개선사항",
                    "법령 및 지침 근거",
                  ].map((item) => (
                    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 font-semibold text-[#15345b]" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="통계 분석" action="통계 상세">
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

            <section id="admin-settings">
              <SectionTitle eyebrow="Admin Settings" title="DB 기반 평가항목 관리" description="대분류, 중분류, 세부항목, 배점, 설명, 평가기준은 코드 고정값이 아니라 DB 레코드로 관리되도록 설계했습니다." />
              <div className="mt-5">
                <Panel title="평가항목 카탈로그" action="항목 추가">
                  <div className="overflow-auto rounded-xl border border-[#d7dee8]">
                    <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                      <thead className="bg-[#15345b] text-white">
                        <tr>
                          <th className="px-4 py-3">대분류</th>
                          <th className="px-4 py-3">중분류</th>
                          <th className="px-4 py-3">세부항목</th>
                          <th className="px-4 py-3">배점</th>
                          <th className="px-4 py-3">평가기준</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#d7dee8] bg-white">
                        {evaluationItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-4 font-semibold text-[#15345b]">{item.majorCategory}</td>
                            <td className="px-4 py-4 text-[#475569]">{item.middleCategory}</td>
                            <td className="px-4 py-4 font-semibold">{item.detailItem}</td>
                            <td className="px-4 py-4">{item.points}</td>
                            <td className="px-4 py-4 leading-6 text-[#64748b]">{item.criteria}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </div>
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

function Badge({ children, tone }: { children: React.ReactNode; tone: "blue" | "gray" }) {
  const toneClass = tone === "blue" ? "bg-[#e8f1ff] text-[#2463b3]" : "bg-[#eef2f7] text-[#475569]";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${toneClass}`}>{children}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "완료" ? "bg-emerald-50 text-emerald-700" : status === "접수" ? "bg-slate-100 text-slate-700" : "bg-blue-50 text-blue-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}

function WeightBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm font-bold text-[#15345b]">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function EvaluationTable({ results }: { results: HybridResult[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-[#d7dee8]">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-4 py-3">평가항목</th>
            <th className="px-4 py-3">AI 점수</th>
            <th className="px-4 py-3">인간 점수</th>
            <th className="px-4 py-3">최종 점수</th>
            <th className="px-4 py-3">평가 근거 / 개선 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result) => (
            <tr key={result.item.id}>
              <td className="px-4 py-4">
                <p className="font-bold text-[#15345b]">{result.item.detailItem}</p>
                <p className="mt-1 text-xs text-[#64748b]">{result.item.majorCategory} · {result.item.middleCategory} · {result.item.points}점</p>
              </td>
              <td className="px-4 py-4 font-bold text-[#2463b3]">{result.aiEvaluation.score}</td>
              <td className="px-4 py-4 font-bold text-[#15345b]">{result.humanEvaluation.score}</td>
              <td className="px-4 py-4">
                <p className="text-lg font-black text-[#15345b]">{result.finalScore}</p>
                <p className="text-xs text-[#64748b]">{result.finalGrade}</p>
              </td>
              <td className="px-4 py-4 leading-6 text-[#64748b]">
                <p>{result.aiEvaluation.rationale}</p>
                <p className="mt-2 font-semibold text-[#9a3412]">{result.aiEvaluation.recommendation}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferenceCard({ title, subtitle, body }: { title: string; subtitle: string; body: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <p className="font-bold text-[#15345b]">{title}</p>
      <p className="mt-1 text-xs font-semibold text-[#2463b3]">{subtitle}</p>
      <p className="mt-2 text-sm leading-6 text-[#64748b]">{body}</p>
    </div>
  );
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
