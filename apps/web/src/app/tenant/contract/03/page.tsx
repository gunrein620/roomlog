import Link from "next/link";
import { Button } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { getExtraction, DEMO_CONTRACT_ID } from "@/lib/contract-api";
import { HelpCards } from "./HelpCards";

// T-DOC-03 · 계약 내용 도움말 (비적대·참고)
// 알아두면 좋은 조항을 중립 톤으로 안내. 확정·책임 판단 아님(상단 고지).
// primary = 관리자에게 물어보기 (불안 → 행동 가능 출구). 뒤로 → 02.

export default async function Page() {
  const extraction = await getExtraction(DEMO_CONTRACT_ID);

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={CONTRACT_ROUTES["T-DOC-02"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>계약 내용 도움말 · 참고</div>
        <div style={{ width: 34 }} />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* 상단 고지 — 참고 정보이며 법적 효력·책임 판단 아님 */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            color: "var(--on-surface-variant)",
            background: "var(--surface-container-low)",
            lineHeight: 1.5,
          }}
        >
          참고 정보예요. 법적 효력이나 책임 판단이 아니며, 궁금한 점은 관리자에게 물어볼 수 있어요.
        </div>

        {/* '알아두면 좋은 점' 카드 (비적대·중립 톤) */}
        <section>
          <div
            style={{
              fontSize: "var(--fs-caption)",
              color: "var(--on-surface-variant)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginBottom: 8,
            }}
          >
            알아두면 좋은 점
          </div>
          <HelpCards notes={extraction.helpNotes} />
        </section>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link href={CONTRACT_ROUTES["T-DOC-02"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>관리자에게 물어보기</Button>
        </Link>
      </footer>
    </>
  );
}
