"use client";

// dev 전용 확인 페이지 — 캡처 도면(RoomPlanCaptureFloorPlan)과 MitUNet 도면을
// MitunetSceneLayout으로 변환해 도면 뷰어에 나란히 띄워본다. 위상이 제각각인 실픽스처를
// 한 페이지에서 훑어보기 위한 용도. 프로덕션 네비게이션에 노출하지 않는다.
//
// 픽스처는 apps/web/public/dev-fixtures/*.json(gitignore 대상, 로컬에만 배치)를 fetch한다.
// 배치돼 있지 않으면 각 항목이 "없음" 상태로 표시될 뿐 페이지는 깨지지 않는다.

import { useEffect, useMemo, useState } from "react";
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";
import { normalizeMitunetPayload } from "@/lib/mitunet-floor-plan";
import { captureFloorPlanToSceneLayout } from "../../floor-plan-3d/room-scene/capture-to-layout";
import { createMitunetSceneLayout, type MitunetSceneLayout } from "../../floor-plan-3d/room-scene/mitunet-geometry";
import { RoomlogThreeFloorPlanView } from "../../floor-plan-3d/room-scene/RoomlogThreeFloorPlanView";

const FIXTURE_FILES: { file: string; kind: "capture" | "mitunet" }[] = [
  { file: "capture-ae71db28.json", kind: "capture" },
  { file: "capture-938decc8.json", kind: "capture" },
  { file: "mitunet-0e7648ce.json", kind: "mitunet" },
  { file: "mitunet-4730b4a6.json", kind: "mitunet" },
  { file: "mitunet-56829a98.json", kind: "mitunet" },
  { file: "mitunet-57870de0.json", kind: "mitunet" },
  { file: "mitunet-78a9f433.json", kind: "mitunet" },
  { file: "mitunet-8d9a7a5b.json", kind: "mitunet" },
  { file: "mitunet-938decc8.json", kind: "mitunet" },
  { file: "mitunet-e11d8689.json", kind: "mitunet" },
  { file: "mitunet-eadc1bad.json", kind: "mitunet" }
];

type FixtureEntry = {
  file: string;
  kind: "capture" | "mitunet";
  status: "loading" | "missing" | "invalid" | "ready";
  layout: MitunetSceneLayout | null;
  plan: MitunetFloorPlan | null;
};

function initialEntries(): FixtureEntry[] {
  return FIXTURE_FILES.map(({ file, kind }) => ({ file, kind, status: "loading", layout: null, plan: null }));
}

async function loadFixture({ file, kind }: { file: string; kind: "capture" | "mitunet" }): Promise<FixtureEntry> {
  let response: Response;
  try {
    response = await fetch(`/dev-fixtures/${file}`, { cache: "no-store" });
  } catch {
    return { file, kind, status: "missing", layout: null, plan: null };
  }
  if (!response.ok) return { file, kind, status: "missing", layout: null, plan: null };

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { file, kind, status: "invalid", layout: null, plan: null };
  }

  if (kind === "capture") {
    const layout = captureFloorPlanToSceneLayout(json);
    if (!layout) return { file, kind, status: "invalid", layout: null, plan: null };
    return { file, kind, status: "ready", layout, plan: null };
  }

  const plan = normalizeMitunetPayload(json);
  if (!plan) return { file, kind, status: "invalid", layout: null, plan: null };
  try {
    const layout = createMitunetSceneLayout(plan);
    return { file, kind, status: "ready", layout, plan };
  } catch {
    return { file, kind, status: "invalid", layout: null, plan: null };
  }
}

const STATUS_LABEL: Record<FixtureEntry["status"], string> = {
  loading: "불러오는 중",
  missing: "파일 없음",
  invalid: "파싱 실패",
  ready: "정상"
};

function noop() {}

function FixtureSummary({ entry }: { entry: FixtureEntry }) {
  if (entry.status !== "ready" || !entry.layout) {
    return <p style={{ color: "var(--on-surface-variant)", fontSize: "13px" }}>{STATUS_LABEL[entry.status]}</p>;
  }

  const { bounds, hasPhysicalScale, wall } = entry.layout;
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px", fontSize: "13px", margin: 0 }}>
      <dt style={{ color: "var(--on-surface-variant)" }}>벽 폴리곤</dt>
      <dd style={{ margin: 0 }}>{wall.length}개</dd>
      <dt style={{ color: "var(--on-surface-variant)" }}>실측 스케일</dt>
      <dd style={{ margin: 0 }}>{hasPhysicalScale ? "예" : "아니오"}</dd>
      <dt style={{ color: "var(--on-surface-variant)" }}>bounds</dt>
      <dd style={{ margin: 0 }}>
        {bounds.width.toFixed(2)}m × {bounds.depth.toFixed(2)}m (center {bounds.centerX.toFixed(2)}, {bounds.centerZ.toFixed(2)})
      </dd>
    </dl>
  );
}

export default function FloorPlanFixturesDevPage() {
  const [entries, setEntries] = useState<FixtureEntry[]>(initialEntries);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(FIXTURE_FILES.map(loadFixture)).then((loaded) => {
      if (cancelled) return;
      setEntries(loaded);
      setSelectedFile((current) => current ?? loaded.find((entry) => entry.status === "ready")?.file ?? loaded[0]?.file ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => entries.find((entry) => entry.file === selectedFile) ?? null, [entries, selectedFile]);
  const anyReady = entries.some((entry) => entry.status === "ready");
  const stillLoading = entries.some((entry) => entry.status === "loading");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px", minHeight: "100vh" }}>
      <div>
        <h1 style={{ fontSize: "var(--fs-title)", fontWeight: "var(--fw-title)", margin: 0 }}>도면 픽스처 확인 (dev 전용)</h1>
        <p style={{ color: "var(--on-surface-variant)", fontSize: "13px", margin: "4px 0 0" }}>
          프로덕션에 노출되지 않는 개발용 페이지. apps/web/public/dev-fixtures/*.json을 로컬에 배치해야 목록이 채워진다.
        </p>
      </div>

      {!stillLoading && !anyReady ? (
        <p style={{ color: "var(--on-surface-variant)" }}>
          픽스처가 배치되지 않았습니다. apps/web/public/dev-fixtures/ 아래에 캡처·MitUNet 도면 JSON을 두면 여기서 렌더됩니다.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px", width: "280px", flexShrink: 0 }}>
          {entries.map((entry) => (
            <li key={entry.file}>
              <button
                onClick={() => setSelectedFile(entry.file)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: `1px solid ${entry.file === selectedFile ? "var(--primary)" : "var(--border)"}`,
                  background: entry.file === selectedFile ? "var(--primary-container)" : "var(--surface-container-lowest)",
                  cursor: "pointer"
                }}
                type="button"
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px", fontWeight: 700 }}>
                  <span>{entry.file}</span>
                  <span style={{ color: "var(--on-surface-variant)", fontWeight: 400 }}>{entry.kind}</span>
                </div>
                <div style={{ marginTop: "6px" }}>
                  <FixtureSummary entry={entry} />
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: "560px",
            borderRadius: "16px",
            overflow: "hidden",
            border: "1px solid var(--border)",
            position: "relative"
          }}
        >
          {selected && selected.status === "ready" && selected.layout ? (
            <RoomlogThreeFloorPlanView
              controlMode="orbit"
              frameloop="always"
              furnitureData={[]}
              key={selected.file}
              mitunetLayout={selected.kind === "capture" ? selected.layout : undefined}
              mitunetPlan={selected.kind === "mitunet" ? selected.plan ?? undefined : undefined}
              onFloorPointerDown={noop}
              onFurniturePointerDown={noop}
              onWallPointerDown={noop}
              pendingFurniture={null}
              selectedFurnitureId={null}
              selectedWallId={null}
              wallsData={[]}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--on-surface-variant)" }}>
              {selected ? STATUS_LABEL[selected.status] : "픽스처를 선택하세요"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
