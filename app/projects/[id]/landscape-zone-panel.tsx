"use client";

import { useEffect, useState } from "react";

type LandscapeZoneFeature = {
  id: string;
  name: string;
  code: string;
  jurisdiction: string;
  designationYear: string;
  geometryType: string;
};

type LandscapeZoneResponse = {
  address: string;
  point: { x: number; y: number };
  inLandscapeZone: boolean;
  matchedZones: LandscapeZoneFeature[];
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
};

export default function LandscapeZonePanel({ address }: LandscapeZonePanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LandscapeZoneResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLandscapeZone() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/spatial/landscape-zone?address=${encodeURIComponent(address)}`, {
          credentials: "same-origin",
        });
        const payload = (await response.json()) as LandscapeZoneResponse | LandscapeZoneErrorResponse;

        if (!response.ok) {
          const errorPayload = payload as LandscapeZoneErrorResponse;
          const parts = [errorPayload.error ?? "경관지구 조회에 실패했습니다."];
          if (errorPayload.hint) parts.push(errorPayload.hint);
          if (errorPayload.domain) parts.push(`도메인: ${errorPayload.domain}`);
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

    if (address.trim()) {
      void loadLandscapeZone();
    } else {
      setLoading(false);
      setError("사업위치가 없어 경관지구를 조회할 수 없습니다.");
    }

    return () => {
      cancelled = true;
    };
  }, [address]);

  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Spatial Context</p>
          <h3 className="mt-1 text-lg font-bold text-[#15345b]">경관지구 공간정보 (브이월드)</h3>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">lt_c_uq121</span>
      </div>

      {loading ? (
        <p className="rounded-xl bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">사업위치 기준 경관지구를 조회하는 중입니다...</p>
      ) : null}

      {!loading && error ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p>
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
            <Info label="매칭 건수" value={`${result.matchedZones.length}건`} />
          </div>

          {result.matchedZones.length > 0 ? (
            <div className="space-y-3">
              {result.matchedZones.map((zone) => (
                <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm" key={zone.id}>
                  <p className="font-bold text-[#15345b]">{zone.name}</p>
                  <p className="mt-1 text-[#64748b]">
                    코드 {zone.code} · {zone.jurisdiction} · 지정연도 {zone.designationYear}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">
              조회 반경 내 경관지구 레이어가 확인되지 않았습니다. 주소를 더 구체적으로 입력하거나 지도 검토가 필요할 수 있습니다.
            </p>
          )}

          <p className="text-xs leading-5 text-[#64748b]">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] px-4 py-3 text-sm">
      <p className="font-semibold text-[#64748b]">{label}</p>
      <p className="mt-1 font-bold text-[#15345b]">{value}</p>
    </div>
  );
}
