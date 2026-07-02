"use client";

import { interactiveCardClassName } from "@/components/interactive-card";
import { MutedText, StepTitle } from "@/components/typography";
import { formatBytes } from "@/lib/format-bytes";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import { getMaxUploadFileLabel } from "@/lib/upload-limits";

const FILE_ACCEPT = ".pdf,.docx,.xlsx,.xls,.hwp,.pptx,.jpg,.jpeg,.png,.dwg,.zip,.txt,.md";

export default function EvaluationMaterialsSection({
  title = "3. 평가 자료",
  description = "프로젝트 자료·심의서류·평가표·의견서 등 AI·전문가 분석에 공통으로 사용할 파일",
  filesRequired,
  newFiles,
  selectedRefs,
  storedFiles,
  totalSize,
  onNewFilesChange,
  onSelectedRefsChange,
  children,
}: {
  title?: string;
  description?: string;
  filesRequired: boolean;
  newFiles: File[];
  selectedRefs: StoredFileRef[];
  storedFiles: StoredFileRef[];
  totalSize: number;
  onNewFilesChange: (files: File[]) => void;
  onSelectedRefsChange: (refs: StoredFileRef[]) => void;
  children: React.ReactNode;
}) {
  const selectedIds = new Set(selectedRefs.map((ref) => ref.id));
  const totalCount = newFiles.length + selectedRefs.length;

  function toggleStoredFile(file: StoredFileRef) {
    if (selectedIds.has(file.id)) {
      onSelectedRefsChange(selectedRefs.filter((ref) => ref.id !== file.id));
      return;
    }
    onSelectedRefsChange([...selectedRefs, file]);
  }

  return (
    <section
      className={`rounded-xl border border-[#d7dee8] bg-white p-4 ${interactiveCardClassName}`}
    >
      <div>
        <StepTitle>{title}</StepTitle>
        <MutedText className="mt-1">{description}</MutedText>
      </div>

      {filesRequired && storedFiles.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#d7dee8] bg-white p-3">
          <p className="text-sm font-bold text-[#15345b]">저장된 자료 (이전 평가)</p>
          <p className="mt-1 text-xs text-[#64748b]">
            같은 파일을 다시 올리지 않고 선택하면 Blob에 보관된 자료를 재사용합니다.
          </p>
          <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
            {storedFiles.map((file) => {
              const checked = selectedIds.has(file.id);
              return (
                <li key={file.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#e2e8f0] px-3 py-2 text-xs hover:bg-[#f8fafc]">
                    <input
                      checked={checked}
                      className="mt-0.5"
                      type="checkbox"
                      onChange={() => toggleStoredFile(file)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[#15345b]">{file.originalName}</span>
                      <span className="mt-0.5 block text-[#64748b]">
                        {formatBytes(file.sizeBytes)}
                        {file.lastUsedRoundLabel ? ` · ${file.lastUsedRoundLabel}에서 사용` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {filesRequired ? (
        <label className="mt-4 flex min-h-44 cursor-pointer flex-col rounded-xl border border-dashed border-[#2463b3] bg-white p-4 text-sm text-[#475569]">
          <span className="font-bold text-[#15345b]">새 자료 업로드</span>
          <span className="mt-1 leading-6">
            PDF, DOCX, XLSX, HWP, PPTX, JPG, PNG, ZIP · 파일당 최대 {getMaxUploadFileLabel()}
          </span>
          <input
            className="mt-4 text-sm"
            multiple
            type="file"
            accept={FILE_ACCEPT}
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              if (picked.length > 0) {
                onNewFilesChange([...newFiles, ...picked]);
              }
              event.target.value = "";
            }}
          />
          {totalCount > 0 ? (
            <div className="mt-4 rounded-xl bg-[#f8fafc] p-3">
              <p className="font-semibold text-[#15345b]">
                선택 {totalCount}개 · {formatBytes(totalSize)}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {selectedRefs.map((file) => (
                  <li key={`ref-${file.id}`} className="text-[#2463b3]">
                    [저장됨] {file.originalName} ({formatBytes(file.sizeBytes)})
                  </li>
                ))}
                {newFiles.map((file, index) => (
                  <li key={`${file.name}-${file.size}-${index}`}>
                    [신규] {file.name} ({formatBytes(file.size)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </label>
      ) : null}

      {children ? <div className="mt-4 rounded-xl border border-[#d7dee8] bg-white p-4">{children}</div> : null}
    </section>
  );
}
