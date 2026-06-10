"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { getProjectEvaluationRounds } from "@/lib/evaluation-rounds";
import type { EvaluationRound, Project, ProjectFile } from "@/lib/types";
import ParallelEvaluationForm from "../../parallel-evaluation-form";
import { getLocalProjects, syncLocalProjectRounds } from "../local-project-storage";
import ProjectEvaluationWorkspace from "./project-evaluation-workspace";

function mergeRounds(serverRounds: EvaluationRound[] = [], localRounds: EvaluationRound[] = []): EvaluationRound[] {
  const byId = new Map<string, EvaluationRound>();
  [...serverRounds, ...localRounds].forEach((round) => byId.set(round.id, round));
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
  const [activeProject, setActiveProject] = useState<Project>(project);
  const [files, setFiles] = useState<ProjectFile[]>(project.files);
  const [rounds, setRounds] = useState<EvaluationRound[]>(getProjectEvaluationRounds(project));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const localProject = getLocalProjects().find((item) => item.id === project.id);
      const mergedProject = localProject ? { ...project, ...localProject } : project;
      setActiveProject({
        ...mergedProject,
        savedEvaluationItems:
          localProject?.savedEvaluationItems ??
          mergedProject.savedEvaluationItems ??
          project.savedEvaluationItems,
      });
      setFiles(mergedProject.files);
      setRounds(getProjectEvaluationRounds(mergedProject));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [project]);

  function syncRounds(nextRounds: EvaluationRound[], nextFiles = files) {
    setRounds(nextRounds);
    setFiles(nextFiles);
    syncLocalProjectRounds(project.id, activeProject, nextFiles, nextRounds);
    setActiveProject((current) => ({ ...current, files: nextFiles, evaluationRounds: nextRounds }));
    onProjectUpdated?.();
    router.refresh();
  }

  function persistRound(round: EvaluationRound, uploadedFiles: ProjectFile[]) {
    const nextFiles = [...files];
    uploadedFiles.forEach((file) => {
      const index = nextFiles.findIndex((row) => row.id === file.id);
      if (index >= 0) nextFiles[index] = file;
      else nextFiles.push(file);
    });
    syncRounds(mergeRounds(rounds, [round]), nextFiles);
  }

  return (
    <div className="space-y-8">
      <WorkspaceSectionCard
        eyebrow="Parallel Evaluation Prep"
        title="AI · 전문가 병행 평가 준비"
        description="공통 평가항목·배점을 설정한 뒤, AI·전문가 자료를 대칭 구조로 업로드하고 한 번에 하이브리드 평가 분석을 실행합니다."
      >
        <ParallelEvaluationForm
          project={activeProject}
          onRoundSaved={persistRound}
          onRoundsChange={(nextRounds) => syncRounds(nextRounds)}
        />
      </WorkspaceSectionCard>

      <WorkspaceSectionCard
        id="hybrid-evaluation-results"
        eyebrow="Hybrid Evaluation"
        title="통합 평가 결과"
        description="AI·전문가 자료를 함께 분석한 차수별 통합 결과와 종합 점수입니다."
      >
        <ProjectEvaluationWorkspace
          project={project}
          rounds={rounds}
          showHeader={false}
          onRoundsChange={(next) => syncRounds(next)}
        />
      </WorkspaceSectionCard>
    </div>
  );
}
