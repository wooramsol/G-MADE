"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PROJECT_NAME } from "@/lib/demo-data";

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
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 self-start overflow-y-auto border-r border-[#d7dee8] bg-[#15345b] text-white xl:block">
      <div className="border-b border-white/10 px-6 py-7">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">Public Review AI</p>
        <h1 className="mt-3 text-2xl font-bold leading-tight">{PROJECT_NAME}</h1>
      </div>
      <nav className="space-y-2 px-4 py-6 text-sm">
        <Link href="/" className="block rounded-lg px-4 py-3 text-blue-50 transition hover:bg-white/10">
          Dashboard
        </Link>
        <Link
          href="/projects"
          className={`block rounded-lg px-4 py-3 font-semibold transition ${
            isProjectArea ? "bg-white/10 text-white" : "text-blue-50 hover:bg-white/10"
          }`}
        >
          Project Management
        </Link>

        <div className="ml-3 border-l border-white/20 pl-3">
          {projectSubMenus.map((menu) => {
            const isActive = context === "detail" && activeHref === menu.href;

            return context === "detail" ? (
              <a
                href={menu.href}
                className={`mt-1 block rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  isActive ? "bg-[#2463b3] text-white" : "text-blue-100 hover:bg-white/10 hover:text-white"
                }`}
                key={menu.label}
                onClick={() => setActiveHref(menu.href)}
              >
                {menu.label}
              </a>
            ) : (
              <span
                className="mt-1 block cursor-default rounded-lg px-3 py-2 text-xs text-blue-200/70"
                key={menu.label}
              >
                {menu.label}
              </span>
            );
          })}
        </div>
      </nav>
      <div className="mx-4 mt-8 rounded-xl border border-white/10 bg-white/10 p-4 text-sm text-blue-50">
        <p className="font-semibold">Project Management</p>
        <p className="mt-2 leading-6">
          프로젝트를 선택하면 하위 메뉴에서 AI 분석, 하이브리드 점수, 설명 가능한 AI 기능을 사용할 수 있습니다.
        </p>
      </div>
    </aside>
  );
}
