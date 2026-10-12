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
  bare = false,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** 탭 안에 들어갈 때 — 카드 테두리·제목 없이 설명과 내용만 (탭 이름이 제목 역할) */
  bare?: boolean;
}) {
  if (bare) {
    return (
      <section className={`${id ? "scroll-mt-32" : ""} ${className}`.trim()} id={id} aria-label={title}>
        {description ? <p className="type-body-muted">{description}</p> : null}
        <div className={description ? "mt-5" : ""}>{children}</div>
      </section>
    );
  }
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
