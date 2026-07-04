"use client";

import { useId, useState } from "react";

const ROT_X_OPTIONS = [0, 90, 180, 270] as const;

type FitMode = "auto" | "native";
type RotationX = (typeof ROT_X_OPTIONS)[number];

interface TuningValues {
  fit: FitMode;
  rotX: RotationX;
  rotY: number;
  scale: number;
  x: number;
  y: number;
  z: number;
}

const TUNING_QUERY_KEYS = [
  "splatFit",
  "splatRotX",
  "splatRotY",
  "splatScale",
  "splatX",
  "splatY",
  "splatZ"
] as const;

const DEFAULT_TUNING_VALUES: TuningValues = {
  fit: "auto",
  rotX: 180,
  rotY: 0,
  scale: 1,
  x: 0,
  y: 1.2,
  z: -0.5
};

export default function TourTuningPanel() {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [values, setValues] = useState<TuningValues>(() => readTuningValuesFromLocation());

  function updateNumber(key: "rotY" | "scale" | "x" | "y" | "z", rawValue: string) {
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) return;

    setValues((current) => ({
      ...current,
      [key]: key === "rotY" ? Math.round(nextValue) : roundToPrecision(nextValue, 2)
    }));
    setCopyStatus("idle");
  }

  function applyTuning() {
    const url = new URL(window.location.href);
    url.searchParams.set("splatFit", values.fit);
    url.searchParams.set("splatRotX", String(values.rotX));
    url.searchParams.set("splatRotY", String(values.rotY));
    url.searchParams.set("splatScale", formatNumber(values.scale));
    url.searchParams.set("splatX", formatNumber(values.x));
    url.searchParams.set("splatY", formatNumber(values.y));
    url.searchParams.set("splatZ", formatNumber(values.z));
    window.location.assign(url.toString());
  }

  function resetTuning() {
    const url = new URL(window.location.href);
    TUNING_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
    window.location.assign(url.toString());
  }

  async function copyJson() {
    const profile = {
      fit: values.fit,
      rotX: values.rotX,
      rotY: values.rotY,
      scale: roundToPrecision(values.scale, 2),
      x: roundToPrecision(values.x, 2),
      y: roundToPrecision(values.y, 2),
      z: roundToPrecision(values.z, 2)
    };

    try {
      await writeClipboardText(JSON.stringify(profile, null, 2));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <aside aria-label="splat 정합 조정" className="tour-tuning-dock">
      <style>
        {`
          .tour-tuning-dock {
            position: fixed;
            z-index: 20;
            left: 24px;
            bottom: 24px;
            width: min(374px, calc(100vw - 32px));
            color: var(--ink);
          }

          .tour-tuning-toggle,
          .tour-tuning-close,
          .tour-tuning-segment button,
          .tour-tuning-rot button,
          .tour-tuning-action {
            min-height: 38px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 90%, transparent);
            color: var(--ink);
            font-size: 13px;
            font-weight: 900;
            line-height: 1;
            transition:
              background 160ms ease,
              border-color 160ms ease,
              color 160ms ease,
              transform 160ms ease;
          }

          .tour-tuning-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 116px;
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
          }

          .tour-tuning-toggle:hover,
          .tour-tuning-close:hover,
          .tour-tuning-segment button:hover,
          .tour-tuning-rot button:hover,
          .tour-tuning-action:hover {
            border-color: var(--blue);
            background: var(--blue-soft);
            color: var(--blue);
          }

          .tour-tuning-toggle:focus-visible,
          .tour-tuning-close:focus-visible,
          .tour-tuning-segment button:focus-visible,
          .tour-tuning-rot button:focus-visible,
          .tour-tuning-action:focus-visible,
          .tour-tuning-row input:focus-visible {
            outline: 2px solid var(--blue);
            outline-offset: 2px;
          }

          .tour-tuning-panel {
            display: grid;
            max-height: min(680px, calc(100dvh - 48px));
            gap: 14px;
            overflow: auto;
            padding: 14px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: color-mix(in srgb, var(--paper) 92%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(14px);
          }

          .tour-tuning-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .tour-tuning-header strong {
            display: block;
            font-size: 15px;
            line-height: 1.2;
          }

          .tour-tuning-header span,
          .tour-tuning-status {
            color: var(--muted);
            font-size: 11px;
            font-weight: 900;
          }

          .tour-tuning-close {
            flex: 0 0 auto;
            min-width: 54px;
            min-height: 34px;
          }

          .tour-tuning-form,
          .tour-tuning-group {
            display: grid;
            gap: 12px;
          }

          .tour-tuning-group {
            margin: 0;
            padding: 0;
            border: 0;
          }

          .tour-tuning-group legend {
            margin-bottom: 8px;
            color: var(--muted);
            font-size: 11px;
            font-weight: 900;
            line-height: 1;
          }

          .tour-tuning-segment,
          .tour-tuning-rot,
          .tour-tuning-actions {
            display: grid;
            gap: 8px;
          }

          .tour-tuning-segment {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tour-tuning-rot {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .tour-tuning-segment button.is-active,
          .tour-tuning-rot button.is-active {
            border-color: var(--blue);
            background: var(--blue);
            color: var(--paper);
          }

          .tour-tuning-row {
            display: grid;
            grid-template-columns: 62px minmax(0, 1fr) 76px;
            align-items: center;
            gap: 10px;
          }

          .tour-tuning-row label {
            color: var(--ink);
            font-size: 13px;
            font-weight: 900;
          }

          .tour-tuning-row input {
            width: 100%;
            accent-color: var(--blue);
          }

          .tour-tuning-row output {
            min-width: 0;
            overflow: hidden;
            color: var(--muted);
            font-size: 12px;
            font-weight: 900;
            text-align: right;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tour-tuning-actions {
            grid-template-columns: 1fr 1fr 1fr;
          }

          .tour-tuning-action.primary {
            border-color: var(--blue);
            background: var(--blue);
            color: var(--paper);
          }

          .tour-tuning-action.primary:hover {
            background: var(--blue);
            color: var(--paper);
            transform: translateY(-1px);
          }

          .tour-tuning-status {
            min-height: 14px;
            text-align: right;
          }

          @media (max-width: 560px) {
            .tour-tuning-dock {
              left: 16px;
              bottom: 16px;
              width: min(356px, calc(100vw - 32px));
            }

            .tour-tuning-row {
              grid-template-columns: 48px minmax(0, 1fr) 70px;
              gap: 8px;
            }

            .tour-tuning-actions {
              grid-template-columns: 1fr;
            }
          }
        `}
      </style>

      {isOpen ? (
        <section className="tour-tuning-panel" id={panelId}>
          <header className="tour-tuning-header">
            <div>
              <strong>정합 조정</strong>
              <span>splat 튜닝</span>
            </div>
            <button className="tour-tuning-close" onClick={() => setIsOpen(false)} type="button">
              접기
            </button>
          </header>

          <form
            className="tour-tuning-form"
            onSubmit={(event) => {
              event.preventDefault();
              applyTuning();
            }}
          >
            <fieldset className="tour-tuning-group">
              <legend>fit</legend>
              <div className="tour-tuning-segment">
                {(["auto", "native"] as const).map((fit) => (
                  <button
                    aria-pressed={values.fit === fit}
                    className={values.fit === fit ? "is-active" : ""}
                    key={fit}
                    onClick={() => {
                      setValues((current) => ({ ...current, fit }));
                      setCopyStatus("idle");
                    }}
                    type="button"
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="tour-tuning-group">
              <legend>rotX</legend>
              <div className="tour-tuning-rot">
                {ROT_X_OPTIONS.map((rotX) => (
                  <button
                    aria-pressed={values.rotX === rotX}
                    className={values.rotX === rotX ? "is-active" : ""}
                    key={rotX}
                    onClick={() => {
                      setValues((current) => ({ ...current, rotX }));
                      setCopyStatus("idle");
                    }}
                    type="button"
                  >
                    {rotX}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="tour-tuning-row">
              <label htmlFor={`${panelId}-rot-y`}>rotY</label>
              <input
                id={`${panelId}-rot-y`}
                max="180"
                min="-180"
                onChange={(event) => updateNumber("rotY", event.target.value)}
                step="1"
                type="range"
                value={values.rotY}
              />
              <output htmlFor={`${panelId}-rot-y`}>{values.rotY}°</output>
            </div>

            <div className="tour-tuning-row">
              <label htmlFor={`${panelId}-scale`}>scale</label>
              <input
                id={`${panelId}-scale`}
                max="3"
                min="0.2"
                onChange={(event) => updateNumber("scale", event.target.value)}
                step="0.05"
                type="range"
                value={values.scale}
              />
              <output htmlFor={`${panelId}-scale`}>{formatNumber(values.scale)}x</output>
            </div>

            {(["x", "y", "z"] as const).map((axis) => (
              <div className="tour-tuning-row" key={axis}>
                <label htmlFor={`${panelId}-${axis}`}>{axis}</label>
                <input
                  id={`${panelId}-${axis}`}
                  max="5"
                  min="-5"
                  onChange={(event) => updateNumber(axis, event.target.value)}
                  step="0.05"
                  type="range"
                  value={values[axis]}
                />
                <output htmlFor={`${panelId}-${axis}`}>{formatNumber(values[axis])}m</output>
              </div>
            ))}

            <div className="tour-tuning-actions">
              <button className="tour-tuning-action primary" type="submit">
                적용
              </button>
              <button className="tour-tuning-action" onClick={copyJson} type="button">
                JSON 복사
              </button>
              <button className="tour-tuning-action" onClick={resetTuning} type="button">
                초기화
              </button>
            </div>

            <p aria-live="polite" className="tour-tuning-status">
              {copyStatus === "copied" ? "복사됨" : copyStatus === "failed" ? "복사 실패" : ""}
            </p>
          </form>
        </section>
      ) : (
        <button
          aria-controls={panelId}
          aria-expanded="false"
          className="tour-tuning-toggle"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          정합 조정
        </button>
      )}
    </aside>
  );
}

function readTuningValuesFromLocation(): TuningValues {
  if (typeof window === "undefined") {
    return DEFAULT_TUNING_VALUES;
  }

  const params = new URLSearchParams(window.location.search);
  const fit = params.get("splatFit") === "native" ? "native" : DEFAULT_TUNING_VALUES.fit;
  const rotX = normalizeRotationX(readNumberParam(params, "splatRotX", DEFAULT_TUNING_VALUES.rotX, 0, 270));

  return {
    fit,
    rotX,
    rotY: readNumberParam(params, "splatRotY", DEFAULT_TUNING_VALUES.rotY, -180, 180, 0),
    scale: readNumberParam(params, "splatScale", DEFAULT_TUNING_VALUES.scale, 0.2, 3, 2),
    x: readNumberParam(params, "splatX", DEFAULT_TUNING_VALUES.x, -5, 5, 2),
    y: readNumberParam(params, "splatY", DEFAULT_TUNING_VALUES.y, -5, 5, 2),
    z: readNumberParam(params, "splatZ", DEFAULT_TUNING_VALUES.z, -5, 5, 2)
  };
}

function readNumberParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
  precision = 2
): number {
  const rawValue = params.get(key);
  if (rawValue === null) return fallback;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;

  return roundToPrecision(clamp(value, min, max), precision);
}

function normalizeRotationX(value: number): RotationX {
  return ROT_X_OPTIONS.find((option) => option === value) ?? DEFAULT_TUNING_VALUES.rotX;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToPrecision(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}

function formatNumber(value: number): string {
  return String(roundToPrecision(value, 2));
}

async function writeClipboardText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto 0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("copy command failed");
    }
  } finally {
    textarea.remove();
  }
}
