import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { serverFetch, ApiError } from "@/lib/server-api";
import { unifiedLoginPath } from "@/lib/unified-login";

export const dynamic = "force-dynamic";

// 수리업체 진입 인덱스.
// - 초대 링크(/vendor?inviteToken=...)는 새 로그인/새 계정을 요구하는 대신
//   현재 로그인한 WOOZU 계정에 협력업체(VendorProfile)를 연결한다.
// - 초대 없이 들어오면 V-JOB 첫 화면으로. 거대 뷰 셸은 은퇴(1-E).
export default async function VendorIndex({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = params.inviteToken;
  const inviteToken = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();

  if (inviteToken) {
    const returnTo = `/vendor?inviteToken=${encodeURIComponent(inviteToken)}`;
    const user = await getUser();

    // 미로그인이면 통합 로그인 후 이 초대 링크로 되돌아온다.
    if (!user) redirect(unifiedLoginPath("vendor", returnTo));

    let linkError: string | undefined;
    try {
      await serverFetch(`/auth/invites/VENDOR/${encodeURIComponent(inviteToken)}/accept`, {
        method: "POST"
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      linkError = error.message;
    }

    if (linkError) {
      redirect(`${unifiedLoginPath("vendor", "/vendor/job/00")}&error=${encodeURIComponent(linkError)}`);
    }

    redirect("/vendor/job/00");
  }

  redirect("/vendor/job/00");
}
