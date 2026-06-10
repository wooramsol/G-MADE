export default function SaasPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div>
          <h2 className="text-2xl font-bold text-[#15345b]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
