"use client";

// 조립 셸 — Canvas 안에 SplatScene+TourCamera, 밖에 TourMinimap과 프리셋 버튼 바를 둔다.
// 각 조각(SplatScene/TourCamera/TourMinimap)은 병렬 에이전트가 채워넣는다.

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { SplatScene } from "./splat-scene";
import { TourCamera } from "./tour-camera";
import { TourMinimap } from "./tour-minimap";
import { DEMO_PRESETS } from "./tour-presets";

const SPLAT_SRC = "/samples/room.spz";

export default function TourViewer() {
  const [activeId, setActiveId] = useState(DEMO_PRESETS[0]?.id ?? "");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(true);
  const [showHint, setShowHint] = useState(true);

  const initialCamera: [number, number, number] = DEMO_PRESETS[0]?.camera.position ?? [0, 1.5, 3];

  useEffect(() => {
    if (!isLoaded) return;

    const loadingTimer = window.setTimeout(() => setIsLoadingVisible(false), 420);
    const hintTimer = window.setTimeout(() => setShowHint(false), 4200);

    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(hintTimer);
    };
  }, [isLoaded]);

  return (
    <div className="tour-viewer-shell">
      <style>
        {`
          .tour-viewer-shell {
            position: relative;
            width: 100%;
            height: calc(100dvh - 96px);
            min-height: 480px;
            overflow: hidden;
            border-radius: 12px;
            background: var(--canvas);
          }

          .tour-loading-overlay {
            position: absolute;
            z-index: 4;
            inset: 0;
            display: grid;
            place-items: center;
            background: color-mix(in srgb, var(--canvas) 94%, transparent);
            color: var(--muted);
            opacity: 1;
            pointer-events: auto;
            transition: opacity 420ms ease;
          }

          .tour-loading-overlay.is-loaded {
            opacity: 0;
            pointer-events: none;
          }

          .tour-loading-panel {
            display: grid;
            justify-items: center;
            gap: 12px;
            padding: 18px 22px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
          }

          .tour-loading-spinner {
            width: 28px;
            height: 28px;
            border: 3px solid var(--blue-soft);
            border-top-color: var(--blue);
            border-radius: 999px;
            animation: tour-spin 860ms linear infinite;
          }

          .tour-loading-panel p {
            margin: 0;
            color: var(--ink);
            font-size: 14px;
            font-weight: 800;
          }

          .tour-minimap-dock {
            position: absolute;
            z-index: 2;
            top: 16px;
            right: 16px;
          }

          .tour-hint {
            position: absolute;
            z-index: 2;
            top: 18px;
            left: 18px;
            max-width: min(420px, calc(100% - 184px));
            overflow: hidden;
            margin: 0;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 8px 12px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            font-size: 13px;
            font-weight: 800;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
            backdrop-filter: blur(12px);
            opacity: 1;
            transform: translateY(0);
            transition:
              opacity 240ms ease,
              transform 240ms ease;
          }

          .tour-hint.is-hidden {
            opacity: 0;
            pointer-events: none;
            transform: translateY(-6px);
          }

          .tour-preset-bar {
            position: absolute;
            z-index: 3;
            bottom: 16px;
            left: 50%;
            display: flex;
            max-width: calc(100% - 32px);
            transform: translateX(-50%);
            gap: 8px;
            overflow-x: auto;
            padding: 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
            scrollbar-width: none;
          }

          .tour-preset-bar::-webkit-scrollbar {
            display: none;
          }

          .tour-preset-button {
            flex: 0 0 auto;
            min-height: 38px;
            padding: 9px 16px;
            border: 1px solid transparent;
            border-radius: 999px;
            background: transparent;
            color: var(--ink);
            cursor: pointer;
            font-size: 14px;
            font-weight: 800;
            line-height: 1;
            white-space: nowrap;
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-preset-button:hover {
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-preset-button:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-preset-button.is-active {
            border-color: var(--blue);
            background: var(--blue);
            color: var(--paper);
            transform: translateY(-1px);
          }

          .tour-preset-button.is-active:hover {
            background: var(--blue);
            color: var(--paper);
          }

          @keyframes tour-spin {
            to {
              transform: rotate(360deg);
            }
          }

          @media (max-width: 560px) and (orientation: portrait) {
            .tour-viewer-shell {
              height: calc(100dvh - 96px);
              min-height: 480px;
              border-radius: 8px;
            }

            .tour-minimap-dock {
              top: 10px;
              right: 10px;
            }

            .tour-hint {
              top: 12px;
              left: 10px;
              max-width: calc(100% - 148px);
              padding: 7px 10px;
              font-size: 12px;
            }

            .tour-preset-bar {
              bottom: max(12px, env(safe-area-inset-bottom));
              max-width: calc(100% - 20px);
              gap: 6px;
              padding: 7px;
            }

            .tour-preset-button {
              min-height: 36px;
              padding: 8px 12px;
              font-size: 13px;
            }
          }
        `}
      </style>
      <Canvas camera={{ fov: 60, position: initialCamera }} shadows>
        <color args={["#1c1e24"]} attach="background" />
        <ambientLight intensity={0.85} />
        <directionalLight castShadow intensity={1.1} position={[3, 6, 4]} />
        <SplatScene onLoaded={() => setIsLoaded(true)} src={SPLAT_SRC} />
        <TourCamera activeId={activeId} onArrive={setActiveId} presets={DEMO_PRESETS} />
      </Canvas>

      {isLoadingVisible ? (
        <div
          aria-live="polite"
          className={`tour-loading-overlay${isLoaded ? " is-loaded" : ""}`}
        >
          <div className="tour-loading-panel">
            <span aria-hidden className="tour-loading-spinner" />
            <p>3D 공간 불러오는 중…</p>
          </div>
        </div>
      ) : null}

      <p className={`tour-hint${isLoaded && showHint ? "" : " is-hidden"}`}>
        드래그로 둘러보고, 아래 버튼으로 이동하세요
      </p>

      <div className="tour-minimap-dock">
        <TourMinimap activeId={activeId} onSelect={setActiveId} presets={DEMO_PRESETS} />
      </div>

      <div
        role="group"
        aria-label="시점 프리셋"
        className="tour-preset-bar"
      >
        {DEMO_PRESETS.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <button
              aria-pressed={isActive}
              className={`tour-preset-button${isActive ? " is-active" : ""}`}
              key={preset.id}
              onClick={() => setActiveId(preset.id)}
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
