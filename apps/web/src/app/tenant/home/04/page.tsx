import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, Button, Card } from "@roomlog/ui";
import { CROSS_ROUTES, HOME_ROUTES } from "@/lib/home-nav";

const actionItems = [
  {
    title: "하자 진행 상황을 확인해 주세요",
    meta: "에어컨 물샘 · 오늘 10:20",
    href: CROSS_ROUTES.defectStatus,
    badge: "하자",
  },
  {
    title: "이번 달 납부 안내가 도착했어요",
    meta: "확인하면 납부 방법을 볼 수 있어요",
    href: CROSS_ROUTES.payment,
    badge: "납부",
  },
];

const infoItems = [
  {
    title: "계약서가 등록되면 여기서 알려드려요",
    meta: "계약 · 대기 안내",
    href: CROSS_ROUTES.contract,
    badge: "계약",
  },
  {
    title: "관리자가 신고 내용을 확인했어요",
    meta: "하자 · 어제",
    href: CROSS_ROUTES.defectHome,
    badge: "정보",
  },
  {
    title: "새 메시지가 있어요",
    meta: "대화 · 원문 보기 가능",
    href: CROSS_ROUTES.messaging,
    badge: "대화",
  },
];

const labelStyle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

export default function Page() {
  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "14px var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
        }}
      >
        <Link
          href={HOME_ROUTES["T-HOME-00"]}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>알림</div>
        <Button variant="ghost" style={{ height: "auto", padding: 0, fontSize: "var(--fs-caption)" }}>
          모두 읽음
        </Button>
      </header>

      <div
        style={{
          flex: "none",
          padding: "10px var(--page-margin) 0",
          display: "flex",
          gap: "var(--space-sm)",
        }}
      >
        <Badge emphasis>전체</Badge>
        <Badge>조치 필요</Badge>
        <Badge>정보성</Badge>
      </div>

      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <NotificationGroup label="조치 필요" items={actionItems} />
        <NotificationGroup label="정보성" items={infoItems} />

        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
            background: "var(--surface-container)",
          }}
        >
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>번역 보기</div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
            선택한 언어로 먼저 보여드리고, 필요한 알림에서만 원문을 열 수 있어요.
          </div>
          <Button variant="secondary" style={{ alignSelf: "flex-start", height: 36, fontSize: "var(--fs-caption)" }}>
            원문 보기
          </Button>
        </Card>
      </main>
    </>
  );
}

function NotificationGroup({
  label,
  items,
}: {
  label: string;
  items: { title: string; meta: string; href: string; badge: string }[];
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={labelStyle}>{label}</div>
      {items.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {items.map((item) => (
            <Link key={item.title} href={item.href} style={{ color: "inherit", textDecoration: "none" }}>
              <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                <div>
                  <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>{item.title}</div>
                  <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                    {item.meta}
                  </div>
                </div>
                <Badge>{item.badge}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card style={{ borderStyle: "dashed", textAlign: "center", color: "var(--on-surface-variant)" }}>
          받은 알림이 없어요
        </Card>
      )}
    </section>
  );
}
