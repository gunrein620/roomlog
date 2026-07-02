import Link from "next/link";
import type { MoveoutRecordItem, MoveoutRecordSource, WearVerdict } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, getMoveout, getRecords, getSettlement } from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

const SOURCE_LABEL: Record<MoveoutRecordSource, string> = {
  movein_photo: "입주 전 사진",
  defect: "하자",
  repair: "수리",
  payment: "납부",
  chat: "채팅",
  contract: "계약서",
};

const WEAR_LABEL: Record<WearVerdict, string> = {
  aging_likely: "노후/마모 가능성",
  damage_possible: "확인 필요",
  unclear: "판단 어려움",
};

export default async function Page() {
  const [moveout, records, settlement] = await Promise.all([
    getMoveout(DEMO_MOVEOUT_ID),
    getRecords(DEMO_MOVEOUT_ID),
    getSettlement(DEMO_MOVEOUT_ID),
  ]);
  const reviewItems = records.filter((record) => record.wearVerdict);

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link
            href={MOVEOUT_ROUTES["T-OUT-00"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            ‹ 뒤로
          </Link>
          <div style={{ fontSize: 14, fontWeight: 700 }}>내 퇴실 기록</div>
          <div style={{ width: 34 }} />
        </div>
        <div
          style={{
            border: "1.5px solid var(--primary)",
            borderRadius: 10,
            padding: 10,
            background: "var(--surface-container-high)",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {settlement.disclaimer}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <section>
          <div style={labelStyle}>내 기록 타임라인</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {records.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </div>
        </section>

        <section>
          <div style={labelStyle}>확인이 필요할 수 있는 항목</div>
          {reviewItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviewItems.map((record) => (
                <Card key={record.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{record.title}</div>
                    <Badge emphasis>{WEAR_LABEL[record.wearVerdict!]}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                    {record.wearNote ?? "노후/마모일 수도 있어요. 확인이 필요한 항목입니다."}
                  </div>
                  <Link
                    href={MOVEOUT_ROUTES["T-OUT-04"]}
                    style={{
                      alignSelf: "flex-start",
                      color: "var(--primary)",
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    이의·정정
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
              지금은 추가 확인이 필요한 항목이 없어요.
            </Card>
          )}
        </section>

        <section>
          <div style={labelStyle}>계약서 참고</div>
          <Card style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            {moveout.unitId}호 원상복구·청소비 조항을 함께 참고합니다. 자연 노후는 임차인 책임으로
            단정하지 않아요.
          </Card>
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
        <Link href={MOVEOUT_ROUTES["T-OUT-03"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>예상 정산 안내</Button>
        </Link>
        <Link href={MOVEOUT_ROUTES["T-OUT-04"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            이의·정정 요청
          </Button>
        </Link>
      </footer>
    </>
  );
}

function RecordCard({ record }: { record: MoveoutRecordItem }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Badge>{SOURCE_LABEL[record.source]}</Badge>
        <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
          {record.occurredAt?.slice(0, 10) ?? "날짜 없음"}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 800 }}>{record.title}</div>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
        {record.description}
      </div>
      {record.moveinComparisonAvailable && (
        <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
          입주 전 비교 가능 · 공백은 책임 인정이 아니에요
        </span>
      )}
    </Card>
  );
}
