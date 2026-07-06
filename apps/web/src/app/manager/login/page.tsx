import { redirect } from "next/navigation";
import { legacyLoginRedirectTarget } from "../../../lib/unified-login";

// 구 관리인 로그인 경로 — 통합 WOOZU 로그인(/login)으로 호환 redirect.
// 관리 콘솔은 별도 로그인이 아니라, 로그인한 계정에 연결된 관리 중인 집으로 이어진다.
export default async function ManagerLoginRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyLoginRedirectTarget("landlord", await searchParams));
}
