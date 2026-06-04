import Link from "next/link";
import HeaderActions from "./header-actions";
import SidebarBrand from "./sidebar-brand";

export default function SaasPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[#d7dee8] bg-white text-[#172033] xl:block">
          <SidebarBrand />
          <nav className="space-y-2 px-4 py-6 text-sm">
            <Link className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]" href="/">
              Dashboard
            </Link>
            <Link className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]" href="/projects">
              Project Management
            </Link>
            <div className="mt-4 border-t border-[#d7dee8] pt-4">
              <Link className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]" href="/login">
                로그인
              </Link>
              <Link className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]" href="/mypage">
                마이페이지
              </Link>
              <Link className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]" href="/settings">
                설정
              </Link>
            </div>
          </nav>
        </aside>

        <section className="flex-1">
          <header className="bg-[#15345b] px-6 py-4 text-white shadow-sm">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-100">{eyebrow}</p>
                <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
              </div>
              <HeaderActions />
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
            <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
              <p className="text-sm leading-6 text-[#64748b]">{description}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
