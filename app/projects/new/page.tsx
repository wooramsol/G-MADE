import Link from "next/link";
import ProjectSidebar from "../../project-sidebar";
import UploadAnalyzer from "../../upload-analyzer";
import ProjectCreateForm from "./project-create-form";
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
                <button className="primary-action rounded-lg px-4 py-2 text-sm font-semibold shadow-sm" form="new-project-form" type="submit">
                  프로젝트 생성하기
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
                    사업 등록에 필요한 기본정보를 입력합니다. 프로젝트 생성하기를 누르면 Project Management 목록과 상세 화면에 바로 반영됩니다.
                  </p>
                </div>
                <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">신규 등록</span>
              </div>

              <ProjectCreateForm />
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

function StatusBadge({ status }: { status: string }) {
  const tone = status === "작성중" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}
