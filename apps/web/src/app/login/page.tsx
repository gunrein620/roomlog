"use client";

// 통합 WOOZU 로그인 진입점.
// - 로그인 화면은 집우집주와 룸로그가 공유하는 단일 계정 로그인 하나뿐이다.
// - intent(tenant/landlord/vendor)는 "어느 표면으로 가려던 참이었나"만 나타내고,
//   로그인 가능 여부를 가르지 않는다.
// - 이미 로그인된 계정에 해당 capability가 없어도 안내 화면 없이
//   관계를 만드는 진입점(예: landlord → 매물등록 폼)으로 바로 보낸다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  VENDOR_ACTIVATION_LOGIN_ACTION,
  WoozuLoginScreen,
  socialAuthErrorMessage,
  type ViewerProfile
} from "../_components/WoozuLoginScreen";
import {
  defaultRedirectForIntent,
  normalizeLoginIntent,
  resolvePostLoginDestination,
  safeRedirectPath,
  unifiedLoginPath,
  type LoginIntent
} from "../../lib/unified-login";

type ScreenState = { kind: "checking" } | { kind: "login-form" };

export default function UnifiedLoginPage() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ kind: "checking" });
  const [intent, setIntent] = useState<LoginIntent | undefined>(undefined);
  const [redirectTo, setRedirectTo] = useState<string | undefined>(undefined);
  const [initialError, setInitialError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextIntent = normalizeLoginIntent(params.get("intent"));
    const nextRedirect = safeRedirectPath(params.get("redirectTo"), "") || undefined;
    const error = socialAuthErrorMessage(params.get("error") ?? undefined);

    setIntent(nextIntent);
    setRedirectTo(nextRedirect);
    setInitialError(error);

    let isAlive = true;

    // 이미 로그인돼 있으면 로그인 화면 대신 capability 기준으로 바로 라우팅한다.
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!isAlive) return;

        if (!response.ok) {
          setState({ kind: "login-form" });
          return;
        }

        const viewer = (await response.json()) as ViewerProfile;
        router.replace(resolvePostLoginDestination(viewer, nextIntent, nextRedirect));
      })
      .catch(() => {
        if (isAlive) setState({ kind: "login-form" });
      });

    return () => {
      isAlive = false;
    };
  }, [router]);

  const onAuthenticated = (viewer: ViewerProfile) => {
    router.replace(resolvePostLoginDestination(viewer, intent, redirectTo));
    router.refresh();
  };

  if (state.kind === "checking") {
    return (
      <main className="app-canvas">
        <section className="auth-check-screen" aria-live="polite">
          <strong>로그인 확인 중</strong>
          <span>WOOZU 계정 하나로 방 찾기, 사는 집, 내놓은 집, 관리 중인 집을 이어갑니다.</span>
        </section>
      </main>
    );
  }

  return (
    <WoozuLoginScreen
      mode="login"
      onAuthenticated={onAuthenticated}
      onGoHome={() => router.push("/")}
      googleRedirectTo={redirectTo ?? defaultRedirectForIntent(intent)}
      googleErrorRedirectTo={unifiedLoginPath(intent, redirectTo)}
      initialError={initialError}
      vendorActivationAction={VENDOR_ACTIVATION_LOGIN_ACTION}
    />
  );
}
