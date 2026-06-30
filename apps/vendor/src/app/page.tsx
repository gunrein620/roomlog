"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildVendorSignupPayload,
  canSubmitVendorSignup,
  vendorSignupIssues
} from "./vendor-signup";
import {
  initialVendorCompletionNote,
  initialVendorEstimateAmount,
  initialVendorEstimateDescription,
  initialVendorMessageText,
  initialVendorScheduleAt
} from "./action-form-state";

type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

type SignupInvitePreview = {
  role: "TENANT" | "VENDOR";
  inviteToken: string;
  status: string;
  expectedName: string;
  invitedBy: string;
  email?: string;
  phone?: string;
  emailLocked: boolean;
  phoneLocked: boolean;
  businessName?: string;
  serviceArea?: string;
  targetLabel: string;
  signupUrl: string;
};

type Repair = {
  id: string;
  status: string;
  title: string;
  description: string;
  estimateAmount?: number;
  estimateDescription?: string;
  costBearer?: "LANDLORD" | "TENANT" | "PENDING";
  estimateApprovedAt?: string;
  estimateApprovalNote?: string;
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
      attachmentUrls: string[];
    }[];
  };
};

type Attachment = {
  id: string;
  fileUrl: string;
};

type RuntimeConfig = {
  demoAuth: {
    enabled: boolean;
  };
};

function costBearerLabel(costBearer?: "LANDLORD" | "TENANT" | "PENDING") {
  if (costBearer === "LANDLORD") {
    return "임대인 부담";
  }

  if (costBearer === "TENANT") {
    return "임차인 부담 가능성";
  }

  if (costBearer === "PENDING") {
    return "비용 주체 판단 대기";
  }

  return "비용 주체 미정";
}

const demoLogin = {
  email: "vendor@roomlog.test",
  password: "password123!"
};

const emptyLogin = {
  email: "",
  password: ""
};

const signupInitial = {
  email: "",
  password: "",
  passwordConfirm: "",
  name: "",
  phone: "",
  inviteToken: ""
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
    const body = await response.json().catch(() => undefined);
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function VendorApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("로그인 또는 회원가입이 필요합니다.");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [signupForm, setSignupForm] = useState(signupInitial);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);
  const [invitePreview, setInvitePreview] = useState<SignupInvitePreview | null>(null);
  const [invitePreviewStatus, setInvitePreviewStatus] = useState("");
  const [estimateAmount, setEstimateAmount] = useState(initialVendorEstimateAmount);
  const [estimateDescription, setEstimateDescription] = useState(initialVendorEstimateDescription);
  const [scheduledAt, setScheduledAt] = useState(initialVendorScheduleAt);
  const [completionNote, setCompletionNote] = useState(initialVendorCompletionNote);
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [vendorMessageText, setVendorMessageText] = useState(initialVendorMessageText);
  const [vendorMessageFiles, setVendorMessageFiles] = useState<File[]>([]);

  const selectedRepair = useMemo(
    () => repairs.find((repair) => repair.id === selectedId) ?? repairs[0],
    [repairs, selectedId]
  );
  const signupIssues = useMemo(
    () => vendorSignupIssues(signupForm, invitePreview),
    [signupForm, invitePreview]
  );
  const signupReady = canSubmitVendorSignup(signupForm, invitePreview);

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const data = await apiRequest<Repair[]>("/vendor/repairs", token);
    setRepairs(data);
    setSelectedId((current) => current || data[0]?.id || "");
  }

  useEffect(() => {
    let active = true;

    void apiRequest<RuntimeConfig>("/roomlog/runtime-config")
      .then((config) => {
        if (!active) {
          return;
        }

        setDemoAuthEnabled(config.demoAuth.enabled);
        if (config.demoAuth.enabled) {
          setLoginForm((current) =>
            current.email || current.password ? current : demoLogin
          );
        }
      })
      .catch(() => {
        if (active) {
          setDemoAuthEnabled(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const inviteToken = new URLSearchParams(window.location.search).get("inviteToken")?.trim();

    if (inviteToken) {
      window.localStorage.removeItem("roomlog.vendor.auth");
      setAuthMode("signup");
      setSignupForm((current) => ({ ...current, inviteToken }));
      setStatus("관리자 초대 토큰이 입력되었습니다. 업체 계정을 생성해주세요.");
      return;
    }

    const saved = window.localStorage.getItem("roomlog.vendor.auth");

    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved) as AuthResult;
    setAuth(parsed);
    setStatus(`${parsed.name} 업체 계정 연결됨`);
    void refresh(parsed.accessToken).catch(() => {
      window.localStorage.removeItem("roomlog.vendor.auth");
      setAuth(null);
      setStatus("세션이 만료되었습니다. 다시 로그인해주세요.");
    });
  }, []);

  useEffect(() => {
    if (auth || authMode !== "signup") {
      return;
    }

    const token = signupForm.inviteToken.trim();

    if (!token) {
      setInvitePreview(null);
      setInvitePreviewStatus("");
      return;
    }

    setInvitePreviewStatus("초대 확인 중");

    const timer = window.setTimeout(() => {
      void apiRequest<SignupInvitePreview>(
        `/auth/invites/VENDOR/${encodeURIComponent(token)}`
      )
        .then((preview) => {
          setInvitePreview(preview);
          setInvitePreviewStatus("");
          setSignupForm((current) => ({
            ...current,
            name: current.name || preview.expectedName,
            email: preview.email ?? current.email,
            phone: preview.phone ?? current.phone
          }));
          setStatus(`${preview.targetLabel} 초대가 확인되었습니다.`);
        })
        .catch((error) => {
          setInvitePreview(null);
          setInvitePreviewStatus(
            error instanceof Error ? error.message : "초대 확인 실패"
          );
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [auth, authMode, signupForm.inviteToken]);

  async function completeAuth(result: AuthResult) {
    setAuth(result);
    window.localStorage.setItem("roomlog.vendor.auth", JSON.stringify(result));
    setStatus(`${result.name} 업체 계정 연결됨`);
    await refresh(result.accessToken);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setStatus("로그인 확인 중");
      const result = await apiRequest<AuthResult>("/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      await completeAuth(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "로그인 실패");
    }
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!signupReady) {
      setStatus(invitePreviewStatus || signupIssues[0] || "회원가입 정보를 확인해주세요.");
      return;
    }

    try {
      setStatus("협력업체 계정 생성 중");
      const result = await apiRequest<AuthResult>("/auth/signup", undefined, {
        method: "POST",
        body: JSON.stringify(buildVendorSignupPayload(signupForm))
      });
      setSignupForm(signupInitial);
      await completeAuth(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "회원가입 실패");
    }
  }

  function logout() {
    window.localStorage.removeItem("roomlog.vendor.auth");
    setAuth(null);
    setRepairs([]);
    setSelectedId("");
    setStatus("로그아웃되었습니다.");
  }

  async function submitEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedRepair) {
      return;
    }

    const parsedEstimateAmount = Number(estimateAmount);

    if (
      !estimateAmount.trim() ||
      !estimateDescription.trim() ||
      !Number.isFinite(parsedEstimateAmount) ||
      parsedEstimateAmount <= 0
    ) {
      setStatus("견적 금액과 작업 설명을 입력해주세요.");
      return;
    }

    try {
      setStatus("견적 제출 중");
      await apiRequest(`/vendor/repairs/${selectedRepair.id}/estimate`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          estimateAmount: parsedEstimateAmount,
          estimateDescription: estimateDescription.trim()
        })
      });
      setEstimateAmount(initialVendorEstimateAmount());
      setEstimateDescription(initialVendorEstimateDescription());
      setStatus("견적이 제출되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "견적 제출 실패");
    }
  }

  async function scheduleRepair() {
    if (!auth || !selectedRepair) {
      return;
    }

    if (!scheduledAt.trim()) {
      setStatus("방문 일정을 입력해주세요.");
      return;
    }

    const scheduledDate = new Date(scheduledAt);

    if (Number.isNaN(scheduledDate.getTime())) {
      setStatus("방문 일정을 다시 확인해주세요.");
      return;
    }

    try {
      setStatus("방문 일정 저장 중");
      await apiRequest(`/vendor/repairs/${selectedRepair.id}/schedule`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: scheduledDate.toISOString()
        })
      });
      setScheduledAt(initialVendorScheduleAt());
      setStatus("방문 일정이 저장되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "방문 일정 저장 실패");
    }
  }

  async function uploadAttachment(file: File, token: string, category: string) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    const response = await fetch(apiUrl("/attachments"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
      throw new Error(message || `Upload failed with ${response.status}`);
    }

    return (await response.json()) as Attachment;
  }

  async function sendVendorMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedRepair) {
      return;
    }

    if (!vendorMessageText.trim() && vendorMessageFiles.length === 0) {
      setStatus("작업 메시지 또는 사진을 입력해주세요.");
      return;
    }

    try {
      setStatus("업체 메시지 저장 중");
      const uploaded = await Promise.all(
        vendorMessageFiles.map((file) => uploadAttachment(file, auth.accessToken, "WORK_PHOTO"))
      );
      await apiRequest(`/vendor/repairs/${selectedRepair.id}/messages`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          messageText: vendorMessageText.trim(),
          attachmentUrls: uploaded.map((item) => item.fileUrl)
        })
      });
      setVendorMessageText(initialVendorMessageText());
      setVendorMessageFiles([]);
      setStatus("업체 메시지가 티켓에 저장되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "업체 메시지 저장 실패");
    }
  }

  async function reportCompletion() {
    if (!auth || !selectedRepair) {
      return;
    }

    if (!completionNote.trim() && completionFiles.length === 0) {
      setStatus("완료 메모 또는 사진을 입력해주세요.");
      return;
    }

    try {
      setStatus(completionFiles.length ? "완료 사진 업로드 중" : "완료 보고 제출 중");
      const uploaded = await Promise.all(
        completionFiles.map((file) =>
          uploadAttachment(file, auth.accessToken, "COMPLETION_PHOTO")
        )
      );
      await apiRequest(`/vendor/repairs/${selectedRepair.id}/report-completion`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          completionNote: completionNote.trim(),
          completionPhotoUrls: uploaded.map((item) => item.fileUrl)
        })
      });
      setCompletionNote(initialVendorCompletionNote());
      setCompletionFiles([]);
      setStatus("완료 보고가 제출되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "완료 보고 실패");
    }
  }

  const canSubmitEstimate = selectedRepair
    ? ["REQUESTED", "ACCEPTED"].includes(selectedRepair.status)
    : false;
  const canSchedule = selectedRepair
    ? selectedRepair.status === "ESTIMATE_APPROVED"
    : false;
  const canReportCompletion = selectedRepair
    ? ["SCHEDULED", "IN_PROGRESS"].includes(selectedRepair.status)
    : false;

  if (!auth) {
    return (
      <main className="shell auth-shell">
        <section className="auth-hero">
          <p className="eyebrow">Roomlog Vendor</p>
          <h1>협력업체 작업 계정</h1>
          <p>배정된 수리 요청을 확인하고 견적, 방문 일정, 완료 보고를 제출합니다.</p>
        </section>

        <section className="auth-card" aria-label="업체 인증">
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              로그인
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => setAuthMode("signup")}
            >
              회원가입
            </button>
          </div>

          {authMode === "login" ? (
            <form onSubmit={submitLogin}>
              <label>
                이메일
                <input
                  type="email"
                  autoComplete="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm({ ...loginForm, password: event.target.value })
                  }
                />
              </label>
              <button type="submit" className="primary">
                로그인
              </button>
            </form>
          ) : (
            <form onSubmit={submitSignup}>
              <label>
                담당자명
                <input
                  value={signupForm.name}
                  onChange={(event) => setSignupForm({ ...signupForm, name: event.target.value })}
                />
              </label>
              <label>
                이메일
                <input
                  type="email"
                  autoComplete="email"
                  value={signupForm.email}
                  disabled={Boolean(invitePreview?.emailLocked)}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, email: event.target.value })
                  }
                />
              </label>
              <label>
                휴대폰
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={signupForm.phone}
                  disabled={Boolean(invitePreview?.phoneLocked)}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, phone: event.target.value })
                  }
                />
              </label>
              <label>
                초대 토큰
                <input
                  value={signupForm.inviteToken}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, inviteToken: event.target.value })
                  }
                />
              </label>
              {signupForm.inviteToken ? (
                <div
                  className={invitePreview ? "invite-preview" : "invite-preview pending"}
                  aria-live="polite"
                >
                  {invitePreview ? (
                    <>
                      <strong>{invitePreview.businessName ?? invitePreview.targetLabel}</strong>
                      <span>초대자: {invitePreview.invitedBy}</span>
                      {invitePreview.serviceArea ? (
                        <span>서비스 지역: {invitePreview.serviceArea}</span>
                      ) : null}
                      {invitePreview.email ? <span>이메일: {invitePreview.email}</span> : null}
                    </>
                  ) : (
                    <span>{invitePreviewStatus || "초대 확인 중"}</span>
                  )}
                </div>
              ) : null}
              <div
                className={signupReady ? "signup-checklist ready" : "signup-checklist"}
                aria-live="polite"
              >
                {signupReady ? (
                  <span>회원가입 정보를 확인했습니다.</span>
                ) : (
                  signupIssues.slice(0, 3).map((issue) => <span key={issue}>{issue}</span>)
                )}
              </div>
              <label>
                비밀번호
                <input
                  type="password"
                  autoComplete="new-password"
                  value={signupForm.password}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, password: event.target.value })
                  }
                />
              </label>
              <label>
                비밀번호 확인
                <input
                  type="password"
                  autoComplete="new-password"
                  value={signupForm.passwordConfirm}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, passwordConfirm: event.target.value })
                  }
                />
              </label>
              <button type="submit" className="primary" disabled={!signupReady}>
                업체 계정 만들기
              </button>
            </form>
          )}
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const result = await apiRequest<AuthResult>("/auth/login", undefined, {
                method: "POST",
                body: JSON.stringify(demoLogin)
              });
              await completeAuth(result);
            }}
          >
            테스트 업체 계정으로 시작
          </button>
          <p className="status-line">{status}</p>
        </section>
      </main>
    );
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
          <button type="button" className="ghost small" onClick={logout}>
            로그아웃
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
                  {selectedRepair.estimateAmount ? (
                    <div>
                      <dt>견적</dt>
                      <dd>
                        {selectedRepair.estimateAmount.toLocaleString()}원 ·{" "}
                        {costBearerLabel(selectedRepair.costBearer)}
                      </dd>
                    </div>
                  ) : null}
                  {selectedRepair.estimateApprovalNote ? (
                    <div>
                      <dt>승인 메모</dt>
                      <dd>{selectedRepair.estimateApprovalNote}</dd>
                    </div>
                  ) : null}
                </dl>
                {selectedRepair.status === "ESTIMATE_SUBMITTED" ? (
                  <p className="note">
                    관리자가 견적을 승인하면 방문 일정을 확정할 수 있습니다.
                  </p>
                ) : null}
              </div>
              <ol className="timeline">
                {selectedRepair.ticket.messages.map((message) => (
                  <li key={message.id}>
                    <span>{message.senderRole}</span>
                    <p>{message.messageText}</p>
                    {message.attachmentUrls.length ? (
                      <div className="timeline-attachments">
                        {message.attachmentUrls.map((url) => (
                          <a href={url} target="_blank" rel="noreferrer" key={url}>
                            <img src={url} alt="작업 메시지 첨부 사진" />
                          </a>
                        ))}
                      </div>
                    ) : null}
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
                placeholder="숫자만 입력"
                value={estimateAmount}
                onChange={(event) => setEstimateAmount(event.target.value)}
              />
            </label>
            <label>
              견적 설명
              <textarea
                rows={3}
                placeholder="작업 범위와 자재를 입력"
                value={estimateDescription}
                onChange={(event) => setEstimateDescription(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={!canSubmitEstimate}>
              견적 제출
            </button>
          </form>
          <label>
            방문 일정
            <input
              type="datetime-local"
              placeholder="방문 일시 선택"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <button type="button" className="secondary" disabled={!canSchedule} onClick={() => void scheduleRepair()}>
            일정 저장
          </button>
          <form onSubmit={sendVendorMessage}>
            <label>
              작업 메시지
              <textarea
                rows={3}
                placeholder="현장 확인 사항 입력"
                value={vendorMessageText}
                onChange={(event) => setVendorMessageText(event.target.value)}
              />
            </label>
            <label>
              작업 사진
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  setVendorMessageFiles(Array.from(event.target.files ?? []))
                }
              />
            </label>
            {vendorMessageFiles.length ? (
              <p className="file-note">
                {vendorMessageFiles.map((file) => file.name).join(", ")}
              </p>
            ) : null}
            <button type="submit" className="secondary" disabled={!selectedRepair}>
              메시지 저장
            </button>
          </form>
          <label>
            완료 메모
            <textarea
              rows={3}
              placeholder="완료 내용 입력"
              value={completionNote}
              onChange={(event) => setCompletionNote(event.target.value)}
            />
          </label>
          <label>
            완료 사진
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setCompletionFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          {completionFiles.length ? (
            <p className="file-note">{completionFiles.map((file) => file.name).join(", ")}</p>
          ) : null}
          <button type="button" className="primary" disabled={!canReportCompletion} onClick={() => void reportCompletion()}>
            완료 보고
          </button>
        </section>
      </div>
    </main>
  );
}
