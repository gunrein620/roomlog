import Link from "next/link";
import { redirect } from "next/navigation";
import type { Message, Thread } from "@roomlog/types";
import { MessagingPhoneFrame } from "../MessagingPhoneFrame";
import { MessageAutoRefresh } from "@/app/_components/MessageAutoRefresh";
import { addTenantThreadMessage, getThread } from "@/lib/messaging-api";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";
import { ApiError } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

async function sendTenantMessage(formData: FormData) {
  "use server";

  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!threadId) {
    redirect(MESSAGING_ROUTES["T-MSG-00"]);
  }

  if (body) {
    await addTenantThreadMessage(threadId, { body });
  }

  redirect(`${MESSAGING_ROUTES["T-MSG-01"]}?id=${encodeURIComponent(threadId)}`);
}

async function getRequiredThread(id: string): Promise<Thread> {
  try {
    return await getThread(id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/tenant/login");
    }
    if (error instanceof ApiError && error.status === 404) {
      redirect(MESSAGING_ROUTES["T-MSG-00"]);
    }
    throw error;
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  if (!id) {
    redirect(MESSAGING_ROUTES["T-MSG-00"]);
  }

  const thread = await getRequiredThread(id);
  const messages = thread.messages ?? [];
  const pendingMessage = messages.find((message) => message.kind === "photo_request");

  return (
    <MessagingPhoneFrame>
      <MessageAutoRefresh intervalMs={3000} />
      <header className="tenant-chat-header">
        <Link href={MESSAGING_ROUTES["T-MSG-00"]} aria-label="대화 목록으로" className="tenant-chat-back">
          ←
        </Link>
        <div className="tenant-chat-title">
          <strong>관리인</strong>
          <span>
            {thread.unitId} · {thread.contextLabel ?? "일반 문의"}
          </span>
        </div>
        <Link href={MESSAGING_ROUTES["T-MSG-00"]} className="tenant-chat-list-link">
          목록
        </Link>
      </header>

      <main className="tenant-chat-body">
        <section className="tenant-chat-context" aria-label="대화 정보">
          <span>{thread.contextLabel ?? "일반 문의"}</span>
          <strong>관리인 · {thread.unitId}</strong>
        </section>

        {pendingMessage ? (
          <section className="tenant-chat-request" aria-label="추가 요청">
            <div>
              <strong>추가 요청 답변 대기</strong>
              <p>{pendingMessage.body}</p>
            </div>
            <span>하자 기록 반영</span>
          </section>
        ) : null}

        <section className="tenant-chat-stream" aria-label="메시지 타임라인">
          {messages.length > 0 ? (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          ) : (
            <div className="tenant-chat-empty" aria-hidden="true" />
          )}
        </section>
      </main>

      <form action={sendTenantMessage} className="tenant-chat-compose">
        <input type="hidden" name="threadId" value={thread.id} />
        <input name="body" aria-label="메시지 입력" placeholder="메시지를 입력하세요" autoComplete="off" />
        <button type="submit">보내기</button>
      </form>
    </MessagingPhoneFrame>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isMine = message.sender === "tenant";
  return (
    <article className={isMine ? "tenant-chat-message mine" : "tenant-chat-message"}>
      <div className="tenant-chat-bubble">
        <p>{message.body}</p>
        <time>
          {message.kind === "photo_request" ? "추가 요청 · " : ""}
          {formatTime(message.createdAt)}
        </time>
      </div>
    </article>
  );
}
