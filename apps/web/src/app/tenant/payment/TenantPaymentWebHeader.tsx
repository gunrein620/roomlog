"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./tenant-payment-shell.module.css";

type PaymentViewer = {
  name?: unknown;
};

const NAVIGATION = [
  { href: "/map", label: "지도" },
  { href: "/saved", label: "관심목록" },
  { href: "/inquiry", label: "문의" },
  { href: "/living", label: "세입자" },
  { href: "/manager/home/00", label: "관리" },
  { href: "/sell", label: "매물등록" },
] as const;

export function TenantPaymentWebHeader() {
  const [profileName, setProfileName] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function enrichProfile() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) return;

        const viewer = (await response.json()) as PaymentViewer;
        const name = typeof viewer.name === "string" ? viewer.name.trim() : "";
        if (isActive && name) setProfileName(name);
      } catch {
        if (isActive) setProfileName(null);
      }
    }

    void enrichProfile();
    return () => {
      isActive = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/";
  }

  return (
    <header className={styles.webHeader} aria-label="웹 상단 메뉴">
      <div className={styles.headerInner}>
        <Link className={styles.logo} href="/" aria-label="집우집주 홈">
          집우집주 <span>WOOZU</span>
        </Link>

        <nav className={styles.webNavigation} aria-label="주요 메뉴">
          {NAVIGATION.map((item) => (
            <Link
              key={item.href}
              className={item.href === "/living" ? styles.activeNavigationLink : styles.navigationLink}
              href={item.href}
              aria-current={item.href === "/living" ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.profileActions}>
          {profileName ? (
            <div className={styles.profile} aria-label="로그인 사용자">
              <span className={styles.avatar} aria-hidden="true">{profileName.slice(0, 1)}</span>
              <span className={styles.profileName}>{profileName}</span>
              <button className={styles.logoutButton} type="button" onClick={logout}>로그아웃</button>
            </div>
          ) : (
            <Link className={styles.loginLink} href="/login">로그인</Link>
          )}
        </div>
      </div>
    </header>
  );
}
