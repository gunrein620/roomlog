import Link from "next/link";
import { Button } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";

// T-DOC-E0 · 로드/분석 오류
// 업로드·OCR 분석 실패 복구. 다시 시도(→01) · 홈으로(→00).

export default function Page() {
  return (
    <>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
          padding: "30px 24px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            border: "1.5px dashed var(--outline)",
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            color: "var(--on-surface-variant)",
          }}
        >
          !
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>분석에 실패했어요</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 6 }}>
            형식·용량 문제이거나 연결이 끊겼을 수 있어요
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--on-surface-variant)",
            background: "var(--surface-container-low)",
            lineHeight: 1.5,
          }}
        >
          밝은 곳에서 계약서 전체가 보이게 다시 촬영하거나, PDF로 올려보세요
        </div>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link href={CONTRACT_ROUTES["T-DOC-01"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>다시 시도</Button>
        </Link>
        <Link
          href={CONTRACT_ROUTES["T-DOC-00"]}
          style={{
            alignSelf: "center",
            padding: 4,
            fontSize: 12,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
          }}
        >
          홈으로
        </Link>
      </footer>
    </>
  );
}
