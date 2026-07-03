import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_LEASE_ID, getChecklist, getItemRecords } from "@/lib/movein-api";
import { ROUTES } from "@/lib/movein-nav";

const sourceLabel = {
  contract_option: "계약서 옵션",
  contract_option_manual: "계약서 옵션(수동)",
  standard_fallback: "표준 항목",
} as const;

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export default async function Page() {
  const [items, records] = await Promise.all([
    getChecklist(DEMO_LEASE_ID),
    getItemRecords(DEMO_LEASE_ID),
  ]);
  const captured = new Set(records.map((record) => record.itemId));
  const core = items.filter((item) => item.isCore);
  const recommended = items.filter((item) => item.recommended && !item.isCore);

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
          href={ROUTES["T-IN-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>확인 항목</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            핵심부터 가볍게 남겨요
          </div>
        </div>
        <Badge>출처</Badge>
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
        <section>
          <div style={labelStyle}>핵심 항목 먼저</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {core.map((item) => (
              <ChecklistCard key={item.id} item={item} captured={captured.has(item.id)} />
            ))}
          </div>
        </section>

        <details open={false}>
          <summary
            style={{
              listStyle: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              color: "var(--on-surface-variant)",
              marginBottom: 8,
            }}
          >
            권장 항목 접기/펼치기
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {recommended.map((item) => (
              <ChecklistCard key={item.id} item={item} captured={captured.has(item.id)} />
            ))}
          </div>
        </details>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>추가 항목</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            계약 등록 전이어도 표준 항목으로 기록할 수 있어요. 계약 등록하면 맞춤 제안으로
            이어져요.
          </div>
          <Link
            href={`${ROUTES["T-IN-02"]}?from=01&item=custom`}
            style={{ textDecoration: "none", display: "block" }}
          >
            <Button fullWidth variant="secondary">
              추가 항목 촬영하기
            </Button>
          </Link>
        </Card>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link href={ROUTES["T-IN-03"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            내 입주 기록 보기
          </Button>
        </Link>
      </footer>
    </>
  );
}

function ChecklistCard({
  item,
  captured,
}: {
  item: Awaited<ReturnType<typeof getChecklist>>[number];
  captured: boolean;
}) {
  const href = captured
    ? `${ROUTES["T-IN-04"]}?item=${item.id}&from=01`
    : `${ROUTES["T-IN-02"]}?item=${item.id}&from=01`;

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <Card style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "1px solid var(--outline-variant)",
            borderRadius: 8,
            background: "var(--surface-container)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            flex: "none",
          }}
        >
          {item.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{item.label}</div>
            <Badge emphasis={captured}>{captured ? "촬영됨" : "미촬영"}</Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 4 }}>
            {item.id} · {item.labelI18n?.en ?? item.label}
          </div>
          {item.contractLabel && (
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 3 }}>
              계약 원문: {item.contractLabel}
            </div>
          )}
          {item.coreReason && (
            <div style={{ fontSize: 12, marginTop: 7, fontWeight: 700 }}>
              왜 핵심? {item.coreReason}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <Badge>{sourceLabel[item.sourceTier]}</Badge>
            {item.sourceTier === "standard_fallback" && <Badge>계약 등록 시 맞춤</Badge>}
          </div>
        </div>
      </Card>
    </Link>
  );
}
