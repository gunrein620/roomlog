// GLB 메시를 배치 프레임에 앉히기 위한 순수 계산 — UI/Three 의존 없이 컨테이너와 테스트가 공유한다.
//
// 전제(2026-07-19 usdcat --flatten 실기 검증, 실물 줄자 대조):
// Object Capture 산출물(USDZ→GLB)은 metersPerUnit=1 즉 이미 실측 미터다. 스케일을 맞출 필요가 없다.
// 앵커 규약은 "발자국 중심이 원점, 바닥이 y=0, Y-up" — 다만 USDZ→GLB 변환 파이프라인이 이 규약을
// 깨뜨릴 수 있으니 여기서 런타임 bbox로 재보정한다. ⚠️ 절대 sizeMm(박스)에 맞춰 리스케일하지 않는다.

import type { FurnitureDimensionsMm } from "@roomlog/types/tenant-furniture";

export type MeshBoundingBox = { min: [number, number, number]; max: [number, number, number] };

// 비율이 이 범위를 벗어나면 스케일 회귀를 의심한다(사용자 차단 아님, 콘솔 경고용 그물).
const SCALE_SANITY_MIN_RATIO = 0.5;
const SCALE_SANITY_MAX_RATIO = 2;

/** bbox 중심(x,z)을 원점에, 최저점(y)을 바닥(0)에 맞추는 평행이동 오프셋. */
export function anchorMeshOffset(box: MeshBoundingBox): [number, number, number] {
  const centerX = (box.min[0] + box.max[0]) / 2;
  const centerZ = (box.min[2] + box.max[2]) / 2;
  return [-centerX, -box.min[1], -centerZ];
}

/**
 * 메시 높이(y extent)를 등록된 sizeMm.height와 대조한다. 벗어나면 경고 메시지를, 정상이면 null을 돌려준다.
 * X·Z는 Object Capture 촬영 시 사용자가 맞춘 바운딩 박스 벽면에 메시가 잘린 흔적이라 항상 실물보다
 * 커 보인다(과대추정) — 그래서 검증에서 제외한다. 높이 상단만 촬영 볼륨에 안 닿아 신뢰할 수 있다.
 */
export function checkMeshScaleSanity(box: MeshBoundingBox, sizeMm: FurnitureDimensionsMm): string | null {
  const expectedHeightM = sizeMm.height / 1000;
  if (expectedHeightM <= 0) return null;

  const meshHeightM = box.max[1] - box.min[1];
  const ratio = meshHeightM / expectedHeightM;
  if (ratio >= SCALE_SANITY_MIN_RATIO && ratio <= SCALE_SANITY_MAX_RATIO) return null;

  return `메시 높이(${meshHeightM.toFixed(2)}m)가 등록 치수(${expectedHeightM.toFixed(2)}m)와 크게 어긋납니다(비율 ${ratio.toFixed(2)}).`;
}
