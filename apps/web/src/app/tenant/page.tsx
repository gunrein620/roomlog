import { redirect } from "next/navigation";
import { getUser, requireUser } from "@/lib/session";
import { serverFetch, ApiError } from "@/lib/server-api";
import { unifiedLoginPath } from "@/lib/unified-login";

export const dynamic = "force-dynamic";

// 임차인 진입 인덱스.
// - 초대 링크(/tenant?inviteToken=...)는 새 로그인/새 계정을 요구하는 대신
//   현재 로그인한 WOOZU 계정에 사는 집(TenantRoom)을 연결한다.
// - 초대 없이 들어오면 capability 가드를 거쳐 세입자 마이페이지로.
export default async function TenantIndex({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawToken = params.inviteToken;
  const inviteToken = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();

  if (inviteToken) {
    const returnTo = `/tenant?inviteToken=${encodeURIComponent(inviteToken)}`;
    const user = await getUser();

    // 미로그인이면 통합 로그인 후 이 초대 링크로 되돌아온다.
    if (!user) redirect(unifiedLoginPath("tenant", returnTo));

    let linkError: string | undefined;
    try {
      await serverFetch(`/auth/invites/TENANT/${encodeURIComponent(inviteToken)}/accept`, {
        method: "POST"
      });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      linkError = error.message;
    }

    if (linkError) {
      redirect(`${unifiedLoginPath("tenant", "/?role=tenant&tab=mypage")}&error=${encodeURIComponent(linkError)}`);
    }

    redirect("/?role=tenant&tab=mypage");
  }

  await requireUser("TENANT", "/?role=tenant&tab=mypage");
  redirect("/?role=tenant&tab=mypage");
}
