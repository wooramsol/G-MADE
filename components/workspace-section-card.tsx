import type { ReactNode } from "react";

export function WorkspaceSectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p> : null}
    </div>
  );
}

export default function WorkspaceSectionCard({
  id,
  eyebrow,
  title,
  description,
  children,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow ${className}`.trim()}
      id={id}
    >
      <WorkspaceSectionTitle eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-5">{children}</div>
    </section>
  );
}
