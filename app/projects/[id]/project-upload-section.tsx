"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectFile, UploadAnalysisSession } from "@/lib/types";
import UploadAnalyzer from "../../upload-analyzer";
import { addLocalProjectUploadAnalysis, getLocalProjects, saveLocalProject } from "../local-project-storage";
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

export default function ProjectUploadSection({ project }: { project: Project }) {
  const [files, setFiles] = useState<ProjectFile[]>(project.files);
  const [analyses, setAnalyses] = useState<UploadAnalysisSession[]>(project.uploadAnalyses ?? []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const localProject = getLocalProjects().find((item) => item.id === project.id);
      if (localProject) {
        setFiles(mergeProjectFiles(project.files, localProject.files));
        setAnalyses(mergeAnalyses(project.uploadAnalyses, localProject.uploadAnalyses));
      } else {
        setFiles(project.files);
        setAnalyses(project.uploadAnalyses ?? []);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [project.files, project.id, project.uploadAnalyses]);

  function persistUpload(session: UploadAnalysisSession, uploadedFiles: ProjectFile[]) {
    const nextFiles = mergeProjectFiles(files, uploadedFiles);
    const nextAnalyses = mergeAnalyses(analyses, [session]);
    setFiles(nextFiles);
    setAnalyses(nextAnalyses);

    const localProject = getLocalProjects().find((item) => item.id === project.id);
    if (localProject) {
      addLocalProjectUploadAnalysis(project.id, session, uploadedFiles);
      return;
    }

    saveLocalProject({
      ...project,
      files: nextFiles,
      uploadAnalyses: nextAnalyses,
    });
  }

  return (
    <>
      <UploadAnalyzer
        projectId={project.id}
        savedAnalyses={analyses}
        onAnalysisSaved={persistUpload}
      />
      <div className="mt-8">
        <ProjectEvaluationWorkspace
          project={project}
          analyses={analyses}
          onAnalysesChange={setAnalyses}
        />
      </div>
    </>
  );
}
