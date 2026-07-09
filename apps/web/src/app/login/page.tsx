"use client";

// 통합 WOOZU 로그인 진입점.
// - 로그인 화면은 집우집주와 룸로그가 공유하는 단일 계정 로그인 하나뿐이다.
// - intent(tenant/landlord/vendor)는 "어느 표면으로 가려던 참이었나"만 나타내고,
//   로그인 가능 여부를 가르지 않는다.
// - 이미 로그인된 계정에 해당 capability가 없으면 재로그인 대신
//   "이 계정에 연결이 필요하다" 안내 상태를 보여준다.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  WoozuLoginScreen,
  type AppRole,
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

const intentGuidance: Record<LoginIntent, { title: string; body: string; linkHint: string }> = {
  tenant: {
    title: "사는 집 연결이 필요합니다",
    body: "이 WOOZU 계정에는 아직 연결된 사는 집이 없습니다. 관리인에게 받은 초대 링크를 열면 이 계정에 사는 집이 연결됩니다.",
    linkHint: "관리인 초대 링크로 연결"
  },
  landlord: {
    title: "관리 중인 집 연결이 필요합니다",
    body: "이 WOOZU 계정에는 아직 관리 중인 집이 없습니다. 집을 내놓으면 이 계정에 관리 중인 집이 연결됩니다.",
    linkHint: "집 내놓기 시작"
  },
  vendor: {
    title: "협력업체 연결이 필요합니다",
    body: "이 WOOZU 계정에는 아직 연결된 협력업체가 없습니다. 관리인에게 받은 업체 초대 링크를 열면 이 계정에 업체가 연결됩니다.",
    linkHint: "관리인 초대 링크로 연결"
  }
};

type ScreenState =
  | { kind: "checking" }
  | { kind: "login-form" }
  | { kind: "link-required"; intent: LoginIntent; viewer: ViewerProfile };

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
    const error = params.get("error") ?? undefined;

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
        const destination = resolvePostLoginDestination(viewer, nextIntent, nextRedirect);

        if (destination.kind === "redirect") {
          router.replace(destination.path);
          return;
        }

        setState({ kind: "link-required", intent: destination.intent, viewer });
      })
      .catch(() => {
        if (isAlive) setState({ kind: "login-form" });
      });

    return () => {
      isAlive = false;
    };
  }, [router]);

  const onAuthenticated = (viewer: ViewerProfile) => {
    const destination = resolvePostLoginDestination(viewer, intent, redirectTo);

    if (destination.kind === "redirect") {
      router.replace(destination.path);
      router.refresh();
      return;
    }

    setState({ kind: "link-required", intent: destination.intent, viewer });
  };

  const logoutAndRetry = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ kind: "login-form" });
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

  if (state.kind === "link-required") {
    const guidance = intentGuidance[state.intent];

    return (
      <main className="app-canvas">
        <section className="auth-check-screen" aria-live="polite">
          <strong>{guidance.title}</strong>
          <span>
            {state.viewer.name}({state.viewer.email}) 계정으로 로그인되어 있습니다. {guidance.body}
          </span>
          {initialError ? (
            <span className="service-auth-error" role="alert">
              {initialError}
            </span>
          ) : null}
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
            {/* landlord는 보호된 마이페이지(/?role=landlord)가 아니라 비보호 등록 시작(flow=listing)으로 —
                capability 없는 계정이 CTA를 눌러 다시 /login으로 돌아오는 루프 방지 (QA 2) */}
            <a
              href={state.intent === "landlord" ? "/?flow=listing" : "/"}
              style={{
                padding: "10px 16px",
                borderRadius: "var(--radius-btn, 10px)",
                background: "var(--primary)",
                color: "var(--on-primary)",
                fontWeight: 700,
                textDecoration: "none"
              }}
            >
              {guidance.linkHint}
            </a>
            <button
              type="button"
              onClick={logoutAndRetry}
              style={{
                padding: "10px 16px",
                borderRadius: "var(--radius-btn, 10px)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--on-surface)",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              다른 계정으로 로그인
            </button>
          </div>
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
    />
  );
}
