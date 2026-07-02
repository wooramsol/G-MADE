"use client";

import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { Eyebrow, MutedText, PageTitle } from "@/components/typography";
import type { Project } from "@/lib/types";
import CompleteEvaluationButton from "../complete-evaluation-button";
import {
  getLocalProjects,
  trashLocalProject,
  useLocalProjects,
} from "../local-project-storage";
import { showToast } from "../../toast";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectOverviewPanel from "./project-overview-panel";
import ProjectUploadSection from "./project-upload-section";

export default function LocalProjectDetail({ projectId }: { projectId: string }) {
  const { projects: localProjects, hydrated } = useLocalProjects();
  const [override, setOverride] = useState<Project | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const project: Project | null | undefined = hydrated
    ? override ?? localProjects.find((item) => item.id === projectId) ?? null
    : undefined;
  const setProject = setOverride;

  if (project === undefined) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <MutedText>프로젝트 정보를 불러오는 중입니다.</MutedText>
        </div>
      </main>
    );
  }

  if (project === null) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>프로젝트를 찾을 수 없습니다.</PageTitle>
          <MutedText className="mt-2">브라우저 저장소 또는 서버 저장소에 해당 프로젝트가 없습니다.</MutedText>
          <Link className="primary-action-blue mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold" href="/projects">
            프로젝트 관리로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 pt-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>사업명</Eyebrow>
                <EvaluationStatusBadge project={project} />
              </div>
              <PageTitle className="mt-2">{project.name}</PageTitle>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                휴지통으로 이동
              </button>
              <ConfirmDialog
                description={`"${project.name}" 프로젝트를 휴지통으로 이동합니다. 평가 진행 중이어도 이동할 수 있으며, 휴지통에서 복원하거나 영구 삭제할 수 있습니다.`}
                loading={deleting}
                open={deleteConfirmOpen}
                onCancel={() => {
                  if (!deleting) setDeleteConfirmOpen(false);
                }}
                onConfirm={() => {
                  setDeleting(true);
                  trashLocalProject(project.id);
                  setDeleteConfirmOpen(false);
                  showToast({ message: "프로젝트가 휴지통으로 이동했습니다.", tone: "success" });
                  window.setTimeout(() => {
                    window.location.href = "/projects";
                  }, 650);
                }}
              />
              <CompleteEvaluationButton project={project} onUpdated={setProject} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section className="space-y-5">
          <ProjectOverviewPanel badgeLabel="브라우저 저장 프로젝트" project={project} onUpdated={setProject} />

          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} />

          <ProjectUploadSection
            project={project}
            onProjectUpdated={() => setProject(getLocalProjects().find((item) => item.id === projectId) ?? null)}
          />
        </section>
      </div>
    </main>
  );
}
