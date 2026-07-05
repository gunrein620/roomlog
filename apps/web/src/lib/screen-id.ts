/**
 * 스펙 문서의 화면ID(M-COST-00, T-MSG-01, V-JOB-E0 …)는 내부 식별자다.
 * 라우트 매핑 키로는 계속 쓰지만, 사용자에게 보이는 문자열에는 노출하지 않는다.
 * 접두 화면ID(및 뒤따르는 · 구분자)를 걷어내고, ID뿐인 문자열이면 빈 문자열을 돌려준다.
 */
export function stripScreenId(value: string): string {
  return value.replace(/^[MTV]-[A-Z]+-[0-9E]+\s*(?:·\s*)?/u, "").trim();
}
