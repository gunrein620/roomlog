"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  intakeModeConfig,
  intakeModeOptions,
  intakeSessionPayload,
  idleRealtimeStatusForMode,
  intakeModeForSourceChannel,
  messageInputModeForMode,
  realtimeOpeningPromptForMode,
  realtimeOpeningPromptForSourceChannel,
  realtimePurposeForSourceChannel,
  type IntakeMode
} from "./intake-mode";
import {
  buildTenantSignupPayload,
  canSubmitTenantSignup,
  tenantSignupIssues,
  visibleTenantSignupIssues
} from "./tenant-signup";
import { ensureTenantAuth, type AuthResult } from "./auth-role";
import {
  intakeSlotProgress,
  intakeSlotStatusLabel,
  type TenantIntakeSlot
} from "./intake-slot-progress";
import {
  normalizeSelectedPhotos,
  photoUploadStatus,
  selectedPhotoSummary
} from "./photo-selection";
import { missingPhotoLabel, photoEvidenceItems } from "./photo-evidence";
import {
  applyRealtimeEventToTurn,
  buildRealtimeConnectionOpenEvents,
  emptyRealtimeTurnState,
  realtimeDisconnectFlushRequest,
  type RealtimeEventPayload
} from "./realtime-events";
import {
  beginRealtimeTurnPersist,
  completeRealtimeTurnPersist,
  emptyRealtimePersistState
} from "./realtime-persist";
import {
  appendQuestionAnswerPrompt,
  appendQuestionReplyPrompt,
  suggestedAnswersForQuestion
} from "./question-reply";
import {
  consultationThreadBadges,
  consultationThreadFilterCountLabel,
  consultationThreadFilterOptions,
  consultationThreadNextAction,
  filterConsultationThreads,
  type ConsultationThreadFilter
} from "./thread-workflow";
import { emptyConsultationState } from "./empty-consultation";
import { consultationThreadContextHighlights } from "./thread-context";
import {
  canSubmitConsultationComposer,
  initialConsultationComposerText,
  resetConsultationComposerState
} from "./composer-state";
import { initialMoveInChecklistForm } from "./move-in-form-state";
import {
  initialTenantAiFeedbackAction,
  initialTenantAiFeedbackReason,
  initialTenantReopenText
} from "./action-form-state";
import { resolveAttachmentUrl } from "./attachment-url";
import { chatMessageBlocks } from "./chat-message-format";

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
  moveInDate?: string;
  targetLabel: string;
  room?: {
    id: string;
    buildingName: string;
    roomNo: string;
    address: string;
  };
  signupUrl: string;
};

type IntakeDraft = {
  title: string;
  summary: string;
  category: string;
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  responsibilityHint: string;
  confidenceScore: number;
  reasons: string[];
  recommendedAction: string;
  contextHints: string[];
  nextQuestions: string[];
  tenantGuidance: string[];
  photoAnalysis: PhotoAnalysis;
  intakeSlots: TenantIntakeSlot[];
  requiredInfo: string[];
  photoRequested: boolean;
  readyToFinalize: boolean;
  location?: string;
  availableTimes?: string;
  duplicateCandidates: DuplicateTicketCandidate[];
};

type DraftCorrection = {
  title: string;
  summary: string;
  location: string;
  availableTimes: string;
  category: string;
  detailCategory: string;
  priority: IntakeDraft["priority"];
  responsibilityHint: string;
};

const categoryOptions = ["하자", "소음", "설비", "납부", "계약", "공용공간", "기타"];
const detailCategoryOptions = [
  "누수",
  "에어컨",
  "보일러",
  "도어락",
  "전기",
  "곰팡이",
  "벽지",
  "바닥",
  "소음",
  "납부",
  "계약",
  "기타"
];
const responsibilityOptions = ["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"];
const supportedImageAccept = "image/jpeg,image/png,image/webp";

function AttachmentImageLink({
  url,
  alt,
  className,
  label
}: {
  url: string;
  alt: string;
  className?: string;
  label?: string;
}) {
  const [missing, setMissing] = useState(false);
  const fallback = missingPhotoLabel(label ?? alt);
  const resolvedUrl = resolveAttachmentUrl(url);

  return (
    <a href={resolvedUrl} target="_blank" rel="noreferrer" className={className}>
      {missing ? (
        <span className="attachment-missing">{fallback}</span>
      ) : (
        <img src={resolvedUrl} alt={alt} loading="lazy" onError={() => setMissing(true)} />
      )}
      {label ? <span className="photo-evidence-label">{label}</span> : null}
    </a>
  );
}

function draftCorrectionFrom(draft: IntakeDraft): DraftCorrection {
  return {
    title: draft.title,
    summary: draft.summary,
    location: draft.location ?? "",
    availableTimes: draft.availableTimes ?? "",
    category: draft.category,
    detailCategory: draft.detailCategory,
    priority: draft.priority,
    responsibilityHint: draft.responsibilityHint
  };
}

type DuplicateTicketCandidate = {
  ticketId: string;
  complaintId: string;
  title: string;
  roomLabel: string;
  status: string;
  displayStatus: string;
  category: string;
  priority: number;
  summary: string;
  createdAt: string;
  matchedSignals: string[];
  recommendedAction: "ATTACH_TO_EXISTING" | "CREATE_NEW";
};

type PhotoAnalysis = {
  attachmentUrls: string[];
  previousAttachmentUrls: string[];
  candidates: string[];
  comparisonStatus: string;
  summary: string;
  evidence: string[];
  recommendedRetake: boolean;
};

type IntakeMessage = {
  id: string;
  sender: "TENANT" | "AI_ASSISTANT" | "SYSTEM";
  messageText: string;
  transcriptText?: string;
  attachmentUrls: string[];
  inputMode: "CHAT" | "VOICE" | "PHOTO";
  createdAt: string;
};

type IntakeThreadSummary = {
  title: string;
  channelLabel: string;
  statusLabel: string;
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  lastUserMessage: string;
  lastAssistantMessage: string;
  messageCount: number;
  attachmentCount: number;
  collectedSlotCount: number;
  openSlotCount: number;
  requiredInfoCount: number;
  unresolvedQuestionCount: number;
  readyToFinalize: boolean;
  updatedAt: string;
};

type IntakeSession = {
  id: string;
  status: "ACTIVE" | "FINALIZED" | "CANCELLED";
  sourceChannel: string;
  draft: IntakeDraft;
  threadSummary: IntakeThreadSummary;
  messages: IntakeMessage[];
  complaintId?: string;
  ticketId?: string;
  updatedAt: string;
};

type RealtimeClientSecret = {
  mode: "openai" | "not_configured";
  sessionId: string;
  openaiSessionId?: string;
  model: string;
  voice: string;
  instructions: string;
  warning?: string;
  expiresAt?: string;
  clientSecret?: {
    value: string;
    expiresAt?: string;
  };
};

type RealtimeTurnSummary = {
  channelLabel: string;
  statusLabel: string;
  detailCategory: string;
  priority: 1 | 2 | 3 | 4;
  requiresPhoto: boolean;
  readyToFinalize: boolean;
  intakeSlots: TenantIntakeSlot[];
  collectedSlotCount: number;
  openSlotCount: number;
  nextQuestions: string[];
  tenantGuidance: string[];
  spokenReply: string;
};

type Attachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
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

type ComplaintView = {
  id: string;
  title: string;
  description: string;
  location: string;
  displayStatus: string;
  sourceChannel: string;
  availableTimes?: string;
  createdAt: string;
  nextAction?: {
    kind: "PHOTO_REQUEST" | "ADDITIONAL_INFO";
    title: string;
    description: string;
    requestedItems: string[];
    requiresPhoto: boolean;
    uploadHint: string;
  };
  ticket: {
    id: string;
    sourceChannel: string;
    category: string;
    priority: number;
    status: string;
    responsibilityHint: string;
    aiSummary: string;
    dueAt?: string;
    repairs: {
      id: string;
      status: string;
      estimateAmount?: number;
      estimateDescription?: string;
      costBearer?: "LANDLORD" | "TENANT" | "PENDING";
      estimateApprovalNote?: string;
      scheduledAt?: string;
      completionNote?: string;
    }[];
    aiFeedback: AiFeedback[];
  };
  aiFeedback: AiFeedback[];
  messages: {
    id: string;
    senderRole: string;
    messageText: string;
    attachmentUrls: string[];
    createdAt: string;
  }[];
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

type MoveInChecklistItem = {
  id: string;
  area: string;
  itemName: string;
  memo?: string;
  guidance: string;
  attachmentUrls: string[];
  createdAt: string;
};

type TenantHome = {
  profile: {
    name: string;
    roomId: string;
    room?: {
      buildingName: string;
      roomNo: string;
      address: string;
    };
  };
  complaints: ComplaintView[];
  moveInChecklist: MoveInChecklistItem[];
  roomTimeline: RoomTimelineEntry[];
};

type RuntimeConfig = {
  demoAuth: {
    enabled: boolean;
  };
};

const emptyLogin = {
  email: "",
  password: ""
};

const demoLogin = {
  email: "tenant@roomlog.test",
  password: "password123!"
};

const signupInitial = {
  email: "",
  password: "",
  passwordConfirm: "",
  name: "",
  phone: "",
  buildingName: "",
  roomNo: "",
  address: "",
  inviteToken: ""
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

function priorityLabel(priority: number) {
  const labels: Record<number, string> = {
    1: "긴급",
    2: "우선",
    3: "일반",
    4: "문의"
  };

  return labels[priority] ?? "확인";
}

function senderLabel(sender: IntakeMessage["sender"] | string) {
  if (sender === "AI_ASSISTANT") {
    return "AI 상담";
  }

  if (sender === "TENANT") {
    return "나";
  }

  if (sender === "LANDLORD") {
    return "관리자";
  }

  if (sender === "VENDOR") {
    return "업체";
  }

  return "시스템";
}

function ChatMessageBody({ text }: { text: string }) {
  return (
    <div className="message-content">
      {chatMessageBlocks(text).map((block, index) => {
        if (block.kind === "heading") {
          return <h4 key={`${block.kind}-${index}`}>{block.text}</h4>;
        }

        if (block.kind === "list") {
          return (
            <ul key={`${block.kind}-${index}`}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return <p key={`${block.kind}-${index}`}>{block.text}</p>;
      })}
    </div>
  );
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

export default function TenantApp() {
  const [auth, setAuth] = useState<AuthResult | null>(null);
  const [home, setHome] = useState<TenantHome | null>(null);
  const [sessions, setSessions] = useState<IntakeSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedComplaintId, setSelectedComplaintId] = useState("");
  const [draftCorrections, setDraftCorrections] = useState<Record<string, DraftCorrection>>({});
  const [messageText, setMessageText] = useState(initialConsultationComposerText);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const initialChecklistForm = initialMoveInChecklistForm();
  const [checklistArea, setChecklistArea] = useState(initialChecklistForm.area);
  const [checklistItemName, setChecklistItemName] = useState(initialChecklistForm.itemName);
  const [checklistMemo, setChecklistMemo] = useState(initialChecklistForm.memo);
  const [checklistFiles, setChecklistFiles] = useState<File[]>([]);
  const [checklistInputKey, setChecklistInputKey] = useState(0);
  const [followupText, setFollowupText] = useState("");
  const [followupPhotoFiles, setFollowupPhotoFiles] = useState<File[]>([]);
  const [followupPhotoInputKey, setFollowupPhotoInputKey] = useState(0);
  const [reopenText, setReopenText] = useState(initialTenantReopenText);
  const [reopenPhotoFile, setReopenPhotoFile] = useState<File | null>(null);
  const [reopenPhotoInputKey, setReopenPhotoInputKey] = useState(0);
  const [aiFeedbackTarget, setAiFeedbackTarget] = useState<AiFeedbackTarget>("PRIORITY");
  const [aiFeedbackReason, setAiFeedbackReason] = useState(initialTenantAiFeedbackReason);
  const [aiFeedbackAction, setAiFeedbackAction] = useState(initialTenantAiFeedbackAction);
  const [aiFeedbackPhotoFile, setAiFeedbackPhotoFile] = useState<File | null>(null);
  const [aiFeedbackPhotoInputKey, setAiFeedbackPhotoInputKey] = useState(0);
  const [inputMode, setInputMode] = useState<IntakeMode>("CHAT");
  const [threadFilter, setThreadFilter] = useState<ConsultationThreadFilter>("ACTIVE");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [signupForm, setSignupForm] = useState(signupInitial);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);
  const [invitePreview, setInvitePreview] = useState<SignupInvitePreview | null>(null);
  const [invitePreviewStatus, setInvitePreviewStatus] = useState("");
  const [status, setStatus] = useState("로그인 또는 회원가입이 필요합니다.");
  const [realtimeStatus, setRealtimeStatus] = useState(idleRealtimeStatusForMode("CHAT"));
  const [realtimeSecret, setRealtimeSecret] = useState<RealtimeClientSecret | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeUserTranscript, setRealtimeUserTranscript] = useState("");
  const [realtimeAssistantTranscript, setRealtimeAssistantTranscript] = useState("");
  const [realtimeTurnSummaries, setRealtimeTurnSummaries] = useState<
    Record<string, RealtimeTurnSummary>
  >({});
  const authRef = useRef<AuthResult | null>(null);
  const selectedSessionRef = useRef<IntakeSession | undefined>(undefined);
  const realtimeTurnRef = useRef(emptyRealtimeTurnState());
  const realtimePersistRef = useRef(emptyRealtimePersistState());
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? sessions[0],
    [selectedSessionId, sessions]
  );
  const selectedRealtimeTurnSummary = selectedSession
    ? realtimeTurnSummaries[selectedSession.id]
    : undefined;
  const selectedSlotProgress = useMemo(
    () => (selectedSession ? intakeSlotProgress(selectedSession.draft.intakeSlots) : undefined),
    [selectedSession]
  );
  const selectedThreadContext = useMemo(
    () =>
      selectedSession
        ? consultationThreadContextHighlights({
            summary: selectedSession.threadSummary,
            draft: selectedSession.draft
          })
        : [],
    [selectedSession]
  );
  const emptyConsultation = useMemo(
    () => emptyConsultationState(sessions.length),
    [sessions.length]
  );
  const visibleSessions = useMemo(
    () => filterConsultationThreads(sessions, threadFilter),
    [sessions, threadFilter]
  );
  const threadFilterCounts = useMemo(() => {
    const counts: Record<ConsultationThreadFilter, number> = {
      ACTIVE: filterConsultationThreads(sessions, "ACTIVE").length,
      READY: filterConsultationThreads(sessions, "READY").length,
      FINALIZED: filterConsultationThreads(sessions, "FINALIZED").length,
      ALL: sessions.length
    };

    return counts;
  }, [sessions]);
  const selectedPhotoEvidence = useMemo(
    () => (selectedSession ? photoEvidenceItems(selectedSession.draft.photoAnalysis) : []),
    [selectedSession]
  );
  const signupIssues = useMemo(
    () => tenantSignupIssues(signupForm, invitePreview),
    [signupForm, invitePreview]
  );
  const visibleSignupIssues = useMemo(
    () => visibleTenantSignupIssues(signupForm, invitePreview),
    [signupForm, invitePreview]
  );
  const signupReady = canSubmitTenantSignup(signupForm, invitePreview);
  const selectedIntakeMode = selectedSession
    ? intakeModeOptions.find((option) => option.sourceChannel === selectedSession.sourceChannel) ??
      intakeModeConfig(inputMode)
    : intakeModeConfig(inputMode);
  const selectedComplaint = useMemo(
    () =>
      home?.complaints.find((complaint) => complaint.id === selectedComplaintId) ??
      home?.complaints[0],
    [home, selectedComplaintId]
  );
  const selectedDraftCorrection = selectedSession
    ? draftCorrections[selectedSession.id] ?? draftCorrectionFrom(selectedSession.draft)
    : undefined;
  const canEditDraft = selectedSession?.status === "ACTIVE";
  const canSendComposer =
    Boolean(selectedSession && selectedSession.status === "ACTIVE") &&
    canSubmitConsultationComposer(messageText, photoFiles.length);
  const selectedAiFeedback = selectedComplaint?.aiFeedback ?? selectedComplaint?.ticket.aiFeedback ?? [];
  const completionReviewAvailable =
    selectedComplaint?.ticket.status === "COMPLETION_REPORTED" ||
    selectedComplaint?.ticket.status === "COMPLETED";
  const tenantConfirmedCompletion =
    selectedComplaint?.messages.some(
      (message) =>
        message.senderRole === "TENANT" && message.messageText.includes("수리 완료를 확인")
    ) ?? false;

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  useEffect(() => {
    selectedSessionRef.current = selectedSession;
  }, [selectedSession]);

  useEffect(() => {
    if (!visibleSessions.length) {
      return;
    }

    if (!visibleSessions.some((session) => session.id === selectedSessionId)) {
      setSelectedSessionId(visibleSessions[0].id);
    }
  }, [selectedSessionId, visibleSessions]);

  function updateDraftCorrection(sessionId: string, patch: Partial<DraftCorrection>) {
    setDraftCorrections((current) => {
      const session = sessions.find((item) => item.id === sessionId);
      const existing =
        current[sessionId] ?? (session ? draftCorrectionFrom(session.draft) : undefined);

      if (!existing) {
        return current;
      }

      return {
        ...current,
        [sessionId]: {
          ...existing,
          ...patch
        }
      };
    });
  }

  function seedComposerFromQuestion(question: string) {
    setMessageText((current) => appendQuestionReplyPrompt(current, question));
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }

  function seedComposerFromSuggestedAnswer(question: string, answer: string) {
    setMessageText((current) => appendQuestionAnswerPrompt(current, question, answer));
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }

  async function refresh(token = auth?.accessToken) {
    if (!token) {
      return;
    }

    const [homeData, sessionData] = await Promise.all([
      apiRequest<TenantHome>("/tenant/home", token),
      apiRequest<IntakeSession[]>("/tenant/complaints/intake/sessions", token)
    ]);
    setHome(homeData);
    setSessions(sessionData);
    setSelectedSessionId((current) => current || sessionData[0]?.id || "");
    setSelectedComplaintId((current) => current || homeData.complaints[0]?.id || "");
  }

  useEffect(() => {
    let active = true;

    void apiRequest<RuntimeConfig>("/roomlog/runtime-config")
      .then((config) => {
        if (!active) {
          return;
        }

        setDemoAuthEnabled(config.demoAuth.enabled);
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
      window.localStorage.removeItem("roomlog.tenant.auth");
      setAuthMode("signup");
      setSignupForm((current) => ({ ...current, inviteToken }));
      setStatus("관리자 초대 토큰이 입력되었습니다. 세입자 계정을 생성해주세요.");
      return;
    }

    const saved = window.localStorage.getItem("roomlog.tenant.auth");

    if (!saved) {
      return;
    }

    let parsed: AuthResult;

    try {
      parsed = ensureTenantAuth(JSON.parse(saved) as AuthResult);
    } catch (error) {
      window.localStorage.removeItem("roomlog.tenant.auth");
      setAuth(null);
      setStatus(error instanceof Error ? error.message : "세입자 계정으로 로그인해주세요.");
      return;
    }

    setAuth(parsed);
    setStatus(`${parsed.name} 세입자 계정 연결됨`);
    void refresh(parsed.accessToken).catch(() => {
      window.localStorage.removeItem("roomlog.tenant.auth");
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
        `/auth/invites/TENANT/${encodeURIComponent(token)}`
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

  useEffect(() => {
    return () => {
      disconnectRealtime();
    };
  }, []);

  async function completeAuth(result: AuthResult) {
    const tenantAuth = ensureTenantAuth(result);

    setAuth(tenantAuth);
    window.localStorage.setItem("roomlog.tenant.auth", JSON.stringify(tenantAuth));
    setStatus(`${tenantAuth.name} 세입자 계정 연결됨`);
    await refresh(tenantAuth.accessToken);
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
    const inviteToken = signupForm.inviteToken.trim();

    if (inviteToken && invitePreview?.inviteToken !== inviteToken) {
      setStatus(invitePreviewStatus || signupIssues[0] || "초대 정보를 먼저 확인해주세요.");
      return;
    }

    if (!signupReady) {
      setStatus(signupIssues[0] || "회원가입 정보를 확인해주세요.");
      return;
    }

    try {
      setStatus("회원가입 처리 중");
      const result = await apiRequest<AuthResult>("/auth/signup", undefined, {
        method: "POST",
        body: JSON.stringify(buildTenantSignupPayload(signupForm))
      });
      setSignupForm(signupInitial);
      await completeAuth(result);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "회원가입 실패");
    }
  }

  async function startSession() {
    if (!auth) {
      return;
    }

    setStatus("새 AI 상담 스레드 생성 중");
    const result = await apiRequest<{ session: IntakeSession }>(
      "/tenant/complaints/intake/sessions",
      auth.accessToken,
      {
        method: "POST",
        body: JSON.stringify(intakeSessionPayload(inputMode))
      }
    );
    await refresh();
    setSelectedSessionId(result.session.id);
    setDraftCorrections((current) => ({
      ...current,
      [result.session.id]: draftCorrectionFrom(result.session.draft)
    }));
    const clearedComposer = resetConsultationComposerState({
      text: messageText,
      photoCount: photoFiles.length,
      photoInputKey
    });
    setMessageText(clearedComposer.text);
    setPhotoFiles([]);
    setPhotoInputKey(clearedComposer.photoInputKey);
    setStatus(intakeModeConfig(inputMode).startStatus);
    setRealtimeStatus(intakeModeConfig(inputMode).idleStatus);
    setRealtimeSecret(null);
    resetRealtimeTranscript();
  }

  async function uploadAttachment(file: File, token: string, category = "COMPLAINT_PHOTO") {
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

  async function submitMoveInChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth) {
      return;
    }

    if (!checklistFiles.length) {
      setStatus("입주 전 기준 사진을 한 장 이상 선택해주세요.");
      return;
    }

    try {
      setStatus("입주 전 기준 사진 업로드 중");
      const uploaded = await Promise.all(
        checklistFiles.map((file) => uploadAttachment(file, auth.accessToken, "INTAKE_PHOTO"))
      );
      await apiRequest("/tenant/move-in-checklist", auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          area: checklistArea,
          itemName: checklistItemName,
          memo: checklistMemo,
          attachmentUrls: uploaded.map((item) => item.fileUrl)
        })
      });
      setChecklistFiles([]);
      setChecklistInputKey((current) => current + 1);
      setStatus("입주 전 기준 사진이 저장되었습니다.");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "입주 전 기록 저장 실패");
    }
  }

  function resetRealtimeTranscript() {
    realtimeTurnRef.current = emptyRealtimeTurnState();
    realtimePersistRef.current = emptyRealtimePersistState();
    setRealtimeUserTranscript("");
    setRealtimeAssistantTranscript("");
  }

  function updateRealtimeTranscript(payload: RealtimeEventPayload) {
    const result = applyRealtimeEventToTurn(realtimeTurnRef.current, payload);
    realtimeTurnRef.current = result.state;

    if (result.userTranscript !== undefined) {
      setRealtimeUserTranscript(result.userTranscript);
    }

    if (result.assistantTranscript !== undefined) {
      setRealtimeAssistantTranscript(result.assistantTranscript);
    }

    if (result.status) {
      setRealtimeStatus(result.status);
    }

    if (result.shouldFlush) {
      void flushRealtimeTurn(result.flushEventId);
    }
  }

  async function recordRealtimeTurn(
    userTranscript: string,
    assistantTranscript: string,
    eventId: string
  ) {
    const currentAuth = authRef.current;
    const currentSession = selectedSessionRef.current;

    if (!currentAuth || !currentSession) {
      return;
    }

    const result = await apiRequest<{
      session: IntakeSession;
      turnSummary: RealtimeTurnSummary;
    }>(
      `/tenant/complaints/intake/sessions/${currentSession.id}/realtime/turns`,
      currentAuth.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          userTranscript,
          assistantTranscript,
          eventId
        })
      }
    );
    setSessions((current) =>
      current.map((session) => (session.id === result.session.id ? result.session : session))
    );
    setDraftCorrections((current) => ({
      ...current,
      [result.session.id]: draftCorrectionFrom(result.session.draft)
    }));
    setRealtimeTurnSummaries((current) => ({
      ...current,
      [result.session.id]: result.turnSummary
    }));
    setSelectedSessionId(result.session.id);
  }

  async function flushRealtimeTurn(eventId = "") {
    const userTranscript = realtimeTurnRef.current.userTranscript.trim();
    const assistantTranscript = realtimeTurnRef.current.assistantTranscript.trim();

    if (!userTranscript && !assistantTranscript) {
      return;
    }

    const persistAttempt = beginRealtimeTurnPersist(realtimePersistRef.current, eventId);
    realtimePersistRef.current = persistAttempt.state;

    if (!persistAttempt.shouldPersist) {
      return;
    }

    try {
      await recordRealtimeTurn(userTranscript, assistantTranscript, eventId);
      realtimeTurnRef.current = emptyRealtimeTurnState();
      realtimePersistRef.current = completeRealtimeTurnPersist(
        realtimePersistRef.current,
        eventId,
        true
      );
      setRealtimeStatus("Realtime 전사가 상담 스레드에 저장되었습니다.");
    } catch (error) {
      realtimePersistRef.current = completeRealtimeTurnPersist(
        realtimePersistRef.current,
        eventId,
        false
      );
      setRealtimeStatus(error instanceof Error ? error.message : "Realtime 전사 저장 실패");
    }
  }

  async function prepareRealtimeVoice() {
    if (!auth || !selectedSession) {
      return;
    }

    try {
      const sessionMode = intakeModeForSourceChannel(selectedSession.sourceChannel);
      setInputMode(sessionMode);
      resetRealtimeTranscript();
      setRealtimeStatus(`${intakeModeConfig(sessionMode).label} Realtime 연결 준비 중`);
      const result = await apiRequest<RealtimeClientSecret>(
        `/tenant/complaints/intake/sessions/${selectedSession.id}/realtime/client-secret`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            purpose: realtimePurposeForSourceChannel(selectedSession.sourceChannel),
            voice: "marin"
          })
        }
      );
      setRealtimeSecret(result);

      if (result.mode === "not_configured" || !result.clientSecret?.value) {
        setRealtimeConnected(false);
        setRealtimeStatus(result.warning ?? "OpenAI Realtime 서버 설정이 필요합니다.");
        return;
      }

      await connectRealtimeVoice(result);
    } catch (error) {
      setRealtimeConnected(false);
      setRealtimeStatus(error instanceof Error ? error.message : "Realtime 음성 연결 실패");
    }
  }

  function selectInputMode(mode: IntakeMode) {
    setInputMode(mode);

    if (!realtimeConnected && !realtimeSecret) {
      setRealtimeStatus(idleRealtimeStatusForMode(mode));
    }
  }

  async function connectRealtimeVoice(secret: RealtimeClientSecret) {
    await disconnectRealtime();

    if (!secret.clientSecret?.value) {
      setRealtimeStatus("Realtime client secret이 없습니다.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setRealtimeStatus("이 브라우저에서는 마이크 연결을 사용할 수 없습니다.");
      return;
    }

    const peerConnection = new RTCPeerConnection();
    peerConnectionRef.current = peerConnection;
    peerConnection.ontrack = (event) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "connected") {
        setRealtimeConnected(true);
        setRealtimeStatus("Realtime 음성 상담 연결됨");
      }

      if (["failed", "closed", "disconnected"].includes(peerConnection.connectionState)) {
        setRealtimeConnected(false);
      }
    };

    const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = mediaStream;
    for (const track of mediaStream.getAudioTracks()) {
      peerConnection.addTrack(track, mediaStream);
    }

    const dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannelRef.current = dataChannel;
    dataChannel.addEventListener("open", () => {
      const summary = selectedSession
        ? [
            selectedSession.draft.title,
            selectedSession.draft.summary,
            selectedSession.draft.availableTimes
          ]
            .filter(Boolean)
            .join(" / ")
        : "";
      const openEvents = buildRealtimeConnectionOpenEvents({
        createResponseAutomatically: true,
        sessionId: secret.sessionId,
        contextSummary: summary,
        openingPrompt: selectedSession
          ? realtimeOpeningPromptForSourceChannel(selectedSession.sourceChannel)
          : realtimeOpeningPromptForMode(inputMode)
      });

      for (const openEvent of openEvents) {
        dataChannel.send(JSON.stringify(openEvent));
      }
    });
    dataChannel.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as RealtimeEventPayload;
        updateRealtimeTranscript(payload);
      } catch {
        setRealtimeStatus("Realtime 이벤트 수신 중");
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp ?? "",
      headers: {
        Authorization: `Bearer ${secret.clientSecret.value}`,
        "Content-Type": "application/sdp"
      }
    });

    if (!sdpResponse.ok) {
      throw new Error(`Realtime WebRTC 연결 실패 (${sdpResponse.status})`);
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text()
    });
    setRealtimeStatus("Realtime 음성 상담 연결 중");
  }

  async function disconnectRealtime() {
    const disconnectFlush = realtimeDisconnectFlushRequest(realtimeTurnRef.current);

    if (disconnectFlush.shouldFlush) {
      await flushRealtimeTurn(disconnectFlush.eventId);
    }

    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    setRealtimeConnected(false);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedSession) {
      return;
    }

    if (!canSubmitConsultationComposer(messageText, photoFiles.length)) {
      setStatus("상담 내용 또는 사진을 입력해주세요.");
      return;
    }

    setStatus(photoUploadStatus(photoFiles));
    const uploadedAttachments = await Promise.all(
      photoFiles.map((file) => uploadAttachment(file, auth.accessToken))
    );
    setStatus("AI가 상담 내용을 정리 중");
    const payload = {
      messageText,
      inputMode: messageInputModeForMode(inputMode),
      attachmentUrls: uploadedAttachments.map((attachment) => attachment.fileUrl)
    };
    const result = await apiRequest<{ session: IntakeSession }>(
      `/tenant/complaints/intake/sessions/${selectedSession.id}/messages`,
      auth.accessToken,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    setSessions((current) =>
      current.map((session) => (session.id === result.session.id ? result.session : session))
    );
    setDraftCorrections((current) => ({
      ...current,
      [result.session.id]: draftCorrectionFrom(result.session.draft)
    }));
    setMessageText("");
    setPhotoFiles([]);
    setPhotoInputKey((current) => current + 1);
    setStatus("AI 상담 초안이 갱신되었습니다.");
  }

  async function finalizeSession(existingTicketId?: string) {
    if (!auth || !selectedSession) {
      return;
    }

    const correction = selectedDraftCorrection ?? draftCorrectionFrom(selectedSession.draft);

    setStatus(existingTicketId ? "기존 티켓에 상담 내용 연결 중" : "민원 티켓 접수 중");
    const result = await apiRequest<{ complaint: ComplaintView }>(
      `/tenant/complaints/intake/sessions/${selectedSession.id}/finalize`,
      auth.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          confirmedTitle: correction.title,
          confirmedSummary: correction.summary,
          confirmedLocation: correction.location,
          confirmedCategory: correction.category,
          confirmedDetailCategory: correction.detailCategory,
          confirmedPriority: correction.priority,
          confirmedResponsibilityHint: correction.responsibilityHint,
          availableTimes: correction.availableTimes,
          duplicateResolution: existingTicketId ? "ATTACH_TO_EXISTING" : "CREATE_NEW",
          existingTicketId
        })
      }
    );
    await refresh();
    setSelectedComplaintId(result.complaint.id);
    setDraftCorrections((current) => {
      const next = { ...current };
      delete next[selectedSession.id];
      return next;
    });
    setStatus(
      existingTicketId
        ? "상담 내용이 기존 티켓에 연결되었습니다."
        : "상담 내용이 민원 티켓으로 접수되었습니다."
    );
  }

  async function submitComplaintFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedComplaint) {
      return;
    }

    if (!followupText.trim() && !followupPhotoFiles.length) {
      setStatus("추가 설명 또는 사진을 입력해주세요.");
      return;
    }

    setStatus(
      followupPhotoFiles.length ? `추가 ${photoUploadStatus(followupPhotoFiles)}` : "추가 설명 제출 중"
    );
    const uploadedAttachments = await Promise.all(
      followupPhotoFiles.map((file) => uploadAttachment(file, auth.accessToken, "ADDITIONAL_PHOTO"))
    );

    setStatus("기존 티켓에 추가 자료 연결 중");
    const result = await apiRequest<{ complaint: ComplaintView }>(
      `/tenant/complaints/${selectedComplaint.id}/messages`,
      auth.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          messageText: followupText,
          attachmentUrls: uploadedAttachments.map((attachment) => attachment.fileUrl)
        })
      }
    );

    await refresh();
    setSelectedComplaintId(result.complaint.id);
    setFollowupText("");
    setFollowupPhotoFiles([]);
    setFollowupPhotoInputKey((current) => current + 1);
    setStatus("추가 자료가 기존 티켓에 연결되었습니다.");
  }

  async function submitAiFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedComplaint) {
      return;
    }

    if (!aiFeedbackReason.trim()) {
      setStatus("AI 판단에 대한 이의제기 사유를 입력해주세요.");
      return;
    }

    try {
      setStatus(aiFeedbackPhotoFile ? "이의제기 사진 업로드 중" : "AI 판단 이의제기 접수 중");
      const uploadedAttachment = aiFeedbackPhotoFile
        ? await uploadAttachment(aiFeedbackPhotoFile, auth.accessToken, "ADDITIONAL_PHOTO")
        : undefined;

      await apiRequest(`/tenant/complaints/${selectedComplaint.id}/ai-feedback`, auth.accessToken, {
        method: "POST",
        body: JSON.stringify({
          target: aiFeedbackTarget,
          reason: aiFeedbackReason,
          requestedAction: aiFeedbackAction,
          attachmentUrls: uploadedAttachment ? [uploadedAttachment.fileUrl] : []
        })
      });
      await refresh();
      setAiFeedbackReason(initialTenantAiFeedbackReason());
      setAiFeedbackAction(initialTenantAiFeedbackAction());
      setAiFeedbackPhotoFile(null);
      setAiFeedbackPhotoInputKey((current) => current + 1);
      setStatus("AI 판단 이의제기가 기존 티켓에 연결되었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 판단 이의제기 접수 실패");
    }
  }

  async function confirmCompletion() {
    if (!auth || !selectedComplaint) {
      return;
    }

    try {
      setStatus("수리 완료 확인 기록 중");
      const result = await apiRequest<{ complaint: ComplaintView }>(
        `/tenant/complaints/${selectedComplaint.id}/confirm-completion`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({ note: "세입자가 앱에서 완료 상태를 확인했습니다." })
        }
      );
      await refresh();
      setSelectedComplaintId(result.complaint.id);
      setStatus("수리 완료 확인이 기록되었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "완료 확인에 실패했습니다.");
    }
  }

  async function submitReopenComplaint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!auth || !selectedComplaint) {
      return;
    }

    if (!reopenText.trim() && !reopenPhotoFile) {
      setStatus("미해결 사유 또는 사진을 입력해주세요.");
      return;
    }

    try {
      setStatus(reopenPhotoFile ? "미해결 사진 업로드 중" : "미해결 재요청 제출 중");
      const uploadedAttachment = reopenPhotoFile
        ? await uploadAttachment(reopenPhotoFile, auth.accessToken, "ADDITIONAL_PHOTO")
        : undefined;

      setStatus("관리자에게 재요청 전달 중");
      const result = await apiRequest<{ complaint: ComplaintView }>(
        `/tenant/complaints/${selectedComplaint.id}/reopen`,
        auth.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            messageText: reopenText,
            attachmentUrls: uploadedAttachment ? [uploadedAttachment.fileUrl] : []
          })
        }
      );
      await refresh();
      setSelectedComplaintId(result.complaint.id);
      setReopenText(initialTenantReopenText());
      setReopenPhotoFile(null);
      setReopenPhotoInputKey((current) => current + 1);
      setStatus("미해결 재요청이 관리자에게 전달되었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "재요청 제출에 실패했습니다.");
    }
  }

  function logout() {
    window.localStorage.removeItem("roomlog.tenant.auth");
    setAuth(null);
    setHome(null);
    setSessions([]);
    setSelectedSessionId("");
    setDraftCorrections({});
    setStatus("로그아웃되었습니다.");
  }

  if (!auth) {
    return (
      <main className="shell auth-shell">
        <section className="auth-hero">
          <p className="eyebrow">Roomlog Tenant</p>
          <h1>AI 상담으로 하자를 접수하세요</h1>
          <p>상담 스레드마다 대화, 사진, AI 초안, 접수 티켓이 분리 저장됩니다.</p>
        </section>

        <section className="auth-card" aria-label="세입자 인증">
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
                이름
                <input
                  autoComplete="name"
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
                      <strong>{invitePreview.targetLabel}</strong>
                      <span>초대자: {invitePreview.invitedBy}</span>
                      {invitePreview.moveInDate ? (
                        <span>입주일: {invitePreview.moveInDate}</span>
                      ) : null}
                      {invitePreview.email ? <span>이메일: {invitePreview.email}</span> : null}
                    </>
                  ) : (
                    <span>{invitePreviewStatus || "초대 확인 중"}</span>
                  )}
                </div>
              ) : null}
              {!signupForm.inviteToken ? (
                <>
                  <label>
                    건물명
                    <input
                      autoComplete="organization"
                      value={signupForm.buildingName}
                      onChange={(event) =>
                        setSignupForm({ ...signupForm, buildingName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    호실
                    <input
                      autoComplete="address-line2"
                      value={signupForm.roomNo}
                      onChange={(event) =>
                        setSignupForm({ ...signupForm, roomNo: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    건물 주소
                    <input
                      autoComplete="address-line1"
                      value={signupForm.address}
                      onChange={(event) =>
                        setSignupForm({ ...signupForm, address: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : null}
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
              {authMode === "signup" ? (
                <div
                  className={signupReady ? "signup-checklist ready" : "signup-checklist"}
                  aria-live="polite"
                >
                  {signupReady ? (
                    <span>회원가입 정보를 확인했습니다.</span>
                  ) : (
                    visibleSignupIssues.map((issue) => <span key={issue}>{issue}</span>)
                  )}
                </div>
              ) : null}
              <button type="submit" className="primary" disabled={!signupReady}>
                세입자 계정 만들기
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
            테스트 세입자 계정으로 시작
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
          <p className="eyebrow">Roomlog Tenant</p>
          <h1>AI 상담 접수</h1>
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

      <section className="metrics" aria-label="세입자 요약">
        <div>
          <span>내 호실</span>
          <strong>
            {home?.profile.room
              ? `${home.profile.room.buildingName} ${home.profile.room.roomNo}`
              : home?.profile.roomId ?? "연결 중"}
          </strong>
        </div>
        <div>
          <span>상담 스레드</span>
          <strong>{sessions.length}</strong>
        </div>
        <div>
          <span>진행 중 신고</span>
          <strong>{home?.complaints.filter((item) => item.displayStatus !== "완료").length ?? 0}</strong>
        </div>
      </section>

      <section className="panel move-in-panel" aria-label="입주 전 기준 사진">
        <div className="panel-heading compact">
          <p className="eyebrow">Move-in Archive</p>
          <h2>입주 전 기준 사진</h2>
        </div>
        <form onSubmit={submitMoveInChecklist} className="move-in-form">
          <label>
            공간
            <input
              value={checklistArea}
              placeholder="예: 화장실"
              onChange={(event) => setChecklistArea(event.target.value)}
            />
          </label>
          <label>
            항목
            <input
              value={checklistItemName}
              placeholder="예: 천장, 세면대, 창틀"
              onChange={(event) => setChecklistItemName(event.target.value)}
            />
          </label>
          <label>
            메모
            <input
              value={checklistMemo}
              placeholder="입주 시 상태를 직접 입력하세요."
              onChange={(event) => setChecklistMemo(event.target.value)}
            />
          </label>
          <label>
            기준 사진
            <input
              key={checklistInputKey}
              type="file"
              accept={supportedImageAccept}
              multiple
              onChange={(event) => setChecklistFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <button type="submit" className="primary">
            기준 사진 저장
          </button>
        </form>
        {checklistFiles.length ? (
          <p className="file-note">{checklistFiles.map((file) => file.name).join(", ")}</p>
        ) : null}
        {home?.moveInChecklist.length ? (
          <div className="move-in-list">
            {home.moveInChecklist.slice(0, 4).map((item) => (
              <article key={item.id}>
                <div>
                  <strong>
                    {item.area} · {item.itemName}
                  </strong>
                  <p>{item.memo ?? item.guidance}</p>
                </div>
                <div className="attachment-preview">
                  {item.attachmentUrls.map((url) => (
                    <AttachmentImageLink url={url} alt="입주 전 기준 사진" key={url} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">입주 전 사진을 남기면 이후 하자 사진과 함께 비교됩니다.</p>
        )}
      </section>

      <div className="workspace">
        <aside className="panel sidebar" aria-label="상담과 민원 목록">
          <div className="panel-heading compact">
            <p className="eyebrow">Threads</p>
            <h2>상담</h2>
          </div>
          <div className="mode-row" role="group" aria-label="입력 방식">
            {intakeModeOptions.map((option) => (
              <button
                type="button"
                className={inputMode === option.mode ? "active" : ""}
                onClick={() => selectInputMode(option.mode)}
                key={option.mode}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="primary" onClick={() => void startSession()}>
            새 상담 시작
          </button>
          <div className="thread-filter-row" role="group" aria-label="상담 상태 필터">
            {consultationThreadFilterOptions.map((option) => (
              <button
                type="button"
                className={threadFilter === option.value ? "active" : ""}
                onClick={() => setThreadFilter(option.value)}
                key={option.value}
              >
                {consultationThreadFilterCountLabel(
                  option.value,
                  threadFilterCounts[option.value]
                )}
              </button>
            ))}
          </div>

          <div className="ticket-list thread-list">
            {visibleSessions.map((thread) => {
              const summary = thread.threadSummary;
              const workflowBadges = consultationThreadBadges(summary);

              return (
                <button
                  type="button"
                  key={thread.id}
                  className={thread.id === selectedSession?.id ? "ticket active" : "ticket"}
                  onClick={() => setSelectedSessionId(thread.id)}
                >
                  <span>{summary.statusLabel}</span>
                  <strong>{summary.title}</strong>
                  <div className="thread-badges" aria-label="상담 스레드 상태">
                    {workflowBadges.map((badge) => (
                      <em className={`thread-badge ${badge.tone}`} key={badge.label}>
                        {badge.label}
                      </em>
                    ))}
                  </div>
                  <p className="thread-action">{consultationThreadNextAction(summary)}</p>
                  <small>
                    {summary.channelLabel} · P{summary.priority} · 메시지 {summary.messageCount} ·
                    사진 {summary.attachmentCount}
                  </small>
                  <small>
                    정보 {summary.collectedSlotCount}/6 · 확인 필요 {summary.openSlotCount}
                  </small>
                  <p className="thread-preview">{summary.lastUserMessage}</p>
                  <p className="thread-preview assistant">AI: {summary.lastAssistantMessage}</p>
                </button>
              );
            })}
            {!visibleSessions.length ? (
              <p className="empty compact-empty">이 상태의 상담 스레드가 없습니다.</p>
            ) : null}
          </div>

          <div className="panel-heading compact second">
            <p className="eyebrow">Complaints</p>
            <h2>접수 내역</h2>
          </div>
          <div className="ticket-list">
            {home?.complaints.map((complaint) => (
              <button
                type="button"
                key={complaint.id}
                className={complaint.id === selectedComplaint?.id ? "ticket active" : "ticket"}
                onClick={() => setSelectedComplaintId(complaint.id)}
              >
                <span>{complaint.displayStatus}</span>
                <strong>{complaint.title}</strong>
                <small>
                  P{complaint.ticket.priority} · {complaint.ticket.category}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel chat-panel" aria-label="AI 상담">
          <div className="panel-heading chat-heading">
            <div>
              <p className="eyebrow">AI Intake</p>
              <h2>{selectedSession?.threadSummary.title ?? emptyConsultation.title}</h2>
              {selectedSession ? (
                <>
                  <small>
                    {selectedSession.threadSummary.channelLabel} ·{" "}
                    {selectedSession.threadSummary.statusLabel} · 메시지{" "}
                    {selectedSession.threadSummary.messageCount}
                  </small>
                  <div className="thread-badges heading-badges" aria-label="현재 상담 진행 상태">
                    {consultationThreadBadges(selectedSession.threadSummary).map((badge) => (
                      <em className={`thread-badge ${badge.tone}`} key={badge.label}>
                        {badge.label}
                      </em>
                    ))}
                  </div>
                  <p className="thread-action heading-action">
                    {consultationThreadNextAction(selectedSession.threadSummary)}
                  </p>
                </>
              ) : null}
            </div>
            {selectedSession ? (
              <span className={`priority p${selectedSession.draft.priority}`}>
                P{selectedSession.draft.priority} {priorityLabel(selectedSession.draft.priority)}
              </span>
            ) : null}
          </div>

          {selectedThreadContext.length ? (
            <div className="thread-context-strip" aria-label="현재 상담 핵심 맥락">
              {selectedThreadContext.map((item) => (
                <span className={`thread-context-item ${item.tone}`} key={item.label}>
                  <strong>{item.label}</strong>
                  {item.value}
                </span>
              ))}
            </div>
          ) : null}

          {!selectedSession ? (
            <div className="empty-consultation" aria-label="AI 상담 시작 안내">
              <p>{emptyConsultation.description}</p>
              <button type="button" className="primary" onClick={() => void startSession()}>
                {emptyConsultation.actionLabel}
              </button>
            </div>
          ) : null}

          <div className="realtime-panel" aria-label="Realtime 음성 상담">
            <div>
              <span className={realtimeConnected ? "live-dot on" : "live-dot"} />
              <strong>
                {realtimeConnected ? `${selectedIntakeMode.label} 연결됨` : selectedIntakeMode.realtimeLabel}
              </strong>
              <p>{realtimeStatus}</p>
              {realtimeSecret ? (
                <small>
                  {realtimeSecret.mode === "openai" ? "OpenAI" : "설정 필요"} ·{" "}
                  {realtimeSecret.model} · {realtimeSecret.voice}
                </small>
              ) : null}
            </div>
            <div className="realtime-actions">
              <button
                type="button"
                className="secondary"
                disabled={!selectedSession || selectedSession.status !== "ACTIVE"}
                onClick={() => void prepareRealtimeVoice()}
              >
                {selectedIntakeMode.connectLabel}
              </button>
              <button
                type="button"
                className="ghost small"
                disabled={!realtimeSecret && !realtimeConnected}
                onClick={() => {
                  void disconnectRealtime();
                  setRealtimeStatus(selectedIntakeMode.idleStatus);
                }}
              >
                종료
              </button>
            </div>
            {realtimeUserTranscript || realtimeAssistantTranscript ? (
              <div className="realtime-transcript" aria-label="Realtime 전사">
                {realtimeUserTranscript ? (
                  <p>
                    <span>나</span>
                    {realtimeUserTranscript}
                  </p>
                ) : null}
                {realtimeAssistantTranscript ? (
                  <p>
                    <span>AI</span>
                    {realtimeAssistantTranscript}
                  </p>
                ) : null}
              </div>
            ) : null}
            {selectedRealtimeTurnSummary ? (
              <div className="realtime-summary" aria-label="Realtime 상담 판단">
                <div>
                  <strong>{selectedRealtimeTurnSummary.channelLabel}</strong>
                  <span>
                    P{selectedRealtimeTurnSummary.priority} ·{" "}
                    {selectedRealtimeTurnSummary.detailCategory} ·{" "}
                    {selectedRealtimeTurnSummary.statusLabel}
                  </span>
                </div>
                <ul>
                  {selectedRealtimeTurnSummary.nextQuestions.slice(0, 3).map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
                <p>
                  {selectedRealtimeTurnSummary.requiresPhoto
                    ? "사진 요청 필요 · "
                    : "사진 요청 없음 · "}
                  {selectedRealtimeTurnSummary.readyToFinalize
                    ? "접수 확정 가능"
                    : "추가 확인 필요"}
                </p>
              </div>
            ) : null}
          </div>
          <audio ref={remoteAudioRef} autoPlay className="audio-output" />

          <ol className="chat-log">
            {selectedSession?.messages.map((message) => (
              <li
                key={message.id}
                className={message.sender === "TENANT" ? "bubble mine" : "bubble assistant"}
              >
                <span>{senderLabel(message.sender)}</span>
                <ChatMessageBody text={message.messageText} />
                {message.attachmentUrls.length > 0 ? (
                  <div className="attachment-preview">
                    {message.attachmentUrls.map((url) => (
                      <AttachmentImageLink url={url} alt="상담 첨부 사진" key={url} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>

          {selectedSession?.status === "ACTIVE" &&
          selectedSession.draft.nextQuestions.length ? (
            <div className="question-reply-strip" aria-label="AI 다음 질문 답변">
              <span>AI가 확인하려는 내용</span>
              {selectedSession.draft.nextQuestions.slice(0, 3).map((question) => (
                <article className="question-card" key={question}>
                  <button
                    type="button"
                    className="question-chip"
                    onClick={() => seedComposerFromQuestion(question)}
                  >
                    {question}
                  </button>
                  <div className="answer-shortcuts" aria-label="답변 예시">
                    {suggestedAnswersForQuestion(question).map((answer) => (
                      <button
                        type="button"
                        key={answer}
                        onClick={() => seedComposerFromSuggestedAnswer(question, answer)}
                      >
                        {answer}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <form className="composer" onSubmit={sendMessage}>
            <textarea
              ref={messageInputRef}
              rows={4}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="증상, 위치, 발생 시점, 방문 가능 시간을 입력하세요."
              disabled={!selectedSession || selectedSession.status !== "ACTIVE"}
            />
            <div className="composer-row">
              <input
                key={photoInputKey}
                type="file"
                accept={supportedImageAccept}
                multiple
                onChange={(event) =>
                  setPhotoFiles(normalizeSelectedPhotos(event.target.files))
                }
                disabled={!selectedSession || selectedSession.status !== "ACTIVE"}
              />
              <button
                type="submit"
                className="primary"
                disabled={!canSendComposer}
              >
                보내기
              </button>
            </div>
            {photoFiles.length ? (
              <p className="selected-file">{selectedPhotoSummary(photoFiles)}</p>
            ) : null}
          </form>
        </section>

        <aside className="panel draft-panel" aria-label="AI 접수 초안">
          <div className="panel-heading">
            <p className="eyebrow">Draft</p>
            <h2>접수 초안</h2>
          </div>
          {selectedSession ? (
            <>
              {selectedDraftCorrection ? (
                <div className="analysis-card draft-editor">
                  <span className={`priority p${selectedDraftCorrection.priority}`}>
                    P{selectedDraftCorrection.priority}{" "}
                    {priorityLabel(selectedDraftCorrection.priority)}
                  </span>
                  <label>
                    접수 제목
                    <input
                      value={selectedDraftCorrection.title}
                      disabled={!canEditDraft}
                      onChange={(event) =>
                        updateDraftCorrection(selectedSession.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    AI 요약
                    <textarea
                      rows={4}
                      value={selectedDraftCorrection.summary}
                      disabled={!canEditDraft}
                      onChange={(event) =>
                        updateDraftCorrection(selectedSession.id, { summary: event.target.value })
                      }
                    />
                  </label>
                  <div className="draft-grid">
                    <label>
                      큰 분류
                      <select
                        value={selectedDraftCorrection.category}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, {
                            category: event.target.value
                          })
                        }
                      >
                        {categoryOptions.map((category) => (
                          <option value={category} key={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      세부 유형
                      <input
                        list="detail-category-options"
                        value={selectedDraftCorrection.detailCategory}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, {
                            detailCategory: event.target.value
                          })
                        }
                      />
                    </label>
                    <label>
                      긴급도
                      <select
                        value={selectedDraftCorrection.priority}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, {
                            priority: Number(event.target.value) as IntakeDraft["priority"]
                          })
                        }
                      >
                        {[1, 2, 3, 4].map((priority) => (
                          <option value={priority} key={priority}>
                            P{priority} {priorityLabel(priority)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      책임 가능성
                      <select
                        value={selectedDraftCorrection.responsibilityHint}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, {
                            responsibilityHint: event.target.value
                          })
                        }
                      >
                        {responsibilityOptions.map((option) => (
                          <option value={option} key={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      발생 위치
                      <input
                        value={selectedDraftCorrection.location}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, { location: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      방문 가능
                      <input
                        value={selectedDraftCorrection.availableTimes}
                        disabled={!canEditDraft}
                        onChange={(event) =>
                          updateDraftCorrection(selectedSession.id, {
                            availableTimes: event.target.value
                          })
                        }
                      />
                    </label>
                  </div>
                  <datalist id="detail-category-options">
                    {detailCategoryOptions.map((option) => (
                      <option value={option} key={option} />
                    ))}
                  </datalist>
                </div>
              ) : null}

              <div className="info-stack">
                <section className="slot-progress-card">
                  <div className="slot-progress-heading">
                    <h3>상담 정보 진행도</h3>
                    {selectedSlotProgress ? <strong>{selectedSlotProgress.label}</strong> : null}
                  </div>
                  {selectedSlotProgress ? (
                    <div
                      className="slot-progress-bar"
                      aria-label={`상담 정보 ${selectedSlotProgress.percent}% 확인`}
                    >
                      <span style={{ width: `${selectedSlotProgress.percent}%` }} />
                    </div>
                  ) : null}
                  <div className="slot-grid">
                    {selectedSession.draft.intakeSlots.map((slot) => (
                      <article className={`slot-item ${slot.status.toLowerCase()}`} key={slot.key}>
                        <div>
                          <strong>{slot.label}</strong>
                          <span>{intakeSlotStatusLabel(slot.status)}</span>
                        </div>
                        <p>{slot.value || slot.evidence}</p>
                        {slot.status === "NEEDS_INFO" && slot.action ? (
                          <small>{slot.action}</small>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>다음 질문</h3>
                  {selectedSession.draft.nextQuestions.length ? (
                    <ul>
                      {selectedSession.draft.nextQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>추가 질문 없이 접수 초안을 확인할 수 있습니다.</p>
                  )}
                </section>
                <section>
                  <h3>세입자 안내</h3>
                  <ul>
                    {selectedSession.draft.tenantGuidance.map((guide) => (
                      <li key={guide}>{guide}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>필요 정보</h3>
                  {selectedSession.draft.requiredInfo.length ? (
                    <ul>
                      {selectedSession.draft.requiredInfo.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>접수 가능한 상태입니다.</p>
                  )}
                </section>
                {selectedSession.draft.duplicateCandidates.length ? (
                  <section>
                    <h3>중복 가능 티켓</h3>
                    <ul className="duplicate-list">
                      {selectedSession.draft.duplicateCandidates.map((candidate) => (
                        <li key={candidate.ticketId}>
                          <strong>
                            {candidate.title} · {candidate.displayStatus}
                          </strong>
                          <p>
                            {candidate.roomLabel} · P{candidate.priority}{" "}
                            {priorityLabel(candidate.priority)} · {candidate.category}
                          </p>
                          <p>{candidate.summary}</p>
                          <p>{candidate.matchedSignals.join(", ")}</p>
                          <button
                            type="button"
                            className="secondary"
                            disabled={
                              selectedSession.status !== "ACTIVE" ||
                              !selectedSession.draft.readyToFinalize
                            }
                            onClick={() => void finalizeSession(candidate.ticketId)}
                          >
                            기존 티켓에 추가
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <section>
                  <h3>판단 근거</h3>
                  <ul>
                    {selectedSession.draft.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </section>
                {selectedSession.draft.photoAnalysis.candidates.length ||
                selectedPhotoEvidence.length ? (
                  <section className="photo-analysis">
                    <h3>사진 분석</h3>
                    <p>{selectedSession.draft.photoAnalysis.summary}</p>
                    {selectedPhotoEvidence.length ? (
                      <div className="photo-evidence-grid">
                        {selectedPhotoEvidence.map((item) => (
                          <AttachmentImageLink
                            url={item.url}
                            alt={item.label}
                            label={item.label}
                            key={`${item.variant}-${item.url}`}
                            className={`photo-evidence ${item.variant}`}
                          />
                        ))}
                      </div>
                    ) : null}
                    <ul>
                      <li>
                        후보:{" "}
                        {selectedSession.draft.photoAnalysis.candidates.join(", ") ||
                          "관리자 확인 필요"}
                      </li>
                      <li>비교 상태: {selectedSession.draft.photoAnalysis.comparisonStatus}</li>
                      {selectedSession.draft.photoAnalysis.recommendedRetake ? (
                        <li>근접 사진과 공간 전체 사진을 추가로 남기면 비교 정확도가 올라갑니다.</li>
                      ) : null}
                    </ul>
                  </section>
                ) : null}
                {selectedSession.draft.contextHints.length ? (
                  <section>
                    <h3>참고 맥락</h3>
                    <ul>
                      {selectedSession.draft.contextHints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>

              <button
                type="button"
                className="primary"
                disabled={
                  selectedSession.status !== "ACTIVE" || !selectedSession.draft.readyToFinalize
                }
                onClick={() => void finalizeSession()}
              >
                민원 접수 확정
              </button>
            </>
          ) : (
            <p className="empty">새 상담을 시작하면 AI 접수 초안이 표시됩니다.</p>
          )}

          {selectedComplaint ? (
            <section className="complaint-detail">
              <div className="panel-heading compact">
                <p className="eyebrow">Timeline</p>
                <h2>{selectedComplaint.title}</h2>
              </div>
              {selectedComplaint.nextAction ? (
                <section className="next-action" aria-label="요청받은 추가 자료">
                  <div className="completion-heading">
                    <div>
                      <h3>{selectedComplaint.nextAction.title}</h3>
                      <p>{selectedComplaint.nextAction.description}</p>
                    </div>
                    <span>
                      {selectedComplaint.nextAction.requiresPhoto ? "사진 요청" : "정보 요청"}
                    </span>
                  </div>
                  <ul>
                    {selectedComplaint.nextAction.requestedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p>{selectedComplaint.nextAction.uploadHint}</p>
                </section>
              ) : null}
              <ol className="timeline">
                {selectedComplaint.messages.map((message) => (
                  <li key={message.id}>
                    <span>{senderLabel(message.senderRole)}</span>
                    <ChatMessageBody text={message.messageText} />
                    {message.attachmentUrls.length ? (
                      <div className="attachment-preview">
                        {message.attachmentUrls.map((url) => (
                          <AttachmentImageLink url={url} alt="민원 추가 첨부 사진" key={url} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
                {selectedComplaint.ticket.repairs.map((repair) => (
                  <li key={repair.id}>
                    <span>{repair.status}</span>
                    <p>
                      {[
                        repair.completionNote,
                        repair.scheduledAt ? `방문 일정 ${repair.scheduledAt}` : undefined,
                        repair.estimateAmount
                          ? `견적 ${repair.estimateAmount.toLocaleString()}원`
                          : undefined,
                        repair.costBearer ? costBearerLabel(repair.costBearer) : undefined
                      ]
                        .filter(Boolean)
                        .join(" · ") || "업체 처리 진행 중"}
                    </p>
                  </li>
                ))}
              </ol>
              <section className="ai-feedback-section" aria-label="AI 판단 이의제기">
                <div className="completion-heading">
                  <div>
                    <h3>AI 판단 이의제기</h3>
                    <p>AI 요약, 긴급도, 책임 가능성이 다르면 기존 티켓에 바로 정정 요청을 남깁니다.</p>
                  </div>
                  {selectedAiFeedback.length ? <span>{selectedAiFeedback.length}건</span> : null}
                </div>
                {selectedAiFeedback.length ? (
                  <ul className="feedback-list">
                    {selectedAiFeedback.map((feedback) => (
                      <li key={feedback.id}>
                        <strong>
                          {feedback.targetLabel} ·{" "}
                          {feedback.status === "OPEN" ? "검토 필요" : "검토 완료"}
                        </strong>
                        <p>{feedback.reason}</p>
                        {feedback.requestedAction ? <p>{feedback.requestedAction}</p> : null}
                        {feedback.managerReviewNote ? (
                          <p>검토 결과: {feedback.managerReviewNote}</p>
                        ) : null}
                        {feedback.correctedValue ? (
                          <p>반영 내용: {feedback.correctedValue}</p>
                        ) : null}
                        {feedback.attachmentUrls.length ? (
                          <div className="attachment-preview">
                            {feedback.attachmentUrls.map((url) => (
                              <AttachmentImageLink
                                url={url}
                                alt="이의제기 첨부 사진"
                                key={url}
                              />
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form className="ai-feedback-form" onSubmit={submitAiFeedback}>
                  <label>
                    대상
                    <select
                      value={aiFeedbackTarget}
                      onChange={(event) =>
                        setAiFeedbackTarget(event.target.value as AiFeedbackTarget)
                      }
                    >
                      <option value="SUMMARY">AI 요약</option>
                      <option value="CATEGORY">민원 유형</option>
                      <option value="PRIORITY">긴급도</option>
                      <option value="RESPONSIBILITY">책임 가능성</option>
                      <option value="COMPLETION">완료 처리</option>
                    </select>
                  </label>
                  <label>
                    사유
                    <textarea
                      rows={3}
                      value={aiFeedbackReason}
                      onChange={(event) => setAiFeedbackReason(event.target.value)}
                      placeholder="AI 판단과 다른 점, 추가로 고려해야 할 상황을 적어주세요."
                    />
                  </label>
                  <label>
                    요청 조치
                    <input
                      value={aiFeedbackAction}
                      onChange={(event) => setAiFeedbackAction(event.target.value)}
                      placeholder="예: 긴급도 상향, 관리자 재검토, 업체 재방문"
                    />
                  </label>
                  <div className="composer-row">
                    <input
                      key={aiFeedbackPhotoInputKey}
                      type="file"
                      accept={supportedImageAccept}
                      onChange={(event) => setAiFeedbackPhotoFile(event.target.files?.[0] ?? null)}
                    />
                    <button type="submit" className="secondary">
                      이의제기
                    </button>
                  </div>
                  {aiFeedbackPhotoFile ? (
                    <p className="selected-file">
                      첨부 예정: {aiFeedbackPhotoFile.name} ·{" "}
                      {(aiFeedbackPhotoFile.size / 1024).toFixed(1)}KB
                    </p>
                  ) : null}
                </form>
              </section>
              {completionReviewAvailable ? (
                <section className="completion-actions">
                  <div className="completion-heading">
                    <div>
                      <h3>수리 결과 확인</h3>
                      <p>
                        {selectedComplaint.ticket.status === "COMPLETION_REPORTED"
                          ? "업체가 완료 보고를 남겼습니다."
                          : "완료 처리된 민원입니다."}
                      </p>
                    </div>
                    {tenantConfirmedCompletion ? (
                      <span>확인 완료</span>
                    ) : (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void confirmCompletion()}
                      >
                        완료 확인
                      </button>
                    )}
                  </div>
                  <form className="reopen-form" onSubmit={submitReopenComplaint}>
                    <label>
                      미해결 사유
                      <textarea
                        rows={3}
                        value={reopenText}
                        onChange={(event) => setReopenText(event.target.value)}
                        placeholder="아직 남은 증상, 다시 확인이 필요한 위치, 원하는 조치 등을 남기세요."
                      />
                    </label>
                    <div className="composer-row">
                      <input
                        key={reopenPhotoInputKey}
                        type="file"
                        accept={supportedImageAccept}
                        onChange={(event) => setReopenPhotoFile(event.target.files?.[0] ?? null)}
                      />
                      <button type="submit" className="secondary">
                        재요청
                      </button>
                    </div>
                    {reopenPhotoFile ? (
                      <p className="selected-file">
                        첨부 예정: {reopenPhotoFile.name} ·{" "}
                        {(reopenPhotoFile.size / 1024).toFixed(1)}KB
                      </p>
                    ) : null}
                  </form>
                </section>
              ) : null}
              <form className="followup-form" onSubmit={submitComplaintFollowup}>
                <label>
                  추가 설명
                  <textarea
                    rows={3}
                    value={followupText}
                    onChange={(event) => setFollowupText(event.target.value)}
                    placeholder="요청받은 사진 설명, 현재 상태, 방문 가능 시간 변경 등을 남기세요."
                  />
                </label>
                <div className="composer-row">
                  <input
                    key={followupPhotoInputKey}
                    type="file"
                    accept={supportedImageAccept}
                    multiple
                    onChange={(event) =>
                      setFollowupPhotoFiles(normalizeSelectedPhotos(event.target.files))
                    }
                  />
                  <button type="submit" className="primary">
                    추가 자료 제출
                  </button>
                </div>
                {followupPhotoFiles.length ? (
                  <p className="selected-file">{selectedPhotoSummary(followupPhotoFiles)}</p>
                ) : null}
              </form>
            </section>
          ) : null}

          {home?.roomTimeline.length ? (
            <section className="complaint-detail">
              <div className="panel-heading compact">
                <p className="eyebrow">Room Timeline</p>
                <h2>호실 통합 기록</h2>
              </div>
              <ol className="timeline">
                {home.roomTimeline.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {timelineTypeLabel(entry.type)}
                      {entry.status ? ` · ${entry.status}` : ""}
                    </span>
                    <p>{entry.description || entry.title}</p>
                    {entry.attachmentUrls.length ? (
                      <div className="attachment-preview">
                        {entry.attachmentUrls.map((url) => (
                          <AttachmentImageLink url={url} alt="호실 기록 첨부 사진" key={url} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
