"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import OverflowChipRow from "@/components/overflow-chip-row";
import { SubsectionTitle } from "@/components/typography";
import type { ProjectLocationPoint } from "@/lib/types";

const SpatialDetailMap = dynamic(() => import("@/components/spatial-detail-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-xl border border-[#d7dee8] bg-[#f8fafc] text-sm text-[#64748b]">
      지도 불러오는 중…
    </div>
  ),
});

type LandscapeZoneFeature = {
  id: string;
  name: string;
  code: string;
  jurisdiction: string;
  designationYear: string;
  geometryType: string;
};

type LayerFeature = {
  layerId: string;
  layerLabel: string;
  name: string;
  geometry: GeoJSON.Geometry | null;
};

type LandscapeZoneResponse = {
  address: string;
  point: { x: number; y: number };
  inLandscapeZone: boolean;
  matchedZones: LandscapeZoneFeature[];
  layerFeatures?: LayerFeature[];
  disclaimer: string;
};

type LandscapeZoneErrorResponse = {
  error: string;
  stage?: string;
  hint?: string;
  domain?: string;
};

type LandscapeZonePanelProps = {
  address: string;
  locationPoint?: ProjectLocationPoint;
};

const LAYER_CHIP_COLORS: Record<string, string> = {
  "landscape-zone": "bg-[#e8f1ff] text-[#2463b3]",
  "land-use-zone": "bg-[#ecfdf3] text-[#15803d]",
  "cultural-heritage": "bg-[#fef2f2] text-[#b91c1c]",
};

export default function LandscapeZonePanel({ address, locationPoint }: LandscapeZonePanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LandscapeZoneResponse | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadLandscapeZone() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (locationPoint) {
          params.set("x", String(locationPoint.x));
          params.set("y", String(locationPoint.y));
        }
        if (address.trim()) {
          params.set("address", address.trim());
        }

        const response = await fetch(`/api/spatial/landscape-zone?${params.toString()}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as LandscapeZoneResponse | LandscapeZoneErrorResponse;

        if (!response.ok) {
          const errorPayload = payload as LandscapeZoneErrorResponse;
          const parts = [errorPayload.error ?? "경관지구 조회에 실패했습니다."];
          if (errorPayload.hint) parts.push(errorPayload.hint);
          throw new Error(parts.join(" "));
        }

        if (!cancelled) {
          setResult(payload as LandscapeZoneResponse);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "경관지구 조회에 실패했습니다.");
          setResult(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (locationPoint || address.trim()) {
      void loadLandscapeZone();
    } else {
      const timeout = window.setTimeout(() => {
        setLoading(false);
        setError("사업위치가 없어 공간정보를 조회할 수 없습니다.");
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    return () => {
      cancelled = true;
    };
  }, [address, locationPoint]);

  const zoneGroups = buildZoneGroups(result);

  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SubsectionTitle>공간정보 (브이월드)</SubsectionTitle>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
          경관지구·용도지역·문화재
        </span>
      </div>

      {loading ? (
        <p className="rounded-xl bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">공간정보를 조회하는 중입니다...</p>
      ) : null}

      {!loading && error ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p>
      ) : null}

      {!loading && result && locationPoint ? (
        <div className="mb-4">
          <SpatialDetailMap
            point={{ x: locationPoint.x, y: locationPoint.y }}
            layerFeatures={result.layerFeatures ?? []}
          />
        </div>
      ) : null}

      {!loading && result ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="조회 주소" value={result.address} />
            <Info label="좌표" value={`${result.point.y.toFixed(6)}, ${result.point.x.toFixed(6)}`} />
            <Info
              label="경관지구 해당"
              value={result.inLandscapeZone ? "해당 가능" : "인근 조회 결과 없음"}
            />
            <Info label="총 매칭" value={`${countZoneItems(zoneGroups)}건`} />
          </div>

          {zoneGroups.length > 0 ? (
            <div className="space-y-3">
              {zoneGroups.map((group) => {
                const expanded = expandedGroups[group.id] ?? false;

                return (
                  <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={group.id}>
                    <p className="text-sm font-bold text-[#15345b]">
                      {group.label} <span className="text-[#64748b]">({group.items.length}건)</span>
                    </p>
                    <div className="mt-3">
                      <OverflowChipRow
                        chipClassName={LAYER_CHIP_COLORS[group.id] ?? "bg-[#eef4fb] text-[#15345b]"}
                        expanded={expanded}
                        items={group.items.map((item) => ({
                          key: item.key,
                          name: item.name,
                          title: item.detail ?? item.name,
                        }))}
                        onToggleExpand={() =>
                          setExpandedGroups((current) => ({
                            ...current,
                            [group.id]: !expanded,
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">
              조회 반경 내 경관지구·용도지역 정보가 없습니다. 지도 마커 위치를 기준으로 표시됩니다.
            </p>
          )}

          <p className="text-xs leading-5 text-[#64748b]">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}

type ZoneGroupItem = {
  key: string;
  name: string;
  detail?: string;
};

type ZoneGroup = {
  id: string;
  label: string;
  items: ZoneGroupItem[];
};

function buildZoneGroups(result: LandscapeZoneResponse | null): ZoneGroup[] {
  if (!result) return [];

  const groups: ZoneGroup[] = [];

  if (result.matchedZones.length > 0) {
    groups.push({
      id: "landscape-zone",
      label: "경관지구",
      items: result.matchedZones.map((zone) => ({
        key: zone.id,
        name: zone.name,
        detail: `${zone.jurisdiction} · ${zone.designationYear}`,
      })),
    });
  }

  const layerGroups = new Map<string, ZoneGroup>();
  for (const feature of result.layerFeatures ?? []) {
    if (feature.layerId === "landscape-zone") continue;
    const group =
      layerGroups.get(feature.layerId) ??
      ({
        id: feature.layerId,
        label: feature.layerLabel,
        items: [],
      } satisfies ZoneGroup);
    if (!group.items.some((item) => item.key === feature.name)) {
      group.items.push({ key: feature.name, name: feature.name });
    }
    layerGroups.set(feature.layerId, group);
  }

  return [...groups, ...Array.from(layerGroups.values())];
}

function countZoneItems(groups: ZoneGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] px-4 py-3 text-sm">
      <p className="font-semibold text-[#64748b]">{label}</p>
      <p className="mt-1 font-bold text-[#15345b]">{value}</p>
    </div>
  );
}
