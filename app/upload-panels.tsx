"use client";

import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { ProjectFile, UploadAnalysisSession } from "@/lib/types";

export function UploadHistoryPanel({ files }: { files: ProjectFile[] }) {
  const sortedFiles = [...files].sort((left, right) => {
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  return (
    <div className="mt-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">업로드 히스토리</p>
          <p className="mt-1 text-sm text-[#64748b]">프로젝트에 등록된 업로드 파일과 분석 완료 시각을 확인합니다.</p>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{files.length}건</span>
      </div>
      {sortedFiles.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#d7dee8]">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">파일명</th>
                <th className="w-28 px-4 py-3">파일 형식</th>
                <th className="w-44 px-4 py-3">업로드 일시</th>
                <th className="w-28 px-4 py-3">분석 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {sortedFiles.map((file) => (
                <tr key={file.id}>
                  <td className="px-4 py-4">
                    <p className="font-bold text-[#15345b]">{file.fileName}</p>
                    {file.sizeBytes ? (
                      <p className="mt-1 text-xs text-[#64748b]">{formatBytes(file.sizeBytes)}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[#64748b]">프로젝트 첨부자료</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{file.fileType}</span>
                  </td>
                  <td className="px-4 py-4 text-[#64748b]">{formatUploadDateTime(file.uploadedAt)}</td>
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

export function UploadAnalysisResultsPanel({ sessions }: { sessions: UploadAnalysisSession[] }) {
  if (sessions.length === 0) return null;

  const sortedSessions = [...sessions].sort(
    (left, right) => new Date(right.analyzedAt).getTime() - new Date(left.analyzedAt).getTime(),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">누적 분석 결과</p>
          <p className="mt-1 text-sm text-[#64748b]">업로드 분석을 실행할 때마다 결과가 누적되어 유지됩니다.</p>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{sessions.length}회</span>
      </div>

      {sortedSessions.map((session, index) => (
        <article className="space-y-4 rounded-xl border border-[#d7dee8] bg-white p-4" key={session.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#15345b] px-3 py-1 text-xs font-bold text-white">
              {sortedSessions.length - index}차 분석
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {formatUploadDateTime(session.analyzedAt)}
            </span>
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
              {formatProviderBadgeLabel(session.analysis.provider)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {session.analysis.mode === "live" ? "실제 AI API 분석" : "데모 분석"}
            </span>
            <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
              AI {session.aiWeight}% · 전문가 {session.expertWeight}%
            </span>
            <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
              총 배점 {session.totalPoints}점
            </span>
          </div>

          <p className="text-sm leading-6 text-[#475569]">{session.analysis.summary}</p>

          <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eef4fb] text-[#15345b]">
                <tr>
                  <th className="px-4 py-3">업로드 파일</th>
                  <th className="px-4 py-3">형식</th>
                  <th className="px-4 py-3">크기</th>
                  <th className="px-4 py-3">분석상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dee8] bg-white">
                {session.files.map((file) => (
                  <tr key={file.id}>
                    <td className="px-4 py-4 font-semibold text-[#15345b]">{file.originalName}</td>
                    <td className="px-4 py-4 text-[#64748b]">{file.fileType}</td>
                    <td className="px-4 py-4 text-[#64748b]">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">분석 완료</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {session.analysis.warnings.length > 0 ? (
            <div className="rounded-xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm leading-6 text-[#9a3412]">
              <p className="font-bold">AI 호출 안내</p>
              {session.analysis.warnings.map((warning) => (
                <p className="mt-2" key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {session.analysis.documentSections.slice(0, 6).map((section) => (
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={`${session.id}-${section.label}`}>
                <div className="flex justify-between text-sm font-bold text-[#15345b]">
                  <span>{section.label}</span>
                  <span>{section.confidence}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${section.confidence}%` }} />
                </div>
                <p className="mt-2 text-xs leading-5 text-[#64748b]">{section.summary}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {session.analysis.evaluationPreview.slice(0, 3).map((row) => (
              <div className="rounded-xl border border-[#d7dee8] p-3" key={`${session.id}-${row.itemName}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#15345b]">{row.itemName}</p>
                  <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
                    {row.score}점 · {row.grade}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#475569]">{row.rationale}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#9a3412]">개선권고: {row.recommendation}</p>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
