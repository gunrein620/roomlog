import Link from "next/link";
import type { MoveoutRecordItem, MoveoutRecordSource, WearVerdict } from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, getMoveout, getRecords, getSettlement } from "@/lib/moveout-api";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";
import { ROUTES as DEFECT_ROUTES } from "@/lib/nav";
import { ROUTES as MOVEIN_ROUTES } from "@/lib/movein-nav";
import { MOVEOUT_ROUTES, withMoveoutId } from "@/lib/moveout-nav";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

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

const SOURCE_ROUTE: Record<MoveoutRecordSource, string> = {
  movein_photo: MOVEIN_ROUTES["T-IN-00"],
  defect: DEFECT_ROUTES["T-DEF-00"],
  repair: DEFECT_ROUTES["T-DEF-00"],
  payment: PAYMENT_ROUTES["T-PAY-00"],
  chat: MESSAGING_ROUTES["T-MSG-00"],
  contract: CONTRACT_ROUTES["T-DOC-00"],
};

const WEAR_LABEL: Record<WearVerdict, string> = {
  aging_likely: "노후/마모 가능성",
  damage_possible: "확인 필요",
  unclear: "판단 어려움",
};

function disputeHrefFor(record: MoveoutRecordItem, moveoutId: string) {
  return `${MOVEOUT_ROUTES["T-OUT-04"]}?id=${encodeURIComponent(moveoutId)}&targetItemId=${record.id}&from=records`;
}

function disputeIndexHref(moveoutId: string) {
  return `${withMoveoutId(MOVEOUT_ROUTES["T-OUT-04"], moveoutId)}&from=records`;
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const moveoutId = params.id?.trim() || DEMO_MOVEOUT_ID;
  const [moveout, records, settlement] = await Promise.all([
    getMoveout(moveoutId),
    getRecords(moveoutId),
    getSettlement(moveoutId),
  ]);
  const reviewItems = records.filter((record) => record.wearVerdict);
  const primaryDisputeHref = reviewItems[0]
    ? disputeHrefFor(reviewItems[0], moveout.id)
    : disputeIndexHref(moveout.id);

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
            href={withMoveoutId(MOVEOUT_ROUTES["T-OUT-00"], moveout.id)}
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
              <RecordCard key={record.id} record={record} moveoutId={moveout.id} />
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
                    href={disputeHrefFor(record, moveout.id)}
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
        <Link href={withMoveoutId(MOVEOUT_ROUTES["T-OUT-03"], moveout.id)} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>예상 정산 안내</Button>
        </Link>
        <Link href={primaryDisputeHref} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            이의·정정 요청
          </Button>
        </Link>
      </footer>
    </>
  );
}

function RecordCard({ record, moveoutId }: { record: MoveoutRecordItem; moveoutId: string }) {
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
      <RecordDetailSections record={record} />
      {record.moveinComparisonAvailable && (
        <span style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
          입주 전 비교 가능 · 공백은 책임 인정이 아니에요
        </span>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link
          href={SOURCE_ROUTE[record.source]}
          style={{ color: "var(--on-surface-variant)", fontSize: 12, fontWeight: 800 }}
        >
          {SOURCE_LABEL[record.source]} 원천 보기
        </Link>
        {record.wearVerdict && (
          <Link
            href={disputeHrefFor(record, moveoutId)}
            style={{ color: "var(--primary)", fontSize: 12, fontWeight: 800 }}
          >
            이의·정정
          </Link>
        )}
      </div>
    </Card>
  );
}

function RecordDetailSections({ record }: { record: MoveoutRecordItem }) {
  if (!record.detailSections?.length && !record.detail && !(record.evidenceUrls ?? []).length) {
    return null;
  }

  return (
    <details>
      <summary style={detailSummaryStyle}>상세정보 보기</summary>
      <div style={detailPanelStyle}>
        <RecordSourceDetail record={record} />
        {record.detailSections?.map((section) => (
          <div key={section.label} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={detailSectionLabelStyle}>{section.label}</div>
            {section.items.map((item) => (
              <div key={`${section.label}-${item.label}`} style={detailItemStyle}>
                <span style={{ fontWeight: 800, color: "var(--on-surface)" }}>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={detailSectionLabelStyle}>사진·문서</div>
          {(record.evidenceUrls ?? []).length > 0 ? (
            record.evidenceUrls!.map((url, index) => (
              <Link key={url} href={url} style={{ color: "var(--primary)", fontWeight: 800, fontSize: 12 }}>
                사진·문서 {index + 1}
              </Link>
            ))
          ) : (
            <span>연결된 사진·문서 근거는 아직 없습니다.</span>
          )}
        </div>
      </div>
    </details>
  );
}

function RecordSourceDetail({ record }: { record: MoveoutRecordItem }) {
  if (!record.detail) {
    return null;
  }

  return (
    <div style={sourceDetailStyle}>
      {record.detail.summary ? <div>{record.detail.summary}</div> : null}

      {record.detail?.media?.length ? (
        <div style={detailSubsectionStyle}>
          <div style={detailSectionLabelStyle}>사진·문서</div>
          <div style={mediaGridStyle}>
            {record.detail.media.map((item) => (
              <a key={`${item.label}-${item.url}`} href={item.url} style={mediaCardStyle}>
                <img src={item.url} alt={item.label} style={mediaImageStyle} />
                <span style={{ fontWeight: 800, color: "var(--on-surface)" }}>{item.label}</span>
                {item.caption ? <span>{item.caption}</span> : null}
                {item.capturedAt ? <span>{formatDate(item.capturedAt)}</span> : null}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {record.detail?.chatMessages?.length ? (
        <div style={detailSubsectionStyle}>
          <div style={detailSectionLabelStyle}>채팅 내역</div>
          {record.detail.chatMessages.map((message) => (
            <div key={`${message.at}-${message.senderLabel}`} style={chatMessageStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, color: "var(--on-surface)" }}>{message.senderLabel}</span>
                <span>{formatDate(message.at)}</span>
              </div>
              <div>{message.body}</div>
              {message.attachmentUrls?.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {message.attachmentUrls.map((url, index) => (
                    <Link key={`${message.at}-${url}`} href={url} style={{ color: "var(--primary)", fontWeight: 800 }}>
                      첨부 {index + 1}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {record.detail?.events?.length ? (
        <div style={detailSubsectionStyle}>
          <div style={detailSectionLabelStyle}>처리 이력</div>
          {record.detail.events.map((event) => (
            <div key={`${event.at}-${event.label}`} style={eventRowStyle}>
              <div>
                <div style={{ fontWeight: 800, color: "var(--on-surface)" }}>{event.label}</div>
                {event.note ? <div>{event.note}</div> : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                {event.status ? <Badge>{event.status}</Badge> : null}
                <span>{formatDate(event.at)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {record.detail?.amounts?.length ? (
        <div style={detailSubsectionStyle}>
          <div style={detailSectionLabelStyle}>금액 연결</div>
          {record.detail.amounts.map((amount) => (
            <div key={amount.label} style={detailItemStyle}>
              <span style={{ fontWeight: 800, color: "var(--on-surface)" }}>{amount.label}</span>
              <span>
                <span style={{ fontWeight: 800, color: "var(--on-surface)" }}>{formatDetailAmount(amount)}</span>
                {amount.status ? ` · ${amount.status}` : ""}
              </span>
              {amount.note ? <span>{amount.note}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {record.detail?.clauses?.length ? (
        <div style={detailSubsectionStyle}>
          <div style={detailSectionLabelStyle}>계약 조항</div>
          {record.detail.clauses.map((clause) => (
            <div key={clause.title} style={clauseStyle}>
              <div style={{ fontWeight: 800, color: "var(--on-surface)" }}>{clause.title}</div>
              <div>{clause.body}</div>
              {clause.note ? <div>{clause.note}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type RecordDetailAmount = NonNullable<NonNullable<MoveoutRecordItem["detail"]>["amounts"]>[number];

function formatDetailAmount(amount: RecordDetailAmount) {
  if (typeof amount.amount === "number") {
    return won(amount.amount);
  }

  if (typeof amount.min === "number" && typeof amount.max === "number") {
    return `${wonShort(amount.min)}~${wonShort(amount.max)}`;
  }

  return "금액 확인 전";
}

function formatDate(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function wonShort(value: number) {
  return `약 ${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
}

const detailSummaryStyle = {
  minHeight: 36,
  width: "fit-content",
  display: "inline-flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  color: "var(--primary)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  listStyle: "none",
} as const;

const detailPanelStyle = {
  marginTop: 8,
  border: "1px dashed var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontSize: 12,
  color: "var(--on-surface-variant)",
  lineHeight: 1.5,
  background: "var(--surface-container-lowest)",
} as const;

const detailSectionLabelStyle = {
  fontSize: 11,
  color: "var(--on-surface-variant)",
  fontWeight: 800,
} as const;

const detailItemStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
} as const;

const sourceDetailStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
} as const;

const detailSubsectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const;

const mediaGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
} as const;

const mediaCardStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  color: "var(--on-surface-variant)",
  textDecoration: "none",
  background: "var(--surface-container-low)",
} as const;

const mediaImageStyle = {
  width: "100%",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
} as const;

const chatMessageStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  background: "var(--surface-container-low)",
} as const;

const eventRowStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 8,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  background: "var(--surface-container-low)",
} as const;

const clauseStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: 8,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  background: "var(--surface-container-low)",
} as const;
