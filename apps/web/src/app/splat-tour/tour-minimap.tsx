"use client";

import type { TourPreset } from "./tour-types";

const labelPlacementFor = (y: number) => (y > 74 ? "top" : "bottom");

export function TourMinimap({
  presets,
  activeId,
  onSelect,
  livePosition
}: {
  presets: TourPreset[];
  activeId: string;
  onSelect: (id: string) => void;
  // 카메라 실시간 위치(정규화 0~100%). 정합된 splat 위 현재 시점을 도면에 점으로 표시(Matterport식).
  livePosition?: { x: number; y: number } | null;
}) {
  return (
    <div className="tour-minimap-card" aria-label="투어 미니맵">
      <style>
        {`
          .tour-minimap-card {
            position: relative;
            width: 118px;
            height: 166px;
            padding: 8px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 88%, transparent);
            box-shadow: var(--shadow);
            color: var(--ink);
            backdrop-filter: blur(12px);
          }

          .tour-minimap-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
            color: var(--muted);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0;
            line-height: 1;
          }

          .tour-minimap-title span:last-child {
            color: var(--blue);
            font-size: 9px;
          }

          .tour-minimap-plan {
            position: relative;
            width: 100%;
            height: 136px;
            overflow: hidden;
            border-radius: 6px;
          }

          .tour-minimap-plan svg {
            display: block;
            width: 100%;
            height: 100%;
          }

          .tour-minimap-point {
            position: absolute;
            z-index: 1;
            width: 58px;
            height: 42px;
            padding: 0;
            transform: translate(-50%, -50%);
            border: 0;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
          }

          .tour-minimap-point:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
            border-radius: 999px;
          }

          .tour-minimap-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 11px;
            height: 11px;
            transform: translate(-50%, -50%);
            border: 2px solid var(--paper);
            border-radius: 999px;
            background: var(--subtle);
            box-shadow: 0 0 0 2px var(--paper);
            transition:
              width 160ms ease,
              height 160ms ease,
              background 160ms ease,
              box-shadow 160ms ease;
          }

          .tour-minimap-label {
            position: absolute;
            left: 50%;
            max-width: 58px;
            transform: translateX(-50%);
            overflow: hidden;
            border-radius: 999px;
            padding: 2px 6px;
            background: color-mix(in srgb, var(--paper) 90%, transparent);
            color: inherit;
            font-size: 10px;
            font-weight: 800;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-minimap-label.top {
            bottom: 25px;
          }

          .tour-minimap-label.bottom {
            top: 25px;
          }

          .tour-minimap-point.is-active {
            color: var(--blue);
          }

          .tour-minimap-point.is-active .tour-minimap-dot {
            width: 15px;
            height: 15px;
            background: var(--blue);
            box-shadow: 0 0 0 5px var(--blue-soft);
          }

          .tour-minimap-live {
            position: absolute;
            z-index: 2;
            width: 10px;
            height: 10px;
            transform: translate(-50%, -50%);
            border: 2px solid var(--paper);
            border-radius: 999px;
            background: var(--blue);
            box-shadow: 0 0 0 3px var(--blue-soft);
            pointer-events: none;
            transition:
              left 120ms linear,
              top 120ms linear;
          }
        `}
      </style>
      <div className="tour-minimap-title" aria-hidden>
        <span>도면</span>
        <span>3m x 4m</span>
      </div>
      <div className="tour-minimap-plan">
        <svg aria-hidden focusable="false" preserveAspectRatio="none" viewBox="0 0 100 100">
          <rect
            x="8"
            y="6"
            width="84"
            height="88"
            rx="2"
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeOpacity="0.72"
            strokeWidth="5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M14 20H86M14 35H86M14 50H86M14 65H86M14 80H86"
            fill="none"
            stroke="var(--line)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M24 12V88M42 12V88M60 12V88M78 12V88"
            fill="none"
            stroke="var(--line)"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="34"
            y1="6"
            x2="68"
            y2="6"
            stroke="var(--blue)"
            strokeLinecap="round"
            strokeWidth="5"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="34"
            y1="11"
            x2="68"
            y2="11"
            stroke="var(--blue-soft)"
            strokeLinecap="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="54"
            y1="94"
            x2="75"
            y2="94"
            stroke="var(--paper)"
            strokeLinecap="round"
            strokeWidth="7"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M55 93V75M55 93A20 20 0 0 0 74 75"
            fill="none"
            stroke="var(--muted)"
            strokeLinecap="round"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
          <text x="51" y="15" fill="var(--blue)" fontSize="5" fontWeight="800" textAnchor="middle">
            창문
          </text>
          <text x="81" y="90" fill="var(--muted)" fontSize="5" fontWeight="800" textAnchor="middle">
            현관
          </text>
        </svg>
        {livePosition ? (
          <span
            aria-hidden
            className="tour-minimap-live"
            style={{ left: `${livePosition.x}%`, top: `${livePosition.y}%` }}
          />
        ) : null}
        {presets.map((preset) => {
          const isActive = preset.id === activeId;
          const labelPlacement = labelPlacementFor(preset.minimap.y);
          return (
            <button
              aria-label={`${preset.label} 시점으로 이동`}
              aria-pressed={isActive}
              className={`tour-minimap-point${isActive ? " is-active" : ""}`}
              key={preset.id}
              onClick={() => onSelect(preset.id)}
              style={{
                left: `${preset.minimap.x}%`,
                top: `${preset.minimap.y}%`
              }}
              title={preset.label}
              type="button"
            >
              <span aria-hidden className="tour-minimap-dot" />
              <span className={`tour-minimap-label ${labelPlacement}`}>{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
