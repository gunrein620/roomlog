"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_REDIRECT = "/?role=landlord&tab=mypage";

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_REDIRECT;
  return value;
}

// 관리인 로그인 — 자격을 /api/auth/login(BFF)에 보내고, 그쪽이 httpOnly 쿠키를 심는다.
// 토큰은 클라이언트에 노출되지 않는다. 성공 시 티켓 대시로.
export default function ManagerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("manager@roomlog.test");
  const [password, setPassword] = useState("password123!");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [redirectTo, setRedirectTo] = useState(DEFAULT_REDIRECT);
  const googleLoginUrl = `/api/auth/google/start?role=LANDLORD&flow=login&redirectTo=${encodeURIComponent(redirectTo)}&errorRedirectTo=${encodeURIComponent(`/manager/login?redirectTo=${encodeURIComponent(redirectTo)}`)}`;

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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-container-lowest)",
        padding: 24
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(100%, 360px)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 28,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface)"
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--on-surface)" }}>룸로그 관리인</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 4 }}>
            티켓 처리 콘솔 로그인
          </div>
        </div>
        <a
          href={googleLoginUrl}
          style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: "var(--radius-btn)", background: "#fff", color: "#1f1f1f", fontWeight: 800, textDecoration: "none" }}
        >
          Google로 계속하기
        </a>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--on-surface-variant)" }}>
          이메일
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            style={{ width: "100%", height: 40, marginTop: 4, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-btn)", background: "var(--surface-container-lowest)", color: "var(--on-surface)" }}
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--on-surface-variant)" }}>
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={{ width: "100%", height: 40, marginTop: 4, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-btn)", background: "var(--surface-container-lowest)", color: "var(--on-surface)" }}
          />
        </label>
        {error && (
          <div style={{ fontSize: 12, color: "var(--error, #b00020)" }} role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          style={{ height: 44, border: "none", borderRadius: "var(--radius-btn)", background: "var(--primary)", color: "var(--on-primary)", fontWeight: 700, cursor: "pointer" }}
        >
          {pending ? "로그인 중…" : "로그인"}
        </button>
        <div style={{ fontSize: 11, color: "var(--on-surface-variant)", textAlign: "center" }}>
          데모: manager@roomlog.test / password123!
        </div>
      </form>
    </div>
  );
}
