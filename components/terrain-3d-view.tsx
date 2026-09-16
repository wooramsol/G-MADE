"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 3D 지형 뷰 — 위성 DEM 격자를 Three.js 표면으로 렌더링. 기본 표시(자동 로드).
 *
 * 조작 구조(사용자 요구):
 * - 위아래 피봇 없음 — 수평 360° 회전만 (시점 고도 고정)
 * - 회전해 놓으면 그 방향으로 대상지를 지나는 "단면"이 지형 위에 빨간 선으로
 *   그려지고, 그 단면의 표고 범위·기복이 방위와 함께 실시간 표시됨
 *   (기존 동서·남북 고정 단면을 대체 — 회전이 곧 단면 방향 선택)
 */
export function Terrain3DView({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [exaggeration, setExaggeration] = useState(1.5);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const applyExaggerationRef = useRef<((value: number) => void) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
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
        const spacingM = payload.spacingM ?? 22;
        const container = containerRef.current;
        const width = container.clientWidth || container.parentElement?.clientWidth || 640;
        const height = 400;

        const elevMin = Math.min(...elevations);
        const elevMax = Math.max(...elevations);
        const relief = Math.max(elevMax - elevMin, 1);
        const sizeM = (n - 1) * spacingM;
        const half = sizeM / 2;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f5f7);

        const camera = new THREE.PerspectiveCamera(46, width / height, 1, 10_000);
        camera.position.set(sizeM * 0.72, sizeM * 0.5, sizeM * 0.72);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        // ── 지형 표면 (표고별 색: 저지대 연녹 → 고지대 갈색) ──
        const geometry = new THREE.PlaneGeometry(sizeM, sizeM, n - 1, n - 1);
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        const colors = new Float32Array(position.count * 3);
        const lowColor = new THREE.Color(0x9dbf8e);
        const highColor = new THREE.Color(0x8a6f4d);
        const baseHeights = new Float32Array(position.count);
        for (let index = 0; index < position.count; index += 1) {
          // 회전 후 세계좌표: -z=북, +x=동. elevations는 남→북 행 순서라 행을 뒤집는다.
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

        // 세계좌표(x,z) → 원 표고(m) 이중선형 보간 — 단면 높이값 계산용
        const elevationAt = (x: number, z: number): number => {
          const colF = Math.min(Math.max((x + half) / spacingM, 0), n - 1);
          const rowGeomF = Math.min(Math.max((z + half) / spacingM, 0), n - 1);
          const rowF = n - 1 - rowGeomF; // 남→북 행 배열 기준
          const c0 = Math.floor(colF);
          const r0 = Math.floor(rowF);
          const c1 = Math.min(c0 + 1, n - 1);
          const r1 = Math.min(r0 + 1, n - 1);
          const tc = colF - c0;
          const tr = rowF - r0;
          const e00 = elevations[r0 * n + c0];
          const e01 = elevations[r0 * n + c1];
          const e10 = elevations[r1 * n + c0];
          const e11 = elevations[r1 * n + c1];
          return (e00 * (1 - tc) + e01 * tc) * (1 - tr) + (e10 * (1 - tc) + e11 * tc) * tr;
        };

        const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const surface = new THREE.Mesh(geometry, material);
        scene.add(surface);

        const wire = new THREE.LineSegments(
          new THREE.WireframeGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0x5a6b7a, transparent: true, opacity: 0.1 }),
        );
        surface.add(wire);

        // 대상지 마커 — 중심 빨간 기둥
        const markerHeight = relief * 2 + 20;
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(2.5, 2.5, markerHeight, 12),
          new THREE.MeshBasicMaterial({ color: 0xc1121f }),
        );
        scene.add(marker);

        // ── 단면 선 (카메라 방위에 따라 갱신) ──
        const SECTION_SAMPLES = 121;
        const sectionPositions = new Float32Array(SECTION_SAMPLES * 3);
        const sectionGeometry = new THREE.BufferGeometry();
        sectionGeometry.setAttribute("position", new THREE.BufferAttribute(sectionPositions, 3));
        const sectionLine = new THREE.Line(
          sectionGeometry,
          new THREE.LineBasicMaterial({ color: 0xc1121f, linewidth: 2 }),
        );
        scene.add(sectionLine);

        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(sizeM, sizeM * 0.8, sizeM * 0.4);
        scene.add(sun);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, relief * 0.75, 0);
        controls.enableDamping = true;
        controls.enablePan = false;
        // 위아래 피봇 고정 — 수평 회전만
        const POLAR = Math.PI * 0.34;
        controls.minPolarAngle = POLAR;
        controls.maxPolarAngle = POLAR;
        controls.maxDistance = sizeM * 2;
        controls.minDistance = sizeM * 0.3;

        const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
        const compassOf = (bearingDeg: number) => COMPASS[Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8];

        let currentExaggeration = 1.5;
        let lastAzimuth = Number.POSITIVE_INFINITY;

        const updateSection = (force = false) => {
          const azimuth = controls.getAzimuthalAngle();
          if (!force && Math.abs(azimuth - lastAzimuth) < 0.008) return;
          lastAzimuth = azimuth;

          // 카메라 방위의 수평 방향 벡터 — 이 방향으로 중심을 지나는 단면
          const dx = Math.sin(azimuth);
          const dz = Math.cos(azimuth);
          const reach = half * 0.98;
          let sectionMin = Number.POSITIVE_INFINITY;
          let sectionMax = Number.NEGATIVE_INFINITY;
          for (let index = 0; index < SECTION_SAMPLES; index += 1) {
            const t = (index / (SECTION_SAMPLES - 1)) * 2 - 1; // -1..1
            const x = dx * t * reach;
            const z = dz * t * reach;
            const elevation = elevationAt(x, z);
            sectionMin = Math.min(sectionMin, elevation);
            sectionMax = Math.max(sectionMax, elevation);
            sectionPositions[index * 3] = x;
            sectionPositions[index * 3 + 1] = (elevation - elevMin) * currentExaggeration + 2;
            sectionPositions[index * 3 + 2] = z;
          }
          sectionGeometry.attributes.position.needsUpdate = true;

          // 방위: 세계 -z=북, +x=동 → bearing = atan2(dx, -dz)
          const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
          if (readoutRef.current) {
            readoutRef.current.textContent =
              `${compassOf(bearing + 180)}→${compassOf(bearing)} 단면 · ` +
              `표고 ${sectionMin.toFixed(1)}~${sectionMax.toFixed(1)}m · 기복 ${(sectionMax - sectionMin).toFixed(1)}m`;
          }
        };

        const applyExaggeration = (factor: number) => {
          currentExaggeration = factor;
          for (let index = 0; index < position.count; index += 1) {
            position.setY(index, baseHeights[index] * factor);
          }
          position.needsUpdate = true;
          geometry.computeVertexNormals();
          const centerElevation = elevationAt(0, 0) - elevMin;
          marker.position.set(0, centerElevation * factor + markerHeight / 2, 0);
          updateSection(true);
        };
        applyExaggeration(1.5);
        applyExaggerationRef.current = applyExaggeration;

        let frame = 0;
        const animate = () => {
          frame = requestAnimationFrame(animate);
          controls.update();
          updateSection();
          renderer.render(scene, camera);
        };
        animate();

        cleanupRef.current = () => {
          cancelAnimationFrame(frame);
          controls.dispose();
          geometry.dispose();
          sectionGeometry.dispose();
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
  }, [projectId]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-xs font-bold text-[#15345b]"
          ref={readoutRef}
        >
          단면 계산 중...
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[#667085]">
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
          드래그로 회전하면 그 방향의 단면(빨간 선) 높이값이 위에 표시됩니다 · 휠 확대 · 기둥이 대상지 —
          위성 DEM(30m 격자) 근사 지형, 참고용입니다.
        </p>
      ) : null}
    </div>
  );
}
