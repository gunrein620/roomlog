// register 픽 화면의 splat 바닥 픽 좌표 계산 — 화면 매핑이 아니라 광선-평면 교차(analytic raycast).
// 이렇게 하면 카메라 각도(탑다운/틸트/오빗)와 무관하게, 클릭 광선이 splat 바닥 평면(y=planeY)과
// 만나는 XZ 지점을 정확히 얻는다. 기존 탑다운 픽(수직 광선 → event.point.x/z)과도 동치다:
// 수직 광선이면 교차 XZ = 광선 원점의 XZ이므로 결과가 같다(스펙으로 확인).

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Ray3Like {
  origin: Vec3Like;
  direction: Vec3Like;
}

/**
 * 광선과 수평면(y = planeY)의 교차점의 XZ를 돌려준다.
 * - 광선이 평면과 평행(|dir.y| ≈ 0)하면 교차 없음 → null.
 * - 교차가 광선 뒤쪽(t < 0)이면(예: 카메라 위쪽 평면을 등지고 클릭) null.
 * direction은 정규화돼 있지 않아도 된다(t는 dir 스케일에 무관하게 같은 점을 준다).
 */
export function rayPlaneIntersectionXZ(ray: Ray3Like, planeY = 0): { x: number; z: number } | null {
  const dirY = ray.direction.y;
  if (!Number.isFinite(dirY) || Math.abs(dirY) < 1e-9) return null;

  const t = (planeY - ray.origin.y) / dirY;
  if (!Number.isFinite(t) || t < 0) return null;

  const x = ray.origin.x + ray.direction.x * t;
  const z = ray.origin.z + ray.direction.z * t;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  return { x, z };
}
