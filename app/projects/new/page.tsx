import { Badge, SubsectionTitle } from "@/components/typography";
import ProjectCreateForm from "./project-create-form";

export default function NewProjectPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 py-8">
        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <SubsectionTitle>프로젝트 기본정보</SubsectionTitle>
            </div>
            <Badge className="bg-[#e8f1ff] text-[#2463b3]">신규 등록</Badge>
          </div>

          <ProjectCreateForm />
        </section>
      </div>
    </main>
  );
}
