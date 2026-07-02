// Nest API(4000) 베이스 URL 계산 — 팀 거대 page.tsx의 apiUrl 로직을 salvage.
// 서버(Next)→Nest 호출 전용. 브라우저는 이 URL을 직접 부르지 않는다(BFF 경유).
const API_BASE = (
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000"
).replace(/\/$/, "");

export function apiUrl(path: string): string {
  return API_BASE.endsWith("/api") ? `${API_BASE}${path}` : `${API_BASE}/api${path}`;
}
