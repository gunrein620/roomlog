"use client";

// 사는 집(세입자) 마이페이지 — 계약 상태, 수리요청(실제 민원 API), 관리비, 집주인 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import type { ChangeEvent, FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Announcement } from "@roomlog/types";
import { Bath, Bot, ChevronRight, FileText, Headphones, ImagePlus, Megaphone, MessageCircle, MessageSquare, Send, Snowflake, X } from "lucide-react";
import { TradeChatCenter } from "@/app/_components/TradeChatCenter";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { toTenantBillingOverview, type TeamTenantBillingOverview } from "@/lib/payment-mapping";
import {
  tenantBillingCardModel,
  type TenantBillingCardModel,
} from "./tenant-current-bill";
import { latestTenantAnnouncement } from "./tenant-announcement-card";

const TENANT_AI_GREETING = "안녕하세요! 우주(Woo-zu) AI 어시스턴트입니다. 무엇을 도와드릴까요?";
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
  buildingName: string;
  roomNo: string;
  address: string;
  imageUrl?: string;
  contract: TenantContractSummary | null;
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
  messageText?: string;
  attachmentUrls?: string[];
};

type TenantComplaintResponse = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  occurredAt?: string;
  createdAt?: string;
  displayStatus?: string;
  status?: string;
  messages?: TenantComplaintMessage[];
};

type TenantComplaintCreateResponse = {
  complaint?: TenantComplaintResponse;
};

type TenantAttachmentUploadResponse = {
  id?: string;
  fileName?: string;
  fileUrl?: string;
  url?: string;
};

type RequestImagePreview = {
  id: string;
  file: File;
  url: string;
};

type TenantAnnouncementState =
  | { status: "loading" | "empty" | "error"; announcement: null }
  | { status: "ready"; announcement: Announcement };

type TenantAiMode = "text" | "call";
type TenantAiStage = "choose" | "text" | "voice";

type TenantAiMessage = {
  id: string;
  sender: "assistant" | "tenant";
  text: string;
};

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

function repairDateLabel(iso?: string): string {
  if (!iso) return "일자 확인 중";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "일자 확인 중";
  return iso.slice(0, 10).replaceAll("-", ".");
}

function repairDateTimeLabel(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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
    attachments,
    status: item.displayStatus ?? item.status ?? "접수됨",
    date: repairDateLabel(item.createdAt)
  };
}

async function uploadTenantRequestImages(images: RequestImagePreview[]) {
  const uploadedUrls: string[] = [];

  for (const image of images) {
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
          room?: { buildingName: string; roomNo: string; address: string; landlordId?: string };
        };
        if (!me.userId || !me.room) {
          if (!cancelled) setTenancy(null);
          return;
        }

        let contract: TenantContractSummary | null = null;
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
                item.landlordId === me.room?.landlordId
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
                    residenceImageUrl = findTenantListingImage(listings, accepted.listingId, me.room);
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

        if (!cancelled) {
          setTenancy({
            buildingName: me.room.buildingName,
            roomNo: me.room.roomNo,
            address: me.room.address,
            imageUrl: residenceImageUrl,
            contract
          });
        }
      } catch {
        if (!cancelled) setTenancy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [announcementState, setAnnouncementState] = useState<TenantAnnouncementState>({
    status: "loading",
    announcement: null,
  });

  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;

    const loadAnnouncements = async () => {
      const currentRequest = ++requestVersion;

      try {
        const response = await fetch("/api/tenant/messaging/announcements", { cache: "no-store" });
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
  }, []);

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
  const [billingCard, setBillingCard] = useState<TenantBillingCardModel>(EMPTY_BILLING_CARD);
  const [isBillLoading, setIsBillLoading] = useState(true);
  const [billingError, setBillingError] = useState(false);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);
  const [isLandlordChatOpen, setIsLandlordChatOpen] = useState(false);
  const [isRequestSheetOpen, setIsRequestSheetOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState(EMPTY_REQUEST_DRAFT);
  const [requestImages, setRequestImages] = useState<RequestImagePreview[]>([]);
  const requestImagesRef = useRef<RequestImagePreview[]>([]);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [selectedRepairRequest, setSelectedRepairRequest] = useState<TenantRepairRequest | null>(null);
  const [isRepairDetailLoading, setIsRepairDetailLoading] = useState(false);
  const [repairDetailError, setRepairDetailError] = useState("");
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiStage, setAiStage] = useState<TenantAiStage>("choose");
  const [aiMode, setAiMode] = useState<TenantAiMode>("text");
  const [aiDraft, setAiDraft] = useState("");
  const [aiMessages, setAiMessages] = useState<TenantAiMessage[]>([
    { id: "tenant-ai-welcome", sender: "assistant", text: TENANT_AI_GREETING }
  ]);
  const [tenantToast, setTenantToast] = useState("");

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
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
          ["집 주소", `${tenancy.buildingName} ${tenancy.roomNo}호`],
          ["상세 주소", tenancy.address || "미등록"],
          ["임대인", tenancy.contract?.landlordName ?? "정보 없음"],
          ["거래 유형", tenancy.contract?.tradeType ?? "정보 없음"],
          [
            "보증금",
            tenancy.contract ? `${(tenancy.contract.depositManwon || 0).toLocaleString("ko-KR")}만원` : "정보 없음"
          ],
          [
            "월세",
            tenancy.contract && tenancy.contract.tradeType === "월세"
              ? `${(tenancy.contract.monthlyRentManwon || 0).toLocaleString("ko-KR")}만원`
              : "-"
          ],
          ["체결일", tenancy.contract?.respondedAt ? tenancyDateLabel(tenancy.contract.respondedAt) : "정보 없음"]
        ]
      : [["안내", "아직 연결된 집이 없습니다. 계약이 체결되면 이 자리에 실제 계약 정보가 표시됩니다."]];
  const contractThreadId = tenancy && tenancy !== "loading" ? tenancy.contract?.threadId ?? "" : "";
  const landlordChatTitle = tenancy && tenancy !== "loading" && tenancy.contract?.landlordName
    ? `${tenancy.contract.landlordName} 집주인`
    : "계약 집주인";
  const tenantRoomTitle =
    tenancy === "loading"
      ? "입주 정보 확인 중"
      : tenancy
        ? `${tenancy.buildingName} ${tenancy.roomNo}호`
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
  const monthlyRentKrw = residenceBilling?.rentAmount ?? null;
  const maintenanceFeeKrw = residenceBilling?.maintenanceAmount ?? null;
  const residenceAmountLabel = (amount: number | null) =>
    isBillLoading
      ? "확인 중"
      : billingError || amount === null
        ? "정보 없음"
        : formatKrw(amount);
  const nextPaymentDateLabel = isBillLoading
    ? "확인 중"
    : billingError
      ? "정보 없음"
      : billingDateLabel(nextPaymentBilling?.dueDate);
  const contractPeriodLabel =
    tenancy === "loading"
      ? "확인 중"
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
  const selectedRepairOccurredAtLabel = selectedRepairRequest
    ? repairDateTimeLabel(selectedRepairRequest.occurredAt ?? selectedRepairRequest.createdAt)
    : "";
  const selectedRepairBody = selectedRepairRequest?.description.trim() || "본문 내용이 없습니다.";
  const selectedRepairPhotos =
    selectedRepairRequest?.attachments.filter((attachment): attachment is TenantRepairAttachment & { url: string } =>
      typeof attachment.url === "string" && attachment.url.trim().length > 0
    ) ?? [];

  const openRequestSheet = () => {
    setRequestError("");
    setIsRequestSheetOpen(true);
  };

  const openRepairDetailSheet = async (request: TenantRepairRequest) => {
    setSelectedRepairRequest(request);
    setRepairDetailError("");
    setIsRepairDetailLoading(true);

    try {
      const res = await fetch(`/api/tenant/complaints/${encodeURIComponent(request.id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("민원/하자 상세 조회 실패");
      const detail = (await res.json()) as TenantComplaintResponse;
      setSelectedRepairRequest(normalizeTenantRepairRequest(detail));
    } catch {
      setRepairDetailError("상세 내용을 불러오지 못했습니다. 목록에 남아있는 접수 정보만 표시합니다.");
    } finally {
      setIsRepairDetailLoading(false);
    }
  };

  const closeRepairDetailSheet = () => {
    setSelectedRepairRequest(null);
    setRepairDetailError("");
    setIsRepairDetailLoading(false);
  };

  useEffect(() => {
    requestImagesRef.current = requestImages;
  }, [requestImages]);

  useEffect(() => {
    return () => {
      requestImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    };
  }, []);

  const clearRequestImages = () => {
    requestImagesRef.current.forEach((image) => URL.revokeObjectURL(image.url));
    requestImagesRef.current = [];
    setRequestImages([]);
  };

  const closeRequestSheet = (resetDraft = false) => {
    setIsRequestSheetOpen(false);
    setRequestError("");
    if (resetDraft) {
      setRequestDraft(EMPTY_REQUEST_DRAFT);
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
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((image) => image.id !== imageId);
    });
  };

  const handleRequestDraftSave = () => {
    setRequestError("");
    setIsRequestSheetOpen(false);
    showToast("민원/하자 요청이 임시 저장되었습니다.");
  };

  // 신규 민원/하자 접수 — 실제 민원 API(POST /tenant/complaints)로 보내 관리자 대시보드와 연결된다.
  const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRequest) return;
    setIsSubmittingRequest(true);
    setRequestError("");
    try {
      const attachmentUrls = await uploadTenantRequestImages(requestImages);
      const res = await fetch("/api/tenant/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: requestDraft.title.trim(),
          location: tenantRoomTitle,
          occurredAt: requestDraft.occurredAt ? new Date(requestDraft.occurredAt).toISOString() : undefined,
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
      const created = (await res.json().catch(() => undefined)) as TenantComplaintCreateResponse | undefined;
      const complaintId = created?.complaint?.id;
      if (complaintId && attachmentUrls.length > 0) {
        const messageRes = await fetch(`/api/tenant/complaints/${encodeURIComponent(complaintId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageText: "첨부 이미지를 제출했습니다.",
            attachmentUrls
          })
        });
        if (!messageRes.ok) {
          const data = (await messageRes.json().catch(() => undefined)) as { message?: string } | undefined;
          setRequestError(data?.message || "민원은 접수됐지만 이미지 첨부 연결에 실패했습니다.");
          return;
        }
      }
      setIsRequestSheetOpen(false);
      setRequestDraft(EMPTY_REQUEST_DRAFT);
      clearRequestImages();
      showToast("민원/하자 요청이 접수되었습니다.");
      void loadRepairRequests();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleAiSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = aiDraft.trim();
    if (!nextMessage || aiStage === "choose" || aiMode !== "text") return;

    const timestamp = Date.now();
    setAiMessages((messages) => [
      ...messages,
      { id: `tenant-ai-user-${timestamp}`, sender: "tenant", text: nextMessage },
      {
        id: `tenant-ai-reply-${timestamp}`,
        sender: "assistant",
        text: "현재는 데모 상담 화면입니다. 실제 AI 응답이 연결되면 이 대화에서 이어서 도와드릴게요."
      }
    ]);
    setAiDraft("");
  };

  return (
    <section className="screen tenant-screen tenant-portal-screen" id="my-page" aria-labelledby="tenant-title">
      <h2 id="tenant-title" className="visually-hidden">세입자 마이페이지</h2>

      {tenantToast ? <p className="mypage-toast" role="status">{tenantToast}</p> : null}

      <section className="tenant-announcement-card" aria-label="집주인 공지사항">
        <div className="tenant-card-icon" aria-hidden="true">
          <Megaphone size={28} strokeWidth={2.5} />
        </div>
        {announcementState.status === "ready" ? (
          <Link
            href={`/tenant/messaging/02?id=${encodeURIComponent(announcementState.announcement.id)}`}
            style={{ color: "inherit", textDecoration: "none", position: "relative", zIndex: 1 }}
          >
            <span>집주인 공지사항</span>
            <h3>{announcementState.announcement.title}</h3>
            <p>{announcementState.announcement.body}</p>
            <small>
              {announcementState.announcement.sender} · {tenancyDateLabel(announcementState.announcement.sentAt)}
            </small>
          </Link>
        ) : (
          <div>
            <h3>집주인 공지사항</h3>
            <p>{announcementStatusMessage}</p>
          </div>
        )}
        <Megaphone className="tenant-announcement-watermark" size={128} strokeWidth={2.1} aria-hidden="true" />
      </section>

      <section className="tenant-residence-card" aria-label="입주 정보">
        <TenantFloorPlanPreview
          imageUrl={tenancy && tenancy !== "loading" ? tenancy.imageUrl : undefined}
          title={tenantRoomTitle}
        />
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
              onClick={() => {
                if (!contractThreadId) {
                  showToast("계약이 체결되면 임대인 문의를 열 수 있습니다.");
                  return;
                }
                setIsLandlordChatOpen(true);
              }}
            >
              <MessageCircle size={18} strokeWidth={2.5} aria-hidden="true" />
              임대인에게 문의하기
            </button>
          </div>
        </div>
      </section>

      <section className="tenant-history-card" aria-label="민원/하자 이력">
        <header className="tenant-section-head">
          <h3>민원/하자 이력</h3>
          <button type="button" onClick={openRequestSheet}>
            신규 요청하기
            <span aria-hidden="true">+</span>
          </button>
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
        onClick={() => {
          setAiStage("choose");
          setIsAiAssistantOpen((isOpen) => !isOpen);
        }}
        aria-label={isAiAssistantOpen ? "AI 생활 도우미 닫기" : "AI 생활 도우미 열기"}
        aria-controls="tenant-ai-assistant-panel"
        aria-expanded={isAiAssistantOpen}
      >
        <Bot size={30} strokeWidth={2.3} aria-hidden="true" />
      </button>

      {isAiAssistantOpen ? (
        <aside
          className="tenant-ai-panel"
          id="tenant-ai-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="tenant-ai-title"
        >
          <header className="tenant-ai-panel-head">
            <div className="tenant-ai-brand">
              <Bot size={18} strokeWidth={2.4} aria-hidden="true" />
              <h3 id="tenant-ai-title">Woo-zu AI Assistant</h3>
            </div>
            <button
              className="tenant-ai-close-button"
              type="button"
              onClick={() => setIsAiAssistantOpen(false)}
              aria-label="AI 생활 도우미 닫기"
            >
              <X size={20} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </header>
          {aiStage === "choose" ? (
            <div className="tenant-ai-mode-picker" aria-label="AI 상담 모드 선택">
              <div className="tenant-ai-mode-picker-copy">
                <h4>Choose your consultation mode</h4>
                <p>How would you like to talk with Woo-zu AI?</p>
              </div>
              <div className="tenant-ai-mode-cards">
                <button
                  className="tenant-ai-mode-card"
                  type="button"
                  onClick={() => {
                    setAiMode("text");
                    setAiStage("text");
                  }}
                >
                  <span className="tenant-ai-mode-icon" aria-hidden="true">
                    <MessageSquare size={38} strokeWidth={2.2} />
                  </span>
                  <strong>Text Chat</strong>
                  <small>TEXT</small>
                </button>
                <button
                  className="tenant-ai-mode-card"
                  type="button"
                  onClick={() => {
                    setAiMode("call");
                    setAiStage("voice");
                    setAiDraft("");
                  }}
                >
                  <span className="tenant-ai-mode-icon" aria-hidden="true">
                    <Headphones size={40} strokeWidth={2.2} />
                  </span>
                  <strong>Voice Call</strong>
                  <small>CALL</small>
                </button>
              </div>
            </div>
          ) : null}
          {aiStage !== "choose" ? (
            <>
              <div className="tenant-ai-messages" aria-live="polite">
                {aiMessages.map((message) => (
                  <div className={`tenant-ai-message ${message.sender}`} key={message.id}>
                    {message.sender === "assistant" ? (
                      <span className="tenant-ai-avatar" aria-hidden="true">
                        <Bot size={15} strokeWidth={2.4} />
                      </span>
                    ) : null}
                    <p className="tenant-ai-bubble">{message.text}</p>
                  </div>
                ))}
                {aiMode === "call" ? (
                  <p className="tenant-ai-call-note" role="status">
                    통화 모드에서는 메시지 입력 대신 음성 상담 상태를 이어서 확인합니다.
                  </p>
                ) : null}
              </div>
              <form className="tenant-ai-composer" onSubmit={handleAiSubmit}>
                <input
                  type="text"
                  value={aiDraft}
                  onChange={(event) => setAiDraft(event.target.value)}
                  placeholder={aiMode === "call" ? "통화 모드로 연결 준비 중..." : "메시지를 입력하세요..."}
                  aria-label="AI 어시스턴트 메시지 입력"
                  disabled={aiMode === "call"}
                />
                <button
                  className="tenant-ai-mode-toggle"
                  type="button"
                  role="switch"
                  aria-label="AI 상담 모드 전환"
                  aria-checked={aiMode === "call"}
                  onClick={() => {
                    const nextMode: TenantAiMode = aiMode === "text" ? "call" : "text";
                    setAiMode(nextMode);
                    setAiStage(nextMode === "text" ? "text" : "voice");
                    if (nextMode === "call") setAiDraft("");
                  }}
                >
                  <span>text</span>
                  <span className="tenant-ai-switch" aria-hidden="true">
                    <span />
                  </span>
                  <span>call</span>
                </button>
                <button
                  className="tenant-ai-send-button"
                  type="submit"
                  disabled={aiMode === "call" || !aiDraft.trim()}
                  aria-label="AI 어시스턴트 메시지 보내기"
                >
                  <Send size={22} strokeWidth={2.3} aria-hidden="true" />
                </button>
              </form>
            </>
          ) : null}
        </aside>
      ) : null}

      {isLandlordChatOpen ? (
        <>
          <button
            className="tenant-chat-backdrop"
            type="button"
            aria-label="집주인 채팅 닫기"
            onClick={() => setIsLandlordChatOpen(false)}
          />
          <aside
            className="tenant-chat-panel"
            id="tenant-landlord-chat-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-landlord-chat-title"
          >
            <header className="tenant-chat-panel-head">
              <div>
                <span>{landlordChatTitle}</span>
                <h2 id="tenant-landlord-chat-title">집주인 채팅</h2>
                <p>{tenancy && tenancy !== "loading" ? `${tenancy.buildingName} ${tenancy.roomNo}호` : "계약한 집"}</p>
              </div>
              <button type="button" onClick={() => setIsLandlordChatOpen(false)} aria-label="집주인 채팅 닫기">
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </header>
            <div className="tenant-chat-panel-body">
              {tenancy && tenancy !== "loading" && tenancy.contract ? (
                <TradeChatCenter
                  roleFilter="buyer"
                  lockedThreadId={tenancy.contract.threadId}
                  emptyText="계약한 집주인과의 대화가 아직 준비되지 않았습니다."
                />
              ) : (
                <div className="listing-empty-card" role="status">
                  <strong>계약 채팅이 없습니다</strong>
                  <p>계약이 체결되면 집주인과의 대화가 여기에 열립니다.</p>
                </div>
              )}
            </div>
          </aside>
        </>
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
                  {tenancy && tenancy !== "loading" ? `${tenancy.buildingName} ${tenancy.roomNo}호` : "연결된 집 없음"}
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
        <div className="notification-sheet-backdrop" role="presentation" onClick={closeRepairDetailSheet}>
          <section
            className="notification-sheet tenant-request-sheet tenant-request-detail-sheet"
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
              </div>
              <button type="button" onClick={closeRepairDetailSheet} aria-label="접수 내용 닫기">
                <X size={18} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </header>

            {repairDetailError ? <p className="tenant-request-error" role="alert">{repairDetailError}</p> : null}

            <div className="tenant-request-form tenant-request-detail-form">
              <div className="tenant-request-detail-meta-row">
                <div className="tenant-request-type-toggle" role="group" aria-label="요청 유형">
                  {(["민원", "하자"] as const).map((category) => (
                    <button
                      key={category}
                      className={selectedRepairRequest.category === category ? "active" : ""}
                      type="button"
                      disabled
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <label className="tenant-request-date-field">
                  <span>발생일시</span>
                  <input type="text" value={selectedRepairOccurredAtLabel} placeholder="연도-월-일 --:--" readOnly />
                </label>
              </div>

              <label className="tenant-request-body-field">
                <span>본문 내용</span>
                <textarea value={selectedRepairBody} rows={6} readOnly />
              </label>

              {selectedRepairRequest.location ? (
                <label className="tenant-request-title-field">
                  <span>발생 위치</span>
                  <input type="text" value={selectedRepairRequest.location} readOnly />
                </label>
              ) : null}

              {selectedRepairPhotos.length > 0 ? (
                <div className="tenant-request-image-strip" aria-label="첨부 이미지">
                  {selectedRepairPhotos.map((attachment) => (
                    <div className="tenant-request-image-preview tenant-request-image-file" key={attachment.url}>
                      <img src={attachment.url} alt={`${attachment.name} 첨부 이미지`} />
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="tenant-request-actions">
                <button className="primary" type="button" onClick={closeRepairDetailSheet}>
                  닫기
                </button>
              </div>
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

              <div className="tenant-request-image-strip" aria-label="이미지 첨부">
                <label className="tenant-request-image-input">
                  <ImagePlus size={24} strokeWidth={2.4} aria-hidden="true" />
                  <span>이미지<br />(입력)</span>
                  <input type="file" accept="image/*" multiple onChange={handleRequestImageChange} />
                </label>
                {requestImages.map((image) => (
                  <div className="tenant-request-image-preview" key={image.id}>
                    <img src={image.url} alt={`${image.file.name} 미리보기`} />
                    <button type="button" onClick={() => removeRequestImage(image.id)} aria-label={`${image.file.name} 제거`}>
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
                <button type="button" onClick={() => closeRequestSheet(true)}>
                  취소
                </button>
                <button type="button" onClick={handleRequestDraftSave}>
                  임시 저장
                </button>
                <button className="primary" type="submit" disabled={isSubmittingRequest}>
                  {isSubmittingRequest ? "접수 중" : "요청 접수"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
