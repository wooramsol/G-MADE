import { SectionDescription, SubsectionTitle } from "@/components/typography";
import ProjectCreateForm from "./project-create-form";

export default function NewProjectPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <section className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <SubsectionTitle>프로젝트 기본정보</SubsectionTitle>
              <SectionDescription>
                사업 등록에 필요한 기본정보만 입력합니다. 생성 후 프로젝트 상세 화면에서 평가기준 설정과 AI·전문가
                자료 업로드, 하이브리드 평가 분석을 진행할 수 있습니다.
              </SectionDescription>
            </div>
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">신규 등록</span>
          </div>

          <ProjectCreateForm />
        </section>
      </div>
    </main>
  );
}
