"use client";

// TODO(agent-C): SVG 도면 미니맵으로 교체 — 지금은 프리셋 좌표를 점으로 찍은 단순 div.

import type { TourPreset } from "./tour-types";

export function TourMinimap({
  presets,
  activeId,
  onSelect
}: {
  presets: TourPreset[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      aria-label="투어 미니맵"
      style={{
        position: "relative",
        width: 132,
        height: 176,
        background: "var(--paper)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        boxShadow: "var(--shadow)"
      }}
    >
      {presets.map((preset) => {
        const isActive = preset.id === activeId;
        return (
          <button
            aria-current={isActive}
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            style={{
              position: "absolute",
              left: `${preset.minimap.x}%`,
              top: `${preset.minimap.y}%`,
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: 0,
              border: "none",
              background: "transparent",
              color: isActive ? "var(--blue)" : "var(--muted)",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: isActive ? 700 : 500
            }}
            title={preset.label}
            type="button"
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: isActive ? "var(--blue)" : "var(--subtle)",
                border: "2px solid var(--paper)",
                boxShadow: isActive ? "0 0 0 2px var(--blue-soft)" : "none"
              }}
            />
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
