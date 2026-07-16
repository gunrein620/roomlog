// Spark 로더의 포맷별 기본 방향 규약. tuning 프로파일이 없을 때 쓸 기본 rotX(X축 회전, 도)를 정한다.
// - .ply: Spark가 Y-down으로 읽으므로 X축 180° 회전해야 Y-up(중력정렬)이 된다.
// - .spz(및 그 외): 재구성 파이프라인이 Y-up으로 구워 그대로 올바르므로 회전 0.
// 명시 tuning 프로파일/URL 파라미터(splatRotX)는 항상 이 기본값을 덮는다(오버라이드 불변).

export const PLY_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES = 180;

/** tuning 프로파일이 없을 때의 기본 rotX(도). src 확장자로 판정 — .ply=180, 그 외(.spz 등)=0. */
export function defaultRotationXDegreesForSrc(src: string): number {
  // 확장자 뒤에 ?query·#hash가 붙어도(예: /a.ply?v=2) 인식하도록 경계를 둔다.
  return /\.ply(?:[?#]|$)/i.test(src) ? PLY_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES : 0;
}
