"use client";

// 모바일(coarse pointer) 전용 화면 조이스틱 — 좌하단 링 안에서 엄지 스틱을 끌어 이동 입력을 만든다.
// 출력은 정규화 2D 벡터 { forward, strafe } (각 −1..1), 놓으면 null(부모가 0,0으로 리셋).
//
// 터치 격리(이 컴포넌트의 핵심): 스틱을 끄는 포인터가 카메라 룩-드래그(캔버스)로 새지 않아야 한다.
//  1) pointerdown에서 setPointerCapture로 이 요소가 제스처를 독점 → 이후 move/up이 손가락이
//     링을 벗어나도 이 요소로만 온다.
//  2) stopPropagation + preventDefault로 상위/캔버스로의 전파·기본 스크롤 제스처를 끊는다.
//  3) touch-action: none으로 브라우저의 팬/줌 가로채기를 막는다.
// 조이스틱은 캔버스와 별개 DOM 서브트리라 CameraControls(캔버스 바인딩)는 애초에 이 이벤트를
// 못 받지만, 위 3중 방어로 어떤 바인딩 방식에서도 룩-드래그와 섞이지 않게 한다.

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface TourJoystickVector {
  forward: number; // −1(후진)..1(전진)
  strafe: number; // −1(좌)..1(우)
}

// 링 안에서 엄지가 최대로 이동할 수 있는 반경(px). (링 지름 − 스틱 지름) / 2 와 맞춰 스틱이
// 링 밖으로 새지 않게 한다. 정규화도 이 값 기준(clampedDist / RADIUS).
const THUMB_TRAVEL_RADIUS_PX = 34;

export function TourJoystick({ onChange }: { onChange: (vector: TourJoystickVector | null) => void }) {
  const ringRef = useRef<HTMLDivElement>(null);
  const activePointerRef = useRef<number | null>(null);
  // 엄지 스틱의 시각적 오프셋(px). 입력 벡터와 별개로 렌더링만 담당.
  const [thumbOffset, setThumbOffset] = useState({ x: 0, y: 0 });

  // 링 중심 기준 (dx, dy)px → 링 반경으로 클램프한 스틱 위치 + 정규화 이동 벡터를 방출.
  const emitFromCenterDelta = useCallback(
    (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      const clampedDistance = Math.min(distance, THUMB_TRAVEL_RADIUS_PX);
      const scale = distance > 0 ? clampedDistance / distance : 0;
      const offsetX = dx * scale;
      const offsetY = dy * scale;
      setThumbOffset({ x: offsetX, y: offsetY });

      // 화면 y는 아래로 증가 → 위로 밀면(전진) forward 양수가 되도록 부호 반전.
      onChange({
        forward: -offsetY / THUMB_TRAVEL_RADIUS_PX,
        strafe: offsetX / THUMB_TRAVEL_RADIUS_PX
      });
    },
    [onChange]
  );

  const updateFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const ring = ringRef.current;
      if (!ring) return;
      const rect = ring.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      emitFromCenterDelta(event.clientX - centerX, event.clientY - centerY);
    },
    [emitFromCenterDelta]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== null) return;
      event.stopPropagation();
      event.preventDefault();
      activePointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateFromEvent(event);
    },
    [updateFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== event.pointerId) return;
      event.stopPropagation();
      event.preventDefault();
      updateFromEvent(event);
    },
    [updateFromEvent]
  );

  const handlePointerRelease = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerRef.current !== event.pointerId) return;
      event.stopPropagation();
      event.preventDefault();
      activePointerRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 이미 해제됐으면 무시.
      }
      setThumbOffset({ x: 0, y: 0 });
      onChange(null);
    },
    [onChange]
  );

  return (
    <div aria-label="이동 조이스틱" className="tour-joystick-dock" role="group">
      <style>
        {`
          .tour-joystick-dock {
            position: absolute;
            z-index: 4;
            bottom: 16px;
            left: 16px;
            touch-action: none;
          }

          .tour-joystick-ring {
            display: grid;
            place-items: center;
            width: 120px;
            height: 120px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: color-mix(in srgb, var(--paper) 78%, transparent);
            box-shadow: var(--shadow);
            backdrop-filter: blur(12px);
            touch-action: none;
            cursor: grab;
            -webkit-user-select: none;
            user-select: none;
          }

          .tour-joystick-ring:active {
            cursor: grabbing;
          }

          .tour-joystick-thumb {
            width: 52px;
            height: 52px;
            border: 1px solid var(--blue);
            border-radius: 999px;
            background: color-mix(in srgb, var(--blue) 24%, var(--paper));
            box-shadow: var(--shadow);
            pointer-events: none;
            transition: transform 60ms ease-out;
            will-change: transform;
          }

          @media (max-width: 560px) and (orientation: portrait) {
            .tour-joystick-dock {
              bottom: max(14px, env(safe-area-inset-bottom));
              left: 12px;
            }

            .tour-joystick-ring {
              width: 112px;
              height: 112px;
            }
          }
        `}
      </style>
      <div
        ref={ringRef}
        className="tour-joystick-ring"
        onPointerCancel={handlePointerRelease}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerRelease}
      >
        <span
          aria-hidden
          className="tour-joystick-thumb"
          style={{ transform: `translate(${thumbOffset.x}px, ${thumbOffset.y}px)` }}
        />
      </div>
    </div>
  );
}
