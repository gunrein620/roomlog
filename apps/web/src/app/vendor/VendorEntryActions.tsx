"use client";

import { useState } from "react";

type VendorEntryActionsProps =
  | { mode: "entry" }
  | {
      mode: "dedicated-account-required";
      viewerName: string;
      logoutReturnTo: "/vendor" | "/vendor/activate";
    };

const primaryActionStyle = {
  minHeight: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  border: "1px solid var(--primary)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 var(--space-lg)",
  fontWeight: "var(--fw-header)",
  textDecoration: "none",
  cursor: "pointer"
} as const;

const secondaryActionStyle = {
  ...primaryActionStyle,
  border: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)"
} as const;

export function VendorEntryActions(props: VendorEntryActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.assign(
        props.mode === "dedicated-account-required" ? props.logoutReturnTo : "/vendor"
      );
    } catch {
      setError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  if (props.mode === "dedicated-account-required") {
    return (
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "var(--space-xl)",
          gap: "var(--space-xl)"
        }}
      >
        <div style={{ display: "grid", gap: "var(--space-md)" }}>
          <span style={{ color: "var(--primary)", fontWeight: "var(--fw-header)" }}>
            업체 전용 계정이 필요합니다
          </span>
          <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
            현재 계정으로는 업체를 연결할 수 없어요
          </h1>
          <p
            style={{
              margin: 0,
              color: "var(--on-surface-variant)",
              fontSize: "var(--fs-body)",
              lineHeight: "var(--lh-body)"
            }}
          >
            {props.viewerName}님은 세입자 또는 관리자 계정으로 로그인되어 있습니다. 계정과
            업무 기록이 섞이지 않도록 로그아웃한 뒤 업체 전용 계정으로 진행해 주세요.
          </p>
        </div>

        <button type="button" onClick={logout} disabled={pending} style={primaryActionStyle}>
          {pending ? "로그아웃 중" : "로그아웃하고 업체 계정으로 계속"}
        </button>
        {error ? (
          <p role="alert" style={{ margin: 0, color: "var(--error)" }}>
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "var(--space-xl)",
        gap: "var(--space-xxl)"
      }}
    >
      <div style={{ display: "grid", gap: "var(--space-md)" }}>
        <span style={{ color: "var(--primary)", fontWeight: "var(--fw-header)" }}>
          집우집주 협력업체
        </span>
        <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          업체 작업을 시작하세요
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-body)",
            lineHeight: "var(--lh-body)"
          }}
        >
          연결된 업체 계정으로 로그인하거나 운영팀에서 받은 등록 키로 새 업체 계정을
          활성화할 수 있습니다.
        </p>
      </div>

      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <a href="/vendor/login?redirectTo=/vendor" style={primaryActionStyle}>
          업체 로그인
        </a>
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          <span
            style={{
              color: "var(--on-surface-variant)",
              fontSize: "var(--fs-caption)",
              textAlign: "center"
            }}
          >
            처음 이용하시나요?
          </span>
          <a href="/vendor/activate" style={secondaryActionStyle}>
            등록 키로 업체 계정 만들기
          </a>
        </div>
      </div>
    </section>
  );
}
