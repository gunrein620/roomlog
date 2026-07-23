"use client";

import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementScope,
  Thread,
} from "@roomlog/types";
import { Building2, CalendarDays, CircleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from "react";
import styles from "./AnnouncementListPage.module.css";

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  urgent: "긴급",
  life: "생활",
  event: "행사",
};

const SCOPE_LABELS: Record<AnnouncementScope, string> = {
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

async function responseErrorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
  return body?.message || fallback;
}

export function AnnouncementDetailDialog({
  announcement,
  onAnnouncementChange,
  onClose,
}: {
  announcement: Announcement | null;
  onAnnouncementChange: (announcement: Announcement) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"state" | "inquiry" | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (announcement && dialog && !dialog.open) dialog.showModal();
  }, [announcement]);

  useEffect(() => {
    setPendingAction(null);
    setActionError("");
  }, [announcement?.id]);

  if (!announcement) return null;

  const isUrgent = announcement.category === "urgent" || announcement.confirmRequired;
  const stateActionComplete = announcement.confirmRequired
    ? announcement.state === "confirmed"
    : announcement.state !== "unread";

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function closeOnCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  async function updateAnnouncementState() {
    if (!announcement || pendingAction || stateActionComplete) return;
    setPendingAction("state");
    setActionError("");
    const intent = announcement.confirmRequired ? "confirm" : "read";

    try {
      const response = await fetch(
        `/api/tenant/messaging/announcements/${encodeURIComponent(announcement.id)}/${intent}`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "공지 상태를 변경하지 못했습니다."));
      }
      onAnnouncementChange((await response.json()) as Announcement);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "공지 상태를 변경하지 못했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  async function createAnnouncementInquiry() {
    if (!announcement || pendingAction) return;
    setPendingAction("inquiry");
    setActionError("");

    try {
      const response = await fetch("/api/tenant/messaging/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "announcement",
          contextRef: announcement.id,
          contextLabel: `공지 문의 · ${announcement.title}`,
          body: `[${announcement.title}] 공지에 대해 문의합니다.`,
        }),
      });
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, "공지 문의를 시작하지 못했습니다."));
      }
      const thread = (await response.json()) as Thread;
      router.push(`/tenant/messaging/01?id=${encodeURIComponent(thread.id)}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "공지 문의를 시작하지 못했습니다.");
      setPendingAction(null);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.announcementDialog}
      aria-labelledby="tenant-announcement-dialog-title"
      onClick={closeOnBackdrop}
      onCancel={closeOnCancel}
      onClose={onClose}
    >
      <article className={styles.dialogSurface} aria-busy={pendingAction !== null}>
        <header className={styles.dialogHeader}>
          <div>
            <div className={styles.dialogBadges}>
              <span className={`${styles.dialogBadge} ${isUrgent ? styles.dialogBadgeUrgent : ""}`}>
                {CATEGORY_LABELS[announcement.category]}
              </span>
              <span className={styles.dialogBadge}>{SCOPE_LABELS[announcement.scope]}</span>
            </div>
            <h2 id="tenant-announcement-dialog-title">{announcement.title}</h2>
          </div>
          <button type="button" className={styles.dialogClose} aria-label="공지 상세 닫기" onClick={onClose}>
            <X aria-hidden="true" size={21} />
          </button>
        </header>

        <div className={styles.dialogBody}>
          <div className={styles.dialogMeta}>
            <span><Building2 aria-hidden="true" size={16} />{announcement.sender}</span>
            <time dateTime={announcement.sentAt}><CalendarDays aria-hidden="true" size={16} />{formatTime(announcement.sentAt)}</time>
          </div>

          <section className={styles.dialogSection} aria-labelledby="tenant-announcement-detail-heading">
            <h3 id="tenant-announcement-detail-heading">상세 내용</h3>
            <p>{announcement.body}</p>
          </section>

          {isUrgent && (
            <section className={styles.urgentPanel} aria-label="긴급 공지 확인 안내">
              <CircleAlert aria-hidden="true" size={22} />
              <div>
                <strong>{announcement.confirmRequired ? "확인이 필요한 긴급 공지" : "긴급 공지"}</strong>
                <p>{announcement.safetyCta || "내용을 확인하고 안전 안내를 따라 주세요."}</p>
              </div>
            </section>
          )}

          {announcement.originalBody && (
            <section className={styles.dialogSection} aria-labelledby="tenant-announcement-original-heading">
              <h3 id="tenant-announcement-original-heading">원문</h3>
              <p>{announcement.originalBody}</p>
            </section>
          )}

          {actionError && <p className={styles.dialogError} role="alert">{actionError}</p>}
        </div>

        <footer className={styles.dialogActions}>
          {stateActionComplete ? (
            // 이미 처리된 상태는 동작이 아니므로 버튼이 아니라 상태 표시로 보여준다.
            <span className={styles.stateDoneBadge} role="status">
              {announcement.confirmRequired ? "확인 완료" : "읽음 완료"}
            </span>
          ) : (
            <button
              type="button"
              className={styles.primaryAction}
              disabled={pendingAction !== null}
              onClick={() => void updateAnnouncementState()}
            >
              {pendingAction === "state"
                ? "처리 중..."
                : announcement.confirmRequired
                  ? "확인"
                  : "읽음"}
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={pendingAction !== null}
            onClick={() => void createAnnouncementInquiry()}
          >
            {pendingAction === "inquiry" ? "문의 준비 중..." : "이 공지 문의"}
          </button>
        </footer>
      </article>
    </dialog>
  );
}
