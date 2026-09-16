"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 3D 지형 뷰 — 위성 DEM 격자를 Three.js 표면으로 렌더링.
 * 드래그 회전 · 휠 확대 · 수직 과장 조절 · 대상지 마커(빨간 기둥).
 * "3D로 보기"를 눌렀을 때만 데이터·엔진을 로드한다 (기본 화면 가볍게).
 */
export function Terrain3DView({ projectId }: { projectId: string }) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [exaggeration, setExaggeration] = useState(1.5);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const applyExaggerationRef = useRef<((value: number) => void) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!opened) return;
    let disposed = false;

    (async () => {
      try {
        const response = await fetch(`/api/spatial/terrain-mesh?projectId=${encodeURIComponent(projectId)}`);
        const payload = (await response.json().catch(() => ({}))) as {
          n?: number;
          spacingM?: number;
          elevations?: number[];
          error?: string;
        };
        if (!response.ok || !payload.n || !payload.elevations) {
          throw new Error(payload.error ?? "지형 데이터를 불러오지 못했습니다.");
        }
        if (disposed || !containerRef.current) return;

        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        if (disposed || !containerRef.current) return;

        const { n, elevations } = payload;
        const spacingM = payload.spacingM ?? 16;
        const container = containerRef.current;
        const width = container.clientWidth || container.parentElement?.clientWidth || 640;
        const height = 380;

        const elevMin = Math.min(...elevations);
        const elevMax = Math.max(...elevations);
        const relief = Math.max(elevMax - elevMin, 1);
        const sizeM = (n - 1) * spacingM;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f5f7);

        const camera = new THREE.PerspectiveCamera(48, width / height, 1, 10_000);
        camera.position.set(sizeM * 0.75, sizeM * 0.6, sizeM * 0.75);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        // 지형 표면 — 표고에 따라 저지대(연녹)→고지대(갈색) 정점 색
        const geometry = new THREE.PlaneGeometry(sizeM, sizeM, n - 1, n - 1);
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        const colors = new Float32Array(position.count * 3);
        const lowColor = new THREE.Color(0x9dbf8e);
        const highColor = new THREE.Color(0x8a6f4d);
        const baseHeights = new Float32Array(position.count);
        for (let index = 0; index < position.count; index += 1) {
          // PlaneGeometry 정점 순서: 행(z) × 열(x). elevations는 남→북 행 순서라
          // z축(화면 안쪽=북)과 맞도록 행을 뒤집는다.
          const row = Math.floor(index / n);
          const col = index % n;
          const elevation = elevations[(n - 1 - row) * n + col];
          baseHeights[index] = elevation - elevMin;
          const t = (elevation - elevMin) / relief;
          const color = lowColor.clone().lerp(highColor, t);
          colors[index * 3] = color.r;
          colors[index * 3 + 1] = color.g;
          colors[index * 3 + 2] = color.b;
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

        const applyExaggeration = (factor: number) => {
          for (let index = 0; index < position.count; index += 1) {
            position.setY(index, baseHeights[index] * factor);
          }
          position.needsUpdate = true;
          geometry.computeVertexNormals();
        };
        applyExaggeration(1.5);
        applyExaggerationRef.current = applyExaggeration;

        const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const surface = new THREE.Mesh(geometry, material);
        scene.add(surface);

        const wire = new THREE.LineSegments(
          new THREE.WireframeGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x5a6b7a, transparent: true, opacity: 0.12 }),
        );
        surface.add(wire);

        // 대상지 마커 — 중심의 빨간 기둥
        const markerHeight = relief * 1.5 + 24;
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(3, 3, markerHeight, 12),
          new THREE.MeshBasicMaterial({ color: 0xc1121f }),
        );
        marker.position.set(0, markerHeight / 2, 0);
        scene.add(marker);

        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(sizeM, sizeM * 0.8, sizeM * 0.4);
        scene.add(sun);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, relief * 0.6, 0);
        controls.enableDamping = true;
        controls.maxDistance = sizeM * 2.2;
        controls.minDistance = sizeM * 0.15;

        let frame = 0;
        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        cleanupRef.current = () => {
          cancelAnimationFrame(frame);
          controls.dispose();
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
        setStatus("ready");
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : "3D 지형을 표시하지 못했습니다.");
          setStatus("error");
        }
      }
    })();

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
      applyExaggerationRef.current = null;
    };
  }, [opened, projectId]);

  if (!opened) {
    return (
      <button
        className="mt-2 rounded-[4px] border border-[#c9d6e6] bg-white px-3 py-1.5 text-xs font-bold text-[#2463b3] hover:bg-[#f0f7ff]"
        onClick={() => {
          setStatus("loading");
          setOpened(true);
        }}
        type="button"
      >
        3D 지형으로 보기
      </button>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[11px] font-bold text-[#475569]">3D 지형 (±220m)</p>
        <label className="flex items-center gap-1.5 text-[11px] text-[#667085]">
          수직 과장 {exaggeration.toFixed(1)}×
          <input
            max={3}
            min={1}
            onChange={(event) => {
              const value = Number(event.target.value);
              setExaggeration(value);
              applyExaggerationRef.current?.(value);
            }}
            step={0.1}
            type="range"
            value={exaggeration}
          />
        </label>
        <button
          className="ml-auto rounded-[3px] px-2 py-0.5 text-[11px] font-bold text-[#667085] hover:bg-[#f1f5f9]"
          onClick={() => {
            cleanupRef.current?.();
            cleanupRef.current = null;
            setOpened(false);
            setStatus("idle");
          }}
          type="button"
        >
          닫기
        </button>
      </div>
      {status === "loading" ? (
        <p className="mt-2 rounded-[4px] border border-dashed border-[#d0d5dd] bg-[#f8fafc] px-3 py-6 text-center text-xs text-[#94a3b8]">
          지형 데이터를 불러와 3D로 만드는 중...
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-2 rounded-[4px] border border-dashed border-[#e4c7c7] bg-[#fdf7f7] px-3 py-3 text-xs text-[#b45050]">
          {errorMessage}
        </p>
      ) : null}
      <div
        className={`mt-2 overflow-hidden rounded-[4px] ${status === "ready" ? "border border-[#d0d5dd]" : ""}`}
        ref={containerRef}
      />
      {status === "ready" ? (
        <p className="mt-1.5 text-[11px] leading-4 text-[#94a3b8]">
          드래그 회전 · 휠 확대 · 빨간 기둥이 대상지 — 위성 DEM(30m 격자) 근사 지형, 참고용입니다.
        </p>
      ) : null}
    </div>
  );
}
