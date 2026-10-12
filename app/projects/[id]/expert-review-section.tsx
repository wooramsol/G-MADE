"use client";

import { useMemo, useState, type ReactNode } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { formatBytes } from "@/lib/format-bytes";
import { collectProjectStoredFiles } from "@/lib/project-file-pool";
import type { Project } from "@/lib/types";

/**
 * 사전심의: 전문가 분석 — 인간 전문가가 도서 PDF 위에 직접 영역을 표시하고 메모를 남기는 영역.
 * (1단계: 레이아웃만 — 뷰어·표시 도구·메모 저장은 다음 단계에서 연결)
 */

type Tool = "select" | "box" | "pen" | "memo";

const TOOLS: Array<{ id: Tool; label: string; icon: string }> = [
  { id: "select", label: "선택", icon: "↖" },
  { id: "box", label: "영역 표시", icon: "▭" },
  { id: "pen", label: "펜", icon: "✎" },
  { id: "memo", label: "메모", icon: "✉" },
];

export default function ExpertReviewSection({
  project,
  activeVersion = null,
  versionPicker,
}: {
  project: Project;
  /** 도서 버전 선택 (탭 공통) — 검토 자료 선택 카드 안에 표시 */
  versionPicker?: ReactNode;
  /** 상단에서 고른 도서 버전 — 해당 제출본 파일을 기본 선택 */
  activeVersion?: { label: string; fileName: string } | null;
}) {
  const storedFiles = useMemo(
    () => collectProjectStoredFiles(project).filter((file) => file.originalName.toLowerCase().endsWith(".pdf")),
    [project],
  );
  const versionFileId = storedFiles.find((file) => file.originalName === activeVersion?.fileName)?.id ?? null;
  const [pickedFileId, setPickedFileId] = useState<string | null>(null);
  const selectedFileId = pickedFileId ?? versionFileId ?? storedFiles[0]?.id ?? null;
  const setSelectedFileId = setPickedFileId;
  const [tool, setTool] = useState<Tool>("box");
  const selectedFile = storedFiles.find((file) => file.id === selectedFileId) ?? null;

  return (
    <WorkspaceSectionCard
      description="전문가가 도서 PDF 위에 직접 검토 부위를 표시하고 의견 메모를 남깁니다. 표시와 메모는 페이지별로 저장되어 AI 분석 결과와 함께 비교할 수 있습니다."
      id="expert-review"
      title="사전심의: 전문가 분석"
      bare
    >
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        {/* 왼쪽: 자료 선택 · 메모 목록 */}
        <div className="space-y-4">
          <div className="rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
            <p className="text-sm font-bold text-[#15345b]">검토 자료 선택</p>
            <p className="mt-1 text-xs leading-5 text-[#667085]">표시·메모를 남길 도서 PDF를 선택하세요.</p>
            {versionPicker ? <div className="mt-3">{versionPicker}</div> : null}
            {storedFiles.length === 0 ? (
              <p className="mt-3 rounded-[4px] border border-dashed border-[#d0d5dd] bg-white px-3 py-4 text-center text-xs text-[#94a3b8]">
                보관 중인 PDF가 없습니다. 사전심의: AI 분석에서 도서를 먼저 업로드해 주세요.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {storedFiles.map((file) => (
                  <li key={file.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-[4px] border px-3 py-2 text-xs ${
                        file.id === selectedFileId ? "border-[#2463b3] bg-white" : "border-[#e2e8f0] bg-white hover:border-[#c9d2dd]"
                      }`}
                    >
                      <input
                        checked={file.id === selectedFileId}
                        name="expert-review-file"
                        onChange={() => setSelectedFileId(file.id)}
                        type="radio"
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold text-[#172033]">{file.originalName}</span>
                      <span className="shrink-0 text-[11px] text-[#94a3b8]">{formatBytes(file.sizeBytes)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-[#d7dee8] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[#15345b]">전문가 메모</p>
              <span className="text-xs text-[#94a3b8]">0건</span>
            </div>
            <div className="mt-3 flex gap-1 border-b border-[#e2e8f0] text-xs">
              {["전체", "현재 페이지"].map((label, index) => (
                <span
                  className={`-mb-px rounded-t-[4px] border px-3 py-1.5 font-bold ${
                    index === 0 ? "border-[#e2e8f0] border-b-white bg-white text-[#15345b]" : "border-transparent text-[#94a3b8]"
                  }`}
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="mt-3 rounded-[4px] border border-dashed border-[#d0d5dd] bg-[#f8fafc] px-3 py-6 text-center text-xs leading-5 text-[#94a3b8]">
              아직 메모가 없습니다.
              <br />
              오른쪽 도서 화면에서 영역을 표시하면 메모를 남길 수 있습니다.
            </p>
          </div>
        </div>

        {/* 오른쪽: PDF 뷰어 + 표시 도구 */}
        <div className="min-w-0 rounded-md border border-[#d7dee8] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
            <div className="flex items-center gap-1" role="toolbar" aria-label="표시 도구">
              {TOOLS.map((item) => (
                <button
                  className={`flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-xs font-bold ${
                    tool === item.id
                      ? "border-[#2463b3] bg-[#eef4fb] text-[#2463b3]"
                      : "border-transparent text-[#475569] hover:bg-[#f1f5f9]"
                  }`}
                  key={item.id}
                  onClick={() => setTool(item.id)}
                  title={item.label}
                  type="button"
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-[#e2e8f0]" />
            <div className="flex items-center gap-1 text-xs text-[#475569]">
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" disabled title="이전 페이지" type="button">
                ◀
              </button>
              <span className="min-w-[56px] text-center font-semibold">— / —</span>
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" disabled title="다음 페이지" type="button">
                ▶
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-[#475569]">
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" disabled title="축소" type="button">
                −
              </button>
              <span className="min-w-[44px] text-center font-semibold">100%</span>
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" disabled title="확대" type="button">
                +
              </button>
            </div>
          </div>

          <div className="flex min-h-[560px] items-center justify-center bg-[#eef1f5] p-6">
            <div className="flex aspect-[1.414/1] w-full max-w-[860px] flex-col items-center justify-center rounded-[2px] border border-[#d0d5dd] bg-white text-center shadow-sm">
              <p className="text-sm font-bold text-[#475569]">
                {selectedFile ? selectedFile.originalName : "검토 자료를 선택하세요"}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
                PDF 페이지가 이곳에 표시됩니다.
                <br />
                도구를 골라 검토 부위에 영역을 표시하고 의견 메모를 남깁니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-[#e2e8f0] px-3 py-2 text-[11px] text-[#94a3b8]">
            <span>현재 도구: {TOOLS.find((item) => item.id === tool)?.label}</span>
            <span className="ml-auto">표시·메모는 자동 저장됩니다 (준비 중)</span>
          </div>
        </div>
      </div>
    </WorkspaceSectionCard>
  );
}
