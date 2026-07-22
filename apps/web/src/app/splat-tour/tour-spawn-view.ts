import type { SpawnView } from "./tour-types";

// 자산별 스폰 시점(SplatAsset.spawnView) 검증. ?asset= 응답으로 오는 값은 서버 JSON이라 미검증이고,
// 저장 당시 스키마가 바뀌었거나 손상됐을 수도 있다 — 여기를 통과해야 뷰어가 신뢰한다.
// position/target이 유한수 3튜플이 아니면 무효로 보고 호출부는 폴백(SPAWN_VIEW 상수)을 쓴다.

function isFiniteVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export function isValidSpawnView(value: unknown): value is SpawnView {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return isFiniteVector3(candidate.position) && isFiniteVector3(candidate.target);
}

/** asset.spawnView(있으면 미검증 JSON) → 유효하면 그대로, 없거나(null/undefined) 무효면 fallback. */
export function resolveTourSpawnView(candidate: unknown, fallback: SpawnView): SpawnView {
  return isValidSpawnView(candidate) ? candidate : fallback;
}
