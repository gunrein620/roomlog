"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthResult = {
  accessToken: string;
  name: string;
};

type Repair = {
  id: string;
  status: string;
  title: string;
  description: string;
  estimateAmount?: number;
  estimateDescription?: string;
  scheduledAt?: string;
  completionNote?: string;
  ticket: {
    id: string;
    status: string;
    category: string;
    priority: number;
    aiSummary: string;
    responsibilityHint: string;
    complaint: {
      title: string;
      description: string;
      location: string;
      availableTimes?: string;
    };
    room?: {
      buildingName: string;
      roomNo: string;
    };
    messages: {
      id: string;
      senderRole: string;
      messageText: string;
    }[];
  };
};

const demoLogin = {
  email: "vendor@roomlog.test",
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

export default function VendorApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("협력업체 계정 연결 중");
  const [estimateAmount, setEstimateAmount] = useState("120000");
  const [estimateDescription, setEstimateDescription] = useState("누수 원인 점검 및 실리콘 보강 작업");
  const [scheduledAt, setScheduledAt] = useState("2026-06-30T10:00");
  const [completionNote, setCompletionNote] = useState("현장 확인 후 누수 부위 보수 완료");

  const selectedRepair = useMemo(
    () => repairs.find((repair) => repair.id === selectedId) ?? repairs[0],
    [repairs, selectedId]
  );

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const data = await apiRequest<Repair[]>("/vendor/repairs", token);
    setRepairs(data);
    setSelectedId((current) => current || data[0]?.id || "");
  }

  useEffect(() => {
    async function login() {
      try {
        const result = await apiRequest<AuthResult>("/auth/login", undefined, {
          method: "POST",
          body: JSON.stringify(demoLogin)
        });
        setAuth(result);
        setStatus(`${result.name} 업체 계정 연결됨`);
        await refresh(result.accessToken);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "로그인 실패");
      }
    }

    void login();
  }, []);

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedRepair) {
      return;
    }

    setStatus("견적 제출 중");
    await apiRequest(`/vendor/repairs/${selectedRepair.id}/estimate`, auth.accessToken, {
      method: "POST",
      body: JSON.stringify({
        estimateAmount: Number(estimateAmount),
        estimateDescription
      })
    });
    setStatus("견적이 제출되었습니다.");
    await refresh();
  }

  async function scheduleRepair() {
    if (!auth || !selectedRepair) {
      return;
    }

    setStatus("방문 일정 저장 중");
    await apiRequest(`/vendor/repairs/${selectedRepair.id}/schedule`, auth.accessToken, {
      method: "POST",
      body: JSON.stringify({
        scheduledAt: new Date(scheduledAt).toISOString()
      })
    });
    setStatus("방문 일정이 저장되었습니다.");
    await refresh();
  }

  async function reportCompletion() {
    if (!auth || !selectedRepair) {
      return;
    }

    setStatus("완료 보고 제출 중");
    await apiRequest(`/vendor/repairs/${selectedRepair.id}/report-completion`, auth.accessToken, {
      method: "POST",
      body: JSON.stringify({
        completionNote,
        completionPhotoUrls: ["/uploads/demo-completion.jpg"]
      })
    });
    setStatus("완료 보고가 제출되었습니다.");
    await refresh();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Roomlog Vendor</p>
          <h1>배정된 수리 작업</h1>
        </div>
        <div className="session">
          <span>{status}</span>
          <button type="button" onClick={() => void refresh()}>
            새로고침
          </button>
        </div>
      </header>

      <section className="metrics" aria-label="업체 요약">
        <div>
          <span>배정 건</span>
          <strong>{repairs.length}</strong>
        </div>
        <div>
          <span>견적 대기</span>
          <strong>{repairs.filter((repair) => repair.status === "REQUESTED").length}</strong>
        </div>
        <div>
          <span>완료 보고</span>
          <strong>{repairs.filter((repair) => repair.status === "COMPLETION_REPORTED").length}</strong>
        </div>
      </section>

      <div className="workspace">
        <section className="panel list" aria-label="수리 목록">
          <div className="panel-heading">
            <p className="eyebrow">Repair Queue</p>
            <h2>요청 목록</h2>
          </div>
          {repairs.length ? (
            <div className="ticket-list">
              {repairs.map((repair) => (
                <button
                  type="button"
                  className={repair.id === selectedRepair?.id ? "ticket active" : "ticket"}
                  key={repair.id}
                  onClick={() => setSelectedId(repair.id)}
                >
                  <span>{repair.status}</span>
                  <strong>{repair.ticket.complaint.title}</strong>
                  <small>
                    {repair.ticket.room?.roomNo} · 긴급도 {repair.ticket.priority}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">관리자 앱에서 업체 배정을 하면 작업이 표시됩니다.</p>
          )}
        </section>

        <section className="panel detail" aria-label="수리 상세">
          <div className="panel-heading">
            <p className="eyebrow">Work Brief</p>
            <h2>{selectedRepair?.ticket.complaint.title ?? "작업 상세"}</h2>
          </div>
          {selectedRepair ? (
            <>
              <div className="brief">
                <span className="badge">{selectedRepair.ticket.status}</span>
                <p>{selectedRepair.ticket.aiSummary}</p>
                <dl>
                  <div>
                    <dt>위치</dt>
                    <dd>{selectedRepair.ticket.complaint.location}</dd>
                  </div>
                  <div>
                    <dt>방문 가능</dt>
                    <dd>{selectedRepair.ticket.complaint.availableTimes ?? "미입력"}</dd>
                  </div>
                  <div>
                    <dt>관리 요청</dt>
                    <dd>{selectedRepair.description}</dd>
                  </div>
                </dl>
              </div>
              <ol className="timeline">
                {selectedRepair.ticket.messages.map((message) => (
                  <li key={message.id}>
                    <span>{message.senderRole}</span>
                    <p>{message.messageText}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="empty">작업을 선택하면 수리에 필요한 요약 정보가 표시됩니다.</p>
          )}
        </section>

        <section className="panel actions-panel" aria-label="업체 처리">
          <div className="panel-heading">
            <p className="eyebrow">Vendor Actions</p>
            <h2>견적·일정·완료</h2>
          </div>
          <form onSubmit={submitEstimate}>
            <label>
              견적 금액
              <input
                inputMode="numeric"
                value={estimateAmount}
                onChange={(event) => setEstimateAmount(event.target.value)}
              />
            </label>
            <label>
              견적 설명
              <textarea
                rows={3}
                value={estimateDescription}
                onChange={(event) => setEstimateDescription(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={!selectedRepair}>
              견적 제출
            </button>
          </form>
          <label>
            방문 일정
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <button type="button" className="secondary" disabled={!selectedRepair} onClick={() => void scheduleRepair()}>
            일정 저장
          </button>
          <label>
            완료 메모
            <textarea
              rows={3}
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
            />
          </label>
          <button type="button" className="primary" disabled={!selectedRepair} onClick={() => void reportCompletion()}>
            완료 보고
          </button>
        </section>
      </div>
    </main>
  );
}
