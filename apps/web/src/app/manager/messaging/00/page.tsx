import Link from "next/link";
import { redirect } from "next/navigation";
import type { ManagerMessagingRecipient, Thread } from "@roomlog/types";
import { Button, Input } from "@roomlog/ui";
import {
  deleteManagerThread,
  listManagerMessagingRecipients,
  listManagerThreads,
} from "@/lib/messaging-manager-api";
import {
  filterThreadsByBuilding,
  getBuildingOptions,
  hasUnassignedBuilding,
  resolveBuildingFilter,
} from "@/lib/messaging-building-filter";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import {
  managerThreadConfirmationLabel,
  managerThreadNeedsReply,
  sortManagerThreads,
} from "@/lib/manager-messaging-thread-status";
import { filterThreadsBySearch } from "@/lib/messaging-thread-search";
import { formatThreadLocation } from "@/lib/messaging-thread-location";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  CONTEXT_LABEL,
  LinkButton,
  ScreenHeader,
  formatDateTime,
  sectionTitleStyle,
} from "../_components";
import { BuildingFilter } from "./BuildingFilter";
import { NewConversationForm } from "./NewConversationForm";

export const dynamic = "force-dynamic";

type MessagingStatusFilter =
  | "all"
  | "needs-reply"
  | "today"
  | "general"
  | "contract"
  | "defect"
  | "announcement";

type SearchParams = Promise<{ building?: string; q?: string; status?: string }>;

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
  const [{ building, q, status }, threads, recipients] = await Promise.all([
    searchParams,
    listManagerThreads(),
    listManagerMessagingRecipients(),
  ]);
  const uniqueThreads = uniqueThreadsByConversationTarget(threads);
  const recipientsWithLatestThreads = withLatestGeneralThreadIds(recipients, uniqueThreads);
  const buildingOptions = getBuildingOptions(uniqueThreads, recipientsWithLatestThreads);
  const showUnassigned = hasUnassignedBuilding(uniqueThreads);
  const activeBuilding = resolveBuildingFilter(building, buildingOptions, showUnassigned);
  const filteredThreads = filterThreadsByBuilding(uniqueThreads, activeBuilding);
  const searchQuery = q?.trim() ?? "";
  const searchedThreads = filterThreadsBySearch(filteredThreads, searchQuery);
  const activeStatus = resolveStatusFilter(status);
  const statusFilteredThreads = filterThreadsByStatus(searchedThreads, activeStatus);
  const sortedThreads = sortManagerThreads(statusFilteredThreads);
  const needsReply = searchedThreads.filter(managerThreadNeedsReply).length;
  const todayCount = searchedThreads.filter(isTodayThread).length;
  const contractOrNoticeCount = searchedThreads.filter(
    (thread) => thread.context === "contract" || thread.context === "announcement",
  ).length;
  const statusFilterOptions = getStatusFilterOptions(searchedThreads);

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-00"
        title="커뮤니케이션 허브"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-01"]}>공지 작성</LinkButton>}
      />

      <div
        className="manager-messaging-toolbar"
        style={{
          marginBottom: "var(--space-lg)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: "var(--space-md)",
          padding: "var(--space-md)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          background: "var(--surface-container-lowest)",
        }}
      >
        <BuildingFilter
          activeBuilding={activeBuilding}
          buildingOptions={buildingOptions}
          showUnassigned={showUnassigned}
        />
        <form
          method="get"
          style={{
            flex: "0 1 420px",
            maxWidth: "100%",
            minWidth: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "end",
            gap: "var(--space-sm)",
          }}
        >
          {activeBuilding ? <input type="hidden" name="building" value={activeBuilding} /> : null}
          {activeStatus !== "all" ? <input type="hidden" name="status" value={activeStatus} /> : null}
          <label
            style={{
              minWidth: 0,
              display: "grid",
              gap: "var(--space-xs)",
              color: "var(--on-surface-variant)",
              fontSize: "var(--fs-caption)",
              fontWeight: 800,
            }}
          >
            제목·내용 검색
            <Input
              type="search"
              name="q"
              aria-label="제목 및 내용 검색"
              placeholder="제목/내용 검색"
              defaultValue={searchQuery}
              style={{
                height: "var(--space-xxl)",
                padding: "0 var(--space-md)",
                fontSize: "var(--fs-caption)",
              }}
            />
          </label>
          <Button
            type="submit"
            style={{
              height: "var(--space-xxl)",
              padding: "0 var(--space-md)",
              fontSize: "var(--fs-caption)",
            }}
          >
            검색
          </Button>
        </form>
        <div
          style={{
            flex: "0 0 auto",
            minHeight: "var(--space-xxl)",
            marginInlineStart: "auto",
            alignSelf: "flex-end",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <Badge emphasis>답장 필요 {needsReply}건</Badge>
        </div>
      </div>

      <div className="manager-messaging-summary-grid" aria-label="대화 요약">
        <SummaryTile label="전체 대화" value={searchedThreads.length} />
        <SummaryTile label="답장 필요" value={needsReply} emphasis />
        <SummaryTile label="오늘 업데이트" value={todayCount} />
        <SummaryTile label="계약·공지" value={contractOrNoticeCount} />
      </div>

      <nav className="manager-messaging-status-filters" aria-label="대화 상태 필터">
        {statusFilterOptions.map((option) => (
          <Link
            key={option.key}
            href={managerMessagingHubHref({
              building: activeBuilding,
              q: searchQuery,
              status: option.key,
            })}
            className={`manager-messaging-status-filter${
              option.key === activeStatus ? " is-active" : ""
            }`}
            aria-current={option.key === activeStatus ? "page" : undefined}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </Link>
        ))}
      </nav>

      <div className="manager-messaging-workspace">
        <section className="manager-messaging-thread-list">
          <div style={sectionTitleStyle}>건물별 · 답장 필요 상단</div>
          {sortedThreads.length > 0 ? (
            <div className="manager-messaging-thread-table" role="list">
              {sortedThreads.map((thread) => (
                <ThreadRow key={thread.id} thread={thread} />
              ))}
            </div>
          ) : searchQuery ? (
            <Card style={{ color: "var(--on-surface-variant)", textAlign: "center" }}>
              &ldquo;{searchQuery}&rdquo; 검색 결과가 없습니다.
            </Card>
          ) : (
            <Card style={{ color: "var(--on-surface-variant)", textAlign: "center" }}>
              이 조건에는 아직 시작된 대화가 없습니다.
            </Card>
          )}
        </section>
        <aside className="manager-messaging-composer-panel" aria-label="새 대화 시작">
          <NewConversationForm
            recipients={recipientsWithLatestThreads}
            initialBuilding={activeBuilding}
          />
        </aside>
      </div>
    </>
  );
}

function SummaryTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <section className={`manager-messaging-summary-tile${emphasis ? " is-emphasis" : ""}`}>
      <span>{label}</span>
      <strong>{value}건</strong>
    </section>
  );
}

function ThreadRow({ thread }: { thread: Thread }) {
  const needsReply = managerThreadNeedsReply(thread);
  const confirmationLabel = managerThreadConfirmationLabel(thread);
  const locationLabel = formatThreadLocation(thread);

  return (
    <article
      className={`manager-messaging-thread-row${needsReply ? " is-needs-reply" : ""}`}
      role="listitem"
    >
      <div className="manager-messaging-thread-row__meta">
        <div className="manager-messaging-thread-row__badges">
          <Badge emphasis={needsReply}>{locationLabel}</Badge>
          <Badge>{CONTEXT_LABEL[thread.context]}</Badge>
          {thread.isManagerTicketUnread ? (
            <span className="manager-messaging-thread-row__unread" aria-label="상대방 미확인">
              <span aria-hidden="true" />
              <span>미확인</span>
            </span>
          ) : null}
        </div>
        {needsReply ? <Badge emphasis>답장 필요</Badge> : null}
      </div>

      <div className="manager-messaging-thread-row__body">
        <strong data-testid="manager-thread-title">{thread.contextLabel ?? "일반 문의"}</strong>
        <span data-testid="manager-thread-message" title={thread.lastMessage}>
          {thread.lastMessage}
        </span>
      </div>

      <div className="manager-messaging-thread-row__time">
        <span>{formatDateTime(thread.updatedAt)}</span>
        <span
          data-confirmation={confirmationLabel === "미확인" ? "unconfirmed" : "confirmed"}
          className={confirmationLabel === "미확인" ? "is-unconfirmed" : undefined}
        >
          {confirmationLabel}
        </span>
      </div>

      <div className="manager-messaging-thread-row__actions">
        <Link
          href={`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?id=${thread.id}`}
          className="manager-messaging-thread-row__open"
        >
          열기
        </Link>
        <form action={deleteManagerThreadAction}>
          <input type="hidden" name="threadId" value={thread.id} />
          <Button
            type="submit"
            variant="ghost"
            aria-label={`${locationLabel} ${thread.contextLabel ?? "일반 문의"} 대화 삭제`}
            style={{ height: 40, padding: "0 var(--space-md)", whiteSpace: "nowrap" }}
          >
            삭제
          </Button>
        </form>
      </div>
    </article>
  );
}

function resolveStatusFilter(value?: string): MessagingStatusFilter {
  if (
    value === "needs-reply" ||
    value === "today" ||
    value === "general" ||
    value === "contract" ||
    value === "defect" ||
    value === "announcement"
  ) {
    return value;
  }

  return "all";
}

function filterThreadsByStatus(threads: Thread[], status: MessagingStatusFilter) {
  switch (status) {
    case "needs-reply":
      return threads.filter(managerThreadNeedsReply);
    case "today":
      return threads.filter(isTodayThread);
    case "general":
    case "contract":
    case "defect":
    case "announcement":
      return threads.filter((thread) => thread.context === status);
    case "all":
    default:
      return threads;
  }
}

function getStatusFilterOptions(threads: Thread[]) {
  return [
    { key: "all", label: "전체", count: threads.length },
    { key: "needs-reply", label: "답장 필요", count: threads.filter(managerThreadNeedsReply).length },
    { key: "today", label: "오늘", count: threads.filter(isTodayThread).length },
    { key: "general", label: "일반", count: threads.filter((thread) => thread.context === "general").length },
    { key: "contract", label: "계약", count: threads.filter((thread) => thread.context === "contract").length },
    { key: "defect", label: "민원/하자", count: threads.filter((thread) => thread.context === "defect").length },
    {
      key: "announcement",
      label: "공지 답변",
      count: threads.filter((thread) => thread.context === "announcement").length,
    },
  ] satisfies Array<{ key: MessagingStatusFilter; label: string; count: number }>;
}

function uniqueThreadsByConversationTarget(threads: Thread[]) {
  const sortedThreads = [...threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const seenGeneralThreads = new Set<string>();

  return sortedThreads.filter((thread) => {
    const key = generalConversationKey(thread);
    if (!key) {
      return true;
    }

    if (seenGeneralThreads.has(key)) {
      return false;
    }

    seenGeneralThreads.add(key);
    return true;
  });
}

function withLatestGeneralThreadIds(
  recipients: ManagerMessagingRecipient[],
  threads: Thread[],
): ManagerMessagingRecipient[] {
  const latestGeneralThreadIds = new Map<string, string>();

  for (const thread of threads) {
    const key = generalConversationKey(thread);
    if (key) {
      latestGeneralThreadIds.set(key, thread.id);
    }
  }

  return recipients.map((recipient) => {
    const latestThreadId = latestGeneralThreadIds.get(
      `${recipient.roomId}\u0000${recipient.tenantId}`,
    );

    return latestThreadId
      ? { ...recipient, existingGeneralThreadId: latestThreadId }
      : recipient;
  });
}

function generalConversationKey(
  thread: Pick<Thread, "roomId" | "tenantId" | "context" | "contextRef">,
) {
  if (!thread.roomId || thread.context !== "general" || thread.contextRef?.trim()) {
    return "";
  }

  return `${thread.roomId}\u0000${thread.tenantId}`;
}

function isTodayThread(thread: Thread) {
  const updatedAt = new Date(thread.updatedAt);
  const now = new Date();

  return (
    updatedAt.getFullYear() === now.getFullYear() &&
    updatedAt.getMonth() === now.getMonth() &&
    updatedAt.getDate() === now.getDate()
  );
}

function managerMessagingHubHref({
  building,
  q,
  status,
}: {
  building: string;
  q: string;
  status: MessagingStatusFilter;
}) {
  const params = new URLSearchParams();

  if (building) {
    params.set("building", building);
  }
  if (q) {
    params.set("q", q);
  }
  if (status !== "all") {
    params.set("status", status);
  }

  const queryString = params.toString();
  return queryString
    ? `${MANAGER_MESSAGING_ROUTES["M-MSG-00"]}?${queryString}`
    : MANAGER_MESSAGING_ROUTES["M-MSG-00"];
}
