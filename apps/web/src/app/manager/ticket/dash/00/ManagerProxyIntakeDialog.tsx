"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ManagerProxyIntakeInput,
  ManagerProxyIntakeRoom,
} from "@/lib/ticket-manager-api";
import { createManagerProxyIntakeAction } from "./actions";
import {
  buildManagerProxyIntakePayload,
  createProxyIntakeClientRequestId,
  nextProxyIntakeFocusIndex,
  resolveProxyIntakeUploadUrl,
  uploadProxyIntakeFiles,
} from "./proxy-intake-behavior";
import styles from "./proxy-intake.module.css";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type AttachmentUploadResponse = {
  fileUrl?: string;
  url?: string;
  message?: string;
};

async function uploadProxyIntakePhoto(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "COMPLAINT_PHOTO");
  const response = await fetch("/api/tenant/uploads", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json().catch(() => undefined)) as
    | AttachmentUploadResponse
    | undefined;

  if (!response.ok) {
    throw new Error(data?.message || "이미지 업로드에 실패했습니다.");
  }
  return resolveProxyIntakeUploadUrl(data);
}

export function ManagerProxyIntakeDialog({
  rooms,
  onClose,
}: {
  rooms: readonly ManagerProxyIntakeRoom[];
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLSelectElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const uploadedAttachmentUrlsRef = useRef<string[] | null>(null);
  const [clientRequestId] = useState(createProxyIntakeClientRequestId);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId],
  );

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  function close() {
    if (!submitting) onClose();
  }

  function changeRoom(roomId: string) {
    setSelectedRoomId(roomId);
    setSelectedTenantId("");
    setError("");
  }

  function changePhotos(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    setPhotos(selected.slice(0, 6));
    uploadedAttachmentUrlsRef.current = null;
    setError(selected.length > 6 ? "사진은 최대 6장까지 첨부할 수 있습니다." : "");
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const targetIndex = nextProxyIntakeFocusIndex(
      activeElement ? focusable.indexOf(activeElement) : -1,
      focusable.length,
      event.shiftKey,
    );
    const target = targetIndex === undefined ? undefined : focusable[targetIndex];
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const input = buildManagerProxyIntakePayload({
        room: selectedRoom,
        selectedTenantId,
        clientRequestId,
        fields: {
          title: String(formData.get("title") ?? ""),
          description: String(formData.get("description") ?? ""),
          location: String(formData.get("location") ?? ""),
          occurredAt: String(formData.get("occurredAt") ?? ""),
          availableTimes: String(formData.get("availableTimes") ?? ""),
          urgency: Number(formData.get("urgency")) as 1 | 2 | 3 | 4,
          reportedVia: String(
            formData.get("reportedVia") ?? "phone",
          ) as NonNullable<ManagerProxyIntakeInput["reportedVia"]>,
        },
      });
      const attachmentUrls = await uploadProxyIntakeFiles(
        photos,
        uploadedAttachmentUrlsRef.current ?? [],
        uploadProxyIntakePhoto,
        (urls) => {
          uploadedAttachmentUrlsRef.current = [...urls];
        },
      );
      uploadedAttachmentUrlsRef.current = attachmentUrls;
      const result = await createManagerProxyIntakeAction({
        ...input,
        attachmentUrls,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      onClose();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "대리 접수를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="proxy-intake-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className={styles.modalHeader}>
          <div>
            <h3 id="proxy-intake-title">관리자 대리 접수</h3>
            <p>전화·문자·대면으로 전달받은 하자를 세입자 이력에 투명하게 등록합니다.</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="대리 접수 닫기"
            disabled={submitting}
            onClick={close}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form ref={formRef} className={styles.form} onSubmit={submit}>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {rooms.length === 0 ? (
            <p className={styles.tenantError} role="status">
              대리 접수 가능한 호실이 없습니다.
            </p>
          ) : null}

          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.full}`}>
              <span>호실 선택</span>
              <select
                ref={initialFocusRef}
                className={styles.select}
                name="roomId"
                value={selectedRoomId}
                onChange={(event) => changeRoom(event.target.value)}
                required
              >
                <option value="">호실을 선택해 주세요</option>
                {rooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.buildingName} · {room.unitLabel}
                    {room.hasTenant ? "" : " · 연결된 세입자가 없는 호실"}
                  </option>
                ))}
              </select>
            </label>

            {selectedRoom?.tenants.length === 1 ? (
              <p className={`${styles.tenantInfo} ${styles.full}`}>
                연결 세입자 <strong>{selectedRoom.tenants[0]?.name}</strong>님에게 자동 귀속됩니다.
              </p>
            ) : null}
            {selectedRoom && selectedRoom.tenants.length > 1 ? (
              <label className={`${styles.field} ${styles.full}`}>
                <span>연결 세입자</span>
                <select
                  className={styles.select}
                  name="tenantId"
                  value={selectedTenantId}
                  onChange={(event) => setSelectedTenantId(event.target.value)}
                  required
                >
                  <option value="">세입자를 선택해 주세요</option>
                  {selectedRoom.tenants.map((tenant) => (
                    <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {selectedRoom && selectedRoom.tenants.length === 0 ? (
              <p className={`${styles.tenantError} ${styles.full}`}>
                연결된 세입자가 없는 호실입니다.
              </p>
            ) : null}

            <label className={`${styles.field} ${styles.full}`}>
              <span>제목</span>
              <input className={styles.input} name="title" required maxLength={100} />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              <span>내용</span>
              <textarea className={styles.textarea} name="description" required maxLength={2000} />
            </label>
            <label className={styles.field}>
              <span>위치</span>
              <input className={styles.input} name="location" placeholder="예: 욕실 천장" required maxLength={100} />
            </label>
            <label className={styles.field}>
              <span>발생시점</span>
              <input className={styles.input} type="datetime-local" name="occurredAt" />
            </label>

            <fieldset className={`${styles.fieldset} ${styles.full}`}>
              <legend>긴급도</legend>
              <div className={styles.toggleRow}>
                <label className={styles.toggleOption}><input type="radio" name="urgency" value={1} />1 · 긴급</label>
                <label className={styles.toggleOption}><input type="radio" name="urgency" value={2} />2 · 높음</label>
                <label className={styles.toggleOption}><input type="radio" name="urgency" value={3} defaultChecked />3 · 보통</label>
                <label className={styles.toggleOption}><input type="radio" name="urgency" value={4} />4 · 낮음</label>
              </div>
            </fieldset>

            <label className={`${styles.field} ${styles.full}`}>
              <span>방문 가능 시간</span>
              <input className={styles.input} name="availableTimes" placeholder="예: 평일 오후 6시 이후" maxLength={200} />
            </label>

            <fieldset className={`${styles.fieldset} ${styles.full}`}>
              <legend>접수 경로</legend>
              <div className={styles.toggleRow}>
                <label className={styles.toggleOption}><input type="radio" name="reportedVia" value="phone" defaultChecked />전화</label>
                <label className={styles.toggleOption}><input type="radio" name="reportedVia" value="text" />문자</label>
                <label className={styles.toggleOption}><input type="radio" name="reportedVia" value="in_person" />대면</label>
                <label className={styles.toggleOption}><input type="radio" name="reportedVia" value="other" />기타</label>
              </div>
            </fieldset>

            <label className={`${styles.field} ${styles.full}`}>
              <span>사진 첨부</span>
              <input
                className={styles.fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={changePhotos}
              />
              <small className={styles.fileSummary}>
                {photos.length > 0
                  ? `${photos.length}장 선택됨 · 최대 6장`
                  : "최대 6장까지 첨부할 수 있습니다."}
              </small>
            </label>
          </div>

          <footer className={styles.actions}>
            <button type="button" className={styles.cancelButton} disabled={submitting} onClick={close}>취소</button>
            <button type="submit" className={styles.submitButton} disabled={submitting || rooms.length === 0}>
              {submitting ? "접수 중…" : "대리 접수 등록"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
