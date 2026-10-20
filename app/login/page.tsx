import Link from "next/link";
import { MutedText, PageTitle } from "@/components/typography";
import { sanitizeCallbackUrl } from "@/lib/safe-callback-url";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string; signedUp?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params?.callbackUrl);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center px-6 py-12">
        <section className="w-full rounded-md border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>로그인</PageTitle>
          <MutedText className="mt-2">공무원·지원자 계정으로 로그인하세요.</MutedText>
          {params?.signedUp ? (
            <p className="mt-4 rounded-md bg-[#ecfdf5] px-4 py-3 text-sm font-semibold text-[#047857]">
              회원가입이 완료되었습니다. 가입한 이메일로 로그인하세요.
            </p>
          ) : null}
          <div className="mt-8">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
          <p className="mt-6 border-t border-[#eceef1] pt-5 text-center text-sm text-[#475569]">
            심의를 신청하시나요?{" "}
            <Link className="font-bold !text-[#2463b3] underline" href="/signup">
              지원자 회원가입
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
