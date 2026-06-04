"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SidebarBrand from "./sidebar-brand";

const projectSubMenus = [
  { label: "Project Overview", href: "#project-management" },
  { label: "AI Document Analysis", href: "#ai-document-analysis" },
  { label: "Hybrid Score Engine", href: "#hybrid-score-engine" },
  { label: "Explainable AI", href: "#explainable-ai" },
  { label: "Laws & Case Search", href: "#laws-and-case-search" },
  { label: "Admin Settings", href: "#admin-settings" },
];

type ProjectSidebarProps = {
  context: "list" | "detail" | "new";
};

export default function ProjectSidebar({ context }: ProjectSidebarProps) {
  const isProjectArea = context === "list" || context === "detail" || context === "new";
  const [activeHref, setActiveHref] = useState(projectSubMenus[0].href);

  useEffect(() => {
    if (context !== "detail") return;

    const sectionIds = projectSubMenus.map((menu) => menu.href.replace("#", ""));
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) return;

    const updateActiveSection = () => {
      const current = sections
        .map((section) => ({
          id: section.id,
          distance: Math.abs(section.getBoundingClientRect().top - 120),
        }))
        .sort((a, b) => a.distance - b.distance)[0];

      if (current) {
        setActiveHref(`#${current.id}`);
      }
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [context]);

  return (
    <aside className="sticky top-8 hidden h-[calc(100vh-2rem)] w-72 shrink-0 self-start overflow-y-auto border-r border-[#d7dee8] bg-white text-[#172033] xl:block">
      <SidebarBrand />
      <nav className="space-y-2 px-4 py-6 text-sm">
        <Link href="/" className="block rounded-lg px-4 py-3 font-semibold text-[#475569] transition hover:bg-[#e8f1ff] hover:text-[#15345b]">
          Dashboard
        </Link>
        <Link
          href="/projects"
          className={`block rounded-lg px-4 py-3 font-bold transition ${
            isProjectArea ? "bg-[#e8f1ff] text-[#15345b]" : "text-[#475569] hover:bg-[#e8f1ff] hover:text-[#15345b]"
          }`}
        >
          Project Management
        </Link>

        {context === "detail" ? (
          <div className="ml-3 border-l border-[#d7dee8] pl-3">
            {projectSubMenus.map((menu) => {
              const isActive = activeHref === menu.href;

              return (
                <a
                  href={menu.href}
                  className={`mt-1 block rounded-lg px-3 py-2 text-xs font-bold transition ${
                    isActive ? "primary-action-blue" : "text-[#64748b] hover:bg-[#eef4fb] hover:text-[#15345b]"
                  }`}
                  key={menu.label}
                  onClick={() => setActiveHref(menu.href)}
                >
                  {menu.label}
                </a>
              );
            })}
          </div>
        ) : null}
      </nav>
      <div className="mx-4 mt-8 rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm text-[#475569]">
        <p className="font-bold text-[#15345b]">Project Management</p>
        <p className="mt-2 leading-6">
          프로젝트를 선택하면 하위 메뉴에서 AI 분석, 하이브리드 점수, 설명 가능한 AI 기능을 사용할 수 있습니다.
        </p>
      </div>
    </aside>
  );
}
