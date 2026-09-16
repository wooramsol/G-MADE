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
  const labelHereRef = useRef<HTMLSpanElement | null>(null);
  const applyExaggerationRef = useRef<((value: number) => void) | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const [response, buildingsResponse] = await Promise.all([
          fetch(`/api/spatial/terrain-mesh?projectId=${encodeURIComponent(projectId)}`),
          fetch(`/api/spatial/terrain-buildings?projectId=${encodeURIComponent(projectId)}`).catch(() => null),
        ]);
        const payload = (await response.json().catch(() => ({}))) as {
          n?: number;
          spacingM?: number;
          elevations?: number[];
          error?: string;
        };
        const buildingsPayload =
          buildingsResponse && buildingsResponse.ok
            ? ((await buildingsResponse.json().catch(() => ({}))) as {
                buildings?: Array<{ floors: number; ring: Array<[number, number]> }>;
              })
            : {};
        const buildings = buildingsPayload.buildings ?? [];
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
        // 캔버스 높이는 지형의 실제 세로 크기(기복×과장)에 비례해 동적 산정 —
        // 평탄지는 낮게, 기복 큰 지형은 높게 (크롭 방지). 과장 변경 시 재계산.
        let height = 200; // applyExaggeration에서 즉시 재계산됨

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

        // 표면 메시(PlaneGeometry)와 "동일한" 삼각형 분할 보간 — 이중선형과의 미세한
        // 차이가 절단면과 커튼 사이 틈으로 보이던 문제를 원천 제거한다.
        const vertexElevation = (ix: number, iy: number): number =>
          elevations[(n - 1 - iy) * n + ix];
        const elevationAt = (x: number, z: number): number => {
          const fx = Math.min(Math.max((x + half) / spacingM, 0), n - 1 - 1e-9);
          const fz = Math.min(Math.max((z + half) / spacingM, 0), n - 1 - 1e-9);
          const ix = Math.floor(fx);
          const iy = Math.floor(fz);
          const u = fx - ix;
          const v = fz - iy;
          const eA = vertexElevation(ix, iy);
          const eB = vertexElevation(ix, iy + 1);
          const eC = vertexElevation(ix + 1, iy + 1);
          const eD = vertexElevation(ix + 1, iy);
          // PlaneGeometry 삼각형: (a,b,d)=u+v≤1, (b,c,d)=u+v≥1
          if (u + v <= 1) return eA + (eD - eA) * u + (eB - eA) * v;
          return eC + (eB - eC) * (1 - u) + (eD - eC) * (1 - v);
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
        const SAMPLES = 281;
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

        // ── 주변 건물 (브이월드 형상 + 층수×3m 압출, 지형과 동일한 과장·절단) ──
        const FLOOR_HEIGHT_M = 3;
        const buildingMaterial = new THREE.MeshLambertMaterial({
          color: 0xb6bcc6,
          clippingPlanes: [clipPlane],
        });
        const buildingMeshes: Array<{ mesh: InstanceType<typeof THREE.Mesh>; baseElevation: number }> = [];
        const buildingsGroup = new THREE.Group();
        for (const building of buildings) {
          try {
            const shape = new THREE.Shape();
            building.ring.forEach(([bx, bz], index) => {
              // Shape(XY) → rotateX(-90°) 후 (x, z=-y)가 되므로 py = -z 로 넣는다
              if (index === 0) shape.moveTo(bx, -bz);
              else shape.lineTo(bx, -bz);
            });
            shape.closePath();
            const floors = Math.max(1, Math.min(80, building.floors));
            const extrude = new THREE.ExtrudeGeometry(shape, {
              depth: floors * FLOOR_HEIGHT_M,
              bevelEnabled: false,
            });
            extrude.rotateX(-Math.PI / 2);
            extrude.computeBoundingBox(); // 첫 캔버스 크기 계산에서 건물 높이 반영
            const mesh = new THREE.Mesh(extrude, buildingMaterial);
            // 바닥 기준 표고: 외곽 중심점의 지형 높이
            const cx = building.ring.reduce((sum, pt) => sum + pt[0], 0) / building.ring.length;
            const cz = building.ring.reduce((sum, pt) => sum + pt[1], 0) / building.ring.length;
            const half2 = sizeM / 2;
            if (Math.abs(cx) > half2 || Math.abs(cz) > half2) continue; // 지형 밖 제외
            const baseElevation = elevationAt(cx, cz) - elevMin;
            buildingMeshes.push({ mesh, baseElevation });
            buildingsGroup.add(mesh);
          } catch {
            // 형상 이상 건물은 건너뜀
          }
        }
        scene.add(buildingsGroup);

        // 대상지 마커 — 지표에서 위로 뻗는 선 (화면상 약 2px 두께의 얇은 원기둥)
        const lineHeight = Math.max(28, sizeM * 0.07);
        const markerGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
        const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: 0xc1121f }));
        scene.add(marker);
        const markerWorld = new THREE.Vector3();

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
        // 최고점이 단면 끝점과 사실상 같으면 끝 라벨을 숨기고 ▲ 하나로 통합
        let hideStartLabel = false;
        let hideEndLabel = false;
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
          const edgeEpsilon = sizeM * 0.0015;
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
            // 경계에 딱 맞게: 수직 오프셋 없이, z-파이팅 방지를 위해 카메라 쪽으로만 미세 이동
            outlinePositions[index * 3] = x + dx * edgeEpsilon;
            outlinePositions[index * 3 + 1] = y;
            outlinePositions[index * 3 + 2] = z + dz * edgeEpsilon;
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

          const startElevation = elevationAt(-rx * reach, -rz * reach);
          const endElevation = elevationAt(rx * reach, rz * reach);
          hideStartLabel = Math.abs(startElevation - sectionMax) < 0.05 && peakT < -0.85;
          hideEndLabel = Math.abs(endElevation - sectionMax) < 0.05 && peakT > 0.85;
          if (labelPeakRef.current) labelPeakRef.current.textContent = `▲ ${sectionMax.toFixed(1)}m`;
          if (labelStartRef.current) labelStartRef.current.textContent = `${startElevation.toFixed(1)}m`;
          if (labelEndRef.current) labelEndRef.current.textContent = `${endElevation.toFixed(1)}m`;

          const bearing = (Math.atan2(rx, -rz) * 180) / Math.PI;
          if (readoutRef.current) {
            readoutRef.current.textContent =
              `${compassOf(bearing + 180)}→${compassOf(bearing)} 단면 (${Math.round(reach * 2)}m) · ` +
              `표고 ${sectionMin.toFixed(1)}~${sectionMax.toFixed(1)}m · 기복 ${(sectionMax - sectionMin).toFixed(1)}m`;
          }
        };

        // 라벨 배치 + 겹침 회피: 앞서 놓인 라벨과 겹치면 위로 한 칸(22px)씩 쌓는다
        const LABEL_W = 76;
        const LABEL_H = 22;
        const placedRects: Array<{ x: number; y: number }> = [];
        const placeLabel = (element: HTMLSpanElement | null, world: typeof peakWorld) => {
          if (!element) return;
          projected.copy(world).project(camera);
          const x = (projected.x * 0.5 + 0.5) * width;
          let y = (-projected.y * 0.5 + 0.5) * height;
          const visible = projected.z < 1 && x > -40 && x < width + 40;
          if (visible) {
            let moved = true;
            while (moved) {
              moved = false;
              for (const rect of placedRects) {
                if (Math.abs(rect.x - x) < LABEL_W && Math.abs(rect.y - y) < LABEL_H) {
                  y = rect.y - LABEL_H; // 세로로 나란히 (위로 쌓기)
                  moved = true;
                }
              }
            }
            placedRects.push({ x, y });
          }
          element.style.transform = `translate(-50%, -100%) translate(${x.toFixed(0)}px, ${Math.max(LABEL_H, y).toFixed(0)}px)`;
          element.style.opacity = visible ? "1" : "0";
        };

        const applyExaggeration = (factor: number) => {
          currentExaggeration = factor;
          for (let index = 0; index < position.count; index += 1) {
            position.setY(index, baseHeights[index] * factor);
          }
          position.needsUpdate = true;
          geometry.computeVertexNormals();
          for (const entry of buildingMeshes) {
            entry.mesh.scale.y = factor;
            entry.mesh.position.y = entry.baseElevation * factor;
          }

          const centerBase = elevationAt(0, 0) - elevMin;
          const baseY = centerBase * factor + 1;
          // 화면상 2px 두께: 카메라 거리에서 1px에 해당하는 월드 길이 × 2 (지름)
          const cameraDistance = camera.position.distanceTo(controls.target) || sizeM;
          const pixelWorld = (2 * cameraDistance * Math.tan(((camera.fov * Math.PI) / 180) / 2)) / height;
          marker.scale.set(pixelWorld / 2, lineHeight, pixelWorld / 2); // 지름 = 화면상 약 1px
          marker.position.set(0, baseY + lineHeight / 2, 0);
          markerWorld.set(0, baseY + lineHeight + 3, 0);
          // 세로 콘텐츠: 지반(0) ~ max(마커 꼭대기, 최고 건물 꼭대기)
          const tallestBuildingTop = buildingMeshes.reduce(
            (max, entry) =>
              Math.max(max, entry.baseElevation * factor + (entry.mesh.geometry.boundingBox?.max.y ?? 0) * factor),
            0,
          );
          const contentTop = Math.max(relief * factor + lineHeight + 6, tallestBuildingTop + 8);
          const midY = contentTop / 2;
          controls.target.set(0, midY, 0);

          // 회전 중 최대 투영 폭(대각 √2배) — 이 폭이 화면 가로에 딱 차도록 유지
          const worldWidth = sizeM * Math.SQRT2 * 1.06;
          // 캔버스 높이 = 콘텐츠 세로(월드) 환산 픽셀 + '현재위치' HTML 라벨 몫(고정 px)
          const LABEL_HEADROOM_PX = 30;
          height = Math.max(
            150,
            Math.min(500, Math.round((width * contentTop * 1.06) / worldWidth) + LABEL_HEADROOM_PX),
          );
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();

          const vFov = (camera.fov * Math.PI) / 180;
          const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
          const distance = (worldWidth / 2) / Math.tan(hFov / 2);
          if (camera.position.lengthSq() < 1) {
            const polar = Math.PI * 0.46;
            camera.position.set(
              Math.sin(polar) * Math.sin(0.5) * distance,
              midY + Math.cos(polar) * distance,
              Math.sin(polar) * Math.cos(0.5) * distance,
            );
          } else {
            // 방향 유지, 거리만 재적용
            const direction = camera.position.clone().sub(controls.target).normalize();
            camera.position.copy(controls.target).addScaledVector(direction, distance);
          }
          controls.minDistance = distance * 0.45;
          controls.maxDistance = distance * 1.7;
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
          placedRects.length = 0;
          placeLabel(labelPeakRef.current, peakWorld);
          if (hideStartLabel && labelStartRef.current) labelStartRef.current.style.opacity = "0";
          else placeLabel(labelStartRef.current, startWorld);
          if (hideEndLabel && labelEndRef.current) labelEndRef.current.style.opacity = "0";
          else placeLabel(labelEndRef.current, endWorld);
          placeLabel(labelHereRef.current, markerWorld);
        };
        animate();

        cleanupRef.current = () => {
          cancelAnimationFrame(frame);
          controls.dispose();
          for (const entry of buildingMeshes) entry.mesh.geometry.dispose();
          buildingMaterial.dispose();
          geometry.dispose();
          markerGeometry.dispose();
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
    "pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-[3px] bg-white/90 px-1.5 py-0.5 text-[13px] font-bold text-[#c1121f] shadow-sm transition-opacity";

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-[#15345b]" ref={readoutRef}>
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
        <span className={labelClass} ref={labelHereRef} style={{ opacity: 0 }}>
          현재위치
        </span>
      </div>
      {status === "ready" ? (
        <p className="mt-1.5 text-[11px] leading-4 text-[#94a3b8]">
          드래그로 회전하면 그 방향 단면이 잘려 보이고 외곽선에 표고가 표시됩니다 · 휠 확대 — 회색 건물은
          브이월드 실제 층수(층당 3m 가정), 지형은 위성 DEM(30m 격자) 근사, 참고용입니다.
        </p>
      ) : null}
    </div>
  );
}
