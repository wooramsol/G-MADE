"use client";

import { useEffect, useId, useRef, useState } from "react";

type CameraPreset = "조감" | "투시" | "수직";

/** 카메라 프리셋: [고도(m), tilt(도)] — 조감=사시도, 투시=낮은 시점, 수직=평면 */
const PRESETS: Record<CameraPreset, { height: number; tilt: number }> = {
  조감: { height: 600, tilt: -45 },
  투시: { height: 200, tilt: -15 },
  수직: { height: 800, tilt: -90 },
};

/* eslint-disable @typescript-eslint/no-explicit-any */

let scriptPromise: Promise<void> | null = null;

function loadVworldScript(apiKey: string, domain: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("클라이언트에서만 사용 가능합니다."));
  if ((window as any).vw?.Map) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://map.vworld.kr/js/webglMapInit.js.do?version=2.0&apiKey=${encodeURIComponent(apiKey)}&domain=${encodeURIComponent(domain)}`;
    script.async = true;
    script.onload = () => {
      // 엔진 초기화가 약간 지연될 수 있어 vw 전역이 준비될 때까지 대기
      const startedAt = Date.now();
      const wait = () => {
        if ((window as any).vw?.Map) return resolve();
        if (Date.now() - startedAt > 15_000) return reject(new Error("브이월드 3D 엔진 초기화 시간 초과"));
        window.setTimeout(wait, 200);
      };
      wait();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("브이월드 3D 스크립트를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * 브이월드 WebGL 3D 지도 — 사업지 상공에서 조감(사시도)·투시·수직 카메라로
 * 주변 지형·건물 형태를 입체적으로 보여줍니다.
 * 키는 서버의 VWORLD_API_KEY를 로그인 사용자 전용 API로 전달받아 사용합니다.
 */
export default function Vworld3DView({ x, y }: { x: number; y: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [preset, setPreset] = useState<CameraPreset>("조감");
  const reactId = useId();
  const containerId = `vworld3d-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const keyResponse = await fetch("/api/spatial/client-key", { credentials: "same-origin" });
        const keyPayload = (await keyResponse.json().catch(() => ({}))) as {
          key?: string;
          domain?: string;
          error?: string;
        };
        if (!keyResponse.ok || !keyPayload.key) {
          throw new Error(keyPayload.error ?? "브이월드 키를 가져오지 못했습니다.");
        }

        await loadVworldScript(keyPayload.key, keyPayload.domain ?? window.location.hostname);
        if (cancelled || !containerRef.current) return;

        const vw = (window as any).vw;
        const { height, tilt } = PRESETS["조감"];
        const start = new vw.CameraPosition(new vw.CoordZ(x, y, height), new vw.Direction(0, tilt, 0));
        const mapOptions = new vw.MapOptions(
          vw.BasemapType.GRAPHIC,
          "",
          vw.DensityType.BASIC,
          vw.DensityType.BASIC,
          false,
          start,
          start,
        );
        mapRef.current = new vw.Map(containerId, mapOptions);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "3D 지도를 불러오지 못했습니다.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, [containerId, x, y]);

  function applyPreset(next: CameraPreset) {
    setPreset(next);
    const vw = (window as any).vw;
    const map = mapRef.current;
    if (!vw || !map) return;

    const { height, tilt } = PRESETS[next];
    try {
      map.moveTo(new vw.CameraPosition(new vw.CoordZ(x, y, height), new vw.Direction(0, tilt, 0)));
    } catch {
      // moveTo 미지원 버전 폴백: 카메라 이동 실패는 무시 (사용자가 직접 조작 가능)
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(Object.keys(PRESETS) as CameraPreset[]).map((name) => (
          <button
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
              preset === name ? "bg-[#2463b3] text-white" : "bg-[#eef4fb] text-[#2463b3] hover:bg-[#dcebfb]"
            }`}
            disabled={status !== "ready"}
            key={name}
            onClick={() => applyPreset(name)}
            type="button"
          >
            {name === "조감" ? "조감 (사시도)" : name === "투시" ? "투시 (낮은 시점)" : "수직 (평면)"}
          </button>
        ))}
        <span className="text-[11px] text-[#94a3b8]">마우스 드래그·휠로 회전·확대 가능</span>
      </div>

      {status === "error" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-6 text-center">
          <p className="text-sm font-semibold text-[#475569]">3D 지도를 표시할 수 없습니다</p>
          <p className="text-xs leading-5 text-[#64748b]">{errorMessage}</p>
          <a
            className="mt-1 rounded-lg bg-[#2463b3] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1d4f8c]"
            href="https://map.vworld.kr/map/ws3dmap.do"
            rel="noreferrer"
            target="_blank"
          >
            브이월드 3D 지도 새 탭에서 열기
          </a>
        </div>
      ) : (
        <div
          className="h-[320px] w-full overflow-hidden rounded-xl border border-[#d7dee8] bg-[#0b1220]"
          id={containerId}
          ref={containerRef}
        >
          {status === "loading" ? (
            <div className="flex h-full items-center justify-center text-sm text-[#94a3b8]">
              3D 지형·건물 불러오는 중…
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
