import { PageTitle, SectionDescription } from "@/components/typography";

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
          <PageTitle>{title}</PageTitle>
          <SectionDescription>{description}</SectionDescription>
        </div>
        {children}
      </div>
    </main>
  );
}
