import { redirect } from "next/navigation";
import type { Message, Thread } from "@roomlog/types";
import { Button, Input } from "@roomlog/ui";
import { MessageAutoRefresh } from "@/app/_components/MessageAutoRefresh";
import { addManagerThreadMessage, deleteManagerThread, getManagerThread } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  CONTEXT_LABEL,
  LinkButton,
  NoticeCard,
  ScreenHeader,
  StaticButton,
  formatDateTime,
  sectionTitleStyle,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

async function sendManagerMessage(formData: FormData) {
  "use server";

  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!threadId) {
    redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
  }

  if (threadId && body) {
    try {
      await addManagerThreadMessage(threadId, { body });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        redirect("/manager/login");
      }
      if (error instanceof ApiError && error.status === 404) {
        redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
      }
      throw error;
    }
  }

  redirect(`${MANAGER_MESSAGING_ROUTES["M-MSG-04"]}?id=${encodeURIComponent(threadId)}`);
}

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

async function getRequiredManagerThread(id: string): Promise<Thread> {
  try {
    return await getManagerThread(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    if (error instanceof ApiError && error.status === 404) {
      redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
    }
    throw error;
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  if (!id) {
    redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
  }

  const thread = await getRequiredManagerThread(id);
  const messages = thread.messages ?? [];
  const isPayment = thread.context === "payment";

  return (
    <>
      <MessageAutoRefresh intervalMs={3000} />
      <ScreenHeader
        eyebrow="M-MSG-04"
        title={`${thread.unitId}호 채팅 스레드`}
        actions={
          <>
            <LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>
            <form action={deleteManagerThreadAction}>
              <input type="hidden" name="threadId" value={thread.id} />
              <Button
                type="submit"
                variant="ghost"
                aria-label={`${thread.unitId}호 ${thread.contextLabel ?? "일반 문의"} 대화 삭제`}
              >
                삭제
              </Button>
            </form>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "var(--space-lg)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <ContextCard thread={thread} />

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>메시지 타임라인</div>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </Card>

          <Card>
            <form
              action={sendManagerMessage}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "var(--space-sm)",
                alignItems: "center",
              }}
            >
              <input type="hidden" name="threadId" value={thread.id} />
              <Input name="body" aria-label="답장 입력" placeholder="답장을 입력하세요" />
              <Button type="submit">답장 보내기</Button>
            </form>
          </Card>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <NoticeCard title="추가 요청">
            사진 또는 설명 요청은 임차인 T-MSG-01 상단에 고정되고, 하자 맥락이면 T-DEF-11에도 반영됩니다.
          </NoticeCard>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <StaticButton>사진 요청</StaticButton>
            <StaticButton>설명 요청</StaticButton>
          </div>

          {isPayment ? (
            <NoticeCard title="D20 청구 맥락 톤 가드" emphasis>
              이 채팅은 문의 해결용입니다. 관리인발 독촉 문구, 납부 압박, 미납 낙인 표현은 보낼 수 없습니다.
            </NoticeCard>
          ) : (
            <NoticeCard title="맥락 톤">
              연결된 업무 맥락을 유지하되, 공지와 채팅을 섞어 발송하지 않습니다.
            </NoticeCard>
          )}

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={sectionTitleStyle}>AI 답장 초안</div>
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              문의 내용을 확인했습니다. 처리 가능 시간과 필요한 추가 정보를 안내하는 해결지향 문구로 답장합니다.
            </div>
            <StaticButton>초안 적용</StaticButton>
          </Card>

          <NoticeCard title="음성 답장 확인 1스텝" emphasis>
            음성 받아쓰기는 바로 전송하지 않고 텍스트 확인 화면을 거친 뒤 보냅니다.
          </NoticeCard>
          <StaticButton>음성 받아쓰기 → 텍스트 확인</StaticButton>
        </aside>
      </div>
    </>
  );
}

function ContextCard({ thread }: { thread: Thread }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <Badge emphasis>{thread.unitId}호</Badge>
        <Badge>{thread.tenantId}</Badge>
        <Badge>{CONTEXT_LABEL[thread.context]}</Badge>
        {thread.pendingRequest ? <Badge emphasis>추가요청 대기</Badge> : null}
      </div>
      <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{thread.contextLabel ?? "일반 문의"}</div>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: 1.5 }}>
        source {thread.contextRef ?? thread.id} · 같은 스레드의 임차인 투영은 T-MSG-01입니다.
      </div>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isManager = message.sender === "manager";
  return (
    <div style={{ display: "flex", justifyContent: isManager ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "76%",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-md)",
          background: isManager ? "var(--primary)" : "var(--surface-container)",
          color: isManager ? "var(--on-primary)" : "var(--on-surface)",
        }}
      >
        <div style={{ fontSize: "var(--fs-caption)", lineHeight: 1.5 }}>{message.body}</div>
        <div
          style={{
            marginTop: "var(--space-xs)",
            fontSize: "var(--fs-caption)",
            color: isManager ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {message.kind === "photo_request" ? "추가요청 · " : ""}
          {formatDateTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
