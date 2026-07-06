"use client";

// 집우집주(WOOZU) 단일 계정 로그인 화면 — page.tsx(/?auth=login)와 /login이 공유한다.
// 로그인은 역할을 제한하지 않는다: 계정 identity만 확인하고, 룸로그 표면 진입은
// 로그인 후 세션의 capability(roles)로 판단한다.
import { Fragment, useState, type ReactNode } from "react";

export type AppRole = "seeker" | "tenant" | "landlord";
export type AuthMode = "login" | "signup" | "broker";

export type ViewerProfile = {
  userId: string;
  email: string;
  name: string;
  role: string;
  roles?: string[];
  primaryRole?: string;
};

const googleLogoSvg = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335" />
  </svg>
);

export const defaultAuthRedirectPath = "/";

export const googleAuthHrefForMode = (
  mode: AuthMode,
  options?: { redirectTo?: string; errorRedirectTo?: string }
) => {
  const flow = mode === "signup" ? "signup" : "login";
  const redirectTo = options?.redirectTo ?? defaultAuthRedirectPath;
  const errorRedirectTo =
    options?.errorRedirectTo ?? (mode === "signup" ? "/?auth=signup" : "/");
  return `/api/auth/google/start?role=SEEKER&flow=${flow}&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
};

export const socialProvidersForMode = (
  mode: AuthMode,
  options?: { redirectTo?: string; errorRedirectTo?: string }
): Array<{ label: string; className: string; mark: ReactNode; href?: string }> => [
  { label: "네이버로 계속하기", className: "naver", mark: <span aria-hidden="true">N</span> },
  {
    label: "Google로 계속하기",
    className: "google",
    mark: <span className="google-logo-icon" aria-hidden="true">{googleLogoSvg}</span>,
    href: googleAuthHrefForMode(mode, options)
  }
];

export const devRoles: Array<{
  id: AppRole;
  label: string;
  description: string;
}> = [
  {
    id: "seeker",
    label: "일반 집보는 사람",
    description: "지도와 매물 상세를 둘러보는 기본 탐색 모드"
  },
  {
    id: "tenant",
    label: "세입자",
    description: "관심 매물과 입주 예정 방을 확인하는 임차인 모드"
  },
  {
    id: "landlord",
    label: "집주인",
    description: "마이페이지에서 내 집을 등록하는 임대인 모드"
  }
];

const loginFeaturePills = ["3D투어", "입주관리AI", "업체연결"] as const;

export function WoozuLoginScreen({
  mode,
  setActiveRole,
  onAuthenticated,
  onGoHome,
  googleRedirectTo,
  googleErrorRedirectTo,
  initialError
}: {
  mode: AuthMode;
  setActiveRole: (role: AppRole) => void;
  onAuthenticated: (viewer: ViewerProfile) => void;
  onGoHome: () => void;
  googleRedirectTo?: string;
  googleErrorRedirectTo?: string;
  initialError?: string;
}) {
  const [socialLoginNotice, setSocialLoginNotice] = useState(
    "WOOZU 계정 하나로 방 찾기, 사는 집, 내놓은 집, 관리 중인 집을 이어갑니다."
  );
  const [serviceEmail, setServiceEmail] = useState("");
  const [servicePassword, setServicePassword] = useState("");
  const [serviceLoginError, setServiceLoginError] = useState(initialError ?? "");
  const [isServiceLoginPending, setIsServiceLoginPending] = useState(false);
  const socialProviders = socialProvidersForMode(mode, {
    redirectTo: googleRedirectTo,
    errorRedirectTo: googleErrorRedirectTo
  });

  async function submitServiceLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsServiceLoginPending(true);
    setServiceLoginError("");

    try {
      // 로그인은 역할을 묻지 않는다 — 계정 identity만 확인하고,
      // 어디로 이어질지는 로그인 후 /api/auth/me의 capability로 판단한다.
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: serviceEmail, password: servicePassword })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        setServiceLoginError(body?.message ?? "로그인에 실패했습니다.");
        return;
      }

      const meResponse = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meResponse.ok) {
        setServiceLoginError("로그인 상태를 확인하지 못했습니다.");
        return;
      }

      onAuthenticated((await meResponse.json()) as ViewerProfile);
    } catch {
      setServiceLoginError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setIsServiceLoginPending(false);
    }
  }

  return (
    <main className="app-canvas login-canvas">
      <section className="login-phone" aria-label="집우집주 로그인">
        <div className="login-topbar">
          <button type="button" className="login-home-link" onClick={onGoHome} aria-label="홈으로 이동">
            <span className="login-home-icon" aria-hidden="true">
              <svg className="login-home-roof" viewBox="0 0 140 68" fill="none">
                <path d="M18 58 L70 18 L122 58" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="61" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                <rect x="71" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
                <rect x="61" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
                <rect x="71" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
              </svg>
            </span>
            집우집주<span>WOOZU</span>
          </button>
        </div>
        <div className="login-brandmark">
          <div className="brand-mark-icon">
            <div className="brand-orbit">
              <div className="brand-orbit-spin">
                <span className="brand-star-fix">
                  <span className="brand-star">
                    <svg viewBox="0 0 24 24"><path d="M12 0c1.1 6.2 4.8 9.9 12 12-7.2 2.1-10.9 5.8-12 12-1.1-6.2-4.8-9.9-12-12 7.2-2.1 10.9-5.8 12-12Z" /></svg>
                  </span>
                </span>
              </div>
            </div>
            <svg className="brand-roof" viewBox="0 0 140 68" fill="none">
              <path d="M18 58 L70 18 L122 58" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="61" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="71" y="33" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="61" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
              <rect x="71" y="43" width="8" height="8" rx="2.4" fill="#ec6a86" />
            </svg>
          </div>
          <div className="brand-word">우주</div>
          <p className="brand-tagline">우주 | 3D공간 시뮬레이션</p>
        </div>

        <div className="login-panel">
          <p className="brand-kicker">|집우집주|  입주부터 관리까지 우주에서</p>
          <h1>우주에서 방을 구해보세요!</h1>
          <p>
            조건에 맞는 방을 찾고, 3D 투어와 정보확인은 우주에서
          </p>

          <div className="login-feature-bar" aria-label="서비스 핵심 기능">
            {loginFeaturePills.map((label, index) => (
              <Fragment key={label}>
                {index > 0 ? <span className="login-feature-sep" aria-hidden="true" /> : null}
                <span className={`login-feature-pill login-feature-pill--${index}`}>{label}</span>
              </Fragment>
            ))}
          </div>

          <div className="social-stack" aria-label="소셜 로그인">
            {socialProviders.map((provider) => (
              <button
                className={`social-button ${provider.className}`}
                type="button"
                key={provider.label}
                onClick={() => {
                  if (provider.href) {
                    window.location.href = provider.href;
                    return;
                  }
                  setSocialLoginNotice(`${provider.label.replace("로 계속하기", "")} 로그인으로 관심 매물 저장과 문의 알림을 받을 수 있습니다.`);
                }}
              >
                {provider.mark}
                {provider.label}
              </button>
            ))}
          </div>

          <p className="social-login-notice" role="status">{socialLoginNotice}</p>

          <div className="service-login-panel" aria-label="서비스 로그인">
            <div>
              <strong>서비스 로그인</strong>
            </div>
            <form className="service-login-form" onSubmit={submitServiceLogin}>
              <label>
                이메일
                <input
                  type="email"
                  value={serviceEmail}
                  onChange={(event) => setServiceEmail(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  value={servicePassword}
                  onChange={(event) => setServicePassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {serviceLoginError ? (
                <p className="service-auth-error" role="alert">{serviceLoginError}</p>
              ) : null}
              <button className="service-login-submit" type="submit" disabled={isServiceLoginPending}>
                {isServiceLoginPending ? "로그인 중" : "로그인"}
              </button>
            </form>
            <a className="service-signup-link" href="/signup">일반 회원가입</a>
          </div>

          <div className="dev-login-panel" aria-label="개발용 로그인">
            <div>
              <strong>개발용 로그인</strong>
              <span>역할을 골라 바로 입장</span>
            </div>
            {devRoles.map((role) => (
              <button className="dev-role-button" type="button" key={role.id} onClick={() => setActiveRole(role.id)}>
                <strong>{role.label}</strong>
                <span>{role.description}</span>
              </button>
            ))}
          </div>

          <small>일반 계정 로그인은 제공하지 않습니다.</small>
        </div>
      </section>
    </main>
  );
}
