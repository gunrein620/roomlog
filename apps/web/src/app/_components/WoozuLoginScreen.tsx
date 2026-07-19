"use client";

// 집우집주(WOOZU) 단일 계정 로그인 화면 — page.tsx(/?auth=login)와 /login이 공유한다.
// 로그인은 역할을 제한하지 않는다: 계정 identity만 확인하고, 룸로그 표면 진입은
// 로그인 후 세션의 capability(roles)로 판단한다.
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { KakaoTalkLogoIcon } from "./KakaoTalkLogoIcon";

export type AppRole = "seeker" | "tenant" | "landlord";
export type AuthMode = "login" | "signup";

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
export const VENDOR_ACTIVATION_LOGIN_ACTION = {
  href: "/vendor/activate",
  label: "등록 키로 업체 등록하기"
} as const;

// 소셜 로그인 실패 시 돌아올 기본 경로 — 반드시 ?error=코드를 "표시하는" 화면이어야 한다.
// 홈("/")으로 보내면 에러 파라미터를 아무도 읽지 않아 사용자는 조용히 홈에 떨어진다.
const defaultAuthErrorRedirectPath = (mode: AuthMode) => (mode === "signup" ? "/signup" : "/login");

// OAuth 라우트가 ?error=에 싣는 내부 코드를 사용자용 문구로 바꾼다.
// 모르는 코드(백엔드/카카오 KOE 오류 등)는 원문 그대로 보여 디버깅 단서를 남긴다.
export function socialAuthErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "kakao_config") {
    return "카카오 로그인이 아직 설정되지 않았습니다 — 서버에 KAKAO_LOGIN_REST_API_KEY 환경변수를 등록해 주세요.";
  }
  if (code === "google_config") {
    return "Google 로그인이 아직 설정되지 않았습니다 — 서버에 GOOGLE_LOGIN_CLIENT_ID 환경변수를 등록해 주세요.";
  }
  if (code === "kakao_state" || code === "google_state") {
    return "로그인 세션이 만료되었습니다. 다시 시도해 주세요.";
  }
  if (code === "kakao_access_denied" || code === "google_access_denied") {
    return "로그인이 취소되었습니다.";
  }
  return code;
}

export const googleAuthHrefForMode = (
  mode: AuthMode,
  options?: { redirectTo?: string; errorRedirectTo?: string }
) => {
  const flow = mode === "signup" ? "signup" : "login";
  const redirectTo = options?.redirectTo ?? defaultAuthRedirectPath;
  const errorRedirectTo = options?.errorRedirectTo ?? defaultAuthErrorRedirectPath(mode);
  return `/api/auth/google/start?role=SEEKER&flow=${flow}&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
};

export const kakaoAuthHrefForMode = (
  mode: AuthMode,
  options?: { redirectTo?: string; errorRedirectTo?: string }
) => {
  const flow = mode === "signup" ? "signup" : "login";
  const redirectTo = options?.redirectTo ?? defaultAuthRedirectPath;
  const errorRedirectTo = options?.errorRedirectTo ?? defaultAuthErrorRedirectPath(mode);
  return `/api/auth/kakao/start?role=SEEKER&flow=${flow}&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
};

export const socialProvidersForMode = (
  mode: AuthMode,
  options?: { redirectTo?: string; errorRedirectTo?: string }
): Array<{ label: string; className: string; mark: ReactNode; href?: string }> => [
  {
    label: "카카오톡으로 계속하기",
    className: "kakao",
    mark: <span className="kakao-logo-icon" aria-hidden="true"><KakaoTalkLogoIcon /></span>,
    href: kakaoAuthHrefForMode(mode, options)
  },
  {
    label: "Google로 계속하기",
    className: "google",
    mark: <span className="google-logo-icon" aria-hidden="true">{googleLogoSvg}</span>,
    href: googleAuthHrefForMode(mode, options)
  }
];


export function WoozuLoginScreen({
  mode,
  onAuthenticated,
  onGoHome,
  googleRedirectTo,
  googleErrorRedirectTo,
  initialError,
  vendorActivationAction
}: {
  mode: AuthMode;
  onAuthenticated: (viewer: ViewerProfile) => void;
  onGoHome: () => void;
  googleRedirectTo?: string;
  googleErrorRedirectTo?: string;
  initialError?: string;
  vendorActivationAction?: {
    href: string;
    label: string;
  };
}) {
  const [serviceEmail, setServiceEmail] = useState("");
  const [servicePassword, setServicePassword] = useState("");
  const [serviceLoginError, setServiceLoginError] = useState(socialAuthErrorMessage(initialError) ?? "");
  const [isServiceLoginPending, setIsServiceLoginPending] = useState(false);
  // "이메일로 계속하기"를 누르면 그 자리에서 이메일/비밀번호 폼이 펼쳐진다.
  const [showEmailForm, setShowEmailForm] = useState(false);
  // 로그인 편의: 비밀번호 보기 토글 · 이메일 저장 · 자동 로그인
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [autoLogin, setAutoLogin] = useState(false);

  // 저장해둔 이메일/자동 로그인 설정 복원 (클라이언트 전용)
  useEffect(() => {
    const savedEmail = window.localStorage.getItem("woozu_saved_email");
    if (savedEmail) {
      setServiceEmail(savedEmail);
      setRememberEmail(true);
    }
    setAutoLogin(window.localStorage.getItem("woozu_auto_login") === "1");
  }, []);
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

      // 로그인 성공 — 편의 설정 반영 (이메일 저장/자동 로그인 플래그)
      if (rememberEmail) {
        window.localStorage.setItem("woozu_saved_email", serviceEmail);
      } else {
        window.localStorage.removeItem("woozu_saved_email");
      }
      window.localStorage.setItem("woozu_auto_login", autoLogin ? "1" : "0");

      onAuthenticated((await meResponse.json()) as ViewerProfile);
    } catch {
      setServiceLoginError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setIsServiceLoginPending(false);
    }
  }

  return (
    <main className="app-canvas login-canvas">
      {/* 브랜드·헤드라인 = 밤하늘 위 흰 타이포(홈 히어로 문법) — 카드는 폼만 담아 흰 덩어리 고립을 해소 */}
      <div className="login-hero">
        {/* trim 로고(홈 상단바와 동일 자산) — 누르면 홈으로 */}
        <button type="button" className="login-hero-logo" onClick={onGoHome} aria-label="홈으로 이동">
          <Image src="/uju-logo-trim.png" alt="우주" width={108} height={108} priority />
        </button>
        <h1><span className="hero-woozu">우주</span>에서 방을 구해보세요!</h1>
        <p className="login-hero-sub">조건에 맞는 방을 찾고, 3D 투어와 정보확인은 우주에서</p>
      </div>

      <section className="login-phone" aria-label="집우집주 로그인">
        <div className="login-panel">
          <div className="social-stack" aria-label="로그인 방법">
            {socialProviders.map((provider) => (
              <button
                className={`social-button ${provider.className}`}
                type="button"
                key={provider.label}
                onClick={() => {
                  if (provider.href) {
                    window.location.href = provider.href;
                  }
                }}
              >
                {provider.mark}
                {provider.label}
              </button>
            ))}
            {/* 이메일 로그인도 같은 스택의 "계속하기" 버튼 — 누르면 아래로 폼이 펼쳐진다 */}
            <button
              className="social-button email-login-button"
              type="button"
              aria-expanded={showEmailForm}
              onClick={() => setShowEmailForm((visible) => !visible)}
            >
              <svg className="email-login-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M4 7.5 12 13l8-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              이메일로 계속하기
            </button>
          </div>

          {showEmailForm ? (
            <div className="service-login-panel" aria-label="이메일 로그인">
              <form className="service-login-form" onSubmit={submitServiceLogin}>
                <label>
                  이메일
                  <input
                    type="email"
                    value={serviceEmail}
                    onChange={(event) => setServiceEmail(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  비밀번호
                  <span className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={servicePassword}
                      onChange={(event) => setServicePassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    {/* 전형적인 눈 아이콘 토글 — 입력창 우측 */}
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                    >
                      {showPassword ? (
                        <EyeOff size={18} strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <Eye size={18} strokeWidth={2.2} aria-hidden="true" />
                      )}
                    </button>
                  </span>
                </label>
                <div className="login-remember-row">
                  <label className="login-check">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={(event) => setRememberEmail(event.target.checked)}
                    />
                    이메일 저장
                  </label>
                  <label className="login-check">
                    <input
                      type="checkbox"
                      checked={autoLogin}
                      onChange={(event) => setAutoLogin(event.target.checked)}
                    />
                    자동 로그인
                  </label>
                </div>
                {serviceLoginError ? (
                  <p className="service-auth-error" role="alert">{serviceLoginError}</p>
                ) : null}
                <button className="service-login-submit" type="submit" disabled={isServiceLoginPending}>
                  {isServiceLoginPending ? "로그인 중" : "로그인"}
                </button>
              </form>
            </div>
          ) : null}

          <div className="login-alt-links">
            <a className="service-signup-link" href="/signup">처음이세요? 회원가입</a>
            {vendorActivationAction ? (
              <a className="login-vendor-activation-link" href={vendorActivationAction.href}>
                {vendorActivationAction.label}
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
