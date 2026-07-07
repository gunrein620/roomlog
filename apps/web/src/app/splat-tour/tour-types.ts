export interface TourPreset {
  id: string;
  label: string;
  camera: { position: [number, number, number]; target: [number, number, number] };
  minimap: { x: number; y: number }; // 0~100 정규화 좌표
}

// ─────────────────────────────────────────────────────────────
// 병렬 스트림 공유 계약 (freeze). 세 작업(②③④)이 이 타입만 참조한다.
// SplatTransform 필드명은 splat-scene.tsx의 SplatTuning과 1:1 대응 →
// ③ solver 출력이 어댑터 없이 씬에 주입된다. 이 파일은 통합 담당(main)만 편집.
// ─────────────────────────────────────────────────────────────

/** 도면/스플랫 공용 2D 바닥평면 좌표. 도면은 실측 mm→m, 스플랫은 (x, z). */
export interface Point2 {
  x: number;
  y: number;
}

/** 정합 대응쌍: 같은 물리 모서리를 스플랫 뷰와 도면에서 각각 클릭한 결과. */
export interface RegistrationPointPair {
  splat: Point2; // 스플랫 바닥평면 좌표 (world x, z를 2D로)
  plan: Point2; // 도면 평면 좌표 (실측 m)
}

/**
 * ③ 2점 유사변환 solver의 출력이자 SplatAsset.transform에 영속화되는 값.
 * 필드명은 splat-scene.tsx SplatTuning과 동일 — 매핑 레이어 불필요.
 * solver가 계산: rotationYDegrees(yaw), scaleMultiplier, offsetX, offsetZ.
 * 중력정렬로 고정/통과: rotationXDegrees(기본 180, SPZ Y-down→Y-up), offsetY.
 */
export interface SplatTransform {
  rotationXDegrees: number;
  rotationYDegrees: number;
  scaleMultiplier: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

/** ② 캡처 사전검증의 개별 지표 결과. */
export type CaptureCheckId = "blur" | "exposure" | "parallax";

export interface CaptureCheck {
  id: CaptureCheckId;
  ok: boolean;
  metric: number; // 측정값 (예: 라플라시안 분산 평균)
  threshold: number; // 통과 임계
  reason: string; // 사용자 안내 (한국어)
}

/**
 * ② 업로드 사전검증 결과. 완성 파일 포맷을 보는 splat-validate.ts와 달리,
 * 재구성 이전의 입력 영상/프레임 품질을 반려하는 게이트.
 */
export interface CaptureValidationResult {
  ok: boolean; // 모든 필수 체크 통과
  frameCount: number;
  checks: CaptureCheck[];
}
