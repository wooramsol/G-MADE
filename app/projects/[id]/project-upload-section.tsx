"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
      setActiveProject(mergedProject);
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
    <>
      <ParallelEvaluationForm
        project={activeProject}
        savedRounds={rounds}
        onRoundSaved={persistRound}
        onRoundsChange={(nextRounds) => syncRounds(nextRounds)}
      />

      <div className="mt-8">
        <ProjectEvaluationWorkspace
          project={project}
          rounds={rounds}
          onRoundsChange={(next) => syncRounds(next)}
        />
      </div>
    </>
  );
}
