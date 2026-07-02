import Link from "next/link";
import type { Message, Thread, ThreadContext } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { DEMO_THREAD_ID, getThread } from "@/lib/messaging-api";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";

type SearchParams = Promise<{ id?: string }>;

const CONTEXT_TONE: Record<ThreadContext, string> = {
  defect: "추가 응답은 하자 기록에도 반영돼요",
  payment: "청구 맥락 채팅은 문의용이에요",
  contract: "계약 문의",
  moveout: "퇴실 문의",
  announcement: "공지 문의",
  general: "일반 문의",
};

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const thread = await getThread(id ?? DEMO_THREAD_ID);
  const messages = thread.messages ?? [];
  const pendingMessage = messages.find((message) => message.kind === "photo_request");

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
            href={MESSAGING_ROUTES["T-MSG-00"]}
            aria-label="받은함으로"
            style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 800 }}
          >
            ←
          </Link>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>관리인</div>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
              {thread.unitId}호 · {thread.contextLabel ?? "일반 문의"}
            </div>
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
        <ContextCard thread={thread} />

        {pendingMessage && (
          <Card
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              border: "1.5px solid var(--primary)",
              background: "var(--surface-container-high)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>추가요청 응답 대기</div>
              <Badge emphasis>하자 기록 반영</Badge>
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.45 }}>
              {pendingMessage.body} 응답하면 연결된 하자 기록에도 함께 남아요.
            </div>
            <Button variant="secondary" fullWidth>
              사진 또는 설명으로 응답
            </Button>
          </Card>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </section>

        {thread.archivedNotice && (
          <Card
            style={{
              padding: 12,
              fontSize: 12,
              color: "var(--on-surface-variant)",
              background: "var(--surface-container)",
            }}
          >
            이 대화는 관리 기록에 보관돼요.
          </Card>
        )}
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
        }}
      >
        <Input aria-label="메시지 입력" placeholder="메시지를 입력하세요" readOnly />
        <Button>보내기</Button>
      </footer>
    </>
  );
}

function ContextCard({ thread }: { thread: Thread }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Badge emphasis>{thread.contextLabel ?? "일반 문의"}</Badge>
        <Badge>{CONTEXT_TONE[thread.context]}</Badge>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800 }}>맥락 카드</div>
      <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.45 }}>
        연결 ID {thread.contextRef ?? thread.id}. 청구 맥락에서도 이 채팅은 문의와 해결 안내용이며
        독촉 문구를 쓰지 않아요.
      </div>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isMine = message.sender === "tenant";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          background: isMine ? "var(--primary)" : "var(--surface-container-lowest)",
          color: isMine ? "var(--on-primary)" : "var(--on-surface)",
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.45 }}>{message.body}</div>
        <div
          style={{
            fontSize: 10,
            marginTop: 6,
            color: isMine ? "var(--on-primary)" : "var(--on-surface-variant)",
          }}
        >
          {message.kind === "photo_request" ? "추가요청 · " : ""}
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
