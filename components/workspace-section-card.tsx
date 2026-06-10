import type { ReactNode } from "react";

export function WorkspaceSectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-[#15345b]">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p> : null}
    </div>
  );
}

export default function WorkspaceSectionCard({
  id,
  title,
  description,
  children,
  className = "",
}: {
  id?: string;
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
      <WorkspaceSectionTitle title={title} description={description} />
      <div className="mt-5">{children}</div>
    </section>
  );
}
