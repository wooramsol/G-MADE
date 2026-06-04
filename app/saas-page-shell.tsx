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
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
