"use client";

import { useEffect, useState, type ReactNode } from "react";

type TabId = "ai" | "expert";

const TABS: Array<{ id: TabId; label: string; hash: string }> = [
  { id: "ai", label: "사전심의: AI 분석", hash: "#checklist-review" },
  { id: "expert", label: "사전심의: 전문가 분석", hash: "#expert-review" },
];

/**
 * 사전심의 작업 공간 — AI 분석 / 전문가 분석을 탭으로 오간다.
 * 두 패널은 항상 마운트된 채 보이기만 전환한다 (AI 분석 진행 중에 전문가 탭으로 가도
 * 분석·입력 상태가 유지되도록). 주소의 #해시로 특정 탭을 바로 열 수 있다.
 */
export default function ReviewWorkspaceTabs({ aiPanel, expertPanel }: { aiPanel: ReactNode; expertPanel: ReactNode }) {
  const [active, setActive] = useState<TabId>("ai");

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

  return (
    <div>
      <div className="flex items-end gap-1 px-1" role="tablist" aria-label="사전심의 작업">
        {TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              aria-selected={selected}
              className={`-mb-px rounded-t-[6px] border px-5 py-2.5 text-sm font-bold transition ${
                selected
                  ? "relative z-10 border-[#d7dee8] border-b-white bg-white text-[#15345b]"
                  : "border-transparent text-[#667085] hover:bg-[#eef1f5] hover:text-[#334155]"
              }`}
              key={tab.id}
              onClick={() => select(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="rounded-md rounded-tl-none border border-[#d7dee8] bg-white p-5 panel-shadow">
        <div hidden={active !== "ai"} role="tabpanel">
          {aiPanel}
        </div>
        <div hidden={active !== "expert"} role="tabpanel">
          {expertPanel}
        </div>
      </div>
    </div>
  );
}
