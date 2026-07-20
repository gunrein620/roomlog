// RoomPlan(iOS) 캡처 도면 계약 — ARKit LiDAR 캡처 경로에서 얻는 실측(metric) 벽 폴리곤.
// 이 경로의 스플랫은 이미 ARKit 실측 미터 · 중력정렬 상태이므로, 소유자 도면과의 정합은
// yaw + XZ 평행이동만 풀면 된다(스케일은 1로 고정). apps/api의
// roomlog/services/floor-plan-match.ts가 이 타입을 입력으로 소비한다.

/** 캡처 벽 세그먼트 하나. 좌표는 ARKit 실측 미터, XZ 평면(중력정렬 후 y=up). */
export interface MetricWall {
  start: [number, number];
  end: [number, number];
  height: number;
  thickness: number;
}

/** 캡처 개구부(문/창) 하나. 중심점은 ARKit 실측 미터. */
export interface MetricOpening {
  kind: "door" | "window";
  center: [number, number];
  width: number;
  height: number;
}

/** RoomPlan(iOS) 산출 캡처 도면 — 실측 미터·중력정렬(frame="arkit-metric")이 보장된 상태로만 생성된다. */
export interface RoomPlanCaptureFloorPlan {
  walls: MetricWall[];
  openings: MetricOpening[];
  frame: "arkit-metric";
  capturedAt?: string;
}
