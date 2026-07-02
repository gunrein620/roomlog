import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_LEASE_ID, getChecklist, getItemRecords, getMovein } from "@/lib/movein-api";
import { ROUTES } from "@/lib/movein-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

function daysUntil(value: string) {
  const ms = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

export default async function Page() {
  const [movein, checklist, records] = await Promise.all([
    getMovein(DEMO_LEASE_ID),
    getChecklist(DEMO_LEASE_ID),
    getItemRecords(DEMO_LEASE_ID),
  ]);
  const recent = records.slice(0, 3);
  const dday = daysUntil(movein.lockWindowEndAt);

  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{movein.unitId}호 · 입주 기록</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            한 번에 다 하지 않아도 괜찮아요
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge>KO</Badge>
          <Button
            type="button"
            variant="ghost"
            aria-label="알림"
            style={{
              width: 38,
              height: 38,
              padding: 0,
              border: "1.5px solid var(--outline-variant)",
              borderRadius: 10,
              background: "var(--surface-container-lowest)",
              fontSize: 16,
            }}
          >
            🔔
          </Button>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
          <Badge emphasis style={{ alignSelf: "flex-start" }}>
            비적대 기록
          </Badge>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35 }}>
            입주 직후 사진이 나중에 보증금을 지켜요
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--on-surface-variant)" }}>
            내 상태를 차분히 남기는 기록이에요. 미작성은 책임 인정으로 보지 않아요.
          </div>
        </Card>

        <Card
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            padding: 14,
          }}
        >
          <div>
            <div style={labelStyle}>잠금 윈도우</div>
            <Badge emphasis>D-{dday}</Badge>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 8 }}>
              {formatDate(movein.lockWindowEndAt)}까지 1급 근거로 남길 때
            </div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 4 }}>
              이후엔 참고 기록으로 보관돼요
            </div>
          </div>
          <div>
            <div style={labelStyle}>누적 카운터</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{movein.capturedCount}개 찍었어요</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 4 }}>
              늘어난 기록만 보여드려요
            </div>
          </div>
        </Card>

        <section>
          <div style={labelStyle}>최근 기록</div>
          {recent.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {recent.map((record) => {
                const item = checklist.find((candidate) => candidate.id === record.itemId);
                return (
                  <Link
                    key={record.itemId}
                    href={`${ROUTES["T-IN-04"]}?item=${record.itemId}&from=03`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <Card style={{ padding: 8 }}>
                      <div
                        style={{
                          aspectRatio: "1",
                          borderRadius: 8,
                          border: "1px solid var(--outline-variant)",
                          background: "var(--surface-container)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                        }}
                      >
                        {item?.icon ?? "□"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          marginTop: 7,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item?.label ?? record.itemId}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card style={{ padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>핵심부터 찍어볼까요</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 5 }}>
                한 번에 다 안 해도 돼요
              </div>
            </Card>
          )}
        </section>
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
        <Link href={ROUTES["T-IN-01"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>시작/이어하기</Button>
        </Link>
        <Link href={ROUTES["T-IN-03"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            내 입주 기록 보기
          </Button>
        </Link>
      </footer>
    </>
  );
}
