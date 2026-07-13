import Link from "next/link";
import { Badge, Button } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { getContract, getCurrentContractId, getExtraction } from "@/lib/contract-api";
import { ExtractionView } from "./ExtractionView";

// T-DOC-02 · 계약 내용 (검토 전 참고본 / 확정본)
// "확인하면 좋을 3가지" 요약을 먼저(과밀 방지) + 검증 전 경고 + 3그룹 접기(펼칠 때만 10항목).
// 정직 표기: confirmed=false면 '검토 전 참고본', 확정 후에만 '확정본'.

const sectionLabel = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 7,
} as const;

export const dynamic = "force-dynamic";

export default async function Page() {
  const contractId = await getCurrentContractId();
  if (!contractId) return <NoContract />;

  const [contract, extraction] = await Promise.all([
    getContract(contractId),
    getExtraction(contractId),
  ]);
  const confirmed = extraction.confirmed;
  const isTradeAcceptance = contract.id.startsWith("ct_trade_");

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
          gap: 8,
        }}
      >
        <Link
          href={CONTRACT_ROUTES["T-DOC-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>계약 내용</div>
        <Badge emphasis={!confirmed} style={{ fontSize: 11 }}>
          {confirmed ? "확정본" : "검토 전 참고본"}
        </Badge>
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
        {/* ① "확인하면 좋을 3가지" 요약 (가장 중요한 3항목 먼저) */}
        <section>
          <div style={sectionLabel}>확인하면 좋을 3가지</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {extraction.highlights.slice(0, 3).map((h, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--outline-variant)",
                  borderRadius: 10,
                  padding: "11px 13px",
                  fontSize: 13.5,
                  fontWeight: 600,
                  display: "flex",
                  gap: 9,
                  alignItems: "flex-start",
                }}
              >
                <span style={{ color: "var(--primary)", fontWeight: 800 }}>{i + 1}</span>
                <span>{h}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ② 검증 전 경고 (참고본일 때만) */}
        {!confirmed && (
          <div
            style={{
              border: "1.5px solid var(--outline)",
              borderRadius: 10,
              padding: 11,
              background: "var(--surface-container-high)",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠</span>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
              아직 검증 전이에요 — 관리자 확정 전이라 실제와 다를 수 있어요
            </div>
          </div>
        )}

        {/* ③ 3그룹 접기 (펼칠 때만 10항목) + 근거 보기 */}
        <section>
          <div style={sectionLabel}>전체 항목</div>
          <ExtractionView extraction={extraction} />
        </section>

        {!isTradeAcceptance && (
          <button
            type="button"
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              color: "var(--on-surface-variant)",
              background: "transparent",
              border: "1px solid var(--outline-variant)",
              borderRadius: "var(--radius-full)",
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            원본 보기
          </button>
        )}
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
        <Link href={CONTRACT_ROUTES["T-DOC-03"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>내용 도움말 보기</Button>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={CONTRACT_ROUTES["T-DOC-04"]}
            style={{ textDecoration: "none", flex: 1 }}
          >
            <Button fullWidth variant="secondary" style={{ width: "100%" }}>
              개인정보·보관
            </Button>
          </Link>
          {!confirmed && (
            <Link
              href={CONTRACT_ROUTES["T-DOC-00"]}
              style={{ textDecoration: "none", flex: 1 }}
            >
              <Button fullWidth variant="secondary" style={{ width: "100%" }}>
                의견 보내기
              </Button>
            </Link>
          )}
        </div>
      </footer>
    </>
  );
}

function NoContract() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 800 }}>등록된 계약서가 없습니다.</div>
      <Link href={CONTRACT_ROUTES["T-DOC-01"]} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
        계약서 등록하기
      </Link>
    </div>
  );
}
