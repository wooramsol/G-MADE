import { MutedText, PageTitle } from "@/components/typography";
import { sanitizeCallbackUrl } from "@/lib/safe-callback-url";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params?.callbackUrl);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center px-6 py-12">
        <section className="w-full rounded-md border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>내부 로그인</PageTitle>
          <MutedText className="mt-2">
            G-MADE HIVE 내부 테스트용 로그인입니다. 프로젝트 데이터는 로그인한 모든 사용자가 공유합니다.
          </MutedText>
          <div className="mt-8">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </section>
      </div>
    </main>
  );
}
