import Link from "next/link";
import { redirect } from "next/navigation";
import type { Announcement, AnnouncementCategory, AnnouncementScope, Thread } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { MessagingPhoneFrame } from "../MessagingPhoneFrame";
import { tenantAnnouncementDetailHref } from "@/app/tenant/messaging/02/announcement-list-model";
import { deleteTenantThread, listAnnouncements, listThreads } from "@/lib/messaging-api";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";
import { ApiError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string }>;

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function deleteTenantThreadAction(formData: FormData) {
  "use server";

  const threadId = String(formData.get("threadId") ?? "");

  if (!threadId) {
    redirect(MESSAGING_ROUTES["T-MSG-00"]);
  }

  try {
    await deleteTenantThread(threadId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/tenant/login");
    }
    if (error instanceof ApiError && error.status === 404) {
      redirect(MESSAGING_ROUTES["T-MSG-00"]);
    }
    throw error;
  }

  redirect(MESSAGING_ROUTES["T-MSG-00"]);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ tab }, threads, announcements] = await Promise.all([
    searchParams,
    listThreads(),
    listAnnouncements(),
  ]);
  const activeTab = tab === "announcements" ? "announcements" : "threads";
  const sortedThreads = [...threads].sort((a, b) => Number(b.pendingRequest) - Number(a.pendingRequest));
  const sortedAnnouncements = [...announcements].sort((a, b) => {
    if (a.category === "urgent" && b.category !== "urgent") return -1;
    if (a.category !== "urgent" && b.category === "urgent") return 1;
    return b.sentAt.localeCompare(a.sentAt);
  });
  const unreadCount = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const unconfirmedCount = announcements.filter(
    (announcement) => announcement.confirmRequired && announcement.state !== "confirmed",
  ).length;

  return (
    <MessagingPhoneFrame>
      <header
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>대화</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
              미읽음 {unreadCount} · 미확인 {unconfirmedCount}
            </div>
          </div>
          <Badge>한국어</Badge>
        </div>
        <Input aria-label="대화 내 검색" placeholder="대화 내 검색" readOnly />
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <nav
          aria-label="대화 공지 탭"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
          }}
        >
          <TabLink href={MESSAGING_ROUTES["T-MSG-00"]} active={activeTab === "threads"}>
            대화
          </TabLink>
          <TabLink
            href={`${MESSAGING_ROUTES["T-MSG-00"]}?tab=announcements`}
            active={activeTab === "announcements"}
          >
            공지
          </TabLink>
        </nav>

        {activeTab === "threads" ? (
          <section>
            <div style={labelStyle}>조치 필요한 대화</div>
            {sortedThreads.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedThreads.map((thread) => (
                  <ThreadRow key={thread.id} thread={thread} />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </section>
        ) : (
          <section>
            <div style={labelStyle}>공지 피드</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedAnnouncements.map((announcement) => (
                <AnnouncementRow key={announcement.id} announcement={announcement} />
              ))}
            </div>
          </section>
        )}
      </div>

      <footer style={{ flex: "none", padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
        <PrimaryLink href={MESSAGING_ROUTES["T-MSG-00"]}>대화 목록 보기</PrimaryLink>
      </footer>
    </MessagingPhoneFrame>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        minHeight: 38,
        border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        borderRadius: "var(--radius-btn)",
        background: active ? "var(--surface-container-high)" : "var(--surface-container-lowest)",
        color: active ? "var(--on-surface)" : "var(--on-surface-variant)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {children}
    </Link>
  );
}

function ThreadRow({ thread }: { thread: Thread }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge emphasis={thread.pendingRequest}>{thread.contextLabel ?? "일반 문의"}</Badge>
          {thread.pendingRequest && <Badge>추가요청 대기</Badge>}
        </div>
        {thread.unreadCount > 0 && <Badge emphasis>{thread.unreadCount}</Badge>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>관리인 · {thread.unitId}호</div>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.45 }}>
        {thread.lastMessage}
      </div>
      <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
        {formatTime(thread.updatedAt)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
        <Link
          href={`${MESSAGING_ROUTES["T-MSG-01"]}?id=${thread.id}`}
          style={{
            minHeight: 36,
            borderRadius: "var(--radius-btn)",
            background: "var(--surface-container-high)",
            color: "var(--on-surface)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          열기
        </Link>
        <form action={deleteTenantThreadAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <Button
            type="submit"
            variant="ghost"
            aria-label={`${thread.contextLabel ?? "일반 문의"} 대화 삭제`}
            style={{ height: 36, padding: "0 12px" }}
          >
            삭제
          </Button>
        </form>
      </div>
    </Card>
  );
}

function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const needsConfirm = announcement.confirmRequired && announcement.state !== "confirmed";
  return (
    <Link
      href={tenantAnnouncementDetailHref(announcement.id)}
      style={{ color: "inherit", textDecoration: "none" }}
    >
      <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge emphasis={announcement.category === "urgent"}>
              {CATEGORY_LABEL[announcement.category]}
            </Badge>
            <Badge>{SCOPE_LABEL[announcement.scope]}</Badge>
          </div>
          {needsConfirm ? <Badge emphasis>미확인</Badge> : <Badge>{announcement.state === "read" ? "읽음" : "확인"}</Badge>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{announcement.title}</div>
        <div style={{ fontSize: 11, color: "var(--on-surface-variant)" }}>
          {announcement.sender} · {formatTime(announcement.sentAt)}
        </div>
      </Card>
    </Link>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        textAlign: "center",
        border: "1.5px dashed var(--outline-variant)",
        borderRadius: "var(--radius-md)",
        color: "var(--on-surface-variant)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>아직 대화가 없어요</div>
      <div style={{ fontSize: 12 }}>문의로 남겨주세요</div>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        height: "var(--touch-target)",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: "var(--primary)",
        color: "var(--on-primary)",
        borderRadius: "var(--radius-btn)",
        fontSize: "var(--fs-body)",
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
