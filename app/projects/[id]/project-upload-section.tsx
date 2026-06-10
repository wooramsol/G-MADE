"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { HumanEvaluationSession, Project, ProjectFile, UploadAnalysisSession } from "@/lib/types";
import ExpertEvaluationUploader from "../../expert-evaluation-uploader";
import UploadAnalyzer from "../../upload-analyzer";
import {
  addLocalProjectHumanEvaluation,
  addLocalProjectUploadAnalysis,
  getLocalProjects,
  saveLocalProject,
  syncLocalProjectEvaluations,
} from "../local-project-storage";
import ProjectEvaluationWorkspace from "./project-evaluation-workspace";

function mergeProjectFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

function mergeAnalyses(
  serverAnalyses: UploadAnalysisSession[] = [],
  localAnalyses: UploadAnalysisSession[] = [],
): UploadAnalysisSession[] {
  const byId = new Map<string, UploadAnalysisSession>();
  [...serverAnalyses, ...localAnalyses].forEach((session) => byId.set(session.id, session));
  return Array.from(byId.values());
}

function mergeHumanEvaluations(
  serverSessions: HumanEvaluationSession[] = [],
  localSessions: HumanEvaluationSession[] = [],
): HumanEvaluationSession[] {
  const byId = new Map<string, HumanEvaluationSession>();
  [...serverSessions, ...localSessions].forEach((session) => byId.set(session.id, session));
  return Array.from(byId.values());
}

export default function ProjectUploadSection({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated?: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<ProjectFile[]>(project.files);
  const [analyses, setAnalyses] = useState<UploadAnalysisSession[]>(project.uploadAnalyses ?? []);
  const [humanEvaluations, setHumanEvaluations] = useState<HumanEvaluationSession[]>(
    project.humanEvaluationSessions ?? [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const localProject = getLocalProjects().find((item) => item.id === project.id);
      if (localProject) {
        setFiles(mergeProjectFiles(project.files, localProject.files));
        setAnalyses(mergeAnalyses(project.uploadAnalyses, localProject.uploadAnalyses));
        setHumanEvaluations(
          mergeHumanEvaluations(project.humanEvaluationSessions, localProject.humanEvaluationSessions),
        );
      } else {
        setFiles(project.files);
        setAnalyses(project.uploadAnalyses ?? []);
        setHumanEvaluations(project.humanEvaluationSessions ?? []);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [project.files, project.humanEvaluationSessions, project.id, project.uploadAnalyses]);

  function syncAll(
    nextFiles: ProjectFile[],
    nextAnalyses: UploadAnalysisSession[],
    nextHumanEvaluations: HumanEvaluationSession[],
  ) {
    setFiles(nextFiles);
    setAnalyses(nextAnalyses);
    setHumanEvaluations(nextHumanEvaluations);
    syncLocalProjectEvaluations(project.id, project, nextFiles, nextAnalyses, nextHumanEvaluations);
    onProjectUpdated?.();
    router.refresh();
  }

  function handleAnalysesChange(next: UploadAnalysisSession[]) {
    syncAll(files, next, humanEvaluations);
  }

  function handleHumanEvaluationsChange(next: HumanEvaluationSession[]) {
    syncAll(files, analyses, next);
  }

  function persistUpload(session: UploadAnalysisSession, uploadedFiles: ProjectFile[]) {
    const nextFiles = mergeProjectFiles(files, uploadedFiles);
    const nextAnalyses = mergeAnalyses(analyses, [session]);
    setFiles(nextFiles);
    setAnalyses(nextAnalyses);

    const localProject = getLocalProjects().find((item) => item.id === project.id);
    if (localProject) {
      addLocalProjectUploadAnalysis(project.id, session, uploadedFiles);
      onProjectUpdated?.();
      return;
    }

    saveLocalProject({
      ...project,
      files: nextFiles,
      uploadAnalyses: nextAnalyses,
      humanEvaluationSessions: humanEvaluations,
    });
  }

  function persistHumanEvaluation(session: HumanEvaluationSession, uploadedFiles: ProjectFile[]) {
    const nextFiles = mergeProjectFiles(files, uploadedFiles);
    const nextHumanEvaluations = mergeHumanEvaluations(humanEvaluations, [session]);
    setFiles(nextFiles);
    setHumanEvaluations(nextHumanEvaluations);

    const localProject = getLocalProjects().find((item) => item.id === project.id);
    if (localProject) {
      addLocalProjectHumanEvaluation(project.id, session, uploadedFiles);
      onProjectUpdated?.();
      return;
    }

    saveLocalProject({
      ...project,
      files: nextFiles,
      uploadAnalyses: analyses,
      humanEvaluationSessions: nextHumanEvaluations,
    });
  }

  return (
    <>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-[#d7dee8] bg-white p-1">
          <div className="rounded-xl bg-[#eef4fb] px-4 py-3">
            <p className="text-sm font-bold text-[#2463b3]">AI 자동 분석</p>
            <p className="mt-1 text-xs text-[#64748b]">프로젝트 자료를 업로드하고 AI가 평가합니다.</p>
          </div>
          <UploadAnalyzer
            projectId={project.id}
            savedAnalyses={analyses}
            onAnalysisSaved={persistUpload}
          />
        </section>

        <section className="rounded-2xl border border-[#d7dee8] bg-white p-1">
          <div className="rounded-xl bg-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-[#15345b]">인간 전문가 평가</p>
            <p className="mt-1 text-xs text-[#64748b]">
              심사위원·전문가 평가 자료를 업로드하고 항목별 점수를 등록합니다.
            </p>
          </div>
          <ExpertEvaluationUploader
            projectId={project.id}
            savedSessions={humanEvaluations}
            onEvaluationSaved={persistHumanEvaluation}
          />
        </section>
      </div>

      <div className="mt-8">
        <ProjectEvaluationWorkspace
          project={project}
          analyses={analyses}
          humanEvaluations={humanEvaluations}
          onAnalysesChange={handleAnalysesChange}
          onHumanEvaluationsChange={handleHumanEvaluationsChange}
        />
      </div>
    </>
  );
}
