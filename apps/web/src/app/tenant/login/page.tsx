import { redirect } from "next/navigation";
import { legacyLoginRedirectTarget } from "../../../lib/unified-login";

// 구 임차인 로그인 경로 — 통합 WOOZU 로그인(/login)으로 호환 redirect.
// 룸로그는 별도 로그인이 아니라, 로그인한 계정에 연결된 사는 집으로 이어진다.
export default async function TenantLoginRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyLoginRedirectTarget("tenant", await searchParams));
}
