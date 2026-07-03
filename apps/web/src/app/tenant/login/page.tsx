"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, PhoneFrame } from "@roomlog/ui";

const DEFAULT_REDIRECT = "/?role=tenant&tab=mypage";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_REDIRECT;
  return value;
}

// 임차인 로그인 — 자격을 Next route handler(/api/auth/login)에 보내고, 그쪽이 httpOnly 쿠키를 심는다.
// 토큰은 이 클라이언트 코드에 절대 노출되지 않는다(쿠키 세션 패턴). 성공 시 하자 홈으로.
export default function TenantLoginPage() {
  const router = useRouter();
  // 데모 시드 계정(ROOMLOG_SEED_DEMO=true) 프리필 — 실배선 확인용.
  const [email, setEmail] = useState("tenant@roomlog.test");
  const [password, setPassword] = useState("password123!");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [redirectTo, setRedirectTo] = useState(DEFAULT_REDIRECT);
  const googleLoginUrl = `/api/auth/google/start?role=TENANT&flow=login&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(`/tenant/login?redirectTo=${encodeURIComponent(redirectTo)}`)}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextRedirect = safeRedirectPath(params.get("redirectTo"));
    setRedirectTo(nextRedirect);

    const googleError = params.get("error");
    if (googleError) {
      setError(googleError);
    }
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => undefined);
        setError(body?.message ?? "로그인에 실패했습니다.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PhoneFrame label={<span>임차인 로그인 · 390×844</span>}>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
          padding: "24px 18px"
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--on-surface)" }}>룸로그</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 4 }}>
            임차인 계정으로 로그인하세요
          </div>
        </div>

        <Card style={{ padding: 16 }}>
          <a
            href={googleLoginUrl}
            style={{
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-btn)",
              background: "#fff",
              color: "#1f1f1f",
              fontWeight: 800,
              textDecoration: "none"
            }}
          >
            Google로 계속하기
          </a>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--on-surface-variant)" }}>
              이메일
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--on-surface-variant)" }}>
              비밀번호
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <div style={{ fontSize: 12, color: "var(--error, #b00020)" }} role="alert">
                {error}
              </div>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "로그인 중…" : "로그인"}
            </Button>
          </form>
        </Card>

        <div style={{ fontSize: 11, color: "var(--on-surface-variant)", textAlign: "center" }}>
          데모: tenant@roomlog.test / password123!
        </div>
      </div>
    </PhoneFrame>
  );
}
