"use client";

import { useEffect, useRef, useState } from "react";

type CameraPreset = "birds" | "persp" | "top";

const PRESET_LABELS: Record<CameraPreset, string> = {
  birds: "조감 (사시도)",
  persp: "투시 (낮은 시점)",
  top: "수직 (평면)",
};

/**
 * 브이월드 WebGL 3D 지도 — 사업지 상공에서 조감(사시도)·투시·수직 카메라로
 * 주변 지형·건물을 입체적으로 보여줍니다.
 * 브이월드 로더가 document.write를 사용하므로 iframe(일반 HTML 문서)으로 로드하고,
 * 카메라 전환은 postMessage로 iframe에 전달합니다.
 */
export default function Vworld3DView({ x, y }: { x: number; y: number }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [preset, setPreset] = useState<CameraPreset>("birds");

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = (event.data ?? {}) as { type?: string; message?: string };
      if (data.type === "vworld3d-ready") {
        setStatus("ready");
      } else if (data.type === "vworld3d-error") {
        setErrorMessage(data.message ?? "3D 지도를 불러오지 못했습니다.");
        setStatus("error");
      }
    }

    window.addEventListener("message", handleMessage);
    const timeout = window.setTimeout(() => {
      setStatus((current) => {
        if (current !== "loading") return current;
        setErrorMessage("3D 엔진 초기화 시간 초과 — 브이월드 인증키의 서비스 URL 등록을 확인해 주세요.");
        return "error";
      });
    }, 45_000);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(timeout);
    };
  }, []);

  function applyPreset(next: CameraPreset) {
    setPreset(next);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "vworld3d-preset", preset: next },
      window.location.origin,
    );
  }

  function goHome() {
    setPreset("birds");
    iframeRef.current?.contentWindow?.postMessage({ type: "vworld3d-home" }, window.location.origin);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {(Object.keys(PRESET_LABELS) as CameraPreset[]).map((name) => (
          <button
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
              preset === name ? "bg-[#2463b3] text-white" : "bg-[#eef4fb] text-[#2463b3] hover:bg-[#dcebfb]"
            }`}
            disabled={status !== "ready"}
            key={name}
            onClick={() => applyPreset(name)}
            type="button"
          >
            {PRESET_LABELS[name]}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-[#d7dee8]" />
        <button
          aria-label="처음 위치로"
          className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-[#2463b3] hover:bg-[#dcebfb] disabled:opacity-50"
          disabled={status !== "ready"}
          onClick={goHome}
          title="사업지 상공 처음 위치로 되돌아갑니다"
          type="button"
        >
          ⌂ 처음 위치
        </button>
      </div>

      {status === "error" ? (
        <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-md border border-[#d7dee8] bg-[#f8fafc] px-6 text-center">
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
        <div className="relative h-[320px] w-full overflow-hidden rounded-md border border-[#d7dee8] bg-[#0b1220]">
          <iframe
            className="h-full w-full border-0"
            ref={iframeRef}
            src={`/api/spatial/vworld-3d-frame?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`}
            title="브이월드 3D 지도"
          />
          {status === "loading" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-[#94a3b8]">
              3D 지형·건물 불러오는 중…
            </div>
          ) : null}
          {status === "ready" ? (
            <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-white backdrop-blur-sm">
              <span>🖱 드래그: 이동</span>
              <span>휠: 확대·축소</span>
              <span>휠 클릭+드래그: 회전·기울기</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
