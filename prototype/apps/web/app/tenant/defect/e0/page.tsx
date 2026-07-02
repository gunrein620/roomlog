import Link from "next/link";
import { Button } from "@roomlog/ui";
import { ROUTES } from "@/lib/nav";

// T-DEF-E0 · 분석 오류
// AI 분석 실패·연결 끊김 시 복구. 사진 업로드 실패(02 인-스크린)와 구분.
// 다시 시도(→03) · 사진 다시 첨부(→02 재촬영) · 뒤로(→00).

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
            연결이 끊겼거나 분석을 마치지 못했어요
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
          }}
        >
          입력한 신고 내용과 사진은 그대로 보관돼요
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
        <Link href={ROUTES["T-DEF-03"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>다시 시도</Button>
        </Link>
        <Link href={ROUTES["T-DEF-02"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            사진 다시 첨부
          </Button>
        </Link>
        <Link
          href={ROUTES["T-DEF-00"]}
          style={{
            alignSelf: "center",
            padding: 4,
            fontSize: 12,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
          }}
        >
          뒤로
        </Link>
      </footer>
    </>
  );
}
