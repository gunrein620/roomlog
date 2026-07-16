"use client";

import type { AnnouncementDraft } from "@roomlog/types";
import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { formatDateTime } from "../messaging-date-time";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";
import styles from "./SavedAnnouncementDraftModal.module.css";

export function SavedAnnouncementDraftModal({
  drafts,
  open,
  closeHref,
}: {
  drafts: AnnouncementDraft[];
  open: boolean;
  closeHref: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const savedDrafts = selectSavedAnnouncementDrafts(drafts);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closeModal() {
    dialogRef.current?.close();
    router.replace(closeHref, { scroll: false });
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) closeModal();
  }

  function closeOnEscape(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeModal();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="manager-saved-drafts-title"
      onClick={closeOnBackdrop}
      onKeyDown={closeOnEscape}
      onCancel={(event) => {
        event.preventDefault();
        closeModal();
      }}
    >
      <section className={styles.surface} onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2 id="manager-saved-drafts-title">임시 저장된 공지</h2>
          <button type="button" aria-label="임시 저장 목록 닫기" onClick={closeModal}>
            <X aria-hidden="true" />
          </button>
        </header>
        <div className={styles.list}>
          {savedDrafts.length > 0 ? (
            savedDrafts.map((draft) => (
              <article key={draft.id} className={styles.row}>
                <div>
                  <h3>{savedAnnouncementDraftTitle(draft)}</h3>
                  <p>
                    {draft.targetLabel} · 마지막 저장 {formatDateTime(draft.updatedAt)}
                  </p>
                </div>
                <Link
                  href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(draft.id)}`}
                >
                  불러오기
                </Link>
              </article>
            ))
          ) : (
            <p className={styles.empty}>임시 저장된 공지가 없습니다.</p>
          )}
        </div>
      </section>
    </dialog>
  );
}
