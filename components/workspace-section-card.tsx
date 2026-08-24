import type { ReactNode } from "react";
import { SectionDescription, SectionTitle } from "@/components/typography";

export function WorkspaceSectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {description ? <SectionDescription>{description}</SectionDescription> : null}
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
      className={`rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow ${id ? "scroll-mt-32" : ""} ${className}`.trim()}
      id={id}
    >
      <WorkspaceSectionTitle title={title} description={description} />
      <div className="mt-5">{children}</div>
    </section>
  );
}
