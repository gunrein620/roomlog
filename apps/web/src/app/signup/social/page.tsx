"use client";

import { useEffect, useMemo, useState } from "react";
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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f5f7fb",
        color: "#171923"
      }}
    >
      <section
        aria-label="소셜 회원가입"
        style={{
          width: "min(100%, 420px)",
          display: "grid",
          gap: 18,
          padding: 28,
          border: "1px solid #dfe5ef",
          borderRadius: 16,
          background: "#fff",
          boxShadow: "0 18px 60px rgba(31, 41, 55, 0.08)"
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#3154ff", fontSize: 13, fontWeight: 900 }}>WOOZU 계정</span>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>소셜 회원가입</h1>
          <p style={{ margin: 0, color: "#667085", lineHeight: 1.55 }}>{message}</p>
        </div>

        <a
          href={kakaoSignupUrl}
          style={{
            minHeight: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            border: "1px solid #d5dbe7",
            borderRadius: 12,
            color: "#171923",
            background: "#FEE500",
            textDecoration: "none",
            fontWeight: 900
          }}
        >
          <span
            className="kakao-logo-icon"
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "transparent",
              fontSize: 13
            }}
          >
            <KakaoTalkLogoIcon />
          </span>
          카카오톡으로 회원가입
        </a>

        <a
          href={googleSignupUrl}
          style={{
            minHeight: 54,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            border: "1px solid #d5dbe7",
            borderRadius: 12,
            color: "#171923",
            background: "#fff",
            textDecoration: "none",
            fontWeight: 900
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              background: "#f2f4f8",
              color: "#4285f4",
              fontSize: 13,
              fontWeight: 950
            }}
          >
            G
          </span>
          Google로 회원가입
        </a>

        <a href="/" style={{ color: "#667085", textAlign: "center", textDecoration: "none", fontWeight: 800 }}>
          메인으로 돌아가기
        </a>
      </section>
    </main>
  );
}

