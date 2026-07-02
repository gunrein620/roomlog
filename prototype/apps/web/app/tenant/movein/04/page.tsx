import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import {
  DEMO_LEASE_ID,
  getChecklist,
  getItemRecord,
  getItemRecords,
} from "@/lib/movein-api";
import { ROUTES } from "@/lib/movein-nav";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const shareLabel = {
  private: "본인만",
  defect_submitted: "하자 제출됨",
  moveout_submitted: "퇴실 제출됨",
} as const;

const stageLabel = {
  before_movein: "입주 전 · 1급",
  movein_window: "입주 직후 · 1급",
  after_reference: "입주 후 참고",
} as const;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value?: string) {
  if (!value) return "촬영일 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function Page({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const requestedItemId = one(params.item);
  const [items, records] = await Promise.all([
    getChecklist(DEMO_LEASE_ID),
    getItemRecords(DEMO_LEASE_ID),
  ]);
  const fallbackId = records[0]?.itemId ?? items[0]?.id ?? "item_aircon";
  const itemId = requestedItemId ?? fallbackId;
  const [record] = await Promise.all([getItemRecord(DEMO_LEASE_ID, itemId)]);
  const resolvedRecord = record ?? records[0];
  const item = items.find((candidate) => candidate.id === (resolvedRecord?.itemId ?? itemId)) ?? items[0];
  const stage = resolvedRecord?.photos[0]?.captureStage ?? "after_reference";

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Link
          href={ROUTES["T-IN-03"]}
          style={{
            fontSize: 13,
            color: "var(--on-surface-variant)",
            textDecoration: "none",
            marginTop: 2,
          }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{item?.label ?? "항목 상세"}</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            {formatDate(resolvedRecord?.capturedAt)}
          </div>
        </div>
        <Badge emphasis>{stageLabel[stage]}</Badge>
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
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(["wide", "closeup"] as const).map((role) => {
            const photo = resolvedRecord?.photos.find((candidate) => candidate.role === role);
            return (
              <Card key={role} style={{ padding: 9 }}>
                <div
                  style={{
                    aspectRatio: "1",
                    border: "1px solid var(--outline-variant)",
                    borderRadius: 8,
                    background: "var(--surface-container)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  {item?.icon ?? "□"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 7 }}>
                  {role === "wide" ? "광각" : "근접"}
                </div>
                <div style={{ fontSize: 10, color: "var(--on-surface-variant)", marginTop: 3 }}>
                  {photo?.viewpointId ?? "미첨부"}
                </div>
              </Card>
            );
          })}
        </section>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>메모</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--on-surface-variant)" }}>
            {resolvedRecord?.memo ?? "남긴 메모가 없어도 괜찮아요. 사진 기록만으로 보관돼요."}
          </div>
        </Card>

        <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>공유 상태</div>
            <Badge emphasis>{shareLabel[resolvedRecord?.shareScope ?? "private"]}</Badge>
          </div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            {resolvedRecord?.shareDetail ?? "아직 제출된 곳이 없고 본인 기록으로만 보관 중이에요."}
          </div>
        </Card>

        <details>
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
            더보기
          </summary>
          <Card style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>계약 대조 read-only</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", marginTop: 5 }}>
                {item?.contractLabel
                  ? `계약서 옵션: ${item.contractLabel}`
                  : "계약 대조 정보가 없으면 표준 항목으로만 보관돼요."}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              정식 이의는 계약/하자 화면에서 진행해요. 이 화면에서는 기록을 바꾸지 않고 읽기만 해요.
            </div>
            <div
              style={{
                borderTop: "1px dashed var(--border)",
                paddingTop: 10,
                fontSize: 12,
                color: "var(--on-surface-variant)",
                lineHeight: 1.5,
              }}
            >
              삭제는 T-HOME-06 권한·데이터 요청에서 record_type=move_in_photo로 신청해요.
            </div>
          </Card>
        </details>
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
        <Link
          href={`${ROUTES["T-IN-02"]}?item=${item?.id ?? itemId}&from=04`}
          style={{ textDecoration: "none", display: "block" }}
        >
          <Button fullWidth>재촬영/사진 추가</Button>
        </Link>
      </footer>
    </>
  );
}
