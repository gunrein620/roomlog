"use client";

// 조립 셸 — Canvas 안에 SplatScene+TourCamera, 밖에 TourMinimap과 프리셋 버튼 바를 둔다.
// 각 조각(SplatScene/TourCamera/TourMinimap)은 병렬 에이전트가 채워넣는다.

import { Canvas } from "@react-three/fiber";
import { useState } from "react";
import { SplatScene } from "./splat-scene";
import { TourCamera } from "./tour-camera";
import { TourMinimap } from "./tour-minimap";
import { DEMO_PRESETS } from "./tour-presets";

const SPLAT_SRC = "/samples/room.spz";

export default function TourViewer() {
  const [activeId, setActiveId] = useState(DEMO_PRESETS[0]?.id ?? "");
  const [isLoaded, setIsLoaded] = useState(false);

  const initialCamera: [number, number, number] = DEMO_PRESETS[0]?.camera.position ?? [0, 1.5, 3];

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "70vh",
        background: "var(--canvas)",
        borderRadius: 12,
        overflow: "hidden"
      }}
    >
      <Canvas camera={{ fov: 60, position: initialCamera }} shadows>
        <color args={["#1c1e24"]} attach="background" />
        <ambientLight intensity={0.85} />
        <directionalLight castShadow intensity={1.1} position={[3, 6, 4]} />
        <SplatScene onLoaded={() => setIsLoaded(true)} src={SPLAT_SRC} />
        <TourCamera activeId={activeId} onArrive={setActiveId} presets={DEMO_PRESETS} />
      </Canvas>

      {!isLoaded ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--canvas)",
            color: "var(--muted)",
            fontSize: 15
          }}
        >
          불러오는 중…
        </div>
      ) : null}

      <div style={{ position: "absolute", top: 16, right: 16 }}>
        <TourMinimap activeId={activeId} onSelect={setActiveId} presets={DEMO_PRESETS} />
      </div>

      <div
        role="group"
        aria-label="시점 프리셋"
        style={{
          position: "absolute",
          bottom: 16,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          padding: 8,
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: 999,
          boxShadow: "var(--shadow)"
        }}
      >
        {DEMO_PRESETS.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <button
              aria-pressed={isActive}
              key={preset.id}
              onClick={() => setActiveId(preset.id)}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: 999,
                background: isActive ? "var(--blue)" : "transparent",
                color: isActive ? "var(--paper)" : "var(--ink)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: isActive ? 700 : 500
              }}
              type="button"
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
