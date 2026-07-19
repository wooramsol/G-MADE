"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";
import type { EvaluationSpatialContext } from "@/lib/evaluation-context";
import Vworld3DView from "./vworld-3d-view";

const SpatialDetailMap = dynamic(() => import("@/components/spatial-detail-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-xl border border-[#d7dee8] bg-[#f8fafc] text-sm text-[#64748b]">
      지도 불러오는 중…
    </div>
  ),
});

type LayerFeature = {
  layerId: string;
  layerLabel: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
};

/**
 * 근거·보완 방향에 인용된 공간정보(브이월드)를 지도 위에 시각화하는 모달.
 * 사업지 좌표를 중심으로 경관지구·용도지역·문화재 레이어를 표시합니다.
 */
export default function SpatialEvidenceModal({
  spatial,
  note,
  onClose,
}: {
  spatial: EvaluationSpatialContext;
  note?: string;
  onClose: () => void;
}) {
  const [layerFeatures, setLayerFeatures] = useState<LayerFeature[]>([]);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<"3d" | "2d">("3d");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({ x: String(spatial.point.x), y: String(spatial.point.y) });
        if (spatial.address.trim()) params.set("address", spatial.address.trim());

        const response = await clientFetchWithTimeout(`/api/spatial/landscape-zone?${params.toString()}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as { layerFeatures?: LayerFeature[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "공간정보 조회에 실패했습니다.");
        if (!cancelled) setLayerFeatures(payload.layerFeatures ?? []);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "공간정보 조회에 실패했습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [spatial.address, spatial.point.x, spatial.point.y]);

  const zones = spatial.matchedZones ?? [];
  const nearby = spatial.nearbyFeatures ?? [];

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#15345b]">공간정보 근거 (브이월드)</p>
            <p className="mt-0.5 truncate text-xs text-[#64748b]">{spatial.address}</p>
          </div>
          <button
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-[#475569] hover:bg-[#f1f5f9]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="space-y-3 overflow-auto p-4">
          {note ? (
            <p className="rounded-lg bg-[#f0f7ff] px-3 py-2 text-xs leading-5 text-[#1d4f8c]">{note}</p>
          ) : null}

          <div className="flex items-center gap-1.5">
            <button
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                view === "3d" ? "bg-[#2463b3] text-white" : "bg-[#eef4fb] text-[#2463b3] hover:bg-[#dcebfb]"
              }`}
              onClick={() => setView("3d")}
              type="button"
            >
              3D 입체 (조감·투시)
            </button>
            <button
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                view === "2d" ? "bg-[#2463b3] text-white" : "bg-[#eef4fb] text-[#2463b3] hover:bg-[#dcebfb]"
              }`}
              onClick={() => setView("2d")}
              type="button"
            >
              2D 지구·지역 경계
            </button>
          </div>

          {view === "2d" && loadError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              지도 레이어 조회 실패: {loadError} (아래 텍스트 정보는 검토 당시 조회 결과입니다)
            </p>
          ) : null}

          {view === "3d" ? (
            <Vworld3DView x={spatial.point.x} y={spatial.point.y} />
          ) : (
            <SpatialDetailMap layerFeatures={layerFeatures} point={{ x: spatial.point.x, y: spatial.point.y }} />
          )}

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2">
              <p className="font-bold text-[#475569]">경관지구 해당</p>
              <p className="mt-1 font-semibold text-[#172033]">
                {spatial.inLandscapeZone ? "해당 가능" : "인근 조회 결과 없음"}
              </p>
              {zones.length > 0 ? (
                <p className="mt-1 leading-5 text-[#64748b]">
                  {zones.map((zone) => `${zone.name}(${zone.jurisdiction})`).join(", ")}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2">
              <p className="font-bold text-[#475569]">인접 공간정보</p>
              <p className="mt-1 leading-5 text-[#64748b]">
                {nearby.length > 0
                  ? nearby.map((feature) => `${feature.layerLabel}: ${feature.name}`).join(", ")
                  : "조회된 정보 없음"}
              </p>
            </div>
          </div>

          <p className="text-[11px] leading-4 text-[#94a3b8]">{spatial.disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
