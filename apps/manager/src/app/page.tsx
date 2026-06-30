"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

type Vendor = {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  activeJobs: number;
};

type VendorInvite = {
  id: string;
  inviteToken: string;
  email?: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  signupUrl: string;
  createdAt: string;
  acceptedAt?: string;
};

type ManagedRoom = {
  id: string;
  buildingName: string;
  roomNo: string;
  address?: string;
};

type TenantInvite = {
  id: string;
  inviteToken: string;
  roomId: string;
  email?: string;
  tenantName: string;
  phone?: string;
  moveInDate?: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  signupUrl: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
  room?: ManagedRoom;
};

type ManagerProfile = {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  managedRooms?: ManagedRoom[];
};

type RoomTimelineEntry = {
  id: string;
  type:
    | "MOVE_IN_CHECKLIST"
    | "AI_FEEDBACK"
    | "INTAKE_SESSION"
    | "COMPLAINT"
    | "STATUS_CHANGE"
    | "MESSAGE"
    | "REPAIR";
  title: string;
  description: string;
  createdAt: string;
  status?: string;
  attachmentUrls: string[];
};

type AiFeedbackTarget = "SUMMARY" | "CATEGORY" | "PRIORITY" | "RESPONSIBILITY" | "COMPLETION";

type AiFeedback = {
  id: string;
  target: AiFeedbackTarget;
  targetLabel: string;
  originalValue: string;
  reason: string;
  requestedAction?: string;
  attachmentUrls: string[];
  status: "OPEN" | "REVIEWED";
  managerReviewNote?: string;
  correctedValue?: string;
  reviewedAt?: string;
  createdAt: string;
};

type Ticket = {
  id: string;
  status: string;
  sourceChannel: string;
  category: string;
  priority: number;
  responsibilityHint: string;
  aiSummary: string;
  analysis?: {
    reasons?: string[];
    recommendedAction?: string;
    confidenceScore?: number;
    photoAnalysis?: {
      attachmentUrls: string[];
      previousAttachmentUrls: string[];
      candidates: string[];
      comparisonStatus: string;
      summary: string;
      evidence: string[];
      recommendedRetake: boolean;
    };
  };
  aiFeedback: AiFeedback[];
  dueAt?: string;
  complaint: {
    id: string;
    title: string;
    description: string;
    location: string;
    availableTimes?: string;
  };
  room?: {
    id: string;
    buildingName: string;
    roomNo: string;
  };
  assignedVendor?: Vendor;
  repairs: {
    id: string;
    status: string;
    estimateAmount?: number;
    estimateDescription?: string;
    costBearer?: "LANDLORD" | "TENANT" | "PENDING";
    estimateApprovedAt?: string;
    estimateApprovalNote?: string;
    scheduledAt?: string;
    completionNote?: string;
  }[];
  messages: {
    id: string;
    senderRole: string;
    messageText: string;
    attachmentUrls: string[];
    createdAt?: string;
  }[];
  history: {
    id: string;
    toStatus: string;
    note?: string;
  }[];
  roomTimeline?: RoomTimelineEntry[];
  callbot?: {
    hasRecording: boolean;
    recordingUrl?: string;
    transcriptText: string;
    aiSummary: string;
    needPhoto: boolean;
    photoUploadUrl?: string;
    statusNote: string;
  };
};

type ManagerAssistantResult = {
  question: string;
  answer: string;
  scope: string;
  filters: string[];
  matchedTickets: {
    ticketId: string;
    complaintId: string;
    title: string;
    roomLabel: string;
    status: string;
    displayStatus: string;
    sourceChannel: string;
    priority: number;
    category: string;
    summary: string;
    dueAt?: string;
  }[];
  nextActions: string[];
  generatedAt: string;
};

type ManagerReplyIntent =
  | "RECEIPT_ACK"
  | "REQUEST_PHOTO"
  | "REQUEST_DETAILS"
  | "SCHEDULE_VISIT"
  | "ASSIGN_VENDOR_NOTICE"
  | "COMPLETION_NOTICE";

type ManagerReplyDraft = {
  ticketId: string;
  complaintId: string;
  intent: ManagerReplyIntent;
  subject: string;
  messageText: string;
  deliveryChannels: string[];
  requiresTenantAction: boolean;
  tenantActionLabel?: string;
  evidence: string[];
  warnings: string[];
  generatedAt: string;
};

type RuntimeConfig = {
  demoAuth: {
    enabled: boolean;
  };
};

const replyIntentOptions: { value: ManagerReplyIntent; label: string }[] = [
  { value: "RECEIPT_ACK", label: "접수 안내" },
  { value: "REQUEST_PHOTO", label: "사진 요청" },
  { value: "REQUEST_DETAILS", label: "설명 요청" },
  { value: "SCHEDULE_VISIT", label: "방문 조율" },
  { value: "ASSIGN_VENDOR_NOTICE", label: "업체 안내" },
  { value: "COMPLETION_NOTICE", label: "완료 안내" }
];

const demoLogin = {
  email: "manager@roomlog.test",
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
  buildingName: "",
  roomNo: "",
  address: ""
};

const inviteInitial = {
  email: "",
  businessName: "",
  contactPerson: "",
  phone: "",
  serviceArea: ""
};

const tenantInviteInitial = {
  roomId: "",
  email: "",
  tenantName: "",
  phone: "",
  moveInDate: ""
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

function timelineTypeLabel(type: RoomTimelineEntry["type"]) {
  const labels: Record<RoomTimelineEntry["type"], string> = {
    MOVE_IN_CHECKLIST: "입주 기록",
    AI_FEEDBACK: "이의제기",
    INTAKE_SESSION: "AI 상담",
    COMPLAINT: "민원",
    STATUS_CHANGE: "상태",
    MESSAGE: "메시지",
    REPAIR: "수리"
  };

  return labels[type];
}

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

function inviteHref(signupUrl: string, vendorOrigin: string) {
  if (!vendorOrigin) {
    return signupUrl;
  }

  return `${vendorOrigin}${signupUrl}`;
}

export default function ManagerApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [managedRooms, setManagedRooms] = useState<ManagedRoom[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorInvites, setVendorInvites] = useState<VendorInvite[]>([]);
  const [tenantInvites, setTenantInvites] = useState<TenantInvite[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("로그인 또는 회원가입이 필요합니다.");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [signupForm, setSignupForm] = useState(signupInitial);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);
  const [inviteForm, setInviteForm] = useState(inviteInitial);
  const [tenantInviteForm, setTenantInviteForm] = useState(tenantInviteInitial);
  const [tenantOrigin, setTenantOrigin] = useState("");
  const [vendorOrigin, setVendorOrigin] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState(
    "콜봇으로 접수된 미처리 민원만 보여줘"
  );
  const [assistantResult, setAssistantResult] = useState<ManagerAssistantResult | null>(null);
  const [replyIntent, setReplyIntent] = useState<ManagerReplyIntent>("REQUEST_PHOTO");
  const [replyDraft, setReplyDraft] = useState<ManagerReplyDraft | null>(null);
  const [replyText, setReplyText] = useState("");
  const [feedbackReviewNote, setFeedbackReviewNote] = useState("세입자 이의제기 내용을 검토했습니다.");
  const [feedbackCorrectedSummary, setFeedbackCorrectedSummary] = useState("");
  const [feedbackCorrectedPriority, setFeedbackCorrectedPriority] = useState("2");
  const [feedbackCorrectedResponsibility, setFeedbackCorrectedResponsibility] =
    useState("판단 어려움");

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0],
    [selectedId, tickets]
  );

  useEffect(() => {
    setReplyDraft(null);
    setReplyText("");

    if (selectedTicket?.status === "COMPLETION_REPORTED") {
      setReplyIntent("COMPLETION_NOTICE");
    } else if (selectedTicket?.assignedVendor) {
      setReplyIntent("ASSIGN_VENDOR_NOTICE");
    } else if (selectedTicket?.callbot?.needPhoto) {
      setReplyIntent("REQUEST_PHOTO");
    } else {
      setReplyIntent("RECEIPT_ACK");
    }
    setFeedbackReviewNote("세입자 이의제기 내용을 검토했습니다.");
    setFeedbackCorrectedSummary(selectedTicket?.aiSummary ?? "");
    setFeedbackCorrectedPriority(`${selectedTicket?.priority ?? 2}`);
    setFeedbackCorrectedResponsibility(selectedTicket?.responsibilityHint ?? "판단 어려움");
  }, [selectedTicket?.id]);

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const [profileData, ticketData, vendorData, vendorInviteData, tenantInviteData] = await Promise.all([
      apiRequest<ManagerProfile>("/auth/me", token),
      apiRequest<Ticket[]>("/manager/tickets", token),
      apiRequest<Vendor[]>("/manager/vendors", token),
      apiRequest<VendorInvite[]>("/manager/vendors/invites", token),
      apiRequest<TenantInvite[]>("/manager/tenants/invites", token)
    ]);
    setManagedRooms(profileData.managedRooms ?? []);
    setTickets(ticketData);
    setVendors(vendorData);
    setVendorInvites(vendorInviteData);
    setTenantInvites(tenantInviteData);
    setTenantInviteForm((current) => ({
      ...current,
      roomId:
        current.roomId ||
        profileData.managedRooms?.[0]?.id ||
        ticketData[0]?.room?.id ||
        tenantInviteData[0]?.roomId ||
        ""
    }));
    setSelectedId((current) => current || ticketData[0]?.id || "");
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
    const { protocol, hostname, port, origin } = window.location;
    setVendorOrigin(port === "3002" ? `${protocol}//${hostname}:3003` : origin);
    setTenantOrigin(port === "3002" ? `${protocol}//${hostname}:3001` : origin);

    const saved = window.localStorage.getItem("roomlog.manager.auth");

    if (!saved) {
      return;
    }

    const parsed = JSON.parse(saved) as AuthResult;
    setAuth(parsed);
    setStatus(`${parsed.name} 관리자 계정 연결됨`);
    void refresh(parsed.accessToken).catch(() => {
      window.localStorage.removeItem("roomlog.manager.auth");
      setAuth(null);
      setStatus("세션이 만료되었습니다. 다시 로그인해주세요.");
    });
  }, []);

  async function completeAuth(result: AuthResult) {
    setAuth(result);
    window.localStorage.setItem("roomlog.manager.auth", JSON.stringify(result));
    setStatus(`${result.name} 관리자 계정 연결됨`);
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
    try {
      setStatus("관리자 계정 생성 중");
      const result = await apiRequest<AuthResult>("/auth/signup", undefined, {
        method: "POST",
        body: JSON.stringify({ ...signupForm, role: "LANDLORD" })
      });
      setSignupForm(signupInitial);
      await completeAuth(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "회원가입 실패");
    }
  }

  function logout() {
    window.localStorage.removeItem("roomlog.manager.auth");
    setAuth(null);
    setTickets([]);
    setManagedRooms([]);
    setVendors([]);
    setVendorInvites([]);
    setTenantInvites([]);
    setSelectedId("");
    setStatus("로그아웃되었습니다.");
  }

  async function submitVendorInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      return;
    }

    try {
      setStatus("협력업체 초대 생성 중");
      const invite = await apiRequest<VendorInvite>("/manager/vendors/invites", auth.accessToken, {
        method: "POST",
        body: JSON.stringify(inviteForm)
      });
      setInviteForm(inviteInitial);
      setStatus(`${invite.businessName} 초대 링크가 생성되었습니다.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "업체 초대 실패");
    }
  }

  async function submitTenantInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      return;
    }

    try {
      setStatus("임차인 초대 생성 중");
      const invite = await apiRequest<TenantInvite>("/manager/tenants/invites", auth.accessToken, {
        method: "POST",
        body: JSON.stringify(tenantInviteForm)
      });
      setTenantInviteForm({ ...tenantInviteInitial, roomId: invite.roomId });
      setStatus(`${invite.tenantName} 임차인 초대 링크가 생성되었습니다.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "임차인 초대 실패");
    }
  }

  async function submitManagerAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      return;
    }

    try {
      setStatus("AI 운영 질의 분석 중");
      const result = await apiRequest<ManagerAssistantResult>(
        "/manager/assistant/query",
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ question: assistantQuestion })
        }
      );
      setAssistantResult(result);
      setSelectedId((current) => result.matchedTickets[0]?.ticketId || current);
      setStatus(`AI 운영 질의 결과 ${result.matchedTickets.length}건`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 운영 질의 실패");
    }
  }

  async function createManagerReplyDraft(intent = replyIntent) {
    if (!auth || !selectedTicket) {
      return;
    }

    try {
      setStatus("AI 답변 초안 생성 중");
      const draft = await apiRequest<ManagerReplyDraft>(
        `/manager/tickets/${selectedTicket.id}/reply-draft`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ intent })
        }
      );
      setReplyIntent(draft.intent);
      setReplyDraft(draft);
      setReplyText(draft.messageText);
      setStatus("AI 답변 초안이 준비되었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 답변 초안 생성 실패");
    }
  }

  async function sendManagerReply() {
    if (!auth || !selectedTicket) {
      return;
    }

    const needsTenantAction =
      replyDraft?.requiresTenantAction ??
      ["REQUEST_PHOTO", "REQUEST_DETAILS", "SCHEDULE_VISIT"].includes(replyIntent);

    try {
      setStatus("관리자 답변 전송 중");
      await apiRequest(`/manager/tickets/${selectedTicket.id}/replies`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          action: needsTenantAction ? "REQUEST_ADDITIONAL_INFO" : "SEND_REPLY",
          messageText: replyText
        })
      });
      setReplyDraft(null);
      setReplyText("");
      setStatus(needsTenantAction ? "추가 정보 요청이 전송되었습니다." : "관리자 답변이 전송되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "관리자 답변 전송 실패");
    }
  }

  async function reviewAiFeedback(event: FormEvent<HTMLFormElement>, feedback: AiFeedback) {
    event.preventDefault();

    if (!auth || !selectedTicket) {
      return;
    }

    try {
      setStatus("AI 이의제기 검토 결과 저장 중");
      const updated = await apiRequest<Ticket>(
        `/manager/tickets/${selectedTicket.id}/ai-feedback/${feedback.id}/review`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            managerReviewNote: feedbackReviewNote,
            correctedSummary: feedbackCorrectedSummary,
            correctedPriority: Number(feedbackCorrectedPriority),
            correctedResponsibilityHint: feedbackCorrectedResponsibility
          })
        }
      );
      setSelectedId(updated.id);
      setStatus("AI 이의제기 검토 결과가 저장되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 이의제기 검토 실패");
    }
  }

  async function approveEstimate() {
    if (!auth || !estimateReviewRepair) {
      return;
    }

    try {
      setStatus("견적 승인 중");
      await apiRequest(
        `/manager/repairs/${estimateReviewRepair.id}/approve-estimate`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            costBearer: "LANDLORD",
            note: "관리자 검토 후 임대인 부담으로 승인"
          })
        }
      );
      setStatus("견적이 승인되었습니다. 업체가 방문 일정을 확정할 수 있습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "견적 승인 실패");
    }
  }

  async function runAction(label: string, path: string, body: object) {
    if (!auth) {
      return;
    }

    try {
      setStatus(`${label} 처리 중`);
      await apiRequest(path, auth.accessToken, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setStatus(`${label} 완료`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label} 실패`);
    }
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
  const estimateReviewRepair = selectedTicket?.repairs.find(
    (repair) => repair.status === "ESTIMATE_SUBMITTED"
  );
  const canAssignVendor = selectedTicket
    ? ["RECEIVED", "REVIEWING", "ADDITIONAL_INFO_REQUESTED", "VENDOR_ASSIGNMENT_PENDING"].includes(
        selectedTicket.status
      )
    : false;
  const canApproveEstimate = Boolean(estimateReviewRepair);
  const canApproveCompletion = selectedTicket?.status === "COMPLETION_REPORTED";

  if (!auth) {
    return (
      <main className="shell auth-shell">
        <section className="auth-hero">
          <p className="eyebrow">Roomlog Manager</p>
          <h1>티켓 운영 계정</h1>
          <p>관리자 계정으로 접수 티켓, AI 분석, 협력업체 배정을 운영합니다.</p>
        </section>

        <section className="auth-card" aria-label="관리자 인증">
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
                  value={loginForm.email}
                  onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
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
                이름
                <input
                  value={signupForm.name}
                  onChange={(event) => setSignupForm({ ...signupForm, name: event.target.value })}
                />
              </label>
              <label>
                이메일
                <input
                  value={signupForm.email}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, email: event.target.value })
                  }
                />
              </label>
              <label>
                휴대폰
                <input
                  value={signupForm.phone}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, phone: event.target.value })
                  }
                />
              </label>
              <label>
                관리 건물명
                <input
                  value={signupForm.buildingName}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, buildingName: event.target.value })
                  }
                />
              </label>
              <label>
                첫 관리 호실
                <input
                  value={signupForm.roomNo}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, roomNo: event.target.value })
                  }
                />
              </label>
              <label>
                건물 주소
                <input
                  value={signupForm.address}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, address: event.target.value })
                  }
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
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
                  value={signupForm.passwordConfirm}
                  onChange={(event) =>
                    setSignupForm({ ...signupForm, passwordConfirm: event.target.value })
                  }
                />
              </label>
              <button type="submit" className="primary">
                관리자 계정 만들기
              </button>
            </form>
          )}
          {demoAuthEnabled ? (
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
              테스트 관리자 계정으로 시작
            </button>
          ) : null}
          <p className="status-line">{status}</p>
        </section>
      </main>
    );
  }

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
          <button type="button" className="ghost small" onClick={logout}>
            로그아웃
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

      <section className="panel manager-assistant" aria-label="AI 운영 질의">
        <div className="panel-heading compact">
          <p className="eyebrow">AI Operations</p>
          <h2>운영 데이터 질의</h2>
        </div>
        <form onSubmit={submitManagerAssistant} className="assistant-form">
          <input
            value={assistantQuestion}
            onChange={(event) => setAssistantQuestion(event.target.value)}
            placeholder="예: 콜봇으로 접수된 미처리 민원만 보여줘"
          />
          <button type="submit" className="primary">
            질의
          </button>
        </form>
        {assistantResult ? (
          <div className="assistant-result">
            <p>{assistantResult.answer}</p>
            <small>{assistantResult.scope}</small>
            <div className="assistant-filters">
              {assistantResult.filters.map((filter) => (
                <span key={filter}>{filter}</span>
              ))}
            </div>
            {assistantResult.matchedTickets.length ? (
              <div className="assistant-matches">
                {assistantResult.matchedTickets.map((ticket) => (
                  <button
                    type="button"
                    key={ticket.ticketId}
                    onClick={() => setSelectedId(ticket.ticketId)}
                  >
                    <span>{ticket.displayStatus}</span>
                    <strong>{ticket.title}</strong>
                    <small>
                      {ticket.roomLabel} · {ticket.sourceChannel} · P{ticket.priority}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}
            <ul>
              {assistantResult.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        ) : null}
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
                    {ticket.room?.roomNo} · {ticket.sourceChannel} · P{ticket.priority}
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
                    <dt>접수 채널</dt>
                    <dd>{selectedTicket.sourceChannel}</dd>
                  </div>
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
                {selectedTicket.callbot ? (
                  <section className="callbot-context" aria-label="콜봇 접수 기록">
                    <div className="callbot-heading">
                      <div>
                        <h3>콜봇 접수 기록</h3>
                        <p>{selectedTicket.callbot.statusNote}</p>
                      </div>
                      <span>{selectedTicket.callbot.needPhoto ? "사진 필요" : "사진 확인됨"}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>통화 기록</dt>
                        <dd>
                          {selectedTicket.callbot.recordingUrl ? (
                            <a
                              href={selectedTicket.callbot.recordingUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              저장됨
                            </a>
                          ) : (
                            "확인 필요"
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>전사 내용</dt>
                        <dd>{selectedTicket.callbot.transcriptText}</dd>
                      </div>
                      <div>
                        <dt>AI 요약</dt>
                        <dd>{selectedTicket.callbot.aiSummary}</dd>
                      </div>
                      {selectedTicket.callbot.photoUploadUrl ? (
                        <div>
                          <dt>업로드 링크</dt>
                          <dd>{selectedTicket.callbot.photoUploadUrl}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>
                ) : null}
                <div className="evidence">
                  <h3>AI 판단 근거</h3>
                  {selectedTicket.analysis?.reasons?.length ? (
                    <ul>
                      {selectedTicket.analysis.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>접수 대화와 첨부 자료를 기준으로 관리자 검토가 필요합니다.</p>
                  )}
                  {selectedTicket.analysis?.photoAnalysis ? (
                    <div className="photo-analysis">
                      <h3>사진 분석</h3>
                      <p>{selectedTicket.analysis.photoAnalysis.summary}</p>
                      <ul>
                        <li>
                          문제 후보:{" "}
                          {selectedTicket.analysis.photoAnalysis.candidates.join(", ") ||
                            "관리자 확인 필요"}
                        </li>
                        <li>
                          비교 상태: {selectedTicket.analysis.photoAnalysis.comparisonStatus}
                        </li>
                        {selectedTicket.analysis.photoAnalysis.evidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      {selectedTicket.analysis.photoAnalysis.attachmentUrls.length ? (
                        <div className="attachment-preview">
                          {selectedTicket.analysis.photoAnalysis.attachmentUrls.map((url) => (
                            <a href={url} target="_blank" rel="noreferrer" key={url}>
                              <img src={url} alt="현재 접수 사진" />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {selectedTicket.analysis.photoAnalysis.previousAttachmentUrls.length ? (
                        <div className="attachment-preview previous">
                          {selectedTicket.analysis.photoAnalysis.previousAttachmentUrls.map(
                            (url) => (
                              <a href={url} target="_blank" rel="noreferrer" key={url}>
                                <img src={url} alt="과거 비교 사진" />
                              </a>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedTicket.analysis?.recommendedAction ? (
                    <p>{selectedTicket.analysis.recommendedAction}</p>
                  ) : null}
                </div>
                {selectedTicket.aiFeedback?.length ? (
                  <section className="ai-feedback-review" aria-label="세입자 AI 판단 이의제기">
                    <div className="feedback-heading">
                      <div>
                        <h3>세입자 이의제기</h3>
                        <p>AI 판단과 다르다고 세입자가 기존 티켓에 남긴 정정 요청입니다.</p>
                      </div>
                      <span>{selectedTicket.aiFeedback.length}건</span>
                    </div>
                    <ul>
                      {selectedTicket.aiFeedback.map((feedback) => (
                        <li key={feedback.id}>
                          <strong>
                            {feedback.targetLabel} ·{" "}
                            {feedback.status === "OPEN" ? "검토 필요" : "검토 완료"}
                          </strong>
                          <dl>
                            <div>
                              <dt>기존값</dt>
                              <dd>{feedback.originalValue}</dd>
                            </div>
                            <div>
                              <dt>요청</dt>
                              <dd>{feedback.requestedAction ?? "관리자 재검토"}</dd>
                            </div>
                          </dl>
                          <p>{feedback.reason}</p>
                          {feedback.attachmentUrls.length ? (
                            <div className="attachment-preview">
                              {feedback.attachmentUrls.map((url) => (
                                <a href={url} target="_blank" rel="noreferrer" key={url}>
                                  <img src={url} alt="이의제기 첨부 사진" />
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {feedback.status === "REVIEWED" ? (
                            <div className="feedback-result">
                              {feedback.managerReviewNote ? (
                                <p>검토 결과: {feedback.managerReviewNote}</p>
                              ) : null}
                              {feedback.correctedValue ? (
                                <p>반영 내용: {feedback.correctedValue}</p>
                              ) : null}
                            </div>
                          ) : (
                            <form
                              className="feedback-review-form"
                              onSubmit={(event) => void reviewAiFeedback(event, feedback)}
                            >
                              <label>
                                검토 결과
                                <textarea
                                  rows={3}
                                  value={feedbackReviewNote}
                                  onChange={(event) => setFeedbackReviewNote(event.target.value)}
                                />
                              </label>
                              <label>
                                보정 요약
                                <textarea
                                  rows={3}
                                  value={feedbackCorrectedSummary}
                                  onChange={(event) =>
                                    setFeedbackCorrectedSummary(event.target.value)
                                  }
                                />
                              </label>
                              <div className="feedback-review-grid">
                                <label>
                                  긴급도
                                  <select
                                    value={feedbackCorrectedPriority}
                                    onChange={(event) =>
                                      setFeedbackCorrectedPriority(event.target.value)
                                    }
                                  >
                                    <option value="1">P1 긴급</option>
                                    <option value="2">P2 우선</option>
                                    <option value="3">P3 일반</option>
                                    <option value="4">P4 문의</option>
                                  </select>
                                </label>
                                <label>
                                  책임 가능성
                                  <select
                                    value={feedbackCorrectedResponsibility}
                                    onChange={(event) =>
                                      setFeedbackCorrectedResponsibility(event.target.value)
                                    }
                                  >
                                    <option value="임대인 책임 가능성">임대인 책임 가능성</option>
                                    <option value="임차인 책임 가능성">임차인 책임 가능성</option>
                                    <option value="판단 어려움">판단 어려움</option>
                                  </select>
                                </label>
                              </div>
                              <button type="submit" className="primary">
                                검토 저장
                              </button>
                            </form>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
              <div className="reply-composer" aria-label="AI 답변 초안">
                <div className="reply-heading">
                  <div>
                    <p className="eyebrow">AI Reply</p>
                    <h3>{replyDraft?.subject ?? "관리자 답변 초안"}</h3>
                  </div>
                  {replyDraft?.requiresTenantAction ? (
                    <span>{replyDraft.tenantActionLabel ?? "세입자 확인 필요"}</span>
                  ) : null}
                </div>
                <div className="reply-controls">
                  <label>
                    유형
                    <select
                      value={replyIntent}
                      onChange={(event) =>
                        setReplyIntent(event.target.value as ManagerReplyIntent)
                      }
                    >
                      {replyIntentOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => void createManagerReplyDraft()}
                  >
                    초안 생성
                  </button>
                </div>
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder="AI 초안을 생성하거나 관리자 답변을 직접 입력하세요."
                  rows={7}
                />
                {replyDraft ? (
                  <div className="reply-context">
                    <div>
                      {replyDraft.deliveryChannels.map((channel) => (
                        <span key={channel}>{channel}</span>
                      ))}
                    </div>
                    <ul>
                      {replyDraft.evidence.slice(0, 4).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {replyDraft.warnings.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="primary"
                  disabled={!replyText.trim()}
                  onClick={() => void sendManagerReply()}
                >
                  답변 전송
                </button>
              </div>
              <div className="actions">
                <button type="button" onClick={() => void confirmAnalysis()}>
                  분석 확정
                </button>
                <button
                  type="button"
                  disabled={!selectedVendor || !canAssignVendor}
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
                  disabled={!canApproveEstimate}
                  onClick={() => void approveEstimate()}
                >
                  견적 승인
                </button>
                <button
                  type="button"
                  disabled={!canApproveCompletion}
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
              {selectedTicket.roomTimeline?.length ? (
                <>
                  <div className="panel-heading compact">
                    <p className="eyebrow">Room Context</p>
                    <h2>호실 통합 기록</h2>
                    <small>
                      {selectedTicket.room?.buildingName} {selectedTicket.room?.roomNo}
                    </small>
                  </div>
                  <ol className="timeline room-timeline">
                    {selectedTicket.roomTimeline.slice(0, 8).map((entry) => (
                      <li key={entry.id}>
                        <span>
                          {timelineTypeLabel(entry.type)}
                          {entry.status ? ` · ${entry.status}` : ""}
                        </span>
                        <p>{entry.description || entry.title}</p>
                        {entry.attachmentUrls.length ? (
                          <div className="timeline-attachments">
                            {entry.attachmentUrls.map((url) => (
                              <a href={url} target="_blank" rel="noreferrer" key={url}>
                                <img src={url} alt="호실 기록 첨부 사진" />
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              <ol className="timeline">
                {selectedTicket.history.map((item) => (
                  <li key={item.id}>
                    <span>{item.toStatus}</span>
                    <p>{item.note ?? "상태 변경"}</p>
                  </li>
                ))}
                {selectedTicket.messages.map((message) => (
                  <li key={message.id}>
                    <span>{message.senderRole}</span>
                    <p>{message.messageText}</p>
                    {message.attachmentUrls.length ? (
                      <div className="timeline-attachments">
                        {message.attachmentUrls.map((url) => (
                          <a href={url} target="_blank" rel="noreferrer" key={url}>
                            <img src={url} alt="티켓 첨부 사진" />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
                {selectedTicket.repairs.map((repair) => (
                  <li key={repair.id}>
                    <span>{repair.status}</span>
                    <p>
                      {repair.estimateAmount
                        ? `${repair.estimateAmount.toLocaleString()}원 · ${repair.estimateDescription} · ${costBearerLabel(repair.costBearer)}`
                        : repair.completionNote ?? repair.scheduledAt ?? "업체 작업 대기"}
                      {repair.estimateApprovalNote ? ` · ${repair.estimateApprovalNote}` : ""}
                      {repair.scheduledAt ? ` · 방문 ${repair.scheduledAt}` : ""}
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
              <div className="vendor-invite">
                <div className="panel-heading compact">
                  <p className="eyebrow">Tenant Invite</p>
                  <h2>임차인 초대</h2>
                </div>
                <form onSubmit={submitTenantInvite} className="invite-form">
                  <label>
                    연결 호실
                    <select
                      value={tenantInviteForm.roomId}
                      onChange={(event) =>
                        setTenantInviteForm({ ...tenantInviteForm, roomId: event.target.value })
                      }
                    >
                      <option value="">호실 선택</option>
                      {managedRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.buildingName} {room.roomNo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    임차인 이름
                    <input
                      value={tenantInviteForm.tenantName}
                      onChange={(event) =>
                        setTenantInviteForm({
                          ...tenantInviteForm,
                          tenantName: event.target.value
                        })
                      }
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      value={tenantInviteForm.email}
                      onChange={(event) =>
                        setTenantInviteForm({ ...tenantInviteForm, email: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    휴대폰
                    <input
                      value={tenantInviteForm.phone}
                      onChange={(event) =>
                        setTenantInviteForm({ ...tenantInviteForm, phone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    입주일
                    <input
                      type="date"
                      value={tenantInviteForm.moveInDate}
                      onChange={(event) =>
                        setTenantInviteForm({
                          ...tenantInviteForm,
                          moveInDate: event.target.value
                        })
                      }
                    />
                  </label>
                  <button type="submit" className="primary">
                    임차인 초대 생성
                  </button>
                </form>
                <div className="invite-list">
                  {tenantInvites.length ? (
                    tenantInvites.map((invite) => (
                      <div key={invite.id}>
                        <strong>
                          {invite.tenantName} ·{" "}
                          {invite.room
                            ? `${invite.room.buildingName} ${invite.room.roomNo}`
                            : invite.roomId}
                        </strong>
                        <span>{invite.status}</span>
                        <a
                          href={inviteHref(invite.signupUrl, tenantOrigin)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {inviteHref(invite.signupUrl, tenantOrigin)}
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="empty">아직 생성한 임차인 초대가 없습니다.</p>
                  )}
                </div>
              </div>
              <div className="vendor-invite">
                <div className="panel-heading compact">
                  <p className="eyebrow">Vendor Invite</p>
                  <h2>업체 초대</h2>
                </div>
                <form onSubmit={submitVendorInvite} className="invite-form">
                  <label>
                    업체명
                    <input
                      value={inviteForm.businessName}
                      onChange={(event) =>
                        setInviteForm({ ...inviteForm, businessName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    담당자
                    <input
                      value={inviteForm.contactPerson}
                      onChange={(event) =>
                        setInviteForm({ ...inviteForm, contactPerson: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    연락처
                    <input
                      value={inviteForm.phone}
                      onChange={(event) =>
                        setInviteForm({ ...inviteForm, phone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    서비스 지역
                    <input
                      value={inviteForm.serviceArea}
                      onChange={(event) =>
                        setInviteForm({ ...inviteForm, serviceArea: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      value={inviteForm.email}
                      onChange={(event) =>
                        setInviteForm({ ...inviteForm, email: event.target.value })
                      }
                    />
                  </label>
                  <button type="submit" className="primary">
                    초대 생성
                  </button>
                </form>
                <div className="invite-list">
                  {vendorInvites.length ? (
                    vendorInvites.map((invite) => (
                      <div key={invite.id}>
                        <strong>{invite.businessName}</strong>
                        <span>{invite.status}</span>
                        <a
                          href={inviteHref(invite.signupUrl, vendorOrigin)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {inviteHref(invite.signupUrl, vendorOrigin)}
                        </a>
                      </div>
                    ))
                  ) : (
                    <p className="empty">아직 생성한 업체 초대가 없습니다.</p>
                  )}
                </div>
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
