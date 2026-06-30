"use client";

import { useEffect, useMemo, useState } from "react";

type AuthResult = {
  accessToken: string;
  name: string;
};

type Vendor = {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  activeJobs: number;
};

type Ticket = {
  id: string;
  status: string;
  category: string;
  priority: number;
  responsibilityHint: string;
  aiSummary: string;
  dueAt?: string;
  complaint: {
    id: string;
    title: string;
    description: string;
    location: string;
    availableTimes?: string;
  };
  room?: {
    buildingName: string;
    roomNo: string;
  };
  assignedVendor?: Vendor;
  repairs: {
    id: string;
    status: string;
    estimateAmount?: number;
    estimateDescription?: string;
    scheduledAt?: string;
    completionNote?: string;
  }[];
  messages: {
    id: string;
    senderRole: string;
    messageText: string;
  }[];
  history: {
    id: string;
    toStatus: string;
    note?: string;
  }[];
};

const demoLogin = {
  email: "manager@roomlog.test",
  password: "password123!"
};

function apiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const normalized = base.replace(/\/$/, "");

  return normalized.endsWith("/api") ? `${normalized}${path}` : `${normalized}/api${path}`;
}

async function apiRequest<T>(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function ManagerApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("관리자 계정 연결 중");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0],
    [selectedId, tickets]
  );

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const [ticketData, vendorData] = await Promise.all([
      apiRequest<Ticket[]>("/manager/tickets", token),
      apiRequest<Vendor[]>("/manager/vendors", token)
    ]);
    setTickets(ticketData);
    setVendors(vendorData);
    setSelectedId((current) => current || ticketData[0]?.id || "");
  }

  useEffect(() => {
    async function login() {
      try {
        const result = await apiRequest<AuthResult>("/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify(demoLogin)
        });
        setAuth(result);
        setStatus(`${result.name} 관리자 계정 연결됨`);
        await refresh(result.accessToken);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "로그인 실패");
      }
    }

    void login();
  }, []);

  async function runAction(label: string, path: string, body: object) {
    if (!auth) {
      return;
    }

    setStatus(`${label} 처리 중`);
    await apiRequest(path, auth.accessToken, {
      method: "POST",
      body: JSON.stringify(body)
    });
    setStatus(`${label} 완료`);
    await refresh();
  }

  async function confirmAnalysis() {
    if (!auth || !selectedTicket) {
      return;
    }

    setStatus("AI 분석 검토 저장 중");
    await apiRequest(`/manager/tickets/${selectedTicket.id}`, auth.accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        category: selectedTicket.category,
        priority: selectedTicket.priority,
        responsibilityHint: selectedTicket.responsibilityHint,
        aiSummary: selectedTicket.aiSummary
      })
    });
    setStatus("AI 분석 검토가 저장되었습니다.");
    await refresh();
  }

  const openTickets = tickets.filter((ticket) => ticket.status !== "COMPLETED").length;
  const urgentTickets = tickets.filter((ticket) => ticket.priority === 1).length;
  const selectedVendor = vendors[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Roomlog Manager</p>
          <h1>하자 티켓 큐</h1>
        </div>
        <div className="session">
          <span>{status}</span>
          <button type="button" onClick={() => void refresh()}>
            새로고침
          </button>
        </div>
      </header>

      <section className="metrics" aria-label="관리자 요약">
        <div>
          <span>미처리 티켓</span>
          <strong>{openTickets}</strong>
        </div>
        <div>
          <span>긴급 티켓</span>
          <strong>{urgentTickets}</strong>
        </div>
        <div>
          <span>협력업체</span>
          <strong>{vendors.length}</strong>
        </div>
      </section>

      <div className="workspace">
        <section className="panel queue" aria-label="티켓 목록">
          <div className="panel-heading">
            <p className="eyebrow">M-DASH</p>
            <h2>확인 대기</h2>
          </div>
          {tickets.length ? (
            <div className="ticket-list">
              {tickets.map((ticket) => (
                <button
                  type="button"
                  key={ticket.id}
                  className={ticket.id === selectedTicket?.id ? "ticket active" : "ticket"}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <span>{ticket.status}</span>
                  <strong>{ticket.complaint.title}</strong>
                  <small>
                    {ticket.room?.roomNo} · 긴급도 {ticket.priority} · {ticket.category}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">세입자 앱에서 신고를 접수하면 티켓이 여기에 표시됩니다.</p>
          )}
        </section>

        <section className="panel review" aria-label="티켓 상세">
          <div className="panel-heading">
            <p className="eyebrow">AI Review</p>
            <h2>{selectedTicket?.complaint.title ?? "티켓 상세"}</h2>
          </div>
          {selectedTicket ? (
            <>
              <div className="analysis">
                <span className="badge danger">P{selectedTicket.priority}</span>
                <p>{selectedTicket.aiSummary}</p>
                <dl>
                  <div>
                    <dt>호실</dt>
                    <dd>
                      {selectedTicket.room?.buildingName} {selectedTicket.room?.roomNo}
                    </dd>
                  </div>
                  <div>
                    <dt>책임 가능성</dt>
                    <dd>{selectedTicket.responsibilityHint}</dd>
                  </div>
                  <div>
                    <dt>방문 가능</dt>
                    <dd>{selectedTicket.complaint.availableTimes ?? "미입력"}</dd>
                  </div>
                </dl>
              </div>
              <div className="actions">
                <button type="button" onClick={() => void confirmAnalysis()}>
                  분석 확정
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      "추가 정보 요청",
                      `/manager/tickets/${selectedTicket.id}/request-info`,
                      { messageText: "누수가 계속되는지와 바닥 물고임 사진을 추가로 올려주세요." }
                    )
                  }
                >
                  추가정보 요청
                </button>
                <button
                  type="button"
                  disabled={!selectedVendor}
                  onClick={() =>
                    void runAction("업체 배정", `/manager/tickets/${selectedTicket.id}/assign-vendor`, {
                      vendorId: selectedVendor?.id,
                      requestNote: "사진과 요약 확인 후 가능한 가장 빠른 방문 일정을 제안해주세요."
                    })
                  }
                >
                  업체 배정
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runAction("완료 승인", `/manager/tickets/${selectedTicket.id}/approve-completion`, {
                      note: "관리자 확인 후 완료 처리"
                    })
                  }
                >
                  완료 승인
                </button>
              </div>
            </>
          ) : (
            <p className="empty">티켓을 선택하면 AI 요약, 책임 가능성, 처리 액션이 표시됩니다.</p>
          )}
        </section>

        <section className="panel activity" aria-label="처리 이력">
          <div className="panel-heading">
            <p className="eyebrow">Timeline</p>
            <h2>처리 기록</h2>
          </div>
          {selectedTicket ? (
            <>
              <ol className="timeline">
                {selectedTicket.history.map((item) => (
                  <li key={item.id}>
                    <span>{item.toStatus}</span>
                    <p>{item.note ?? "상태 변경"}</p>
                  </li>
                ))}
                {selectedTicket.repairs.map((repair) => (
                  <li key={repair.id}>
                    <span>{repair.status}</span>
                    <p>
                      {repair.estimateAmount
                        ? `${repair.estimateAmount.toLocaleString()}원 · ${repair.estimateDescription}`
                        : repair.completionNote ?? repair.scheduledAt ?? "업체 작업 대기"}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="vendor-strip">
                {vendors.map((vendor) => (
                  <div key={vendor.id}>
                    <strong>{vendor.businessName}</strong>
                    <span>{vendor.serviceArea}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty">처리 이력이 아직 없습니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
