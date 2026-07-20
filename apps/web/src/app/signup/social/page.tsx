"use client";

// 소셜 OAuth에서 미가입 계정으로 돌아왔을 때의 회원가입 안내 화면.
// 로그인(/login)과 같은 밤하늘 문법(login-canvas/login-hero/login-phone)을 재사용한다.
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { KakaoTalkLogoIcon } from "../../_components/KakaoTalkLogoIcon";

function safePath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function SocialSignupPage() {
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(window.location.search);
  }, []);

  const { kakaoSignupUrl, googleSignupUrl, message } = useMemo(() => {
    const params = new URLSearchParams(query);
    const role = params.get("role") || "TENANT";
    const redirectTo = safePath(params.get("redirectTo"));
    const error = params.get("error");
    const provider = params.get("provider") === "google" ? "google" : "kakao";
    const providerLabel = provider === "google" ? "Google" : "카카오";
    const kakaoErrorRedirectTo = `/signup/social?provider=kakao&role=${encodeURIComponent(role)}&redirectTo=${encodeURIComponent(redirectTo)}`;
    const googleErrorRedirectTo = `/signup/social?provider=google&role=${encodeURIComponent(role)}&redirectTo=${encodeURIComponent(redirectTo)}`;

    return {
      kakaoSignupUrl: `/api/auth/kakao/start?role=${encodeURIComponent(role)}&flow=signup&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(kakaoErrorRedirectTo)}`,
      googleSignupUrl: `/api/auth/google/start?role=${encodeURIComponent(role)}&flow=signup&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(googleErrorRedirectTo)}`,
      message:
        error === `${provider}_state`
          ? `${providerLabel} 인증 상태가 만료되었습니다. 다시 시도해 주세요.`
          : error
            ? `${providerLabel} 회원가입을 완료하지 못했습니다. 다시 시도해 주세요.`
            : `아직 가입되지 않은 ${providerLabel} 계정입니다. 회원가입을 완료하면 바로 메인으로 이동합니다.`
    };
  }, [query]);

  return (
    <main className="app-canvas login-canvas">
      <div className="login-hero">
        <a className="login-hero-logo" href="/" aria-label="홈으로 이동">
          <Image src="/uju-logo-trim.png" alt="우주" width={108} height={108} priority />
        </a>
        <h1><span className="hero-woozu">우주</span>가 처음이시네요!</h1>
        <p className="login-hero-sub">{message}</p>
      </div>

      <section className="login-phone" aria-label="소셜 회원가입">
        <div className="login-panel">
          <div className="social-stack" aria-label="회원가입 방법">
            <a className="social-button kakao" href={kakaoSignupUrl}>
              <span className="kakao-logo-icon" aria-hidden="true"><KakaoTalkLogoIcon /></span>
              카카오톡으로 회원가입
            </a>
            <a className="social-button google" href={googleSignupUrl}>
              <span aria-hidden="true">G</span>
              Google로 회원가입
            </a>
          </div>

          <div className="login-alt-links">
            <a href="/">메인으로 돌아가기</a>
          </div>
        </div>
      </section>
    </main>
  );
}
