import Link from "next/link";
import { redirect } from "next/navigation";
import type { Thread } from "@roomlog/types";
import { Button, Input } from "@roomlog/ui";
import {
  deleteManagerThread,
  listManagerThreads,
} from "@/lib/messaging-manager-api";
import {
  filterThreadsByBuilding,
  getBuildingOptions,
  hasUnassignedBuilding,
  resolveBuildingFilter,
} from "@/lib/messaging-building-filter";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { formatThreadLocation } from "@/lib/messaging-thread-location";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  CONTEXT_LABEL,
  LinkButton,
  ScreenHeader,
  formatDateTime,
  gridStyle,
  sectionTitleStyle,
} from "../_components";
import { BuildingFilter } from "./BuildingFilter";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ building?: string }>;

async function deleteManagerThreadAction(formData: FormData) {
  "use server";

  const threadId = String(formData.get("threadId") ?? "");

  if (!threadId) {
    redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
  }

  try {
    await deleteManagerThread(threadId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    if (error instanceof ApiError && error.status === 404) {
      redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
    }
    throw error;
  }

  redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ building }, threads] = await Promise.all([
    searchParams,
    listManagerThreads(),
  ]);
  const buildingOptions = getBuildingOptions(threads);
  const showUnassigned = hasUnassignedBuilding(threads);
  const activeBuilding = resolveBuildingFilter(building, buildingOptions, showUnassigned);
  const filteredThreads = filterThreadsByBuilding(threads, activeBuilding);
  const sortedThreads = [...filteredThreads].sort((a, b) => {
    const urgentA = a.unreadCount + Number(a.pendingRequest);
    const urgentB = b.unreadCount + Number(b.pendingRequest);
    return urgentB - urgentA || b.updatedAt.localeCompare(a.updatedAt);
  });
  const needsReply = filteredThreads.filter((thread) => thread.unreadCount > 0 || thread.pendingRequest).length;

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-00"
        title="커뮤니케이션 허브"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-01"]}>공지 작성</LinkButton>}
      />

      <Card style={{ marginBottom: "var(--space-lg)", display: "grid", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>
              답장 필요 {needsReply}건
            </div>
            <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
              대화 내 검색만 제공하며 전역 검색은 셸 소유입니다.
            </div>
          </div>
          <Badge>알림 벨 · 인스크린</Badge>
        </div>
        <Input aria-label="대화 내 검색" placeholder="대화 내 검색" readOnly />
      </Card>

      <BuildingFilter
        activeBuilding={activeBuilding}
        buildingOptions={buildingOptions}
        showUnassigned={showUnassigned}
      />

      <section>
          <div style={sectionTitleStyle}>건물별 · 답장 필요 상단</div>
          {sortedThreads.length > 0 ? (
          <div style={gridStyle}>
            {sortedThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
          ) : (
            <Card style={{ color: "var(--on-surface-variant)", textAlign: "center" }}>
              선택한 건물의 티켓이 없습니다.
            </Card>
          )}
      </section>
    </>
  );
}

function ThreadCard({ thread }: { thread: Thread }) {
  const needsReply = thread.unreadCount > 0 || thread.pendingRequest;
  const locationLabel = formatThreadLocation(thread);
  return (
    <Card
      style={{
        minHeight: 206,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-sm)",
        border: needsReply ? "1.5px solid var(--primary)" : "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <Badge emphasis={needsReply}>{locationLabel}</Badge>
          <Badge>{CONTEXT_LABEL[thread.context]}</Badge>
        </div>
        {needsReply ? (
          <Badge emphasis>
            <span
              aria-label="답장 필요"
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1.25,
                whiteSpace: "nowrap",
              }}
            >
              <span>답장</span>
              <span>필요</span>
            </span>
          </Badge>
        ) : null}
      </div>
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>{thread.contextLabel ?? "일반 문의"}</div>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: 1.5 }}>
        {thread.lastMessage}
      </div>
      <div style={{ marginTop: "auto", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
        미응답 {formatDateTime(thread.updatedAt)} · 미읽음 {thread.unreadCount}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-sm)", alignItems: "center" }}>
        <Link
          href={`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?id=${thread.id}`}
          style={{
            minHeight: 40,
            borderRadius: "var(--radius-btn)",
            background: "var(--surface-container-high)",
            color: "var(--on-surface)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontSize: "var(--fs-caption)",
            fontWeight: 800,
          }}
        >
          열기
        </Link>
        <form action={deleteManagerThreadAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <Button
            type="submit"
            variant="ghost"
            aria-label={`${locationLabel} ${thread.contextLabel ?? "일반 문의"} 대화 삭제`}
            style={{ height: 40, padding: "0 var(--space-md)" }}
          >
            삭제
          </Button>
        </form>
      </div>
    </Card>
  );
}
