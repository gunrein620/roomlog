"use client";

// 사는 집(세입자) 마이페이지 — 계약 상태, 수리요청(실제 민원 API), 관리비, 집주인 채팅.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { TradeChatCenter } from "@/app/_components/TradeChatCenter";
import { MyFlowBar, type MyFlow } from "./my-shared";

const tenantIssuePresets = ["보일러 온수 불량", "콘센트 교체", "방충망 보수", "곰팡이 점검"];

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
};

type TenantMaintenanceBill = {
  amountLabel: string;
  summary: string;
  paidSummary: string;
};

type TenantVisit = {
  timeLabel: string;
  title: string;
  pendingDescription: string;
  confirmedDescription: string;
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

export default function TenantMyPage({
  onSelectFlow,
  onGoInquiry,
  onGoHome
}: {
  onSelectFlow: (flow: MyFlow) => void;
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
            .map((item) => ({ id: item.id, title: item.title, status: item.displayStatus ?? "접수됨" }))
        );
      } catch {
        // 일시 오류 — 접수 시점에 다시 채워진다
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [maintenanceBill] = useState<TenantMaintenanceBill | null>(null);
  const [scheduledVisit] = useState<TenantVisit | null>(null);
  const [selectedIssue, setSelectedIssue] = useState("");
  const [maintenancePaid, setMaintenancePaid] = useState(false);
  const [visitConfirmed] = useState(false);
  const [isContractSheetOpen, setIsContractSheetOpen] = useState(false);
  const [isLandlordChatOpen, setIsLandlordChatOpen] = useState(false);
  const [tenantToast, setTenantToast] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [isSubmittingRepair, setIsSubmittingRepair] = useState(false);
  // state는 리렌더 이후에야 반영되므로, 연타가 재렌더보다 빠르면 state 체크만으론 막지 못한다 — ref로 즉시 잠근다.
  const isPayingRef = useRef(false);
  const isSubmittingRepairRef = useRef(false);

  const showToast = (message: string) => {
    setTenantToast(message);
    window.setTimeout(() => setTenantToast(""), 2400);
  };
  // 수리요청은 실제 민원 API로 접수한다 — 관리인 콘솔 민원/하자 탭과 같은 티켓 스토어를 본다.
  // (이전엔 로컬 state에만 쌓는 목업이라 관리인 쪽에 아무것도 안 갔다.)
  const addRepairRequest = async () => {
    if (!selectedIssue) {
      return;
    }

    if (isSubmittingRepairRef.current) {
      return;
    }

    isSubmittingRepairRef.current = true;
    setIsSubmittingRepair(true);
    try {
      const locationLabel =
        tenancy && tenancy !== "loading" ? `${tenancy.buildingName} ${tenancy.roomNo}호` : "집 안";
      const response = await fetch("/api/tenant/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedIssue,
          description: `${selectedIssue} 문제로 수리를 요청합니다. 방문 전 연락 부탁드립니다.`,
          location: locationLabel
        })
      });
      const saved = (await response.json().catch(() => null)) as
        | {
            id?: string;
            title?: string;
            displayStatus?: string;
            message?: string;
            // 생성 응답은 { complaint, ... } 래핑, 목록 응답은 complaint가 최상위 — 둘 다 받는다.
            complaint?: { id?: string; title?: string; displayStatus?: string };
          }
        | null;
      const complaint = saved?.complaint ?? saved;

      if (!response.ok || !complaint?.id) {
        showToast(saved?.message ?? "수리요청 접수에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      setRepairRequests((current) => [
        { id: complaint.id as string, title: complaint.title ?? selectedIssue, status: complaint.displayStatus ?? "접수됨" },
        ...current.filter((item) => item.id !== complaint.id)
      ]);
      showToast("수리요청이 접수됐습니다. 관리인이 확인 후 업체를 배정합니다.");
    } catch {
      showToast("네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      isSubmittingRepairRef.current = false;
      setIsSubmittingRepair(false);
    }
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

  return (
    <section className="screen tenant-screen" id="my-page" aria-labelledby="tenant-title">
      <MyFlowBar activeFlow="living" onSelectFlow={onSelectFlow} />

      <div className="owner-hero compact-profile tenant-hero">
        <div>
          <p className="brand-kicker">입주 생활</p>
          <h2 id="tenant-title">세입자 마이페이지</h2>
          <p>계약, 관리비, 수리요청, 방문 일정을 한 화면에서 확인합니다.</p>
        </div>
        <button className="mypage-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </div>

      {tenantToast ? <p className="mypage-toast" role="status">{tenantToast}</p> : null}

      <section className="tenant-contract-card" aria-label="계약 상태">
        <div>
          <span>계약 상태</span>
          {tenancy === "loading" ? (
            <>
              <strong>확인 중…</strong>
              <p>연결된 집 정보를 불러오고 있어요.</p>
            </>
          ) : tenancy ? (
            <>
              <strong>{tenancy.contract ? "계약 중" : "집 연결됨 · 계약 정보 없음"}</strong>
              <p>
                {tenancy.buildingName} {tenancy.roomNo}호 · {tenancyTermsLabel(tenancy.contract)}
              </p>
            </>
          ) : (
            <>
              <strong>연결된 집이 없어요</strong>
              <p>집주인과 채팅에서 계약이 체결되면 이 화면이 실제 계약 정보로 채워집니다.</p>
            </>
          )}
        </div>
        <button type="button" onClick={() => setIsContractSheetOpen(true)}>계약서 보기</button>
      </section>

      <div className="tenant-task-grid" aria-label="세입자 할 일">
        <article>
          <span>수리요청</span>
          <strong>{String(repairRequests.length).padStart(2, "0")}건</strong>
          <p>{repairRequests.length ? repairRequests.slice(0, 2).map((item) => item.title).join(" · ") : "접수된 수리요청 없음"}</p>
        </article>
        <article>
          <span>관리비</span>
          <strong>{maintenanceBill ? (maintenancePaid ? "납부 완료" : maintenanceBill.amountLabel) : "납부할 관리비 없음"}</strong>
          <p>{maintenanceBill ? (maintenancePaid ? maintenanceBill.paidSummary : "이번 달 납부 예정") : "청구가 등록되면 표시됩니다."}</p>
        </article>
        <article>
          <span>방문 일정</span>
          <strong>{scheduledVisit ? (visitConfirmed ? "확인 완료" : scheduledVisit.timeLabel) : "예정된 방문 없음"}</strong>
          <p>{scheduledVisit ? scheduledVisit.title : "확정된 일정이 없습니다."}</p>
        </article>
      </div>

      <section className="tenant-contract-card" aria-label="관리비 납부">
        <div>
          <span>이번 달 관리비</span>
          <strong>{maintenanceBill ? (maintenancePaid ? "납부 완료" : maintenanceBill.amountLabel) : "납부할 관리비 없음"}</strong>
          <p>{maintenanceBill ? (maintenancePaid ? maintenanceBill.paidSummary : maintenanceBill.summary) : "관리인이 청구를 등록하면 납부할 수 있습니다."}</p>
        </div>
        <button
          type="button"
          disabled={!maintenanceBill || isPaying}
          aria-busy={isPaying}
          onClick={() => {
            if (!maintenanceBill) {
              return;
            }
            const currentBill = maintenanceBill;

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
              showToast(`관리비 ${currentBill.amountLabel} 납부가 완료됐습니다.`);
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
          ) : !maintenanceBill ? (
            "납부 대기"
          ) : (
            "납부하기"
          )}
        </button>
      </section>

      <section className="tenant-repair-card" aria-label="수리요청">
        <div className="tenant-repair-head">
          <div>
            <span>수리요청</span>
            <strong>진행 중 {repairRequests.length}건</strong>
          </div>
          <button type="button" onClick={onGoInquiry}>관리인 문의</button>
        </div>
        <div className="tenant-repair-list">
          {repairRequests.length ? (
            repairRequests.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <em className={item.status === "업체 배정" ? "assigned" : ""}>{item.status}</em>
              </article>
            ))
          ) : (
            <p className="tenant-repair-empty">아직 접수된 수리요청이 없어요</p>
          )}
        </div>
        <div className="tenant-repair-new">
          <strong>새 수리요청</strong>
          <div className="repair-issue-chips">
            {tenantIssuePresets.map((issue) => (
              <button
                className={selectedIssue === issue ? "active" : ""}
                type="button"
                key={issue}
                onClick={() => setSelectedIssue(issue)}
              >
                {issue}
              </button>
            ))}
          </div>
          <button
            className="repair-submit"
            type="button"
            onClick={addRepairRequest}
            disabled={isSubmittingRepair || !selectedIssue}
            aria-busy={isSubmittingRepair}
          >
            {isSubmittingRepair ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                접수 처리 중…
              </>
            ) : !selectedIssue ? (
              "수리 항목을 선택하세요"
            ) : (
              `${selectedIssue} 접수하기`
            )}
          </button>
        </div>
      </section>

      <button
        className="tenant-landlord-chat-button"
        type="button"
        disabled={!contractThreadId}
        aria-expanded={isLandlordChatOpen}
        aria-controls="tenant-landlord-chat-panel"
        onClick={() => {
          if (!contractThreadId) {
            showToast("계약이 체결되면 집주인 채팅을 열 수 있습니다.");
            return;
          }
          setIsLandlordChatOpen(true);
        }}
      >
        <MessageCircle size={18} strokeWidth={2.4} aria-hidden="true" />
        집주인 채팅
      </button>

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
