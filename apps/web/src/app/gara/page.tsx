import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Gara | 룸로그",
};

export default function GaraPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-xl)",
        background: "var(--surface)",
      }}
    >
      <section
        style={{
          width: "min(100%, 480px)",
          display: "grid",
          gap: "var(--space-lg)",
          padding: "var(--space-xxl)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface-container-lowest)",
          boxShadow: "var(--shadow)",
        }}
      >
        <p style={{ margin: 0, color: "var(--primary)", fontWeight: "var(--fw-subtitle)" }}>
          Gara
        </p>
        <h1 style={{ margin: 0, color: "var(--on-surface)", fontSize: "var(--fs-title)" }}>
          Gara
        </h1>
        <p style={{ margin: 0, color: "var(--on-surface-variant)" }}>
          Gara 페이지입니다.
        </p>
        <Link
          href="/"
          style={{ color: "var(--primary)", fontWeight: "var(--fw-subtitle)" }}
        >
          홈으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
