"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { KakaoTalkLogoIcon } from "../_components/KakaoTalkLogoIcon";
import { socialAuthErrorMessage } from "../_components/WoozuLoginScreen";

const DEFAULT_REDIRECT = "/";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_REDIRECT;
  return value;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [redirectTo, setRedirectTo] = useState(DEFAULT_REDIRECT);
  const [requestedRole, setRequestedRole] = useState("SEEKER");
  const [notice, setNotice] = useState("일반 이용자 계정으로 가입합니다.");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRedirect = safeRedirectPath(params.get("redirectTo"));
    const role = params.get("role") || "SEEKER";
    const provider = params.get("provider");
    const authError = params.get("error");

    setRedirectTo(nextRedirect);
    setRequestedRole(role);

    if (role !== "SEEKER") {
      setNotice("임차인/임대인 권한은 추후 서비스 키 확인 후 부여됩니다. 지금은 일반 이용자로 가입합니다.");
    } else if (provider === "kakao") {
      setNotice("카카오톡 계정으로 가입을 완료하면 일반 이용자로 바로 로그인됩니다.");
    } else if (provider === "google") {
      setNotice("Google 계정으로 가입을 완료하면 일반 이용자로 바로 로그인됩니다.");
    }

    if (authError) {
      setError(socialAuthErrorMessage(authError) ?? authError);
    }
  }, []);

  const kakaoSignupUrl = useMemo(() => {
    const errorRedirectTo = `/signup?provider=kakao&role=${encodeURIComponent(requestedRole)}&redirectTo=${encodeURIComponent(redirectTo)}`;
    return `/api/auth/kakao/start?role=SEEKER&flow=signup&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
  }, [redirectTo, requestedRole]);

  const googleSignupUrl = useMemo(() => {
    const errorRedirectTo = `/signup?provider=google&role=${encodeURIComponent(requestedRole)}&redirectTo=${encodeURIComponent(redirectTo)}`;
    return `/api/auth/google/start?role=SEEKER&flow=signup&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(errorRedirectTo)}`;
  }, [redirectTo, requestedRole]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          passwordConfirm,
          name,
          phone,
          role: "SEEKER"
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => undefined);
        setError(body?.message ?? "회원가입에 실패했습니다.");
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("네트워크 오류로 회원가입하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="app-canvas login-canvas signup-page">
      {/* 로그인과 같은 밤하늘 문법 — 브랜드·헤드라인은 하늘 위, 카드는 폼만 */}
      <div className="login-hero">
        <a className="login-hero-logo" href="/" aria-label="홈으로 이동">
          <Image src="/uju-logo-trim.png" alt="우주" width={108} height={108} priority />
        </a>
        <h1><span className="hero-woozu">우주</span>에서 시작해보세요!</h1>
        <p className="login-hero-sub">{notice}</p>
      </div>

      <section className="signup-card" aria-label="일반 회원가입">
        <a className="social-button kakao" href={kakaoSignupUrl}>
          <span className="kakao-logo-icon" aria-hidden="true"><KakaoTalkLogoIcon /></span>
          카카오톡으로 회원가입
        </a>

        <a className="social-button google" href={googleSignupUrl}>
          <span aria-hidden="true">G</span>
          Google로 회원가입
        </a>

        <form className="signup-form" onSubmit={submit}>
          <label>
            이름
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
          </label>
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            휴대폰 번호
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="선택 입력"
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            비밀번호 확인
            <input
              type="password"
              value={passwordConfirm}
              onChange={(event) => setPasswordConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          {error ? (
            <p className="service-auth-error" role="alert">{error}</p>
          ) : null}

          <button className="signup-submit" type="submit" disabled={pending}>
            {pending ? "가입 중" : "가입하고 시작하기"}
          </button>
        </form>

        <a className="signup-back-link" href="/?auth=login">이미 계정이 있어요</a>
      </section>
    </main>
  );
}
