import Link from "next/link";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { DEMO_LEASE_ID, getChecklist, getItemRecords } from "@/lib/movein-api";
import { ROUTES } from "@/lib/movein-nav";

const gradeLabel = {
  primary: "1급",
  reference: "참고",
} as const;

const stageLabel = {
  before_movein: "입주 전",
  movein_window: "입주 직후",
  after_reference: "입주 후 참고",
} as const;

function formatDate(value?: string) {
  if (!value) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function Page() {
  const [items, records] = await Promise.all([
    getChecklist(DEMO_LEASE_ID),
    getItemRecords(DEMO_LEASE_ID),
  ]);

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
          href={ROUTES["T-IN-00"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>내 입주 기록</div>
        <Badge>필터</Badge>
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
        <Card style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input defaultValue="전체 공간" aria-label="공간 필터" />
            <Input defaultValue="전체 항목" aria-label="항목 필터" />
            <Input defaultValue="전체 날짜" aria-label="날짜 필터" />
            <Input defaultValue="전체 stage" aria-label="stage 필터" />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge emphasis>최신순</Badge>
            <Badge>공간별</Badge>
            <Badge>1급 먼저</Badge>
          </div>
        </Card>

        {records.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {records.map((record) => {
              const item = items.find((candidate) => candidate.id === record.itemId);
              const firstPhoto = record.photos[0];
              const grade = record.evidenceGrade ?? "reference";
              return (
                <Link
                  key={record.itemId}
                  href={`${ROUTES["T-IN-04"]}?item=${record.itemId}&from=03`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <Card style={{ display: "flex", gap: 11, padding: 12 }}>
                    <div
                      style={{
                        width: 72,
                        aspectRatio: "1",
                        border: "1px solid var(--outline-variant)",
                        borderRadius: 8,
                        background: "var(--surface-container)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 24,
                        flex: "none",
                      }}
                    >
                      {item?.icon ?? "□"}
                    </div>
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{item?.label ?? record.itemId}</div>
                        <Badge emphasis={grade === "primary"}>{gradeLabel[grade]}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                        {item?.spaceLabel ?? "공간 없음"} · {formatDate(record.capturedAt)}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Badge>{stageLabel[firstPhoto?.captureStage ?? "after_reference"]}</Badge>
                        <Badge>{record.photos.length}장</Badge>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card
            style={{
              flex: 1,
              minHeight: 360,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              textAlign: "center",
              borderStyle: "dashed",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800 }}>아직 기록 없어요</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              핵심 항목부터 하나만 남겨도 충분해요
            </div>
            <Link href={ROUTES["T-IN-01"]} style={{ textDecoration: "none", display: "block" }}>
              <Button>핵심부터 찍기</Button>
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
