"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project, ProjectFile } from "@/lib/types";
import UploadAnalyzer from "../../upload-analyzer";
import { getLocalProjects, saveLocalProject } from "../local-project-storage";

export default function ProjectUploadSection({ project }: { project: Project }) {
  const [files, setFiles] = useState<ProjectFile[]>(project.files);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const localProject = getLocalProjects().find((item) => item.id === project.id);
      if (localProject) {
        setFiles(mergeFiles(project.files, localProject.files));
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [project.files, project.id]);

  const visibleProject = useMemo(() => ({ ...project, files }), [files, project]);

  function handleUploadedFiles(uploadedFiles: ProjectFile[]) {
    const nextFiles = mergeFiles(files, uploadedFiles);
    setFiles(nextFiles);
    saveLocalProject({ ...project, files: nextFiles });
  }

  return (
    <>
      <UploadAnalyzer projectId={project.id} onUploadedFiles={handleUploadedFiles} />
      <UploadHistory files={visibleProject.files} />
    </>
  );
}

function mergeFiles(currentFiles: ProjectFile[], nextFiles: ProjectFile[]): ProjectFile[] {
  const byId = new Map<string, ProjectFile>();
  [...currentFiles, ...nextFiles].forEach((file) => byId.set(file.id, file));
  return Array.from(byId.values());
}

function UploadHistory({ files }: { files: ProjectFile[] }) {
  return (
    <div className="mt-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">업로드 히스토리</p>
          <p className="mt-1 text-sm text-[#64748b]">프로젝트에 등록된 기존 자료와 추가 업로드 이력을 함께 확인합니다.</p>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{files.length}건</span>
      </div>
      {files.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">파일명</th>
                <th className="w-28 px-4 py-3">파일 형식</th>
                <th className="w-28 px-4 py-3">분석 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {files.map((file) => (
                <tr key={file.id}>
                  <td className="px-4 py-4">
                    <p className="font-bold text-[#15345b]">{file.fileName}</p>
                    <p className="mt-1 text-[#64748b]">프로젝트 첨부자료</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{file.fileType}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{file.analysisStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#d7dee8] bg-white p-6 text-center text-sm font-semibold text-[#64748b]">
          아직 업로드된 파일이 없습니다.
        </div>
      )}
    </div>
  );
}
