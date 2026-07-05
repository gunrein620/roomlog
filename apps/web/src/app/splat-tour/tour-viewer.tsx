"use client";

// 조립 셸 — Canvas 안에 SplatScene+TourCamera, 밖에 TourMinimap과 프리셋 버튼 바를 둔다.
// 각 조각(SplatScene/TourCamera/TourMinimap)은 병렬 에이전트가 채워넣는다.

import { Canvas } from "@react-three/fiber";
import { ChevronDown, Footprints, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SplatScene } from "./splat-scene";
import { SplatDropzone } from "./splat-dropzone";
import { TourCamera } from "./tour-camera";
import { TourMinimap } from "./tour-minimap";
import { DEMO_PRESETS } from "./tour-presets";
import { SPLAT_CLIP_ROOM } from "./splat-clip";

const SPLAT_SRC = "/samples/room.spz";

function clamp01to100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// 월드(splat 배치) 바닥좌표 → 미니맵 정규화(%) 좌표. 데모는 방을 원점 중심으로 고정 배치하므로
// 직접 선형 매핑한다. 실 FloorPlan+정합 모드에선 projectSplatToPlan으로 도면 좌표를 거쳐 매핑(후속).
function worldToMinimapPercent(x: number, z: number): { x: number; y: number } {
  return {
    x: clamp01to100(((x + SPLAT_CLIP_ROOM.width / 2) / SPLAT_CLIP_ROOM.width) * 100),
    y: clamp01to100(((z + SPLAT_CLIP_ROOM.depth / 2) / SPLAT_CLIP_ROOM.depth) * 100)
  };
}

export default function TourViewer() {
  const objectUrlRef = useRef<string | null>(null);
  const [src, setSrc] = useState(SPLAT_SRC);
  const [acceptedFileName, setAcceptedFileName] = useState("");
  const [activeId, setActiveId] = useState(DEMO_PRESETS[0]?.id ?? "");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingVisible, setIsLoadingVisible] = useState(true);
  const [showHint, setShowHint] = useState(true);
  const [isDropzoneOpen, setIsDropzoneOpen] = useState(false);
  const [isWalkMode, setIsWalkMode] = useState(false);
  const [minimapPosition, setMinimapPosition] = useState<{ x: number; y: number } | null>(null);

  const handleCameraMove = useCallback((position: [number, number, number]) => {
    setMinimapPosition(worldToMinimapPercent(position[0], position[2]));
  }, []);

  const initialCamera: [number, number, number] = DEMO_PRESETS[0]?.camera.position ?? [0, 1.5, 3];

  const handleAcceptSplat = useCallback((url: string, fileName: string) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    objectUrlRef.current = url;
    setSrc(url);
    setAcceptedFileName(fileName);
    setIsLoaded(false);
    setIsLoadingVisible(true);
    setShowHint(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    const loadingTimer = window.setTimeout(() => setIsLoadingVisible(false), 420);
    const hintTimer = window.setTimeout(() => setShowHint(false), 4200);

    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(hintTimer);
    };
  }, [isLoaded]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

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

          .tour-preset-divider {
            flex: 0 0 auto;
            width: 1px;
            min-height: 24px;
            margin: 7px 2px;
            background: var(--line);
          }

          .tour-walk-toggle {
            display: inline-flex;
            flex: 0 0 auto;
            align-items: center;
            justify-content: center;
            gap: 7px;
            min-height: 38px;
            padding: 9px 15px;
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

          .tour-walk-toggle:hover {
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-walk-toggle:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-walk-toggle.is-active {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
            transform: translateY(-1px);
          }

          .tour-dropzone-dock {
            position: absolute;
            z-index: 5;
            right: 16px;
            bottom: 76px;
            display: grid;
            justify-items: end;
            gap: 8px;
            max-width: calc(100% - 32px);
          }

          .tour-dropzone-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 38px;
            max-width: min(280px, calc(100vw - 32px));
            padding: 9px 12px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: color-mix(in srgb, var(--paper) 90%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            cursor: pointer;
            font-size: 13px;
            font-weight: 800;
            line-height: 1;
            backdrop-filter: blur(12px);
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-dropzone-toggle:hover {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-dropzone-toggle:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-dropzone-toggle span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-dropzone-toggle svg:last-child {
            transition: transform 160ms ease;
          }

          .tour-dropzone-toggle.is-open svg:last-child {
            transform: rotate(180deg);
          }

          .tour-dropzone-panel {
            padding: 10px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
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

            .tour-preset-divider {
              min-height: 22px;
              margin: 7px 0;
            }

            .tour-walk-toggle {
              min-height: 36px;
              padding: 8px 11px;
              font-size: 13px;
            }

            .tour-dropzone-dock {
              right: 10px;
              bottom: 66px;
              max-width: calc(100% - 20px);
            }

            .tour-dropzone-toggle {
              max-width: min(260px, calc(100vw - 20px));
              font-size: 12px;
            }
          }
        `}
      </style>
      <Canvas camera={{ fov: 60, position: initialCamera }} shadows>
        <ambientLight intensity={0.85} />
        <directionalLight castShadow intensity={1.1} position={[3, 6, 4]} />
        <SplatScene key={src} onLoaded={() => setIsLoaded(true)} src={src} />
        <TourCamera
          activeId={activeId}
          onArrive={setActiveId}
          onCameraMove={handleCameraMove}
          presets={DEMO_PRESETS}
          walkMode={isWalkMode}
        />
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
        <TourMinimap
          activeId={activeId}
          livePosition={minimapPosition}
          onSelect={setActiveId}
          presets={DEMO_PRESETS}
        />
      </div>

      <div className="tour-dropzone-dock">
        <button
          aria-expanded={isDropzoneOpen}
          className={`tour-dropzone-toggle${isDropzoneOpen ? " is-open" : ""}`}
          onClick={() => setIsDropzoneOpen((current) => !current)}
          type="button"
        >
          <UploadCloud aria-hidden size={16} strokeWidth={2.4} />
          <span>{acceptedFileName || "내 스캔 검사·미리보기"}</span>
          <ChevronDown aria-hidden size={15} strokeWidth={2.6} />
        </button>
        {isDropzoneOpen ? (
          <div className="tour-dropzone-panel">
            <SplatDropzone onAccept={handleAcceptSplat} />
          </div>
        ) : null}
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
        <span aria-hidden className="tour-preset-divider" />
        <button
          aria-pressed={isWalkMode}
          className={`tour-walk-toggle${isWalkMode ? " is-active" : ""}`}
          onClick={() => setIsWalkMode((current) => !current)}
          type="button"
        >
          <Footprints aria-hidden size={16} strokeWidth={2.4} />
          <span>걷기</span>
        </button>
      </div>
    </div>
  );
}
