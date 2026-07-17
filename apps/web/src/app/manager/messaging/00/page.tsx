import Link from "next/link";
import { redirect } from "next/navigation";
import type { Thread } from "@roomlog/types";
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
  gridStyle,
  sectionTitleStyle,
} from "../_components";
import { BuildingFilter } from "./BuildingFilter";
import { NewConversationForm } from "./NewConversationForm";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ building?: string; q?: string }>;

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
  const [{ building, q }, threads, recipients] = await Promise.all([
    searchParams,
    listManagerThreads(),
    listManagerMessagingRecipients(),
  ]);
  const buildingOptions = getBuildingOptions(threads, recipients);
  const showUnassigned = hasUnassignedBuilding(threads);
  const activeBuilding = resolveBuildingFilter(building, buildingOptions, showUnassigned);
  const filteredThreads = filterThreadsByBuilding(threads, activeBuilding);
  const searchQuery = q?.trim() ?? "";
  const searchedThreads = filterThreadsBySearch(filteredThreads, searchQuery);
  const sortedThreads = sortManagerThreads(searchedThreads);
  const needsReply = searchedThreads.filter(managerThreadNeedsReply).length;

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

      <NewConversationForm
        recipients={recipients}
        initialBuilding={activeBuilding}
      />

      <section>
          <div style={sectionTitleStyle}>건물별 · 답장 필요 상단</div>
          {sortedThreads.length > 0 ? (
          <div style={gridStyle}>
            {sortedThreads.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
          ) : searchQuery ? (
            <Card style={{ color: "var(--on-surface-variant)", textAlign: "center" }}>
              &ldquo;{searchQuery}&rdquo; 검색 결과가 없습니다.
            </Card>
          ) : (
            <Card style={{ color: "var(--on-surface-variant)", textAlign: "center" }}>
              이 건물에는 아직 시작된 대화가 없습니다.
            </Card>
          )}
      </section>
    </>
  );
}

function ThreadCard({ thread }: { thread: Thread }) {
  const needsReply = managerThreadNeedsReply(thread);
  const confirmationLabel = managerThreadConfirmationLabel(thread);
  const locationLabel = formatThreadLocation(thread);
  return (
    <Card
      style={{
        height: 206,
        overflow: "hidden",
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
          {thread.isManagerTicketUnread ? (
            <span
              aria-label="티켓 미확인"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-xs)",
                padding: "var(--space-xs) var(--space-sm)",
                borderRadius: "var(--radius-full)",
                color: "var(--primary)",
                background: "var(--primary-container)",
                fontSize: "var(--fs-caption)",
                fontWeight: 800,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "var(--space-sm)",
                  height: "var(--space-sm)",
                  borderRadius: "var(--radius-full)",
                  background: "var(--primary)",
                }}
              />
              <span>미확인</span>
            </span>
          ) : null}
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
      <div data-testid="manager-thread-title" style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>
        {thread.contextLabel ?? "일반 문의"}
      </div>
      <div
        data-testid="manager-thread-message"
        title={thread.lastMessage}
        style={{
          minWidth: 0,
          overflow: "hidden",
          color: "var(--on-surface-variant)",
          fontSize: "var(--fs-caption)",
          lineHeight: 1.5,
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {thread.lastMessage}
      </div>
      <div style={{ marginTop: "auto", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
        미응답 {formatDateTime(thread.updatedAt)} ·{" "}
        <span
          data-confirmation={confirmationLabel === "미확인" ? "unconfirmed" : "confirmed"}
          style={{
            color:
              confirmationLabel === "미확인"
                ? "var(--primary)"
                : "var(--on-surface-variant)",
            fontWeight: 800,
          }}
        >{confirmationLabel}</span>
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
