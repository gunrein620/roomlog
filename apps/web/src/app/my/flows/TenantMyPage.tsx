"use client";

// 사는 집(세입자) 마이페이지 — 계약 상태, 수리요청(실제 민원 API), 관리비, 집주인 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import type {
  ChangeEvent,
  FormEvent
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Announcement, Contract, Message, Thread } from "@roomlog/types";
import { Bath, Bot, ChevronRight, FileText, ImagePlus, Megaphone, MessageCircle, Snowflake, X } from "lucide-react";
import { getRealtimeSocket } from "@/lib/realtime-client";
import {
  resolveTicketChatAttachmentUrl,
  uploadTicketChatImages,
  validateTicketChatImages
} from "@/lib/ticket-chat-attachments";
import { toTenantBillingOverview, type TeamTenantBillingOverview } from "@/lib/payment-mapping";
import {
  formatTenantLandlordUnreadCount,
  isTenantLandlordMessagingActivity,
  tenantLandlordConversationPaths,
  tenantLandlordThreadInput
} from "@/lib/tenant-landlord-conversation";
import {
  tenantBillingCardModel,
  type TenantBillingCardModel,
} from "./tenant-current-bill";
import { latestTenantAnnouncement } from "./tenant-announcement-card";
import { useTenantAiAssistant } from "./useTenantAiAssistant";
import { TenantAiAssistantPanel } from "./TenantAiAssistantPanel";
import {
  markTenantAiDraftFormOpen,
  openTenantAiAssistant,
  useTenantAiAssistantStore,
} from "./tenant-ai-assistant-store";
import {
  createTenantComplaintDraftMutationGuard,
  deleteTenantComplaintDraft,
  loadTenantComplaintDraft,
  mergeTenantComplaintDraftImageUrls,
  saveTenantComplaintDraft,
  serializeTenantComplaintDraftOccurredAt,
  type TenantComplaintDraft,
  type TenantComplaintDraftImage
} from "@/lib/tenant-complaint-draft";
import type { TenantIntakeDraft } from "@/lib/tenant-intake-api";

const EMPTY_BILLING_CARD: TenantBillingCardModel = {
  current: null,
  upcoming: null,
  previousUnpaidLabel: null,
};
const EMPTY_REQUEST_DRAFT = {
  category: "민원" as "민원" | "하자",
  title: "",
  occurredAt: "",
  description: ""
};

type TenantRequestCategory = "민원" | "하자";

type TenantContractSummary = {
  listingId?: string;
  threadId: string;
  landlordName: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  respondedAt?: string;
};

type TenantTenancy = {
  roomId: string;
  buildingName: string;
  roomNo: string;
  address: string;
  landlordId?: string;
  imageUrl?: string;
  contract: TenantContractSummary | null;
  leaseContract: Contract | null;
};

type TenantRoomOption = {
  roomId: string;
  buildingName: string;
  roomNo: string;
  address: string;
  landlordId?: string;
  landlordName?: string;
  contractId?: string;
  contractStatus?: string;
  isCurrent?: boolean;
};

type TenantListingPhotoSummary = {
  id: string;
  title?: string;
  location?: string;
  detailAddress?: string;
  images?: string[];
  coverImage?: string;
  gallery?: string[];
};

type TenantRepairRequest = {
  id: string;
  title: string;
  category: TenantRequestCategory;
  description: string;
  location?: string;
  occurredAt?: string;
  createdAt?: string;
  sourceChannel?: string;
  attachments: TenantRepairAttachment[];
  /** 서버 티켓 표시 상태(접수됨/검토중/업체 배정…) 그대로 */
  status: string;
  date?: string;
};

type TenantRepairAttachment = {
  name: string;
  url?: string;
};

type TenantComplaintMessage = {
  senderRole?: string;
  messageText?: string;
  attachmentUrls?: string[];
  createdAt?: string;
};

// 티켓 부속 정보 — presentTicket 응답 중 세입자탭 상세가 쓰는 필드만 발췌.
type TenantComplaintTicketInfo = {
  status?: string;
  priority?: number;
};

type TenantComplaintResponse = {
  id: string;
  title: string;
  roomId?: string;
  description?: string;
  location?: string;
  occurredAt?: string;
  createdAt?: string;
  sourceChannel?: string;
  displayStatus?: string;
  status?: string;
  ticket?: TenantComplaintTicketInfo;
  messages?: TenantComplaintMessage[];
};

type TenantAttachmentUploadResponse = {
  id?: string;
  fileName?: string;
  fileUrl?: string;
  url?: string;
};

type RequestImagePreview = TenantComplaintDraftImage;

type ComplaintChatImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type TenantAnnouncementState =
  | { status: "loading" | "empty" | "error"; announcement: null }
  | { status: "ready"; announcement: Announcement };

function formatTenantRequestDescription(draft: TenantIntakeDraft): string {
  const detailCategory = draft.detailCategory?.trim() || draft.category?.trim();
  const sections = [
    `[문제 내용]\n${draft.summary.trim()}`,
    detailCategory ? `[세부 유형]\n${detailCategory}` : "",
    "[요청 사항]\n관리자 확인 후 필요한 조치를 요청드립니다."
  ];

  return sections.filter(Boolean).join("\n\n");
}

// 계약 조건 한 줄 표기 — 실제 연결된 계약이 없으면 위조하지 않고 그 사실을 그대로 알린다.
function tenancyTermsLabel(contract: TenantContractSummary | null): string {
  if (!contract) return "계약 조건 정보 없음";
  const deposit = (contract.depositManwon || 0).toLocaleString("ko-KR");
  if (contract.tradeType === "월세") {
    return `보증금 ${deposit}만원 · 월세 ${(contract.monthlyRentManwon || 0).toLocaleString("ko-KR")}만원`;
  }
  return `${contract.tradeType} ${deposit}만원`;
}

function tenancyDateLabel(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")} KRW`;
}

function TenantComplaintMessageAttachments({ urls }: { urls: string[] }) {
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());

  return (
    <div className="tenant-defect-chat-attachments">
      {urls.map((url) => {
        const resolvedUrl = resolveTicketChatAttachmentUrl(url);
        const fileName = url.split(/[?#]/, 1)[0].split("/").filter(Boolean).at(-1) ?? "첨부 이미지";
        return failedUrls.has(url) ? (
          <a key={url} href={resolvedUrl} target="_blank" rel="noreferrer">{fileName}</a>
        ) : (
          <a key={url} href={resolvedUrl} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvedUrl}
              alt={`${fileName} 첨부 이미지`}
              onError={() => setFailedUrls((current) => new Set(current).add(url))}
            />
          </a>
        );
      })}
    </div>
  );
}

function formatTenantRoomTitle(buildingName: string, roomNo: string): string {
  const normalizedRoomNo = roomNo.replace(/호+$/u, "").trim();
  return `${buildingName} ${normalizedRoomNo}`.trim();
}

function billingDateLabel(iso?: string): string {
  if (!iso) return "정보 없음";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "정보 없음";

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}.${month}.${day}` : "정보 없음";
}

function contractPeriodText(contract: Contract | null): string {
  if (!contract?.startDate || !contract.endDate) return "정보 없음";
  return `${billingDateLabel(contract.startDate)} ~ ${billingDateLabel(contract.endDate)}`;
}

function repairDateLabel(iso?: string): string {
  if (!iso) return "일자 확인 중";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "일자 확인 중";
  return iso.slice(0, 10).replaceAll("-", ".");
}

// 세입자 이력은 내부 처리 단계를 노출하지 않고, 세 단계로 일관되게 안내한다.
const TENANT_REPAIR_HISTORY_TICKET_STATUS: Partial<Record<string, string>> = {
  RECEIVED: "접수",
  REVIEWING: "접수",
  ADDITIONAL_INFO_REQUESTED: "접수",
  VENDOR_ASSIGNMENT_PENDING: "접수",
  VENDOR_ASSIGNED: "접수",
  ESTIMATE_REVIEW: "접수",
  REPAIR_IN_PROGRESS: "진행중",
  COMPLETION_REPORTED: "진행중",
  COMPLETED: "완료",
};

const TENANT_REPAIR_HISTORY_DISPLAY_STATUS: Record<string, string> = {
  "진행": "접수",
  "접수됨": "접수",
  "수리중": "진행중",
  "수리 중": "진행중",
  "완료": "완료",
};

function tenantRepairHistoryStatus(item: TenantComplaintResponse): string {
  const ticketStatus = item.ticket?.status?.trim();
  if (ticketStatus) {
    const mappedTicketStatus = TENANT_REPAIR_HISTORY_TICKET_STATUS[ticketStatus];
    if (mappedTicketStatus) return mappedTicketStatus;
  }

  const rawStatus = item.displayStatus?.trim() || item.status?.trim();
  return rawStatus ? (TENANT_REPAIR_HISTORY_DISPLAY_STATUS[rawStatus] ?? rawStatus) : "접수";
}

function dateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function parseTenantRequestDescription(rawDescription?: string) {
  let text = (rawDescription ?? "").trim();
  let category: TenantRequestCategory = "민원";

  const categoryMatch = text.match(/^\[(민원|하자)\]\s*/);
  if (categoryMatch) {
    category = categoryMatch[1] as TenantRequestCategory;
    text = text.slice(categoryMatch[0].length).trim();
  }

  const attachmentNames: string[] = [];
  const bodyLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const imageLineMatch = trimmed.match(/^(첨부 이미지|.*이미지|.*吏)\s*:\s*(.+)$/);
    const hasImageFileName = /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(trimmed);
    if (imageLineMatch || (trimmed.includes(":") && hasImageFileName)) {
      const names = (imageLineMatch?.[2] ?? trimmed.split(":").slice(1).join(":"))
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      attachmentNames.push(...names);
      continue;
    }
    bodyLines.push(line);
  }

  return {
    category,
    description: bodyLines.join("\n").trim(),
    attachmentNames
  };
}

function normalizeTenantRepairRequest(item: TenantComplaintResponse): TenantRepairRequest {
  const parsedDescription = parseTenantRequestDescription(item.description);
  const attachmentUrls = (item.messages ?? [])
    .flatMap((message) => message.attachmentUrls ?? [])
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  const attachments: TenantRepairAttachment[] = [
    ...attachmentUrls.map((url) => ({ name: url.split("/").pop() || "첨부 이미지", url })),
    ...parsedDescription.attachmentNames.map((name) => ({ name }))
  ];

  return {
    id: item.id,
    title: item.title,
    category: parsedDescription.category,
    description: parsedDescription.description,
    location: item.location,
    occurredAt: item.occurredAt,
    createdAt: item.createdAt,
    sourceChannel: item.sourceChannel,
    attachments,
    status: tenantRepairHistoryStatus(item),
    date: repairDateLabel(item.createdAt)
  };
}

async function uploadTenantRequestImages(images: RequestImagePreview[]) {
  const uploadedUrls: string[] = [];

  for (const image of images) {
    if (!image.file) continue;
    const formData = new FormData();
    formData.append("file", image.file);
    formData.append("category", "COMPLAINT_PHOTO");

    const response = await fetch("/api/tenant/uploads", {
      method: "POST",
      body: formData
    });
    const data = (await response.json().catch(() => undefined)) as
      | (TenantAttachmentUploadResponse & { message?: string })
      | undefined;

    if (!response.ok) {
      throw new Error(data?.message || "이미지 업로드에 실패했습니다.");
    }

    const uploadedUrl = data?.fileUrl ?? data?.url;
    if (uploadedUrl) {
      uploadedUrls.push(uploadedUrl);
    }
  }

  return uploadedUrls;
}

function formatNumber(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

function firstListingImage(listing?: TenantListingPhotoSummary): string | undefined {
  if (!listing) return undefined;
  const candidates = [
    ...(Array.isArray(listing.images) ? listing.images : []),
    listing.coverImage,
    ...(Array.isArray(listing.gallery) ? listing.gallery : [])
  ];
  return candidates.find((image): image is string => typeof image === "string" && image.trim().length > 0);
}

function findTenantListingImage(
  listings: TenantListingPhotoSummary[],
  listingId: string | undefined,
  room: { buildingName: string; roomNo: string; address: string }
): string | undefined {
  const listing =
    listings.find((item) => item.id === listingId) ??
    listings.find((item) => {
      const detailAddress = item.detailAddress ?? "";
      return (
        item.title === room.buildingName ||
        item.location === room.address ||
        detailAddress.includes(room.roomNo) ||
        `${item.location ?? ""} ${detailAddress}`.includes(room.address)
      );
    });

  return firstListingImage(listing);
}

function TenantFloorPlanPreview({
  imageUrl,
  title
}: {
  imageUrl?: string;
  title: string;
}) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [imageUrl]);

  if (imageUrl && !imageLoadFailed) {
    return (
      <div className="tenant-floorplan-card tenant-residence-photo-card" aria-label="입주 매물 사진">
        <img
          className="tenant-residence-photo"
          src={imageUrl}
          alt={`${title} 매물 사진`}
          onError={() => setImageLoadFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="tenant-floorplan-card tenant-residence-empty-card" role="status" aria-live="polite">
      <strong>이미지를 불러올 수 없습니다</strong>
      <span>
        {imageUrl
          ? "매물 이미지 주소가 만료되었거나 파일을 불러오지 못했습니다."
          : "등록된 매물 이미지가 없습니다."}
      </span>
    </div>
  );
}

function TenantLandlordChatModal({
  thread,
  draft,
  isSending,
  latestAnnouncement,
  onDraftChange,
  onClose,
  onSubmit
}: {
  thread: Thread;
  draft: string;
  isSending: boolean;
  latestAnnouncement: Announcement | null;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const messages = thread.messages ?? [];
  const unitLabel = compactTenantThreadUnit(thread.unitId);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageStreamRef = useRef<HTMLDivElement>(null);
  const [isNoticeOpen, setIsNoticeOpen] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id]);

  useEffect(() => {
    const stream = messageStreamRef.current;
    if (!stream) return;
    stream.scrollTo({ top: stream.scrollHeight, behavior: "smooth" });
  }, [thread.id, messages.length]);

  const modal = (
    <div className="tenant-chat-backdrop" role="presentation" onClick={onClose}>
      <section
        className="tenant-landlord-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tenant-landlord-chat-title"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tenant-chat-modal-head">
          <button type="button" onClick={onClose} aria-label="채팅 닫기">
            <X size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <div>
            <h2 id="tenant-landlord-chat-title">관리인</h2>
            <p>{unitLabel ? `${unitLabel} · ${thread.contextLabel ?? "일반 문의"}` : thread.contextLabel ?? "일반 문의"}</p>
          </div>
        </header>

        {latestAnnouncement ? (
          <section className="tenant-chat-modal-notice" aria-label="최근 공지사항">
            <button type="button" onClick={() => setIsNoticeOpen((open) => !open)} aria-expanded={isNoticeOpen}>
              <Megaphone size={18} strokeWidth={2.4} aria-hidden="true" />
              <span>{latestAnnouncement.title}</span>
              <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </button>
            {isNoticeOpen ? (
              <div className="tenant-chat-modal-notice-detail">
                <strong>최근 공지</strong>
                <p>{latestAnnouncement.body}</p>
                <small>
                  {latestAnnouncement.sender} · {tenancyDateLabel(latestAnnouncement.sentAt)}
                </small>
              </div>
            ) : null}
          </section>
        ) : null}

        <main ref={messageStreamRef} className="tenant-chat-modal-stream" aria-label="메시지 타임라인">
          {messages.length > 0 ? (
            messages.map((message) => <TenantChatMessageBubble key={message.id} message={message} />)
          ) : (
            <div className="tenant-chat-modal-empty" aria-hidden="true" />
          )}
        </main>

        <form className="tenant-chat-modal-compose" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="메시지를 입력하세요"
            autoComplete="off"
            onClick={(event) => event.stopPropagation()}
          />
          <button type="submit" disabled={!draft.trim() || isSending}>
            {isSending ? "전송 중" : "보내기"}
          </button>
        </form>
      </section>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

function TenantChatMessageBubble({ message }: { message: Message }) {
  const isMine = message.sender === "tenant";
  return (
    <article className={isMine ? "tenant-chat-message mine" : "tenant-chat-message"}>
      <div className="tenant-chat-bubble">
        <p>{message.body}</p>
        <time>{formatTenantMessageTime(message.createdAt)}</time>
      </div>
    </article>
  );
}

async function fetchTenantMessageThread(threadId: string): Promise<Thread> {
  const response = await fetch(tenantLandlordConversationPaths.thread(threadId), {
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "대화를 불러오지 못했습니다.");
  }
  return payload as Thread;
}

async function markTenantLandlordThreadRead(threadId: string): Promise<Thread> {
  const response = await fetch(tenantLandlordConversationPaths.read(threadId), {
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "읽음 상태를 저장하지 못했습니다.");
  }
  return payload as Thread;
}

async function sendTenantMessageToThread(threadId: string, body: string): Promise<Thread> {
  const response = await fetch(`/api/tenant/messaging/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "메시지를 보내지 못했습니다.");
  }
  return payload as Thread;
}

function formatTenantMessageTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function compactTenantThreadUnit(unitId: string): string {
  return unitId.replace(/\s*호$/u, "").trim();
}

export default function TenantMyPage({
  onGoInquiry,
  onGoHome
}: {
  onGoInquiry: () => void;
  onGoHome: () => void;
}) {
  // 이 계정에 실제로 연결된 집 — 없으면 null(연결 안내), 확인 전엔 "loading".
  // 하드코딩된 매물 정보를 보여주던 자리를 실제 계약 데이터로 교체한다(위조 금지).
  const [tenancy, setTenancy] = useState<TenantTenancy | null | "loading">("loading");
  const [tenantRooms, setTenantRooms] = useState<TenantRoomOption[]>([]);
  const [selectedTenantRoomId, setSelectedTenantRoomId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        if (!meRes.ok) {
          if (!cancelled) setTenancy(null);
          return;
        }
        const me = (await meRes.json()) as {
          userId?: string;
          room?: { id?: string; buildingName: string; roomNo: string; address: string; landlordId?: string };
        };
        if (!me.userId || !me.room) {
          if (!cancelled) setTenancy(null);
          return;
        }

        let roomOptions: TenantRoomOption[] = [];
        try {
          const roomsRes = await fetch("/api/tenant/rooms", { cache: "no-store" });
          if (roomsRes.ok) {
            const rooms = (await roomsRes.json()) as TenantRoomOption[];
            if (Array.isArray(rooms)) {
              roomOptions = rooms.filter((room) => room.roomId);
            }
          }
        } catch {
          roomOptions = [];
        }

        const fallbackRoom: TenantRoomOption = {
          roomId: me.room.id || `${me.room.buildingName}-${me.room.roomNo}`,
          buildingName: me.room.buildingName,
          roomNo: me.room.roomNo,
          address: me.room.address,
          landlordId: me.room.landlordId,
          isCurrent: true
        };
        if (roomOptions.length === 0) {
          roomOptions = [fallbackRoom];
        }

        const storedRoomId =
          typeof window !== "undefined" ? window.localStorage.getItem("woozuTenantRoomId") : "";
        const selectedRoom =
          roomOptions.find((room) => room.roomId === selectedTenantRoomId) ??
          roomOptions.find((room) => room.roomId === storedRoomId) ??
          roomOptions.find((room) => room.isCurrent) ??
          roomOptions[0];

        if (!selectedRoom) {
          if (!cancelled) {
            setTenantRooms([]);
            setTenancy(null);
          }
          return;
        }

        if (!cancelled) {
          setTenantRooms(roomOptions);
          if (selectedTenantRoomId !== selectedRoom.roomId) {
            setSelectedTenantRoomId(selectedRoom.roomId);
          }
          window.localStorage.setItem("woozuTenantRoomId", selectedRoom.roomId);
        }

        let contract: TenantContractSummary | null = null;
        let leaseContract: Contract | null = null;
        let residenceImageUrl: string | undefined;
        try {
          const contractsRes = await fetch("/api/trade/contracts", { cache: "no-store" });
          if (contractsRes.ok) {
            const contracts = (await contractsRes.json()) as Array<{
              tenantId: string;
              landlordId: string;
              landlordName: string;
              status: string;
              listingId?: string;
              threadId: string;
              tradeType: "월세" | "전세" | "매매";
              depositManwon: number;
              monthlyRentManwon: number;
              respondedAt?: string;
            }>;
            const accepted = contracts.find(
              (item) =>
                item.tenantId === me.userId &&
                item.status === "accepted" &&
                item.landlordId === selectedRoom.landlordId
            );
            if (accepted) {
              contract = {
                listingId: accepted.listingId,
                threadId: accepted.threadId,
                landlordName: accepted.landlordName,
                tradeType: accepted.tradeType,
                depositManwon: accepted.depositManwon,
                monthlyRentManwon: accepted.monthlyRentManwon,
                respondedAt: accepted.respondedAt
              };

              try {
                const listingsRes = await fetch("/api/trade/listings", { cache: "no-store" });
                if (listingsRes.ok) {
                  const listings = (await listingsRes.json()) as TenantListingPhotoSummary[];
                  if (Array.isArray(listings)) {
                    residenceImageUrl = findTenantListingImage(listings, accepted.listingId, selectedRoom);
                  }
                }
              } catch {
                residenceImageUrl = undefined;
              }
            }
          }
        } catch {
          // 계약 상세 조회 실패 — 방 정보만으로도 표시는 이어간다
        }

        try {
          const leaseRes = await fetch(
            `/api/tenant/current-contract?roomId=${encodeURIComponent(selectedRoom.roomId)}`,
            { cache: "no-store" }
          );
          if (leaseRes.ok) {
            leaseContract = (await leaseRes.json()) as Contract | null;
          }
        } catch {
          leaseContract = null;
        }

        if (!cancelled) {
          setTenancy({
            roomId: selectedRoom.roomId,
            buildingName: selectedRoom.buildingName,
            roomNo: selectedRoom.roomNo,
            address: selectedRoom.address,
            landlordId: selectedRoom.landlordId,
            imageUrl: residenceImageUrl,
            contract,
            leaseContract
          });
        }
      } catch {
        if (!cancelled) setTenancy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTenantRoomId]);

  const [announcementState, setAnnouncementState] = useState<TenantAnnouncementState>({
    status: "loading",
    announcement: null,
  });

  useEffect(() => {
    if (!selectedTenantRoomId && tenancy !== "loading") {
      setAnnouncementState({ status: "empty", announcement: null });
    }
  }, [selectedTenantRoomId, tenancy]);

  useEffect(() => {
    if (!selectedTenantRoomId) return;

    let cancelled = false;
    let requestVersion = 0;

    const loadAnnouncements = async () => {
      const currentRequest = ++requestVersion;

      try {
        const response = await fetch(
          `/api/tenant/messaging/announcements?roomId=${encodeURIComponent(selectedTenantRoomId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("공지 조회 실패");

        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("공지 응답 형식 오류");

        const latest = latestTenantAnnouncement(payload as Announcement[]);
        if (cancelled || currentRequest !== requestVersion) return;

        setAnnouncementState(
          latest
            ? { status: "ready", announcement: latest }
            : { status: "empty", announcement: null },
        );
      } catch {
        if (cancelled || currentRequest !== requestVersion) return;

        setAnnouncementState((current) =>
          current.status === "ready"
            ? current
            : { status: "error", announcement: null },
        );
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadAnnouncements();
    };
    const socket = getRealtimeSocket();

    setAnnouncementState({ status: "loading", announcement: null });
    void loadAnnouncements();
    socket.on("roomlog:activity", loadAnnouncements);
    window.addEventListener("focus", loadAnnouncements);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      socket.off("roomlog:activity", loadAnnouncements);
      window.removeEventListener("focus", loadAnnouncements);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [selectedTenantRoomId]);

  const [repairRequests, setRepairRequests] = useState<TenantRepairRequest[]>([]);

  // 접수 내역은 서버가 진실 — 새로고침해도 남고, 관리인이 상태를 바꾸면 여기 라벨도 따라온다.
  // 신규 접수 직후에도 같은 로더를 다시 불러 서버 상태를 그대로 반영한다.
  const loadRepairRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant/complaints", { cache: "no-store" });
      if (!res.ok) return; // 비로그인/집 미연결 — 빈 목록 유지
      const complaints = (await res.json()) as TenantComplaintResponse[];
      if (!Array.isArray(complaints)) return;
      setRepairRequests(
        complaints
          .slice()
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
          .map(normalizeTenantRepairRequest)
      );
    } catch {
      // 일시 오류 — 접수 시점에 다시 채워진다
    }
  }, []);

  useEffect(() => {
    void loadRepairRequests();
  }, [loadRepairRequests]);

  useEffect(() => {
    const refreshRepairRequests = (payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "kind" in payload &&
        payload.kind === "ticket"
      ) {
        void loadRepairRequests();
      }
    };
    // 관리인 레인 변경은 목록 배지에도 반영돼야 한다.
    const reloadRepairRequests = () => {
      void loadRepairRequests();
    };
    const socket = getRealtimeSocket();
    socket.on("roomlog:activity", refreshRepairRequests);
    socket.on("roomlog:ticket-lane", reloadRepairRequests);

    return () => {
      socket.off("roomlog:activity", refreshRepairRequests);
      socket.off("roomlog:ticket-lane", reloadRepairRequests);
    };
  }, [loadRepairRequests]);
  const [billingCard, setBillingCard] = useState<TenantBillingCardModel>(EMPTY_BILLING_CARD);
  const [isBillLoading, setIsBillLoading] = useState(true);
  const [billingError, setBillingError] = useState(false);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);
  const [isLandlordConversationLoading, setIsLandlordConversationLoading] = useState(false);
  const [landlordUnreadCount, setLandlordUnreadCount] = useState(0);
  const [landlordChatThread, setLandlordChatThread] = useState<Thread | null>(null);
  const [landlordChatDraft, setLandlordChatDraft] = useState("");
  const [isLandlordMessageSending, setIsLandlordMessageSending] = useState(false);
  const [isRequestSheetOpen, setIsRequestSheetOpen] = useState(false);
  const [savedRequestDraft, setSavedRequestDraft] = useState<TenantComplaintDraft | null>(null);
  const [requestDraft, setRequestDraft] = useState(EMPTY_REQUEST_DRAFT);
  const [requestImages, setRequestImages] = useState<RequestImagePreview[]>([]);
  const requestImagesRef = useRef<RequestImagePreview[]>([]);
  const requestDraftMutationGuardRef = useRef(createTenantComplaintDraftMutationGuard());
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoadingRequestDraft, setIsLoadingRequestDraft] = useState(false);
  const [isSavingRequestDraft, setIsSavingRequestDraft] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [selectedRepairRequest, setSelectedRepairRequest] = useState<TenantRepairRequest | null>(null);
  const returnedComplaintOpenedRef = useRef(false);
  const [repairDetailError, setRepairDetailError] = useState("");
  const [selectedComplaintDetail, setSelectedComplaintDetail] = useState<TenantComplaintResponse | null>(null);
  const [complaintChatDraft, setComplaintChatDraft] = useState("");
  const [complaintChatImages, setComplaintChatImages] = useState<ComplaintChatImage[]>([]);
  const complaintChatImagesRef = useRef<ComplaintChatImage[]>([]);
  const [isSendingComplaintMessage, setIsSendingComplaintMessage] = useState(false);
  const [requestUrgency, setRequestUrgency] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [requestAvailableTimes, setRequestAvailableTimes] = useState("");
  const tenantAiSession = useTenantAiAssistantStore();
  const [tenantToast, setTenantToast] = useState("");

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
  };

  const loadLandlordUnreadCount = useCallback(async (roomId: string): Promise<number> => {
    const conversationResponse = await fetch(tenantLandlordConversationPaths.current(roomId), {
      cache: "no-store"
    });
    const conversation = await conversationResponse.json().catch(() => ({}));
    if (!conversationResponse.ok) {
      throw new Error(conversation?.message || "대화 정보를 불러오지 못했습니다.");
    }
    if (!conversation?.threadId) return 0;

    const thread = await fetchTenantMessageThread(String(conversation.threadId));
    const count = Number(thread.unreadCount);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  }, []);

  useEffect(() => {
    if (!selectedTenantRoomId) {
      setLandlordUnreadCount(0);
      return;
    }

    let cancelled = false;
    const refreshUnreadCount = async () => {
      try {
        const count = await loadLandlordUnreadCount(selectedTenantRoomId);
        if (!cancelled) setLandlordUnreadCount(count);
      } catch {
        // 문의 버튼은 유지하고 다음 실시간·포커스 갱신 때 다시 시도한다.
      }
    };
    const refreshMessagingActivity = (payload: unknown) => {
      if (isTenantLandlordMessagingActivity(payload)) void refreshUnreadCount();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnreadCount();
    };
    const socket = getRealtimeSocket();

    setLandlordUnreadCount(0);
    void refreshUnreadCount();
    socket.on("roomlog:activity", refreshMessagingActivity);
    window.addEventListener("focus", refreshUnreadCount);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      socket.off("roomlog:activity", refreshMessagingActivity);
      window.removeEventListener("focus", refreshUnreadCount);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadLandlordUnreadCount, selectedTenantRoomId]);

  useEffect(() => {
    let cancelled = false;
    setSavedRequestDraft(null);
    if (!selectedTenantRoomId) return () => {
      cancelled = true;
    };

    void loadTenantComplaintDraft(selectedTenantRoomId)
      .then((draft) => {
        if (!cancelled) setSavedRequestDraft(draft);
      })
      .catch(() => {
        if (!cancelled) setSavedRequestDraft(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTenantRoomId]);

  // AI 생활 도우미 — 실제 민원 intake 세션(텍스트·음성)에 연결. 접수되면 민원 이력이 갱신된다.
  const ai = useTenantAiAssistant({
    roomId: tenancy && tenancy !== "loading" ? tenancy.roomId : undefined,
    onComplaintFiled: () => {
      showToast("민원/하자 요청이 접수되었습니다.");
      void loadRepairRequests();
    }
  });

  const openLandlordConversation = async () => {
    if (!tenancy || tenancy === "loading") {
      showToast("입주 연결이 완료되면 임대인에게 문의할 수 있습니다.");
      return;
    }

    setIsLandlordConversationLoading(true);
    try {
      const response = await fetch(tenantLandlordConversationPaths.current(tenancy.roomId), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "대화 정보를 불러오지 못했습니다.");
      }

      let thread: Thread | null = null;
      if (payload?.threadId) {
        thread = await fetchTenantMessageThread(String(payload.threadId));
        if (thread.unreadCount > 0) {
          try {
            thread = await markTenantLandlordThreadRead(thread.id);
            setLandlordUnreadCount(0);
          } catch {
            // 메시지는 보여주되 서버 읽음 처리 실패 시 배지는 유지한다.
          }
        }
      } else {
        const createResponse = await fetch(tenantLandlordConversationPaths.threads(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tenantLandlordThreadInput("", tenancy.roomId))
        });
        const created = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok) {
          throw new Error(created?.message || "대화를 시작하지 못했습니다.");
        }
        thread = created as Thread;
        setLandlordUnreadCount(0);
      }

      if (!thread?.id) {
        throw new Error("대화 스레드를 만들지 못했습니다.");
      }

      setLandlordChatThread(thread);
      setLandlordChatDraft("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "대화를 시작하지 못했습니다.");
    } finally {
      setIsLandlordConversationLoading(false);
    }
  };

  const closeLandlordChat = () => {
    setLandlordChatThread(null);
    setLandlordChatDraft("");
  };

  useEffect(() => {
    const threadId = landlordChatThread?.id;
    if (!threadId) return;

    let cancelled = false;
    const refreshOpenLandlordConversation = (payload: unknown) => {
      if (!isTenantLandlordMessagingActivity(payload)) return;

      void fetchTenantMessageThread(threadId)
        .then((thread) => {
          if (!cancelled) {
            setLandlordChatThread((current) => (current?.id === threadId ? thread : current));
          }
        })
        .catch(() => {
          // 연결이 잠시 끊겨도 열린 대화는 유지하고 다음 소켓 이벤트에서 재시도한다.
        });
    };
    const socket = getRealtimeSocket();
    socket.on("roomlog:activity", refreshOpenLandlordConversation);

    return () => {
      cancelled = true;
      socket.off("roomlog:activity", refreshOpenLandlordConversation);
    };
  }, [landlordChatThread?.id]);

  const handleLandlordMessageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = landlordChatDraft.trim();
    if (!landlordChatThread || !body || isLandlordMessageSending) return;

    setIsLandlordMessageSending(true);
    try {
      const nextThread = await sendTenantMessageToThread(landlordChatThread.id, body);
      setLandlordChatThread(nextThread);
      setLandlordChatDraft("");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      setIsLandlordMessageSending(false);
    }
  };
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsBillLoading(true);
      setBillingError(false);
      try {
        const response = await fetch("/api/tenant/bills/overview", { cache: "no-store" });
        if (!response.ok) throw new Error("청구 조회 실패");
        const overview = (await response.json()) as TeamTenantBillingOverview;
        if (!cancelled) {
          setBillingCard(tenantBillingCardModel(toTenantBillingOverview(overview)));
          setBillingError(false);
        }
      } catch {
        if (!cancelled) {
          setBillingCard(EMPTY_BILLING_CARD);
          setBillingError(true);
        }
      } finally {
        if (!cancelled) setIsBillLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 연결된 집이 없으면 특정 임대인/금액을 지어내지 않고 그 사실 자체를 한 행으로 보여준다.
  const contractRows: Array<[string, string]> =
    tenancy && tenancy !== "loading"
      ? [
          ["집 주소", formatTenantRoomTitle(tenancy.buildingName, tenancy.roomNo)],
          ["상세 주소", tenancy.address || "미등록"],
          ["임대인", tenancy.leaseContract?.landlordName ?? tenancy.contract?.landlordName ?? "정보 없음"],
          ["거래 유형", tenancy.contract?.tradeType ?? "정보 없음"],
          [
            "보증금",
            tenancy.contract ? `${(tenancy.contract.depositManwon || 0).toLocaleString("ko-KR")}만원` : "정보 없음"
          ],
          [
            "월세",
            tenancy.leaseContract?.monthlyRent !== undefined
              ? formatKrw(tenancy.leaseContract.monthlyRent)
              : tenancy.contract && tenancy.contract.tradeType === "월세"
                ? `${(tenancy.contract.monthlyRentManwon || 0).toLocaleString("ko-KR")}만원`
                : "정보 없음"
          ],
          [
            "관리비",
            tenancy.leaseContract?.maintenanceFee !== undefined
              ? formatKrw(tenancy.leaseContract.maintenanceFee)
              : "정보 없음"
          ],
          [
            "납부일",
            tenancy.leaseContract?.paymentDay
              ? `매월 ${tenancy.leaseContract.paymentDay}일`
              : "정보 없음"
          ],
          ["계약 기간", contractPeriodText(tenancy.leaseContract)],
          ["체결일", tenancy.contract?.respondedAt ? tenancyDateLabel(tenancy.contract.respondedAt) : "정보 없음"]
        ]
      : [["안내", "아직 연결된 집이 없습니다. 계약이 체결되면 이 자리에 실제 계약 정보가 표시됩니다."]];
  const tenantRoomTitle =
    tenancy === "loading"
      ? "입주 정보 확인 중"
      : tenancy
        ? formatTenantRoomTitle(tenancy.buildingName, tenancy.roomNo)
        : "연결된 집이 없습니다";
  const tenantAddress =
    tenancy === "loading"
      ? "연결된 집 정보를 불러오고 있습니다."
      : tenancy
        ? tenancy.address || "상세 주소 미등록"
        : "계약이 체결되면 입주 주소가 표시됩니다.";
  const residenceBilling = billingCard.current ?? billingCard.upcoming;
  const nextPaymentBilling = billingCard.current?.isPaid
    ? billingCard.upcoming
    : residenceBilling;
  const leaseContract = tenancy && tenancy !== "loading" ? tenancy.leaseContract : null;
  const monthlyRentKrw = leaseContract?.monthlyRent ?? residenceBilling?.rentAmount ?? null;
  const maintenanceFeeKrw = leaseContract?.maintenanceFee ?? residenceBilling?.maintenanceAmount ?? null;
  const residenceAmountLabel = (amount: number | null) =>
    tenancy === "loading" || (amount === null && isBillLoading)
      ? "확인 중"
      : amount === null
        ? "정보 없음"
        : formatKrw(amount);
  const nextPaymentDateLabel = nextPaymentBilling?.dueDate
    ? billingDateLabel(nextPaymentBilling.dueDate)
    : isBillLoading && !leaseContract?.paymentDay
      ? "확인 중"
      : leaseContract?.paymentDay
        ? `청구 전 · 매월 ${leaseContract.paymentDay}일`
        : "정보 없음";
  const contractPeriodLabel =
    tenancy === "loading"
      ? "확인 중"
      : leaseContract?.startDate && leaseContract.endDate
        ? contractPeriodText(leaseContract)
        : tenancy?.contract?.respondedAt
          ? `${tenancyDateLabel(tenancy.contract.respondedAt)} 체결`
          : "정보 없음";
  // 서버 접수 내역이 진실 — 비어 있으면 데모를 지어내지 않고 빈 상태를 그대로 보여준다.
  const repairHistory = repairRequests.slice(0, 4).map((item, index) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    date: item.date ?? "일자 확인 중",
    request: item,
    Icon: index % 2 === 0 ? Snowflake : Bath,
    tone: index % 2 === 0 ? "warm" : "neutral"
  }));
  const announcementStatusMessage =
    announcementState.status === "loading"
      ? "공지사항을 확인하고 있습니다."
      : announcementState.status === "error"
        ? "공지사항을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        : "임대인으로부터 전달된 새로운 소식이 없습니다.";
  const detailTicket = selectedComplaintDetail?.ticket;
  const detailStatusLabel = selectedComplaintDetail
    ? tenantRepairHistoryStatus(selectedComplaintDetail)
    : selectedRepairRequest?.status ?? "";
  const detailMessages = (selectedComplaintDetail?.messages ?? []).filter(
    (message) =>
      (message.messageText ?? "").trim().length > 0 || (message.attachmentUrls?.length ?? 0) > 0
  );
  const isTicketClosed = detailTicket?.status === "COMPLETED" || detailTicket?.status === "CANCELLED";

  const openNewRequestSheet = () => {
    markTenantAiDraftFormOpen(false);
    setRequestError("");
    setRequestDraft(EMPTY_REQUEST_DRAFT);
    // 긴급도·방문 가능 시간은 임시저장에 포함되지 않는 즉석 입력 — 새 작성은 항상 빈 값에서 시작한다.
    setRequestUrgency(undefined);
    setRequestAvailableTimes("");
    clearRequestImages();
    setIsLoadingRequestDraft(false);
    setIsRequestSheetOpen(true);
  };

  const openSavedRequestSheet = () => {
    if (!savedRequestDraft) return;
    markTenantAiDraftFormOpen(false);
    setRequestError("");
    setRequestDraft({
      category: savedRequestDraft.category,
      title: savedRequestDraft.title,
      occurredAt: savedRequestDraft.occurredAt ? dateTimeLocalValue(savedRequestDraft.occurredAt) : "",
      description: savedRequestDraft.description
    });
    // 임시저장엔 긴급도·방문 가능 시간이 없으므로 이전 세션 값이 새어들지 않게 초기화.
    setRequestUrgency(undefined);
    setRequestAvailableTimes("");
    clearRequestImages();
    setRequestImages(savedRequestDraft.attachmentUrls.map((url) => ({
      id: `draft-image-${crypto.randomUUID()}`,
      url,
      uploadedUrl: url
    })));
    setIsLoadingRequestDraft(false);
    setIsRequestSheetOpen(true);
  };

  const openRepairDetailSheet = async (request: TenantRepairRequest) => {
    setSelectedRepairRequest(request);
    setSelectedComplaintDetail(null);
    setRepairDetailError("");

    try {
      const res = await fetch(`/api/tenant/complaints/${encodeURIComponent(request.id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("민원/하자 상세 조회 실패");
      const detail = (await res.json()) as TenantComplaintResponse;
      setSelectedComplaintDetail(detail);
      setSelectedRepairRequest(normalizeTenantRepairRequest(detail));
    } catch {
      setRepairDetailError("상세 내용을 불러오지 못했습니다. 목록에 남아있는 접수 정보만 표시합니다.");
    }
  };

  // 상세 시트가 열려 있는 동안 업체·관리자 새 메시지를 실시간 반영.
  // 관리자 답변은 roomlog:ticket-message로 오고, 레인 변경은 roomlog:ticket-lane으로 온다.
  // 세입자 상세 조회는 인메모리 스토어를 읽으므로 여기서는 다시 읽어도 밀리지 않는다.
  useEffect(() => {
    const complaintId = selectedRepairRequest?.id;
    if (!complaintId) return;

    const onTicketEvent = () => {
      void refreshComplaintDetail(complaintId);
    };
    const socket = getRealtimeSocket();
    socket.on("roomlog:ticket-message", onTicketEvent);
    socket.on("roomlog:ticket-lane", onTicketEvent);
    return () => {
      socket.off("roomlog:ticket-message", onTicketEvent);
      socket.off("roomlog:ticket-lane", onTicketEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepairRequest?.id]);

  // 새 메시지와 실시간 상태를 다시 읽어 상세 시트를 최신으로 맞춘다. 실패 시 기존 표시 유지.
  const refreshComplaintDetail = async (complaintId: string) => {
    try {
      const res = await fetch(`/api/tenant/complaints/${encodeURIComponent(complaintId)}`, { cache: "no-store" });
      if (!res.ok) return;
      const detail = (await res.json()) as TenantComplaintResponse;
      setSelectedComplaintDetail(detail);
      setSelectedRepairRequest(normalizeTenantRepairRequest(detail));
    } catch {
      // 새로고침 실패는 치명적이지 않다 — 다음 열람 때 다시 읽는다.
    }
  };

  const handleSendComplaintMessage = async () => {
    if (!selectedRepairRequest || isSendingComplaintMessage) return;
    const messageText = complaintChatDraft.trim();
    if (!messageText && complaintChatImages.length === 0) return;
    setIsSendingComplaintMessage(true);
    setRepairDetailError("");
    try {
      const attachmentUrls = await uploadTicketChatImages(complaintChatImages.map((image) => image.file));
      const res = await fetch(
        `/api/tenant/complaints/${encodeURIComponent(selectedRepairRequest.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageText, attachmentUrls })
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
        throw new Error(data?.message || "메시지를 보내지 못했습니다.");
      }
      setComplaintChatDraft("");
      clearComplaintChatImages();
      await refreshComplaintDetail(selectedRepairRequest.id);
    } catch (error) {
      setRepairDetailError(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
    } finally {
      setIsSendingComplaintMessage(false);
    }
  };

  const handleComplaintChatImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const validationError = validateTicketChatImages(files, complaintChatImages.length);
    if (validationError) {
      setRepairDetailError(validationError);
      return;
    }

    setRepairDetailError("");
    setComplaintChatImages((current) => [
      ...current,
      ...files.map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }))
    ]);
  };

  const removeComplaintChatImage = (imageId: string) => {
    setComplaintChatImages((current) => {
      const removed = current.find((image) => image.id === imageId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== imageId);
    });
  };

  useEffect(() => {
    if (returnedComplaintOpenedRef.current || repairRequests.length === 0) return;
    const returnedComplaintId = new URLSearchParams(window.location.search).get("complaintId");
    if (!returnedComplaintId) {
      returnedComplaintOpenedRef.current = true;
      return;
    }
    const returnedRequest = repairRequests.find((request) => request.id === returnedComplaintId);
    if (!returnedRequest) return;
    returnedComplaintOpenedRef.current = true;
    void openRepairDetailSheet(returnedRequest);
  }, [repairRequests]);

  const closeRepairDetailSheet = () => {
    setSelectedRepairRequest(null);
    setSelectedComplaintDetail(null);
    setComplaintChatDraft("");
    clearComplaintChatImages();
    setRepairDetailError("");
  };

  useEffect(() => {
    complaintChatImagesRef.current = complaintChatImages;
  }, [complaintChatImages]);

  useEffect(() => () => {
    complaintChatImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const clearComplaintChatImages = () => {
    complaintChatImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    complaintChatImagesRef.current = [];
    setComplaintChatImages([]);
  };

  useEffect(() => {
    requestImagesRef.current = requestImages;
  }, [requestImages]);

  useEffect(() => {
    return () => {
      requestImagesRef.current.forEach((image) => {
        if (image.file) URL.revokeObjectURL(image.url);
      });
    };
  }, []);

  const clearRequestImages = () => {
    requestImagesRef.current.forEach((image) => {
      if (image.file) URL.revokeObjectURL(image.url);
    });
    requestImagesRef.current = [];
    setRequestImages([]);
  };

  useEffect(() => {
    const draft = ai.draftForRequest;
    if (!draft) return;

    const isDefect = draft.category === "하자" || /누수|곰팡이|벽지|바닥|에어컨|보일러|도어락/.test(
      draft.detailCategory ?? ""
    );
    setRequestError("");
    setRequestDraft({
      category: isDefect ? "하자" : "민원",
      title: draft.title,
      occurredAt: draft.occurredAt ? dateTimeLocalValue(draft.occurredAt) : "",
      description: formatTenantRequestDescription(draft)
    });
    setRequestUrgency(draft.priority && [1, 2, 3, 4].includes(draft.priority) ? draft.priority as 1 | 2 | 3 | 4 : undefined);
    setRequestAvailableTimes(draft.availableTimes ?? "");
    clearRequestImages();
    setIsLoadingRequestDraft(false);
    setIsRequestSheetOpen(true);
    markTenantAiDraftFormOpen(true);
    ai.consumeDraftForRequest();
  }, [ai.draftForRequest]);

  const closeRequestSheet = (resetDraft = false) => {
    markTenantAiDraftFormOpen(false);
    setIsLoadingRequestDraft(false);
    setIsRequestSheetOpen(false);
    setRequestError("");
    if (resetDraft) {
      setRequestDraft(EMPTY_REQUEST_DRAFT);
      setRequestUrgency(undefined);
      setRequestAvailableTimes("");
      clearRequestImages();
    }
  };

  const handleRequestImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (selectedFiles.length === 0) return;

    setRequestImages((current) => {
      const remainingSlots = Math.max(0, 6 - current.length);
      const nextImages = selectedFiles.slice(0, remainingSlots).map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        url: URL.createObjectURL(file)
      }));
      return [...current, ...nextImages];
    });
    event.target.value = "";
  };

  const removeRequestImage = (imageId: string) => {
    setRequestImages((current) => {
      const target = current.find((image) => image.id === imageId);
      if (target?.file) URL.revokeObjectURL(target.url);
      return current.filter((image) => image.id !== imageId);
    });
  };

  const handleRequestDraftSave = async () => {
    setRequestError("");
    if (!selectedTenantRoomId || isSavingRequestDraft) return;
    const mutationToken = requestDraftMutationGuardRef.current.tryBegin("save");
    if (!mutationToken) return;
    setIsSavingRequestDraft(true);
    try {
      const uploadedUrls = await uploadTenantRequestImages(requestImages);
      const attachmentUrls = mergeTenantComplaintDraftImageUrls(requestImages, uploadedUrls);
      const saved = await saveTenantComplaintDraft({
        roomId: selectedTenantRoomId,
        category: requestDraft.category,
        title: requestDraft.title,
        occurredAt: serializeTenantComplaintDraftOccurredAt(requestDraft.occurredAt),
        description: requestDraft.description,
        attachmentUrls
      });
      setSavedRequestDraft(saved);
      clearRequestImages();
      setRequestImages(saved.attachmentUrls.map((url) => ({
        id: `draft-image-${crypto.randomUUID()}`,
        url,
        uploadedUrl: url
      })));
      markTenantAiDraftFormOpen(false);
      setIsRequestSheetOpen(false);
      showToast("민원/하자 요청이 임시 저장되었습니다.");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "민원/하자 요청을 임시 저장하지 못했습니다.");
    } finally {
      setIsSavingRequestDraft(false);
      requestDraftMutationGuardRef.current.end(mutationToken);
    }
  };

  const handleRequestCancel = async () => {
    setRequestError("");
    if (!selectedTenantRoomId || isSavingRequestDraft) return;
    const mutationToken = requestDraftMutationGuardRef.current.tryBegin("delete");
    if (!mutationToken) return;
    setIsSavingRequestDraft(true);
    try {
      await deleteTenantComplaintDraft(selectedTenantRoomId);
      setSavedRequestDraft(null);
      closeRequestSheet(true);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "임시 저장 내용을 삭제하지 못했습니다.");
    } finally {
      setIsSavingRequestDraft(false);
      requestDraftMutationGuardRef.current.end(mutationToken);
    }
  };

  // 신규 민원/하자 접수 — 실제 민원 API(POST /tenant/complaints)로 보내 관리자 대시보드와 연결된다.
  const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRequest || isLoadingRequestDraft || isSavingRequestDraft) return;
    const mutationToken = requestDraftMutationGuardRef.current.tryBegin("submit");
    if (!mutationToken) return;
    setIsSubmittingRequest(true);
    setRequestError("");
    try {
      const uploadedUrls = await uploadTenantRequestImages(requestImages);
      const attachmentUrls = mergeTenantComplaintDraftImageUrls(requestImages, uploadedUrls);
      const stagedDraft = await saveTenantComplaintDraft({
        roomId: selectedTenantRoomId,
        category: requestDraft.category,
        title: requestDraft.title,
        occurredAt: serializeTenantComplaintDraftOccurredAt(requestDraft.occurredAt),
        description: requestDraft.description,
        attachmentUrls
      });
      setSavedRequestDraft(stagedDraft);
      const requestSubmissionId = stagedDraft.id;
      clearRequestImages();
      setRequestImages(stagedDraft.attachmentUrls.map((url) => ({
        id: `draft-image-${crypto.randomUUID()}`,
        url,
        uploadedUrl: url
      })));
      const res = await fetch("/api/tenant/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: selectedTenantRoomId,
          clientRequestId: requestSubmissionId,
          attachmentUrls,
          title: requestDraft.title.trim(),
          location: tenantRoomTitle,
          occurredAt: requestDraft.occurredAt ? new Date(requestDraft.occurredAt).toISOString() : undefined,
          ...(requestUrgency ? { urgency: requestUrgency } : {}),
          ...(requestAvailableTimes.trim() ? { availableTimes: requestAvailableTimes.trim() } : {}),
          description: [
            `[${requestDraft.category}]`,
            requestDraft.description.trim()
          ].filter(Boolean).join("\n\n")
        })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
        setRequestError(data?.message || "요청을 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setSavedRequestDraft(null);
      markTenantAiDraftFormOpen(false);
      setIsRequestSheetOpen(false);
      setRequestDraft(EMPTY_REQUEST_DRAFT);
      setRequestUrgency(undefined);
      setRequestAvailableTimes("");
      clearRequestImages();
      showToast("민원/하자 요청이 접수되었습니다.");
      void loadRepairRequests();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmittingRequest(false);
      requestDraftMutationGuardRef.current.end(mutationToken);
    }
  };

  const openAiAssistant = () => {
    openTenantAiAssistant();
    void ai.startTextSession();
  };

  const returnToAiConversation = () => {
    closeRequestSheet();
    openTenantAiAssistant();
  };

  const landlordUnreadBadge = formatTenantLandlordUnreadCount(landlordUnreadCount);
  const landlordInquiryLabel = landlordUnreadCount > 0
    ? `임대인에게 문의하기, 미확인 메시지 ${landlordUnreadCount}개`
    : "임대인에게 문의하기";

  return (
    <div
      className={[
        "tenant-ai-workspace",
        tenantAiSession.open ? "tenant-ai-workspace--open" : "",
        tenantAiSession.draftFormOpen ? "tenant-ai-workspace--draft" : "",
      ].filter(Boolean).join(" ")}
    >
      <section className="screen tenant-screen tenant-portal-screen" id="my-page" aria-labelledby="tenant-title">
      <h2 id="tenant-title" className="visually-hidden">세입자 마이페이지</h2>

      {tenantToast ? <p className="mypage-toast" role="status">{tenantToast}</p> : null}

      <section className="tenant-announcement-card" aria-label="집주인 공지사항">
        {announcementState.status === "ready" ? (
          <Link href="/tenant/messaging/02" className="tenant-announcement-link">
            <div className="tenant-card-icon" aria-hidden="true">
              <Megaphone size={28} strokeWidth={2.5} />
            </div>
            <div>
              <span>집주인 공지사항</span>
              <h3>{announcementState.announcement.title}</h3>
              <p>{announcementState.announcement.body}</p>
              <small>
                {announcementState.announcement.sender} · {tenancyDateLabel(announcementState.announcement.sentAt)}
              </small>
            </div>
            <Megaphone className="tenant-announcement-watermark" size={128} strokeWidth={2.1} aria-hidden="true" />
          </Link>
        ) : (
          <>
            <div className="tenant-card-icon" aria-hidden="true">
              <Megaphone size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h3>집주인 공지사항</h3>
              <p>{announcementStatusMessage}</p>
            </div>
            <Megaphone className="tenant-announcement-watermark" size={128} strokeWidth={2.1} aria-hidden="true" />
          </>
        )}
      </section>

      <section className="tenant-residence-card" aria-label="입주 정보">
        <div className="tenant-residence-media">
          {tenantRooms.length > 0 && tenancy && tenancy !== "loading" ? (
            <label className="tenant-room-select">
              <span>집 선택</span>
              <select
                value={selectedTenantRoomId || tenancy.roomId}
                onChange={(event) => setSelectedTenantRoomId(event.currentTarget.value)}
              >
                {tenantRooms.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {formatTenantRoomTitle(room.buildingName, room.roomNo)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <TenantFloorPlanPreview
            imageUrl={tenancy && tenancy !== "loading" ? tenancy.imageUrl : undefined}
            title={tenantRoomTitle}
          />
        </div>
        <div className="tenant-residence-details">
          <span className="tenant-pill">입주 정보</span>
          <h3>{tenantRoomTitle}</h3>
          <p>{tenantAddress}</p>
          <dl className="tenant-residence-meta">
            <div>
              <dt>계약 기간</dt>
              <dd>{contractPeriodLabel}</dd>
            </div>
            <div>
              <dt>차기 결제일</dt>
              <dd>{nextPaymentDateLabel}</dd>
            </div>
            <div>
              <dt>월세</dt>
              <dd className="tenant-primary-value">{residenceAmountLabel(monthlyRentKrw)}</dd>
            </div>
            <div>
              <dt>관리비</dt>
              <dd>{residenceAmountLabel(maintenanceFeeKrw)}</dd>
            </div>
          </dl>
          <div className="tenant-residence-actions">
            <button className="tenant-primary-button" type="button" onClick={() => setIsContractSheetOpen(true)}>
              <FileText size={18} strokeWidth={2.5} aria-hidden="true" />
              임대차 계약서 보기
            </button>
            <button
              className="tenant-secondary-button"
              type="button"
              onClick={() => void openLandlordConversation()}
              disabled={isLandlordConversationLoading}
              aria-label={landlordInquiryLabel}
            >
              <MessageCircle size={18} strokeWidth={2.5} aria-hidden="true" />
              {isLandlordConversationLoading ? "문의 확인 중..." : "임대인에게 문의하기"}
              {landlordUnreadBadge ? (
                <span className="tenant-landlord-unread-badge" aria-hidden="true">
                  {landlordUnreadBadge}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </section>

      <section className="tenant-history-card" aria-label="민원/하자 이력">
        <header className="tenant-section-head">
          <h3>민원/하자 이력</h3>
          <div className="tenant-section-actions">
            {savedRequestDraft ? (
              <button type="button" onClick={openSavedRequestSheet}>
                임시 저장
              </button>
            ) : null}
            <button type="button" onClick={openNewRequestSheet}>
              신규 요청하기
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </header>
        <div className="tenant-history-list">
          {repairHistory.map((item, index) => {
            const ItemIcon = item.Icon;
            return (
              <button className="tenant-history-row" type="button" key={item.id} onClick={() => openRepairDetailSheet(item.request)}>
                <span className={`tenant-history-icon ${item.tone}`} aria-hidden="true">
                  <ItemIcon size={20} strokeWidth={2.4} />
                </span>
                <span className="tenant-history-copy">
                  <strong>{index + 1}. {item.title}</strong>
                  <small>{item.status} · {item.date}</small>
                </span>
                <ChevronRight size={24} strokeWidth={2.2} aria-hidden="true" />
              </button>
            );
          })}
          {repairHistory.length === 0 ? (
            <p className="tenant-history-empty">
              접수된 민원/하자가 없습니다. 불편한 점이 생기면 신규 요청하기로 알려주세요.
            </p>
          ) : null}
        </div>
      </section>

      <section id="monthly-payment" className="tenant-payment-card" aria-label="이번 달 합계">
        {isBillLoading ? (
          <div className="tenant-payment-content">
            <h3>이번 달 합계</h3>
            <p className="tenant-payment-empty">청구 확인 중</p>
          </div>
        ) : billingError ? (
          <div className="tenant-payment-content" role="alert">
            <h3>이번 달 합계</h3>
            <p className="tenant-payment-empty">청구 정보를 불러오지 못했어요</p>
          </div>
        ) : billingCard.current ? (
          <div className="tenant-payment-content">
            <h3>이번 달 합계</h3>
            <div className="tenant-payment-total">
              <strong>{formatNumber(billingCard.current.totalAmount)}</strong>
              <span>KRW</span>
            </div>
            <dl className="tenant-payment-breakdown">
              <div>
                <dt>기본 월세</dt>
                <dd>{formatNumber(billingCard.current.rentAmount)}</dd>
              </div>
              <div>
                <dt>고정 관리비</dt>
                <dd>{formatNumber(billingCard.current.maintenanceAmount)}</dd>
              </div>
              <div>
                <dt>납부 상태</dt>
                <dd>{billingCard.current.stateLabel}</dd>
              </div>
            </dl>
            <Link className="tenant-payment-button" href={billingCard.current.actionHref}>
              {billingCard.current.actionLabel}
            </Link>
          </div>
        ) : (
          <div className="tenant-payment-content">
            <h3>이번 달 합계</h3>
            <p className="tenant-payment-empty">이번 달 청구가 없어요</p>
          </div>
        )}
        {billingCard.previousUnpaidLabel ? (
          <Link href="/tenant/payment/00?view=previous" className="tenant-payment-previous">
            {billingCard.previousUnpaidLabel}
          </Link>
        ) : null}
        {billingCard.upcoming ? (
          <Link
            href={billingCard.upcoming.actionHref}
            className="tenant-payment-upcoming"
            aria-label="다음 결제 예정 상세"
          >
            <strong>{billingCard.upcoming.monthLabel} 청구 예정</strong>
            <span>{billingCard.upcoming.amountLabel}</span>
            <small>{billingCard.upcoming.availabilityLabel}</small>
          </Link>
        ) : null}
        <div className="tenant-payment-watermark" aria-hidden="true" />
      </section>

      <button
        className="tenant-ai-assist-button"
        type="button"
        onClick={openAiAssistant}
        aria-label="AI 생활 도우미 열기"
        aria-controls="tenant-ai-assistant-panel"
        aria-expanded={tenantAiSession.open}
      >
        <Bot size={30} strokeWidth={2.3} aria-hidden="true" />
      </button>

      {landlordChatThread ? (
        <TenantLandlordChatModal
          thread={landlordChatThread}
          draft={landlordChatDraft}
          isSending={isLandlordMessageSending}
          latestAnnouncement={announcementState.status === "ready" ? announcementState.announcement : null}
          onDraftChange={setLandlordChatDraft}
          onClose={closeLandlordChat}
          onSubmit={handleLandlordMessageSubmit}
        />
      ) : null}

      {isContractSheetOpen ? (
        <div className="notification-sheet-backdrop" role="presentation" onClick={() => setIsContractSheetOpen(false)}>
          <section
            className="notification-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contract-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>전자 계약서</span>
                <h2 id="contract-sheet-title">
                  {tenancy && tenancy !== "loading"
                    ? formatTenantRoomTitle(tenancy.buildingName, tenancy.roomNo)
                    : "연결된 집 없음"}
                </h2>
                <p>
                  {tenancy && tenancy !== "loading" && tenancy.contract?.respondedAt
                    ? `${tenancyDateLabel(tenancy.contract.respondedAt)} 체결 · 임대차 표준계약서`
                    : "계약이 체결되면 체결일이 여기에 표시됩니다."}
                </p>
              </div>
              <button type="button" onClick={() => setIsContractSheetOpen(false)} aria-label="계약서 닫기">×</button>
            </header>

            <dl className="detail-info-table contract-sheet-table">
              {contractRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <button className="notification-action" type="button" onClick={() => setIsContractSheetOpen(false)}>
              확인
            </button>
          </section>
        </div>
      ) : null}

      {selectedRepairRequest ? (
        <div className="notification-sheet-backdrop tenant-request-detail-backdrop" role="presentation" onClick={closeRepairDetailSheet}>
          <section
            className="notification-sheet tenant-request-sheet tenant-request-detail-sheet tenant-request-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-request-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>민원/하자 접수 내용</span>
                <h2 id="tenant-request-detail-title">{selectedRepairRequest.title}</h2>
                {selectedRepairRequest.sourceChannel === "MANAGER_PROXY" ? (
                  <span className="tenant-manager-proxy-badge">관리자 대리 접수</span>
                ) : null}
              </div>
              <button type="button" onClick={closeRepairDetailSheet} aria-label="접수 내용 닫기">
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </header>

            {repairDetailError ? <p className="tenant-request-error" role="alert">{repairDetailError}</p> : null}

            <div className="tenant-request-form tenant-request-detail-form">
              {detailTicket ? (
                <section className="tenant-defect-progress" aria-label="처리 상태">
                  <div className="tenant-defect-progress-head">
                    <strong>{detailStatusLabel}</strong>
                    {typeof detailTicket.priority === "number" ? (
                      <span className="tenant-defect-chip">긴급도 {detailTicket.priority}</span>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {detailTicket ? (
                <section className="tenant-defect-messages" aria-label="진행 메시지">
                  <strong>진행 메시지</strong>
                  <ul>
                    {detailMessages.length === 0 ? (
                      <li className="tenant-defect-message-empty">
                        <p>아직 진행 메시지가 없습니다.</p>
                      </li>
                    ) : (
                      /* CSS column-reverse와 짝: 역순 렌더로 최신이 항상 하단·스크롤 고정 */
                      [...detailMessages].reverse().map((message, index) => {
                          const senderLabel =
                            message.senderRole === "TENANT"
                              ? "나"
                              : message.senderRole === "LANDLORD"
                                ? "관리자"
                                : message.senderRole === "VENDOR"
                                  ? "업체"
                                  : "시스템";
                          return (
                            <li key={`${message.createdAt ?? index}-${index}`} data-sender={message.senderRole ?? "SYSTEM"}>
                              <span>{senderLabel}</span>
                              {message.messageText?.trim() ? <p>{message.messageText}</p> : null}
                              {message.attachmentUrls?.length ? (
                                <TenantComplaintMessageAttachments urls={message.attachmentUrls} />
                              ) : null}
                            </li>
                          );
                        })
                    )}
                  </ul>
                  {!isTicketClosed ? (
                    <div className="tenant-defect-chat-composer">
                      {complaintChatImages.length > 0 ? (
                        <div className="tenant-defect-chat-selected" aria-label="선택한 사진">
                          {complaintChatImages.map((image) => (
                            <figure key={image.id}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={image.previewUrl} alt={image.file.name} />
                              <button type="button" aria-label={`${image.file.name} 삭제`} onClick={() => removeComplaintChatImage(image.id)}>
                                <X aria-hidden="true" />
                              </button>
                            </figure>
                          ))}
                        </div>
                      ) : null}
                      <div className="tenant-defect-chat-input">
                        <label className="tenant-defect-chat-attach" aria-label="사진 첨부">
                          <ImagePlus aria-hidden="true" />
                          <input type="file" accept="image/*" multiple onChange={handleComplaintChatImageChange} />
                        </label>
                        <input
                          type="text"
                          value={complaintChatDraft}
                          onChange={(event) => setComplaintChatDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              void handleSendComplaintMessage();
                            }
                          }}
                          maxLength={500}
                          placeholder="관리자에게 메시지 보내기"
                          aria-label="진행 메시지 입력"
                        />
                        <button
                          type="button"
                          disabled={isSendingComplaintMessage || !(complaintChatDraft.trim().length > 0 || complaintChatImages.length > 0)}
                          onClick={() => void handleSendComplaintMessage()}
                        >
                          {isSendingComplaintMessage ? "전송 중" : "보내기"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

            </div>
          </section>
        </div>
      ) : null}

      {isRequestSheetOpen ? (
        <div className="notification-sheet-backdrop" role="presentation" onClick={() => closeRequestSheet()}>
          <section
            className="notification-sheet tenant-request-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-request-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>민원/하자 신규 요청</span>
                <h2 id="tenant-request-sheet-title">어떤 불편이 있으신가요?</h2>
                <p>접수하면 관리자에게 바로 전달되고, 처리 상태를 이 화면에서 확인할 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => closeRequestSheet()} aria-label="신규 요청 닫기">×</button>
            </header>

            <form className="tenant-request-form" onSubmit={handleRequestSubmit}>
              {tenantAiSession.draftFormOpen ? (
                <div className="tenant-ai-draft-banner">
                  <span>
                    <Bot aria-hidden="true" />
                    <strong>AI가 작성한 초안</strong>
                    <small>
                      대화 내용을 바탕으로 정리했어요. 확인 후 바로 수정하거나 사진을 추가할 수 있습니다.
                    </small>
                  </span>
                  <button type="button" onClick={returnToAiConversation}>
                    AI 대화로 돌아가기
                  </button>
                </div>
              ) : null}
              <div className="tenant-request-type-toggle" role="group" aria-label="요청 유형">
                {(["민원", "하자"] as const).map((category) => (
                  <button
                    key={category}
                    className={requestDraft.category === category ? "active" : ""}
                    type="button"
                    onClick={() => setRequestDraft((draft) => ({ ...draft, category }))}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="tenant-request-row">
                <label className="tenant-request-title-field">
                  <span>제목</span>
                  <input
                    type="text"
                    value={requestDraft.title}
                    onChange={(event) => setRequestDraft((draft) => ({ ...draft, title: event.target.value }))}
                    placeholder="제목"
                    maxLength={80}
                    required
                  />
                </label>
                <label className="tenant-request-date-field">
                  <span>발생일시</span>
                  <input
                    type="datetime-local"
                    value={requestDraft.occurredAt}
                    onChange={(event) => setRequestDraft((draft) => ({ ...draft, occurredAt: event.target.value }))}
                  />
                </label>
              </div>

              <label className="tenant-request-body-field">
                <span>본문 내용</span>
                <textarea
                  value={requestDraft.description}
                  onChange={(event) => setRequestDraft((draft) => ({ ...draft, description: event.target.value }))}
                  placeholder="본문 내용"
                  rows={6}
                  maxLength={1000}
                  required
                />
              </label>

              <div className="tenant-request-urgency" role="group" aria-label="긴급도 (선택)">
                <span>긴급도 (선택)</span>
                <div className="tenant-request-type-toggle">
                  {([
                    [1, "1 즉시"],
                    [2, "2 빠른 처리"],
                    [3, "3 일반"],
                    [4, "4 문의성"]
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      className={requestUrgency === value ? "active" : ""}
                      type="button"
                      onClick={() => setRequestUrgency((current) => (current === value ? undefined : value))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="tenant-request-title-field">
                <span>방문 가능 시간 (선택)</span>
                <input
                  type="text"
                  value={requestAvailableTimes}
                  maxLength={200}
                  placeholder="예: 평일 18시 이후, 주말 오전"
                  onChange={(event) => setRequestAvailableTimes(event.target.value)}
                />
              </label>

              <div className="tenant-request-image-strip" aria-label="이미지 첨부">
                <label className="tenant-request-image-input">
                  <ImagePlus size={24} strokeWidth={2.4} aria-hidden="true" />
                  <span className="tenant-sr-only">이미지 첨부</span>
                  <input type="file" accept="image/*" multiple onChange={handleRequestImageChange} />
                </label>
                {requestImages.map((image) => (
                  <div className="tenant-request-image-preview" key={image.id}>
                    <img src={image.url} alt={`${image.file?.name ?? "저장된 이미지"} 미리보기`} />
                    <button type="button" onClick={() => removeRequestImage(image.id)} aria-label={`${image.file?.name ?? "저장된 이미지"} 제거`}>
                      <X size={14} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 2 - requestImages.length) }).map((_, index) => (
                  <div className="tenant-request-image-placeholder" key={`request-placeholder-${index}`} aria-hidden="true" />
                ))}
              </div>
              {requestError ? <p className="tenant-request-error" role="alert">{requestError}</p> : null}
              <div className="tenant-request-actions">
                <button type="button" onClick={() => void handleRequestCancel()} disabled={isLoadingRequestDraft || isSavingRequestDraft || isSubmittingRequest}>
                  취소
                </button>
                <button type="button" onClick={() => void handleRequestDraftSave()} disabled={isLoadingRequestDraft || isSavingRequestDraft || isSubmittingRequest}>
                  {isSavingRequestDraft ? "저장 중" : "임시 저장"}
                </button>
                <button className="primary" type="submit" disabled={isSubmittingRequest || isLoadingRequestDraft || isSavingRequestDraft}>
                  {isSubmittingRequest ? "접수 중" : "요청 접수"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      </section>
      {tenantAiSession.open ? (
        <TenantAiAssistantPanel
          ai={ai}
          onComplaintRefresh={() => void loadRepairRequests()}
        />
      ) : null}
    </div>
  );
}
