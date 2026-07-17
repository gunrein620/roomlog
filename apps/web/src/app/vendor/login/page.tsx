import { redirect } from "next/navigation";
import { legacyLoginRedirectTarget } from "../../../lib/unified-login";

// 구 수리업체 로그인 경로 — 통합 WOOZU 로그인(/login)으로 호환 redirect.
// 등록 키 활성화는 별도 /vendor/activate 경로를 사용하고, 이 경로는 이미 연결된
// 업체 전용 계정이 기존 북마크로 진입할 때만 통합 로그인 intent를 보존한다.
export default async function VendorLoginRedirect({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyLoginRedirectTarget("vendor", await searchParams));
}
