"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { SplatScene } from "../splat-scene";
import { solveSimilarity } from "../similarity-solve";
import { SPLAT_CLIP_ROOM } from "../splat-clip";
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

export default function Page() {
  const [splatPicks, setSplatPicks] = useState<Point2[]>([]);
  const [planPicks, setPlanPicks] = useState<Point2[]>([]);
  const [preview, setPreview] = useState(false);
  const [assetId, setAssetId] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState("");

  const transform = useMemo<SplatTransform | null>(() => {
    if (splatPicks.length < 2 || planPicks.length < 2) return null;
    try {
      return solveSimilarity([
        { splat: splatPicks[0], plan: planPicks[0] },
        { splat: splatPicks[1], plan: planPicks[1] }
      ]);
    } catch {
      return null; // 두 점이 겹치는 등 degenerate — 안내만
    }
  }, [splatPicks, planPicks]);

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
            <Canvas orthographic camera={{ position: [0, 8, 0], zoom: 70, near: 0.1, far: 100 }}>
              <TopDownRig />
              <SplatScene src={SPLAT_SRC} transform={preview ? transform : null} />
              <PickPlane onPick={(x, z) => addPick("splat", { x, y: z })} />
              {splatPicks.map((p, i) => (
                <mesh key={i} position={[p.x, 0.05, p.y]}>
                  <sphereGeometry args={[0.06, 16, 16]} />
                  <meshBasicMaterial color={POINT_COLORS[i] ?? "#111"} />
                </mesh>
              ))}
            </Canvas>
            <span style={hint}>클릭 → 월드 (x, z)</span>
          </div>
        </section>

        <section style={pane}>
          <PaneTitle step="2" label="도면 — 같은 모서리 클릭" picks={planPicks.length} />
          <PlanPicker picks={planPicks} onPick={(x, y) => addPick("plan", { x, y })} />
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

// y=0 바닥 평면. onPointerDown의 event.point가 월드 교차점을 직접 준다(수동 언프로젝트 불필요).
function PickPlane({ onPick }: { onPick: (x: number, z: number) => void }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPick(event.point.x, event.point.z);
      }}
    >
      <planeGeometry args={[20, 20]} />
      <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} />
    </mesh>
  );
}

// 도면 2D SVG. 방 3m×4m 사각형(원점 중앙). 클릭 → 미터 좌표(x∈[-1.5,1.5], y=z∈[-2,2]).
function PlanPicker({ picks, onPick }: { picks: Point2[]; onPick: (x: number, y: number) => void }) {
  const w = SPLAT_CLIP_ROOM.width * PLAN_PX_PER_M;
  const h = SPLAT_CLIP_ROOM.depth * PLAN_PX_PER_M;
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
          const x = px / PLAN_PX_PER_M - SPLAT_CLIP_ROOM.width / 2;
          const y = py / PLAN_PX_PER_M - SPLAT_CLIP_ROOM.depth / 2;
          onPick(Number(x.toFixed(3)), Number(y.toFixed(3)));
        }}
      >
        <rect x={pad} y={pad} width={w} height={h} fill="none" stroke="#94a3b8" strokeWidth={2} rx={6} />
        {picks.map((p, i) => (
          <circle
            key={i}
            cx={pad + (p.x + SPLAT_CLIP_ROOM.width / 2) * PLAN_PX_PER_M}
            cy={pad + (p.y + SPLAT_CLIP_ROOM.depth / 2) * PLAN_PX_PER_M}
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
