"use client";

// 사는 집(세입자) 마이페이지 — 계약 상태, 수리요청(실제 민원 API), 관리비, 집주인 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Announcement } from "@roomlog/types";
import { Bath, Bot, ChevronRight, FileText, Headphones, Megaphone, MessageCircle, MessageSquare, Send, Snowflake, X } from "lucide-react";
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

type TenantContractSummary = {
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
  contract: TenantContractSummary | null;
};

type TenantRepairRequest = {
  id: string;
  title: string;
  /** 서버 티켓 표시 상태(접수됨/검토중/업체 배정…) 그대로 */
  status: string;
  date?: string;
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

function formatNumber(amount: number): string {
  return amount.toLocaleString("ko-KR");
}

function TenantFloorPlanPreview() {
  return (
    <div className="tenant-floorplan-card" aria-label="세입자 평면도 미리보기">
      <svg className="tenant-floorplan-svg" viewBox="0 0 420 240" role="img" aria-label="우주빌리지 401호 평면도">
        <rect x="62" y="34" width="296" height="172" rx="2" />
        <path d="M62 88h296M172 34v172M262 88v118M62 144h110M262 146h96" />
        <path d="M172 122c22 0 40 18 40 40M262 122c-22 0-40 18-40 40M172 88c22 0 40-18 40-40" />
        <rect x="82" y="55" width="70" height="26" rx="4" />
        <rect x="82" y="104" width="54" height="32" rx="4" />
        <rect x="84" y="158" width="68" height="28" rx="4" />
        <rect x="192" y="54" width="44" height="28" rx="4" />
        <circle cx="226" cy="154" r="16" />
        <rect x="286" y="104" width="48" height="26" rx="4" />
        <rect x="286" y="160" width="46" height="26" rx="4" />
        <text x="99" y="71">BEDROOM</text>
        <text x="98" y="122">KITCHEN</text>
        <text x="196" y="71">BATH</text>
        <text x="286" y="121">STUDIO</text>
        <text x="294" y="177">BALCONY</text>
        <path className="tenant-floorplan-measure" d="M62 22h296M48 34v172M372 34v172" />
      </svg>
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
        try {
          const contractsRes = await fetch("/api/trade/contracts", { cache: "no-store" });
          if (contractsRes.ok) {
            const contracts = (await contractsRes.json()) as Array<{
              tenantId: string;
              landlordId: string;
              landlordName: string;
              status: string;
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
                threadId: accepted.threadId,
                landlordName: accepted.landlordName,
                tradeType: accepted.tradeType,
                depositManwon: accepted.depositManwon,
                monthlyRentManwon: accepted.monthlyRentManwon,
                respondedAt: accepted.respondedAt
              };
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
      const complaints = (await res.json()) as Array<{
        id: string;
        title: string;
        displayStatus?: string;
        createdAt?: string;
      }>;
      if (!Array.isArray(complaints)) return;
      setRepairRequests(
        complaints
          .slice()
          .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
          .map((item) => ({ id: item.id, title: item.title, status: item.displayStatus ?? "접수됨", date: item.createdAt?.slice(0, 10).replaceAll("-", ".") }))
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
  const [requestDraft, setRequestDraft] = useState({ title: "", location: "", description: "" });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState("");
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
    Icon: index % 2 === 0 ? Snowflake : Bath,
    tone: index % 2 === 0 ? "warm" : "neutral"
  }));
  const announcementStatusMessage =
    announcementState.status === "loading"
      ? "공지사항을 확인하고 있습니다."
      : announcementState.status === "error"
        ? "공지사항을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
        : "임대인으로부터 전달된 새로운 소식이 없습니다.";

  const openRequestSheet = () => {
    setRequestDraft({ title: "", location: "", description: "" });
    setRequestError("");
    setIsRequestSheetOpen(true);
  };

  // 신규 민원/하자 접수 — 실제 민원 API(POST /tenant/complaints)로 보내 관리자 대시보드와 연결된다.
  const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRequest) return;
    setIsSubmittingRequest(true);
    setRequestError("");
    try {
      const res = await fetch("/api/tenant/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: requestDraft.title.trim(),
          location: requestDraft.location.trim(),
          description: requestDraft.description.trim()
        })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
        setRequestError(data?.message || "요청을 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setIsRequestSheetOpen(false);
      showToast("민원/하자 요청이 접수되었습니다.");
      void loadRepairRequests();
    } catch {
      setRequestError("네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
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
        <TenantFloorPlanPreview />
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
              <button className="tenant-history-row" type="button" key={item.id} onClick={onGoInquiry}>
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

      {isRequestSheetOpen ? (
        <div className="notification-sheet-backdrop" role="presentation" onClick={() => setIsRequestSheetOpen(false)}>
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
              <button type="button" onClick={() => setIsRequestSheetOpen(false)} aria-label="신규 요청 닫기">×</button>
            </header>

            <form className="tenant-request-form" onSubmit={handleRequestSubmit}>
              <label>
                <span>제목</span>
                <input
                  type="text"
                  value={requestDraft.title}
                  onChange={(event) => setRequestDraft((draft) => ({ ...draft, title: event.target.value }))}
                  placeholder="예: 에어컨에서 물이 새요"
                  maxLength={80}
                  required
                />
              </label>
              <label>
                <span>발생 위치</span>
                <input
                  type="text"
                  value={requestDraft.location}
                  onChange={(event) => setRequestDraft((draft) => ({ ...draft, location: event.target.value }))}
                  placeholder="예: 거실 에어컨 아래"
                  maxLength={60}
                  required
                />
              </label>
              <label>
                <span>상세 설명</span>
                <textarea
                  value={requestDraft.description}
                  onChange={(event) => setRequestDraft((draft) => ({ ...draft, description: event.target.value }))}
                  placeholder="언제부터, 어떤 증상이 있는지 적어주시면 처리가 빨라져요."
                  rows={4}
                  maxLength={1000}
                  required
                />
              </label>
              {requestError ? <p className="tenant-request-error" role="alert">{requestError}</p> : null}
              <button className="notification-action" type="submit" disabled={isSubmittingRequest}>
                {isSubmittingRequest ? "접수 중…" : "요청 접수하기"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
