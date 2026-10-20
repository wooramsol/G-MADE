import { MutedText, PageTitle } from "@/components/typography";
import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center px-6 py-12">
        <section className="w-full rounded-md border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>지원자 회원가입</PageTitle>
          <MutedText className="mt-2">
            심의를 신청하는 사업자·설계자용 계정입니다. 가입 후 사업을 등록하고 심의 도서를 접수할 수 있습니다.
            공무원 계정은 관리자에게 발급받으세요.
          </MutedText>
          <div className="mt-8">
            <SignupForm />
          </div>
        </section>
      </div>
    </main>
  );
}
