"use client";

// 사는 집(세입자) 마이페이지 — 계약 상태, 수리요청(실제 민원 API), 관리비, 집주인 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Bath, Bot, ChevronRight, FileText, Headphones, Megaphone, MessageCircle, MessageSquare, Send, Snowflake, X } from "lucide-react";
import { TradeChatCenter } from "@/app/_components/TradeChatCenter";

const DEFAULT_MONTHLY_RENT_KRW = 850000;
const DEFAULT_MAINTENANCE_FEE_KRW = 120000;
const DEFAULT_NEXT_PAYMENT_DATE = "2024.12.15";
const DEFAULT_CONTRACT_PERIOD = "2024.01.15 ~ 2026.01.14";
const TENANT_AI_GREETING = "안녕하세요! 우주(Woo-zu) AI 어시스턴트입니다. 무엇을 도와드릴까요?";

const demoTenantRepairHistory = [
  { id: "demo-aircon", title: "에어컨 수리", status: "완료", date: "2024.08.12", Icon: Snowflake, tone: "warm" },
  { id: "demo-sink", title: "세면대 교체", status: "처리 중", date: "2024.11.02", Icon: Bath, tone: "neutral" }
];

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

  const [repairRequests, setRepairRequests] = useState<TenantRepairRequest[]>([]);

  // 접수 내역은 서버가 진실 — 새로고침해도 남고, 관리인이 상태를 바꾸면 여기 라벨도 따라온다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tenant/complaints", { cache: "no-store" });
        if (!res.ok) return; // 비로그인/집 미연결 — 빈 목록 유지
        const complaints = (await res.json()) as Array<{
          id: string;
          title: string;
          displayStatus?: string;
          createdAt?: string;
        }>;
        if (cancelled || !Array.isArray(complaints)) return;
        setRepairRequests(
          complaints
            .slice()
            .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
            .map((item) => ({ id: item.id, title: item.title, status: item.displayStatus ?? "접수됨", date: item.createdAt?.slice(0, 10).replaceAll("-", ".") }))
        );
      } catch {
        // 일시 오류 — 접수 시점에 다시 채워진다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [maintenancePaid, setMaintenancePaid] = useState(false);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);
  const [isLandlordChatOpen, setIsLandlordChatOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiStage, setAiStage] = useState<TenantAiStage>("choose");
  const [aiMode, setAiMode] = useState<TenantAiMode>("text");
  const [aiDraft, setAiDraft] = useState("");
  const [aiMessages, setAiMessages] = useState<TenantAiMessage[]>([
    { id: "tenant-ai-welcome", sender: "assistant", text: TENANT_AI_GREETING }
  ]);
  const [tenantToast, setTenantToast] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  // state는 리렌더 이후에야 반영되므로, 연타가 재렌더보다 빠르면 state 체크만으론 막지 못한다 — ref로 즉시 잠근다.
  const isPayingRef = useRef(false);

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
  };

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
  const monthlyRentKrw =
    tenancy && tenancy !== "loading" && tenancy.contract?.tradeType === "월세" && tenancy.contract.monthlyRentManwon > 0
      ? tenancy.contract.monthlyRentManwon * 10000
      : DEFAULT_MONTHLY_RENT_KRW;
  const maintenanceFeeKrw = DEFAULT_MAINTENANCE_FEE_KRW;
  const monthlyTotalKrw = monthlyRentKrw + maintenanceFeeKrw;
  const contractPeriodLabel =
    tenancy === "loading"
      ? "확인 중"
      : tenancy?.contract?.respondedAt
        ? `${tenancyDateLabel(tenancy.contract.respondedAt)} 체결`
        : DEFAULT_CONTRACT_PERIOD;
  const repairHistory = repairRequests.length
    ? repairRequests.slice(0, 4).map((item, index) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        date: item.date ?? "일자 확인 중",
        Icon: index % 2 === 0 ? Snowflake : Bath,
        tone: index % 2 === 0 ? "warm" : "neutral"
      }))
    : demoTenantRepairHistory;

  const handleAiSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextMessage = aiDraft.trim();
    if (!nextMessage || aiStage !== "text" || aiMode !== "text") return;

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
        <div>
          <h3>집주인 공지사항</h3>
          <p>임대인으로부터 전달된 새로운 소식이 없습니다.</p>
        </div>
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
              <dd>{DEFAULT_NEXT_PAYMENT_DATE}</dd>
            </div>
            <div>
              <dt>월세</dt>
              <dd className="tenant-primary-value">{formatKrw(monthlyRentKrw)}</dd>
            </div>
            <div>
              <dt>관리비</dt>
              <dd>{formatKrw(maintenanceFeeKrw)}</dd>
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
          <button type="button" onClick={onGoInquiry}>
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
        </div>
      </section>

      <section className="tenant-payment-card" aria-label="이번 달 합계">
        <div className="tenant-payment-content">
          <h3>이번 달 합계</h3>
          <div className="tenant-payment-total">
            <strong>{formatNumber(monthlyTotalKrw)}</strong>
            <span>KRW</span>
          </div>
          <dl className="tenant-payment-breakdown">
            <div>
              <dt>기본 월세</dt>
              <dd>{formatNumber(monthlyRentKrw)}</dd>
            </div>
            <div>
              <dt>고정 관리비</dt>
              <dd>{formatNumber(maintenanceFeeKrw)}</dd>
            </div>
            <div>
              <dt>납부 상태</dt>
              <dd>{maintenancePaid ? "납부 완료" : "납부 대기"}</dd>
            </div>
          </dl>
          <button
            className="tenant-payment-button"
            type="button"
            disabled={isPaying || maintenancePaid}
            aria-busy={isPaying}
            onClick={() => {
              if (maintenancePaid) {
                showToast("영수증이 문자로 발송됐습니다.");
                return;
              }

              if (isPayingRef.current) {
                return;
              }

              isPayingRef.current = true;
              setIsPaying(true);
              window.setTimeout(() => {
                setMaintenancePaid(true);
                isPayingRef.current = false;
                setIsPaying(false);
                showToast(`이번 달 합계 ${formatKrw(monthlyTotalKrw)} 납부가 완료됐습니다.`);
              }, 700);
            }}
          >
            {isPaying ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                처리 중…
              </>
            ) : maintenancePaid ? (
              "영수증 보기"
            ) : (
              "즉시 납부하기"
            )}
          </button>
        </div>
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
            {aiStage !== "choose" ? (
              <button className="tenant-ai-change-mode" type="button" onClick={() => setAiStage("choose")}>
                Mode
              </button>
            ) : null}
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
          {aiStage === "text" ? (
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
              </div>
              <form className="tenant-ai-composer" onSubmit={handleAiSubmit}>
                <input
                  type="text"
                  value={aiDraft}
                  onChange={(event) => setAiDraft(event.target.value)}
                  placeholder="메시지를 입력하세요..."
                  aria-label="AI 어시스턴트 메시지 입력"
                />
                <button
                  className="tenant-ai-send-button"
                  type="submit"
                  disabled={!aiDraft.trim()}
                  aria-label="AI 어시스턴트 메시지 보내기"
                >
                  <Send size={22} strokeWidth={2.3} aria-hidden="true" />
                </button>
              </form>
            </>
          ) : null}
          {aiStage === "voice" ? (
            <div className="tenant-ai-voice-panel" aria-live="polite">
              <span className="tenant-ai-voice-orb" aria-hidden="true">
                <Headphones size={50} strokeWidth={2.15} />
              </span>
              <strong>Voice Call</strong>
              <p>음성 상담 연결을 준비하고 있습니다. 상담이 시작되면 이 화면에서 통화 상태를 확인할 수 있습니다.</p>
              <button className="tenant-ai-voice-button" type="button" onClick={() => setAiStage("choose")}>
                다시 선택하기
              </button>
            </div>
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
    </section>
  );
}
