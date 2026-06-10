import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl?.startsWith("/") ? params.callbackUrl : "/";

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-md items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <h1 className="text-2xl font-bold text-[#15345b]">내부 로그인</h1>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">
            G-MADE HIVE 내부 테스트용 로그인입니다. 프로젝트 데이터는 로그인한 모든 사용자가 공유합니다.
          </p>
          <div className="mt-8">
            <LoginForm callbackUrl={callbackUrl} />
          </div>
        </section>
      </div>
    </main>
  );
}
