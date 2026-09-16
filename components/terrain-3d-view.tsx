"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 3D 지형 단면 뷰 — 측면 시점 고정, 수평 360° 회전.
 *
 * 회전하면 카메라 쪽 절반 지형을 클리핑으로 잘라내 "실제 단면"이 드러나고,
 * 절단면은 남색 커튼 + 상단 외곽선(빨강)으로 단면 차트처럼 표시된다.
 * 최고점·양끝 표고와 기복 치수를 외곽선 위에 라벨로 직접 표기.
 */
export function Terrain3DView({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [exaggeration, setExaggeration] = useState(1.5);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const labelPeakRef = useRef<HTMLSpanElement | null>(null);
  const labelStartRef = useRef<HTMLSpanElement | null>(null);
  const labelEndRef = useRef<HTMLSpanElement | null>(null);
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
        // 단면은 넓고 낮은 형상 — 가로 비례(32%)로 세로 여백 최소화
        const height = Math.max(240, Math.min(380, Math.round(width * 0.32)));

        const elevMin = Math.min(...elevations);
        const elevMax = Math.max(...elevations);
        const relief = Math.max(elevMax - elevMin, 1);
        const sizeM = (n - 1) * spacingM;
        const half = sizeM / 2;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf4f5f7);

        const camera = new THREE.PerspectiveCamera(42, width / height, 1, 10_000);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        renderer.localClippingEnabled = true;
        container.appendChild(renderer.domElement);

        // 카메라 쪽 절반을 잘라내는 클리핑 평면 (회전 시 법선 갱신)
        const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.01);

        // ── 지형 표면 ──
        const geometry = new THREE.PlaneGeometry(sizeM, sizeM, n - 1, n - 1);
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        const colors = new Float32Array(position.count * 3);
        const lowColor = new THREE.Color(0x9dbf8e);
        const highColor = new THREE.Color(0x8a6f4d);
        const baseHeights = new Float32Array(position.count);
        for (let index = 0; index < position.count; index += 1) {
          // 세계좌표: -z=북, +x=동. elevations는 남→북 행 순서라 행을 뒤집는다.
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

        const elevationAt = (x: number, z: number): number => {
          const colF = Math.min(Math.max((x + half) / spacingM, 0), n - 1);
          const rowGeomF = Math.min(Math.max((z + half) / spacingM, 0), n - 1);
          const rowF = n - 1 - rowGeomF;
          const c0 = Math.floor(colF);
          const r0 = Math.floor(rowF);
          const c1 = Math.min(c0 + 1, n - 1);
          const r1 = Math.min(r0 + 1, n - 1);
          const tc = colF - c0;
          const tr = rowF - r0;
          return (
            (elevations[r0 * n + c0] * (1 - tc) + elevations[r0 * n + c1] * tc) * (1 - tr) +
            (elevations[r1 * n + c0] * (1 - tc) + elevations[r1 * n + c1] * tc) * tr
          );
        };

        const material = new THREE.MeshLambertMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          clippingPlanes: [clipPlane],
        });
        const surface = new THREE.Mesh(geometry, material);
        scene.add(surface);

        // ── 절단면: 외곽선 아래를 불투명하게 채워 "단면"임을 표현 ──
        // (절단으로 드러나는 내부의 어두운 이면도 이 면이 가린다)
        const SAMPLES = 141;
        const curtainPositions = new Float32Array(SAMPLES * 2 * 3);
        const curtainIndex: number[] = [];
        for (let s = 0; s < SAMPLES - 1; s += 1) {
          const a = s * 2;
          curtainIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        const curtainGeometry = new THREE.BufferGeometry();
        curtainGeometry.setAttribute("position", new THREE.BufferAttribute(curtainPositions, 3));
        curtainGeometry.setIndex(curtainIndex);
        const curtain = new THREE.Mesh(
          curtainGeometry,
          new THREE.MeshBasicMaterial({ color: 0xd9cfc0, side: THREE.DoubleSide }),
        );
        scene.add(curtain);

        const outlinePositions = new Float32Array(SAMPLES * 3);
        const outlineGeometry = new THREE.BufferGeometry();
        outlineGeometry.setAttribute("position", new THREE.BufferAttribute(outlinePositions, 3));
        const outline = new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xc1121f }));
        scene.add(outline);

        // 대상지 마커
        const markerHeight = relief * 2 + 20;
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(2.5, 2.5, markerHeight, 12),
          new THREE.MeshBasicMaterial({ color: 0xc1121f }),
        );
        scene.add(marker);

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.85);
        sun.position.set(sizeM, sizeM * 0.9, sizeM * 0.3);
        scene.add(sun);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        // 측면 시점 고정 — 수평 회전만
        const POLAR = Math.PI * 0.46;
        controls.minPolarAngle = POLAR;
        controls.maxPolarAngle = POLAR;
        controls.maxDistance = sizeM * 2.4;
        controls.minDistance = sizeM * 0.5;

        const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
        const compassOf = (bearingDeg: number) =>
          COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];

        let currentExaggeration = 1.5;
        let lastAzimuth = Number.POSITIVE_INFINITY;
        // 라벨 위치 계산용 월드 포인트
        const peakWorld = new THREE.Vector3();
        const startWorld = new THREE.Vector3();
        const endWorld = new THREE.Vector3();
        const projected = new THREE.Vector3();

        const updateSection = (force = false) => {
          const azimuth = controls.getAzimuthalAngle();
          if (!force && Math.abs(azimuth - lastAzimuth) < 0.006) return;
          lastAzimuth = azimuth;

          const dx = Math.sin(azimuth);
          const dz = Math.cos(azimuth);
          // 카메라 쪽 절반 제거: 법선이 카메라 반대 방향
          clipPlane.normal.set(-dx, 0, -dz);
          clipPlane.constant = 0.01;

          // 단면의 좌우가 화면과 일치하도록: 화면 오른쪽 = 시선 방향의 오른손 수평 벡터
          const rx = Math.sin(azimuth + Math.PI / 2);
          const rz = Math.cos(azimuth + Math.PI / 2);
          // 지형(정사각형) 경계까지 정확히 닿는 길이 — 대각 방향에선 모서리까지
          const reach = half / Math.max(Math.abs(rx), Math.abs(rz), 1e-6);

          let sectionMin = Number.POSITIVE_INFINITY;
          let sectionMax = Number.NEGATIVE_INFINITY;
          let peakT = 0;
          for (let index = 0; index < SAMPLES; index += 1) {
            const t = (index / (SAMPLES - 1)) * 2 - 1;
            const x = rx * t * reach;
            const z = rz * t * reach;
            const elevation = elevationAt(x, z);
            if (elevation > sectionMax) {
              sectionMax = elevation;
              peakT = t;
            }
            sectionMin = Math.min(sectionMin, elevation);
            const y = (elevation - elevMin) * currentExaggeration;
            outlinePositions[index * 3] = x;
            outlinePositions[index * 3 + 1] = y + 1.5;
            outlinePositions[index * 3 + 2] = z;
            const a = index * 2 * 3;
            curtainPositions[a] = x;
            curtainPositions[a + 1] = y;
            curtainPositions[a + 2] = z;
            curtainPositions[a + 3] = x;
            curtainPositions[a + 4] = 0;
            curtainPositions[a + 5] = z;
          }
          outlineGeometry.attributes.position.needsUpdate = true;
          curtainGeometry.attributes.position.needsUpdate = true;

          peakWorld.set(
            rx * peakT * reach,
            (sectionMax - elevMin) * currentExaggeration + 4,
            rz * peakT * reach,
          );
          startWorld.set(-rx * reach, (elevationAt(-rx * reach, -rz * reach) - elevMin) * currentExaggeration + 4, -rz * reach);
          endWorld.set(rx * reach, (elevationAt(rx * reach, rz * reach) - elevMin) * currentExaggeration + 4, rz * reach);

          if (labelPeakRef.current) labelPeakRef.current.textContent = `▲ ${sectionMax.toFixed(1)}m`;
          if (labelStartRef.current)
            labelStartRef.current.textContent = `${elevationAt(-rx * reach, -rz * reach).toFixed(1)}m`;
          if (labelEndRef.current)
            labelEndRef.current.textContent = `${elevationAt(rx * reach, rz * reach).toFixed(1)}m`;

          const bearing = (Math.atan2(rx, -rz) * 180) / Math.PI;
          if (readoutRef.current) {
            readoutRef.current.textContent =
              `${compassOf(bearing + 180)}→${compassOf(bearing)} 단면 (${Math.round(reach * 2)}m) · ` +
              `표고 ${sectionMin.toFixed(1)}~${sectionMax.toFixed(1)}m · 기복 ${(sectionMax - sectionMin).toFixed(1)}m`;
          }
        };

        const placeLabel = (element: HTMLSpanElement | null, world: typeof peakWorld) => {
          if (!element) return;
          projected.copy(world).project(camera);
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          const visible = projected.z < 1 && x > -40 && x < width + 40;
          element.style.transform = `translate(-50%, -100%) translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
          element.style.opacity = visible ? "1" : "0";
        };

        const applyExaggeration = (factor: number) => {
          currentExaggeration = factor;
          for (let index = 0; index < position.count; index += 1) {
            position.setY(index, baseHeights[index] * factor);
          }
          position.needsUpdate = true;
          geometry.computeVertexNormals();
          const centerBase = elevationAt(0, 0) - elevMin;
          marker.position.set(0, centerBase * factor + markerHeight / 2, 0);
          const midY = relief * 0.5 * factor;
          controls.target.set(0, midY, 0);
          if (camera.position.lengthSq() < 1) {
            // 회전 중 투영 폭이 최대가 되는 대각 방향(√2배) 기준으로 거리 계산 —
            // 어느 방향에서도 좌우가 잘리지 않음 (여유 6%)
            const vFov = (camera.fov * Math.PI) / 180;
            const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
            const maxHalfWidth = (sizeM * Math.SQRT2) / 2;
            const distance = (maxHalfWidth * 1.06) / Math.tan(hFov / 2);
            const polar = Math.PI * 0.46;
            camera.position.set(
              Math.sin(polar) * Math.sin(0.5) * distance,
              midY + Math.cos(polar) * distance,
              Math.sin(polar) * Math.cos(0.5) * distance,
            );
            controls.minDistance = distance * 0.45;
            controls.maxDistance = distance * 1.7;
          }
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
          placeLabel(labelPeakRef.current, peakWorld);
          placeLabel(labelStartRef.current, startWorld);
          placeLabel(labelEndRef.current, endWorld);
        };
        animate();

        cleanupRef.current = () => {
          cancelAnimationFrame(frame);
          controls.dispose();
          geometry.dispose();
          curtainGeometry.dispose();
          outlineGeometry.dispose();
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

  const labelClass =
    "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[3px] bg-white/85 px-1 py-0.5 text-[10px] font-bold text-[#c1121f] transition-opacity";

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-[#15345b]" ref={readoutRef}>
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
      <div className={`relative mt-2 overflow-hidden rounded-[4px] ${status === "ready" ? "border border-[#d0d5dd]" : ""}`}>
        <div ref={containerRef} />
        <span className={labelClass} ref={labelPeakRef} style={{ opacity: 0 }} />
        <span className={labelClass} ref={labelStartRef} style={{ opacity: 0 }} />
        <span className={labelClass} ref={labelEndRef} style={{ opacity: 0 }} />
      </div>
      {status === "ready" ? (
        <p className="mt-1.5 text-[11px] leading-4 text-[#94a3b8]">
          드래그로 회전하면 그 방향 단면이 잘려 보이고 외곽선에 표고가 표시됩니다 · 휠 확대 · 기둥이 대상지 —
          위성 DEM(30m 격자) 근사 지형, 참고용입니다.
        </p>
      ) : null}
    </div>
  );
}
