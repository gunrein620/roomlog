"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ElementRef } from "react";
import { SplatScene, loadSplatTuningProfile, type SplatTuningProfile } from "../splat-scene";
import { composeWithPickViewTuning, solveSimilarity } from "../similarity-solve";
import {
  loadPlanWallsFromBrowser,
  persistTourUploadPlanWalls,
  planWallFootprint,
  planWallsFromPayload,
  readFloorPlanDraftServerId,
  wallsToPlanBounds
} from "../splat-plan-shape";
import type { WheretoputWall3D } from "../../floor-plan-3d/room-model/types";
import type { Point2, RegistrationPointPair, SplatTransform } from "../tour-types";
import { PICK_DRAG_THRESHOLD_PX, pointerTravelPx, rayPlaneIntersectionXZ } from "../register-pick";
import { getSplatAsset, registerSplatAsset, resolveAssetFileUrl, type SplatAsset } from "@/lib/splat-asset-api";
import { fetchOwnerListings, resolveRegisterPlanSource } from "@/lib/owner-tour-assets";

// ③(b) 도면–splat 2점 정합 도구. 탑다운 정사영으로 splat 바닥 모서리 2곳을 클릭하고,
// 오른쪽 도면에서 같은 모서리 2곳을 클릭하면 solveSimilarity가 닫힌해로 transform을
// 계산한다. 미리보기(씬 주입)로 확인 후 저장(registerSplatAsset)한다.
// 문서: docs/remote-3d-tour.md §4.

const SPLAT_SRC = "/samples/room.spz";
const PLAN_PX_PER_M = 70; // 도면 SVG 렌더 스케일
const POINT_COLORS = ["#2563eb", "#dc2626"]; // A, B

type PickView = "splat" | "plan";

type PlanSource = "placeholder" | "storage" | "upload" | "listing-db";

type AssetBanner = {
  tone: "info" | "warning" | "error";
  message: string;
};

export default function Page() {
  const [splatPicks, setSplatPicks] = useState<Point2[]>([]);
  const [planPicks, setPlanPicks] = useState<Point2[]>([]);
  const [planWalls, setPlanWalls] = useState<WheretoputWall3D[] | null>(null);
  const [planSource, setPlanSource] = useState<PlanSource>("placeholder");
  const [planMessage, setPlanMessage] = useState("");
  const [splatReady, setSplatReady] = useState(false);
  // 천장 클립(픽 뷰 전용) — 밀폐 스캔이 외부 카메라에서 검은 상자로만 보이는 문제. 기본 ON, 바닥 기준 1.6m 위 절단.
  const [ceilingCutOn, setCeilingCutOn] = useState(true);
  const [ceilingHeight, setCeilingHeight] = useState(1.6);
  // 오빗 컨트롤 인스턴스 — "위에서 보기" 버튼이 탑다운 프리셋으로 되돌릴 때 reset()을 호출한다.
  const orbitRef = useRef<ElementRef<typeof OrbitControls>>(null);
  // 탑다운 복귀: 생성 시점(카메라 [0,8,0]·zoom 140·target 원점)으로 되돌린다.
  const resetToTopDown = () => orbitRef.current?.reset();
  // 정합 저장 시 자산에 붙일 서버 도면 id. 서버 저장된 floorPlanDraft를 쓸 때만 값이 생긴다.
  // 업로드/플레이스홀더 도면은 서버 id가 없어 null → 이 경우 가구 연결은 만들어지지 않는다.
  const [planServerId, setPlanServerId] = useState<string | null>(null);

  // 실도면: 도면 에디터 저장본(localStorage)이 있으면 자동 로드. 업로드가 오면 그쪽이 이긴다.
  useEffect(() => {
    const stored = loadPlanWallsFromBrowser();
    if (stored) {
      setPlanWalls(stored.walls);
      setPlanSource("storage");
      // 에디터 저장본(floor-plan-draft)일 때만 서버 id가 존재한다. 거주자 디자인은 서버 도면이 아님.
      setPlanServerId(stored.source === "floor-plan-draft" ? readFloorPlanDraftServerId(window.localStorage) : null);
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
      setPlanServerId(null); // 업로드 도면은 서버 FloorPlan이 아님 — 가구 연결 대상에서 제외
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
  const [splatSrc, setSplatSrc] = useState(SPLAT_SRC);
  const [assetBanner, setAssetBanner] = useState<AssetBanner | null>(null);

  // ?asset=<id> — 매물 파이프라인에서 넘어온 자산 id를 프리필하고, 해당 spz가 있으면 정합 대상으로 로드한다.
  // 조회 실패나 PROCESSING(fileUrl 없음)은 기본 샘플을 유지한다.
  useEffect(() => {
    const queryAssetId = new URLSearchParams(window.location.search).get("asset");
    if (!queryAssetId) return;

    let cancelled = false;
    setAssetId(queryAssetId);
    setAssetBanner({ tone: "info", message: `자산 ${queryAssetId} · 조회 중` });

    // 자산이 연결된 매물의 도면(walls3D 스냅샷)을 픽 화면 도면으로 자동 세팅한다.
    // 우선순위: 자산에 이미 서버 도면(floorPlanId)이 붙어 있으면 그 연결을 존중(매물 스냅샷으로 덮지 않음),
    // 없으면 매물 스냅샷 > localStorage > placeholder. (resolveRegisterPlanSource가 판정)
    const applyListingFloorPlan = async (asset: SplatAsset) => {
      if (asset.floorPlanId) {
        // 서버 도면이 이미 연결됨 — 저장 시 그 연결을 유지하도록 서버 id만 존중하고 도면은 덮지 않는다.
        setPlanServerId(asset.floorPlanId);
        return;
      }
      if (!asset.listingId) return;
      const listings = await fetchOwnerListings();
      if (cancelled) return;
      const listing = (listings ?? []).find((item) => item.id === asset.listingId);
      const decision = resolveRegisterPlanSource(
        asset,
        planWallsFromPayload({ walls: listing?.floorPlan?.walls3D ?? [] })
      );
      if (decision.source !== "listing-db") return;
      setPlanWalls(decision.walls);
      setPlanSource("listing-db");
      setPlanServerId(null); // 매물 임베드 스냅샷은 서버 FloorPlan row가 아님 — 가구 연결 대상 아님
      setPlanPicks([]); // 도면이 바뀌면 기존 도면 픽은 무효
      setPreview(false);
      setPlanMessage(`매물 도면 사용 중 (벽 ${decision.walls.length}개)`);
    };

    getSplatAsset(queryAssetId)
      .then((asset) => {
        if (cancelled) return;

        void applyListingFloorPlan(asset);

        const prefix = `자산 ${asset.id} · ${asset.status}`;
        if (asset.fileUrl) {
          setSplatSrc(resolveAssetFileUrl(asset.fileUrl));
        }

        if (!asset.fileUrl) {
          setAssetBanner({
            tone: "warning",
            message: `${prefix} — 아직 spz가 없습니다 — 3D 제작 완료 후 정합할 수 있습니다`
          });
          return;
        }

        if (asset.status === "REGISTERED") {
          setAssetBanner({
            tone: "warning",
            message: `${prefix} — 이미 정합된 자산입니다 — 저장하면 덮어씁니다`
          });
          return;
        }

        setAssetBanner({ tone: "info", message: prefix });
      })
      .catch((error) => {
        if (cancelled) return;
        setSplatSrc(SPLAT_SRC);
        setAssetBanner({
          tone: "error",
          message: `자산 ${queryAssetId} 조회 실패 — ${
            error instanceof Error ? error.message : "알 수 없는 오류"
          } — 기본 샘플로 폴백합니다`
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSplatPicks([]);
    setPreview(false);
    setSaveState("idle");
    setSaveMessage("");
    setSplatReady(false);
  }, [splatSrc]);

  // 픽 씬(SplatScene transform=null)이 같은 프로파일로 splat을 배치하므로, 솔버 결과를
  // 원본 메시 기준 절대 transform으로 만들려면 동일 프로파일을 합성해야 한다.
  useEffect(() => {
    let cancelled = false;
    setPickProfile(null);
    void loadSplatTuningProfile(splatSrc).then((profile) => {
      if (!cancelled) setPickProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [splatSrc]);

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
      // planServerId가 있으면(서버 저장된 도면으로 정합) 자산에 붙여 공개 뷰어가 그 가구를 받게 한다.
      await registerSplatAsset(assetId.trim(), transform, pairs, planServerId ?? undefined);
      setSaveState("saved");
      setSaveMessage(
        planServerId
          ? "정합 결과를 저장했습니다 (status: REGISTERED · 도면 가구 연결됨)."
          : "정합 결과를 저장했습니다 (status: REGISTERED)."
      );
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

      {assetBanner ? <div style={{ ...assetBannerStyle, ...assetBannerTone[assetBanner.tone] }}>{assetBanner.message}</div> : null}

      <div style={panes}>
        <section style={pane}>
          <PaneTitle step="1" label="splat 탑다운 — 바닥 모서리 클릭" picks={splatPicks.length} />
          <div style={canvasWrap}>
            <Canvas orthographic camera={{ position: [0, 8, 0], zoom: 140, near: 0.1, far: 100 }}>
              {/* 자유 시점: 드래그=회전/틸트, 우드래그=이동, 휠=확대. 시작·복귀는 탑다운([0,8,0]).
                  픽은 카메라와 무관한 바닥 평면 레이캐스트라(rayPlaneIntersectionXZ) 각도가 좌표에 영향 없음. */}
              <OrbitControls
                ref={orbitRef}
                makeDefault
                enableDamping
                minZoom={40}
                maxZoom={600}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 2 - 0.05}
                target={[0, 0, 0]}
              />
              <SplatScene
                defaultFitMode="native"
                src={splatSrc}
                transform={preview ? transform : null}
                ceilingClipHeightMeters={ceilingCutOn ? ceilingHeight : null}
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
            <button type="button" style={topDownBtn} onClick={resetToTopDown} title="탑다운 시점으로 되돌리기">
              위에서 보기
            </button>
            {/* 천장 클립: 밀폐 스캔은 외부 카메라에서 검은 상자로만 보이므로, 바닥 기준 높이 위를 잘라 내부를 드러낸다. */}
            <div style={ceilingPanel}>
              <label style={ceilingToggle}>
                <input type="checkbox" checked={ceilingCutOn} onChange={(event) => setCeilingCutOn(event.target.checked)} />
                천장 자르기
              </label>
              {ceilingCutOn ? (
                <label style={ceilingSliderRow}>
                  <input
                    type="range"
                    min={0.5}
                    max={2.6}
                    step={0.1}
                    value={ceilingHeight}
                    aria-label="천장 자르기 높이(m)"
                    onChange={(event) => setCeilingHeight(Number(event.target.value))}
                    style={{ width: 96 }}
                  />
                  <span style={{ minWidth: 34, textAlign: "right" }}>{ceilingHeight.toFixed(1)}m</span>
                </label>
              ) : null}
            </div>
            <span style={hint}>클릭 = 점 찍기 (A→B, 3번째 = 처음부터) · 드래그 = 회전 · 우드래그 = 이동 · 휠 = 확대</span>
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
                : planSource === "listing-db"
                  ? `매물 도면 사용 중 (벽 ${planWalls?.length ?? 0}개)`
                  : planSource === "storage"
                    ? `에디터 저장 도면 사용 중 (벽 ${planWalls?.length ?? 0}개)`
                    : planMessage || "도면 없음 — 정합 건너뜀 (3D는 그대로 표시)"}
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
            <span style={{ ...muted, color: saveState === "error" ? "#dc2626" : "#16a34a" }}>
              {saveMessage}
              {saveState === "saved" && assetId.trim() ? (
                <>
                  {" "}
                  <a style={tourLink} href={`/splat-tour?asset=${encodeURIComponent(assetId.trim())}`}>
                    투어 열기
                  </a>
                </>
              ) : null}
            </span>
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

// y=0 바닥 평면. 클릭 광선을 이 평면과 analytic하게 교차시켜(rayPlaneIntersectionXZ) 카메라 각도와
// 무관하게 XZ를 픽한다. 오빗 회전 후에도 좌표가 정확하다. 넉넉한 크기라 틸트 상태 클릭도 평면 위에 떨어진다.
// onPointerDown이 아니라 onClick + delta 가드: 회전/이동 드래그가 픽으로 오인되지 않게.
function PickPlane({ onPick }: { onPick: (x: number, z: number) => void }) {
  // pointerdown 화면 좌표를 직접 기록해 click 시점 이동거리를 잰다. R3F의 event.delta는 OrbitControls가
  // pointermove를 소비하면 0으로 새어(실측: 세로 180px 드래그가 픽으로 등록) 신뢰할 수 없다.
  const downRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={(event) => {
        downRef.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
      }}
      onClick={(event) => {
        const down = downRef.current;
        downRef.current = null;
        // 드래그(회전/이동)면 픽 금지 — 직접 측정한 pointerdown→click 픽셀 이동으로 판정.
        if (down) {
          if (pointerTravelPx(down, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }) > PICK_DRAG_THRESHOLD_PX) return;
        } else if (event.delta > PICK_DRAG_THRESHOLD_PX) {
          return; // pointerdown을 놓친 경우의 폴백(기존 R3F delta 가드)
        }
        event.stopPropagation();
        // 광선-바닥 교차가 정석. 평행/뒤쪽 등 실패 시 mesh 교차점(event.point)으로 폴백.
        const hit = rayPlaneIntersectionXZ(event.ray) ?? { x: event.point.x, z: event.point.z };
        onPick(hit.x, hit.z);
      }}
    >
      <planeGeometry args={[80, 80]} />
      <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} />
    </mesh>
  );
}

// 도면 2D SVG. 실벽(walls)이 있으면 발자국 폴리곤을 그린다. 도면이 없으면 가짜
// 플레이스홀더 박스를 깔지 않고 "도면 없음" 빈 상태를 보여준다(정합 건너뜀).
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
  if (!walls || walls.length === 0) {
    return (
      <div style={canvasWrap}>
        <div style={planEmptyState}>
          <strong style={{ fontSize: 14, color: "#334155" }}>도면 없음</strong>
          <span>정합할 도면이 없어 이 단계를 건너뜁니다. 3D는 그대로 표시됩니다.</span>
          <span style={{ fontSize: 12 }}>매물에 도면을 추가하면 이 자산과 정합할 수 있어요.</span>
        </div>
      </div>
    );
  }
  const bounds = wallsToPlanBounds(walls);
  const minX = bounds.minX;
  const minZ = bounds.minZ;
  const width = bounds.width;
  const depth = bounds.depth;
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
        {walls.map((wall) => (
          <polygon
            key={wall.id}
            points={planWallFootprint(wall)
              .map((c) => `${pad + (c.x - minX) * scale},${pad + (c.z - minZ) * scale}`)
              .join(" ")}
            fill="#cbd5e1"
            stroke="#64748b"
            strokeWidth={1}
          />
        ))}
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
const planEmptyState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  height: "100%",
  minHeight: 200,
  padding: 24,
  color: "#64748b",
  fontSize: 13,
  border: "1px dashed #cbd5e1",
  borderRadius: 8,
  background: "var(--surface, #f8fafc)"
};
const assetBannerStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 700
};
const assetBannerTone: Record<AssetBanner["tone"], CSSProperties> = {
  info: {
    background: "var(--surface-container-lowest)",
    borderColor: "var(--outline-variant)",
    color: "var(--on-surface)"
  },
  warning: {
    background: "var(--primary-container)",
    borderColor: "var(--primary)",
    color: "var(--on-primary-container)"
  },
  error: {
    background: "var(--error-container)",
    borderColor: "var(--error)",
    color: "var(--on-error-container)"
  }
};
const hint: CSSProperties = { position: "absolute", bottom: 6, right: 8, fontSize: 11, color: "#64748b" };
const topDownBtn: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 2,
  background: "#0f172a",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "7px 12px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer"
};
const ceilingPanel: CSSProperties = {
  position: "absolute",
  top: 8,
  left: 8,
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "rgba(15, 23, 42, 0.82)",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700
};
const ceilingToggle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, cursor: "pointer" };
const ceilingSliderRow: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
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
const tourLink: CSSProperties = { color: "inherit", fontWeight: 800, textDecoration: "underline" };
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
