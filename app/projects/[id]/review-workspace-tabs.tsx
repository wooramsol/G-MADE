"use client";

import { useEffect, useMemo, useState } from "react";
import { buildDocumentVersions, type DocumentVersion } from "@/lib/checklist-review/document-versions";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import ChecklistReviewSection from "./checklist-review-section";
import ExpertReviewSection from "./expert-review-section";

type TabId = "ai" | "expert";

/** AI = 파랑, 전문가 = 호박색 — 시스템 구성도·브로슈어의 색 구분과 동일 */
const TABS: Array<{
  id: TabId;
  label: string;
  sub: string;
  hash: string;
  icon: string;
  active: string;
  idle: string;
  bar: string;
}> = [
  {
    id: "ai",
    label: "사전심의: AI 분석",
    sub: "체크리스트 자동 판정 · 근거 캡처",
    hash: "#checklist-review",
    icon: "AI",
    active: "border-[#2463b3] bg-[#2463b3] text-white shadow-md",
    idle: "border-[#c9d6e6] bg-[#f3f7fc] text-[#2463b3] hover:bg-[#e6eef9]",
    bar: "border-[#2463b3]",
  },
  {
    id: "expert",
    label: "사전심의: 전문가 분석",
    sub: "도서 위 표시 · 의견 메모",
    hash: "#expert-review",
    icon: "전문가",
    active: "border-[#b45309] bg-[#b45309] text-white shadow-md",
    idle: "border-[#ecd3b0] bg-[#fdf8f1] text-[#b45309] hover:bg-[#faefdf]",
    bar: "border-[#b45309]",
  },
];

/** "26.09.04" 형식 (한국 시간) */
function shortDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

function changeSummary(version: DocumentVersion): string | null {
  if (version.order === 1) return version.pageCount ? `${version.pageCount}쪽` : null;
  const change = version.change;
  if (!change) return "이전 버전과 페이지 비교 불가";
  const parts: string[] = [];
  if (change.modified > 0) parts.push(`수정 ${change.modified}`);
  if (change.added > 0) parts.push(`추가 ${change.added}`);
  if (change.removed > 0) parts.push(`삭제 ${change.removed}`);
  return parts.length > 0 ? `이전 대비 ${parts.join(" · ")}쪽` : "이전 버전과 페이지 내용 동일";
}

/**
 * 사전심의 작업 공간 — 상단 "도서 버전" 선택 + AI 분석 / 전문가 분석 탭.
 * - 버전을 고르면 두 탭이 함께 그 제출본 기준으로 바뀐다.
 * - 두 패널은 항상 마운트된 채 보이기만 전환 (AI 분석 진행 중 탭 이동해도 상태 유지).
 */
export default function ReviewWorkspaceTabs({ project }: { project: Project }) {
  const [active, setActive] = useState<TabId>("ai");
  const [labels, setLabels] = useState<Record<string, string>>(project.documentVersionLabels ?? {});
  const versions = useMemo(
    () => buildDocumentVersions(project.checklistReviews ?? [], labels),
    [project.checklistReviews, labels],
  );
  const [versionKey, setVersionKey] = useState<string | null>(null);
  const currentVersion = versions.find((version) => version.key === versionKey) ?? versions[versions.length - 1];

  useEffect(() => {
    // 주소 해시는 브라우저에서만 알 수 있어 마운트 후 1회 동기화 (서버 렌더와의 불일치 방지)
    const fromHash = TABS.find((tab) => tab.hash === window.location.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fromHash) setActive(fromHash.id);
  }, []);

  const select = (id: TabId) => {
    setActive(id);
    const tab = TABS.find((entry) => entry.id === id);
    if (tab) window.history.replaceState(null, "", tab.hash);
  };

  async function renameVersion(version: DocumentVersion) {
    const next = window.prompt(
      `"${version.label}" 버전의 이름을 입력하세요. (비우면 자동 이름 "${version.defaultLabel}")`,
      version.label === version.defaultLabel ? "" : version.label,
    );
    if (next === null) return;
    const label = next.trim().slice(0, 30);
    setLabels((current) => {
      const copy = { ...current };
      if (label) copy[version.key] = label;
      else delete copy[version.key];
      return copy;
    });
    const response = await fetch("/api/checklist-reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, versionKey: version.key, versionLabel: label }),
    }).catch(() => null);
    if (!response?.ok) showToast({ message: "버전 이름을 저장하지 못했습니다.", tone: "error" });
  }

  const activeTab = TABS.find((tab) => tab.id === active) ?? TABS[0];

  // 도서 버전 선택 — 두 탭의 "검토 자료 선택" 카드 안에 같은 것을 넣는다 (상태는 여기서 공유)
  const versionPicker =
    versions.length === 0 ? (
      <p className="pt-1.5 text-xs text-[#94a3b8]">
        아직 검토한 도서가 없습니다 — 도서를 검토하면 제출본별 버전이 자동으로 만들어집니다.
      </p>
    ) : (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((version) => {
            const selected = version.key === currentVersion?.key;
            const summary = changeSummary(version);
            return (
              <button
                className={`flex h-12 min-w-[150px] flex-col justify-center rounded-md border px-3 text-left transition ${
                  selected
                    ? "border-[#15345b] bg-[#15345b] text-white"
                    : "border-[#d7dee8] bg-white text-[#334155] hover:border-[#9fb3cc] hover:bg-[#f8fafc]"
                }`}
                key={version.key}
                onClick={() => setVersionKey(version.key)}
                title={`${version.fileName}\n첫 검토 ${formatUploadDateTime(version.firstReviewedAt)} · 검토 ${version.reviews.length}회`}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-3 text-xs font-bold leading-4">
                  {version.label}
                  <span className={`text-[11px] font-medium ${selected ? "text-[#c9d6e6]" : "text-[#94a3b8]"}`}>
                    {shortDate(version.firstReviewedAt)}
                  </span>
                </span>
                <span className={`mt-0.5 block truncate text-[11px] leading-4 ${selected ? "text-[#dbe4f0]" : "text-[#64748b]"}`}>
                  {summary ?? "\u00a0"}
                </span>
              </button>
            );
          })}
          {currentVersion ? (
            <button
              className="h-8 rounded-[4px] px-2 text-xs font-bold text-[#2463b3] hover:bg-[#eef4fb]"
              onClick={() => renameVersion(currentVersion)}
              type="button"
            >
              이름 변경
            </button>
          ) : null}
        </div>
        {currentVersion ? (
          <p className="mt-2 truncate text-[11px] text-[#94a3b8]">
            {currentVersion.fileName}
            {currentVersion.change && currentVersion.change.changedPages.length > 0
              ? ` · 바뀐 페이지 ${currentVersion.change.changedPages.slice(0, 20).map((page) => `p.${page}`).join(", ")}${
                  currentVersion.change.changedPages.length > 20 ? " …" : ""
                }`
              : ""}
          </p>
        ) : null}
      </div>
    );

  return (
    <div className="space-y-4">
      {/* AI / 전문가 탭 — 화면 중앙에서 크게 가름 */}
      <div className="mx-auto grid max-w-[880px] grid-cols-2 gap-3" role="tablist" aria-label="사전심의 작업">
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              aria-selected={selected}
              className={`flex items-center justify-center gap-3 rounded-lg border-2 px-5 py-4 transition ${
                selected ? tab.active : tab.idle
              }`}
              key={tab.id}
              onClick={() => select(tab.id)}
              role="tab"
              type="button"
            >
              <span
                className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-black ${
                  selected ? "bg-white/20" : "bg-white"
                }`}
              >
                {tab.icon}
              </span>
              <span className="text-left">
                <span className="block text-base font-bold leading-6">{tab.label}</span>
                <span className={`block text-xs ${selected ? "text-white/80" : "opacity-75"}`}>{tab.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={`rounded-md border-2 bg-white p-5 panel-shadow ${activeTab.bar}`}>
        <div hidden={active !== "ai"} role="tabpanel">
          <ChecklistReviewSection
            versionPicker={versionPicker}
            activeVersionKey={currentVersion?.key ?? null}
            onActiveVersionChange={setVersionKey}
            project={project}
          />
        </div>
        <div hidden={active !== "expert"} role="tabpanel">
          <ExpertReviewSection
            versionPicker={versionPicker}
            activeVersion={currentVersion ? { label: currentVersion.label, fileName: currentVersion.fileName } : null}
            project={project}
          />
        </div>
      </div>
    </div>
  );
}
