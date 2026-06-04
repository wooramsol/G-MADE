import Link from "next/link";
import ProjectSidebar from "../../project-sidebar";
import UploadAnalyzer from "../../upload-analyzer";

const reviewTypes = ["경관사전심의", "경관심의", "공공디자인심의"];
const projectTypes = ["복합문화시설", "공공공간", "생활SOC", "업무시설", "공동주택", "기반시설"];
const initialUploadHistory = [
  { fileName: "신규사업_등록양식.docx", fileType: "DOCX", status: "작성중", uploadedAt: "임시저장 전" },
  { fileName: "관련자료는 아래 업로드 분석 영역에서 추가", fileType: "PDF/DOCX/PPTX/JPG/PNG/DWG/ZIP", status: "대기", uploadedAt: "미등록" },
];

export default function NewProjectPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <ProjectSidebar context="new" />

        <section className="flex-1">
          <header className="sticky top-0 z-10 border-b border-[#d7dee8] bg-white/95 px-6 py-4 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#2463b3]">Project Management</p>
                <h2 className="mt-1 text-2xl font-bold text-[#15345b]">새 프로젝트 추가하기</h2>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/projects" className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-semibold text-[#15345b]">
                  목록으로 돌아가기
                </Link>
                <button className="rounded-lg bg-[#15345b] px-4 py-2 text-sm font-semibold text-white shadow-sm" type="button">
                  프로젝트 임시저장
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
            <section className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Basic Information</p>
                  <h3 className="mt-2 text-xl font-bold text-[#15345b]">프로젝트 기본정보</h3>
                  <p className="mt-2 text-sm leading-6 text-[#64748b]">
                    사업 등록에 필요한 기본정보를 입력합니다. 저장 기능은 실제 DB 연결 후 활성화되며, 현재는 입력 화면과 업로드 분석 흐름을 확인할 수 있습니다.
                  </p>
                </div>
                <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">신규 등록</span>
              </div>

              <form className="grid gap-4 lg:grid-cols-2">
                <Field label="사업명" placeholder="예: 동부역세권 복합문화시설 경관사전심의" />
                <Field label="사업위치" placeholder="예: 서울특별시 중구 세종대로 일원" />
                <Field label="시행자" placeholder="예: 서울도시개발공사" />
                <Field label="설계자" placeholder="예: GMA 도시건축사사무소" />
                <SelectField label="사업유형" options={projectTypes} />
                <SelectField label="심의종류" options={reviewTypes} />
                <Field label="규모" placeholder="예: 지하 4층 / 지상 18층, 연면적 42,600㎡" />
                <Field label="접수일" placeholder="예: 2026-06-04" type="date" />
                <label className="lg:col-span-2">
                  <span className="text-sm font-bold text-[#15345b]">사업개요</span>
                  <textarea
                    className="mt-2 min-h-28 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
                    placeholder="사업 목적, 주변 현황, 심의 요청사항을 입력하세요."
                  />
                </label>
              </form>
            </section>

            <section className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
              <div className="mb-5">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Attachments</p>
                <h3 className="mt-2 text-xl font-bold text-[#15345b]">관련자료 첨부 및 AI 자동 분석</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">
                  신규 프로젝트 생성 시점에도 관련자료를 첨부할 수 있습니다. 이후 프로젝트 상세 화면의 “프로젝트 자료 업로드 및 AI 자동 분석” 영역에서 추가 자료를 계속 업로드할 수 있습니다.
                </p>
              </div>
              <UploadAnalyzer />
            </section>

            <section className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Upload History</p>
                  <h3 className="mt-2 text-xl font-bold text-[#15345b]">업로드 히스토리</h3>
                </div>
                <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">등록 준비</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-[#eef4fb] text-[#15345b]">
                    <tr>
                      <th className="px-4 py-3">파일명</th>
                      <th className="px-4 py-3">형식</th>
                      <th className="px-4 py-3">상태</th>
                      <th className="px-4 py-3">등록시점</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d7dee8] bg-white">
                    {initialUploadHistory.map((file) => (
                      <tr key={file.fileName}>
                        <td className="px-4 py-4 font-semibold text-[#15345b]">{file.fileName}</td>
                        <td className="px-4 py-4 text-[#64748b]">{file.fileType}</td>
                        <td className="px-4 py-4"><StatusBadge status={file.status} /></td>
                        <td className="px-4 py-4 text-[#64748b]">{file.uploadedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <label>
      <span className="text-sm font-bold text-[#15345b]">{label}</span>
      <input
        className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function SelectField({ label, options }: { label: string; options: string[] }) {
  return (
    <label>
      <span className="text-sm font-bold text-[#15345b]">{label}</span>
      <select className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white">
        <option value="">선택</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "작성중" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}
