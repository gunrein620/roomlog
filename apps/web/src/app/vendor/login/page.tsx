import { redirect } from "next/navigation";
import { legacyLoginRedirectTarget } from "../../../lib/unified-login";

// 구 수리업체 로그인 경로 — 통합 WOOZU 로그인(/login)으로 호환 redirect.
// 업체 화면은 별도 로그인이 아니라, 로그인한 계정에 연결된 협력업체로 이어진다.
export default async function VendorLoginRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyLoginRedirectTarget("vendor", await searchParams));
}
