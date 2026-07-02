import { Eyebrow } from "@/components/typography";
import { InfoField, Panel } from "@/components/panel";
import type { Project } from "@/lib/types";
import ProjectLocationEditor from "./project-location-editor";
import ProjectMetadataEditor from "./project-metadata-editor";

/**
 * 프로젝트 개요 패널. 서버 상세 페이지와 로컬(브라우저 저장) 상세 페이지가 공유한다.
 */
export default function ProjectOverviewPanel({
  project,
  badgeLabel,
  onUpdated,
}: {
  project: Project;
  badgeLabel: string;
  onUpdated?: (project: Project) => void;
}) {
  return (
    <Panel action={badgeLabel} title="프로젝트 개요">
      <ProjectMetadataEditor project={project} onUpdated={onUpdated} />
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <InfoField label="사업명" value={project.name} />
        <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
          <Eyebrow>사업위치</Eyebrow>
          <p className="mt-2 font-semibold leading-6 text-[#172033]">{project.location}</p>
          <ProjectLocationEditor project={project} onUpdated={onUpdated} />
        </div>
        <InfoField label="시행자" value={project.client} />
        <InfoField label="설계자" value={project.designer} />
        <InfoField label="사업유형" value={project.projectType} />
        <InfoField label="규모" value={project.scale} />
        <InfoField label="심의종류" value={project.reviewType} />
        <InfoField label="접수일" value={project.receivedAt} />
        <InfoField label="상태" value={project.status} />
        {project.summary ? (
          <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
            <Eyebrow>사업개요</Eyebrow>
            <p className="mt-2 whitespace-pre-wrap font-semibold leading-6 text-[#172033]">{project.summary}</p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
