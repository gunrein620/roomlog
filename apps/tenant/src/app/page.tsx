"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

type ComplaintView = {
  id: string;
  title: string;
  description: string;
  location: string;
  displayStatus: string;
  availableTimes?: string;
  createdAt: string;
  ticket: {
    id: string;
    category: string;
    priority: number;
    responsibilityHint: string;
    aiSummary: string;
    dueAt?: string;
    repairs: {
      id: string;
      status: string;
      scheduledAt?: string;
      completionNote?: string;
    }[];
  };
  messages: {
    id: string;
    senderRole: string;
    messageText: string;
    createdAt: string;
  }[];
};

type TenantHome = {
  profile: {
    name: string;
    roomId: string;
  };
  complaints: ComplaintView[];
};

const demoLogin = {
  email: "tenant@roomlog.test",
  password: "password123!"
};

const initialForm = {
  title: "천장에서 물이 떨어져요",
  description: "어젯밤부터 안방 천장 모서리에서 물이 계속 떨어지고 얼룩이 커지고 있어요.",
  location: "안방 천장",
  occurredAt: "2026-06-29T21:10",
  availableTimes: "평일 오후 7시 이후"
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

export default function TenantApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [home, setHome] = useState<TenantHome | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("데모 계정으로 연결 중");

  const selectedComplaint = useMemo(
    () => home?.complaints.find((complaint) => complaint.id === selectedId) ?? home?.complaints[0],
    [home, selectedId]
  );

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const data = await apiRequest<TenantHome>("/tenant/home", token);
    setHome(data);
    setSelectedId((current) => current || data.complaints[0]?.id || "");
  }

  useEffect(() => {
    async function login() {
      try {
        const result = await apiRequest<AuthResult>("/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify(demoLogin)
        });
        setAuth(result);
        setStatus(`${result.name} 세입자 계정 연결됨`);
        await refresh(result.accessToken);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "로그인 실패");
      }
    }

    void login();
  }, []);

  async function submitComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      return;
    }

    setStatus("하자 신고 접수 중");
    const payload = {
      ...form,
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined
    };
    const result = await apiRequest<{ complaint: ComplaintView }>("/tenant/complaints", auth.accessToken, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setStatus("신고가 접수되고 AI 요약 티켓이 생성되었습니다.");
    await refresh();
    setSelectedId(result.complaint.id);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Roomlog Tenant</p>
          <h1>하자 신고와 처리 상태</h1>
        </div>
        <div className="session">
          <span>{status}</span>
          <button type="button" onClick={() => void refresh()}>
            새로고침
          </button>
        </div>
      </header>

      <section className="metrics" aria-label="세입자 요약">
        <div>
          <span>내 호실</span>
          <strong>{home?.profile.roomId ?? "연결 중"}</strong>
        </div>
        <div>
          <span>진행 중 신고</span>
          <strong>{home?.complaints.filter((item) => item.displayStatus !== "완료").length ?? 0}</strong>
        </div>
        <div>
          <span>긴급 건</span>
          <strong>{home?.complaints.filter((item) => item.ticket.priority === 1).length ?? 0}</strong>
        </div>
      </section>

      <div className="workspace">
        <form className="panel intake" onSubmit={submitComplaint}>
          <div className="panel-heading">
            <p className="eyebrow">T-DEF</p>
            <h2>하자 접수</h2>
          </div>
          <label>
            제목
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <label>
            위치
            <input
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
            />
          </label>
          <label>
            발생 시점
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(event) => setForm({ ...form, occurredAt: event.target.value })}
            />
          </label>
          <label>
            방문 가능 시간
            <input
              value={form.availableTimes}
              onChange={(event) => setForm({ ...form, availableTimes: event.target.value })}
            />
          </label>
          <label>
            설명
            <textarea
              rows={5}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <button type="submit" className="primary" disabled={!auth}>
            AI 요약과 함께 접수
          </button>
        </form>

        <section className="panel list" aria-label="접수 내역">
          <div className="panel-heading">
            <p className="eyebrow">T-HOME</p>
            <h2>내 신고</h2>
          </div>
          {home?.complaints.length ? (
            <div className="ticket-list">
              {home.complaints.map((complaint) => (
                <button
                  type="button"
                  className={complaint.id === selectedComplaint?.id ? "ticket active" : "ticket"}
                  key={complaint.id}
                  onClick={() => setSelectedId(complaint.id)}
                >
                  <span>{complaint.displayStatus}</span>
                  <strong>{complaint.title}</strong>
                  <small>
                    {complaint.ticket.category} · 긴급도 {complaint.ticket.priority}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">왼쪽 양식으로 첫 하자 신고를 접수하세요.</p>
          )}
        </section>

        <section className="panel detail" aria-label="상세 상태">
          <div className="panel-heading">
            <p className="eyebrow">Ticket Message</p>
            <h2>{selectedComplaint?.title ?? "상세 내역"}</h2>
          </div>
          {selectedComplaint ? (
            <>
              <div className="analysis">
                <span className="badge">{selectedComplaint.displayStatus}</span>
                <p>{selectedComplaint.ticket.aiSummary}</p>
                <dl>
                  <div>
                    <dt>책임 가능성</dt>
                    <dd>{selectedComplaint.ticket.responsibilityHint}</dd>
                  </div>
                  <div>
                    <dt>방문 가능</dt>
                    <dd>{selectedComplaint.availableTimes ?? "미입력"}</dd>
                  </div>
                </dl>
              </div>
              <ol className="timeline">
                {selectedComplaint.messages.map((message) => (
                  <li key={message.id}>
                    <span>{message.senderRole}</span>
                    <p>{message.messageText}</p>
                  </li>
                ))}
                {selectedComplaint.ticket.repairs.map((repair) => (
                  <li key={repair.id}>
                    <span>{repair.status}</span>
                    <p>{repair.completionNote ?? repair.scheduledAt ?? "업체 처리 진행 중"}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="empty">신고를 선택하면 AI 요약과 처리 타임라인이 표시됩니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
