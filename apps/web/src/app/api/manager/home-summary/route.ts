import { getManagerHomeSummary } from "@/lib/manager-home-api";

// 매니저 홈 집계 라우트 핸들러.
// getManagerHomeSummary는 server-only BFF(쿠키 인증 payment-api)를 조합하므로
// 클라이언트 컴포넌트(M-VOX-01)가 직접 import할 수 없다 → 이 라우트로 서버측에서 실행해 노출.
export async function GET() {
  const summary = await getManagerHomeSummary();
  return Response.json(summary);
}
