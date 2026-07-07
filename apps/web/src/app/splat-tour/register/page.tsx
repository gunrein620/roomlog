"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { SplatScene, loadSplatTuningProfile, type SplatTuningProfile } from "../splat-scene";
import { composeWithPickViewTuning, solveSimilarity } from "../similarity-solve";
import { SPLAT_CLIP_ROOM } from "../splat-clip";
import {
  loadPlanWallsFromBrowser,
  persistTourUploadPlanWalls,
  planWallFootprint,
  planWallsFromPayload,
  wallsToPlanBounds
} from "../splat-plan-shape";
import type { WheretoputWall3D } from "../../floor-plan-3d/room-model/types";
import type { Point2, RegistrationPointPair, SplatTransform } from "../tour-types";
import { registerSplatAsset } from "@/lib/splat-asset-api";

// ③(b) 도면–splat 2점 정합 도구. 탑다운 정사영으로 splat 바닥 모서리 2곳을 클릭하고,
// 오른쪽 도면에서 같은 모서리 2곳을 클릭하면 solveSimilarity가 닫힌해로 transform을
// 계산한다. 미리보기(씬 주입)로 확인 후 저장(registerSplatAsset)한다.
// 문서: docs/remote-3d-tour.md §4.

const SPLAT_SRC = "/samples/room.spz";
const PLAN_PX_PER_M = 70; // 도면 SVG 렌더 스케일
const POINT_COLORS = ["#2563eb", "#dc2626"]; // A, B

type PickView = "splat" | "plan";

type PlanSource = "placeholder" | "storage" | "upload";

export default function Page() {
  const [splatPicks, setSplatPicks] = useState<Point2[]>([]);
  const [planPicks, setPlanPicks] = useState<Point2[]>([]);
  const [planWalls, setPlanWalls] = useState<WheretoputWall3D[] | null>(null);
  const [planSource, setPlanSource] = useState<PlanSource>("placeholder");
  const [planMessage, setPlanMessage] = useState("");
  const [splatReady, setSplatReady] = useState(false);

  // 실도면: 도면 에디터 저장본(localStorage)이 있으면 자동 로드. 업로드가 오면 그쪽이 이긴다.
  useEffect(() => {
    const stored = loadPlanWallsFromBrowser();
    if (stored) {
      setPlanWalls(stored.walls);
      setPlanSource("storage");
    }
  }, []);

  async function uploadPlanJson(file: File) {
    try {
      const walls = planWallsFromPayload(JSON.parse(await file.text()));
      if (walls.length === 0) {
        setPlanMessage("이 JSON에서 유효한 벽을 못 찾았습니다 (walls / room3d.walls 필요).");
        return;
      }
      setPlanWalls(walls);
      setPlanSource("upload");
      setPlanPicks([]); // 도면이 바뀌면 기존 도면 픽은 무효
      setPreview(false);
      // 뷰어(벽 대체·걷기 경계·미니맵)와 공유 — 투어 페이지는 새로고침 시 이 도면을 읽는다.
      const shared = persistTourUploadPlanWalls(walls, window.localStorage, Date.now());
      setPlanMessage(`벽 ${walls.length}개 로드 (${file.name})${shared ? " — 투어 뷰어에도 적용됨" : ""}`);
    } catch {
      setPlanMessage("JSON 파싱 실패 — 파일을 확인하세요.");
    }
  }
  const [preview, setPreview] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [pickProfile, setPickProfile] = useState<SplatTuningProfile | null>(null);

  // 픽 씬(SplatScene transform=null)이 같은 프로파일로 splat을 배치하므로, 솔버 결과를
  // 원본 메시 기준 절대 transform으로 만들려면 동일 프로파일을 합성해야 한다.
  useEffect(() => {
    let cancelled = false;
    void loadSplatTuningProfile(SPLAT_SRC).then((profile) => {
      if (!cancelled) setPickProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const transform = useMemo<SplatTransform | null>(() => {
    if (splatPicks.length < 2 || planPicks.length < 2) return null;
    try {
      const solved = solveSimilarity([
        { splat: splatPicks[0], plan: planPicks[0] },
        { splat: splatPicks[1], plan: planPicks[1] }
      ]);
      // 프로파일이 없으면 씬 기본값(rotX 180·scale 1·offset 0)이 픽 씬 배치와 일치하므로
      // 솔버 기본값 그대로가 맞다. auto-fit 배치는 합성 불가 — native 프로파일 전제(§4).
      return composeWithPickViewTuning(solved, pickProfile);
    } catch {
      return null; // 두 점이 겹치는 등 degenerate — 안내만
    }
  }, [splatPicks, planPicks, pickProfile]);

  function addPick(view: PickView, point: Point2) {
    const setter = view === "splat" ? setSplatPicks : setPlanPicks;
    setter((current) => (current.length >= 2 ? [point] : [...current, point]));
    setPreview(false);
    setSaveState("idle");
  }

  function reset() {
    setSplatPicks([]);
    setPlanPicks([]);
    setPreview(false);
    setSaveState("idle");
    setSaveMessage("");
  }

  async function save() {
    if (!transform) return;
    if (!assetId.trim()) {
      setSaveState("error");
      setSaveMessage("저장하려면 SplatAsset id가 필요합니다.");
      return;
    }
    const pairs: RegistrationPointPair[] = [
      { splat: splatPicks[0], plan: planPicks[0] },
      { splat: splatPicks[1], plan: planPicks[1] }
    ];
    setSaveState("saving");
    setSaveMessage("");
    try {
      await registerSplatAsset(assetId.trim(), transform, pairs);
      setSaveState("saved");
      setSaveMessage("정합 결과를 저장했습니다 (status: REGISTERED).");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(error instanceof Error ? error.message : "저장 실패");
    }
  }

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>도면–splat 2점 정합</div>
          <div style={muted}>양쪽에서 같은 방 모서리 2곳(A, B)을 순서대로 클릭하세요.</div>
        </div>
        <button type="button" style={ghostBtn} onClick={reset}>
          초기화
        </button>
      </header>

      <div style={panes}>
        <section style={pane}>
          <PaneTitle step="1" label="splat 탑다운 — 바닥 모서리 클릭" picks={splatPicks.length} />
          <div style={canvasWrap}>
            <Canvas orthographic camera={{ position: [0, 8, 0], zoom: 140, near: 0.1, far: 100 }}>
              <TopDownRig />
              {/* 탑다운 전용 컨트롤: 휠=확대, 드래그=이동. 회전은 잠근다(픽 좌표는 XZ 정사영 전제). */}
              <MapControls enableRotate={false} makeDefault minZoom={40} maxZoom={600} />
              <SplatScene
                src={SPLAT_SRC}
                transform={preview ? transform : null}
                onLoaded={() => setSplatReady(true)}
              />
              <PickPlane onPick={(x, z) => addPick("splat", { x, y: z })} />
              {splatPicks.map((p, i) => (
                <group key={i} position={[p.x, 0.1, p.y]}>
                  {/* 바닥 링 + 구슬 — depthTest 끔: 가구·벽 splat이 위를 덮어도 항상 보이게 */}
                  <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={998}>
                    <ringGeometry args={[0.14, 0.2, 32]} />
                    <meshBasicMaterial color="#ffffff" depthTest={false} />
                  </mesh>
                  <mesh renderOrder={999}>
                    <sphereGeometry args={[0.13, 16, 16]} />
                    <meshBasicMaterial color={POINT_COLORS[i] ?? "#111"} depthTest={false} />
                  </mesh>
                </group>
              ))}
            </Canvas>
            {!splatReady ? (
              // 페인트 전 빈 화면에 클릭하는 사고 방지 — 로드 완료까지 클릭을 막고 안내한다.
              <div style={loadingOverlay}>splat 로딩 중… (수십 초 걸릴 수 있어요)</div>
            ) : null}
            <span style={hint}>클릭 = 점 찍기 (A→B, 3번째 클릭 = 처음부터) · 드래그 = 이동 · 휠 = 확대</span>
          </div>
        </section>

        <section style={pane}>
          <PaneTitle step="2" label="도면 — 같은 모서리 클릭" picks={planPicks.length} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <label style={{ ...ghostBtn, cursor: "pointer", fontSize: 13 }}>
              도면 JSON 업로드
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadPlanJson(file);
                  e.target.value = "";
                }}
              />
            </label>
            <span style={muted}>
              {planSource === "upload"
                ? planMessage
                : planSource === "storage"
                  ? `에디터 저장 도면 사용 중 (벽 ${planWalls?.length ?? 0}개)`
                  : planMessage || "도면 없음 — 3×4m 플레이스홀더 사용 중"}
            </span>
          </div>
          <PlanPicker walls={planWalls} picks={planPicks} onPick={(x, y) => addPick("plan", { x, y })} />
          <span style={hint}>클릭 → 도면 좌표 (m)</span>
        </section>
      </div>

      <footer style={footer}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={{ ...primaryBtn, opacity: transform ? 1 : 0.45, cursor: transform ? "pointer" : "not-allowed" }}
            disabled={!transform}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "미리보기 끄기" : "정합 미리보기"}
          </button>
          <input
            style={input}
            placeholder="SplatAsset id (저장용)"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
          />
          <button
            type="button"
            style={{ ...primaryBtn, opacity: transform ? 1 : 0.45, cursor: transform ? "pointer" : "not-allowed" }}
            disabled={!transform || saveState === "saving"}
            onClick={save}
          >
            {saveState === "saving" ? "저장 중…" : "저장"}
          </button>
          {saveMessage ? (
            <span style={{ ...muted, color: saveState === "error" ? "#dc2626" : "#16a34a" }}>{saveMessage}</span>
          ) : null}
        </div>
        <pre style={result}>
          {transform
            ? JSON.stringify(transform, null, 2)
            : "// 양쪽에서 2점씩 클릭하면 SplatTransform이 계산됩니다."}
        </pre>
      </footer>
    </div>
  );
}

// 탑다운 정사영: 카메라를 위에서 아래(-Y)로 내려다보게 세팅. up을 -Z로 두어 화면 위=방 안쪽.
function TopDownRig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.up.set(0, 0, -1);
    camera.position.set(0, 8, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// y=0 바닥 평면. onClick의 event.point가 월드 교차점을 직접 준다(수동 언프로젝트 불필요).
// onPointerDown이 아니라 onClick + delta 가드: MapControls 드래그(팬) 시작이 픽으로 오인되지 않게.
function PickPlane({ onPick }: { onPick: (x: number, z: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        if (event.delta > 4) return; // 드래그였다 — 픽 아님
        event.stopPropagation();
        onPick(event.point.x, event.point.z);
      }}
    >
      <planeGeometry args={[40, 40]} />
      <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} />
    </mesh>
  );
}

// 도면 2D SVG. 실벽(walls)이 있으면 발자국 폴리곤을 그리고, 없으면 3m×4m 플레이스홀더 사각형.
// 클릭 → 도면 프레임 미터 좌표(투어 월드와 동일 프레임 — 벽·가구·미니맵이 쓰는 그 좌표계).
function PlanPicker({
  walls,
  picks,
  onPick
}: {
  walls: WheretoputWall3D[] | null;
  picks: Point2[];
  onPick: (x: number, y: number) => void;
}) {
  const bounds = walls && walls.length > 0 ? wallsToPlanBounds(walls) : null;
  const minX = bounds ? bounds.minX : -SPLAT_CLIP_ROOM.width / 2;
  const minZ = bounds ? bounds.minZ : -SPLAT_CLIP_ROOM.depth / 2;
  const width = bounds ? bounds.width : SPLAT_CLIP_ROOM.width;
  const depth = bounds ? bounds.depth : SPLAT_CLIP_ROOM.depth;
  // 큰 도면이 패널을 넘지 않게 스케일 캡 (기본 70px/m)
  const scale = Math.min(PLAN_PX_PER_M, 520 / Math.max(width, 0.5), 420 / Math.max(depth, 0.5));
  const w = width * scale;
  const h = depth * scale;
  const pad = 24;
  return (
    <div style={canvasWrap}>
      <svg
        width={w + pad * 2}
        height={h + pad * 2}
        style={{ display: "block", cursor: "crosshair", background: "var(--surface, #fff)" }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const px = event.clientX - rect.left - pad;
          const py = event.clientY - rect.top - pad;
          const x = minX + px / scale;
          const y = minZ + py / scale;
          onPick(Number(x.toFixed(3)), Number(y.toFixed(3)));
        }}
      >
        {walls && walls.length > 0 ? (
          walls.map((wall) => (
            <polygon
              key={wall.id}
              points={planWallFootprint(wall)
                .map((c) => `${pad + (c.x - minX) * scale},${pad + (c.z - minZ) * scale}`)
                .join(" ")}
              fill="#cbd5e1"
              stroke="#64748b"
              strokeWidth={1}
            />
          ))
        ) : (
          <rect x={pad} y={pad} width={w} height={h} fill="none" stroke="#94a3b8" strokeWidth={2} rx={6} />
        )}
        {picks.map((p, i) => (
          <circle
            key={i}
            cx={pad + (p.x - minX) * scale}
            cy={pad + (p.y - minZ) * scale}
            r={6}
            fill={POINT_COLORS[i] ?? "#111"}
          />
        ))}
      </svg>
    </div>
  );
}

function PaneTitle({ step, label, picks }: { step: string; label: string; picks: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={badge}>{step}</span>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      <span style={{ ...muted, marginLeft: "auto" }}>{picks}/2</span>
    </div>
  );
}

const page: CSSProperties = { display: "flex", flexDirection: "column", height: "100vh", padding: 16, gap: 12 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const panes: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1, minHeight: 0 };
const pane: CSSProperties = { display: "flex", flexDirection: "column", minHeight: 0 };
const canvasWrap: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 300,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  alignItems: "center"
};
const footer: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const muted: CSSProperties = { color: "#64748b", fontSize: 13 };
const hint: CSSProperties = { position: "absolute", bottom: 6, right: 8, fontSize: 11, color: "#64748b" };
const loadingOverlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(248, 250, 252, 0.7)",
  color: "#334155",
  fontSize: 14,
  fontWeight: 600,
  zIndex: 1
};
const badge: CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  borderRadius: 999,
  width: 20,
  height: 20,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 800
};
const primaryBtn: CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontWeight: 700
};
const ghostBtn: CSSProperties = {
  background: "transparent",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700
};
const input: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 12px", fontSize: 14, minWidth: 220 };
const result: CSSProperties = {
  margin: 0,
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: 12,
  fontSize: 12,
  maxHeight: 160,
  overflow: "auto"
};
