"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, PhoneFrame } from "@roomlog/ui";

// 수리업체 로그인 — 자격을 /api/auth/login(BFF)에 보내고 그쪽이 httpOnly 쿠키를 심는다.
// 토큰은 클라이언트에 노출되지 않는다. 성공 시 배정 작업 목록으로.
export default function VendorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("vendor@roomlog.test");
  const [password, setPassword] = useState("password123!");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

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
      router.push("/vendor/job/00");
      router.refresh();
    } catch {
      setError("네트워크 오류로 로그인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PhoneFrame label={<span>수리업체 로그인 · 390×844</span>}>
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
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--on-surface)" }}>룸로그 파트너</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 4 }}>
            수리업체 계정으로 로그인하세요
          </div>
        </div>

        <Card style={{ padding: 16 }}>
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
          데모: vendor@roomlog.test / password123!
        </div>
      </div>
    </PhoneFrame>
  );
}
