import Link from "next/link";
import type { Announcement, AnnouncementCategory, AnnouncementScope } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { DEMO_ANNOUNCEMENT_ID, getAnnouncement } from "@/lib/messaging-api";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";

type SearchParams = Promise<{ id?: string }>;

const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  urgent: "긴급",
  life: "생활",
  event: "행사",
};

const SCOPE_LABEL: Record<AnnouncementScope, string> = {
  all: "전체",
  building: "건물",
  unit: "호실",
};

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const announcement = await getAnnouncement(id ?? DEMO_ANNOUNCEMENT_ID);
  const isUrgent = announcement.category === "urgent" || announcement.confirmRequired;

  return (
    <>
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Link
            href={`${MESSAGING_ROUTES["T-MSG-00"]}?tab=announcements`}
            aria-label="공지 목록으로"
            style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 800 }}
          >
            ←
          </Link>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge emphasis={isUrgent}>{CATEGORY_LABEL[announcement.category]}</Badge>
            <Badge>{SCOPE_LABEL[announcement.scope]}</Badge>
          </div>
        </div>
        <Badge>원문 보기</Badge>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
          <div style={{ fontSize: 20, lineHeight: 1.25, fontWeight: 800 }}>
            {announcement.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
            {announcement.sender} · {formatTime(announcement.sentAt)}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--on-surface)",
              whiteSpace: "pre-wrap",
            }}
          >
            {announcement.body}
          </p>
        </Card>

        {isUrgent ? (
          <Card
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              border: "1.5px solid var(--primary)",
              background: "var(--surface-container-high)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800 }}>확인이 필요한 긴급 공지</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.45 }}>
              긴급 공지는 읽음과 별도로 명시 확인이 필요해요. 번역은 검수된 문구로 제공됩니다.
            </div>
            {announcement.safetyCta && <Badge emphasis>{announcement.safetyCta}</Badge>}
          </Card>
        ) : (
          <Card style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
            일반 공지는 읽음으로 처리돼요. 확인 게이트는 긴급 공지에만 적용됩니다.
          </Card>
        )}

        {announcement.originalBody && (
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>원문</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              {announcement.originalBody}
            </div>
          </Card>
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
        <StaticAction emphasis>{isUrgent ? "확인" : "읽음"}</StaticAction>
        <Link
          href={`${MESSAGING_ROUTES["T-MSG-01"]}?announcementId=${announcement.id}`}
          style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            height: "var(--touch-target)",
            alignItems: "center",
            justifyContent: "center",
            border: "1.5px solid var(--primary)",
            background: "transparent",
            color: "var(--primary)",
            borderRadius: "var(--radius-btn)",
            fontSize: "var(--fs-body)",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          이 공지 문의
        </Link>
      </footer>
    </>
  );
}

function StaticAction({ children, emphasis }: { children: React.ReactNode; emphasis?: boolean }) {
  return (
    <div
      role="button"
      aria-disabled="true"
      style={{
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        height: "var(--touch-target)",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: emphasis ? "var(--primary)" : "var(--surface-container)",
        color: emphasis ? "var(--on-primary)" : "var(--on-surface)",
        borderRadius: "var(--radius-btn)",
        fontSize: "var(--fs-body)",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}
