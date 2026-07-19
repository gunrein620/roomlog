import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Optional,
  UnauthorizedException
} from "@nestjs/common";
import type { VendorRepairMessageRecord } from "./vendor-workflow.repository";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  ResceneVendorActivation,
  TicketType,
  VendorAccountView,
  VendorActivationClaimResult,
  VendorActivationIssueResult,
  VendorActivationPreview
} from "@roomlog/types";
import {
  billingDateInSeoul,
  billingMonthInSeoul,
  billingTodayInSeoul,
  billPayableFrom,
  isBillPaymentOpen,
  paymentHistoryInclusiveDays
} from "@roomlog/types/payment";
import {
  TossPaymentsHttpGateway,
  type TossPaymentGateway
} from "../payment/toss-payment.gateway";
import { CreditService } from "../credit/credit.service";
import { createFileStorageAdapter, FileStorageAdapter } from "./storage.service";
import {
  hasRequiredPasswordMix,
  hashPassword,
  id,
  isValidPhoneNumber,
  normalizePhoneNumber,
  now,
  tokenFor,
  tokenSecret,
  verifyPassword
} from "./roomlog-support";
import { RoomlogAuthDomain } from "./services/roomlog-auth.domain";
import { RoomlogFloorPlanDomain } from "./services/roomlog-floor-plan.domain";
import { RoomlogCostDomain } from "./services/roomlog-cost.domain";
import {
  NoopFinancialCostReader,
  type FinancialCostReader
} from "./services/prisma-financial-cost.reader";
import { RoomlogChecklistDomain } from "./services/roomlog-checklist.domain";
import { RoomlogContractDomain } from "./services/roomlog-contract.domain";
import { RoomlogVendorMgmtDomain } from "./services/roomlog-vendor-mgmt.domain";
import { RoomlogVendorActivationDomain } from "./services/roomlog-vendor-activation.domain";
import type { VendorActivationSecurityConfig } from "./services/vendor-activation-security";
import type {
  VendorAccountResolver,
  VendorActivationRepository
} from "./vendor-activation.repository";
import { UnavailableVendorActivationRepository } from "./unavailable-vendor-activation.repository";
import type { TenantVendorWorkflowAuthority } from "./tenant-vendor-connection.repository";
import {
  DirectHandlingPersistenceError,
  type DirectHandlingMutationResult,
  type DirectHandlingPersistence
} from "./direct-handling.persistence";
import { RoomlogMessagingDomain } from "./services/roomlog-messaging.domain";
import { RoomlogAnnouncementTranslationService } from "./services/roomlog-announcement-translation.service";
import { RoomlogMoveoutDomain } from "./services/roomlog-moveout.domain";
import { RoomlogReportDomain } from "./services/roomlog-report.domain";
import { RoomlogCopilotDomain } from "./services/roomlog-copilot.domain";
import {
  buildManagerRealtimeInstructions,
  toRealtimeTools
} from "./services/manager-agent-persona";
import {
  AddMessagingThreadMessageInput,
  AnnouncementTranslationRequest,
  AddTenantComplaintMessageInput,
  AskManagerReportChatInput,
  AiFeedback,
  AiFeedbackTarget,
  AiAnalysis,
  AssignVendorInput,
  Attachment,
  Bill,
  BillLineItem,
  BillLineItemKind,
  BillLineItemStatus,
  BillPaymentTransaction,
  BillStatus,
  CallbotTicketContext,
  Complaint,
  ComplaintSourceChannel,
  ComplaintStatus,
  ConfirmTenantCompletionInput,
  CompleteDirectHandlingInput,
  CreateRoomInput,
  Contract,
  ContractDocument,
  ContractExtraction,
  ContractInvite,
  ContractPrivacy,
  ConnectAcceptedTradeContractInput,
  Cost,
  CostReviewQueueSummary,
  CostType,
  CopilotChatRequest,
  CopilotChatResponse,
  CreateManagerContractInput,
  CreateManagerContractInviteInput,
  CreateManagerBillsInput,
  CreateManagerBillsResult,
  CreateAnnouncementDraftInput,
  CreateManagerReportExternalShareInput,
  CreateManagerReportFollowUpInput,
  CreateManagerReportInput,
  DeletionState,
  EscalateMoveoutDisputeInput,
  EnsureTradeContractDraftInput,
  CreateComplaintFromCallInput,
  CreateComplaintInput,
  CreateIntakeSessionInput,
  CreateMessagingThreadInput,
  CreateMoveoutDisputeInput,
  CreateMoveInChecklistItemInput,
  CreateBillPaymentOrderInput,
  CreatePaymentReportInput,
  CreateTenantContractInput,
  CreateTenantMessagingThreadInput,
  CreateTenantMoveoutInquiryInput,
  CancelDirectHandlingInput,
  DisclosureSetting,
  Deposit,
  DuplicateTicketCandidate,
  FinalizeIntakeInput,
  FloorPlanAiAnalysisInput,
  FloorPlanAiAnalysisResult,
  FloorPlanAiDimensionDetection,
  FloorPlanAiDimensionKind,
  FloorPlanAiModel,
  FloorPlanAiModelId,
  FloorPlanAiCandidateReview,
  FloorPlanAiMissingWallHint,
  FloorPlanAiNormalizedLine,
  FloorPlanAiRoomStructure,
  FloorPlanAiRoomStructureNoiseFlags,
  FloorPlanAiRoomStructurePlanStyle,
  FloorPlanAiRoomType,
  FloorPlanAiScaleCandidate,
  FloorPlanAiTextDetection,
  FloorPlanAiWallCandidate,
  FloorPlanDraft,
  FloorPlanOpeningCandidate,
  FloorPlanOpeningDetectionInput,
  FloorPlanOpeningDetectionResult,
  FloorPlanWall,
  IntakeDraft,
  IntakeMessage,
  IntakeSession,
  IntakeSlot,
  IntakeSlotKey,
  IntakeThreadSummary,
  MessagingAnnouncement,
  MessagingAnnouncementDelivery,
  MessagingAnnouncementDraft,
  MessagingAnnouncementResult,
  MessagingMessage,
  MessagingThread,
  MessagingThreadContext,
  ManagerAgentCommandInput,
  ManagerAgentCommandResult,
  ManagerAssistantQueryInput,
  ManagerAssistantQueryResult,
  ManagerAssistantTicketMatch,
  ManagerDunningActionPreview,
  ManagerProxyIntakeInput,
  ManagerRealtimeClientSecretResult,
  ManagerReport,
  ManagerReportAuditLogEntry,
  ManagerReportExternalShare,
  ManagerReportSourceReference,
  ManagerReplyDraftInput,
  ManagerReplyDraftResult,
  ManagerReplyIntent,
  ManagerTicketLane,
  ManagerTicketReplyInput,
  SetManagerTicketLaneInput,
  MaintenanceFee,
  MatchDepositInput,
  MoveInChecklistItem,
  PaymentBadge,
  PaymentReport,
  MoveoutAdjustDeductionInput,
  MoveoutAdjustWearVerdictInput,
  MoveoutChecklistItem,
  MoveoutCompleteReviewInput,
  MoveoutDeductionCandidate,
  MoveoutDispute,
  MoveoutManagerSettlementReview,
  MoveoutRecordItem,
  MoveoutReportAuditEntry,
  MoveoutRespondDisputeInput,
  MoveoutSettlementEstimate,
  MoveoutSummary,
  UpdateTenantMoveoutDisputeInput,
  UpdateAnnouncementDraftInput,
  UpdateMoveoutChecklistInput,
  PhotoAnalysis,
  PhotoComparisonStatus,
  RealtimeClientSecretInput,
  RealtimeClientSecretResult,
  RecordRealtimeTurnInput,
  RepeatIssueSummary,
  ReopenTenantComplaintInput,
  RepairRequest,
  RepairStatus,
  ReviewTenantAiFeedbackInput,
  Receipt,
  ReceiptOcr,
  Room,
  RoomWall,
  RoomTimelineEntry,
  SaveAttachmentInput,
  SaveContractDocumentUploadInput,
  SaveFloorPlanDraftInput,
  SaveRoomWallsInput,
  SimulatorWallData,
  SendIntakeMessageInput,
  SendDunningInput,
  StartDirectHandlingInput,
  StartManagerConversationInput,
  StatusHistory,
  SubmitTenantAiFeedbackInput,
  DecideTicketResponsibilityInput,
  TeamBill,
  TeamBillCreationData,
  TeamBillCreationUnavailableReason,
  TeamBillPaymentOrder,
  TeamBillRow,
  TeamBillingDashboard,
  TeamBillingScope,
  TeamCollection,
  TeamCollectionBuildingRow,
  TeamCollectionPoint,
  TeamCollectionTiming,
  TeamDashSummary,
  TeamDeposit,
  TeamDunning,
  TeamMaintenance,
  TeamManagerBillDetail,
  TeamOverdue,
  TeamOverdueWorkspace,
  TeamReport,
  TeamTenantBillingOverview,
  TeamTenantPaymentHistory,
  TeamTenantPaymentHistoryEvent,
  TeamTransactionLedgerRow,
  Ticket,
  TicketMessage,
  TicketStatus,
  SocialAccount,
  ConfirmBillPaymentInput,
  UpdateManagerContractInventoryInput,
  UpdateManagerContractInviteInput,
  UpdateManagerContractManualValuesInput,
  UpdateManagerContractPrivacyInput,
  UserAccount,
  UserRole
} from "./roomlog.types";

export type SignupInput = {
  email: string;
  password: string;
  passwordConfirm?: string;
  name: string;
  phone?: string;
  role: UserRole;
  inviteToken?: string;
  buildingName?: string;
  roomNo?: string;
  address?: string;
  businessName?: string;
  serviceArea?: string;
};

export type CreateTenantInviteInput = {
  roomId: string;
  email?: string;
  tenantName: string;
  phone?: string;
  moveInDate?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type GoogleSocialLoginInput = {
  code: string;
  redirectUri: string;
  role?: UserRole;
  inviteToken?: string;
  flow?: "login" | "signup";
};

export type KakaoSocialLoginInput = GoogleSocialLoginInput;

/**
 * 관리인 진행 레인(3단계) → 티켓 상태. 세부 상태를 접은 대표값 하나씩만 쓴다.
 * 되돌리기(완료→접수)도 허용한다 — 실무에서 잘못 누른 것을 되돌릴 길이 없으면 안 된다.
 */
const MANAGER_TICKET_LANE_STATUS: Record<ManagerTicketLane, TicketStatus> = {
  received: "RECEIVED",
  processing: "REPAIR_IN_PROGRESS",
  resolved: "COMPLETED"
};

const MANAGER_TICKET_LANE_LABEL: Record<ManagerTicketLane, string> = {
  received: "접수",
  processing: "진행",
  resolved: "완료"
};

const FLOOR_PLAN_AI_MODELS: FloorPlanAiModel[] = [
  {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    label: "Nemotron Omni",
    mode: "vision-reasoning",
    description: "NVIDIA vision reasoning model for reading dimensions and structural hints from floor-plan images."
  },
  {
    id: "nvidia/cosmos3-nano-reasoner",
    label: "Cosmos3 Reasoner",
    mode: "vision-reasoning",
    description: "NVIDIA reasoning model for fast floor-plan dimension analysis."
  },
  {
    id: "openai/floor-plan-vision",
    label: "OpenAI Vision",
    mode: "vision-reasoning",
    description: "OpenAI vision model for dimension, candidate, room-structure, and object-graph analysis."
  }
];

const FLOOR_PLAN_NORMALIZED_LINE_SCHEMA = {
  additionalProperties: false,
  properties: {
    x1: { maximum: 1000, minimum: 0, type: "number" },
    x2: { maximum: 1000, minimum: 0, type: "number" },
    y1: { maximum: 1000, minimum: 0, type: "number" },
    y2: { maximum: 1000, minimum: 0, type: "number" }
  },
  required: ["x1", "y1", "x2", "y2"],
  type: "object"
} as const;

const FLOOR_PLAN_CANDIDATE_REVIEW_SCHEMA = {
  additionalProperties: false,
  properties: {
    candidateReviews: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          id: { type: "string" },
          reason: { type: "string" },
          verdict: { enum: ["keep", "reject", "review"], type: "string" }
        },
        required: ["id", "verdict", "confidence", "reason"],
        type: "object"
      },
      maxItems: 80,
      type: "array"
    },
    missingWallHints: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          description: { type: "string" },
          line: FLOOR_PLAN_NORMALIZED_LINE_SCHEMA,
          orientation: { enum: ["horizontal", "vertical"], type: "string" }
        },
        required: ["description", "confidence", "orientation", "line"],
        type: "object"
      },
      maxItems: 30,
      type: "array"
    },
    summary: { type: "string" }
  },
  required: ["summary", "candidateReviews", "missingWallHints"],
  type: "object"
} as const;

const FLOOR_PLAN_ROOM_POINT_SCHEMA = {
  additionalProperties: false,
  properties: {
    x: { maximum: 1000, minimum: 0, type: "number" },
    y: { maximum: 1000, minimum: 0, type: "number" }
  },
  required: ["x", "y"],
  type: "object"
} as const;

const FLOOR_PLAN_ROOM_STRUCTURE_SCHEMA = {
  additionalProperties: false,
  properties: {
    noiseFlags: {
      additionalProperties: false,
      properties: {
        decorativeHatching: { type: "boolean" },
        watermark: { type: "boolean" }
      },
      required: ["decorativeHatching", "watermark"],
      type: "object"
    },
    planStyle: { enum: ["solid-filled", "double-line-hollow", "hatched", "gray-fill"], type: "string" },
    rooms: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          label: { type: "string" },
          roomType: {
            enum: [
              "LIVING_ROOM",
              "BEDROOM",
              "DRESS_ROOM",
              "KITCHEN_DINING",
              "BATHROOM",
              "LAUNDRY_UTILITY",
              "BALCONY",
              "ENTRY",
              "HALLWAY",
              "UNKNOWN"
            ],
            type: "string"
          },
          polygon: {
            items: FLOOR_PLAN_ROOM_POINT_SCHEMA,
            maxItems: 12,
            minItems: 4,
            type: "array"
          }
        },
        required: ["label", "roomType", "polygon", "confidence"],
        type: "object"
      },
      maxItems: 40,
      type: "array"
    },
    summary: { type: "string" }
  },
  required: ["summary", "planStyle", "noiseFlags", "rooms"],
  type: "object"
} as const;

const FLOOR_PLAN_OBJECT_GRAPH_PROMPT = `You extract a structured object graph from a Korean residential floor-plan image (apartment/villa/officetel) for a 2D/3D room modeling pipeline.
Return JSON only, following the provided schema exactly.

The original image size is {width}x{height} pixels. All coordinates use this original pixel coordinate system: origin at top-left, x to the right, y down.

A second image may be provided: a reference sheet of Korean floor-plan symbols. Use it only to learn what each symbol looks like. Never copy geometry or coordinates from the reference sheet.

## Region policy
- Use floor color/texture ONLY to separate the home unit interior from non-home areas (common corridor, stairwell, elevator core, neighboring unit, background, app UI chrome).
- homeRegions: output one "home" polygon covering the unit interior including balconies, and "excluded" polygons for adjacent non-home structures that could be mistaken for the unit.
- Do not segment individual rooms by floor color.

## Wall policy
- Output structural wall centerlines. Merge double parallel lines and filled wall masses into ONE centerline at the visual center of the wall mass.
- Prefer orthogonal horizontal/vertical segments. Split only at corners, T-junctions, and room-boundary turns.
- Vertical walls must have identical x at both endpoints; horizontal walls identical y. Before emitting each wall, verify start/end are not accidentally collapsed (x equal to y by copy mistake). Diagonal walls are rare in Korean floor plans — only output one when the drawing clearly shows a slanted wall.
- DO NOT split walls at door openings. Keep each wall centerline continuous through both doors and windows; report openings separately in objects. The client cuts door gaps later using your objects.
- thicknessPx: wall mass thickness in pixels, or null if unclear.
- Only include walls of the home unit. Never output walls that belong to excluded regions (neighbor unit, common core).
- Never create walls from: door leaves, swing arcs, window frame/sash lines, furniture outlines, fixtures, stair treads, hatching/tile/wood textures, dimension lines, arrows, extension lines, text, watermarks, UI chrome.

## Object policy
Detect these symbol classes (type ids are fixed):
- swingDoor: straight door leaf + quarter-circle swing arc at a wall opening (방문, 현관문).
- doubleSwingDoor: two mirrored leaves with two arcs.
- slidingDoor: overlapping thin parallel panels in an opening, no swing arc (미닫이문, 중문, 슬라이딩도어).
- pocketDoor: a leaf that slides into a wall pocket, no arc.
- window: thin double/triple frame lines drawn inside/on a wall band, no arc.
- balconyWindow: long multi-track window frame on an exterior or balcony wall (샷시).
- toilet: bowl ellipse + tank rectangle near a bathroom wall.
- sink: small wash-basin rectangle/half-round on a bathroom wall.
- bathtub: long rounded rectangle along a bathroom wall.
- showerBooth: small partitioned corner with diagonal or drain mark.
- floorDrain: small circle/square with cross or grid mark on wet-area floor.
- kitchenSink: sink bowl rectangle on a counter line.
- gasRange: rectangle containing 2-4 burner circles on a counter.
- refrigerator: large appliance box in kitchen/utility area.
- stairs: repeated parallel treads, may carry UP/DN text — only when inside the home unit.
- elevator: shaft square with X — usually in excluded region; output only if inside the home unit.
- column: small solid structural rectangle, attached to or separate from walls.

For every object:
- center and size: the axis-aligned bounding box in pixels (size measured before rotation).
- rotationDeg: 0, 90, 180 or 270 — the rotation that maps the canonical upright symbol onto the drawing.
- attachedWallId: id of the wall the object sits on or in, else null. Every door and window MUST reference a wall id when one exists; if you truly cannot match a wall, keep the object with attachedWallId null and lower confidence.
- spanOnWall: doors/windows only — the exact segment of the wall centerline covered by the opening, both endpoints lying on that wall. null for non-openings.
- swing: swingDoor/doubleSwingDoor only — hinge: which spanOnWall endpoint ("start" or "end") carries the hinge; opensTowards: a point roughly at the middle of the swept arc area, on the side the door opens into. null otherwise.
- confidence 0..1 and a short evidence string (e.g. "leaf+arc at bathroom entry").

Reject and count in rejectionSummary:
- freestanding furniture (bed, sofa, table, wardrobe) unless clearly built-in
- text labels, room-name text, area text
- dimension lines, arrows, extension lines
- hatching and floor textures
- watermarks and screenshot UI

## Dimension policy
- dimensionTexts: printed dimension labels (e.g. "2051mm"), with valueMm parsed when clear and appliesTo describing the measured span.
- scaleCandidates: when a printed dimension clearly matches a pixel span, output pixelLength, realLengthMm, pixelToMmRatio, confidence, sourceText.

## Quality
- Prefer missing a doubtful fixture over inventing one. Prefer missing a short wall over creating false geometry.
- Wall endpoints that visually meet must share nearly identical coordinates (within a few pixels) so corners close cleanly.
- When unsure, lower confidence and mention it in warnings.`;

const FLOOR_PLAN_OBJECT_TYPES = [
  "swingDoor",
  "doubleSwingDoor",
  "slidingDoor",
  "pocketDoor",
  "window",
  "balconyWindow",
  "toilet",
  "sink",
  "bathtub",
  "showerBooth",
  "floorDrain",
  "kitchenSink",
  "gasRange",
  "refrigerator",
  "stairs",
  "elevator",
  "column"
] as const;

const FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA = {
  additionalProperties: false,
  properties: {
    x: { type: "number" },
    y: { type: "number" }
  },
  required: ["x", "y"],
  type: "object"
} as const;

const FLOOR_PLAN_OBJECT_GRAPH_SCHEMA = {
  additionalProperties: false,
  properties: {
    dimensionTexts: {
      items: {
        additionalProperties: false,
        properties: {
          appliesTo: { type: "string" },
          confidence: { maximum: 1, minimum: 0, type: "number" },
          text: { type: "string" },
          valueMm: { type: ["number", "null"] }
        },
        required: ["text", "valueMm", "appliesTo", "confidence"],
        type: "object"
      },
      maxItems: 40,
      type: "array"
    },
    homeRegions: {
      items: {
        additionalProperties: false,
        properties: {
          kind: { enum: ["home", "excluded"], type: "string" },
          polygon: {
            items: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA,
            maxItems: 40,
            minItems: 3,
            type: "array"
          }
        },
        required: ["kind", "polygon"],
        type: "object"
      },
      maxItems: 8,
      type: "array"
    },
    objects: {
      items: {
        additionalProperties: false,
        properties: {
          attachedWallId: { type: ["string", "null"] },
          center: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA,
          confidence: { maximum: 1, minimum: 0, type: "number" },
          evidence: { type: "string" },
          id: { type: "string" },
          rotationDeg: { enum: [0, 90, 180, 270], type: "number" },
          size: {
            additionalProperties: false,
            properties: {
              height: { minimum: 0, type: "number" },
              width: { minimum: 0, type: "number" }
            },
            required: ["width", "height"],
            type: "object"
          },
          spanOnWall: {
            additionalProperties: false,
            properties: {
              end: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA,
              start: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA
            },
            required: ["start", "end"],
            type: ["object", "null"]
          },
          swing: {
            additionalProperties: false,
            properties: {
              hinge: { enum: ["start", "end"], type: "string" },
              opensTowards: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA
            },
            required: ["hinge", "opensTowards"],
            type: ["object", "null"]
          },
          type: { enum: FLOOR_PLAN_OBJECT_TYPES, type: "string" }
        },
        required: ["id", "type", "center", "size", "rotationDeg", "attachedWallId", "spanOnWall", "swing", "confidence", "evidence"],
        type: "object"
      },
      maxItems: 60,
      type: "array"
    },
    rejectionSummary: {
      additionalProperties: false,
      properties: {
        dimensionOrText: { minimum: 0, type: "integer" },
        doorSymbols: { minimum: 0, type: "integer" },
        furnitureOrFixtures: { minimum: 0, type: "integer" },
        textureOrHatching: { minimum: 0, type: "integer" },
        uiChrome: { minimum: 0, type: "integer" },
        windowFrameOnly: { minimum: 0, type: "integer" }
      },
      required: ["doorSymbols", "windowFrameOnly", "furnitureOrFixtures", "dimensionOrText", "textureOrHatching", "uiChrome"],
      type: "object"
    },
    scaleCandidates: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          pixelLength: { minimum: 0, type: "number" },
          pixelToMmRatio: { minimum: 0, type: "number" },
          realLengthMm: { minimum: 0, type: "number" },
          sourceText: { type: "string" }
        },
        required: ["pixelLength", "realLengthMm", "pixelToMmRatio", "confidence", "sourceText"],
        type: "object"
      },
      maxItems: 30,
      type: "array"
    },
    summary: { type: "string" },
    walls: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { maximum: 1, minimum: 0, type: "number" },
          end: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA,
          id: { type: "string" },
          role: { enum: ["outer", "inner", "balcony", "wet-area", "unknown"], type: "string" },
          start: FLOOR_PLAN_OBJECT_GRAPH_POINT_SCHEMA,
          thicknessPx: { type: ["number", "null"] }
        },
        required: ["id", "start", "end", "thicknessPx", "role", "confidence"],
        type: "object"
      },
      maxItems: 90,
      type: "array"
    },
    warnings: {
      items: { type: "string" },
      maxItems: 20,
      type: "array"
    }
  },
  required: ["summary", "warnings", "homeRegions", "walls", "objects", "dimensionTexts", "scaleCandidates", "rejectionSummary"],
  type: "object"
} as const;

export type ManagerContractOrigin =
  | "tenant_upload"
  | "manager_upload"
  | "manual"
  | "trade_acceptance";

export type ManagerContractRow = {
  contract: Contract;
  tenantName: string;
  buildingName: string;
  depositSummary?: string;
  clauseSummary?: string;
  origin: ManagerContractOrigin;
  statusLabel: string;
  slaOverdue: boolean;
  needsCheckCount: number;
  daysToExpire: number;
  mobileQuickConfirm: boolean;
};

export type ConfirmContractInput = {
  confirmNeedsCheck?: boolean;
  note?: string;
};


export type VendorActivationProvider = VendorActivationRepository &
  VendorAccountResolver;

/**
 * 인증 계정(UserAccount/SocialAccount)의 DB 단일 원본 저장소.
 * 전체 스토어 프로젝션(StoreProjector)과 달리 응답 전에 동기 커밋된다 —
 * 회원가입은 이 저장이 성공해야 토큰을 반환하고, 로그인은 DB에서 계정을 직접 조회한다.
 */
export interface AuthAccountRepository {
  assertAccountAvailable(email: string, phone?: string): Promise<void>;
  findUserByEmail(email: string): Promise<UserAccount | null>;
  saveUser(user: UserAccount): Promise<void>;
  saveSocialAccount(account: SocialAccount): Promise<void>;
  disconnect?(): Promise<void>;
}

export type RoomlogServiceOptions = {
  storeFilePath?: string;
  uploadDir?: string;
  publicUploadBaseUrl?: string;
  storageAdapter?: FileStorageAdapter;
  seedDemoData?: boolean;
  initialStore?: Store;
  storeProjector?: StoreProjector;
  financialCostReader?: FinancialCostReader;
  authRepository?: AuthAccountRepository;
  paymentGateway?: TossPaymentGateway;
  vendorActivationRepository?: VendorActivationProvider;
  vendorActivationSecurity?: VendorActivationSecurityConfig;
};

export type AuthResult = {
  userId: string;
  role: UserRole;
  roles: UserRole[];
  accessToken: string;
  name: string;
};

export type VendorSummary = {
  id: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  businessNumber?: string;
  trades?: string[];
  serviceAreas?: string[];
  verificationStatus?: "VERIFIED" | "PENDING" | "REJECTED";
  isActive?: boolean;
  activeJobs: number;
  createdByManagerId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type VendorInvite = {
  id: string;
  inviteToken: string;
  invitedByManagerId: string;
  email?: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  signupUrl: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedByUserId?: string;
};

export type TenantInvite = {
  id: string;
  inviteToken: string;
  invitedByManagerId: string;
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
};

export type Store = {
  users: UserAccount[];
  socialAccounts: SocialAccount[];
  rooms: Room[];
  roomWalls: RoomWall[];
  tenantRooms: Record<string, string>;
  vendors: VendorSummary[];
  vendorInvites: VendorInvite[];
  tenantInvites: TenantInvite[];
  contracts: Contract[];
  contractDocuments: ContractDocument[];
  contractExtractions: ContractExtraction[];
  contractPrivacies: ContractPrivacy[];
  contractInvites: ContractInvite[];
  bills: Bill[];
  paymentReports: PaymentReport[];
  deposits: Deposit[];
  paymentTransactions: BillPaymentTransaction[];
  maintenanceFees: MaintenanceFee[];
  attachments: Attachment[];
  floorPlans: FloorPlanDraft[];
  moveInChecklist: MoveInChecklistItem[];
  aiFeedback: AiFeedback[];
  intakeSessions: IntakeSession[];
  complaints: Complaint[];
  analyses: Record<string, AiAnalysis>;
  tickets: Ticket[];
  managerTicketReads?: ManagerTicketRead[];
  repairs: RepairRequest[];
  costs: Cost[];
  receipts: Receipt[];
  receiptOcrs: ReceiptOcr[];
  messages: TicketMessage[];
  messagingThreads: MessagingThread[];
  messagingMessages: MessagingMessage[];
  messagingAnnouncementDrafts: MessagingAnnouncementDraft[];
  messagingAnnouncements: MessagingAnnouncement[];
  messagingAnnouncementDeliveries: MessagingAnnouncementDelivery[];
  managerReports: ManagerReport[];
  managerReportSourceReferences: ManagerReportSourceReference[];
  managerReportExternalShares: ManagerReportExternalShare[];
  managerReportAuditLogs: ManagerReportAuditLogEntry[];
  moveouts: MoveoutSummary[];
  moveoutRecords: MoveoutRecordItem[];
  moveoutChecklist: MoveoutChecklistItem[];
  moveoutSettlements: MoveoutSettlementEstimate[];
  moveoutDeductions: MoveoutDeductionCandidate[];
  moveoutDisputes: MoveoutDispute[];
  moveoutReportAudits: MoveoutReportAuditEntry[];
  history: StatusHistory[];
};

export type ManagerTicketRead = {
  managerId: string;
  ticketId: string;
  readAt: string;
};

export type ComplaintAggregateIds = {
  complaintId: string;
  ticketId: string;
  historyIds: string[];
  messageIds: string[];
};

export type StoreProjector = Partial<DirectHandlingPersistence> & {
  load?(): Store | undefined | Promise<Store | undefined>;
  persist(store: Store): void | Promise<void>;
  removeComplaintAggregate?(
    ids: ComplaintAggregateIds
  ): void | Promise<void>;
  disconnect?(): void | Promise<void>;
};

type GeneratedIntakeTurn = {
  assistantMessage: string;
  draft: IntakeDraft;
  source: "openai" | "fallback";
};

const ROOM_WALL_HEIGHT_M = 2.5;
const ROOM_WALL_DEPTH_M = 0.15;
const DEFAULT_ROBOFLOW_DETECTION_CONFIDENCE = 20;
const DEFAULT_ROBOFLOW_DETECTION_OVERLAP = 30;
const DEFAULT_ROBOFLOW_MIN_BOX_CONFIDENCE = 0.5;
const DEFAULT_ROBOFLOW_DOOR_MIN_BOX_CONFIDENCE = 0.15;
const DEFAULT_ROBOFLOW_WINDOW_MIN_BOX_CONFIDENCE = 0.2;
const ROBOFLOW_BOX_IOU_DUPLICATE_THRESHOLD = 0.5;
const ROBOFLOW_BOX_CONTAINMENT_DUPLICATE_THRESHOLD = 0.75;
export const ROOMLOG_SERVICE_OPTIONS = "ROOMLOG_SERVICE_OPTIONS";

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;

  return Math.max(min, Math.min(max, value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function envConfidenceRatio(name: string, fallback: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  const ratio = value > 1 ? value / 100 : value;

  return Math.max(0, Math.min(1, ratio));
}

function priorityDueAt(priority: number) {
  const due = new Date();
  due.setDate(due.getDate() + (priority === 1 ? 1 : priority === 2 ? 2 : 7));
  return due.toISOString();
}

function priorityLabelForAnalysis(priority: number) {
  const labels: Record<number, string> = {
    1: "긴급",
    2: "우선",
    3: "일반",
    4: "문의"
  };

  return labels[priority] ?? "확인";
}

function complaintStatusFor(ticketStatus: TicketStatus): ComplaintStatus {
  const map: Record<TicketStatus, ComplaintStatus> = {
    RECEIVED: "SUBMITTED",
    REVIEWING: "REVIEWING",
    ADDITIONAL_INFO_REQUESTED: "ADDITIONAL_INFO_REQUESTED",
    VENDOR_ASSIGNMENT_PENDING: "REVIEWING",
    VENDOR_ASSIGNED: "VENDOR_ASSIGNED",
    ESTIMATE_REVIEW: "VENDOR_ASSIGNED",
    REPAIR_IN_PROGRESS: "REPAIR_IN_PROGRESS",
    COMPLETION_REPORTED: "REPAIR_IN_PROGRESS",
    COMPLETED: "COMPLETED",
    REOPENED: "REOPENED",
    CANCELLED: "REOPENED"
  };

  return map[ticketStatus];
}

/**
 * 로그인 가능한 핵심 데모 계정 4종 — 데모 스토어(createDemoStore)와
 * DB 부팅 보정(ensureCoreDemoLoginAccounts)이 같은 정의를 공유한다.
 * DB가 원본인 환경에서 계정 유실이 있어도 이 계정들로는 항상 로그인할 수 있어야 한다.
 */
export function coreDemoLoginAccounts(): UserAccount[] {
  const createdAt = now();

  return [
    {
      id: "tenant-demo",
      email: "tenant@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "김민수",
      phone: "010-1000-3001",
      role: "TENANT",
      status: "ACTIVE",
      createdAt
    },
    {
      id: "landlord-demo",
      email: "manager@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "박관리",
      phone: "010-2000-0001",
      role: "LANDLORD",
      status: "ACTIVE",
      createdAt
    },
    {
      id: "vendor-demo-user",
      email: "vendor@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "이수리",
      phone: "010-3000-0001",
      role: "VENDOR",
      status: "ACTIVE",
      createdAt
    },
    // multi-role 데모: 정글빌라 301호에 세들어 살면서(TENANT) 402호를 내놓은(LANDLORD) 겸직 계정.
    // legacy role 단일값은 TENANT지만, 파생 capability로 LANDLORD 표면에도 진입할 수 있어야 한다.
    {
      id: "multi-demo",
      email: "multi@roomlog.test",
      passwordHash: hashPassword("password123!"),
      name: "정겸직",
      phone: "010-4000-0001",
      role: "TENANT",
      status: "ACTIVE",
      createdAt
    }
  ];
}

function createDemoStore(): Store {
  const moveoutCreatedAt = "2026-07-01T09:00:00+09:00";
  const moveoutUpdatedAt = "2026-07-02T09:00:00+09:00";
  const moveoutDisputeCreatedAt = "2026-06-28T09:00:00+09:00";
  const moveoutDisputeDeadline = "2026-07-01T09:00:00+09:00";
  const createdAt = now();
  const users: UserAccount[] = coreDemoLoginAccounts();
  const contractCreatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const contractUpdatedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString();
  const billingDate = new Date();
  const currentBillingMonth = billingDate.toISOString().slice(0, 7);
  const previousBillingDate = new Date(billingDate);
  previousBillingDate.setMonth(previousBillingDate.getMonth() - 1);
  const previousBillingMonth = previousBillingDate.toISOString().slice(0, 7);
  const currentDueDate = new Date(billingDate);
  currentDueDate.setDate(currentDueDate.getDate() + 5);
  const guardedDueDate = new Date(billingDate);
  guardedDueDate.setDate(guardedDueDate.getDate() - 3);
  const guardedDepositDate = new Date(guardedDueDate);
  guardedDepositDate.setDate(guardedDepositDate.getDate() + 1);
  const activeOverdueDueDate = new Date(billingDate);
  activeOverdueDueDate.setDate(activeOverdueDueDate.getDate() - 12);
  const billingTimestamp = (dayOffset: number, hour: number) => {
    const date = new Date(billingDate);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, 0, 0, 0);

    return date.toISOString();
  };
  const currentBillUnits = ["301", "302", "303", "304", "305"];
  const activeOverdueUnits = ["411", "412", "413", "414", "415"];
  const orphanDepositUnits = ["601", "602", "603", "604", "605"];
  const billingTenantSeed = [
    { unit: "302", id: "tenant-billing-302", name: "김하윤", phone: "010-1000-0302" },
    { unit: "303", id: "tenant-billing-303", name: "이준서", phone: "010-1000-0303" },
    { unit: "304", id: "tenant-billing-304", name: "박서연", phone: "010-1000-0304" },
    { unit: "305", id: "tenant-billing-305", name: "최민재", phone: "010-1000-0305" },
    { unit: "411", id: "tenant-billing-411", name: "정예린", phone: "010-1000-0411" },
    { unit: "412", id: "tenant-billing-412", name: "한도윤", phone: "010-1000-0412" },
    { unit: "413", id: "tenant-billing-413", name: "오지후", phone: "010-1000-0413" },
    { unit: "414", id: "tenant-billing-414", name: "서민지", phone: "010-1000-0414" },
    { unit: "415", id: "tenant-billing-415", name: "유현우", phone: "010-1000-0415" }
  ];
  const managerBillingRooms: Room[] = [
    ...new Set([...currentBillUnits, ...activeOverdueUnits, ...orphanDepositUnits])
  ].map((unit) => ({
    id: `room-${unit}`,
    buildingName: "정글빌라",
    roomNo: `${unit}호`,
    address: "서울시 성동구 성수동",
    landlordId: "landlord-demo"
  }));
  const billingTenantUsers: UserAccount[] = billingTenantSeed.map((tenant) => ({
    id: tenant.id,
    email: `${tenant.id}@roomlog.test`,
    passwordHash: hashPassword("password123!"),
    name: tenant.name,
    phone: tenant.phone,
    role: "TENANT",
    status: "ACTIVE",
    createdAt
  }));
  const billingTenantRooms = Object.fromEntries(
    billingTenantSeed.map((tenant) => [tenant.id, `room-${tenant.unit}`])
  );
  const demoBillAmounts = (index: number) => {
    const rent = 650000 + index * 10000;
    const maintenance = 70000 + index * 2000;

    return { rent, maintenance, total: rent + maintenance };
  };
  const makeManagerBillingBill = (input: {
    id: string;
    unit: string;
    billingMonth: string;
    status: BillStatus;
    dueDate: string;
    amountIndex: number;
    paidAmount?: number | "FULL";
    maintenanceFeeId?: string;
    depositConfirmationRequested?: boolean;
  }): Bill => {
    const amount = demoBillAmounts(input.amountIndex);
    const paidAmount = input.paidAmount === "FULL" ? amount.total : input.paidAmount ?? 0;

    return {
      id: input.id,
      roomId: `room-${input.unit}`,
      unitId: `${input.unit}호`,
      billingMonth: input.billingMonth,
      status: input.status,
      totalAmount: amount.total,
      paidAmount,
      dueDate: input.dueDate,
      bankName: "룸로그은행",
      accountNumber: "123-45-678921",
      accountHolder: "박관리",
      correctionHistory: [],
      maintenanceFeeId: input.maintenanceFeeId,
      depositConfirmationRequested: input.depositConfirmationRequested ?? false,
      items: [
        { id: `${input.id}-rent`, label: "월세", amount: amount.rent },
        { id: `${input.id}-maintenance`, label: "관리비", amount: amount.maintenance }
      ],
      createdAt,
      updatedAt: createdAt
    };
  };
  const currentManagerBills = currentBillUnits.map((unit, index) =>
    makeManagerBillingBill({
      id: unit === "301" ? "bill-demo-current" : `bill-demo-current-${unit}`,
      unit,
      billingMonth: currentBillingMonth,
      status: index === 1 ? "PARTIALLY_PAID" : index === 2 || index === 4 ? "PAID" : "SENT",
      paidAmount: index === 1 ? 320000 : index === 2 || index === 4 ? "FULL" : 0,
      dueDate: currentDueDate.toISOString(),
      amountIndex: index,
      maintenanceFeeId: unit === "301" ? "mfee-demo-current" : `mfee-demo-current-${unit}`
    })
  );
  const guardedManagerBills = currentBillUnits.map((unit, index) =>
    makeManagerBillingBill({
      id: unit === "301" ? "bill-demo-guarded" : `bill-demo-guarded-${unit}`,
      unit,
      billingMonth: previousBillingMonth,
      status: "CONFIRMING",
      dueDate: guardedDueDate.toISOString(),
      amountIndex: index,
      depositConfirmationRequested: true
    })
  );
  const activeOverdueBills = activeOverdueUnits.map((unit, index) =>
    makeManagerBillingBill({
      id: `bill-demo-overdue-${unit}`,
      unit,
      billingMonth: previousBillingMonth,
      status: "SENT",
      dueDate: activeOverdueDueDate.toISOString(),
      amountIndex: index + 5
    })
  );
  const managerBillingBills = [
    ...currentManagerBills,
    ...guardedManagerBills,
    ...activeOverdueBills
  ];
  const managerBillingPaymentReports: PaymentReport[] = guardedManagerBills.map((bill, index) => ({
    id: index === 0 ? "payrep-demo-guarded" : `payrep-demo-guarded-${bill.unitId.replace(/\D/gu, "")}`,
    billId: bill.id,
    unitId: bill.unitId,
    amount: bill.totalAmount,
    depositorName: ["김민수", "김하윤", "이준서", "박서연", "최민재"][index],
    status: "CONFIRMING",
    etaHours: 24 + index * 6,
    reportedAt: index === 0 ? guardedDepositDate.toISOString() : billingTimestamp(-2 - index, 9 + index)
  }));
  const managerBillingDeposits: Deposit[] = [
    ...currentManagerBills.map((bill, index) => {
      const isMatched = index === 1 || index === 2 || index === 4;

      return {
        id: `dep-demo-match-${bill.unitId.replace(/\D/gu, "")}`,
        depositorName: ["김민수", "김하윤", "이준서", "박서연", "최민재"][index],
        amount: isMatched ? Math.max(bill.paidAmount, bill.totalAmount) : bill.totalAmount,
        depositedAt: billingTimestamp(-index, 9 + index),
        matchStatus: isMatched ? "MATCHED" : "UNMATCHED",
        matchedBillId: isMatched ? bill.id : undefined,
        guessedUnitId: isMatched ? undefined : bill.unitId
      } satisfies Deposit;
    }),
    ...orphanDepositUnits.map((unit, index) => ({
      id: index === 0 ? "dep-demo-orphan" : `dep-demo-orphan-${unit}`,
      depositorName: ["김미숙", "홍길동", "윤세아", "문태오", "배수진"][index],
      amount: 720000 + index * 12000,
      depositedAt: billingTimestamp(-6 - index, 10 + index),
      matchStatus: "ORPHAN",
      guessedUnitId: `${unit}호`
    } satisfies Deposit)),
    ...guardedManagerBills.map((bill, index) => ({
      id: `dep-demo-mismatch-${bill.unitId.replace(/\D/gu, "")}`,
      depositorName: ["김민수", "김하윤", "이준서", "박서연", "최민재"][index],
      amount: Math.max(0, bill.totalAmount - 30000 - index * 5000),
      depositedAt: billingTimestamp(-12 - index, 11 + index),
      matchStatus: "MISMATCH",
      matchedBillId: bill.id,
      guessedUnitId: bill.unitId
    } satisfies Deposit))
  ];
  const managerBillingMaintenanceFees: MaintenanceFee[] = currentManagerBills.map((bill, index) => {
    const maintenance = bill.items.find((item) => item.label === "관리비")?.amount ?? 0;

    return {
      id: bill.maintenanceFeeId ?? `mfee-demo-current-${bill.unitId.replace(/\D/gu, "")}`,
      unitId: bill.unitId,
      billingMonth: bill.billingMonth,
      totalAmount: maintenance,
      available: true,
      items: [
        { id: `mfee-line-${index}-cleaning`, label: "공용부 청소", amount: 30000 + index * 1000, receiptAvailable: true },
        { id: `mfee-line-${index}-electricity`, label: "공용 전기", amount: 25000 + index * 700, receiptAvailable: true },
        {
          id: `mfee-line-${index}-elevator`,
          label: "승강기 점검",
          amount: Math.max(0, maintenance - (55000 + index * 1700)),
          receiptAvailable: index % 2 === 0
        }
      ]
    };
  });
  const managerTicketTimestamp = (hour: number, minute = 0) => {
    const date = new Date(billingDate);
    date.setHours(hour, minute, 0, 0);

    return date.toISOString();
  };
  const managerTicketSeed: Array<{
    key: string;
    unit: string;
    tenantId: string;
    title: string;
    description: string;
    location: string;
    sourceChannel: ComplaintSourceChannel;
    category: string;
    detailCategory: string;
    priority: number;
    status: TicketStatus;
    responsibilityHint: AiAnalysis["responsibilityHint"];
    confidenceScore: number;
    reasons: string[];
    recommendedAction: string;
    repairStatus: RepairStatus;
    repairTitle: string;
    repairDescription: string;
    estimateAmount: number;
    estimateDescription: string;
    scheduledAt?: string;
    completionNote?: string;
    completionPhotoUrls?: string[];
    messageText: string;
    createdAt: string;
  }> = [
    {
      key: "aircon",
      unit: "411",
      tenantId: "tenant-billing-411",
      title: "에어컨 냉방 불량과 물샘",
      description: "거실 에어컨이 찬바람이 약하고 실내기 아래로 물이 떨어집니다.",
      location: "거실 에어컨",
      sourceChannel: "REALTIME_CHAT",
      category: "냉난방",
      detailCategory: "에어컨 배수/냉방",
      priority: 1,
      status: "REPAIR_IN_PROGRESS",
      responsibilityHint: "임대인 책임 가능성",
      confidenceScore: 0.84,
      reasons: ["옵션 설비인 에어컨 배수 계통 증상", "냉방 성능 저하와 물샘이 동시에 보고됨"],
      recommendedAction: "냉난방 업체 현장 점검 결과를 확인하고 수리 완료 전 사진을 받으세요.",
      repairStatus: "IN_PROGRESS",
      repairTitle: "에어컨 배수관 점검",
      repairDescription: "배수 호스 막힘과 실내기 결로 상태를 확인합니다.",
      estimateAmount: 88000,
      estimateDescription: "출장·배수관 청소·냉매 압력 점검",
      scheduledAt: managerTicketTimestamp(15, 30),
      messageText: "에어컨 사진 3장과 바닥 물샘 영상을 첨부했습니다.",
      createdAt: managerTicketTimestamp(9, 5)
    },
    {
      key: "sink",
      unit: "412",
      tenantId: "tenant-billing-412",
      title: "세면대 하부 누수",
      description: "욕실 세면대 아래 배관에서 물방울이 계속 떨어지고 수납장이 젖었습니다.",
      location: "욕실 세면대",
      sourceChannel: "VOICE_CHAT",
      category: "배관/수전",
      detailCategory: "세면대 배수 누수",
      priority: 1,
      status: "ESTIMATE_REVIEW",
      responsibilityHint: "임대인 책임 가능성",
      confidenceScore: 0.88,
      reasons: ["세면대 하부 배관 연결부 누수 가능성이 큼", "사용자 과실보다 설비 마모 가능성이 높음"],
      recommendedAction: "견적 금액과 누수 범위를 확인한 뒤 승인 여부를 결정하세요.",
      repairStatus: "ESTIMATE_SUBMITTED",
      repairTitle: "세면대 배수 트랩 교체",
      repairDescription: "세면대 하부 트랩과 패킹을 교체하고 누수 테스트를 진행합니다.",
      estimateAmount: 66000,
      estimateDescription: "부품·출장·누수 테스트",
      scheduledAt: managerTicketTimestamp(16),
      messageText: "세면대 아래가 계속 젖어 있고 수납장 바닥이 불었습니다.",
      createdAt: managerTicketTimestamp(9, 20)
    },
    {
      key: "boiler",
      unit: "413",
      tenantId: "tenant-billing-413",
      title: "보일러 온수 불량",
      description: "온수가 나오다 갑자기 차가워지고 보일러에 에러 코드가 표시됩니다.",
      location: "주방 보일러실",
      sourceChannel: "DIRECT_FORM",
      category: "보일러",
      detailCategory: "온수 불량",
      priority: 2,
      status: "VENDOR_ASSIGNED",
      responsibilityHint: "판단 어려움",
      confidenceScore: 0.69,
      reasons: ["에러 코드 확인 전까지 노후/사용 설정 원인을 구분하기 어려움", "온수 사용 불가로 빠른 점검 필요"],
      recommendedAction: "업체가 에러 코드를 확인한 뒤 수리 범위와 책임 가능성을 업데이트하세요.",
      repairStatus: "REQUESTED",
      repairTitle: "보일러 에러 코드 점검",
      repairDescription: "보일러 에러 코드, 난방수 압력, 온수 센서를 확인합니다.",
      estimateAmount: 45000,
      estimateDescription: "출장 점검",
      scheduledAt: managerTicketTimestamp(17),
      messageText: "보일러 에러 코드 사진과 온수 사용 불가 상황을 남겼습니다.",
      createdAt: managerTicketTimestamp(10, 5)
    },
    {
      key: "doorlock",
      unit: "414",
      tenantId: "tenant-billing-414",
      title: "도어락 작동 불안정",
      description: "현관 도어락이 여러 번 눌러야 열리고 배터리 교체 후에도 경고음이 납니다.",
      location: "현관",
      sourceChannel: "REALTIME_CHAT",
      category: "출입/보안",
      detailCategory: "도어락 점검",
      priority: 2,
      status: "COMPLETION_REPORTED",
      responsibilityHint: "임대인 책임 가능성",
      confidenceScore: 0.78,
      reasons: ["출입 안전과 직결되는 설비", "배터리 교체 후에도 동일 증상이 반복됨"],
      recommendedAction: "완료 보고 사진과 임차인 확인 여부를 보고 결제 승인 전 검토하세요.",
      repairStatus: "COMPLETION_REPORTED",
      repairTitle: "도어락 모듈 점검",
      repairDescription: "도어락 배터리 단자와 잠금 모듈을 점검했습니다.",
      estimateAmount: 99000,
      estimateDescription: "모듈 점검·단자 교체",
      scheduledAt: managerTicketTimestamp(11),
      completionNote: "배터리 단자 부식 제거와 모듈 초기화를 완료했습니다.",
      completionPhotoUrls: ["/api/files/demo-doorlock-complete.jpg"],
      messageText: "도어락이 잘 열리지 않아 출입이 불안합니다.",
      createdAt: managerTicketTimestamp(10, 35)
    },
    {
      key: "window",
      unit: "415",
      tenantId: "tenant-billing-415",
      title: "창문 잠금장치 파손",
      description: "침실 창문 잠금 레버가 헛돌아 외출 시 잠글 수 없습니다.",
      location: "침실 창문",
      sourceChannel: "DIRECT_FORM",
      category: "창호",
      detailCategory: "창문 잠금장치",
      priority: 3,
      status: "REVIEWING",
      responsibilityHint: "판단 어려움",
      confidenceScore: 0.57,
      reasons: ["입주 전 사진 대조가 필요함", "마모와 충격 파손 가능성이 모두 남아 있음"],
      recommendedAction: "입주 전 사진과 현재 사진을 비교하고 필요하면 추가 사진을 요청하세요.",
      repairStatus: "REQUESTED",
      repairTitle: "창문 잠금장치 점검",
      repairDescription: "창문 잠금 레버와 창틀 고정 상태를 확인합니다.",
      estimateAmount: 52000,
      estimateDescription: "출장 점검·레버 부품 확인",
      scheduledAt: managerTicketTimestamp(18),
      messageText: "창문 잠금 레버가 헛돌아 사진을 첨부했습니다.",
      createdAt: managerTicketTimestamp(11, 10)
    }
  ];
  const managerTicketComplaints: Complaint[] = managerTicketSeed.map((item) => ({
    id: `complaint-demo-${item.key}`,
    tenantId: item.tenantId,
    roomId: `room-${item.unit}`,
    ticketId: `ticket-demo-${item.key}`,
    sourceChannel: item.sourceChannel,
    title: item.title,
    description: item.description,
    location: item.location,
    occurredAt: item.createdAt,
    availableTimes: "오늘 오후 가능",
    status:
      item.status === "COMPLETED"
        ? "COMPLETED"
        : item.status === "ADDITIONAL_INFO_REQUESTED"
          ? "ADDITIONAL_INFO_REQUESTED"
          : item.status === "REPAIR_IN_PROGRESS" || item.status === "COMPLETION_REPORTED"
            ? "REPAIR_IN_PROGRESS"
            : item.status === "VENDOR_ASSIGNED" || item.status === "ESTIMATE_REVIEW"
              ? "VENDOR_ASSIGNED"
              : "REVIEWING",
    createdAt: item.createdAt,
    updatedAt: item.createdAt
  }));
  const managerTicketAnalyses = Object.fromEntries(
    managerTicketSeed.map((item) => [
      `ticket-demo-${item.key}`,
      {
        summary: item.description,
        category: item.category,
        detailCategory: item.detailCategory,
        priority: item.priority,
        responsibilityHint: item.responsibilityHint,
        confidenceScore: item.confidenceScore,
        reasons: item.reasons,
        recommendedAction: item.recommendedAction,
        photoAnalysis: {
          attachmentUrls: [`/api/files/demo-${item.key}-1.jpg`, `/api/files/demo-${item.key}-2.jpg`],
          previousAttachmentUrls: item.key === "window" ? ["/api/files/demo-window-movein.jpg"] : [],
          candidates: [item.detailCategory],
          comparisonStatus: item.key === "window" ? "추가 사진 필요" : "신규 발생 가능성",
          summary: `${item.title} 사진 자료가 접수되었습니다.`,
          evidence: item.reasons,
          recommendedRetake: item.key === "window"
        }
      } satisfies AiAnalysis
    ])
  ) as Record<string, AiAnalysis>;
  const managerTicketTickets: Ticket[] = managerTicketSeed.map((item) => ({
    id: `ticket-demo-${item.key}`,
    complaintId: `complaint-demo-${item.key}`,
    tenantId: item.tenantId,
    roomId: `room-${item.unit}`,
    assignedVendorId: "vendor-demo",
    sourceChannel: item.sourceChannel,
    category: item.category,
    priority: item.priority,
    status: item.status,
    responsibilityHint: item.responsibilityHint,
    aiSummary: item.description,
    dueAt: priorityDueAt(item.priority),
    createdAt: item.createdAt,
    updatedAt: item.createdAt
  }));
  const managerTicketRepairs: RepairRequest[] = managerTicketSeed.map((item) => ({
    id: `repair-demo-${item.key}`,
    ticketId: `ticket-demo-${item.key}`,
    vendorId: "vendor-demo",
    status: item.repairStatus,
    title: item.repairTitle,
    description: item.repairDescription,
    estimateAmount: item.estimateAmount,
    estimateDescription: item.estimateDescription,
    costBearer: item.responsibilityHint === "임차인 책임 가능성" ? "TENANT" : "LANDLORD",
    scheduledAt: item.scheduledAt,
    completedAt:
      item.repairStatus === "COMPLETION_REPORTED" || item.repairStatus === "COMPLETED"
        ? managerTicketTimestamp(12)
        : undefined,
    completionNote: item.completionNote,
    completionPhotoUrls: item.completionPhotoUrls ?? [],
    createdAt: item.createdAt,
    updatedAt: item.createdAt
  }));
  const managerTicketMessages: TicketMessage[] = managerTicketSeed.map((item) => ({
    id: `ticket-message-demo-${item.key}`,
    ticketId: `ticket-demo-${item.key}`,
    complaintId: `complaint-demo-${item.key}`,
    senderUserId: item.tenantId,
    senderRole: "TENANT",
    messageText: item.messageText,
    attachmentUrls: [`/api/files/demo-${item.key}-1.jpg`],
    createdAt: item.createdAt
  }));
  const managerTicketHistory: StatusHistory[] = managerTicketSeed.flatMap((item) => [
    {
      id: `history-demo-${item.key}-received`,
      ticketId: `ticket-demo-${item.key}`,
      changedByUserId: "system",
      toStatus: "RECEIVED",
      note: "데모 민원 접수",
      createdAt: item.createdAt
    },
    {
      id: `history-demo-${item.key}-current`,
      ticketId: `ticket-demo-${item.key}`,
      changedByUserId: "landlord-demo",
      fromStatus: "RECEIVED",
      toStatus: item.status,
      note: "관리인 처리 상태 반영",
      createdAt: item.createdAt
    }
  ]);

  return {
    users: [...users, ...billingTenantUsers],
    socialAccounts: [],
    rooms: [
      ...managerBillingRooms,
      {
        id: "room-402",
        buildingName: "정글빌라",
        roomNo: "402호",
        address: "서울시 성동구 성수동",
        landlordId: "multi-demo"
      }
    ],
    roomWalls: [],
    tenantRooms: {
      "tenant-demo": "room-301",
      "multi-demo": "room-301",
      ...billingTenantRooms
    },
    vendors: [
      {
        id: "vendor-demo",
        businessName: "빠른누수 설비",
        contactPerson: "이수리",
        phone: "010-3000-0001",
        serviceArea: "성동구, 광진구",
        activeJobs: 0
      }
    ],
    vendorInvites: [],
    tenantInvites: [],
    contracts: [
      {
        id: "ct_moveout_0001",
        roomId: "room-301",
        tenantId: "tenant-demo",
        managerId: "landlord-demo",
        unitId: "302",
        landlordName: "박관리",
        lifecycle: "active",
        review: "confirmed",
        deletion: "none",
        valueSource: "confirmed",
        monthlyRent: 650000,
        maintenanceFee: 70000,
        paymentDay: 25,
        startDate: "2024-08-01T00:00:00+09:00",
        endDate: "2026-07-31T00:00:00+09:00",
        createdAt: "2024-08-01T10:00:00+09:00",
        updatedAt: "2026-06-20T10:00:00+09:00",
        confirmedAt: "2026-06-20T10:00:00+09:00",
        confirmedByManagerId: "landlord-demo"
      },
      {
        id: "ct_0001",
        roomId: "room-301",
        tenantId: "tenant-demo",
        managerId: "landlord-demo",
        unitId: "301",
        landlordName: "박관리",
        lifecycle: "active",
        review: "pending",
        deletion: "none",
        valueSource: "unverified",
        monthlyRent: 650000,
        maintenanceFee: 70000,
        paymentDay: 25,
        optionInventory: ["에어컨", "세탁기", "냉장고", "인덕션", "블라인드"],
        startDate: "2026-03-01T00:00:00+09:00",
        endDate: "2028-02-29T00:00:00+09:00",
        createdAt: contractCreatedAt,
        updatedAt: contractUpdatedAt,
        extractionId: "cx_0001",
        documentId: "cdoc_0001"
      },
      {
        id: "ct_demo_302",
        roomId: "room-302",
        tenantId: "tenant-billing-302",
        managerId: "landlord-demo",
        unitId: "302",
        landlordName: "박관리",
        lifecycle: "active",
        review: "pending",
        deletion: "none",
        valueSource: "unverified",
        monthlyRent: 720000,
        maintenanceFee: 80000,
        paymentDay: 10,
        optionInventory: ["에어컨", "냉장고", "세탁기", "침대"],
        startDate: "2026-07-01T00:00:00+09:00",
        endDate: "2028-06-30T00:00:00+09:00",
        createdAt: "2026-07-08T09:20:00+09:00",
        updatedAt: "2026-07-12T15:10:00+09:00",
        extractionId: "cx_demo_302",
        documentId: "cdoc_demo_302"
      },
      {
        id: "ct_demo_303",
        roomId: "room-303",
        tenantId: "tenant-billing-303",
        managerId: "landlord-demo",
        unitId: "303",
        landlordName: "박관리",
        lifecycle: "analyzing",
        review: "info_requested",
        deletion: "none",
        valueSource: "unverified",
        monthlyRent: 690000,
        maintenanceFee: 75000,
        paymentDay: 20,
        optionInventory: ["에어컨", "책상", "옷장"],
        startDate: "2026-07-15T00:00:00+09:00",
        endDate: "2028-07-14T00:00:00+09:00",
        createdAt: "2026-07-10T14:30:00+09:00",
        updatedAt: "2026-07-12T18:00:00+09:00",
        extractionId: "cx_demo_303",
        documentId: "cdoc_demo_303"
      },
      {
        id: "ct_demo_304",
        roomId: "room-304",
        tenantId: "tenant-billing-304",
        managerId: "landlord-demo",
        unitId: "304",
        landlordName: "박관리",
        lifecycle: "active",
        review: "confirmed",
        deletion: "none",
        valueSource: "confirmed",
        monthlyRent: 740000,
        maintenanceFee: 85000,
        paymentDay: 5,
        optionInventory: ["에어컨", "세탁기", "전자레인지"],
        startDate: "2026-06-01T00:00:00+09:00",
        endDate: "2028-05-31T00:00:00+09:00",
        createdAt: "2026-06-01T10:00:00+09:00",
        updatedAt: "2026-07-11T11:45:00+09:00",
        confirmedAt: "2026-07-11T11:45:00+09:00",
        confirmedByManagerId: "landlord-demo",
        extractionId: "cx_demo_304",
        documentId: "cdoc_demo_304"
      },
      {
        id: "ct_demo_411",
        roomId: "room-411",
        tenantId: "tenant-billing-411",
        managerId: "landlord-demo",
        unitId: "411",
        landlordName: "박관리",
        lifecycle: "expiring_soon",
        review: "pending",
        deletion: "none",
        valueSource: "manual",
        monthlyRent: 780000,
        maintenanceFee: 90000,
        paymentDay: 25,
        optionInventory: ["에어컨", "인덕션", "붙박이장"],
        startDate: "2024-08-01T00:00:00+09:00",
        endDate: "2026-07-31T00:00:00+09:00",
        createdAt: "2026-07-06T08:40:00+09:00",
        updatedAt: "2026-07-12T09:00:00+09:00",
        extractionId: "cx_demo_411",
        documentId: "cdoc_demo_411"
      },
      {
        id: "ct_demo_412",
        roomId: "room-412",
        tenantId: "tenant-billing-412",
        managerId: "landlord-demo",
        unitId: "412",
        landlordName: "박관리",
        lifecycle: "expired",
        review: "confirmed",
        deletion: "requested",
        valueSource: "confirmed",
        monthlyRent: 760000,
        maintenanceFee: 80000,
        paymentDay: 15,
        optionInventory: ["에어컨", "세탁기", "침대", "책상"],
        startDate: "2024-07-01T00:00:00+09:00",
        endDate: "2026-06-30T00:00:00+09:00",
        createdAt: "2024-07-01T09:00:00+09:00",
        updatedAt: "2026-07-12T16:25:00+09:00",
        confirmedAt: "2026-06-15T10:20:00+09:00",
        confirmedByManagerId: "landlord-demo",
        extractionId: "cx_demo_412",
        documentId: "cdoc_demo_412"
      }
    ],
    contractDocuments: [
      {
        id: "cdoc_0001",
        contractId: "ct_0001",
        uploadedByUserId: "tenant-demo",
        origin: "tenant_upload",
        fileName: "contract-301.pdf",
        fileUrl: "/uploads/contract-301.pdf",
        uploadedAt: contractCreatedAt
      },
      {
        id: "cdoc_demo_302",
        contractId: "ct_demo_302",
        uploadedByUserId: "tenant-billing-302",
        origin: "tenant_upload",
        fileName: "demo-contract-302.pdf",
        fileUrl: "/uploads/demo-contract-302.pdf",
        uploadedAt: "2026-07-08T09:20:00+09:00"
      },
      {
        id: "cdoc_demo_303",
        contractId: "ct_demo_303",
        uploadedByUserId: "landlord-demo",
        origin: "manager_upload",
        fileName: "demo-contract-303.jpg",
        fileUrl: "/uploads/demo-contract-303.jpg",
        uploadedAt: "2026-07-10T14:30:00+09:00"
      },
      {
        id: "cdoc_demo_304",
        contractId: "ct_demo_304",
        uploadedByUserId: "landlord-demo",
        origin: "manager_upload",
        fileName: "demo-contract-304.pdf",
        fileUrl: "/uploads/demo-contract-304.pdf",
        uploadedAt: "2026-06-01T10:00:00+09:00"
      },
      {
        id: "cdoc_demo_411",
        contractId: "ct_demo_411",
        uploadedByUserId: "landlord-demo",
        origin: "manual",
        fileName: "manual-contract-411.pdf",
        fileUrl: "/uploads/manual-contract-411.pdf",
        uploadedAt: "2026-07-06T08:40:00+09:00"
      },
      {
        id: "cdoc_demo_412",
        contractId: "ct_demo_412",
        uploadedByUserId: "tenant-billing-412",
        origin: "tenant_upload",
        fileName: "expired-contract-412.pdf",
        fileUrl: "/uploads/expired-contract-412.pdf",
        uploadedAt: "2024-07-01T09:00:00+09:00"
      }
    ],
    contractExtractions: [
      {
        id: "cx_0001",
        contractId: "ct_0001",
        confirmed: false,
        highlights: [
          "월세 65만원 · 매월 25일 납부",
          "계약 기간 2026.03.01 ~ 2028.02.29 (2년)",
          "묵시적 자동연장 특약 있음 — 확인 필요"
        ],
        items: [
          { label: "보증금", value: "10,000,000원", group: "money", needsCheck: false, evidence: "제1조 보증금은 금 일천만원정(₩10,000,000)으로 한다." },
          { label: "월세", value: "650,000원", group: "money", needsCheck: false, evidence: "차임은 월 금 육십오만원정으로 하며" },
          { label: "관리비", value: "70,000원", group: "money", needsCheck: true, evidence: "관리비 별도(관리규약에 따름)" },
          { label: "납부일", value: "매월 25일", group: "money", needsCheck: false, evidence: "매월 25일까지 임대인 계좌로 납부한다." },
          { label: "임대인 계좌", value: "○○은행 ***-**-****21", group: "money", needsCheck: false, masked: true, evidence: "입금계좌: ○○은행 123-45-678921" },
          { label: "계약 기간", value: "2026.03.01 ~ 2028.02.29", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 3월 1일부터 24개월로 한다." },
          { label: "자동연장", value: "묵시적 갱신 특약", group: "term", needsCheck: true, evidence: "만료 1개월 전 통지 없을 시 동일 조건 자동연장" },
          { label: "상세 주소", value: "서울시 ○○구 ***로 **길 **", group: "term", needsCheck: false, masked: true, evidence: "목적물: 서울시 ○○구 △△로 12길 34, 301호" },
          { label: "원상복구", value: "퇴거 시 원상복구 의무", group: "responsibility", needsCheck: false, evidence: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다." },
          { label: "수선 책임", value: "소모품·경미한 수선 임차인 부담", group: "responsibility", needsCheck: true, evidence: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다." }
        ],
        helpNotes: [
          {
            clause: "묵시적 자동연장",
            plain: "만료 1개월 전에 아무도 연락하지 않으면 같은 조건으로 계약이 자동으로 연장돼요. 이사 계획이 있으면 미리 알려두면 좋아요.",
            source: "만료 1개월 전 통지 없을 시 동일 조건 자동연장"
          },
          {
            clause: "원상복구 의무",
            plain: "퇴거할 때 처음 상태로 되돌려 놓아야 해요. 입주 전 사진을 남겨두면 나중에 도움이 돼요.",
            source: "임차인은 퇴거 시 목적물을 원상으로 회복하여 반환한다."
          },
          {
            clause: "경미한 수선 부담",
            plain: "소모품 교체나 작은 수리는 임차인이 부담할 수 있어요. 큰 하자는 임대인 책임일 수 있으니 관리자에게 물어보세요.",
            source: "경미한 수선 및 소모품 교체는 임차인 부담으로 한다."
          }
        ],
        createdAt: contractUpdatedAt
      },
      {
        id: "cx_demo_302",
        contractId: "ct_demo_302",
        confirmed: false,
        highlights: [
          "월세 72만원, 관리비 8만원, 매월 10일 납부",
          "2026.07.01부터 24개월 계약",
          "반려동물 특약과 하자 보수 범위는 관리자 확인 필요"
        ],
        items: [
          { label: "보증금", value: "10,000,000원", group: "money", needsCheck: false, evidence: "임대차 보증금은 금 일천만원으로 한다." },
          { label: "월세", value: "720,000원", group: "money", needsCheck: false, evidence: "차임은 매월 금 칠십이만원으로 한다." },
          { label: "관리비", value: "80,000원", group: "money", needsCheck: false, evidence: "관리비는 월 8만원으로 별도 납부한다." },
          { label: "납부일", value: "매월 10일", group: "money", needsCheck: false, evidence: "매월 10일까지 임대인 계좌로 송금한다." },
          { label: "계약 기간", value: "2026.07.01 ~ 2028.06.30", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 7월 1일부터 24개월로 한다." },
          { label: "상세 주소", value: "방배 루미에르 302호", group: "term", needsCheck: false, evidence: "목적물은 방배 루미에르 제302호로 한다." },
          { label: "반려동물", value: "소형견 1마리 가능", group: "responsibility", needsCheck: true, evidence: "반려동물은 임대인 승인 범위 내에서 허용한다." },
          { label: "하자 보수", value: "입주 전 하자 목록 확인 필요", group: "responsibility", needsCheck: true, evidence: "입주 전 발견된 하자는 별도 체크리스트로 확인한다." }
        ],
        helpNotes: [
          {
            clause: "반려동물 특약",
            plain: "허용 범위와 원상복구 책임을 입주 전에 명확히 적어두는 편이 좋습니다.",
            source: "반려동물은 임대인 승인 범위 내에서 허용한다."
          },
          {
            clause: "하자 보수",
            plain: "입주 전 하자는 사진과 체크리스트를 남겨 퇴실 정산 분쟁을 줄일 수 있습니다.",
            source: "입주 전 발견된 하자는 별도 체크리스트로 확인한다."
          }
        ],
        createdAt: "2026-07-12T15:10:00+09:00"
      },
      {
        id: "cx_demo_303",
        contractId: "ct_demo_303",
        confirmed: false,
        highlights: [
          "관리자 업로드 이미지에서 OCR 분석 중",
          "납부 계좌와 자동 연장 문구가 흐릿하게 인식됨",
          "임차인에게 보완 요청이 필요한 상태"
        ],
        items: [
          { label: "보증금", value: "8,000,000원", group: "money", needsCheck: false, evidence: "보증금은 금 팔백만원으로 한다." },
          { label: "월세", value: "690,000원", group: "money", needsCheck: false, evidence: "월 차임은 69만원으로 한다." },
          { label: "관리비", value: "75,000원", group: "money", needsCheck: true, evidence: "관리비 금액 일부가 흐릿하게 인식됨." },
          { label: "납부일", value: "매월 20일", group: "money", needsCheck: false, evidence: "매월 20일 선납한다." },
          { label: "납부 계좌", value: "국민은행 ***-**-****88", group: "money", needsCheck: true, masked: true, evidence: "계좌번호 뒷자리가 일부 가려져 있음." },
          { label: "계약 기간", value: "2026.07.15 ~ 2028.07.14", group: "term", needsCheck: false, evidence: "임대차 기간은 2026년 7월 15일부터 2028년 7월 14일까지로 한다." },
          { label: "자동 연장", value: "확인 필요", group: "term", needsCheck: true, evidence: "묵시적 갱신 특약 문구가 중복 인식됨." },
          { label: "원상복구", value: "퇴거 시 원상복구", group: "responsibility", needsCheck: false, evidence: "임차인은 퇴거 시 목적물을 원상으로 반환한다." }
        ],
        helpNotes: [
          {
            clause: "관리비",
            plain: "관리비 포함 항목과 별도 납부 항목을 계약서 원문과 대조해 주세요.",
            source: "관리비 금액 일부가 흐릿하게 인식됨."
          },
          {
            clause: "납부 계좌",
            plain: "계좌번호는 민감정보라 마스킹해 두고, 검토자는 원문 파일에서만 확인하는 흐름이 안전합니다.",
            source: "계좌번호 뒷자리가 일부 가려져 있음."
          }
        ],
        createdAt: "2026-07-12T18:00:00+09:00"
      },
      {
        id: "cx_demo_304",
        contractId: "ct_demo_304",
        confirmed: true,
        highlights: [
          "관리자 확인 완료 계약",
          "월세 74만원, 관리비 8만5천원",
          "OCR 항목과 수동 입력값이 일치함"
        ],
        items: [
          { label: "보증금", value: "12,000,000원", group: "money", needsCheck: false, evidence: "임대차 보증금은 금 일천이백만원으로 한다." },
          { label: "월세", value: "740,000원", group: "money", needsCheck: false, evidence: "차임은 매월 74만원으로 한다." },
          { label: "관리비", value: "85,000원", group: "money", needsCheck: false, evidence: "관리비는 매월 85,000원으로 한다." },
          { label: "납부일", value: "매월 5일", group: "money", needsCheck: false, evidence: "매월 5일까지 납부한다." },
          { label: "계약 기간", value: "2026.06.01 ~ 2028.05.31", group: "term", needsCheck: false, evidence: "계약 기간은 2026년 6월 1일부터 2028년 5월 31일까지이다." },
          { label: "상세 주소", value: "방배 루미에르 304호", group: "term", needsCheck: false, evidence: "목적물 표시 제304호." },
          { label: "원상복구", value: "일반 사용 손모 제외", group: "responsibility", needsCheck: false, evidence: "통상 손모를 제외하고 원상으로 회복한다." }
        ],
        helpNotes: [
          {
            clause: "확정 완료",
            plain: "OCR 추출값과 관리자 입력값이 일치해 확정 처리된 예시 계약입니다.",
            source: "OCR 항목과 수동 입력값이 일치함"
          }
        ],
        createdAt: "2026-07-11T11:45:00+09:00"
      },
      {
        id: "cx_demo_411",
        contractId: "ct_demo_411",
        confirmed: false,
        highlights: [
          "계약 만료가 30일 이내인 호실",
          "수동 등록된 계약서라 OCR 대조가 필요함",
          "퇴실 정산 특약 확인 필요"
        ],
        items: [
          { label: "보증금", value: "15,000,000원", group: "money", needsCheck: false, evidence: "보증금은 금 일천오백만원으로 한다." },
          { label: "월세", value: "780,000원", group: "money", needsCheck: false, evidence: "차임은 매월 금 칠십팔만원이다." },
          { label: "관리비", value: "90,000원", group: "money", needsCheck: false, evidence: "관리비는 매월 9만원으로 한다." },
          { label: "납부일", value: "매월 25일", group: "money", needsCheck: false, evidence: "매월 25일까지 납부한다." },
          { label: "계약 기간", value: "2024.08.01 ~ 2026.07.31", group: "term", needsCheck: false, evidence: "임대차 기간은 2024년 8월 1일부터 2026년 7월 31일까지이다." },
          { label: "만료 안내", value: "만료 임박", group: "term", needsCheck: true, evidence: "만료일이 임박하여 연장 또는 퇴실 확인이 필요하다." },
          { label: "퇴실 정산", value: "공과금 정산 확인 필요", group: "responsibility", needsCheck: true, evidence: "퇴실 시 공과금과 원상복구 비용을 정산한다." }
        ],
        helpNotes: [
          {
            clause: "만료 임박",
            plain: "만료 30일 전후에는 연장 여부, 퇴실 일정, 보증금 반환 일정을 한 번에 확인하는 것이 좋습니다.",
            source: "만료일이 임박하여 연장 또는 퇴실 확인이 필요하다."
          }
        ],
        createdAt: "2026-07-12T09:00:00+09:00"
      },
      {
        id: "cx_demo_412",
        contractId: "ct_demo_412",
        confirmed: true,
        highlights: [
          "계약 종료 후 삭제 요청이 접수된 예시",
          "보관 예외 항목과 삭제 가능 항목을 구분해야 함",
          "민감정보 마스킹 유지"
        ],
        items: [
          { label: "보증금", value: "9,000,000원", group: "money", needsCheck: false, evidence: "보증금은 금 구백만원으로 한다." },
          { label: "월세", value: "760,000원", group: "money", needsCheck: false, evidence: "차임은 매월 76만원으로 한다." },
          { label: "관리비", value: "80,000원", group: "money", needsCheck: false, evidence: "관리비는 8만원으로 한다." },
          { label: "납부일", value: "매월 15일", group: "money", needsCheck: false, evidence: "매월 15일까지 납부한다." },
          { label: "계약 기간", value: "2024.07.01 ~ 2026.06.30", group: "term", needsCheck: false, evidence: "계약 기간은 2024년 7월 1일부터 2026년 6월 30일까지로 한다." },
          { label: "삭제 요청", value: "임차인 요청 접수", group: "responsibility", needsCheck: false, evidence: "계약 종료 후 개인정보 삭제 요청이 접수되었다." },
          { label: "보관 예외", value: "정산 기록 5년 보관", group: "responsibility", needsCheck: false, evidence: "법정 보관 대상은 정해진 기간 동안 별도 보관한다." }
        ],
        helpNotes: [
          {
            clause: "삭제 요청",
            plain: "계약 종료 후에도 정산, 분쟁, 법정 보관 항목은 바로 삭제하지 않고 분리 보관하는 흐름이 필요합니다.",
            source: "법정 보관 대상은 정해진 기간 동안 별도 보관한다."
          }
        ],
        createdAt: "2026-07-12T16:25:00+09:00"
      }
    ],
    contractPrivacies: [
      {
        contractId: "ct_0001",
        maskingEnabled: true,
        retention: [
          { label: "계약서 원본·추출값", reason: "정산·분쟁 대비", until: "계약 종료 후 5년" },
          { label: "임대인 계좌·연락처", reason: "정산 완료 시 즉시 파기", until: "정산 완료 시" },
          { label: "삭제 요청 이력", reason: "처리 감사로그", until: "3년" }
        ],
        forwardingConsent: false,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      },
      {
        contractId: "ct_demo_302",
        maskingEnabled: true,
        retention: [
          { label: "계약서 원본", reason: "임대차 계약 이력 관리", until: "계약 종료 후 5년" },
          { label: "임대인 계좌", reason: "월세 납부 확인", until: "정산 완료 후 즉시 파기" },
          { label: "입주 전 하자 사진", reason: "퇴실 정산 분쟁 대비", until: "계약 종료 후 1년" }
        ],
        forwardingConsent: false,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      },
      {
        contractId: "ct_demo_303",
        maskingEnabled: true,
        retention: [
          { label: "보완 요청 원문", reason: "OCR 대조 및 검토 이력", until: "확정 후 3년" },
          { label: "납부 계좌", reason: "임대료 납부 검증", until: "확정 후 즉시 마스킹" }
        ],
        forwardingConsent: false,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      },
      {
        contractId: "ct_demo_304",
        maskingEnabled: true,
        retention: [
          { label: "확정 계약서", reason: "임대차 계약 증빙", until: "계약 종료 후 5년" },
          { label: "검토 로그", reason: "관리자 확정 감사 기록", until: "3년" }
        ],
        forwardingConsent: true,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      },
      {
        contractId: "ct_demo_411",
        maskingEnabled: true,
        retention: [
          { label: "만료 임박 계약서", reason: "연장 또는 퇴실 협의", until: "정산 완료 후 5년" },
          { label: "퇴실 정산 메모", reason: "공과금 및 원상복구 확인", until: "정산 완료 후 1년" }
        ],
        forwardingConsent: false,
        deletion: "none",
        deletionSlaHours: 72,
        deletable: false
      },
      {
        contractId: "ct_demo_412",
        maskingEnabled: true,
        retention: [
          { label: "정산 기록", reason: "법정 보관 및 분쟁 대비", until: "계약 종료 후 5년" },
          { label: "개인 연락처", reason: "삭제 요청 대상", until: "삭제 승인 즉시 파기" },
          { label: "삭제 요청 처리 로그", reason: "감사 기록", until: "3년" }
        ],
        forwardingConsent: false,
        deletion: "requested",
        deletionSlaHours: 72,
        deletable: true
      }
    ],
    contractInvites: [
      {
        id: "cinv_0001",
        contractId: "ct_0001",
        roomId: "room-301",
        inviteToken: "contract-demo-token",
        invitedByManagerId: "landlord-demo",
        tenantName: "김민수",
        phone: "010-1000-3001",
        state: "connected",
        signupUrl: "/tenant?inviteToken=contract-demo-token",
        audit: "2026-03-01 임차인 확인 완료",
        createdAt: "2026-03-01T10:00:00+09:00",
        acceptedAt: "2026-03-01T10:30:00+09:00",
        acceptedByUserId: "tenant-demo"
      }
    ],
    bills: managerBillingBills,
    paymentReports: managerBillingPaymentReports,
    deposits: managerBillingDeposits,
    paymentTransactions: [],
    maintenanceFees: managerBillingMaintenanceFees,
    attachments: [],
    floorPlans: [],
    moveInChecklist: [],
    aiFeedback: [],
    intakeSessions: [],
    complaints: managerTicketComplaints,
    analyses: managerTicketAnalyses,
    tickets: managerTicketTickets,
    repairs: managerTicketRepairs,
    costs: [],
    receipts: [],
    receiptOcrs: [],
    messages: managerTicketMessages,
    messagingThreads: [
      {
        id: "mth_demo_general",
        roomId: "room-301",
        unitId: "301",
        tenantId: "tenant-demo",
        context: "general",
        contextLabel: "생활 문의",
        lastMessage: "확인 후 오늘 안으로 답변드리겠습니다.",
        unreadCount: 1,
        managerUnreadCount: 0,
        pendingRequest: false,
        archivedNotice: true,
        createdAt,
        updatedAt: createdAt
      }
    ],
    messagingMessages: [
      {
        id: "msg_demo_general_1",
        threadId: "mth_demo_general",
        senderUserId: "tenant-demo",
        sender: "tenant",
        kind: "text",
        body: "공용 현관 등이 깜빡입니다.",
        attachmentUrls: [],
        createdAt
      },
      {
        id: "msg_demo_general_2",
        threadId: "mth_demo_general",
        senderUserId: "landlord-demo",
        sender: "manager",
        kind: "text",
        body: "확인 후 오늘 안으로 답변드리겠습니다.",
        attachmentUrls: [],
        createdAt
      }
    ],
    messagingAnnouncementDrafts: [
      {
        id: "mad_demo_urgent",
        category: "urgent",
        scope: "building",
        targetLabel: "정글빌라 전체",
        targetRoomIds: ["room-301"],
        title: "긴급 단수 안내",
        body: "오늘 18시부터 30분간 긴급 단수가 있습니다.",
        translations: [
          {
            lang: "en",
            langLabel: "English",
            title: "Emergency water outage",
            body: "There will be a 30-minute emergency water outage from 18:00 today.",
            reviewed: true
          }
        ],
        confirmRequired: true,
        status: "sent",
        createdByManagerId: "landlord-demo",
        createdAt,
        updatedAt: createdAt
      }
    ],
    messagingAnnouncements: [
      {
        id: "mann_demo_urgent",
        draftId: "mad_demo_urgent",
        category: "urgent",
        scope: "building",
        targetLabel: "정글빌라 전체",
        title: "긴급 단수 안내",
        body: "오늘 18시부터 30분간 긴급 단수가 있습니다.",
        sender: "박관리",
        senderId: "landlord-demo",
        sentAt: createdAt,
        confirmRequired: true,
        safetyCta: "안전 확인"
      }
    ],
    messagingAnnouncementDeliveries: [
      {
        id: "mdl_demo_urgent_tenant",
        announcementId: "mann_demo_urgent",
        tenantId: "tenant-demo",
        roomId: "room-301",
        unitId: "301",
        tenantName: "김민수",
        preferredLang: "ko",
        state: "unread"
      }
    ],
    managerReports: [],
    managerReportSourceReferences: [],
    managerReportExternalShares: [],
    managerReportAuditLogs: [],
    moveouts: [
      {
        id: "mo_0001",
        tenantId: "tenant-demo",
        roomId: "room-301",
        contractId: "ct_moveout_0001",
        unitId: "302",
        contractConfirmed: true,
        leaseEndDate: "2026-07-31T00:00:00+09:00",
        daysRemaining: 30,
        depositAmount: 10000000,
        estimatedRefundMin: 9740000,
        estimatedRefundMax: 9850000,
        settlementStatus: "reviewing",
        prepProgress: 0.72,
        settlementId: "st_0001",
        createdAt: moveoutCreatedAt,
        updatedAt: moveoutUpdatedAt
      }
    ],
    moveoutRecords: [
      {
        id: "rec_0001",
        summaryId: "mo_0001",
        source: "movein_photo",
        title: "입주 전 욕실 사진",
        description: "입주 시점 욕실 타일과 수전 사진이 있어 현재 상태와 비교할 수 있습니다.",
        occurredAt: "2024-08-01T10:10:00+09:00",
        evidenceUrls: ["/api/files/moveout/bathroom-before.jpg"],
        moveinComparisonAvailable: true
      },
      {
        id: "rec_0002",
        summaryId: "mo_0001",
        source: "defect",
        title: "현관 센서등 깜빡임",
        description: "입주 중 접수된 공용 설비 문의이며 수리 완료 이력이 연결되어 있습니다.",
        occurredAt: "2026-02-11T14:20:00+09:00",
        wearVerdict: "aging_likely",
        wearNote: "소모품 노후 가능성이 높아 임차인 책임으로 단정하지 않습니다.",
        moveinComparisonAvailable: false
      },
      {
        id: "rec_0003",
        summaryId: "mo_0001",
        source: "repair",
        title: "욕실 실리콘 보수",
        description: "보수 완료 후 사진이 첨부되어 있어 차감 후보 산정 근거로만 사용됩니다.",
        occurredAt: "2026-05-12T16:00:00+09:00",
        wearVerdict: "unclear",
        wearNote: "노후와 사용 중 훼손 가능성이 함께 있어 관리인 확인이 필요합니다.",
        evidenceUrls: ["/api/files/moveout/bathroom-repair-after.jpg"],
        moveinComparisonAvailable: true
      },
      {
        id: "rec_0004",
        summaryId: "mo_0001",
        source: "payment",
        title: "7월 관리비 정산",
        description: "관리비 일부 미납 후보가 예상 정산안에 반영되었습니다.",
        occurredAt: "2026-07-01T09:00:00+09:00",
        moveinComparisonAvailable: false
      },
      {
        id: "rec_0005",
        summaryId: "mo_0001",
        source: "contract",
        title: "원상복구 특약",
        description: "계약서 원상복구 조항은 참고 근거이며 최종 차감 확정이 아닙니다.",
        occurredAt: "2024-08-01T10:00:00+09:00",
        moveinComparisonAvailable: false
      },
      {
        id: "rec_0006",
        summaryId: "mo_0001",
        source: "chat",
        title: "퇴실 일정 문의",
        description: "임차인이 퇴실 일정과 정산 예상 범위 안내를 요청했습니다.",
        occurredAt: "2026-06-30T13:30:00+09:00",
        moveinComparisonAvailable: false
      }
    ],
    moveoutChecklist: [
      {
        id: "ck_0001",
        summaryId: "mo_0001",
        label: "현관 카드키 2개",
        present: true,
        condition: "normal",
        note: "반납 예정"
      },
      {
        id: "ck_0002",
        summaryId: "mo_0001",
        label: "에어컨 리모컨",
        present: true,
        condition: "normal"
      },
      {
        id: "ck_0003",
        summaryId: "mo_0001",
        label: "욕실 환풍기",
        present: true,
        condition: "aging",
        note: "소음이 있으나 노후로 보입니다."
      },
      {
        id: "ck_0004",
        summaryId: "mo_0001",
        label: "붙박이장 손잡이",
        present: true,
        condition: "damage_check",
        note: "헐거움 확인 필요"
      },
      {
        id: "ck_0005",
        summaryId: "mo_0001",
        label: "우편함 열쇠",
        present: false,
        condition: "damage_check",
        note: "분실 여부 확인 중"
      }
    ],
    moveoutSettlements: [
      {
        id: "st_0001",
        summaryId: "mo_0001",
        depositAmount: 10000000,
        deductions: [],
        refundMin: 9740000,
        refundMax: 9850000,
        status: "reviewing",
        disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
        createdAt: moveoutCreatedAt,
        updatedAt: moveoutUpdatedAt
      }
    ],
    moveoutDeductions: [
      {
        id: "de_0001",
        summaryId: "mo_0001",
        kind: "unpaid",
        label: "7월 관리비 미납 후보",
        estimatedMin: 70000,
        estimatedMax: 70000,
        needsConfirmation: false,
        evidenceNote: "납부 내역 기준 7월 관리비 잔액 후보입니다.",
        source: "payment"
      },
      {
        id: "de_0002",
        summaryId: "mo_0001",
        kind: "repair",
        label: "욕실 실리콘 보수 후보",
        estimatedMin: 30000,
        estimatedMax: 80000,
        needsConfirmation: false,
        evidenceNote: "입주 전 사진과 2026년 보수 이력을 함께 비교합니다.",
        source: "repair"
      },
      {
        id: "de_0003",
        summaryId: "mo_0001",
        kind: "restoration",
        label: "붙박이장 손잡이 원상복구 후보",
        estimatedMin: 30000,
        estimatedMax: 70000,
        needsConfirmation: false,
        evidenceNote: "체크리스트 손잡이 헐거움과 계약서 원상복구 조항을 참고합니다.",
        source: "contract"
      },
      {
        id: "de_0004",
        summaryId: "mo_0001",
        kind: "cleaning",
        label: "퇴실 기본 청소 후보",
        estimatedMin: 20000,
        estimatedMax: 40000,
        needsConfirmation: false,
        evidenceNote: "퇴실 청소 조항 기준 예상 후보이며 실제 상태 확인 전 확정하지 않습니다.",
        source: "contract"
      }
    ],
    moveoutDisputes: [
      {
        id: "dp_0001",
        summaryId: "mo_0001",
        targetItemId: "de_0002",
        targetLabel: "욕실 실리콘 보수 후보",
        reason: "입주 전부터 있던 변색이라 차감 대상이 아니라고 봅니다.",
        status: "received",
        slaDeadline: moveoutDisputeDeadline,
        slaBreached: true,
        history: [
          {
            status: "received",
            at: moveoutDisputeCreatedAt,
            actorUserId: "tenant-demo",
            note: "입주 전부터 있던 변색입니다."
          }
        ],
        createdAt: moveoutDisputeCreatedAt,
        updatedAt: moveoutDisputeCreatedAt
      }
    ],
    moveoutReportAudits: [
      {
        id: "maud_0001",
        summaryId: "mo_0001",
        recordItemId: "rec_0003",
        action: "reinforce",
        fromVerdict: "unclear",
        toVerdict: "unclear",
        evidenceNote: "입주 전 욕실 사진과 보수 완료 사진을 같은 근거로 묶었습니다.",
        tenantNotified: true,
        managerName: "박관리",
        managerId: "landlord-demo",
        at: "2026-07-02T09:00:00+09:00"
      }
    ],
    history: []
  };
}

function createEmptyStore(): Store {
  return {
    users: [],
    socialAccounts: [],
    rooms: [],
    roomWalls: [],
    tenantRooms: {},
    vendors: [],
    vendorInvites: [],
    tenantInvites: [],
    contracts: [],
    contractDocuments: [],
    contractExtractions: [],
    contractPrivacies: [],
    contractInvites: [],
    bills: [],
    paymentReports: [],
    deposits: [],
    paymentTransactions: [],
    maintenanceFees: [],
    attachments: [],
    floorPlans: [],
    moveInChecklist: [],
    aiFeedback: [],
    intakeSessions: [],
    complaints: [],
    analyses: {},
    tickets: [],
    repairs: [],
    costs: [],
    receipts: [],
    receiptOcrs: [],
    messages: [],
    messagingThreads: [],
    messagingMessages: [],
    messagingAnnouncementDrafts: [],
    messagingAnnouncements: [],
    messagingAnnouncementDeliveries: [],
    managerReports: [],
    managerReportSourceReferences: [],
    managerReportExternalShares: [],
    managerReportAuditLogs: [],
    moveouts: [],
    moveoutRecords: [],
    moveoutChecklist: [],
    moveoutSettlements: [],
    moveoutDeductions: [],
    moveoutDisputes: [],
    moveoutReportAudits: [],
    history: []
  };
}

function mergeMissingById<T extends { id: string }>(current: T[], demo: T[]): T[] {
  return mergeMissingByKey(current, demo, (item) => item.id);
}

function mergeMissingByKey<T>(current: T[], demo: T[], keyOf: (item: T) => string): T[] {
  const currentKeys = new Set(current.map((item) => keyOf(item)));
  const missingDemoItems = demo.filter((item) => !currentKeys.has(keyOf(item)));

  return missingDemoItems.length ? [...current, ...missingDemoItems] : current;
}

function envFlag(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return /^(1|true|yes|on)$/i.test(value.trim());
}

function shouldSeedDemoData(option?: boolean) {
  if (option !== undefined) {
    return option;
  }

  const configured = envFlag(process.env.ROOMLOG_SEED_DEMO);
  if (configured !== undefined) {
    return configured;
  }

  return process.env.NODE_ENV !== "production";
}

@Injectable()
export class RoomlogService implements OnModuleDestroy {
  private readonly store: Store;
  private readonly storeFilePath?: string;
  private readonly uploadDir: string;
  private readonly publicUploadBaseUrl: string;
  private readonly storageAdapter: FileStorageAdapter;
  private readonly seedDemoData: boolean;
  private readonly storeProjector?: StoreProjector;
  private readonly financialCostReader: FinancialCostReader;
  private readonly vendorActivationRepository: VendorActivationProvider;
  // 인증 계정의 DB 단일 원본 — 있으면 가입/로그인/소셜이 응답 전에 DB로 동기 커밋된다.
  private readonly authRepository?: AuthAccountRepository;
  private readonly paymentGateway: TossPaymentGateway;
  private readonly billsWithPaymentConfirmation = new Set<string>();
  private pendingPersistence = Promise.resolve();
  private persistenceGeneration = 0;
  private completedPersistenceGeneration = 0;
  private persistenceFailure?: { generation: number; error: unknown };
  private readonly pendingProxyIntakeBroadcastTicketIds = new Set<string>();
  private shutdownStarted = false;
  private shutdownPromise?: Promise<void>;
  private readonly auth: RoomlogAuthDomain;
  private readonly vendorActivation: RoomlogVendorActivationDomain;
  private readonly floorPlan: RoomlogFloorPlanDomain;
  private readonly cost: RoomlogCostDomain;
  private readonly checklist: RoomlogChecklistDomain;
  private readonly contract: RoomlogContractDomain;
  private readonly vendorMgmt: RoomlogVendorMgmtDomain;
  private readonly messaging: RoomlogMessagingDomain;
  private readonly announcementTranslation: RoomlogAnnouncementTranslationService;
  private readonly moveout: RoomlogMoveoutDomain;
  private readonly report: RoomlogReportDomain;
  private readonly copilot: RoomlogCopilotDomain;

  constructor(
    @Optional()
    @Inject(ROOMLOG_SERVICE_OPTIONS)
    options: RoomlogServiceOptions = {},
    @Optional()
    private readonly creditService?: CreditService
  ) {
    const configuredStoreFile = options.storeFilePath ?? process.env.ROOMLOG_STORE_FILE;
    this.storeFilePath = configuredStoreFile?.trim() || undefined;
    this.uploadDir = options.uploadDir ?? process.env.LOCAL_UPLOAD_DIR ?? "uploads";
    this.seedDemoData = shouldSeedDemoData(options.seedDemoData);
    this.storeProjector = options.storeProjector;
    this.financialCostReader =
      options.financialCostReader ?? new NoopFinancialCostReader();
    this.vendorActivationRepository =
      options.vendorActivationRepository ??
      new UnavailableVendorActivationRepository();
    this.authRepository = options.authRepository;
    this.paymentGateway = options.paymentGateway ?? new TossPaymentsHttpGateway();
    this.publicUploadBaseUrl = (
      options.publicUploadBaseUrl ??
      process.env.PUBLIC_UPLOAD_BASE_URL ??
      "/api/files"
    ).replace(/\/$/, "");
    this.storageAdapter =
      options.storageAdapter ??
      createFileStorageAdapter(process.env, this.uploadDir, this.publicUploadBaseUrl);
    const loadedStore = options.initialStore
      ? this.normalizeStoreSnapshot(JSON.parse(JSON.stringify(options.initialStore)) as Store)
      : this.loadStore();
    const bootStore = this.seedDemoData ? this.backfillDemoStoreSnapshot(loadedStore) : loadedStore;
    // 빈 DB에서 initialStore가 없으면 loadStore()가 데모 스냅샷을 만들지만,
    // 이전에는 "변경 없음"으로 판단해 projector에 한 번도 기록하지 않았다.
    // 초안 저장처럼 DB FK를 직접 쓰는 경로가 즉시 500으로 실패하므로, 첫 부팅도 저장한다.
    const shouldPersistDemoBackfill =
      this.seedDemoData &&
      (!options.initialStore || this.hasDemoBackfillChanges(loadedStore, bootStore));
    this.store = bootStore;
    this.auth = new RoomlogAuthDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      this.vendorActivationRepository
    );
    this.vendorActivation = new RoomlogVendorActivationDomain(
      this.vendorActivationRepository,
      options.vendorActivationSecurity,
      (userId) => {
        const user = this.store.users.find((account) => account.id === userId);
        return user ? { user, relations: this.store } : undefined;
      },
      () => new Date()
    );
    this.floorPlan = new RoomlogFloorPlanDomain(
      this.store,
      this.storageAdapter,
      () => this.persistStore()
    );
    this.cost = new RoomlogCostDomain(
      this.store,
      () => this.persistStore(),
      (iso) => this.timeOf(iso),
      (ticketId) => this.findTicket(ticketId),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (ocr) => this.cloneReceiptOcr(ocr)
    );
    this.checklist = new RoomlogChecklistDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId)
    );
    this.contract = new RoomlogContractDomain(
      this.store,
      this.storageAdapter,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso),
      (startIso, endIso) => this.elapsedHours(startIso, endIso)
    );
    this.vendorMgmt = new RoomlogVendorMgmtDomain(
      this.store,
      () => this.persistStore(),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId)
    );
    this.messaging = new RoomlogMessagingDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso)
    );
    this.announcementTranslation = new RoomlogAnnouncementTranslationService();
    this.report = new RoomlogReportDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso),
      (managerId, input) => this.messaging.createManagerAnnouncementDraft(managerId, input),
      (managerId, input) => this.messaging.createMessagingThread(managerId, input)
    );
    this.moveout = new RoomlogMoveoutDomain(
      this.store,
      () => this.persistStore(),
      (roomId) => this.findRoom(roomId),
      (managerId, roomId) => this.assertManagerCanAccessRoom(managerId, roomId),
      (managerId, roomId) => this.canManagerAccessRoom(managerId, roomId),
      (room) => this.displayUnitId(room),
      (iso) => this.timeOf(iso),
      (managerId, input) => this.messaging.createMessagingThread(managerId, input),
      (tenantId, threadId, input) =>
        this.messaging.addTenantMessagingThreadMessage(tenantId, threadId, input),
      (managerId, threadId, input) =>
        this.messaging.addManagerMessagingThreadMessage(managerId, threadId, input)
    );
    this.copilot = new RoomlogCopilotDomain(
      (managerId, input) => this.runManagerAgentCommand(managerId, input),
      (managerId, kind, input) => this.resolveManagerAgentPendingCommand(managerId, kind, input),
      (managerId, sessionId) => this.safetyIdentifier(managerId, sessionId)
    );

    if (shouldPersistDemoBackfill) {
      this.persistStore();
    }
  }

  onModuleDestroy(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownStarted = true;
      this.shutdownPromise = this.shutdownResources();
    }

    return this.shutdownPromise;
  }

  private async shutdownResources(): Promise<void> {
    await this.drainPersistenceQueue();

    let firstFailure: unknown;
    let hasFailure = false;
    const preserveFirstFailure = (error: unknown) => {
      if (!hasFailure) {
        hasFailure = true;
        firstFailure = error;
      }
    };

    try {
      await this.vendorActivationRepository.close();
    } catch (error) {
      preserveFirstFailure(error);
    }

    if (
      this.storeProjector &&
      (this.storeProjector as unknown as object) !==
        (this.vendorActivationRepository as unknown as object)
    ) {
      await this.drainPersistenceQueue();
      try {
        await this.storeProjector.disconnect?.();
      } catch (error) {
        preserveFirstFailure(error);
      }
    }

    if (
      (this.financialCostReader as unknown as object) !==
        (this.vendorActivationRepository as unknown as object) &&
      (this.financialCostReader as unknown as object) !==
        (this.storeProjector as unknown as object)
    ) {
      try {
        await this.financialCostReader.close?.();
      } catch (error) {
        preserveFirstFailure(error);
      }
    }

    if (
      this.authRepository &&
      (this.authRepository as unknown as object) !==
        (this.vendorActivationRepository as unknown as object) &&
      (this.authRepository as unknown as object) !==
        (this.storeProjector as unknown as object) &&
      (this.authRepository as unknown as object) !==
        (this.financialCostReader as unknown as object)
    ) {
      try {
        await this.authRepository.disconnect?.();
      } catch (error) {
        preserveFirstFailure(error);
      }
    }

    if (hasFailure) throw firstFailure;
  }

  private async drainPersistenceQueue(): Promise<void> {
    while (true) {
      const pendingPersistence = this.pendingPersistence;
      const persistenceGeneration = this.persistenceGeneration;
      await pendingPersistence.catch(() => undefined);

      if (
        pendingPersistence === this.pendingPersistence &&
        persistenceGeneration === this.persistenceGeneration
      ) {
        return;
      }
    }
  }

  async flushPersistence() {
    const requiredGeneration = this.persistenceGeneration;
    await this.pendingPersistence;

    if (this.completedPersistenceGeneration < requiredGeneration) {
      throw this.persistenceFailure?.error ?? new Error("저장을 완료하지 못했습니다.");
    }
  }

  async ensurePersistenceDurability() {
    await this.flushPersistence();
  }

  async ensureTradeContractDurability() {
    if (
      this.persistenceFailure?.generation === this.persistenceGeneration &&
      this.completedPersistenceGeneration < this.persistenceGeneration
    ) {
      this.projectStore();
    }
    await this.ensurePersistenceDurability();
  }

  signup(input: SignupInput): AuthResult {
    return this.auth.signup(input);
  }

  /**
   * DB-first 회원가입 — 컨트롤러가 쓰는 경로.
   * DB(authRepository)가 있으면: DB 중복 검사 → 메모리 가입 → DB 동기 커밋 순서로,
   * DB 저장이 성공해야 토큰을 반환한다(실패 시 메모리 롤백 후 에러).
   * 기존 비동기 프로젝션만으로는 "가입 성공 응답 후 DB 저장 실패 → 재시작 시 계정 증발"이 가능했다.
   */
  async signupWithDb(input: SignupInput): Promise<AuthResult> {
    if (!this.authRepository) return this.auth.signup(input);

    const email = input.email?.trim().toLowerCase() ?? "";
    const phone = normalizePhoneNumber(input.phone);
    await this.authRepository.assertAccountAvailable(email, phone);

    const snapshot = this.captureAuthSnapshot();
    const result = this.auth.signup(input);
    const user = this.store.users.find((account) => account.id === result.userId);
    try {
      if (user) {
        await this.authRepository.saveUser(user);
        // auth.signup()에서 먼저 예약된 전체 프로젝션이 같은 계정을 삽입하다
        // 고유 키 충돌로 실패해도, 확정된 DB 행을 기준으로 다음 세대가 복구한다.
        this.projectStore();
      }
    } catch (error) {
      // DB 확정 실패 — 메모리·JSON에 남은 반쪽 계정을 되돌리고 실패를 그대로 알린다.
      this.restoreAuthSnapshot(snapshot);
      this.persistStore();
      throw error;
    }
    return result;
  }

  login(input: LoginInput): AuthResult {
    return this.auth.login(input);
  }

  /**
   * DB-first 로그인 — 컨트롤러가 쓰는 경로.
   * DB에서 이메일로 직접 조회해 메모리 캐시를 갱신한 뒤 검증한다 —
   * 운영자가 DB에 직접 넣었거나 다른 인스턴스가 만든 계정도 재시작 없이 로그인된다.
   * DB 장애 시에는 메모리로 폴백한다(로그인은 fail-safe).
   */
  async loginWithDb(input: LoginInput): Promise<AuthResult> {
    if (this.authRepository) {
      const email = input.email?.trim().toLowerCase();
      if (email) {
        try {
          const dbUser = await this.authRepository.findUserByEmail(email);
          if (dbUser) this.mergeUserIntoStore(dbUser);
        } catch {
          // DB 장애 — 메모리 캐시로 계속 진행
        }
      }
    }
    return this.auth.login(input);
  }

  async loginWithGoogle(input: GoogleSocialLoginInput): Promise<AuthResult> {
    return await this.commitSocialLogin(() => this.auth.loginWithGoogle(input));
  }

  async loginWithKakao(input: KakaoSocialLoginInput): Promise<AuthResult> {
    return await this.commitSocialLogin(() => this.auth.loginWithKakao(input));
  }

  /**
   * 소셜 로그인 DB 커밋 — 신규 생성 계정은 DB 저장이 성공해야 응답한다(실패 시 롤백).
   * 기존 계정의 재로그인은 프로필 갱신 저장이 실패해도 로그인을 막지 않는다(fail-safe,
   * 다음 전체 프로젝션이 따라잡는다).
   */
  private async commitSocialLogin(run: () => Promise<AuthResult>): Promise<AuthResult> {
    if (!this.authRepository) return await run();

    const knownUserIds = new Set(this.store.users.map((account) => account.id));
    const snapshot = this.captureAuthSnapshot();
    const result = await run();
    const isNewAccount = !knownUserIds.has(result.userId);
    const user = this.store.users.find((account) => account.id === result.userId);
    const socialAccounts = this.store.socialAccounts.filter(
      (account) => account.userId === result.userId
    );
    try {
      if (user) await this.authRepository.saveUser(user);
      for (const account of socialAccounts) {
        await this.authRepository.saveSocialAccount(account);
      }
    } catch (error) {
      if (isNewAccount) {
        this.restoreAuthSnapshot(snapshot);
        this.persistStore();
        throw error;
      }
      // 기존 계정 로그인 — DB 갱신 실패는 로그인 성공을 막지 않는다.
    }
    return result;
  }

  /** DB에서 읽은 계정을 메모리 캐시에 반영 — 로그인 검증은 항상 최신 DB 자격증명 기준이 된다. */
  private mergeUserIntoStore(dbUser: UserAccount) {
    const existing =
      this.store.users.find((account) => account.id === dbUser.id) ??
      this.store.users.find((account) => account.email === dbUser.email);
    if (existing) {
      existing.email = dbUser.email;
      existing.passwordHash = dbUser.passwordHash;
      existing.name = dbUser.name;
      existing.phone = dbUser.phone;
      existing.role = dbUser.role;
      existing.status = dbUser.status;
      return;
    }
    this.store.users.push({ ...dbUser });
  }

  /** 가입/소셜 커밋 실패 롤백용 — 인증 경로가 건드리는 컬렉션만 스냅샷한다. */
  private captureAuthSnapshot() {
    return structuredClone({
      users: this.store.users,
      socialAccounts: this.store.socialAccounts,
      rooms: this.store.rooms,
      vendors: this.store.vendors,
      tenantRooms: this.store.tenantRooms,
      tenantInvites: this.store.tenantInvites,
      vendorInvites: this.store.vendorInvites
    });
  }

  /** 도메인 협력 객체들이 같은 배열 인스턴스를 참조하므로 배열은 제자리(in-place)로 되돌린다. */
  private restoreAuthSnapshot(snapshot: ReturnType<RoomlogService["captureAuthSnapshot"]>) {
    this.store.users.splice(0, this.store.users.length, ...snapshot.users);
    this.store.socialAccounts.splice(0, this.store.socialAccounts.length, ...snapshot.socialAccounts);
    this.store.rooms.splice(0, this.store.rooms.length, ...snapshot.rooms);
    this.store.vendors.splice(0, this.store.vendors.length, ...snapshot.vendors);
    this.store.tenantInvites.splice(0, this.store.tenantInvites.length, ...snapshot.tenantInvites);
    this.store.vendorInvites.splice(0, this.store.vendorInvites.length, ...snapshot.vendorInvites);
    for (const key of Object.keys(this.store.tenantRooms)) delete this.store.tenantRooms[key];
    Object.assign(this.store.tenantRooms, snapshot.tenantRooms);
  }

  getUserFromToken(authorization?: string): UserAccount {
    return this.auth.getUserFromToken(authorization);
  }

  async previewVendorActivation(
    rawKey: string
  ): Promise<VendorActivationPreview> {
    return await this.vendorActivation.preview(rawKey);
  }

  async listResceneVendorActivations(): Promise<ResceneVendorActivation[]> {
    return await this.vendorActivation.listRescene();
  }

  async issueVendorActivation(input: unknown): Promise<VendorActivationIssueResult> {
    await this.flushPersistence();
    return await this.vendorActivation.issue(input);
  }

  async claimVendorActivation(
    userId: string,
    rawKey: string
  ): Promise<VendorActivationClaimResult> {
    await this.flushPersistence();
    return await this.vendorActivation.claim(userId, rawKey);
  }

  async resolveActiveVendorId(userId: string): Promise<string | undefined> {
    return await this.vendorActivationRepository.resolveActiveVendorId(userId);
  }

  async resolveActiveVendorAccount(
    userId: string
  ): Promise<VendorAccountView | undefined> {
    return await this.vendorActivationRepository.resolveActiveVendorAccount(userId);
  }

  /** 관계 기반 파생 capability — requireRole 등 권한 판단은 user.role 단일값 대신 이걸 쓴다. */
  rolesForUser(user: UserAccount): UserRole[] {
    return this.auth.rolesFor(user);
  }

  /** 초대를 이미 로그인한 계정에 관계로 연결한다(새 계정 생성 없음). */
  acceptInviteForUser(userId: string, role: UserRole, inviteToken: string) {
    return this.auth.acceptInviteForUser(userId, role, inviteToken);
  }

  async getMe(authorization?: string) {
    return await this.auth.getMe(authorization);
  }

  /** 매물 직접등록이 만든 임대인 관계 — 소유 room이 없으면 매물 기반 room을 만들어 LANDLORD capability를 연다. */
  ensureLandlordRoomFromListing(userId: string, listing: { title: string; location: string }) {
    return this.auth.ensureLandlordRoomFromListing(userId, listing);
  }

  ensureRoomFromTradeListing(
    ownerId: string,
    listing: {
      roomId?: string;
      title?: string;
      location?: string;
      detailAddress?: string;
      buildingName?: string;
    }
  ) {
    const buildingName = this.tradeListingBuildingName(listing);
    const roomNo = this.tradeListingRoomNo(listing);
    const address = this.tradeListingAddress(listing);
    const linkedRoomId = listing.roomId?.trim();
    let room = linkedRoomId
      ? this.store.rooms.find((item) => item.id === linkedRoomId)
      : undefined;

    if (room?.landlordId && room.landlordId !== ownerId) {
      throw new ForbiddenException("담당 호실에만 접근할 수 있습니다.");
    }

    const exactRoom = this.store.rooms.find(
      (item) => item.buildingName === buildingName && item.roomNo === roomNo
    );
    if (exactRoom && exactRoom.id !== room?.id) {
      if (exactRoom.landlordId && exactRoom.landlordId !== ownerId) {
        throw new ForbiddenException("담당 호실에만 접근할 수 있습니다.");
      }
      room = exactRoom;
    }

    if (!room) {
      room = {
        id: id("room"),
        buildingName,
        roomNo,
        address,
        landlordId: ownerId
      };
      this.store.rooms.push(room);
    } else {
      room.buildingName = buildingName;
      room.roomNo = roomNo;
      room.address = address;
      room.landlordId = ownerId;
    }

    this.persistStore();
    return { ...room };
  }

  /** 계약 수락 → 세입자를 매물 room에 연결(tenantRooms) — TENANT capability가 파생된다. */
  assignTenantRoomFromContract(tenantId: string, landlordId: string, listing: { title: string; location: string }) {
    return this.auth.assignTenantRoomFromContract(tenantId, landlordId, listing);
  }

  getDemoState() {
    if (!this.seedDemoData) {
      throw new ForbiddenException("데모 상태 조회가 비활성화되어 있습니다.");
    }

    return {
      users: this.store.users.map(({ passwordHash, ...user }) => user),
      rooms: this.store.rooms,
      vendors: this.store.vendors.map((vendor) => ({ ...vendor })),
      tenantInvites: this.store.tenantInvites,
      contracts: this.store.contracts,
      contractDocuments: this.store.contractDocuments,
      contractExtractions: this.store.contractExtractions,
      contractPrivacies: this.store.contractPrivacies,
      contractInvites: this.store.contractInvites,
      bills: this.store.bills,
      paymentReports: this.store.paymentReports,
      deposits: this.store.deposits,
      paymentTransactions: this.store.paymentTransactions,
      maintenanceFees: this.store.maintenanceFees,
      complaints: this.store.complaints,
      intakeSessions: this.store.intakeSessions,
      tickets: this.store.tickets,
      repairs: this.store.repairs,
      costs: this.store.costs,
      receipts: this.store.receipts,
      receiptOcrs: this.store.receiptOcrs,
      messages: this.store.messages,
      messagingThreads: this.store.messagingThreads,
      messagingMessages: this.store.messagingMessages,
      messagingAnnouncementDrafts: this.store.messagingAnnouncementDrafts,
      messagingAnnouncements: this.store.messagingAnnouncements,
      messagingAnnouncementDeliveries: this.store.messagingAnnouncementDeliveries,
      managerReports: this.store.managerReports,
      managerReportSourceReferences: this.store.managerReportSourceReferences,
      managerReportExternalShares: this.store.managerReportExternalShares,
      managerReportAuditLogs: this.store.managerReportAuditLogs,
      moveouts: this.store.moveouts,
      moveoutRecords: this.store.moveoutRecords,
      moveoutChecklist: this.store.moveoutChecklist,
      moveoutSettlements: this.store.moveoutSettlements,
      moveoutDeductions: this.store.moveoutDeductions,
      moveoutDisputes: this.store.moveoutDisputes,
      moveoutReportAudits: this.store.moveoutReportAudits
    };
  }

  getRuntimeConfig() {
    return {
      demoAuth: {
        enabled: this.seedDemoData
      }
    };
  }

  listTenantBills(tenantId: string, at: Date = new Date()): TeamBill[] {
    return this.tenantBills(tenantId)
      .filter((bill) => this.billIsVisibleToTenant(bill, at))
      .map((bill) => this.presentBill(bill));
  }

  getTenantBillingOverview(
    tenantId: string,
    at: Date = new Date()
  ): TeamTenantBillingOverview {
    const currentMonth = billingMonthInSeoul(at);
    const bills = this.tenantBills(tenantId).filter((bill) =>
      this.billIsVisibleToTenant(bill, at)
    );
    const summary = (bill: Bill) => ({
      bill: this.presentBill(bill),
      payableFrom: billPayableFrom(bill.dueDate),
      isUpcoming: bill.billingMonth > currentMonth,
      canPay: this.billCanAcceptPayment(bill),
      remainingAmount: this.unpaidAmount(bill)
    });
    const current = bills.find((bill) => bill.billingMonth === currentMonth) ?? null;
    const upcoming =
      bills
        .filter((bill) => bill.billingMonth > currentMonth)
        .sort((left, right) => left.billingMonth.localeCompare(right.billingMonth))[0] ?? null;
    const previousUnpaid = bills
      .filter(
        (bill) => bill.billingMonth < currentMonth && this.unpaidAmount(bill) > 0
      )
      .sort((left, right) => right.billingMonth.localeCompare(left.billingMonth));

    return {
      current: current ? summary(current) : null,
      upcoming: upcoming ? summary(upcoming) : null,
      previousUnpaid: previousUnpaid.map(summary),
      asOf: billingTodayInSeoul(at)
    };
  }

  getTenantPaymentHistory(
    tenantId: string,
    from?: string,
    to?: string,
    at: Date = new Date()
  ): TeamTenantPaymentHistory {
    if (!from || !to) {
      throw new BadRequestException("조회 시작일과 종료일이 모두 필요합니다.");
    }

    let inclusiveDays: number;
    try {
      inclusiveDays = paymentHistoryInclusiveDays(from, to);
    } catch {
      throw new BadRequestException("조회 기간은 올바른 YYYY-MM-DD 형식이어야 합니다.");
    }

    const today = billingTodayInSeoul(at);
    const bills = this.tenantBills(tenantId).filter((bill) =>
      this.billIsRetainedInTenantHistory(bill, at)
    );
    const min = this.tenantPaymentHistoryMinimum(tenantId, bills, today);

    if (from < min || to > today || inclusiveDays > 366) {
      throw new BadRequestException(
        `조회 기간은 ${min}부터 ${today}까지, 최대 366일이어야 합니다.`
      );
    }

    const records = bills
      .flatMap((bill) => {
        const payments = this.tenantPaymentHistoryEvents(bill)
          .filter((event) => {
            const activityDay = billingDateInSeoul(event.activityDate);
            return from <= activityDay && activityDay <= to;
          })
          .sort(
            (left, right) =>
              Date.parse(right.activityDate) - Date.parse(left.activityDate) ||
              right.id.localeCompare(left.id)
          );

        if (payments.length === 0) {
          return [];
        }

        return [
          {
            billId: bill.id,
            billingMonth: bill.billingMonth,
            activityDate: payments[0].activityDate,
            status: this.deriveBillStatus(bill),
            totalAmount: bill.totalAmount,
            paidAmount: bill.paidAmount,
            payments
          }
        ];
      })
      .sort(
        (left, right) =>
          Date.parse(right.activityDate) - Date.parse(left.activityDate) ||
          right.billId.localeCompare(left.billId)
      );

    return {
      range: { from, to },
      bounds: { min, max: today, maxDays: 366 },
      records
    };
  }

  getTenantBill(tenantId: string, billId: string, at: Date = new Date()): TeamBill {
    return this.presentBill(this.findTenantBill(tenantId, billId, at));
  }

  getTenantBillMaintenance(
    tenantId: string,
    billId: string,
    at: Date = new Date()
  ): TeamMaintenance {
    const bill = this.findTenantBill(tenantId, billId, at);

    return this.presentMaintenanceFee(this.resolveMaintenanceFeeForBill(bill));
  }

  createTenantPaymentReport(
    tenantId: string,
    billId: string,
    input: CreatePaymentReportInput,
    at: Date = new Date()
  ): TeamReport {
    const bill = this.findTenantBillForMutation(tenantId, billId);
    this.assertNoPaymentConfirmationInProgress(bill);
    this.assertBillPaymentOpen(bill, at);
    this.assertBillCanAcceptPayment(bill);
    const amount = Number(input.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("신고 금액은 0보다 커야 합니다.");
    }

    const report: PaymentReport = {
      id: id("payrep"),
      billId: bill.id,
      unitId: bill.unitId,
      amount: Math.round(amount),
      depositorName: input.depositorName?.trim() || undefined,
      status: "CONFIRMING",
      etaHours: 24,
      reportedAt: now()
    };

    this.store.paymentReports.unshift(report);
    bill.status = "CONFIRMING";
    bill.depositConfirmationRequested = false;
    bill.updatedAt = now();
    this.persistStore();

    return this.presentPaymentReport(report);
  }

  createTenantBillPaymentOrder(
    tenantId: string,
    billId: string,
    input: CreateBillPaymentOrderInput,
    at: Date = new Date()
  ): TeamBillPaymentOrder {
    const bill = this.findTenantBillForMutation(tenantId, billId);
    this.assertNoPaymentConfirmationInProgress(bill);
    this.assertBillPaymentOpen(bill, at);
    this.assertBillCanAcceptPayment(bill);
    const allowedKinds: BillLineItemKind[] = ["RENT", "MAINTENANCE", "OTHER"];
    const requestedKinds = Array.isArray(input.itemKinds) ? input.itemKinds : [];
    const itemKinds = allowedKinds.filter((kind) => requestedKinds.includes(kind));

    if (itemKinds.length === 0) {
      throw new BadRequestException("결제할 항목을 선택해야 합니다.");
    }

    const normalizedItems = this.normalizeBillItems(bill.items, bill.paidAmount);
    bill.items = normalizedItems;
    const selectedItems = this.billItemsByKind(bill, itemKinds);

    if (selectedItems.length === 0) {
      throw new BadRequestException("선택한 결제 항목을 찾을 수 없습니다.");
    }

    const transactionId = id("billpay");
    const allocations = selectedItems
      .map((item) => {
        const index = normalizedItems.findIndex((candidate) => candidate === item);
        return {
          id: id("payalloc"),
          transactionId,
          billLineItemId: this.billLineItemId(bill, item, index),
          kind: item.kind ?? "OTHER",
          amount: Math.max(0, item.amount - (item.paidAmount ?? 0))
        };
      })
      .filter((allocation) => allocation.amount > 0);
    const amount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);

    if (amount <= 0) {
      throw new BadRequestException("선택한 항목은 이미 완납되었습니다.");
    }

    const transaction: BillPaymentTransaction = {
      id: transactionId,
      billId: bill.id,
      tenantId,
      orderId: `roomlog_${transactionId}`,
      orderName: `${bill.billingMonth} ${bill.unitId} ${selectedItems.map((item) => item.label).join("·")}`,
      amount,
      itemKinds,
      status: "READY",
      requestedAt: now(),
      allocations
    };

    this.store.paymentTransactions.unshift(transaction);
    this.persistStore();

    return {
      billId: bill.id,
      orderId: transaction.orderId,
      orderName: transaction.orderName,
      amount: transaction.amount,
      itemKinds: transaction.itemKinds,
      customerKey: this.paymentCustomerKey(tenantId),
      clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? process.env.TOSS_CLIENT_KEY
    };
  }

  async confirmTenantBillPayment(
    tenantId: string,
    billId: string,
    input: ConfirmBillPaymentInput
  ): Promise<TeamBill> {
    const bill = this.findTenantBillForMutation(tenantId, billId);
    const transaction = this.store.paymentTransactions.find(
      (item) =>
        item.orderId === input.orderId &&
        item.billId === bill.id &&
        item.tenantId === tenantId
    );

    if (!transaction) {
      throw new NotFoundException("결제 주문을 찾을 수 없습니다.");
    }

    if (transaction.status === "APPROVED") {
      return this.presentBill(bill);
    }

    if (transaction.status !== "READY") {
      throw new ConflictException({
        code: "PAYMENT_ORDER_NOT_ACTIVE",
        message: "이미 종료된 결제 주문입니다. 납부 화면에서 다시 시도해주세요."
      });
    }

    this.assertNoPaymentConfirmationInProgress(bill);

    if (Number(input.amount) !== transaction.amount) {
      transaction.status = "FAILED";
      transaction.failedAt = now();
      transaction.failureMessage = "결제 금액이 청구 항목 합계와 일치하지 않습니다.";
      this.persistStore();
      throw new BadRequestException(transaction.failureMessage);
    }

    this.assertBillPaymentOpen(bill, new Date());
    this.assertBillCanAcceptPayment(bill);

    if (!this.paymentAllocationsRemainOutstanding(bill, transaction)) {
      transaction.status = "FAILED";
      transaction.failedAt = now();
      transaction.failureMessage = "청구 잔액이 변경되어 기존 결제 주문을 사용할 수 없습니다.";
      this.persistStore();
      throw new ConflictException({
        code: "PAYMENT_ORDER_STALE",
        message: `${transaction.failureMessage} 납부 화면에서 금액을 다시 확인해주세요.`
      });
    }

    // 외부 승인 요청이 진행되는 동안 같은 청구서의 새 주문/중복 승인을 막는다.
    // 단일 서비스 프로세스의 동기 상태 변경이므로 두 요청이 gateway await 전에 경합하지 않는다.
    this.billsWithPaymentConfirmation.add(bill.id);

    try {
      const confirmed = await this.paymentGateway.confirmPayment({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount
      });

      if (
        confirmed.orderId !== transaction.orderId ||
        Number(confirmed.amount) !== transaction.amount
      ) {
        throw new BadGatewayException("토스페이먼츠 승인 응답이 결제 주문과 일치하지 않습니다.");
      }

      transaction.status = "APPROVED";
      transaction.paymentKey = confirmed.paymentKey;
      transaction.method = confirmed.method;
      transaction.approvedAt = confirmed.approvedAt ?? now();
      transaction.rawResponse = confirmed;
      this.applyConfirmedPaymentToItems(bill, transaction);
      this.refreshBillStatusAfterPaymentChange(bill);
      this.store.deposits.unshift({
        id: id("dep"),
        depositorName: this.tenantNameForBill(bill),
        amount: transaction.amount,
        depositedAt: transaction.approvedAt,
        matchStatus: "MATCHED",
        matchedBillId: bill.id,
        guessedUnitId: bill.unitId,
        paymentTransactionId: transaction.id
      });
      this.persistStore();

      return this.presentBill(bill);
    } catch (error) {
      transaction.status = "FAILED";
      transaction.failedAt = now();
      transaction.failureMessage = error instanceof Error ? error.message : "결제 승인 실패";
      this.persistStore();
      throw error;
    } finally {
      this.billsWithPaymentConfirmation.delete(bill.id);
    }
  }

  getManagerBillDashboard(
    managerId: string,
    buildingName?: string,
    billingMonth?: string,
    allMonths = false
  ): TeamBillingDashboard {
    const month = this.validateBillingMonth(billingMonth);
    const { scope, rooms } = this.resolveManagerBillingScope(managerId, buildingName);
    const roomIds = new Set(rooms.map((room) => room.id));
    const bills = this.managerBills(managerId).filter((bill) => {
      const room = this.roomForManagerBill(managerId, bill);
      return (
        (allMonths || bill.billingMonth === month) &&
        (room ? roomIds.has(room.id) : !scope.selectedBuilding)
      );
    });
    const billedAmount = bills.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const collectedAmount = bills.reduce((sum, bill) => sum + bill.paidAmount, 0);
    const activeOverdue = bills.filter((bill) => this.isBillInActiveOverdue(bill));
    const confirmNeededIds = new Set(
      bills
        .filter((bill) => {
          const overdue = this.presentOverdueCase(bill, managerId);
          return this.dunningGuardForBill(bill).blocked || overdue.stage === "SEVERE";
        })
        .map((bill) => bill.id)
    );
    const pending = bills.filter((bill) => {
      const status = this.deriveBillStatus(bill);
      return ["SENT", "PARTIALLY_PAID"].includes(status) && !this.isBillPastDue(bill);
    }).length;
    const overduePreview = bills
      .filter((bill) => this.canAutoOverdue(bill))
      .map((bill) => this.presentOverdueCase(bill, managerId))
      .sort((left, right) => right.daysOverdue - left.daysOverdue)
      .slice(0, 5);
    const recentDeposits = this.managerRelevantDeposits(managerId)
      .filter((deposit) => {
        const room = this.roomForManagerDeposit(managerId, deposit);
        return (
          (allMonths || this.monthKey(deposit.depositedAt) === month) &&
          (room ? roomIds.has(room.id) : !scope.selectedBuilding)
        );
      })
      .sort((left, right) => right.depositedAt.localeCompare(left.depositedAt))
      .slice(0, 5)
      .map((deposit) => this.presentManagerBillingDeposit(managerId, deposit));

    return {
      scope,
      billingMonth: month,
      summary: {
        total: bills.length,
        confirmNeeded: confirmNeededIds.size,
        pending,
        overdue: activeOverdue.length,
        billedAmount,
        collectedAmount,
        unpaidAmount: Math.max(0, billedAmount - collectedAmount),
        collectionRate: billedAmount > 0 ? collectedAmount / billedAmount : 0,
        overdueUnits: new Set(activeOverdue.map((bill) => bill.roomId ?? bill.unitId)).size
      },
      recentDeposits,
      overduePreview,
      bills: bills.map((bill) => this.presentManagerBillRow(bill, managerId))
    };
  }

  getManagerBill(managerId: string, billId: string): TeamManagerBillDetail {
    const bill = this.findManagerBill(managerId, billId);
    return {
      ...this.presentBill(bill),
      guard: this.dunningGuardForBill(bill)
    };
  }

  publishManagerBill(managerId: string, billId: string): TeamBill {
    const bill = this.findManagerBill(managerId, billId);

    if (bill.status !== "DRAFT") {
      throw new ConflictException("작성 중인 청구서만 확정할 수 있습니다.");
    }

    if (
      bill.totalAmount <= 0 ||
      !bill.bankName ||
      !bill.accountNumber ||
      !bill.accountHolder ||
      Number.isNaN(new Date(bill.dueDate).getTime())
    ) {
      throw new BadRequestException("청구 금액과 수납 계좌를 확인해주세요.");
    }

    bill.status = "SENT";
    bill.updatedAt = now();
    this.persistStore();

    return this.presentBill(bill);
  }

  getManagerCollection(
    managerId: string,
    buildingName?: string,
    billingMonth?: string,
    historyFrom?: string,
    historyTo?: string
  ): TeamCollection {
    const month = this.validateBillingMonth(billingMonth);
    const { scope, rooms } = this.resolveManagerBillingScope(managerId, buildingName);
    const scopedRoomIds = new Set(rooms.map((room) => room.id));
    const scopedBills = this.managerBills(managerId).filter((bill) => {
      const room = this.roomForManagerBill(managerId, bill);
      return room && scopedRoomIds.has(room.id);
    });
    const selectedBills = scopedBills.filter((bill) => bill.billingMonth === month);
    const currentPoint = this.collectionPointForBills(month, selectedBills);
    const previousMonth = this.shiftBillingMonth(month, -1);
    const previousPoint = this.collectionPointForBills(
      previousMonth,
      scopedBills.filter((bill) => bill.billingMonth === previousMonth)
    );
    const confirmingAmount = selectedBills.reduce(
      (sum, bill) => sum + this.confirmingAmountForBill(bill),
      0
    );
    const orphanAmount = this.managerRelevantDeposits(managerId)
      .filter((deposit) => {
        const room = this.roomForManagerDeposit(managerId, deposit);
        return (
          deposit.matchStatus === "ORPHAN" &&
          room &&
          scopedRoomIds.has(room.id) &&
          this.monthKey(deposit.depositedAt) === month
        );
      })
      .reduce((sum, deposit) => sum + deposit.amount, 0);
    const grossUnpaid = selectedBills.reduce((sum, bill) => sum + this.unpaidAmount(bill), 0);
    const recentDeposits = this.managerRelevantDeposits(managerId)
      .filter((deposit) => {
        const room = this.roomForManagerDeposit(managerId, deposit);
        return room && scopedRoomIds.has(room.id);
      })
      .sort((left, right) => right.depositedAt.localeCompare(left.depositedAt))
      .slice(0, 5)
      .map((deposit) => this.presentDeposit(deposit));
    const scopedBillMonths = scopedBills
      .map((bill) => bill.billingMonth)
      .filter((candidate) => candidate <= month)
      .sort((left, right) => left.localeCompare(right));
    const availableFromMonth = scopedBillMonths[0] ?? month;
    const availableToMonth = scopedBillMonths[scopedBillMonths.length - 1] ?? month;
    const hasRecordedHistory = scopedBillMonths.length > 0;
    const defaultHistoryTo = hasRecordedHistory ? availableToMonth : month;
    const requestedFromMonth = this.validateBillingMonth(
      historyFrom ?? this.shiftBillingMonth(defaultHistoryTo, -5)
    );
    const requestedToMonth = this.validateBillingMonth(historyTo ?? defaultHistoryTo);
    if (requestedFromMonth > requestedToMonth) {
      throw new BadRequestException("실적 조회 시작 월은 종료 월보다 늦을 수 없습니다.");
    }
    if (requestedToMonth > month) {
      throw new BadRequestException("실적 조회 종료 월은 선택한 청구 월보다 늦을 수 없습니다.");
    }
    const boundedFromMonth =
      requestedFromMonth < availableFromMonth ? availableFromMonth : requestedFromMonth;
    const boundedToMonth =
      requestedToMonth > availableToMonth ? availableToMonth : requestedToMonth;
    const hasAppliedHistory =
      hasRecordedHistory && boundedFromMonth <= boundedToMonth;
    const appliedFromMonth = hasAppliedHistory ? boundedFromMonth : availableFromMonth;
    const appliedToMonth = hasAppliedHistory ? boundedToMonth : availableToMonth;
    const trend = hasAppliedHistory
      ? this.billingMonthsBetween(appliedFromMonth, appliedToMonth).map((trendMonth) =>
          this.collectionPointForBills(
            trendMonth,
            scopedBills.filter((bill) => bill.billingMonth === trendMonth)
          )
        )
      : [];
    const rollingFromMonth = hasRecordedHistory
      ? this.shiftBillingMonth(availableToMonth, -5) < availableFromMonth
        ? availableFromMonth
        : this.shiftBillingMonth(availableToMonth, -5)
      : month;
    const rollingAverageTrend = hasRecordedHistory
      ? this.billingMonthsBetween(rollingFromMonth, availableToMonth).map((trendMonth) =>
          this.collectionPointForBills(
            trendMonth,
            scopedBills.filter((bill) => bill.billingMonth === trendMonth)
          )
        )
      : [];
    const timing = this.collectionTimingForBills(
      month,
      selectedBills,
      previousMonth,
      scopedBills.filter((bill) => bill.billingMonth === previousMonth)
    );
    const buildings: TeamCollectionBuildingRow[] = scope.buildings
      .filter((building) => !scope.selectedBuilding || building.buildingName === scope.selectedBuilding)
      .map((building) => {
        const buildingRoomIds = new Set(
          rooms
            .filter((room) => room.buildingName === building.buildingName)
            .map((room) => room.id)
        );
        const buildingBills = scopedBills.filter((bill) => {
          const room = this.roomForManagerBill(managerId, bill);
          return room && buildingRoomIds.has(room.id) && bill.billingMonth === month;
        });
        const buildingPreviousBills = scopedBills.filter((bill) => {
          const room = this.roomForManagerBill(managerId, bill);
          return (
            room &&
            buildingRoomIds.has(room.id) &&
            bill.billingMonth === previousMonth
          );
        });
        const point = this.collectionPointForBills(month, buildingBills);
        const previous = this.collectionPointForBills(previousMonth, buildingPreviousBills);

        return {
          ...point,
          buildingName: building.buildingName,
          address: building.address,
          roomCount: building.roomCount,
          previousCollectionRate: previous.collectionRate,
          rateDelta: point.collectionRate - previous.collectionRate,
          bills: buildingBills.map((bill) => this.presentManagerBillRow(bill, managerId))
        };
      });
    const unpaidAmount = Math.max(0, grossUnpaid - confirmingAmount - orphanAmount);
    const rateDelta = currentPoint.collectionRate - previousPoint.collectionRate;

    return {
      scope,
      billingMonth: month,
      brief: {
        billedAmount: currentPoint.billedAmount,
        collectedAmount: currentPoint.collectedAmount,
        unpaidAmount,
        collectionRate: currentPoint.collectionRate,
        billedUnits: currentPoint.billedUnits,
        fullyPaidUnits: currentPoint.fullyPaidUnits,
        partiallyPaidUnits: currentPoint.partiallyPaidUnits,
        threeMonthAverageRate: this.averageCollectionRate(rollingAverageTrend, 3),
        sixMonthAverageRate: this.averageCollectionRate(rollingAverageTrend, 6),
        previousCollectionRate: previousPoint.collectionRate,
        rateDelta,
        confirmingAmount
      },
      trend,
      history: {
        availableFromMonth,
        availableToMonth,
        appliedFromMonth,
        appliedToMonth
      },
      timing,
      buildings,
      collectionRate: currentPoint.collectionRate,
      collectedAmount: currentPoint.collectedAmount,
      unpaidAmount,
      vacancyLoss: 0,
      confirmingAmount,
      orphanAmount,
      recentDeposits
    };
  }

  async listManagerBillDeposits(managerId: string) {
    const billIdsWithReports = new Set(
      this.store.paymentReports
        .filter((report) => report.status === "CONFIRMING")
        .map((report) => report.billId)
    );
    for (const deposit of this.store.deposits.filter((item) => item.matchStatus === "MISMATCH")) {
      if (deposit.matchedBillId) {
        billIdsWithReports.add(deposit.matchedBillId);
      }
    }

    const paymentReports = this.managerBills(managerId)
      .filter((bill) => billIdsWithReports.has(bill.id))
      .map((bill) => this.presentManagerBillRow(bill, managerId));
    const deposits = this.managerRelevantDeposits(managerId);
    const depositRows = deposits.map((deposit) =>
      this.presentManagerTransactionDeposit(managerId, deposit)
    );
    const managerCosts = await this.listManagerCosts(managerId);
    const supersededCostIds = new Set(
      managerCosts
        .filter((cost) => cost.status === "amended" && cost.supersedesId)
        .map((cost) => cost.supersedesId as string)
    );
    const withdrawalRows = managerCosts
      .filter(
        (cost): cost is Cost & { status: "confirmed" | "amended" } =>
          (cost.status === "confirmed" || cost.status === "amended") &&
          cost.repairPayment !== "unpaid" &&
          !supersededCostIds.has(cost.id)
      )
      .map((cost) => this.presentManagerTransactionCost(managerId, cost));

    return {
      paymentReports,
      deposits: deposits
        .filter((deposit) => !["ORPHAN", "MISMATCH"].includes(deposit.matchStatus))
        .map((deposit) => this.presentDeposit(deposit)),
      orphanDeposits: deposits
        .filter((deposit) => deposit.matchStatus === "ORPHAN")
        .map((deposit) => this.presentDeposit(deposit)),
      mismatchDeposits: deposits
        .filter((deposit) => deposit.matchStatus === "MISMATCH")
        .map((deposit) => this.presentDeposit(deposit)),
      ledgerRows: [...depositRows, ...withdrawalRows].sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt)
      )
    };
  }

  matchManagerDeposit(managerId: string, depositId: string, input: MatchDepositInput): TeamDeposit {
    const bill = this.findManagerBill(managerId, input.billId);
    const deposit = this.findDeposit(depositId);

    this.assertNoPaymentConfirmationInProgress(bill);

    if (!this.canManagerAccessDeposit(managerId, deposit)) {
      throw new ForbiddenException("담당 호실의 입금 내역만 매칭할 수 있습니다.");
    }

    const previousBill =
      deposit.matchStatus === "MATCHED" && deposit.matchedBillId
        ? this.store.bills.find((item) => item.id === deposit.matchedBillId)
        : undefined;

    if (previousBill && previousBill.id !== bill.id) {
      this.assertNoPaymentConfirmationInProgress(previousBill);
      this.applyConfirmedPayment(previousBill, -deposit.amount);
      this.refreshBillStatusAfterPaymentChange(previousBill);
    }

    if (deposit.matchStatus !== "MATCHED" || deposit.matchedBillId !== bill.id) {
      this.applyConfirmedPayment(bill, deposit.amount);
    }

    deposit.matchStatus = "MATCHED";
    deposit.matchedBillId = bill.id;
    deposit.guessedUnitId = bill.unitId;

    const report = this.store.paymentReports.find(
      (item) => item.billId === bill.id && item.status === "CONFIRMING" && item.amount === deposit.amount
    ) ?? this.store.paymentReports.find(
      (item) => item.billId === bill.id && item.status === "CONFIRMING"
    );

    if (report) {
      report.status = "MATCHED";
    }

    this.refreshBillStatusAfterPaymentChange(bill);
    this.persistStore();

    return this.presentDeposit(deposit);
  }

  confirmManagerPaymentReport(managerId: string, billId: string, reportId: string): TeamBill {
    const bill = this.findManagerBill(managerId, billId);
    this.assertNoPaymentConfirmationInProgress(bill);
    const report = this.store.paymentReports.find(
      (item) => item.id === reportId && item.billId === bill.id
    );

    if (!report) {
      throw new NotFoundException("납부 신고를 찾을 수 없습니다.");
    }

    if (report.status !== "MATCHED") {
      const confirmedAt = now();
      this.applyConfirmedPayment(bill, report.amount);
      report.status = "MATCHED";
      report.confirmedAt = confirmedAt;
    }

    this.refreshBillStatusAfterPaymentChange(bill);
    this.persistStore();

    return this.presentBill(bill);
  }

  listManagerOverdueCases(
    managerId: string,
    buildingName?: string
  ): TeamOverdueWorkspace {
    const { scope, rooms } = this.resolveManagerBillingScope(managerId, buildingName);
    const roomIds = new Set(rooms.map((room) => room.id));
    const cases = this.managerBills(managerId)
      .filter((bill) => {
        const room = this.roomForManagerBill(managerId, bill);
        return room && roomIds.has(room.id) && this.canAutoOverdue(bill);
      })
      .map((bill) => this.presentOverdueCase(bill, managerId))
      .sort((left, right) => right.daysOverdue - left.daysOverdue);
    const activeCases = cases.filter((item) => !item.guard.blocked);
    const waitingCases = cases.filter((item) => item.guard.blocked);

    return {
      scope,
      asOf: this.todayInSeoul(),
      summary: {
        activeUnpaidAmount: activeCases.reduce((sum, item) => sum + item.unpaidAmount, 0),
        activeCount: activeCases.length,
        severeCount: activeCases.filter((item) => item.stage === "SEVERE").length,
        waitingCount: waitingCases.length
      },
      activeCases,
      waitingCases
    };
  }

  getManagerBillCreationOptions(
    managerId: string,
    buildingName?: string,
    billingMonth?: string
  ): TeamBillCreationData {
    const month = this.validateBillingMonth(billingMonth);
    const { scope, rooms } = this.resolveManagerBillingScope(managerId, buildingName);
    const roomIds = new Set(rooms.map((room) => room.id));
    const accountSource = this.managerBills(managerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const scopedContracts = this.store.contracts.filter(
      (contract) =>
        roomIds.has(contract.roomId) &&
        (!contract.managerId || contract.managerId === managerId)
    );
    const options = scopedContracts
      .filter((contract) => this.managerBillCreationUnavailableReasons(contract).length === 0)
      .map((contract) => {
        const room = rooms.find((candidate) => candidate.id === contract.roomId)!;
        const duplicate = this.store.bills.find(
          (bill) =>
            this.roomForBill(bill)?.id === room.id &&
            bill.billingMonth === month &&
            bill.status !== "CANCELED"
        );

        return {
          roomId: room.id,
          buildingName: room.buildingName,
          unitId: room.roomNo,
          tenantName: this.tenantNameForRoom(room.id),
          contractId: contract.id,
          monthlyRent: contract.monthlyRent!,
          maintenanceFee: contract.maintenanceFee!,
          dueDate: this.billingDueDate(month, contract.paymentDay!),
          duplicateBillId: duplicate?.id
        };
      })
      .sort((left, right) =>
        `${left.buildingName}-${left.unitId}`.localeCompare(
          `${right.buildingName}-${right.unitId}`,
          "ko"
        )
      );
    const optionRoomIds = new Set(options.map((option) => option.roomId));
    const unavailableOptions = rooms
      .filter((room) => !optionRoomIds.has(room.id))
      .map((room) => {
        const candidates = scopedContracts
          .filter((contract) => contract.roomId === room.id)
          .sort((left, right) => {
            const score = (contract: Contract) =>
              (contract.lifecycle === "active" ? 100 : 0) +
              (contract.review === "confirmed" ? 20 : 0) +
              (contract.valueSource === "confirmed" ? 10 : 0);
            return score(right) - score(left) || right.updatedAt.localeCompare(left.updatedAt);
          });
        const contract = candidates[0];

        return {
          roomId: room.id,
          buildingName: room.buildingName,
          unitId: room.roomNo,
          tenantName: this.tenantNameForRoom(room.id),
          contractId: contract?.id,
          reasons: this.managerBillCreationUnavailableReasons(contract)
        };
      })
      .sort((left, right) =>
        `${left.buildingName}-${left.unitId}`.localeCompare(
          `${right.buildingName}-${right.unitId}`,
          "ko"
        )
      );

    return {
      scope,
      billingMonth: month,
      account: {
        bankName: accountSource?.bankName ?? "",
        accountNumber: accountSource?.accountNumber ?? "",
        accountHolder: accountSource?.accountHolder ?? ""
      },
      options,
      unavailableOptions
    };
  }

  createManagerBills(
    managerId: string,
    input: CreateManagerBillsInput
  ): CreateManagerBillsResult {
    const buildingName = input.buildingName?.trim();
    const month = this.validateBillingMonth(input.billingMonth);
    if (!buildingName) {
      throw new BadRequestException("청구서를 생성할 건물을 선택해주세요.");
    }
    const { rooms } = this.resolveManagerBillingScope(managerId, buildingName);
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const rows = Array.isArray(input.rows) ? input.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException("청구서를 생성할 호실을 하나 이상 선택해주세요.");
    }
    const account = {
      bankName: input.account?.bankName?.trim(),
      accountNumber: input.account?.accountNumber?.trim(),
      accountHolder: input.account?.accountHolder?.trim()
    };
    if (!account.bankName || !account.accountNumber || !account.accountHolder) {
      throw new BadRequestException("입금 계좌 정보를 모두 입력해주세요.");
    }
    const seenRoomIds = new Set<string>();
    const validated = rows.map((row) => {
      const room = roomById.get(row.roomId);
      if (!room) {
        throw new ForbiddenException("선택한 건물의 담당 호실만 청구할 수 있습니다.");
      }
      if (seenRoomIds.has(room.id)) {
        throw new BadRequestException(`${room.roomNo}가 두 번 선택되었습니다.`);
      }
      seenRoomIds.add(room.id);
      const contract = this.store.contracts.find(
        (candidate) =>
          candidate.id === row.contractId &&
          candidate.roomId === room.id &&
          (!candidate.managerId || candidate.managerId === managerId) &&
          candidate.lifecycle === "active" &&
          candidate.review === "confirmed" &&
          candidate.valueSource === "confirmed"
      );
      if (!contract) {
        throw new BadRequestException(`${room.roomNo}의 확정된 활성 계약을 찾을 수 없습니다.`);
      }
      const monthlyRent = this.validateBillAmount(row.monthlyRent, "월세");
      const maintenanceFee = this.validateBillAmount(row.maintenanceFee, "관리비");
      const totalAmount = monthlyRent + maintenanceFee;
      if (!Number.isSafeInteger(totalAmount)) {
        throw new BadRequestException(`${room.roomNo}의 청구 합계는 안전한 원 단위 정수여야 합니다.`);
      }
      if (totalAmount <= 0) {
        throw new BadRequestException(`${room.roomNo}의 청구 금액을 입력해주세요.`);
      }
      const dueDate = this.validateBillDueDate(row.dueDate, month);
      const duplicate = this.store.bills.find(
        (bill) =>
          this.roomForBill(bill)?.id === room.id &&
          bill.billingMonth === month &&
          bill.status !== "CANCELED"
      );
      if (duplicate) {
        throw new ConflictException(`${room.roomNo}에 이미 청구서가 있습니다. (${month})`);
      }

      return { room, contract, monthlyRent, maintenanceFee, dueDate };
    });
    const timestamp = now();
    const bills = validated.map(({ room, monthlyRent, maintenanceFee, dueDate }) => {
      const billId = id("bill");
      const items: BillLineItem[] = [];
      if (monthlyRent > 0) {
        items.push({
          id: `${billId}-rent`,
          label: "월세",
          kind: "RENT",
          amount: monthlyRent,
          paidAmount: 0
        });
      }
      if (maintenanceFee > 0) {
        items.push({
          id: `${billId}-maintenance`,
          label: "관리비",
          kind: "MAINTENANCE",
          amount: maintenanceFee,
          paidAmount: 0
        });
      }

      return {
        id: billId,
        roomId: room.id,
        unitId: room.roomNo,
        billingMonth: month,
        status: "DRAFT" as const,
        items,
        totalAmount: monthlyRent + maintenanceFee,
        paidAmount: 0,
        dueDate: `${dueDate}T23:59:59+09:00`,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
        correctionHistory: [],
        depositConfirmationRequested: false,
        createdAt: timestamp,
        updatedAt: timestamp
      } satisfies Bill;
    });

    this.store.bills.push(...bills);
    this.persistStore();

    return {
      createdCount: bills.length,
      billIds: bills.map((bill) => bill.id),
      billingMonth: month,
      buildingName
    };
  }

  getManagerDunningDraft(managerId: string, billId: string): TeamDunning {
    return this.presentDunningDraft(this.findManagerBill(managerId, billId));
  }

  sendManagerDunning(
    managerId: string,
    billId: string,
    input: SendDunningInput
  ): { ok: true } {
    const bill = this.findManagerBill(managerId, billId);
    const text = input.text?.trim();
    const channel = input.channel?.trim();

    if (!text || !channel) {
      throw new BadRequestException("독촉 발송에는 관리인이 편집한 문구와 채널이 필요합니다.");
    }

    if (channel !== "룸로그 알림") {
      throw new BadRequestException("독촉은 세입자의 룸로그 납부 알림으로만 보낼 수 있습니다.");
    }

    this.assertManagerDunningAllowed(bill);

    this.recordManagerDunningMessage(managerId, bill, text, channel);

    return { ok: true };
  }

  private assertManagerDunningAllowed(bill: Bill) {
    if (this.unpaidAmount(bill) <= 0) {
      throw new BadRequestException("미납 잔액이 없는 청구서에는 독촉을 보낼 수 없습니다.");
    }

    if (!this.canAutoOverdue(bill)) {
      throw new BadRequestException("납부기한이 지난 공개 청구서만 독촉할 수 있습니다.");
    }

    const guard = this.dunningGuardForBill(bill);

    if (guard.hasConfirming && guard.hasOrphan) {
      throw new BadRequestException(
        "납부 신고와 미연결 입금이 있어 독촉을 보낼 수 없습니다. 입금내역을 먼저 확인해 주세요."
      );
    }

    if (guard.hasConfirming) {
      throw new BadRequestException(
        "납부 신고 또는 확인 중인 입금이 있어 독촉을 보낼 수 없습니다. 입금내역을 먼저 확인해 주세요."
      );
    }

    if (guard.hasOrphan) {
      throw new BadRequestException(
        "미연결 입금이 있어 독촉을 보낼 수 없습니다. 입금내역을 먼저 확인해 주세요."
      );
    }
  }

  private recordManagerDunningMessage(managerId: string, bill: Bill, text: string, channel: string) {
    const room = this.store.rooms.find(
      (item) => item.landlordId === managerId && this.unitMatchesRoom(bill.unitId, item)
    );

    if (!room) {
      return;
    }

    const tenantId = Object.entries(this.store.tenantRooms).find(([, roomId]) => roomId === room.id)?.[0];

    if (!tenantId) {
      return;
    }

    const createdAt = now();
    const contextLabel = `${bill.billingMonth} 청구 독촉`;
    let thread = this.store.messagingThreads.find(
      (item) =>
        item.roomId === room.id &&
        item.tenantId === tenantId &&
        item.context === "payment" &&
        item.contextRef === bill.id
    );

    if (!thread) {
      thread = {
        id: id("mth"),
        roomId: room.id,
        unitId: this.displayUnitId(room),
        tenantId,
        context: "payment",
        contextRef: bill.id,
        contextLabel,
        lastMessage: text,
        unreadCount: 0,
        managerUnreadCount: 0,
        pendingRequest: false,
        archivedNotice: true,
        createdAt,
        updatedAt: createdAt
      };
      this.store.messagingThreads.push(thread);
    }

    thread.contextLabel = thread.contextLabel || contextLabel;
    thread.lastMessage = text;
    thread.unreadCount += 1;
    thread.pendingRequest = false;
    thread.archivedNotice = true;
    thread.updatedAt = createdAt;

    this.store.messagingMessages.push({
      id: id("msg"),
      threadId: thread.id,
      senderUserId: managerId,
      sender: "manager",
      kind: "text",
      body: text,
      originalBody: channel,
      attachmentUrls: [],
      createdAt
    });
    this.persistStore();
  }

  listTenantContracts(tenantId: string): Contract[] {
    return this.contract.listTenantContracts(tenantId);
  }

  getTenantCurrentContract(tenantId: string, roomId?: string): Contract | null {
    return this.contract.getTenantCurrentContract(tenantId, roomId);
  }

  getTenantContract(tenantId: string, contractId: string): Contract {
    return this.contract.getTenantContract(tenantId, contractId);
  }

  getTenantContractExtraction(tenantId: string, contractId: string): ContractExtraction {
    return this.contract.getTenantContractExtraction(tenantId, contractId);
  }

  getTenantContractPrivacy(tenantId: string, contractId: string): ContractPrivacy {
    return this.contract.getTenantContractPrivacy(tenantId, contractId);
  }

  requestTenantContractDeletion(tenantId: string, contractId: string): ContractPrivacy {
    return this.contract.requestTenantContractDeletion(tenantId, contractId);
  }

  createTenantContract(tenantId: string, input: CreateTenantContractInput) {
    return this.contract.createTenantContract(tenantId, input);
  }

  ensureTradeContractDraft(input: EnsureTradeContractDraftInput) {
    return this.contract.ensureTradeContractDraft(input);
  }

  connectAcceptedTradeContract(input: ConnectAcceptedTradeContractInput) {
    return this.contract.connectAcceptedTradeContract(input);
  }

  preflightAcceptedTradeContract(input: ConnectAcceptedTradeContractInput) {
    return this.contract.preflightAcceptedTradeContract(input);
  }

  disconnectAcceptedTradeContract(input: { tradeContractId: string; tenantId: string }) {
    return this.contract.disconnectAcceptedTradeContract(input);
  }

  getManagerContractDashboard(managerId: string) {
    return this.contract.getManagerContractDashboard(managerId);
  }

  getManagerContractDetail(managerId: string, contractId = "ct_0001") {
    return this.contract.getManagerContractDetail(managerId, contractId);
  }

  confirmManagerContractReview(
    managerId: string,
    contractId: string,
    input: ConfirmContractInput = {}
  ) {
    return this.contract.confirmManagerContractReview(managerId, contractId, input);
  }

  requestManagerContractInfo(managerId: string, contractId: string) {
    return this.contract.requestManagerContractInfo(managerId, contractId);
  }

  runManagerContractOcr(managerId: string, contractId: string) {
    return this.contract.runManagerContractOcr(managerId, contractId);
  }

  createManagerContract(managerId: string, input: CreateManagerContractInput) {
    return this.contract.createManagerContract(managerId, input);
  }

  updateManagerContractManualValues(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractManualValuesInput
  ) {
    return this.contract.updateManagerContractManualValues(managerId, contractId, input);
  }

  updateManagerContractInventory(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractInventoryInput
  ) {
    return this.contract.updateManagerContractInventory(managerId, contractId, input);
  }

  createManagerContractInvite(
    managerId: string,
    contractId: string,
    input: CreateManagerContractInviteInput
  ) {
    return this.contract.createManagerContractInvite(managerId, contractId, input);
  }

  updateManagerContractInvite(
    managerId: string,
    inviteId: string,
    input: UpdateManagerContractInviteInput
  ) {
    return this.contract.updateManagerContractInvite(managerId, inviteId, input);
  }

  updateManagerContractPrivacy(
    managerId: string,
    contractId: string,
    input: UpdateManagerContractPrivacyInput
  ) {
    return this.contract.updateManagerContractPrivacy(managerId, contractId, input);
  }

  decideManagerContractDeletion(
    managerId: string,
    contractId: string,
    state: DeletionState,
    retentionNote?: string
  ) {
    return this.contract.decideManagerContractDeletion(managerId, contractId, state, retentionNote);
  }

  createComplaint(tenantId: string, input: CreateComplaintInput) {
    this.validateComplaintInput(input);

    const roomId = input.roomId ?? this.store.tenantRooms[tenantId] ?? "room-301";
    const requestFingerprint = input.clientRequestId
      ? this.complaintRequestFingerprint(roomId, input)
      : undefined;
    const existing = input.clientRequestId
      ? this.store.complaints.find(
          (complaint) =>
            complaint.tenantId === tenantId &&
            complaint.clientRequestId === input.clientRequestId
        )
      : undefined;
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException("같은 접수 요청에 변경된 내용을 다시 사용할 수 없습니다.");
      }
      const ticket = this.findTicket(existing.ticketId);
      return {
        complaint: this.presentComplaint(existing),
        ticket: this.presentTicket(ticket),
        analysis: this.store.analyses[ticket.id]
      };
    }
    const analysis = this.analyzeComplaint(input);
    return this.createComplaintRecord(tenantId, roomId, "DIRECT_FORM", input, analysis, [
      {
        senderUserId: tenantId,
        senderRole: "TENANT",
        messageText: input.description,
        attachmentUrls: input.attachmentUrls
      }
    ]);
  }

  async createManagerProxyIntake(managerId: string, input: ManagerProxyIntakeInput) {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof input.roomId !== "string" ||
      !input.roomId.trim()
    ) {
      throw new BadRequestException("호실을 선택해 주세요.");
    }
    if (input.tenantId !== undefined && typeof input.tenantId !== "string") {
      throw new BadRequestException("선택한 세입자가 해당 호실에 연결되어 있지 않습니다.");
    }
    this.assertManagerCanAccessRoom(managerId, input.roomId);
    this.validateComplaintInput(input);

    const reportedViaLabels: Record<
      NonNullable<ManagerProxyIntakeInput["reportedVia"]>,
      string
    > = {
      phone: "전화",
      text: "문자",
      in_person: "대면",
      other: "기타"
    };
    const reportedVia = input.reportedVia ?? "other";
    if (!Object.hasOwn(reportedViaLabels, reportedVia)) {
      throw new BadRequestException("접수 경로가 올바르지 않습니다.");
    }

    const linkedTenantIds = Object.entries(this.store.tenantRooms)
      .filter(([, roomId]) => roomId === input.roomId)
      .map(([tenantId]) => tenantId);
    if (linkedTenantIds.length === 0) {
      throw new BadRequestException("연결된 세입자가 없는 호실입니다");
    }

    const requestedTenantId = input.tenantId?.trim();
    if (input.tenantId !== undefined && !requestedTenantId) {
      throw new BadRequestException("선택한 세입자가 해당 호실에 연결되어 있지 않습니다.");
    }
    if (!requestedTenantId && linkedTenantIds.length > 1) {
      throw new BadRequestException("세입자를 선택해 주세요");
    }

    const tenantId = requestedTenantId ?? linkedTenantIds[0];
    if (!tenantId || !linkedTenantIds.includes(tenantId)) {
      throw new BadRequestException("선택한 세입자가 해당 호실에 연결되어 있지 않습니다.");
    }

    const normalizedInput = { ...input, reportedVia };
    const requestFingerprint = normalizedInput.clientRequestId
      ? this.complaintRequestFingerprint(input.roomId, normalizedInput)
      : undefined;
    const existing = normalizedInput.clientRequestId
      ? this.store.complaints.find(
          (complaint) =>
            complaint.tenantId === tenantId &&
            complaint.clientRequestId === normalizedInput.clientRequestId
        )
      : undefined;
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new ConflictException("같은 접수 요청에 변경된 내용을 다시 사용할 수 없습니다.");
      }
      const ticket = this.findTicket(existing.ticketId);
      if (
        this.persistenceFailure?.generation === this.persistenceGeneration &&
        this.completedPersistenceGeneration < this.persistenceGeneration
      ) {
        this.projectStore();
      }
      await this.ensurePersistenceDurability();
      const shouldBroadcast = this.pendingProxyIntakeBroadcastTicketIds.delete(ticket.id);
      return {
        complaint: this.presentComplaint(existing),
        ticket: this.presentTicket(ticket),
        analysis: this.store.analyses[ticket.id],
        created: false as const,
        shouldBroadcast
      };
    }

    const analysis = this.analyzeComplaint(normalizedInput);
    let createdRecordIds:
      | { complaintId: string; ticketId: string; historyIds: string[]; messageIds: string[] }
      | undefined;
    try {
      const created = this.createComplaintRecord(
        tenantId,
        input.roomId,
        "MANAGER_PROXY",
        normalizedInput,
        analysis,
        [
          {
            senderUserId: managerId,
            senderRole: "LANDLORD",
            messageText: `관리자 대리 접수 · ${reportedViaLabels[reportedVia]} · ${normalizedInput.description}`,
            attachmentUrls: input.attachmentUrls
          }
        ],
        undefined,
        (ids) => {
          createdRecordIds = ids;
          this.pendingProxyIntakeBroadcastTicketIds.add(ids.ticketId);
        }
      );
      await this.ensurePersistenceDurability();
      const shouldBroadcast = this.pendingProxyIntakeBroadcastTicketIds.delete(
        created.ticket.id
      );

      return { ...created, created: true as const, shouldBroadcast };
    } catch (error) {
      if (!normalizedInput.clientRequestId && createdRecordIds) {
        this.rollbackComplaintRecord(createdRecordIds);
        this.pendingProxyIntakeBroadcastTicketIds.delete(createdRecordIds.ticketId);
        await this.drainPersistenceQueue();

        if (!this.storeProjector?.removeComplaintAggregate) {
          const safetyError = new Error(
            "대리접수 저장 실패를 안전하게 보상할 수 없습니다."
          ) as Error & { cause?: unknown };
          safetyError.cause = error;
          throw safetyError;
        }

        try {
          await this.storeProjector.removeComplaintAggregate(createdRecordIds);
        } catch (compensationError) {
          const safetyError = new Error(
            "대리접수 저장 실패 보상 작업을 완료하지 못했습니다."
          ) as Error & { cause?: unknown };
          safetyError.cause = compensationError;
          throw safetyError;
        }
      }
      throw error;
    }
  }

  listManagerProxyIntakeRooms(managerId: string) {
    const { rooms } = this.resolveManagerBillingScope(managerId);

    return rooms.map((room) => {
      const tenants = Object.entries(this.store.tenantRooms)
        .filter(([, roomId]) => roomId === room.id)
        .map(([tenantId]) => ({
          tenantId,
          name: this.store.users.find((user) => user.id === tenantId)?.name ?? "이름 미확인"
        }))
        .sort((left, right) => left.tenantId.localeCompare(right.tenantId));

      return {
        roomId: room.id,
        buildingName: room.buildingName,
        unitLabel: room.roomNo,
        tenants,
        hasTenant: tenants.length > 0
      };
    });
  }

  createIntakeSession(tenantId: string, input: CreateIntakeSessionInput = {}) {
    const roomId = input.roomId ?? this.store.tenantRooms[tenantId] ?? "room-301";
    const createdAt = now();
    const session: IntakeSession = {
      id: id("sess"),
      tenantId,
      roomId,
      sourceChannel: input.sourceChannel ?? "REALTIME_CHAT",
      status: "ACTIVE",
      draft: this.emptyDraft(),
      messages: [],
      createdAt,
      updatedAt: createdAt
    };
    const greeting = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      "안녕하세요. 어떤 문제인지 편하게 적어주세요. 위치, 언제부터 발생했는지, 현재 위험 여부, 방문 가능한 시간을 함께 알려주시면 접수 초안을 바로 정리할게요.",
      "CHAT"
    );

    session.messages.push(greeting);
    this.store.intakeSessions.unshift(session);
    this.persistStore();

    return { session: this.presentIntakeSession(session) };
  }

  listIntakeSessions(tenantId: string) {
    return this.store.intakeSessions
      .filter((session) => session.tenantId === tenantId)
      .map((session) => this.presentIntakeSession(session));
  }

  getIntakeSession(tenantId: string, sessionId: string) {
    return this.presentIntakeSession(this.findIntakeSession(tenantId, sessionId));
  }

  async sendIntakeMessage(tenantId: string, sessionId: string, input: SendIntakeMessageInput) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 종료된 상담입니다.");
    }

    const messageText = (input.messageText || input.transcriptText || "").trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("상담 메시지 또는 사진이 필요합니다.");
    }

    session.messages.push({
      ...this.createIntakeMessage(
        session.id,
        "TENANT",
        messageText || "사진을 첨부했습니다.",
        input.inputMode ?? "CHAT"
      ),
      transcriptText: input.transcriptText,
      attachmentUrls
    });

    const fallbackDraft = this.buildIntakeDraft(session);
    const generatedTurn = await this.generateIntakeTurn(session, fallbackDraft);
    session.draft = generatedTurn.draft;
    const assistantMessage = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      generatedTurn.assistantMessage,
      "CHAT"
    );
    session.messages.push(assistantMessage);
    session.updatedAt = now();
    this.persistStore();

    const autoFinalized = this.maybeAutoFinalizeIntake(tenantId, session);

    return { session: this.presentIntakeSession(session), assistantMessage, autoFinalized };
  }

  // 세입자가 접수를 명시 요청했고(filingIntent) 초안이 준비되면 버튼 없이 같은 턴에서 바로 접수한다.
  // 수동 "민원 접수" 버튼과 같은 경로라 중복 후보가 있어도 새 티켓으로 접수된다(AI가 중복 가능성은 대화에서 안내).
  private maybeAutoFinalizeIntake(tenantId: string, session: IntakeSession) {
    if (!session.draft.readyToFinalize || !session.draft.filingIntent) {
      return undefined;
    }

    try {
      const finalized = this.finalizeIntakeSession(tenantId, session.id);
      return {
        complaint: finalized.complaint,
        ticket: finalized.ticket,
        analysis: finalized.analysis
      };
    } catch {
      // 자동 접수에 실패해도 상담은 유지 — 기존 수동 접수 버튼 경로로 폴백한다.
      return undefined;
    }
  }

  async recordRealtimeTurn(
    tenantId: string,
    sessionId: string,
    input: RecordRealtimeTurnInput
  ) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 종료된 상담입니다.");
    }

    const userTranscript = input.userTranscript?.trim() ?? "";
    const assistantTranscript = input.assistantTranscript?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];
    const realtimeEventId = input.eventId?.trim();

    if (realtimeEventId) {
      const existingTurnMessages = session.messages.filter(
        (message) => message.realtimeEventId === realtimeEventId
      );

      if (existingTurnMessages.length > 0) {
        const assistantMessageText =
          existingTurnMessages.find((message) => message.sender === "AI_ASSISTANT")?.messageText ??
          session.messages.filter((message) => message.sender === "AI_ASSISTANT").at(-1)
            ?.messageText ??
          this.composeAssistantReply(session.draft, session);

        return {
          session: this.presentIntakeSession(session),
          turnSummary: this.presentRealtimeTurnSummary(session, assistantMessageText),
          recordedMessages: this.presentIntakeMessages(existingTurnMessages),
          deduplicated: true
        };
      }
    }

    if (!userTranscript && !assistantTranscript && attachmentUrls.length === 0) {
      throw new BadRequestException("Realtime 전사 내용이 필요합니다.");
    }

    const recordedMessages: IntakeMessage[] = [];

    if (userTranscript || attachmentUrls.length > 0) {
      const tenantMessage: IntakeMessage = {
        ...this.createIntakeMessage(
          session.id,
          "TENANT",
          userTranscript || "음성 입력을 보냈습니다.",
          "VOICE"
        ),
        transcriptText: userTranscript || undefined,
        realtimeEventId,
        attachmentUrls
      };
      session.messages.push(tenantMessage);
      recordedMessages.push(tenantMessage);
    }

    const fallbackDraft = this.buildIntakeDraft(session);
    const generatedTurn = await this.generateIntakeTurn(session, fallbackDraft);
    session.draft = generatedTurn.draft;

    const assistantMessageText = assistantTranscript || generatedTurn.assistantMessage;
    const assistantMessage = this.createIntakeMessage(
      session.id,
      "AI_ASSISTANT",
      assistantMessageText,
      "VOICE"
    );
    assistantMessage.realtimeEventId = realtimeEventId;
    session.messages.push(assistantMessage);
    recordedMessages.push(assistantMessage);

    session.updatedAt = now();
    this.persistStore();

    return {
      session: this.presentIntakeSession(session),
      turnSummary: this.presentRealtimeTurnSummary(session, assistantMessageText),
      recordedMessages: this.presentIntakeMessages(recordedMessages),
      deduplicated: false
    };
  }

  private presentIntakeMessages(messages: IntakeMessage[]) {
    return messages.map((message) => ({
      ...message,
      attachmentUrls: [...message.attachmentUrls]
    }));
  }

  private presentRealtimeTurnSummary(session: IntakeSession, assistantMessageText: string) {
    const draft = session.draft;
    const intakeSlots = this.draftIntakeSlots(session);
    const slotCounts = this.intakeSlotCounts(intakeSlots);
    const requiresPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const needsVisit = draft.requiredInfo.some((item) => /방문|시간/.test(item));
    const statusParts = [
      !draft.readyToFinalize ? "추가 확인 필요" : "접수 초안 준비",
      requiresPhoto ? "사진 요청" : undefined,
      needsVisit ? "방문 가능 시간 확인" : undefined
    ].filter(Boolean);

    return {
      channelLabel: session.sourceChannel === "CALLBOT" ? "콜봇" : "음성 상담",
      statusLabel: statusParts.join(" · "),
      detailCategory: draft.detailCategory,
      priority: draft.priority,
      requiresPhoto,
      readyToFinalize: draft.readyToFinalize,
      intakeSlots: this.presentIntakeSlots(intakeSlots),
      collectedSlotCount: slotCounts.collectedSlotCount,
      openSlotCount: slotCounts.openSlotCount,
      nextQuestions: [...draft.nextQuestions],
      tenantGuidance: [...draft.tenantGuidance],
      spokenReply: assistantMessageText
    };
  }

  finalizeIntakeSession(tenantId: string, sessionId: string, input: FinalizeIntakeInput = {}) {
    const session = this.findIntakeSession(tenantId, sessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 접수된 상담입니다.");
    }

    session.draft = session.draft.readyToFinalize ? session.draft : this.buildIntakeDraft(session);

    if (!session.draft.readyToFinalize) {
      throw new BadRequestException(
        `접수에 필요한 정보가 부족합니다: ${session.draft.requiredInfo.join(", ")}`
      );
    }

    const confirmedCategory = this.confirmedIntakeCategory(
      input.confirmedCategory,
      session.draft.category
    );
    const confirmedDetailCategory =
      input.confirmedDetailCategory?.trim() || session.draft.detailCategory;
    const confirmedPriority = this.confirmedIntakePriority(
      input.confirmedPriority,
      session.draft.priority
    );
    const confirmedResponsibilityHint = this.confirmedIntakeResponsibilityHint(
      input.confirmedResponsibilityHint,
      session.draft.responsibilityHint
    );
    const correctionReasons = this.intakeCorrectionReasons(session.draft, {
      category: confirmedCategory,
      detailCategory: confirmedDetailCategory,
      priority: confirmedPriority,
      responsibilityHint: confirmedResponsibilityHint
    });
    const description = input.confirmedSummary || session.draft.summary;
    const complaintInput: CreateComplaintInput = {
      title: input.confirmedTitle || session.draft.title,
      description,
      location: input.confirmedLocation || session.draft.location || "위치 확인 필요",
      roomId: session.roomId,
      occurredAt: input.occurredAt || session.draft.occurredAt,
      availableTimes: input.availableTimes || session.draft.availableTimes
    };
    const analysis: AiAnalysis = {
      summary: description,
      category: confirmedDetailCategory,
      detailCategory: confirmedDetailCategory,
      priority: confirmedPriority,
      responsibilityHint: session.draft.responsibilityHint,
      confidenceScore: session.draft.confidenceScore,
      reasons: [...correctionReasons, ...session.draft.reasons],
      recommendedAction: session.draft.recommendedAction,
      photoAnalysis: session.draft.photoAnalysis
    };

    if (input.duplicateResolution === "ATTACH_TO_EXISTING") {
      return this.attachIntakeSessionToExistingTicket(
        tenantId,
        session,
        input.existingTicketId,
        description
      );
    }

    const result = this.createComplaintRecord(
      tenantId,
      session.roomId,
      session.sourceChannel,
      complaintInput,
      analysis,
      session.messages.map((message) => ({
        senderUserId: message.sender === "TENANT" ? tenantId : "roomlog-ai",
        senderRole: message.sender,
        messageText: message.messageText,
        attachmentUrls: message.attachmentUrls
      })),
      confirmedResponsibilityHint
    );

    session.status = "FINALIZED";
    session.complaintId = result.complaint.id;
    session.ticketId = result.ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;
    this.persistStore();

    return result;
  }

  private confirmedIntakeCategory(
    value: FinalizeIntakeInput["confirmedCategory"],
    fallback: IntakeDraft["category"]
  ): IntakeDraft["category"] {
    if (value === undefined) {
      return fallback;
    }

    if (["하자", "소음", "설비", "납부", "계약", "공용공간", "기타"].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 민원 유형이 올바르지 않습니다.");
  }

  private confirmedIntakePriority(
    value: FinalizeIntakeInput["confirmedPriority"],
    fallback: IntakeDraft["priority"]
  ): IntakeDraft["priority"] {
    if (value === undefined) {
      return fallback;
    }

    if ([1, 2, 3, 4].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 긴급도가 올바르지 않습니다.");
  }

  private confirmedIntakeResponsibilityHint(
    value: FinalizeIntakeInput["confirmedResponsibilityHint"],
    fallback: IntakeDraft["responsibilityHint"]
  ): IntakeDraft["responsibilityHint"] {
    if (value === undefined) {
      return fallback;
    }

    if (["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"].includes(value)) {
      return value;
    }

    throw new BadRequestException("정정할 책임 가능성이 올바르지 않습니다.");
  }

  private intakeCorrectionReasons(
    draft: IntakeDraft,
    confirmed: Pick<IntakeDraft, "category" | "detailCategory" | "priority" | "responsibilityHint">
  ) {
    const changed =
      draft.category !== confirmed.category ||
      draft.detailCategory !== confirmed.detailCategory ||
      draft.priority !== confirmed.priority ||
      draft.responsibilityHint !== confirmed.responsibilityHint;

    return changed ? ["세입자가 접수 전 AI 초안을 정정했습니다."] : [];
  }

  private attachIntakeSessionToExistingTicket(
    tenantId: string,
    session: IntakeSession,
    existingTicketId: string | undefined,
    description: string
  ) {
    if (!existingTicketId) {
      throw new BadRequestException("기존 티켓에 연결하려면 티켓을 선택해주세요.");
    }

    const ticket = this.findTicket(existingTicketId);

    if (ticket.tenantId !== tenantId || ticket.roomId !== session.roomId) {
      throw new ForbiddenException("본인 호실의 기존 티켓에만 상담을 연결할 수 있습니다.");
    }

    if (["COMPLETED", "CANCELLED"].includes(ticket.status)) {
      throw new BadRequestException("완료 또는 취소된 티켓에는 상담을 연결할 수 없습니다.");
    }

    const complaint = this.findComplaint(ticket.complaintId);
    this.addMessageInternal(
      ticket.id,
      complaint.id,
      "roomlog-ai",
      "SYSTEM",
      "중복 가능성이 있어 기존 티켓에 상담 내용을 추가했습니다."
    );

    for (const message of session.messages) {
      this.addMessageInternal(
        ticket.id,
        complaint.id,
        message.sender === "TENANT" ? tenantId : message.sender === "SYSTEM" ? "roomlog-system" : "roomlog-ai",
        message.sender,
        message.messageText,
        message.attachmentUrls
      );
    }

    const attachmentUrls = Array.from(
      new Set(
        session.messages
          .filter((message) => message.sender === "TENANT")
          .flatMap((message) => message.attachmentUrls)
      )
    );
    this.refreshAnalysisFromTenantFollowup(ticket, {
      messageText: description,
      attachmentUrls
    });

    if (ticket.status === "ADDITIONAL_INFO_REQUESTED" || ticket.status === "REOPENED") {
      this.transitionTicket(ticket.id, "REVIEWING", tenantId, "중복 상담 내용이 기존 티켓에 추가됨");
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    session.status = "FINALIZED";
    session.complaintId = complaint.id;
    session.ticketId = ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;
    this.persistStore();

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id],
      attachedToExisting: true
    };
  }

  createComplaintFromCall(tenantId: string, input: CreateComplaintFromCallInput) {
    const callSessionId = input.callSessionId?.trim();

    if (!callSessionId) {
      throw new BadRequestException("콜봇 통화 세션 ID가 필요합니다.");
    }

    const session = this.findIntakeSession(tenantId, callSessionId);

    if (session.status !== "ACTIVE") {
      throw new BadRequestException("이미 접수된 콜봇 통화입니다.");
    }

    session.sourceChannel = "CALLBOT";

    if (input.roomId) {
      if (!this.store.rooms.some((room) => room.id === input.roomId)) {
        throw new NotFoundException("호실을 찾을 수 없습니다.");
      }
      session.roomId = input.roomId;
    }

    const transcriptText = input.transcriptText?.trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (transcriptText || attachmentUrls.length) {
      session.messages.push({
        ...this.createIntakeMessage(
          session.id,
          "TENANT",
          transcriptText || "콜봇 통화 중 사진이 수신되었습니다.",
          attachmentUrls.length ? "PHOTO" : "VOICE"
        ),
        transcriptText,
        attachmentUrls
      });
    }

    if (input.assistantSummary?.trim()) {
      session.messages.push(
        this.createIntakeMessage(session.id, "AI_ASSISTANT", input.assistantSummary.trim(), "VOICE")
      );
    }

    if (input.recordingUrl?.trim()) {
      session.messages.push(
        this.createIntakeMessage(
          session.id,
          "SYSTEM",
          `콜봇 통화 녹음: ${input.recordingUrl.trim()}`,
          "VOICE"
        )
      );
    }

    const hasTenantSignal = session.messages.some(
      (message) => message.sender === "TENANT" && (message.messageText.trim() || message.attachmentUrls.length)
    );

    if (!hasTenantSignal) {
      throw new BadRequestException("콜봇 통화 전사 또는 사진이 필요합니다.");
    }

    session.draft = this.buildIntakeDraft(session);

    const remainingRequiredInfo = session.draft.requiredInfo.filter(
      (item) => item !== "문제 부위 사진"
    );

    if (remainingRequiredInfo.length > 0) {
      throw new BadRequestException(
        `콜봇 접수에 필요한 정보가 부족합니다: ${remainingRequiredInfo.join(", ")}`
      );
    }

    const needPhoto = session.draft.photoRequested && !this.sessionHasPhoto(session);
    const description = session.draft.summary;
    const complaintInput: CreateComplaintInput = {
      title: session.draft.title,
      description,
      location: session.draft.location || this.store.rooms.find((room) => room.id === session.roomId)?.roomNo || "위치 확인 필요",
      roomId: session.roomId,
      occurredAt: session.draft.occurredAt,
      availableTimes: session.draft.availableTimes
    };
    const analysis: AiAnalysis = {
      summary: description,
      category: session.draft.detailCategory,
      detailCategory: session.draft.detailCategory,
      priority: session.draft.priority,
      responsibilityHint: session.draft.responsibilityHint,
      confidenceScore: session.draft.confidenceScore,
      reasons: session.draft.reasons,
      recommendedAction: needPhoto
        ? "콜봇 접수 후 사진 업로드 링크를 발송하고, 사진 수신 뒤 관리자 검토를 이어가세요."
        : session.draft.recommendedAction,
      photoAnalysis: session.draft.photoAnalysis
    };
    const created = this.createComplaintRecord(
      tenantId,
      session.roomId,
      "CALLBOT",
      complaintInput,
      analysis,
      session.messages.map((message) => ({
        senderUserId:
          message.sender === "TENANT"
            ? tenantId
            : message.sender === "SYSTEM"
              ? "roomlog-system"
              : "roomlog-ai",
        senderRole: message.sender,
        messageText: message.messageText,
        attachmentUrls: message.attachmentUrls
      }))
    );

    session.status = "FINALIZED";
    session.complaintId = created.complaint.id;
    session.ticketId = created.ticket.id;
    session.finalizedAt = now();
    session.updatedAt = session.finalizedAt;

    const photoUploadUrl = needPhoto ? `/tenant/complaints/${created.complaint.id}` : undefined;

    if (needPhoto) {
      const ticket = this.transitionTicket(
        created.ticket.id,
        "ADDITIONAL_INFO_REQUESTED",
        "roomlog-callbot",
        "콜봇 접수 후 사진 업로드 요청"
      );
      this.addMessageInternal(
        ticket.id,
        ticket.complaintId,
        "roomlog-callbot",
        "SYSTEM",
        `사진 업로드 링크 발송 대기: ${photoUploadUrl}`
      );
    }

    this.persistStore();

    const complaint = this.findComplaint(created.complaint.id);
    const ticket = this.findTicket(created.ticket.id);

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id],
      channel: "콜봇",
      summary: complaint.description,
      needPhoto,
      status: needPhoto ? "사진 업로드 링크 발송 대기" : this.displayStatus(ticket.status),
      recordingUrl: input.recordingUrl,
      photoUploadUrl,
      session: this.presentIntakeSession(session)
    };
  }

  async createRealtimeClientSecret(
    tenantId: string,
    sessionId: string,
    input: RealtimeClientSecretInput = {}
  ): Promise<RealtimeClientSecretResult> {
    const session = this.findIntakeSession(tenantId, sessionId);
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
    const transcriptionModel =
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
    const voice = input.voice || process.env.OPENAI_REALTIME_VOICE || "marin";
    const instructions = this.buildRealtimeInstructions(session, input);

    if (!process.env.OPENAI_API_KEY) {
      return {
        mode: "not_configured",
        sessionId: session.id,
        model,
        voice,
        instructions,
        warning:
          "OPENAI_API_KEY가 설정되지 않아 실제 음성 Realtime 연결은 비활성화되었습니다. 서버 환경변수에 OPENAI_API_KEY를 설정하면 WebRTC용 client secret을 발급합니다."
      };
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": this.safetyIdentifier(tenantId, session.id)
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions,
          audio: {
            input: {
              transcription: {
                model: transcriptionModel,
                language: "ko"
              },
              turn_detection: {
                type: "server_vad",
                threshold: input.purpose === "CALLBOT_INTAKE" ? 0.5 : 0.55,
                prefix_padding_ms: 300,
                silence_duration_ms: input.purpose === "CALLBOT_INTAKE" ? 650 : 750,
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new BadGatewayException(
        `OpenAI Realtime client secret 발급 실패 (${response.status})${errorText ? `: ${errorText}` : ""}`
      );
    }

    const body = (await response.json()) as {
      value?: string;
      expires_at?: number;
      session?: {
        id?: string;
        model?: string;
        instructions?: string;
        audio?: {
          output?: {
            voice?: string;
          };
        };
      };
    };
    const expiresAt = body.expires_at
      ? new Date(body.expires_at * 1000).toISOString()
      : undefined;

    return {
      mode: "openai",
      sessionId: session.id,
      openaiSessionId: body.session?.id,
      model: body.session?.model ?? model,
      voice: body.session?.audio?.output?.voice ?? voice,
      instructions: body.session?.instructions ?? instructions,
      expiresAt,
      clientSecret: body.value
        ? {
            value: body.value,
            expiresAt
          }
        : undefined
    };
  }

  async createManagerRealtimeClientSecret(
    managerId: string,
    input: RealtimeClientSecretInput = {}
  ): Promise<ManagerRealtimeClientSecretResult> {
    const sessionId = `manager-agent:${managerId}`;
    const model = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2";
    const transcriptionModel =
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";
    const voice = input.voice || process.env.OPENAI_REALTIME_VOICE || "marin";
    const instructions = this.buildManagerRealtimeInstructions(input);
    const tools = this.managerRealtimeTools();
    const commandEndpoint = "/manager/agent/realtime/command" as const;

    if (!process.env.OPENAI_API_KEY) {
      return {
        mode: "not_configured",
        sessionId,
        model,
        voice,
        instructions,
        warning:
          "OPENAI_API_KEY가 설정되지 않아 실제 관리인 Realtime 연결은 비활성화되었습니다. 서버 환경변수에 OPENAI_API_KEY를 설정하면 WebRTC용 client secret을 발급합니다.",
        tools,
        commandEndpoint
      };
    }

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": this.safetyIdentifier(managerId, sessionId)
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions,
          tools,
          tool_choice: "auto",
          audio: {
            input: {
              transcription: {
                model: transcriptionModel,
                language: "ko"
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.55,
                prefix_padding_ms: 300,
                silence_duration_ms: 750,
                create_response: true,
                interrupt_response: true
              }
            },
            output: {
              voice
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new BadGatewayException(
        `OpenAI Realtime client secret 발급 실패 (${response.status})${errorText ? `: ${errorText}` : ""}`
      );
    }

    const body = (await response.json()) as {
      value?: string;
      expires_at?: number;
      session?: {
        id?: string;
        model?: string;
        instructions?: string;
        audio?: {
          output?: {
            voice?: string;
          };
        };
      };
    };
    const expiresAt = body.expires_at
      ? new Date(body.expires_at * 1000).toISOString()
      : undefined;

    return {
      mode: "openai",
      sessionId,
      openaiSessionId: body.session?.id,
      model: body.session?.model ?? model,
      voice: body.session?.audio?.output?.voice ?? voice,
      instructions: body.session?.instructions ?? instructions,
      expiresAt,
      clientSecret: body.value
        ? {
            value: body.value,
            expiresAt
          }
        : undefined,
      tools,
      commandEndpoint
    };
  }

  async chatManagerCopilot(
    managerId: string,
    input: CopilotChatRequest = { messages: [] }
  ): Promise<CopilotChatResponse> {
    return await this.copilot.chat(managerId, input);
  }

  resolveManagerAgentPendingCommand(
    managerId: string,
    kind: NonNullable<CopilotChatResponse["pendingAction"]>["kind"],
    input: ManagerAgentCommandInput
  ) {
    if (kind === "billing.send_dunning") {
      try {
        const bill = this.findManagerAgentDunningBill(managerId, input);
        this.assertManagerDunningAllowed(bill);
        const draft = this.presentDunningDraft(bill);
        const channel = draft.channel;
        const messageText = input.body?.trim() || draft.draftText;

        return {
          status: "ready" as const,
          commandInput: {
            ...input,
            command: "billing.send_dunning",
            billId: bill.id,
            channel,
            body: messageText
          },
          summary: this.managerAgentDunningPendingSummary(managerId, bill, draft),
          dunningPreview: {
            billId: draft.billId,
            buildingName: draft.buildingName,
            unitId: draft.unitId,
            tenantName: draft.tenantName,
            billingMonth: draft.billingMonth,
            unpaidAmount: draft.unpaidAmount,
            dueDate: draft.dueDate,
            daysOverdue: draft.daysOverdue,
            channel,
            messageText,
            guard: draft.guard
          } satisfies ManagerDunningActionPreview
        };
      } catch (error) {
        return {
          status: "blocked" as const,
          domain: "billing" as const,
          summary:
            error instanceof Error
              ? error.message
              : "독촉 대상 연체 청구서를 확인하지 못했습니다. 다시 대상을 지정해주세요.",
          requiresConfirmation: true
        };
      }
    }

    const threadId = input.threadId?.trim() || this.defaultManagerMessagingThreadId(managerId);

    if (!threadId) {
      return {
        status: "blocked" as const,
        domain: "messaging" as const,
        summary: "답장을 보낼 임차인 메시지 스레드를 찾을 수 없습니다. 대상 대화를 지정해주세요.",
        requiresConfirmation: true
      };
    }

    try {
      const thread = this.getManagerMessagingThread(managerId, threadId);
      const replyBody = input.body?.trim() || input.text?.trim() || "";

      return {
        status: "ready" as const,
        commandInput: {
          ...input,
          command: "messaging.send_reply",
          threadId: thread.id,
          body: replyBody
        },
        summary: this.managerAgentMessagePendingSummary(thread)
      };
    } catch (error) {
      return {
        status: "blocked" as const,
        domain: "messaging" as const,
        summary:
          error instanceof Error
            ? `${error.message} 답장 대상을 확정하지 못했습니다.`
            : "답장 대상 메시지 스레드를 확인하지 못했습니다.",
        requiresConfirmation: true
      };
    }
  }

  async runManagerAgentCommand(
    managerId: string,
    input: ManagerAgentCommandInput
  ): Promise<ManagerAgentCommandResult> {
    const command = (input.command ?? "").trim();
    const text = input.text?.trim() ?? "";
    const body = input.body?.trim() ?? "";

    if (!command || this.managerAgentBlockedCommand(command, `${text} ${body}`)) {
      return {
        status: "blocked",
        domain: this.managerAgentDomainFor(command),
        summary:
          "허용되지 않은 명령입니다. 공지 발송·독촉·결제 확정은 관리인의 명시 확인 화면에서만 처리하고, 에이전트는 일반 소통 답장만 보낼 수 있습니다.",
        requiresConfirmation: true
      };
    }

    if (command === "ticket.query") {
      const result = this.queryManagerAssistant(managerId, {
        question: text || "미처리 티켓을 우선순위대로 알려줘"
      });

      return {
        status: "executed",
        domain: "ticket",
        summary: result.answer,
        data: result,
        navigation: {
          label: "티켓 대시보드",
          href: "/manager/ticket/dash/00"
        }
      };
    }

    if (command === "ticket.summary") {
      const scopedTickets = this.store.tickets.filter((ticket) =>
        this.canManagerAccessRoom(managerId, ticket.roomId)
      );
      const openTickets = scopedTickets.filter(
        (ticket) => !["COMPLETED", "CANCELLED"].includes(ticket.status)
      );
      const completedCount = scopedTickets.filter((ticket) => ticket.status === "COMPLETED").length;
      const urgentCount = openTickets.filter((ticket) => ticket.priority === 1).length;
      const unassignedCount = openTickets.filter((ticket) => !ticket.assignedVendorId).length;

      return {
        status: "executed",
        domain: "ticket",
        summary: `전체 티켓 ${scopedTickets.length}건 — 미처리 ${openTickets.length}건(긴급 ${urgentCount}건, 업체 미배정 ${unassignedCount}건), 완료 ${completedCount}건입니다.`,
        data: {
          total: scopedTickets.length,
          open: openTickets.length,
          completed: completedCount,
          urgent: urgentCount,
          unassigned: unassignedCount
        },
        navigation: {
          label: "티켓 대시보드",
          href: "/manager/ticket/dash/00"
        }
      };
    }

    if (command === "credit.balance") {
      if (!this.creditService) {
        return {
          status: "blocked",
          domain: "credit",
          summary: "크레딧 조회 기능이 준비되지 않았습니다. 크레딧 관리 화면에서 확인해 주세요."
        };
      }

      try {
        const account = await this.creditService.getAccount(managerId);

        return {
          status: "executed",
          domain: "credit",
          summary: `보유 크레딧은 ${account.balance.toLocaleString("ko-KR")}원입니다.`,
          data: {
            balance: account.balance,
            updatedAt: account.updatedAt
          },
          navigation: {
            label: "크레딧 관리",
            href: "/manager/vendor-mgmt/credit"
          }
        };
      } catch (error) {
        return {
          status: "blocked",
          domain: "credit",
          summary:
            error instanceof Error
              ? `크레딧 잔액을 조회하지 못했습니다. ${error.message}`
              : "크레딧 잔액을 조회하지 못했습니다. 크레딧 관리 화면에서 확인해 주세요."
        };
      }
    }

    if (command === "billing.summary") {
      const dashboard = this.getManagerBillDashboard(managerId);
      const collection = this.getManagerCollection(managerId);
      const collectionRate = Math.round(collection.collectionRate * 100);

      return {
        status: "executed",
        domain: "billing",
        summary: `이번 달 청구 ${dashboard.summary.total}건, 수납률 ${collectionRate}%, 미납 ${collection.unpaidAmount.toLocaleString("ko-KR")}원입니다.`,
        data: {
          dashboard,
          collection
        },
        navigation: {
          label: "청구 관리",
          href: "/manager/billing"
        }
      };
    }

    if (command === "billing.send_dunning") {
      try {
        const bill = this.findManagerAgentDunningBill(managerId, input);
        const draft = this.presentDunningDraft(bill);
        const channel = draft.channel;
        const messageText = body || draft.draftText;

        this.sendManagerDunning(managerId, bill.id, {
          text: messageText,
          channel
        });

        return {
          status: "executed",
          domain: "billing",
          summary: `${draft.unitId}호 ${draft.tenantName}님에게 ${channel}로 연체 독촉 메시지를 발송했습니다.`,
          data: {
            billId: draft.billId,
            unitId: draft.unitId,
            tenantName: draft.tenantName,
            channel,
            text: messageText,
            guard: draft.guard
          },
          navigation: {
            label: "연체 관리에서 확인",
            href: "/manager/billing/overdue"
          }
        };
      } catch (error) {
        return {
          status: "blocked",
          domain: "billing",
          summary:
            error instanceof Error
              ? `${error.message} 독촉 발송을 중단했습니다.`
              : "독촉 대상과 가드 상태를 확인하지 못해 발송을 중단했습니다.",
          requiresConfirmation: true
        };
      }
    }

    if (command === "messaging.list_threads") {
      const threads = this.listManagerMessagingThreads(managerId);

      return {
        status: "executed",
        domain: "messaging",
        summary: `소통 스레드 ${threads.length}건을 찾았습니다. 미확인 대화부터 확인하세요.`,
        data: {
          threads: threads.slice(0, 5)
        },
        navigation: {
          label: "소통함",
          href: "/manager/messaging/00"
        }
      };
    }

    if (command === "messaging.draft_reply") {
      const sourceText = body || text;
      const draftText =
        sourceText ||
        "문의 내용을 확인했습니다. 필요한 사진과 가능 시간을 알려주시면 다음 조치를 안내드리겠습니다.";

      return {
        status: "draft_only",
        domain: "messaging",
        summary: "관리인 확인이 필요한 답장 초안을 만들었습니다. 발송은 화면에서 직접 확인 후 진행하세요.",
        data: {
          draftText
        },
        navigation: {
          label: "소통함",
          href: "/manager/messaging/00"
        },
        requiresConfirmation: true
      };
    }

    if (command === "messaging.send_reply") {
      const replyBody = body || text;
      const threadId = input.threadId?.trim() || this.defaultManagerMessagingThreadId(managerId);

      if (!replyBody || !threadId) {
        return {
          status: "blocked",
          domain: "messaging",
          summary: "임차인에게 보낼 메시지 본문과 대상 스레드가 필요합니다.",
          requiresConfirmation: true
        };
      }

      try {
        const thread = this.addManagerMessagingThreadMessage(managerId, threadId, {
          body: replyBody,
          kind: "text"
        });

        return {
          status: "executed",
          domain: "messaging",
          summary: `${thread.unitId}호 임차인 메시지함으로 메시지를 전달했습니다.`,
          data: {
            thread
          },
          navigation: {
            label: "소통 스레드",
            href: `/manager/messaging/04?id=${encodeURIComponent(thread.id)}`
          }
        };
      } catch (error) {
        return {
          status: "blocked",
          domain: "messaging",
          summary:
            error instanceof Error
              ? error.message
              : "메시지를 보낼 수 없습니다. 대상 스레드와 발송 가능 문구를 확인해주세요.",
          requiresConfirmation: true
        };
      }
    }

    return {
      status: "blocked",
      domain: this.managerAgentDomainFor(command),
      summary:
        "허용되지 않은 명령입니다. 티켓 조회, 청구 요약, 독촉 전용 발송, 소통 목록, 답장 초안, 일반 답장 발송만 에이전트에서 실행할 수 있습니다.",
      requiresConfirmation: true
    };
  }

  async runManagerAgentCommandForRealtime(
    managerId: string,
    input: ManagerAgentCommandInput
  ): Promise<ManagerAgentCommandResult> {
    if (input.command?.trim() === "billing.send_dunning") {
      return {
        status: "blocked",
        domain: "billing",
        summary:
          "독촉은 AI 비서의 확인 카드에서 대상과 문구를 확인한 뒤 발송해 주세요.",
        requiresConfirmation: true
      };
    }

    const result = await this.runManagerAgentCommand(managerId, input);

    if (!process.env.OPENAI_API_KEY || result.status === "blocked") {
      return result;
    }

    try {
      const generatedSummary = await this.generateManagerAgentCommandReply(
        managerId,
        input,
        result
      );

      return generatedSummary ? { ...result, summary: generatedSummary } : result;
    } catch {
      return result;
    }
  }

  private async generateManagerAgentCommandReply(
    managerId: string,
    input: ManagerAgentCommandInput,
    result: ManagerAgentCommandResult
  ) {
    const model = process.env.OPENAI_MANAGER_AGENT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": this.safetyIdentifier(managerId, input.command || result.domain)
      },
      body: JSON.stringify({
        model,
        instructions: this.managerAgentReplyInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(
                  {
                    userRequest: input.text || input.body || "",
                    command: input.command,
                    commandStatus: result.status,
                    domain: result.domain,
                    deterministicSummary: result.summary,
                    requiresConfirmation: result.requiresConfirmation ?? false,
                    navigation: result.navigation,
                    data: this.managerAgentReplyData(result)
                  },
                  null,
                  2
                )
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI manager agent response failed with ${response.status}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return this.cleanManagerAgentReplyText(this.extractOpenAiResponseText(payload));
  }

  private managerAgentReplyInstructions() {
    return [
      "당신은 Roomlog 관리인 실시간 AI 운영 에이전트입니다.",
      "사용자의 요청과 서버가 조회/실행한 command 결과 JSON만 근거로 답하세요.",
      "제공되지 않은 호수, 금액, 상태, 메시지 대상, 발송 결과를 추측하지 마세요.",
      "질문이 특정 항목을 묻는다면 전체 요약 대신 해당 항목을 우선 답하세요. 예: 미납 호수와 금액을 물으면 unitId와 unpaidAmount를 열거합니다.",
      "청구 요약에서 현재월 미납을 묻는 경우 currentMonthUnpaidBills만 열거하고 collection.unpaidAmount와 합계가 맞는지 확인하세요.",
      "실행 결과가 발송 또는 mutation이면 실행 여부와 대상만 간결히 말하고, 필요한 확인 화면은 navigation.label로 안내합니다.",
      "blocked 또는 requiresConfirmation이면 자동 처리하지 말고 확인이 필요한 이유를 말하세요.",
      "한국어로 1~3문장, 필요하면 짧은 줄바꿈 목록으로 답하세요."
    ].join("\n");
  }

  private managerAgentReplyData(result: ManagerAgentCommandResult) {
    const data = result.data as Record<string, unknown> | undefined;

    if (!data) {
      return undefined;
    }

    if (result.domain === "billing") {
      const dashboard = data.dashboard as { summary?: unknown; bills?: TeamBillRow[] } | undefined;
      const collection = data.collection as TeamCollection | undefined;
      const bills = (Array.isArray(dashboard?.bills) ? dashboard.bills : []).map((bill) => ({
        billId: bill.billId,
        unitId: bill.unitId,
        tenantName: bill.tenantName,
        billingMonth: bill.billingMonth,
        status: bill.status,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        unpaidAmount: Math.max(0, bill.totalAmount - bill.paidAmount),
        dueDate: bill.dueDate
      }));
      const currentMonthBills = collection?.billingMonth
        ? bills.filter((bill) => bill.billingMonth === collection.billingMonth)
        : bills;
      const currentMonthUnpaidBills = currentMonthBills.filter((bill) => bill.unpaidAmount > 0);

      return {
        dashboard: {
          summary: dashboard?.summary
        },
        collection,
        currentMonthBills,
        currentMonthUnpaidBills,
        omittedOtherMonthBillCount: Math.max(0, bills.length - currentMonthBills.length)
      };
    }

    if (result.domain === "ticket") {
      const matchedTickets = Array.isArray(data.matchedTickets) ? data.matchedTickets : [];

      return {
        answer: data.answer,
        filters: data.filters,
        nextActions: data.nextActions,
        matchedTickets: matchedTickets.slice(0, 10)
      };
    }

    if (result.domain === "messaging") {
      const thread = data.thread as MessagingThread | undefined;

      return thread
        ? {
            thread: {
              id: thread.id,
              unitId: thread.unitId,
              context: thread.context,
              contextRef: thread.contextRef,
              lastMessage: thread.lastMessage,
              unreadCount: thread.unreadCount
            }
          }
        : data;
    }

    return data;
  }

  private cleanManagerAgentReplyText(text: string) {
    const cleaned = text
      .replace(/```(?:json|text)?/gi, "")
      .replace(/```/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned.slice(0, 1200);
  }

  private managerAgentDunningPendingSummary(
    managerId: string,
    bill: Bill,
    draft: TeamDunning
  ) {
    const room = this.store.rooms.find(
      (item) => item.landlordId === managerId && this.unitMatchesRoom(bill.unitId, item)
    );
    const locationLabel = this.managerAgentLocationLabel(room, draft.unitId);
    const tenantName = draft.tenantName === "미연결 임차인" ? undefined : draft.tenantName;
    const targetLabel =
      tenantName && locationLabel
        ? `${tenantName}(${locationLabel})`
        : tenantName ?? locationLabel ?? `${draft.billId} 청구`;
    const billingMonthLabel = this.managerAgentBillingMonthLabel(bill.billingMonth);
    const billLabel = billingMonthLabel ? `${billingMonthLabel}분 청구` : "청구";

    return `${targetLabel} ${billLabel}에 독촉 발송`;
  }

  private managerAgentMessagePendingSummary(thread: MessagingThread) {
    const room = this.store.rooms.find((item) => item.id === thread.roomId);
    const locationLabel = this.managerAgentLocationLabel(room, thread.unitId);
    const tenantName = this.store.users.find((user) => user.id === thread.tenantId)?.name;
    const targetLabel =
      tenantName && locationLabel
        ? `${tenantName}(${locationLabel})`
        : tenantName ?? locationLabel ?? `${thread.id} 스레드`;
    const contextLabel = thread.contextLabel?.trim()
      ? `${thread.contextLabel.trim()} 스레드`
      : "메시지 스레드";

    return `${targetLabel} ${contextLabel}에 답장 발송`;
  }

  private managerAgentLocationLabel(room: Room | undefined, unitId?: string) {
    const normalizedUnitId = (room ? this.displayUnitId(room) : unitId?.replace(/호$/u, "").trim()) || undefined;
    const unitLabel = normalizedUnitId ? `${normalizedUnitId}호` : undefined;

    return [room?.buildingName, unitLabel].filter(Boolean).join(" ") || undefined;
  }

  private managerAgentBillingMonthLabel(billingMonth?: string) {
    const match = billingMonth?.match(/^\d{4}-(\d{2})$/u);

    if (match) {
      return `${Number(match[1])}월`;
    }

    return billingMonth?.trim() || undefined;
  }

  private defaultManagerMessagingThreadId(managerId: string) {
    return this.listManagerMessagingThreads(managerId)[0]?.id;
  }

  private findManagerAgentDunningBill(managerId: string, input: ManagerAgentCommandInput) {
    const explicitBillId = input.billId?.trim();

    if (explicitBillId) {
      return this.findManagerBill(managerId, explicitBillId);
    }

    const requestText = `${input.text ?? ""} ${input.body ?? ""}`.trim();
    const unitId = this.extractUnitIdFromAgentText(requestText);
    const billingMonth = this.extractBillingMonthFromAgentText(requestText);
    const candidates = this.managerBills(managerId)
      .filter((bill) => this.canAutoOverdue(bill))
      .sort((left, right) => this.daysOverdueForBill(right) - this.daysOverdueForBill(left));
    let matched = candidates;

    if (unitId) {
      matched = matched.filter((bill) => this.unitsEqual(bill.unitId, unitId));
    } else {
      const tenantMatches = matched.filter((bill) => requestText.includes(this.tenantNameForBill(bill)));
      if (tenantMatches.length) matched = tenantMatches;
    }

    if (billingMonth) {
      matched = matched.filter((bill) => bill.billingMonth === billingMonth);
    }

    if (matched.length === 1) {
      return matched[0];
    }

    if (matched.length > 1) {
      const choices = matched
        .slice(0, 4)
        .map(
          (bill) =>
            `${this.tenantNameForBill(bill)} ${bill.unitId}호 ${this.managerAgentBillingMonthLabel(bill.billingMonth)}분`
        )
        .join(", ");
      throw new BadRequestException(
        `독촉 대상이 여러 건입니다: ${choices}. 호실과 청구월을 함께 지정해 주세요.`
      );
    }

    if (unitId || billingMonth) {
      throw new BadRequestException("지정한 호실과 청구월에 맞는 연체 청구서를 찾을 수 없습니다.");
    }

    throw new BadRequestException("독촉 대상 연체 청구서를 찾을 수 없습니다.");
  }

  private extractUnitIdFromAgentText(text: string) {
    return text.match(/([0-9]{1,4})\s*호/u)?.[1];
  }

  private extractBillingMonthFromAgentText(text: string) {
    const full = text.match(/(20\d{2})[년.\-/\s]+(1[0-2]|0?[1-9])\s*월?/u);
    if (full) return `${full[1]}-${String(Number(full[2])).padStart(2, "0")}`;

    const monthOnly = text.match(/(?:^|\s)(1[0-2]|0?[1-9])\s*월(?:분)?/u);
    if (!monthOnly) return undefined;

    const year = this.todayInSeoul().slice(0, 4);
    return `${year}-${String(Number(monthOnly[1])).padStart(2, "0")}`;
  }

  private createComplaintRecord(
    tenantId: string,
    roomId: string,
    sourceChannel: ComplaintSourceChannel,
    input: CreateComplaintInput,
    analysis: AiAnalysis,
    initialMessages: {
      senderUserId: string;
      senderRole: TicketMessage["senderRole"];
      messageText: string;
      attachmentUrls?: string[];
    }[],
    ticketResponsibilityHint: Ticket["responsibilityHint"] =
      analysis.responsibilityHint,
    onCreated?: (ids: {
      complaintId: string;
      ticketId: string;
      historyIds: string[];
      messageIds: string[];
    }) => void
  ) {
    const createdAt = now();
    const complaintId = id("cmp");
    const ticketId = id("tkt");
    const complaint: Complaint = {
      id: complaintId,
      tenantId,
      roomId,
      ticketId,
      sourceChannel,
      clientRequestId: input.clientRequestId,
      requestFingerprint: input.clientRequestId
        ? this.complaintRequestFingerprint(roomId, input)
        : undefined,
      title: input.title,
      description: input.description,
      location: input.location,
      occurredAt: input.occurredAt,
      availableTimes: input.availableTimes,
      status: "SUBMITTED",
      createdAt,
      updatedAt: createdAt
    };
    const ticket: Ticket = {
      id: ticketId,
      complaintId,
      tenantId,
      roomId,
      sourceChannel,
      category: analysis.category,
      priority: analysis.priority,
      status: "RECEIVED",
      responsibilityHint: ticketResponsibilityHint,
      aiSummary: analysis.summary,
      dueAt: priorityDueAt(analysis.priority),
      createdAt,
      updatedAt: createdAt
    };

    this.store.complaints.unshift(complaint);
    this.store.tickets.unshift(ticket);
    this.store.analyses[ticket.id] = analysis;
    const initialHistory = this.pushHistory(
      ticket.id,
      "system",
      undefined,
      "RECEIVED",
      sourceChannel === "MANAGER_PROXY" ? "관리자 대리 접수" : "임차인 신고 접수"
    );
    const createdMessages: TicketMessage[] = [];
    for (const message of initialMessages) {
      createdMessages.push(
        this.addMessageInternal(
          ticket.id,
          complaint.id,
          message.senderUserId,
          message.senderRole,
          message.messageText,
          message.attachmentUrls
        )
      );
    }
    onCreated?.({
      complaintId,
      ticketId,
      historyIds: [initialHistory.id],
      messageIds: createdMessages.map((message) => message.id)
    });
    this.persistStore();

    return {
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis
    };
  }

  private rollbackComplaintRecord(ids: ComplaintAggregateIds) {
    this.removeStoreRecordById(this.store.complaints, ids.complaintId);
    this.removeStoreRecordById(this.store.tickets, ids.ticketId);
    delete this.store.analyses[ids.ticketId];
    for (const historyId of ids.historyIds) {
      this.removeStoreRecordById(this.store.history, historyId);
    }
    for (const messageId of ids.messageIds) {
      this.removeStoreRecordById(this.store.messages, messageId);
    }
  }

  private removeStoreRecordById<T extends { id: string }>(records: T[], recordId: string) {
    const index = records.findIndex((record) => record.id === recordId);
    if (index >= 0) records.splice(index, 1);
  }

  listTenantComplaints(tenantId: string) {
    return this.store.complaints
      .filter((complaint) => complaint.tenantId === tenantId)
      .map((complaint) => this.presentComplaint(complaint));
  }

  getComplaint(complaintId: string) {
    return this.store.complaints.find((complaint) => complaint.id === complaintId);
  }

  getComplaintDetail(tenantId: string, complaintId: string) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    return this.presentComplaint(complaint);
  }

  async synchronizeTenantVendorRequest(
    input: TenantVendorWorkflowAuthority
  ): Promise<void> {
    const complaint = this.store.complaints.find(
      (item) => item.id === input.complaintId && item.tenantId === input.tenantId
    );
    const ticket = this.store.tickets.find(
      (item) =>
        item.id === input.ticketId &&
        item.complaintId === input.complaintId &&
        item.tenantId === input.tenantId
    );
    if (!complaint || !ticket || complaint.ticketId !== ticket.id) {
      throw new ConflictException(
        "업체 접수 결과를 현재 하자 접수 정보와 동기화할 수 없습니다."
      );
    }

    let storeChanged = false;
    const activeRepair = input.activeRepair;
    for (const repair of this.store.repairs) {
      if (
        repair.ticketId === ticket.id &&
        repair.id !== activeRepair?.id &&
        !["COMPLETED", "CANCELLED"].includes(repair.status)
      ) {
        repair.status = "CANCELLED";
        repair.updatedAt = input.ticketUpdatedAt;
        storeChanged = true;
      }
    }

    if (activeRepair) {
      const sameRepair = this.store.repairs.find(
        (item) => item.id === activeRepair.id
      );
      if (
        sameRepair &&
        (sameRepair.ticketId !== ticket.id ||
          sameRepair.vendorId !== activeRepair.vendorId)
      ) {
        throw new ConflictException(
          "동일한 수리 요청 식별자가 다른 접수에 사용되었습니다."
        );
      }
      if (!sameRepair) {
        const repair: RepairRequest = {
          id: activeRepair.id,
          ticketId: ticket.id,
          vendorId: activeRepair.vendorId,
          status: activeRepair.status,
          tenantInitiated: activeRepair.tenantInitiated,
          title: activeRepair.title,
          description: activeRepair.description,
          ...(activeRepair.costBearer
            ? { costBearer: activeRepair.costBearer }
            : {}),
          completionPhotoUrls: [...activeRepair.completionPhotoUrls],
          createdAt: activeRepair.createdAt,
          updatedAt: activeRepair.updatedAt
        };
        this.store.repairs.unshift(repair);
        storeChanged = true;
      } else {
        const nextPhotoUrls = [...activeRepair.completionPhotoUrls];
        if (
          sameRepair.status !== activeRepair.status ||
          sameRepair.tenantInitiated !== activeRepair.tenantInitiated ||
          sameRepair.title !== activeRepair.title ||
          sameRepair.description !== activeRepair.description ||
          sameRepair.costBearer !== activeRepair.costBearer ||
          JSON.stringify(sameRepair.completionPhotoUrls) !==
            JSON.stringify(nextPhotoUrls) ||
          sameRepair.updatedAt !== activeRepair.updatedAt
        ) {
          sameRepair.status = activeRepair.status;
          sameRepair.tenantInitiated = activeRepair.tenantInitiated;
          sameRepair.title = activeRepair.title;
          sameRepair.description = activeRepair.description;
          sameRepair.costBearer = activeRepair.costBearer;
          sameRepair.completionPhotoUrls = nextPhotoUrls;
          sameRepair.updatedAt = activeRepair.updatedAt;
          storeChanged = true;
        }
      }
    }

    if (
      ticket.assignedVendorId !== input.assignedVendorId ||
      ticket.status !== input.ticketStatus ||
      ticket.updatedAt !== input.ticketUpdatedAt
    ) {
      ticket.assignedVendorId = input.assignedVendorId;
      ticket.status = input.ticketStatus;
      ticket.updatedAt = input.ticketUpdatedAt;
      storeChanged = true;
    }
    if (
      complaint.status !== input.complaintStatus ||
      complaint.updatedAt !== input.complaintUpdatedAt
    ) {
      complaint.status = input.complaintStatus;
      complaint.updatedAt = input.complaintUpdatedAt;
      storeChanged = true;
    }
    if (storeChanged) {
      this.persistStore();
    }

    await this.ensurePersistenceDurability();
  }

  listTickets() {
    return this.store.tickets.map((ticket) => this.presentTicket(ticket));
  }

  private async currentManagerReadStore() {
    if (!this.storeProjector?.load) return this.store;

    // projectStore()는 Postgres 반영을 큐에 걸고 바로 리턴한다. 그 직후 여기서 DB를 읽으면
    // 방금 쓴 메시지·상태가 아직 없어 화면이 "한 박자 밀린다"(관리인 대화·레인 토글 증상).
    // 밀린 쓰기를 먼저 흘려보내고 읽는다. 실패해도 읽기는 막지 않는다 — 그건 쓰기 경로의 책임.
    await this.pendingPersistence.catch(() => undefined);

    return (await this.storeProjector.load()) ?? createEmptyStore();
  }

  listTicketsForManager(managerId: string, sourceStore: Store = this.store) {
    return sourceStore.tickets
      .filter((ticket) => this.canManagerAccessRoom(managerId, ticket.roomId, sourceStore))
      .map((ticket) => this.presentTicketForManager(managerId, ticket, sourceStore));
  }

  async listCurrentTicketsForManager(managerId: string) {
    return this.listTicketsForManager(managerId, await this.currentManagerReadStore());
  }

  queryManagerAssistant(
    managerId: string,
    input: ManagerAssistantQueryInput
  ): ManagerAssistantQueryResult {
    const question = input.question?.trim();

    if (!question) {
      throw new BadRequestException("운영 질의 질문을 입력해주세요.");
    }

    const scopedTickets = this.store.tickets.filter((ticket) =>
      this.canManagerAccessRoom(managerId, ticket.roomId)
    );
    let matches = [...scopedTickets];
    const filters: string[] = [];
    const normalizedQuestion = question.replace(/\s+/g, " ");

    if (/대리\s*접수|관리자\s*대리/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.sourceChannel === "MANAGER_PROXY");
      filters.push("접수 채널: 관리자 대리 접수");
    } else if (/콜봇/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.sourceChannel === "CALLBOT");
      filters.push("접수 채널: 콜봇");
    } else if (/음성/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.sourceChannel === "VOICE_CHAT");
      filters.push("접수 채널: 음성 챗봇");
    } else if (/챗봇|채팅|리얼타임|실시간/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) =>
        ["REALTIME_CHAT", "VOICE_CHAT"].includes(ticket.sourceChannel)
      );
      filters.push("접수 채널: 챗봇");
    }

    if (/미처리|처리 안|완료 안|아직|대기/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => !["COMPLETED", "CANCELLED"].includes(ticket.status));
      filters.push("상태: 미처리");
    }

    if (/긴급|1순위|P1|긴급도\s*1/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.priority === 1);
      filters.push("긴급도: 1순위");
    }

    if (/업체.*(안|미배정|없)|배정 안|아직 업체/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => !ticket.assignedVendorId);
      filters.push("업체 배정: 미배정");
    }

    if (/추가\s*정보|추가정보|추가\s*사진|추가\s*설명/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => ticket.status === "ADDITIONAL_INFO_REQUESTED");
      filters.push("상태: 추가정보 요청");
    }

    if (/사진/.test(normalizedQuestion) && /없|안|미첨부|필요|아직|대기/.test(normalizedQuestion)) {
      matches = matches.filter((ticket) => this.ticketNeedsPhotoForManagerAssistant(ticket));
      filters.push("사진: 미첨부 또는 추가 필요");
    }

    const roomMatch = normalizedQuestion.match(/(\d{3,4})\s*호/);
    if (roomMatch) {
      const roomNo = `${roomMatch[1]}호`;
      matches = matches.filter((ticket) => {
        const room = this.store.rooms.find((item) => item.id === ticket.roomId);

        return room?.roomNo.includes(roomNo) ?? false;
      });
      filters.push(`호실: ${roomNo}`);
    }

    for (const keyword of this.managerAssistantTicketKeywordFilters(normalizedQuestion)) {
      matches = matches.filter((ticket) =>
        this.managerAssistantTicketMatchesKeyword(ticket, keyword.aliases)
      );
      filters.push(`키워드: ${keyword.label}`);
    }

    if (/이번 주/.test(normalizedQuestion)) {
      const startOfWeek = new Date();
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      matches = matches.filter((ticket) => new Date(ticket.createdAt) >= startOfWeek);
      filters.push("기간: 이번 주");
    } else if (/이번 달/.test(normalizedQuestion)) {
      const startOfMonth = new Date();
      startOfMonth.setHours(0, 0, 0, 0);
      startOfMonth.setDate(1);
      matches = matches.filter((ticket) => new Date(ticket.createdAt) >= startOfMonth);
      filters.push("기간: 이번 달");
    }

    if (filters.length === 0) {
      if (/전체|총|모든|전부/.test(normalizedQuestion)) {
        filters.push("범위: 전체");
      } else {
        matches = matches.filter((ticket) => !["COMPLETED", "CANCELLED"].includes(ticket.status));
        filters.push("상태: 미처리");
      }
    }

    matches.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    const matchedTickets = matches.map((ticket) => this.presentManagerAssistantTicket(ticket));

    return {
      question,
      answer: this.composeManagerAssistantAnswer(question, filters, matchedTickets),
      scope: `관리자 접근 가능 티켓 ${scopedTickets.length}건 기준`,
      filters,
      matchedTickets,
      nextActions: this.managerAssistantNextActions(matchedTickets, filters),
      generatedAt: now()
    };
  }

  getTicket(ticketId: string) {
    return this.store.tickets.find((ticket) => ticket.id === ticketId);
  }

  getTicketDetail(ticketId: string) {
    const ticket = this.findTicket(ticketId);

    return this.presentTicket(ticket);
  }

  getTicketDetailForManager(
    managerId: string,
    ticketId: string,
    sourceStore: Store = this.store
  ) {
    const ticket = this.findTicket(ticketId, sourceStore);
    this.assertManagerCanAccessTicket(managerId, ticket, sourceStore);

    const detail = this.presentTicketForManager(managerId, ticket, sourceStore, {
      includeDetail: true
    });

    return {
      ...detail,
      messages: detail.messages ?? []
    };
  }

  async getCurrentTicketDetailForManager(managerId: string, ticketId: string) {
    return this.getTicketDetailForManager(
      managerId,
      ticketId,
      await this.currentManagerReadStore()
    );
  }

  markManagerTicketRead(managerId: string, ticketId: string) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const reads =
      this.store.managerTicketReads ??
      (this.store.managerTicketReads = []);
    const readAt = now();
    const existing = reads.find(
      (read) => read.managerId === managerId && read.ticketId === ticketId,
    );

    if (existing) {
      existing.readAt = readAt;
    } else {
      reads.push({ managerId, ticketId, readAt });
    }

    this.persistStore();
    return this.presentTicketForManager(managerId, ticket);
  }

  getTenantRoomTimeline(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("연결된 호실을 찾을 수 없습니다.");
    }

    return this.presentRoomTimeline(roomId, { tenantId });
  }

  getManagerRoomTimeline(managerId: string, roomId: string) {
    this.assertManagerCanAccessRoom(managerId, roomId);

    return this.presentRoomTimeline(roomId);
  }

  updateTicket(managerId: string, ticketId: string, input: Partial<Pick<Ticket, "category" | "priority" | "responsibilityHint" | "aiSummary">>) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    if (input.responsibilityHint !== undefined) {
      if (!this.isResponsibilityHint(input.responsibilityHint)) {
        throw new BadRequestException("책임 가능성 값이 올바르지 않습니다.");
      }

      const analysis = this.store.analyses[ticket.id];
      if (!analysis) {
        throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
      }
      analysis.responsibilityHint = input.responsibilityHint;
    }

    Object.assign(ticket, input, { updatedAt: now() });
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", "AI 분석 값을 검토했습니다.");
    this.persistStore();

    return this.presentTicket(ticket);
  }

  decideTicketResponsibility(
    managerId: string,
    ticketId: string,
    input: DecideTicketResponsibilityInput
  ) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    if (!(["TENANT", "LANDLORD"] as const).includes(input.responsibility as never)) {
      throw new BadRequestException("책임 주체를 선택해주세요.");
    }

    const note = input.note?.trim() ?? "";
    if (!note) {
      throw new BadRequestException("세입자에게 보이는 책임 판단 사유를 입력해주세요.");
    }

    const analysis = this.store.analyses[ticket.id];
    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    const decidedAt = now();
    const responsibilityLabel = input.responsibility === "TENANT" ? "임차인" : "임대인";
    const responsibilityHint: AiAnalysis["responsibilityHint"] =
      input.responsibility === "TENANT" ? "임차인 책임 가능성" : "임대인 책임 가능성";

    ticket.responsibilityHint = responsibilityHint;
    ticket.responsibilityDecidedById = managerId;
    ticket.responsibilityDecidedAt = decidedAt;
    ticket.responsibilityDecisionNote = note;
    ticket.updatedAt = decidedAt;
    analysis.responsibilityHint = responsibilityHint;
    analysis.reasons = Array.from(
      new Set([...(analysis.reasons ?? []), `관리자 책임 판단 확정: ${responsibilityLabel} 책임`])
    );

    for (const feedback of this.store.aiFeedback.filter(
      (item) =>
        item.ticketId === ticket.id &&
        item.target === "RESPONSIBILITY" &&
        item.status === "OPEN"
    )) {
      feedback.status = "REVIEWED";
      feedback.managerReviewNote = note;
      feedback.correctedValue = `관리자 확정: ${responsibilityLabel} 책임`;
      feedback.reviewedByUserId = managerId;
      feedback.reviewedAt = decidedAt;
      feedback.updatedAt = decidedAt;
    }

    const complaint = this.findComplaint(ticket.complaintId);
    complaint.updatedAt = decidedAt;
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      `책임 판단 확정: ${responsibilityLabel} 책임 — ${note}`
    );
    this.persistStore();

    return this.presentTicket(ticket);
  }

  reviewTenantAiFeedback(
    managerId: string,
    ticketId: string,
    feedbackId: string,
    input: ReviewTenantAiFeedbackInput
  ) {
    let ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const feedback = this.store.aiFeedback.find(
      (item) => item.id === feedbackId && item.ticketId === ticket.id
    );

    if (!feedback) {
      throw new NotFoundException("AI 이의제기를 찾을 수 없습니다.");
    }

    const managerReviewNote = input.managerReviewNote?.trim() ?? "";

    if (!managerReviewNote) {
      throw new BadRequestException("관리자 검토 결과를 입력해주세요.");
    }

    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    const correctedParts: string[] = [];
    const correctedSummary = input.correctedSummary?.trim();
    const correctedCategory = input.correctedCategory?.trim();
    const correctedDetailCategory = input.correctedDetailCategory?.trim();

    if (correctedSummary) {
      analysis.summary = correctedSummary;
      ticket.aiSummary = correctedSummary;
      correctedParts.push(`요약: ${correctedSummary}`);
    }

    if (correctedCategory) {
      analysis.category = correctedCategory;
      ticket.category = correctedCategory;
      correctedParts.push(
        `유형: ${correctedCategory}${correctedDetailCategory ? ` / ${correctedDetailCategory}` : ""}`
      );
    }

    if (correctedDetailCategory) {
      analysis.detailCategory = correctedDetailCategory;
    }

    if (input.correctedPriority !== undefined) {
      const priority = input.correctedPriority;

      if (![1, 2, 3, 4].includes(priority)) {
        throw new BadRequestException("긴급도는 1부터 4 사이로 입력해주세요.");
      }

      analysis.priority = priority;
      ticket.priority = priority;
      ticket.dueAt = priorityDueAt(priority);
      correctedParts.push(`긴급도: P${priority} ${priorityLabelForAnalysis(priority)}`);
    }

    if (input.correctedResponsibilityHint !== undefined) {
      if (!this.isResponsibilityHint(input.correctedResponsibilityHint)) {
        throw new BadRequestException("책임 가능성 값이 올바르지 않습니다.");
      }

      analysis.responsibilityHint = input.correctedResponsibilityHint;
      ticket.responsibilityHint = input.correctedResponsibilityHint;
      correctedParts.push(`책임 가능성: ${input.correctedResponsibilityHint}`);
    }

    if (input.ticketStatus && input.ticketStatus !== ticket.status) {
      ticket = this.transitionTicket(
        ticket.id,
        input.ticketStatus,
        managerId,
        "AI 이의제기 검토 결과 상태 변경"
      );
    } else {
      const complaint = this.findComplaint(ticket.complaintId);
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    const reviewedAt = now();
    const reasons = new Set(analysis.reasons ?? []);
    reasons.add(`관리자가 ${feedback.targetLabel} 이의제기를 검토함`);
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction = `이의제기 검토 결과를 반영했습니다. ${managerReviewNote}`;
    feedback.status = "REVIEWED";
    feedback.managerReviewNote = managerReviewNote;
    feedback.correctedValue = correctedParts.length
      ? correctedParts.join(" · ")
      : `검토 의견: ${managerReviewNote}`;
    feedback.reviewedByUserId = managerId;
    feedback.reviewedAt = reviewedAt;
    feedback.updatedAt = reviewedAt;

    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      [
        `AI 이의제기 검토 결과: ${managerReviewNote}`,
        feedback.correctedValue ? `반영 내용: ${feedback.correctedValue}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    );
    this.persistStore();

    return this.presentTicket(ticket);
  }

  requestAdditionalInfo(managerId: string, ticketId: string, messageText: string) {
    this.assertManagerCanAccessTicket(managerId, this.findTicket(ticketId));
    const ticket = this.transitionTicket(
      ticketId,
      "ADDITIONAL_INFO_REQUESTED",
      managerId,
      "추가 정보 요청"
    );
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", messageText);
    this.persistStore();

    return this.presentTicket(ticket);
  }

  async startDirectHandling(
    managerId: string,
    ticketId: string,
    input: StartDirectHandlingInput = {}
  ) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("직접 처리 요청 형식이 올바르지 않습니다.");
    }
    if (input.note !== undefined && typeof input.note !== "string") {
      throw new BadRequestException("직접 처리 메모 형식이 올바르지 않습니다.");
    }
    const note = input.note?.trim();
    const persistence = this.directHandlingPersistence();
    if (persistence) {
      await this.ensurePersistenceDurability();
      let result: DirectHandlingMutationResult;
      try {
        result = await persistence.startDirectHandling({
          managerId,
          ticketId,
          ...(note ? { note } : {}),
          occurredAt: now()
        });
      } catch (error) {
        this.rethrowDirectHandlingPersistenceError(error);
      }
      this.reconcileDirectHandlingResult(result);
      return this.presentTicket(this.findTicket(ticketId));
    }

    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    if (ticket.directHandlingStartedAt && !ticket.directHandlingCompletedAt) {
      throw new ConflictException("이미 관리자 직접 처리가 진행 중입니다.");
    }

    const activeRepair = this.store.repairs.find(
      (repair) =>
        repair.ticketId === ticket.id &&
        !["COMPLETED", "CANCELLED"].includes(repair.status)
    );
    if (activeRepair) {
      throw new ConflictException(
        "활성 수리가 진행 중인 티켓은 관리자 직접 처리를 시작할 수 없습니다."
      );
    }

    this.assertTicketStatus(
      ticket.id,
      [
        "RECEIVED",
        "REVIEWING",
        "ADDITIONAL_INFO_REQUESTED",
        "VENDOR_ASSIGNMENT_PENDING",
        "REOPENED"
      ],
      "관리자 직접 처리 시작"
    );

    const startedAt = now();
    ticket.directHandlingStartedAt = startedAt;
    ticket.directHandlingCompletedAt = undefined;
    ticket.directHandlingNote = note || undefined;
    const transitioned = this.transitionTicket(
      ticket.id,
      "REPAIR_IN_PROGRESS",
      managerId,
      "관리자 직접 처리 시작"
    );
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      note
        ? `관리자가 직접 처리를 시작했습니다 — ${note}`
        : "관리자가 직접 처리를 시작했습니다."
    );
    this.persistStore();
    await this.ensurePersistenceDurability();

    return this.presentTicket(transitioned);
  }

  async completeDirectHandling(
    managerId: string,
    ticketId: string,
    input: CompleteDirectHandlingInput
  ) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("직접 처리 완료 요청 형식이 올바르지 않습니다.");
    }
    const note = typeof input?.note === "string" ? input.note.trim() : "";

    if (!note) {
      throw new BadRequestException("직접 처리 완료 내용을 입력해주세요.");
    }

    let costInput: CompleteDirectHandlingInput["cost"];
    if (input.cost !== undefined) {
      const rawCost = input.cost as unknown;
      if (
        !isPlainRecord(rawCost)
        || !Object.prototype.hasOwnProperty.call(rawCost, "amount")
      ) {
        throw new BadRequestException("직접 처리 비용은 금액을 포함한 객체로 입력해주세요.");
      }
      if (
        !Number.isSafeInteger(rawCost.amount) ||
        (rawCost.amount as number) <= 0 ||
        (rawCost.amount as number) > 2_147_483_647
      ) {
        throw new BadRequestException(
          "직접 처리 비용 금액은 PostgreSQL 정수 범위의 양의 안전 정수로 입력해주세요."
        );
      }
      if (rawCost.item !== undefined && typeof rawCost.item !== "string") {
        throw new BadRequestException("직접 처리 비용 항목 형식이 올바르지 않습니다.");
      }
      costInput = rawCost as CompleteDirectHandlingInput["cost"];
    }

    const persistence = this.directHandlingPersistence();
    if (persistence) {
      await this.ensurePersistenceDurability();
      let result: DirectHandlingMutationResult;
      try {
        result = await persistence.completeDirectHandling({
          managerId,
          ticketId,
          note,
          occurredAt: now(),
          ...(costInput
            ? {
                cost: {
                  amount: costInput.amount,
                  ...(costInput.item?.trim() ? { item: costInput.item.trim() } : {})
                }
              }
            : {})
        });
      } catch (error) {
        this.rethrowDirectHandlingPersistenceError(error);
      }
      this.reconcileDirectHandlingResult(result);
      return this.presentTicket(this.findTicket(ticketId));
    }

    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    if (!ticket.directHandlingStartedAt || ticket.directHandlingCompletedAt) {
      throw new BadRequestException("직접 처리 중인 티켓만 완료를 보고할 수 있습니다.");
    }
    this.assertTicketStatus(
      ticket.id,
      ["REPAIR_IN_PROGRESS"],
      "관리자 직접 처리 완료 보고"
    );

    const completedAt = now();
    ticket.directHandlingCompletedAt = completedAt;
    const transitioned = this.transitionTicket(
      ticket.id,
      "COMPLETION_REPORTED",
      managerId,
      "관리자 직접 처리 완료 보고"
    );
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      `관리자가 처리 완료를 보고했습니다 — 확인해 주세요. ${note}`
    );

    if (costInput) {
      const item = costInput.item?.trim() || `직접 처리 · ${ticket.category}`;
      const cost: Cost = {
        id: id("cost"),
        managerId,
        date: completedAt,
        item,
        amount: costInput.amount,
        type: "repair",
        scope: "unit",
        unitId: ticket.roomId,
        status: "draft",
        verified: false,
        createdAt: completedAt,
        updatedAt: completedAt
      };
      this.store.costs.unshift(cost);
    }

    this.persistStore();
    await this.ensurePersistenceDurability();
    return this.presentTicket(transitioned);
  }

  async cancelDirectHandling(
    managerId: string,
    ticketId: string,
    input: CancelDirectHandlingInput
  ) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("직접 처리 취소 요청 형식이 올바르지 않습니다.");
    }
    const reason = typeof input?.reason === "string" ? input.reason.trim() : "";

    if (!reason) {
      throw new BadRequestException("직접 처리 취소 사유를 입력해주세요.");
    }

    const persistence = this.directHandlingPersistence();
    if (persistence) {
      await this.ensurePersistenceDurability();
      let result: DirectHandlingMutationResult;
      try {
        result = await persistence.cancelDirectHandling({
          managerId,
          ticketId,
          reason,
          occurredAt: now()
        });
      } catch (error) {
        this.rethrowDirectHandlingPersistenceError(error);
      }
      this.reconcileDirectHandlingResult(result);
      return this.presentTicket(this.findTicket(ticketId));
    }

    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    if (!ticket.directHandlingStartedAt || ticket.directHandlingCompletedAt) {
      throw new BadRequestException("완료 보고 전 직접 처리만 취소할 수 있습니다.");
    }
    this.assertTicketStatus(
      ticket.id,
      ["REPAIR_IN_PROGRESS"],
      "관리자 직접 처리 취소"
    );

    ticket.directHandlingStartedAt = undefined;
    ticket.directHandlingCompletedAt = undefined;
    ticket.directHandlingNote = undefined;
    const transitioned = this.transitionTicket(
      ticket.id,
      "REVIEWING",
      managerId,
      "관리자 직접 처리 취소"
    );
    this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      `직접 처리를 취소했습니다 — ${reason}`
    );
    this.persistStore();
    await this.ensurePersistenceDurability();

    return this.presentTicket(transitioned);
  }

  private directHandlingPersistence(): DirectHandlingPersistence | undefined {
    const candidate = this.storeProjector;
    if (
      candidate?.startDirectHandling &&
      candidate.completeDirectHandling &&
      candidate.cancelDirectHandling
    ) {
      return candidate as DirectHandlingPersistence;
    }
    return undefined;
  }

  private reconcileDirectHandlingResult(result: DirectHandlingMutationResult) {
    this.upsertStoreRecord(this.store.tickets, result.ticket);
    this.upsertStoreRecord(this.store.complaints, result.complaint);
    this.upsertStoreRecord(this.store.messages, result.message, "append");
    this.upsertStoreRecord(this.store.history, result.history, "prepend");
    if (result.cost) {
      this.upsertStoreRecord(this.store.costs, result.cost, "prepend");
    }
  }

  private upsertStoreRecord<T extends { id: string }>(
    records: T[],
    record: T,
    placement: "keep" | "append" | "prepend" = "keep"
  ) {
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      records[index] = record;
      return;
    }
    if (placement === "append") {
      records.push(record);
      return;
    }
    if (placement === "prepend") {
      records.unshift(record);
      return;
    }
    records.push(record);
  }

  private rethrowDirectHandlingPersistenceError(error: unknown): never {
    if (!(error instanceof DirectHandlingPersistenceError)) {
      throw error;
    }
    if (error.code === "TICKET_NOT_FOUND") {
      throw new NotFoundException(error.message);
    }
    if (error.code === "ACCESS_DENIED") {
      throw new ForbiddenException(error.message);
    }
    if (
      error.code === "ALREADY_ACTIVE" ||
      error.code === "ACTIVE_REPAIR_CONFLICT"
    ) {
      throw new ConflictException(error.message);
    }
    throw new BadRequestException(error.message);
  }

  draftManagerTicketReply(
    managerId: string,
    ticketId: string,
    input: ManagerReplyDraftInput = {}
  ): ManagerReplyDraftResult {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);
    const analysis = this.store.analyses[ticket.id];
    const callbot = this.presentCallbotContext(ticket);
    const intent = input.intent ?? this.inferManagerReplyIntent(ticket);
    const subject = this.managerReplySubject(intent, ticket, complaint);
    const evidence = this.managerReplyEvidence(ticket, complaint, callbot);

    return {
      ticketId: ticket.id,
      complaintId: complaint.id,
      intent,
      subject,
      messageText: this.composeManagerReplyDraftMessage({
        intent,
        ticket,
        complaint,
        room,
        analysis,
        callbot,
        note: input.note?.trim()
      }),
      deliveryChannels: ["앱 알림", "티켓 채팅"],
      requiresTenantAction: ["REQUEST_PHOTO", "REQUEST_DETAILS", "SCHEDULE_VISIT"].includes(
        intent
      ),
      tenantActionLabel: this.managerReplyTenantActionLabel(intent),
      evidence,
      warnings: [
        "AI 초안은 참고용이며 관리자가 확인한 뒤 전송해야 합니다.",
        "책임 소재와 비용 부담은 확정하지 않고 가능성으로만 안내합니다."
      ],
      generatedAt: now()
    };
  }

  sendManagerTicketReply(
    managerId: string,
    ticketId: string,
    input: ManagerTicketReplyInput
  ) {
    let ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);
    const messageText = input.messageText?.trim() ?? "";

    if (!messageText) {
      throw new BadRequestException("전송할 답변 내용이 필요합니다.");
    }

    if (input.action === "REQUEST_ADDITIONAL_INFO") {
      if (ticket.status !== "ADDITIONAL_INFO_REQUESTED") {
        ticket = this.transitionTicket(
          ticket.id,
          "ADDITIONAL_INFO_REQUESTED",
          managerId,
          "관리자 답변으로 추가 정보 요청"
        );
      }
    } else if (ticket.status === "RECEIVED") {
      ticket = this.transitionTicket(ticket.id, "REVIEWING", managerId, "관리자 답변 전송");
    } else {
      const complaint = this.findComplaint(ticket.complaintId);
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    const message = this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      managerId,
      "LANDLORD",
      messageText,
      [],
      this.activeRepairIdForTicket(ticket.id)
    );
    this.persistStore();

    return {
      action: input.action ?? "SEND_REPLY",
      message: this.presentTicketMessage(message),
      ticket: this.presentTicket(ticket)
    };
  }

  /**
   * 관리인이 대화 패널에서 진행 레인(접수·진행·완료)을 직접 넘긴다.
   * 티켓 상태 축만 움직이며 수리(RepairRequest)·결제는 건드리지 않는다 — 둘은 별개 축이고,
   * 결제 게이트는 수리 완료를 근거로 하지 실무자가 접은 이 레인을 근거로 하지 않는다.
   * 취소된 티켓은 토글로 되살리지 않는다(되살리기는 재요청 경로가 따로 있다).
   */
  setManagerTicketLane(managerId: string, ticketId: string, input: SetManagerTicketLaneInput) {
    const ticket = this.findTicket(ticketId);
    this.assertManagerCanAccessTicket(managerId, ticket);

    const toStatus = MANAGER_TICKET_LANE_STATUS[input?.lane];

    if (!toStatus) {
      throw new BadRequestException("진행 상태는 접수·진행·완료 중 하나여야 합니다.");
    }

    if (ticket.status === "CANCELLED") {
      throw new BadRequestException("취소된 건의 진행 상태는 변경할 수 없습니다.");
    }

    if (ticket.status === toStatus) {
      return { ticket: this.presentTicket(ticket) };
    }

    const transitioned = this.transitionTicket(
      ticketId,
      toStatus,
      managerId,
      `관리인이 진행 상태를 ${MANAGER_TICKET_LANE_LABEL[input.lane]}(으)로 변경`
    );
    this.persistStore();

    return { ticket: this.presentTicket(transitioned) };
  }

  assignVendor(managerId: string, ticketId: string, input: AssignVendorInput): RepairRequest {
    this.assertManagerCanAccessTicket(managerId, this.findTicket(ticketId));
    const vendor = this.store.vendors.find((item) => item.id === input.vendorId);

    if (!vendor) {
      throw new NotFoundException("협력업체를 찾을 수 없습니다.");
    }

    this.assertTicketStatus(
      ticketId,
      [
        "RECEIVED",
        "REVIEWING",
        "ADDITIONAL_INFO_REQUESTED",
        "VENDOR_ASSIGNMENT_PENDING",
        "REOPENED"
      ],
      "업체 배정"
    );
    const ticket = this.transitionTicket(ticketId, "VENDOR_ASSIGNED", managerId, "업체 배정");
    ticket.assignedVendorId = vendor.id;
    const createdAt = now();
    const repair: RepairRequest = {
      id: id("rep"),
      ticketId,
      vendorId: vendor.id,
      status: "REQUESTED",
      title: `${ticket.category} 처리 요청`,
      description: input.requestNote,
      completionPhotoUrls: [],
      createdAt,
      updatedAt: createdAt
    };

    this.store.repairs.unshift(repair);
    vendor.activeJobs += 1;
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", input.requestNote);
    this.persistStore();

    return repair;
  }

  async listManagerCosts(managerId: string) {
    const financialCosts = await this.financialCostReader.listManagerCosts(managerId);
    return this.cost.listManagerCosts(managerId, financialCosts);
  }

  async getManagerCost(managerId: string, costId: string) {
    const financialCosts = await this.financialCostReader.listManagerCosts(managerId);
    return this.cost.getManagerCost(managerId, costId, financialCosts);
  }

  async confirmManagerCost(managerId: string, costId: string) {
    await this.assertStoreOwnedCostMutation(costId);
    return this.cost.confirmManagerCost(managerId, costId);
  }

  async confirmManagerReceiptOcr(managerId: string, ocrId: string) {
    const costId = this.store.receiptOcrs.find((item) => item.id === ocrId)?.costId;
    if (costId) await this.assertStoreOwnedCostMutation(costId);
    return this.cost.confirmManagerReceiptOcr(managerId, ocrId);
  }

  async voidManagerCost(managerId: string, costId: string, reason?: string) {
    await this.assertStoreOwnedCostMutation(costId);
    return this.cost.voidManagerCost(managerId, costId, reason);
  }

  async updateManagerCostDisclosure(
    managerId: string,
    costId: string,
    disclosure: "public" | "private"
  ) {
    await this.assertStoreOwnedCostMutation(costId);
    return this.cost.updateManagerCostDisclosure(managerId, costId, disclosure);
  }

  getManagerCostReviewQueueSummary(managerId: string): CostReviewQueueSummary {
    return this.cost.getManagerCostReviewQueueSummary(managerId);
  }

  async getManagerMonthlyCostSummary(managerId: string, month?: string) {
    const financialCosts = await this.financialCostReader.listManagerCosts(managerId);
    return this.cost.getManagerMonthlyCostSummary(managerId, month, financialCosts);
  }

  private async assertStoreOwnedCostMutation(costId: string) {
    if (await this.financialCostReader.isFinanceOwnedCost(costId)) {
      throw new ConflictException(
        "금융 처리로 생성된 비용은 기존 비용 API에서 변경할 수 없습니다."
      );
    }
  }

  listManagerReceipts(managerId: string) {
    return this.cost.listManagerReceipts(managerId);
  }

  getManagerReceiptOcr(managerId: string, ocrId: string) {
    return this.cost.getManagerReceiptOcr(managerId, ocrId);
  }

  getManagerDisclosureSetting(managerId: string, month?: string): DisclosureSetting {
    return this.cost.getManagerDisclosureSetting(managerId, month);
  }

  createTenantInvite(managerId: string, input: CreateTenantInviteInput) {
    return this.vendorMgmt.createTenantInvite(managerId, input);
  }

  listTenantInvites(managerId: string) {
    return this.vendorMgmt.listTenantInvites(managerId);
  }

  getSignupInvitePreview(role: UserRole, inviteToken: string) {
    return this.auth.getSignupInvitePreview(role, inviteToken);
  }

  addMessage(senderUserId: string, ticketId: string, messageText: string) {
    const ticket = this.findTicket(ticketId);
    const user = this.store.users.find((account) => account.id === senderUserId);
    const senderRole =
      user?.role === "TENANT" || user?.role === "LANDLORD"
        ? user.role
        : "TENANT";

    const message = this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      senderUserId,
      senderRole,
      messageText
    );
    this.persistStore();

    return message;
  }

  addTenantComplaintMessage(
    tenantId: string,
    complaintId: string,
    input: AddTenantComplaintMessageInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const messageText = input.messageText?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("추가 설명 또는 사진이 필요합니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      messageText || "추가 사진을 제출했습니다.",
      attachmentUrls,
      this.activeRepairIdForTicket(ticket.id)
    );

    this.refreshAnalysisFromTenantFollowup(ticket, {
      messageText,
      attachmentUrls
    });

    if (ticket.status === "ADDITIONAL_INFO_REQUESTED" || ticket.status === "REOPENED") {
      this.transitionTicket(
        ticket.id,
        "REVIEWING",
        tenantId,
        attachmentUrls.length
          ? "임차인이 추가 사진과 설명을 제출"
          : "임차인이 추가 설명을 제출"
      );
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket),
      analysis: this.store.analyses[ticket.id]
    };
  }

  submitTenantAiFeedback(
    tenantId: string,
    complaintId: string,
    input: SubmitTenantAiFeedbackInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const target = input.target;
    const reason = input.reason?.trim() ?? "";
    const requestedAction = input.requestedAction?.trim();
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!this.isAiFeedbackTarget(target)) {
      throw new BadRequestException("이의제기 대상을 선택해주세요.");
    }

    if (!reason) {
      throw new BadRequestException("이의제기 사유를 입력해주세요.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    const analysis = this.store.analyses[ticket.id];
    const createdAt = now();
    const targetLabel = this.aiFeedbackTargetLabel(target);
    const feedback: AiFeedback = {
      id: id("afb"),
      ticketId: ticket.id,
      complaintId: complaint.id,
      tenantId,
      target,
      targetLabel,
      originalValue: this.aiFeedbackOriginalValue(target, ticket, complaint, analysis),
      reason,
      requestedAction,
      attachmentUrls: [...attachmentUrls],
      status: "OPEN",
      createdAt,
      updatedAt: createdAt
    };

    this.store.aiFeedback.unshift(feedback);
    this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      [
        `AI 판단 이의제기: ${targetLabel}`,
        `사유: ${reason}`,
        requestedAction ? `요청 조치: ${requestedAction}` : undefined
      ]
        .filter(Boolean)
        .join("\n"),
      attachmentUrls
    );
    this.markAnalysisNeedsHumanReview(ticket, targetLabel, reason);

    if (ticket.status === "RECEIVED") {
      this.transitionTicket(ticket.id, "REVIEWING", tenantId, "AI 판단 이의제기 접수");
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return this.presentAiFeedback(feedback);
  }

  /**
   * 업체 채팅(2D)은 Prisma 저장소 직행 쓰기라 인메모리 스토어가 모른다 — 저장 직후
   * 같은 id로 스토어에 반영해 세입자/관리자 읽기 경로가 재하이드레이션 없이 즉시 보게 한다.
   * (다음 persistStore 스냅샷은 같은 id upsert라 중복이 생기지 않는다.)
   */
  ingestVendorRepairMessage(record: VendorRepairMessageRecord) {
    const ticket = this.store.tickets.find((item) => item.id === record.ticketId);
    if (!ticket) return;
    if (this.store.messages.some((message) => message.id === record.id)) return;

    this.store.messages.push({
      id: record.id,
      ticketId: record.ticketId,
      complaintId: record.complaintId,
      repairId: record.repairId,
      senderUserId: record.senderUserId,
      senderRole: record.senderRole,
      messageText: record.messageText,
      attachmentUrls: [...record.attachmentUrls],
      createdAt: record.createdAt
    });
    ticket.updatedAt = record.createdAt;
  }

  confirmTenantCompletion(
    tenantId: string,
    complaintId: string,
    input: ConfirmTenantCompletionInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    this.assertTicketStatus(ticket.id, ["COMPLETION_REPORTED", "COMPLETED"], "완료 확인");

    const note = input.note?.trim();
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      note ? `수리 완료를 확인했습니다. ${note}` : "수리 완료를 확인했습니다."
    );

    if (ticket.status === "COMPLETION_REPORTED") {
      this.transitionTicket(ticket.id, "COMPLETED", tenantId, "임차인 완료 확인");
      for (const repair of this.store.repairs.filter((item) => item.ticketId === ticket.id)) {
        if (repair.status === "COMPLETION_REPORTED") {
          repair.status = "COMPLETED";
          repair.updatedAt = now();
        }
      }
    } else {
      ticket.updatedAt = now();
      complaint.updatedAt = now();
    }

    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket)
    };
  }

  reopenTenantComplaint(
    tenantId: string,
    complaintId: string,
    input: ReopenTenantComplaintInput
  ) {
    const complaint = this.store.complaints.find(
      (item) => item.id === complaintId && item.tenantId === tenantId
    );

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    const messageText = input.messageText?.trim() ?? "";
    const attachmentUrls = input.attachmentUrls ?? [];

    if (!messageText && attachmentUrls.length === 0) {
      throw new BadRequestException("미해결 사유 또는 추가 사진이 필요합니다.");
    }

    const ticket = this.findTicket(complaint.ticketId);
    this.assertTicketStatus(ticket.id, ["COMPLETION_REPORTED", "COMPLETED"], "재요청");
    const message = this.addMessageInternal(
      ticket.id,
      complaint.id,
      tenantId,
      "TENANT",
      messageText || "미해결 사진을 추가했습니다.",
      attachmentUrls
    );
    this.transitionTicket(ticket.id, "REOPENED", tenantId, "임차인 미해결 재요청");
    this.persistStore();

    return {
      message: this.presentTicketMessage(message),
      complaint: this.presentComplaint(complaint),
      ticket: this.presentTicket(ticket)
    };
  }

  createMoveInChecklistItem(tenantId: string, input: CreateMoveInChecklistItemInput) {
    return this.checklist.createMoveInChecklistItem(tenantId, input);
  }

  listTenantMoveInChecklist(tenantId: string) {
    return this.checklist.listTenantMoveInChecklist(tenantId);
  }

  listManagerMoveInChecklist(managerId: string, roomId: string) {
    return this.checklist.listManagerMoveInChecklist(managerId, roomId);
  }

  createRoom(ownerId: string, input: CreateRoomInput) {
    this.assertFloorPlanOwner(ownerId);
    const buildingName = input.buildingName?.trim();
    const roomNo = input.roomNo?.trim();
    const address = input.address?.trim();

    if (!buildingName || !roomNo || !address) {
      throw new BadRequestException("건물명, 호실, 주소가 필요합니다.");
    }

    const existingRoom = this.store.rooms.find(
      (room) => room.buildingName === buildingName && room.roomNo === roomNo && room.address === address
    );
    const room =
      existingRoom ??
      ({
        id: id("room"),
        buildingName,
        roomNo,
        address,
        landlordId: ownerId
      } satisfies Room);

    if (room.landlordId && room.landlordId !== ownerId) {
      throw new ForbiddenException("담당 호실에만 도면을 저장할 수 있습니다.");
    }
    room.landlordId = ownerId;

    if (!existingRoom) {
      this.store.rooms.push(room);
    }

    const roomWalls = input.roomData
      ? this.replaceRoomWallsForRoom(room, input.roomData)
      : this.listRoomWalls(room.id);
    this.persistStore();

    return {
      room: { ...room },
      roomWalls
    };
  }

  listRoomWalls(roomId: string) {
    this.findRoom(roomId);

    return this.store.roomWalls
      .filter((wall) => wall.roomId === roomId)
      .sort((left, right) => left.wallOrder - right.wallOrder)
      .map((wall) => this.presentRoomWall(wall));
  }

  replaceRoomWalls(ownerId: string, roomId: string, input: SaveRoomWallsInput) {
    this.assertManagerCanAccessRoom(ownerId, roomId);
    const room = this.findRoom(roomId);
    const roomWalls = this.replaceRoomWallsForRoom(room, input);
    this.persistStore();

    return roomWalls;
  }

  loadSimulatorRoom(roomId: string) {
    const room = this.findRoom(roomId);
    const roomWalls = this.listRoomWalls(roomId);
    const wallsData = roomWalls.map((wall) => this.roomWallToSimulatorWall(wall));

    return {
      room: { ...room },
      room_objects: [],
      room_walls: roomWalls,
      wallsData
    };
  }

  async saveAttachment(uploadedByUserId: string, input: SaveAttachmentInput) {
    return this.floorPlan.saveAttachment(uploadedByUserId, input);
  }

  async saveManagerContractUpload(managerId: string, input: SaveContractDocumentUploadInput) {
    return this.contract.saveManagerContractUpload(managerId, input);
  }

  createFloorPlanDraft(ownerId: string, input: SaveFloorPlanDraftInput) {
    this.assertFloorPlanOwner(ownerId);
    const createdAt = now();
    const draft: FloorPlanDraft = {
      id: id("plan"),
      ownerId,
      roomId: this.optionalOwnedRoomId(ownerId, input.roomId),
      sourceAttachmentId: this.optionalAttachmentId(ownerId, input.sourceAttachmentId),
      sourceImageUrl: this.optionalUrl(input.sourceImageUrl),
      status: "DRAFT",
      pixelToMmRatio: this.validPixelToMmRatio(input.pixelToMmRatio),
      walls: this.validFloorPlanWalls(input.walls),
      hiddenWallIds: this.validStringArray(input.hiddenWallIds),
      furnitures: [],
      room3d: this.validJsonObject(input.room3d),
      extractionMeta: this.validExtractionMeta(input.extractionMeta),
      openings: this.validFloorPlanCandidates(input.openings),
      fixtures: this.validFloorPlanCandidates(input.fixtures),
      createdAt,
      updatedAt: createdAt
    };

    this.store.floorPlans.unshift(draft);
    this.persistStore();

    return this.presentFloorPlanDraft(draft);
  }

  getFloorPlanDraft(ownerId: string, floorPlanId: string) {
    return this.floorPlan.getFloorPlanDraft(ownerId, floorPlanId);
  }

  updateFloorPlanDraft(ownerId: string, floorPlanId: string, input: SaveFloorPlanDraftInput) {
    this.assertFloorPlanOwner(ownerId);
    const draft = this.store.floorPlans.find((floorPlan) => floorPlan.id === floorPlanId);

    if (!draft) {
      throw new NotFoundException("저장된 도면을 찾을 수 없습니다.");
    }

    if (draft.ownerId !== ownerId) {
      throw new ForbiddenException("이 도면을 수정할 권한이 없습니다.");
    }

    if (input.sourceAttachmentId !== undefined) {
      draft.sourceAttachmentId = this.optionalAttachmentId(ownerId, input.sourceAttachmentId);
    }
    if (input.roomId !== undefined) {
      draft.roomId = this.optionalOwnedRoomId(ownerId, input.roomId);
    }
    if (input.sourceImageUrl !== undefined) {
      draft.sourceImageUrl = this.optionalUrl(input.sourceImageUrl);
    }
    if (input.status !== undefined) {
      draft.status = this.validFloorPlanStatus(input.status);
    }
    if (input.pixelToMmRatio !== undefined) {
      draft.pixelToMmRatio = this.validPixelToMmRatio(input.pixelToMmRatio);
    }
    if (input.walls !== undefined) {
      draft.walls = this.validFloorPlanWalls(input.walls);
    }
    if (input.hiddenWallIds !== undefined) {
      draft.hiddenWallIds = this.validStringArray(input.hiddenWallIds);
    }
    if (input.furnitures !== undefined) {
      draft.furnitures = [];
    }
    if (input.room3d !== undefined) {
      draft.room3d = this.validJsonObject(input.room3d);
    }
    if (input.extractionMeta !== undefined) {
      draft.extractionMeta = this.validExtractionMeta(input.extractionMeta);
    }
    if (input.openings !== undefined) {
      draft.openings = this.validFloorPlanCandidates(input.openings);
    }
    if (input.fixtures !== undefined) {
      draft.fixtures = this.validFloorPlanCandidates(input.fixtures);
    }
    if (draft.status === "PUBLISHED") {
      this.assertPublishableFloorPlan(draft);
      if (draft.roomId) {
        this.replaceRoomWallsForRoom(this.findRoom(draft.roomId), {
          pixelToMmRatio: draft.pixelToMmRatio,
          walls: draft.walls
        });
      }
    }

    draft.updatedAt = now();
    this.persistStore();

    return this.presentFloorPlanDraft(draft);
  }

  listFloorPlanAiModels() {
    return FLOOR_PLAN_AI_MODELS.map((model) => ({ ...model }));
  }

  async analyzeFloorPlanWithAi(input: FloorPlanAiAnalysisInput, ownerId?: string): Promise<FloorPlanAiAnalysisResult> {
    const model = this.validFloorPlanAiModel(input.model);
    const modelInfo = FLOOR_PLAN_AI_MODELS.find((item) => item.id === model) ?? FLOOR_PLAN_AI_MODELS[0];
    const imageDataUrl = input.sourceAttachmentId
      ? await this.floorPlanAttachmentDataUrl(input.sourceAttachmentId, ownerId)
      : this.validFloorPlanImageDataUrl(input.imageDataUrl);

    if (model === "openai/floor-plan-vision") {
      if (!process.env.OPENAI_API_KEY) {
        return {
          model,
          mode: modelInfo.mode,
          status: "config-required",
          summary: "OPENAI_API_KEY가 설정되지 않아 OpenAI 도면 1차 분석을 실행하지 않았습니다.",
          textDetections: [],
          scaleCandidates: []
        };
      }

      if (input.analysisMode === "candidate-review") {
        return this.reviewFloorPlanCandidatesWithOpenAi(model, imageDataUrl, this.validFloorPlanAiWallCandidates(input.wallCandidates), input.prompt);
      }

      if (input.analysisMode === "room-structure") {
        return this.analyzeFloorPlanRoomStructureWithOpenAi(model, imageDataUrl, input.prompt);
      }

      return this.analyzeFloorPlanWithOpenAiVision(model, imageDataUrl, input.prompt);
    }

    if (!process.env.NVIDIA_API_KEY) {
      return {
        model,
        mode: modelInfo.mode,
        status: "config-required",
        summary: "NVIDIA_API_KEY가 설정되지 않아 AI 정밀 분석을 실행하지 않았습니다.",
        textDetections: [],
        scaleCandidates: []
      };
    }

    return this.analyzeFloorPlanWithNvidiaVisionReasoning(model, imageDataUrl, input.prompt);
  }

  async detectFloorPlanOpenings(input: FloorPlanOpeningDetectionInput, ownerId?: string): Promise<FloorPlanOpeningDetectionResult> {
    const model = process.env.ROBOFLOW_FLOOR_PLAN_MODEL || "cubicasa5k-2-qpmsa/6";

    if (!process.env.ROBOFLOW_API_KEY) {
      return {
        model,
        openings: [],
        status: "config-required",
        summary: "ROBOFLOW_API_KEY가 설정되지 않아 문/창문 탐지를 실행하지 않았습니다.",
        walls: [],
        warnings: []
      };
    }

    const imageDataUrl = input.sourceAttachmentId
      ? await this.floorPlanAttachmentDataUrl(input.sourceAttachmentId, ownerId)
      : this.validFloorPlanImageDataUrl(input.imageDataUrl);
    const base64 = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);

    try {
      const detectionConfidence = envNumber(
        "ROBOFLOW_DETECTION_CONFIDENCE",
        DEFAULT_ROBOFLOW_DETECTION_CONFIDENCE,
        1,
        100
      );
      const detectionOverlap = envNumber("ROBOFLOW_DETECTION_OVERLAP", DEFAULT_ROBOFLOW_DETECTION_OVERLAP, 1, 100);
      const endpoint = `https://detect.roboflow.com/${model}?api_key=${process.env.ROBOFLOW_API_KEY}&confidence=${detectionConfidence}&overlap=${detectionOverlap}`;
      const response = await fetch(endpoint, {
        body: base64,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST"
      });
      if (!response.ok) throw new Error(`Roboflow opening detection failed with ${response.status}`);

      const payload = (await response.json()) as {
        image?: { width?: number; height?: number };
        predictions?: Array<{ class?: string; confidence?: number; x?: number; y?: number; width?: number; height?: number }>;
      };
      const imageWidth = Math.max(1, Number(payload.image?.width) || 1);
      const imageHeight = Math.max(1, Number(payload.image?.height) || 1);
      const openings = this.mapRoboflowPredictionsToOpenings(payload.predictions ?? [], imageWidth, imageHeight, model);
      const walls = this.mapRoboflowPredictionsToWallBoxes(payload.predictions ?? [], imageWidth, imageHeight);

      return {
        imageHeight,
        imageWidth,
        model,
        openings,
        status: "ready",
        summary: `벽 ${walls.length}개, 문 ${openings.filter((item) => item.type === "DOOR").length}개, 창문 ${openings.filter((item) => item.type === "WINDOW").length}개 후보를 탐지했습니다.`,
        walls,
        warnings: openings.some((item) => item.confidence < 0.4)
          ? ["신뢰도 40% 미만 후보가 포함되어 있습니다. 후보 검수 후 확정하세요."]
          : []
      };
    } catch {
      return {
        model,
        openings: [],
        status: "failed",
        summary: "문/창문 탐지에 실패했습니다. 후보 없이 진행하거나 다시 시도하세요.",
        walls: [],
        warnings: []
      };
    }
  }

  private mapRoboflowPredictionsToWallBoxes(
    predictions: Array<{ class?: string; confidence?: number; x?: number; y?: number; width?: number; height?: number }>,
    imageWidth: number,
    imageHeight: number
  ) {
    const minConfidence = envConfidenceRatio("ROBOFLOW_WALL_MIN_CONFIDENCE", DEFAULT_ROBOFLOW_MIN_BOX_CONFIDENCE);
    const mapped = predictions
      .filter((prediction) => prediction.class === "wall" && (Number(prediction.confidence) || 0) >= minConfidence)
      .flatMap((prediction, index) => {
        const centerX = Number(prediction.x);
        const centerY = Number(prediction.y);
        const width = Number(prediction.width);
        const height = Number(prediction.height);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !(width > 0) || !(height > 0)) return [];

        return [
          {
            boundingBox: {
              height: Math.round((height / imageHeight) * 1000),
              width: Math.round((width / imageWidth) * 1000),
              x: Math.round(((centerX - width / 2) / imageWidth) * 1000),
              y: Math.round(((centerY - height / 2) / imageHeight) * 1000)
            },
            confidence: Number(prediction.confidence) || 0,
            id: `wall-box-${index + 1}`
          }
        ];
      });
    const sorted = [...mapped].sort((a, b) => b.confidence - a.confidence);
    const kept: typeof sorted = [];
    for (const candidate of sorted) {
      const overlapsKept = kept.some((existing) => this.isDuplicateRoboflowBox(existing.boundingBox, candidate.boundingBox));
      if (!overlapsKept) kept.push(candidate);
    }

    return kept.map((candidate, index) => ({ ...candidate, id: `wall-box-${index + 1}` }));
  }

  private mapRoboflowPredictionsToOpenings(
    predictions: Array<{ class?: string; confidence?: number; x?: number; y?: number; width?: number; height?: number }>,
    imageWidth: number,
    imageHeight: number,
    model: string
  ): FloorPlanOpeningCandidate[] {
    // 클래스별 신뢰도 하한: 문은 실도면에서 15~30%로 낮게 잡혀 후보로는 살리고, 창문은 30% 미만이면 노이즈가 많다.
    const minConfidenceByType: Record<"DOOR" | "WINDOW", number> = {
      DOOR: envConfidenceRatio("ROBOFLOW_DOOR_MIN_CONFIDENCE", DEFAULT_ROBOFLOW_DOOR_MIN_BOX_CONFIDENCE),
      WINDOW: envConfidenceRatio("ROBOFLOW_WINDOW_MIN_CONFIDENCE", DEFAULT_ROBOFLOW_WINDOW_MIN_BOX_CONFIDENCE)
    };
    const mapped = predictions.flatMap((prediction) => {
      const type = this.roboflowOpeningType(prediction.class);
      const confidence = Number(prediction.confidence) || 0;
      const centerX = Number(prediction.x);
      const centerY = Number(prediction.y);
      const width = Number(prediction.width);
      const height = Number(prediction.height);
      if (!type || confidence < minConfidenceByType[type]) return [];
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !(width > 0) || !(height > 0)) return [];

      return [
        {
          boundingBox: {
            height: Math.round((height / imageHeight) * 1000),
            width: Math.round((width / imageWidth) * 1000),
            x: Math.round(((centerX - width / 2) / imageWidth) * 1000),
            y: Math.round(((centerY - height / 2) / imageHeight) * 1000)
          },
          confidence,
          source: `roboflow/${model}`,
          status: "CANDIDATE" as const,
          type
        }
      ];
    });

    // 같은 자리를 door/window로 중복 판정하는 경우가 있어 겹침이 크면 신뢰도 높은 쪽만 남긴다.
    const sorted = [...mapped].sort((a, b) => b.confidence - a.confidence);
    const kept: typeof sorted = [];
    for (const candidate of sorted) {
      const overlapsKept = kept.some(
        (existing) => existing.type === candidate.type && this.isDuplicateRoboflowBox(existing.boundingBox, candidate.boundingBox)
      );
      if (!overlapsKept) kept.push(candidate);
    }

    return kept.map((candidate, index) => ({ ...candidate, id: `opening-${index + 1}` }));
  }

  private roboflowOpeningType(className?: string): "DOOR" | "WINDOW" | null {
    const normalized = String(className ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (normalized.includes("door")) return "DOOR";
    if (normalized.includes("window")) return "WINDOW";

    return null;
  }

  private isDuplicateRoboflowBox(
    existing: { height: number; width: number; x: number; y: number },
    candidate: { height: number; width: number; x: number; y: number }
  ) {
    const ax2 = existing.x + existing.width;
    const ay2 = existing.y + existing.height;
    const bx2 = candidate.x + candidate.width;
    const by2 = candidate.y + candidate.height;
    const interW = Math.max(0, Math.min(ax2, bx2) - Math.max(existing.x, candidate.x));
    const interH = Math.max(0, Math.min(ay2, by2) - Math.max(existing.y, candidate.y));
    const inter = interW * interH;
    const areaA = Math.max(1, existing.width * existing.height);
    const areaB = Math.max(1, candidate.width * candidate.height);
    const union = Math.max(1, areaA + areaB - inter);
    const smallerArea = Math.max(1, Math.min(areaA, areaB));

    return (
      inter / union > ROBOFLOW_BOX_IOU_DUPLICATE_THRESHOLD ||
      inter / smallerArea > ROBOFLOW_BOX_CONTAINMENT_DUPLICATE_THRESHOLD
    );
  }

  /**
   * 첨부 원본 바이트 재조회 — 저장소 모드(S3/로컬)와 레코드 세대가 섞여 있어도 읽히도록
   * ① 현재 어댑터 → ② 로컬 디스크(과거 로컬 저장분) → ③ 공개 fileUrl 순으로 시도한다.
   * 배포 환경은 S3 어댑터인데 읽기는 로컬 디스크만 봐서 도면 인식이 404 나던 문제의 수정 지점.
   */
  private async readAttachmentBytes(attachment: { fileName: string; fileUrl: string }): Promise<Buffer | null> {
    const fromAdapter = await this.storageAdapter.read(attachment.fileName).catch(() => null);
    if (fromAdapter) return fromAdapter;

    const localPath = join(this.uploadDir, attachment.fileName);
    if (existsSync(localPath)) {
      try {
        return readFileSync(localPath);
      } catch {
        // 다음 폴백으로
      }
    }

    if (/^https?:\/\//i.test(attachment.fileUrl)) {
      try {
        const response = await fetch(attachment.fileUrl);
        if (response.ok) return Buffer.from(await response.arrayBuffer());
      } catch {
        // 조회 실패 — null 반환
      }
    }

    return null;
  }

  private async floorPlanAttachmentDataUrl(attachmentId: string, ownerId?: string) {
    const attachment = this.store.attachments.find((item) => item.id === attachmentId);

    if (!attachment) {
      throw new NotFoundException("도면 이미지 첨부를 찾을 수 없습니다.");
    }

    if (ownerId && attachment.uploadedByUserId !== ownerId) {
      throw new ForbiddenException("이 도면 이미지 첨부를 사용할 권한이 없습니다.");
    }

    if (!attachment.mimeType.startsWith("image/")) {
      throw new BadRequestException("도면 이미지 첨부만 AI 분석에 사용할 수 있습니다.");
    }

    const bytes = await this.readAttachmentBytes(attachment);
    if (!bytes) {
      throw new NotFoundException("저장된 도면 이미지 파일을 찾을 수 없습니다.");
    }

    return `data:${attachment.mimeType};base64,${bytes.toString("base64")}`;
  }

  private validFloorPlanAiModel(model?: string): FloorPlanAiModelId {
    const fallback = FLOOR_PLAN_AI_MODELS[0].id;
    const selected = model ?? fallback;

    if (FLOOR_PLAN_AI_MODELS.some((item) => item.id === selected)) {
      return selected as FloorPlanAiModelId;
    }

    throw new BadRequestException("지원하지 않는 도면 AI 모델입니다.");
  }

  private validFloorPlanImageDataUrl(value?: string) {
    const trimmed = value?.trim() ?? "";

    if (!/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      throw new BadRequestException("도면 이미지는 png 또는 jpeg data URL이어야 합니다.");
    }

    return trimmed.replace(/^data:image\/jpg;/i, "data:image/jpeg;");
  }

  private validFloorPlanAiWallCandidates(value: unknown): FloorPlanAiWallCandidate[] {
    if (!Array.isArray(value)) return [];

    return value.slice(0, 80).flatMap((item) => {
      const id = typeof item?.id === "string" ? item.id.trim().slice(0, 24) : "";
      const start = item?.start as { x?: unknown; y?: unknown } | undefined;
      const end = item?.end as { x?: unknown; y?: unknown } | undefined;
      const startX = Number(start?.x);
      const startY = Number(start?.y);
      const endX = Number(end?.x);
      const endY = Number(end?.y);
      const lengthPx = Number(item?.lengthPx);
      const orientation = item?.orientation;
      if (!id || !Number.isFinite(startX) || !Number.isFinite(startY) || !Number.isFinite(endX) || !Number.isFinite(endY)) return [];

      return [
        {
          end: { x: endX, y: endY },
          id,
          lengthPx: Number.isFinite(lengthPx) && lengthPx > 0 ? lengthPx : Math.hypot(endX - startX, endY - startY),
          orientation: orientation === "horizontal" || orientation === "vertical" || orientation === "diagonal" ? orientation : "diagonal",
          originalWallId: typeof item?.originalWallId === "string" ? item.originalWallId.slice(0, 80) : undefined,
          start: { x: startX, y: startY }
        }
      ];
    });
  }

  private async analyzeFloorPlanWithNvidiaVisionReasoning(
    model: FloorPlanAiModelId,
    imageDataUrl: string,
    prompt?: string
  ): Promise<FloorPlanAiAnalysisResult> {
    const endpoint = (process.env.NVIDIA_INTEGRATE_API_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
    const instructions = [
      "한국 부동산 방 도면 이미지에서 벽 치수 텍스트와 치수선 관계를 읽어라.",
      "반드시 JSON만 반환해라.",
      "schema: {\"summary\": string, \"textDetections\": [{\"text\": string, \"confidence\": number}], \"scaleCandidates\": [{\"realLengthMm\": number, \"pixelLength\": number, \"pixelToMmRatio\": number, \"confidence\": number, \"source\": string}]}",
      "확신이 낮거나 픽셀 길이를 모르면 scaleCandidates는 비워두고 textDetections에 치수 문자열만 남겨라."
    ].join("\n");

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `${instructions}\n${prompt?.trim() || "도면 치수와 축척 후보를 읽어줘."}` },
                { type: "image_url", image_url: { url: imageDataUrl } }
              ]
            }
          ],
          max_tokens: 2048,
          temperature: 0.1
        }),
        headers: {
          Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) throw new Error(`NVIDIA VLM failed with ${response.status}`);

      const payload = (await response.json()) as Record<string, unknown>;
      const rawText = this.extractChatCompletionText(payload);
      const parsed = this.parseFloorPlanAiJson(rawText);
      const textDetections = this.validAiTextDetections(parsed.textDetections);
      const scaleCandidates = this.validAiScaleCandidates(parsed.scaleCandidates);

      return {
        model,
        mode: "vision-reasoning",
        status: "ready",
        summary: parsed.summary || "AI 도면 치수 분석을 완료했습니다.",
        textDetections,
        scaleCandidates,
        rawText
      };
    } catch {
      return {
        model,
        mode: "vision-reasoning",
        status: "failed",
        summary: "NVIDIA 비전 추론 분석에 실패했습니다. 다른 모델 또는 수동 축척을 사용하세요.",
        textDetections: [],
        scaleCandidates: []
      };
    }
  }

  private async analyzeFloorPlanWithOpenAiVision(
    model: FloorPlanAiModelId,
    imageDataUrl: string,
    prompt?: string
  ): Promise<FloorPlanAiAnalysisResult> {
    const openAiModel = process.env.OPENAI_FLOOR_PLAN_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
    const instructions = [
      "당신은 Roomlog의 한국 부동산 도면 1차 분석기입니다.",
      "도면 이미지에서 방 구조, 치수 텍스트, 치수선 관계, 문/창문/설비처럼 OpenCV 후처리에 도움이 되는 단서를 읽습니다.",
      "픽셀 좌표나 길이를 확신하지 못하면 추측하지 말고 textDetections에 읽은 텍스트만 남깁니다.",
      "도면에 2760, 5040처럼 단위 없는 3-5자리 치수 숫자가 보이면 mm 치수로 보고 각 숫자를 textDetections에 별도 항목으로 넣습니다.",
      "같은 숫자가 도면의 다른 위치에 여러 번 인쇄되어 있으면 위치마다 별도 항목으로 넣습니다.",
      "면적(㎡/평), 동·호수, 층수, 축척 표기(1:100), 날짜, 도면 번호처럼 길이 치수가 아닌 숫자는 textDetections에 넣지 않습니다.",
      "'1500 × 2000mm'처럼 곱셈 기호가 있는 가구/설비 크기 표기는 건물 치수가 아니므로 제외합니다. 도면 안쪽 가구 위에 인쇄된 숫자도 제외하고, 벽을 따라 배치된 치수선의 숫자만 읽습니다.",
      "세로로 회전되어 인쇄된 치수 숫자도 반드시 읽습니다. 한국 아파트 도면은 세로 치수를 90도 회전해 표기하는 경우가 많습니다.",
      "summary에만 치수 숫자를 쓰지 말고, 사용자가 버튼으로 고를 수 있도록 textDetections에 모든 보이는 치수 숫자를 포함합니다.",
      "벽 최종 좌표는 OpenCV와 사용자가 확정하므로, 이 응답은 후보 분석으로만 사용됩니다.",
      "For every visible dimension text, include boundingBox in image-normalized 0~1000 coordinates as {x,y,width,height}. Also include targetLine {x1,y1,x2,y2} for the actual measured span (the extent between the dimension line's end ticks/arrows) that the dimension text labels. Do not guess boundingBox or targetLine; set the field to null when the text location or measured span is genuinely unclear. A wrong targetLine is worse than null.",
      "또한 dimensions 배열에 보이는 모든 치수 숫자를 분류해서 넣습니다. 각 항목은 text, valueMm(mm 정수), kind, axis, boundingBox, targetLine, placementStatus, useForScale, useForWallGeneration, useForFurnitureFit, appliesTo, reason을 가집니다.",
      "kind는 다음 중 하나입니다: outer_total(건물 전체 외곽 가로/세로), outer_segment(외곽을 쪼갠 구간 치수), room_span(방 내부 폭/길이), wall_span(벽 사이 거리), opening(문/창문 폭), furniture(가구 크기), fixture(설비 크기), area(면적), ignore(날짜·호수·축척표기·워터마크 등).",
      "구조 치수(outer_total, outer_segment, room_span, wall_span)만 useForScale과 useForWallGeneration을 true로 둘 수 있습니다. opening/furniture/fixture/area/ignore는 반드시 false입니다.",
      "'1500 × 2000mm', '810 x 1400mm'처럼 곱셈 기호로 폭×깊이를 나타내는 값은 furniture 또는 fixture이며, 공간 크기 계산에 절대 쓰지 않습니다(useForScale=false, useForWallGeneration=false, useForFurnitureFit=true).",
      "문/창문 개구부 폭(예: 800, 870, 1200)은 opening이며 벽 길이로 쓰지 않습니다(useForScale=false, useForWallGeneration=false).",
      "면적(9.3㎡, 5.1㎡)은 area, 날짜·호수·축척표기는 ignore이며 모든 use 플래그가 false입니다.",
      "valueMm는 mm 단위 정수입니다. '9.3㎡'처럼 면적이면 valueMm를 넣지 말고 kind=area로 둡니다.",
      "위치나 측정 구간을 확신하지 못하면 placementStatus를 unplaced 또는 uncertain으로 두고 boundingBox/targetLine을 null로 둡니다. 확실하면 placed입니다.",
      "appliesTo에는 이 치수가 가리키는 대상을 짧게 적습니다(예: 'overall horizontal outside span', 'bed width'). reason에는 그 kind로 분류한 근거를 짧게 적습니다."
    ].join("\n");
    const nullableBox = {
      anyOf: [
        { type: "null" },
        {
          additionalProperties: false,
          properties: { height: { type: "number" }, width: { type: "number" }, x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y", "width", "height"],
          type: "object"
        }
      ]
    };
    const nullableLine = {
      anyOf: [
        { type: "null" },
        {
          additionalProperties: false,
          properties: { x1: { type: "number" }, x2: { type: "number" }, y1: { type: "number" }, y2: { type: "number" } },
          required: ["x1", "y1", "x2", "y2"],
          type: "object"
        }
      ]
    };
    const dimensionReadingSchema = {
      additionalProperties: false,
      properties: {
        dimensions: {
          items: {
            additionalProperties: false,
            properties: {
              appliesTo: { type: "string" },
              axis: { enum: ["horizontal", "vertical", "unknown"], type: "string" },
              boundingBox: nullableBox,
              confidence: { type: "number" },
              kind: {
                enum: ["outer_total", "outer_segment", "room_span", "wall_span", "opening", "furniture", "fixture", "area", "ignore"],
                type: "string"
              },
              placementStatus: { enum: ["placed", "unplaced", "uncertain"], type: "string" },
              reason: { type: "string" },
              targetLine: nullableLine,
              text: { type: "string" },
              useForFurnitureFit: { type: "boolean" },
              useForScale: { type: "boolean" },
              useForWallGeneration: { type: "boolean" },
              valueMm: { type: "number" }
            },
            required: [
              "text",
              "valueMm",
              "kind",
              "axis",
              "confidence",
              "boundingBox",
              "targetLine",
              "placementStatus",
              "useForScale",
              "useForWallGeneration",
              "useForFurnitureFit",
              "appliesTo",
              "reason"
            ],
            type: "object"
          },
          type: "array"
        },
        scaleCandidates: {
          items: {
            additionalProperties: false,
            properties: {
              confidence: { type: "number" },
              pixelLength: { type: "number" },
              pixelToMmRatio: { type: "number" },
              realLengthMm: { type: "number" },
              source: { type: "string" }
            },
            required: ["confidence", "pixelLength", "pixelToMmRatio", "realLengthMm", "source"],
            type: "object"
          },
          type: "array"
        },
        summary: { type: "string" },
        textDetections: {
          items: {
            additionalProperties: false,
            properties: {
              boundingBox: {
                anyOf: [
                  { type: "null" },
                  {
                    additionalProperties: false,
                    properties: {
                      height: { type: "number" },
                      width: { type: "number" },
                      x: { type: "number" },
                      y: { type: "number" }
                    },
                    required: ["x", "y", "width", "height"],
                    type: "object"
                  }
                ]
              },
              confidence: { type: "number" },
              targetLine: {
                anyOf: [
                  { type: "null" },
                  {
                    additionalProperties: false,
                    properties: {
                      x1: { type: "number" },
                      x2: { type: "number" },
                      y1: { type: "number" },
                      y2: { type: "number" }
                    },
                    required: ["x1", "y1", "x2", "y2"],
                    type: "object"
                  }
                ]
              },
              text: { type: "string" }
            },
            required: ["text", "confidence", "boundingBox", "targetLine"],
            type: "object"
          },
          type: "array"
        }
      },
      required: ["summary", "dimensions", "textDetections", "scaleCandidates"],
      type: "object"
    };

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier("floor-plan", model)
        },
        body: JSON.stringify({
          model: openAiModel,
          instructions,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt?.trim() || "도면 이미지의 치수 텍스트와 축척 후보를 JSON으로 분석해줘."
                },
                { type: "input_image", image_url: imageDataUrl, detail: "high" }
              ]
            }
          ],
          text: {
            format: {
              name: "floor_plan_dimension_reading",
              schema: dimensionReadingSchema,
              strict: true,
              type: "json_schema"
            }
          }
        })
      });

      if (!response.ok) throw new Error(`OpenAI floor plan vision failed with ${response.status}`);

      const payload = (await response.json()) as Record<string, unknown>;
      const rawText = this.extractOpenAiResponseText(payload);
      const parsed = this.parseFloorPlanAiJson(rawText);
      const dimensions = this.validAiDimensions(parsed.dimensions);
      const textDetections = this.validAiTextDetections(parsed.textDetections);
      const scaleCandidates = this.filterAiScaleCandidatesByDimensions(this.validAiScaleCandidates(parsed.scaleCandidates), dimensions);

      return {
        model,
        mode: "vision-reasoning",
        status: "ready",
        summary: parsed.summary || "OpenAI 도면 1차 분석을 완료했습니다.",
        dimensions,
        textDetections,
        scaleCandidates,
        rawText
      };
    } catch {
      return {
        model,
        mode: "vision-reasoning",
        status: "failed",
        summary: "OpenAI 도면 1차 분석에 실패했습니다. OpenCV 추출 결과를 검수하거나 수동 축척을 사용하세요.",
        textDetections: [],
        scaleCandidates: []
      };
    }
  }

  private async reviewFloorPlanCandidatesWithOpenAi(
    model: FloorPlanAiModelId,
    imageDataUrl: string,
    wallCandidates: FloorPlanAiWallCandidate[],
    prompt?: string
  ): Promise<FloorPlanAiAnalysisResult> {
    const openAiModel = process.env.OPENAI_FLOOR_PLAN_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini";
    const instructions = [
      "당신은 Roomlog의 OpenCV 도면 벽 후보 검토기입니다.",
      "이미지에는 OpenCV가 뽑은 벽 후보가 파란 선과 W1, W2 같은 라벨로 표시되어 있습니다.",
      "제공된 wallCandidates 목록의 id만 검토하고, 새 좌표나 새 후보 id를 만들지 마세요.",
      "각 후보가 실제 방 외곽/내벽인지 keep, 치수선/가구/문자/노이즈면 reject, 애매하면 review로 판정합니다.",
      "후보별 판정은 candidateReviews 배열에 id, verdict, confidence, reason으로 작성합니다.",
      "OpenCV가 놓친 것으로 보이는 큰 외곽/내벽은 missingWallHints에 description, confidence, orientation, line을 적습니다.",
      "missingWallHints.line 좌표계는 이미지 전체 기준 0~1000 정규화 좌표입니다. 좌상단 원점, x는 오른쪽, y는 아래입니다.",
      "line은 누락 벽 중심선의 x1,y1,x2,y2이며, horizontal 또는 vertical 직교 선분만 사용합니다.",
      "응답은 제공된 JSON schema를 엄격히 따릅니다."
    ].join("\n");
    const candidateSummary = JSON.stringify(
      wallCandidates.map((candidate) => ({
        end: candidate.end,
        id: candidate.id,
        lengthPx: Math.round(candidate.lengthPx),
        orientation: candidate.orientation,
        start: candidate.start
      }))
    );

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier("floor-plan-candidate-review", model)
        },
        body: JSON.stringify({
          model: openAiModel,
          instructions,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: [
                    prompt?.trim() || "OpenCV 벽 후보를 원본 도면과 비교해서 후보별 판정을 JSON으로 반환해줘.",
                    `wallCandidates: ${candidateSummary}`
                  ].join("\n")
                },
                { type: "input_image", image_url: imageDataUrl, detail: "high" }
              ]
            }
          ],
          text: {
            format: {
              name: "floor_plan_candidate_review",
              schema: FLOOR_PLAN_CANDIDATE_REVIEW_SCHEMA,
              strict: true,
              type: "json_schema"
            }
          }
        })
      });

      if (!response.ok) throw new Error(`OpenAI floor plan candidate review failed with ${response.status}`);

      const payload = (await response.json()) as Record<string, unknown>;
      const rawText = this.extractOpenAiResponseText(payload);
      const parsed = this.parseFloorPlanAiJson(rawText);

      return {
        analysisMode: "candidate-review",
        candidateReviews: this.validAiCandidateReviews(parsed.candidateReviews),
        missingWallHints: this.validAiMissingWallHints(parsed.missingWallHints),
        model,
        mode: "vision-reasoning",
        status: "ready",
        summary: parsed.summary || "OpenAI가 OpenCV 벽 후보를 검토했습니다.",
        textDetections: [],
        scaleCandidates: [],
        rawText
      };
    } catch {
      return {
        analysisMode: "candidate-review",
        candidateReviews: [],
        missingWallHints: [],
        model,
        mode: "vision-reasoning",
        status: "failed",
        summary: "OpenAI 벽 후보 검토에 실패했습니다. OpenCV 추출 결과를 직접 검수하세요.",
        textDetections: [],
        scaleCandidates: []
      };
    }
  }

  private async analyzeFloorPlanRoomStructureWithOpenAi(
    model: FloorPlanAiModelId,
    imageDataUrl: string,
    prompt?: string
  ): Promise<FloorPlanAiAnalysisResult> {
    // Ten representative Naver plans averaged 4.99s with Terra/no reasoning,
    // versus 17.85s with gpt-5.5/low while returning the same or more room types.
    // Deployment can still override either setting with the floor-plan env vars.
    const openAiModel = process.env.OPENAI_FLOOR_PLAN_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-5.6-terra";
    const instructions = [
      "당신은 Roomlog의 도면 방 구조 분석기입니다.",
      "도면 스타일을 solid-filled, double-line-hollow, hatched, gray-fill 중 하나로 분류합니다.",
      "장식 해칭과 워터마크 같은 구조 추출 방해 요소를 noiseFlags에 표시합니다.",
      "각 방의 외곽 polygon을 0~1000 정규화 좌표로 반환합니다. 좌상단 원점, x는 오른쪽, y는 아래이며 이미지 너비/높이 기준입니다.",
      "polygon은 직교 꼭짓점 4~12개만 사용하고, 가구/치수선/텍스트는 방 polygon으로 만들지 않습니다.",
      "응답은 제공된 JSON schema를 엄격히 따릅니다."
    ].join("\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier("floor-plan-room-structure", model)
        },
        body: JSON.stringify({
          model: openAiModel,
          instructions,
          reasoning: { effort: process.env.OPENAI_FLOOR_PLAN_EFFORT || "none" },
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: prompt?.trim() || "도면의 방 구조 polygon과 도면 스타일을 JSON schema에 맞게 분석해줘."
                },
                { type: "input_image", image_url: imageDataUrl, detail: "high" }
              ]
            }
          ],
          text: {
            format: {
              name: "floor_plan_room_structure",
              schema: FLOOR_PLAN_ROOM_STRUCTURE_SCHEMA,
              strict: true,
              type: "json_schema"
            }
          }
        })
      });

      if (!response.ok) throw new Error(`OpenAI floor plan room structure failed with ${response.status}`);

      const payload = (await response.json()) as Record<string, unknown>;
      const rawText = this.extractOpenAiResponseText(payload);
      const parsed = this.parseFloorPlanAiJson(rawText);

      return {
        analysisMode: "room-structure",
        model,
        mode: "vision-reasoning",
        noiseFlags: this.validAiRoomStructureNoiseFlags(parsed.noiseFlags),
        planStyle: this.validAiRoomStructurePlanStyle(parsed.planStyle),
        rooms: this.validAiRoomStructures(parsed.rooms),
        status: "ready",
        summary: parsed.summary || "OpenAI가 도면 방 구조를 분석했습니다.",
        textDetections: [],
        scaleCandidates: [],
        rawText
      };
    } catch {
      return {
        analysisMode: "room-structure",
        model,
        mode: "vision-reasoning",
        noiseFlags: { decorativeHatching: false, watermark: false },
        planStyle: "solid-filled",
        rooms: [],
        status: "failed",
        summary: "OpenAI 도면 방 구조 분석에 실패했습니다. OpenCV 추출 결과를 직접 검수하세요.",
        textDetections: [],
        scaleCandidates: []
      };
    }
  }

  private extractOpenAiResponseText(payload: Record<string, unknown>) {
    if (typeof payload.output_text === "string") return payload.output_text;

    return this.extractOutputText(payload.output) ?? "";
  }

  private extractChatCompletionText(payload: Record<string, unknown>) {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const firstChoice = choices[0] as { message?: { content?: unknown } } | undefined;
    const content = firstChoice?.message?.content;

    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === "string" ? part : typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  private parseFloorPlanAiJson(rawText: string): {
    candidateReviews?: unknown;
    dimensions?: unknown;
    missingWallHints?: unknown;
    noiseFlags?: unknown;
    planStyle?: unknown;
    rooms?: unknown;
    summary?: string;
    textDetections?: unknown;
    scaleCandidates?: unknown;
  } {
    const trimmed = rawText.trim();
    const jsonCandidate = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

    try {
      const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;

      return {
        candidateReviews: parsed.candidateReviews,
        dimensions: parsed.dimensions,
        missingWallHints: parsed.missingWallHints,
        noiseFlags: parsed.noiseFlags,
        planStyle: parsed.planStyle,
        rooms: parsed.rooms,
        summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
        textDetections: parsed.textDetections,
        scaleCandidates: parsed.scaleCandidates
      };
    } catch {
      return {
        summary: rawText.slice(0, 200),
        textDetections: rawText
          .split(/\n|,/)
          .map((text) => ({ text: text.trim(), confidence: 0.4 }))
          .filter((item) => item.text)
      };
    }
  }

  private validAiTextDetections(value: unknown): FloorPlanAiTextDetection[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const text = typeof item?.text === "string" ? item.text.trim() : "";
      if (!text) return [];
      const confidence = Number(item.confidence);

      return [
        {
          text,
          ...(Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(1, confidence)) } : {}),
          boundingBox: item.boundingBox,
          targetLine: item.targetLine
        }
      ];
    });
  }

  private normalizeAiDimensionKind(kind: unknown): FloorPlanAiDimensionKind {
    if (
      kind === "outer_total" ||
      kind === "outer_segment" ||
      kind === "room_span" ||
      kind === "wall_span" ||
      kind === "opening" ||
      kind === "furniture" ||
      kind === "fixture" ||
      kind === "area" ||
      kind === "ignore"
    ) {
      return kind;
    }

    return "ignore";
  }

  private isAiScaleDimensionKind(kind: FloorPlanAiDimensionKind) {
    return kind === "outer_total" || kind === "outer_segment" || kind === "room_span" || kind === "wall_span";
  }

  private validAiDimensions(value: unknown): FloorPlanAiDimensionDetection[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const text = typeof item?.text === "string" ? item.text.trim() : "";
      if (!text) return [];
      const kind = this.normalizeAiDimensionKind(item.kind);
      const valueMm = Number(item.valueMm);
      const confidence = Number(item.confidence);
      const axis = item.axis === "horizontal" || item.axis === "vertical" || item.axis === "unknown" ? item.axis : "unknown";
      const placementStatus =
        item.placementStatus === "placed" || item.placementStatus === "unplaced" || item.placementStatus === "uncertain"
          ? item.placementStatus
          : "unplaced";

      return [
        {
          text,
          kind,
          axis,
          ...(Number.isFinite(valueMm) && valueMm > 0 ? { valueMm } : {}),
          ...(Number.isFinite(confidence) ? { confidence: Math.max(0, Math.min(1, confidence)) } : {}),
          boundingBox: item.boundingBox,
          targetLine: item.targetLine,
          placementStatus,
          ...(typeof item.appliesTo === "string" ? { appliesTo: item.appliesTo } : {}),
          useForScale: this.isAiScaleDimensionKind(kind) && item.useForScale === true,
          useForWallGeneration: this.isAiScaleDimensionKind(kind) && item.useForWallGeneration !== false,
          useForFurnitureFit: (kind === "furniture" || kind === "fixture") && item.useForFurnitureFit !== false,
          ...(typeof item.reason === "string" ? { reason: item.reason } : {})
        }
      ];
    });
  }

  private filterAiScaleCandidatesByDimensions(
    scaleCandidates: FloorPlanAiScaleCandidate[],
    dimensions: FloorPlanAiDimensionDetection[]
  ) {
    if (!dimensions.length) return scaleCandidates;
    const scaleLengths = new Set(dimensions.filter((dimension) => dimension.useForScale && dimension.valueMm).map((dimension) => Math.round(dimension.valueMm!)));

    return scaleCandidates.filter((candidate) => scaleLengths.has(Math.round(candidate.realLengthMm)));
  }

  private validAiScaleCandidates(value: unknown): FloorPlanAiScaleCandidate[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const realLengthMm = Number(item?.realLengthMm);
      if (!Number.isFinite(realLengthMm) || realLengthMm <= 0) return [];
      const pixelLength = Number(item.pixelLength);
      const pixelToMmRatio = Number(item.pixelToMmRatio);
      const confidence = Number(item.confidence);

      return [
        {
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
          ...(Number.isFinite(pixelLength) && pixelLength > 0 ? { pixelLength } : {}),
          ...(Number.isFinite(pixelToMmRatio) && pixelToMmRatio > 0 ? { pixelToMmRatio } : {}),
          realLengthMm,
          source: typeof item.source === "string" ? item.source : "nvidia/vlm"
        }
      ];
    });
  }

  private validAiCandidateReviews(value: unknown): FloorPlanAiCandidateReview[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const verdict = item?.verdict;
      if (!id || (verdict !== "keep" && verdict !== "reject" && verdict !== "review")) return [];
      const confidence = Number(item.confidence);

      return [
        {
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
          id,
          reason: typeof item.reason === "string" ? item.reason.slice(0, 180) : undefined,
          verdict
        }
      ];
    });
  }

  private validAiMissingWallHints(value: unknown): FloorPlanAiMissingWallHint[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const description = typeof item?.description === "string" ? item.description.trim() : "";
      if (!description) return [];
      const confidence = Number(item.confidence);
      const orientation = item?.orientation;
      const line = this.validAiNormalizedLine(item?.line);

      return [
        {
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
          description: description.slice(0, 220),
          ...(line ? { line } : {}),
          ...(orientation === "horizontal" || orientation === "vertical" ? { orientation } : {})
        }
      ];
    });
  }

  private validAiNormalizedLine(value: unknown): FloorPlanAiNormalizedLine | undefined {
    const item = value as { x1?: unknown; x2?: unknown; y1?: unknown; y2?: unknown } | undefined;
    const x1 = Number(item?.x1);
    const y1 = Number(item?.y1);
    const x2 = Number(item?.x2);
    const y2 = Number(item?.y2);
    if (![x1, y1, x2, y2].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1000)) return undefined;

    return { x1, y1, x2, y2 };
  }

  private validAiRoomStructurePlanStyle(value: unknown): FloorPlanAiRoomStructurePlanStyle {
    return value === "solid-filled" || value === "double-line-hollow" || value === "hatched" || value === "gray-fill"
      ? value
      : "solid-filled";
  }

  private validAiRoomStructureNoiseFlags(value: unknown): FloorPlanAiRoomStructureNoiseFlags {
    const item = value as { decorativeHatching?: unknown; watermark?: unknown } | undefined;

    return {
      decorativeHatching: item?.decorativeHatching === true,
      watermark: item?.watermark === true
    };
  }

  private validAiRoomStructures(value: unknown): FloorPlanAiRoomStructure[] {
    if (!Array.isArray(value)) return [];

    return value.slice(0, 40).flatMap((item) => {
      const label = typeof item?.label === "string" ? item.label.trim().slice(0, 80) : "";
      const confidence = Number(item?.confidence);
      const polygon = this.validAiRoomPolygon(item?.polygon);
      if (!label || !polygon) return [];

      return [
        {
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
          label,
          polygon,
          roomType: this.validAiRoomType(item?.roomType)
        }
      ];
    });
  }

  private validAiRoomType(value: unknown): FloorPlanAiRoomType {
    return value === "LIVING_ROOM"
      || value === "BEDROOM"
      || value === "DRESS_ROOM"
      || value === "KITCHEN_DINING"
      || value === "BATHROOM"
      || value === "LAUNDRY_UTILITY"
      || value === "BALCONY"
      || value === "ENTRY"
      || value === "HALLWAY"
      || value === "UNKNOWN"
      ? value
      : "UNKNOWN";
  }

  private validAiRoomPolygon(value: unknown) {
    if (!Array.isArray(value) || value.length < 4 || value.length > 12) return undefined;

    const points = value.flatMap((point) => {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) return [];

      return [{ x, y }];
    });
    if (points.length !== value.length) return undefined;

    const orthogonal = points.every((point, index) => {
      const next = points[(index + 1) % points.length];
      return point.x === next.x || point.y === next.y;
    });

    return orthogonal ? points : undefined;
  }

  private assertFloorPlanOwner(ownerId: string) {
    const user = this.store.users.find((account) => account.id === ownerId);

    if (!user) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    if (user.role !== "LANDLORD") {
      throw new ForbiddenException("도면은 집주인 계정으로 저장할 수 있습니다.");
    }
  }

  private replaceRoomWallsForRoom(room: Room, input: SaveRoomWallsInput) {
    const walls = this.validFloorPlanWalls(input.walls);
    const pixelToMmRatio = this.validPixelToMmRatio(input.pixelToMmRatio);
    const nextWalls = this.createRoomWallsFromFloorPlanWalls(room.id, walls, pixelToMmRatio);

    this.store.roomWalls = this.store.roomWalls.filter((wall) => wall.roomId !== room.id);
    this.store.roomWalls.push(...nextWalls);

    return nextWalls.map((wall) => this.presentRoomWall(wall));
  }

  private createRoomWallsFromFloorPlanWalls(roomId: string, walls: FloorPlanWall[], pixelToMmRatio: number) {
    if (walls.length === 0) return [];

    const createdAt = now();
    const rawWalls = walls.map((wall, index) => {
      const startM = {
        x: (wall.start.x * pixelToMmRatio) / 1000,
        y: (wall.start.y * pixelToMmRatio) / 1000
      };
      const endM = {
        x: (wall.end.x * pixelToMmRatio) / 1000,
        y: (wall.end.y * pixelToMmRatio) / 1000
      };
      const lengthM = Math.hypot(endM.x - startM.x, endM.y - startM.y);
      const centerX = (startM.x + endM.x) / 2;
      const centerZ = (startM.y + endM.y) / 2;

      return {
        id: id("room_wall"),
        roomId,
        sourceWallId: String(wall.id ?? `wall-${index + 1}`),
        start: wall.start,
        end: wall.end,
        lengthM,
        rotationRad: Math.atan2(endM.y - startM.y, endM.x - startM.x),
        position: [centerX, ROOM_WALL_HEIGHT_M / 2, centerZ] as [number, number, number],
        wallOrder: index
      };
    });
    const centerX = rawWalls.reduce((sum, wall) => sum + wall.position[0], 0) / rawWalls.length;
    const centerZ = rawWalls.reduce((sum, wall) => sum + wall.position[2], 0) / rawWalls.length;

    return rawWalls.map((wall) => ({
      id: wall.id,
      roomId: wall.roomId,
      sourceWallId: wall.sourceWallId,
      start: wall.start,
      end: wall.end,
      lengthMm: Math.round(wall.lengthM * 1000),
      rotationRad: this.roundMetric(wall.rotationRad),
      position: [
        this.roundMetric(wall.position[0] - centerX),
        this.roundMetric(wall.position[1]),
        this.roundMetric(wall.position[2] - centerZ)
      ] as [number, number, number],
      dimensions: {
        width: this.roundMetric(wall.lengthM),
        height: ROOM_WALL_HEIGHT_M,
        depth: ROOM_WALL_DEPTH_M
      },
      wallOrder: wall.wallOrder,
      createdAt,
      updatedAt: createdAt
    }));
  }

  private roomWallToSimulatorWall(wall: RoomWall): SimulatorWallData {
    return {
      id: wall.id,
      wall_id: wall.sourceWallId,
      start: wall.start,
      end: wall.end,
      length: wall.dimensions.width,
      height: wall.dimensions.height,
      depth: wall.dimensions.depth,
      position: wall.position,
      rotation: [0, wall.rotationRad, 0],
      dimensions: wall.dimensions,
      material: "wall",
      wall_order: wall.wallOrder
    };
  }

  private presentRoomWall(wall: RoomWall): RoomWall {
    return JSON.parse(JSON.stringify(wall)) as RoomWall;
  }

  private roundMetric(value: number) {
    return Math.round(value * 1000) / 1000;
  }

  private optionalAttachmentId(ownerId: string, attachmentId?: string) {
    if (!attachmentId) return undefined;

    const attachment = this.store.attachments.find((item) => item.id === attachmentId);
    if (!attachment) {
      throw new NotFoundException("도면 이미지 첨부를 찾을 수 없습니다.");
    }
    if (attachment.uploadedByUserId !== ownerId) {
      throw new ForbiddenException("이 첨부 파일을 사용할 권한이 없습니다.");
    }

    return attachment.id;
  }

  private optionalOwnedRoomId(ownerId: string, roomId?: string) {
    if (!roomId) return undefined;

    this.assertManagerCanAccessRoom(ownerId, roomId);

    return roomId;
  }

  private optionalUrl(value?: string) {
    const trimmed = value?.trim();

    return trimmed || undefined;
  }

  private validPixelToMmRatio(value?: number) {
    const ratio = Number(value ?? 20);

    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 1000) {
      throw new BadRequestException("축척 값이 올바르지 않습니다.");
    }

    return ratio;
  }

  private validFloorPlanWalls(value?: FloorPlanWall[]) {
    if (!Array.isArray(value)) return [];

    return value
      .filter((wall) => wall && wall.start && wall.end)
      .map((wall, index) => {
        const normalized = {
          id: String(wall.id ?? `wall-${index + 1}`),
          start: {
            x: Number(wall.start.x),
            y: Number(wall.start.y)
          },
          end: {
            x: Number(wall.end.x),
            y: Number(wall.end.y)
          }
        };

        if (
          !Number.isFinite(normalized.start.x) ||
          !Number.isFinite(normalized.start.y) ||
          !Number.isFinite(normalized.end.x) ||
          !Number.isFinite(normalized.end.y)
        ) {
          throw new BadRequestException("벽 좌표가 올바르지 않습니다.");
        }

        return normalized;
      });
  }

  private validStringArray(value?: string[]) {
    return Array.isArray(value)
      ? value.map((item) => String(item)).filter((item) => item.trim().length > 0)
      : [];
  }

  private validFloorPlanStatus(value: string) {
    if (value === "DRAFT" || value === "PUBLISHED" || value === "ARCHIVED") return value;

    throw new BadRequestException("도면 상태가 올바르지 않습니다.");
  }

  private validJsonObject(value?: Record<string, unknown>) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  private validExtractionMeta(value?: Record<string, unknown>) {
    const meta = this.validJsonObject(value);

    return {
      ...meta,
      scaleConfirmed: Boolean(meta.scaleConfirmed)
    };
  }

  private validFloorPlanCandidates(value?: Array<Record<string, unknown>>) {
    if (!Array.isArray(value)) return [];

    return value.map((candidate, index) => {
      const rawStatus = String(candidate.status ?? "CANDIDATE");
      if (!["CANDIDATE", "CONFIRMED", "REJECTED"].includes(rawStatus)) {
        throw new BadRequestException("도면 후보 상태가 올바르지 않습니다.");
      }
      const status = rawStatus as "CANDIDATE" | "CONFIRMED" | "REJECTED";

      const confidence = candidate.confidence === undefined ? undefined : Number(candidate.confidence);
      if (confidence !== undefined && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
        throw new BadRequestException("도면 후보 신뢰도가 올바르지 않습니다.");
      }

      return {
        ...candidate,
        id: String(candidate.id ?? `candidate-${index + 1}`),
        source: String(candidate.source ?? "manual"),
        status,
        type: String(candidate.type ?? "UNKNOWN"),
        ...(confidence === undefined ? {} : { confidence })
      };
    });
  }

  private assertPublishableFloorPlan(draft: FloorPlanDraft) {
    const roomWalls = Array.isArray((draft.room3d as { walls?: unknown[] }).walls)
      ? (draft.room3d as { walls?: unknown[] }).walls ?? []
      : [];

    if (draft.walls.length === 0 || roomWalls.length === 0) {
      throw new BadRequestException("3D 도면 발행에는 벽과 3D 변환 데이터가 필요합니다.");
    }

    if (!draft.extractionMeta.scaleConfirmed || !Number.isFinite(draft.pixelToMmRatio) || draft.pixelToMmRatio <= 0) {
      throw new BadRequestException("도면 발행 전 축척 확인이 필요합니다.");
    }
  }

  private presentFloorPlanDraft(draft: FloorPlanDraft): FloorPlanDraft {
    return JSON.parse(JSON.stringify(draft)) as FloorPlanDraft;
  }

  getTenantRoom(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      throw new NotFoundException("임차인 호실을 찾을 수 없습니다.");
    }

    return this.findRoom(roomId);
  }

  listTenantRooms(tenantId: string) {
    const currentRoomId = this.store.tenantRooms[tenantId];
    const linkedRoomIds = new Set<string>();

    if (currentRoomId) {
      linkedRoomIds.add(currentRoomId);
    }

    // 해지된 집은 목록에서 뺀다. 현재 연결(tenantRooms)은 위에서 이미 넣었으므로,
    // 거주 중 기간 만료(expired지만 연결 유지)는 그대로 남고 해지된 방만 사라진다.
    this.store.contracts
      .filter((contract) => contract.tenantId === tenantId && contract.lifecycle !== "expired")
      .forEach((contract) => linkedRoomIds.add(contract.roomId));

    return [...linkedRoomIds]
      .map((roomId) => {
        const room = this.findRoom(roomId);
        const contract = this.contract.getTenantCurrentContract(tenantId, roomId);
        const landlord = room.landlordId
          ? this.store.users.find((user) => user.id === room.landlordId)
          : undefined;

        return {
          roomId: room.id,
          buildingName: room.buildingName,
          roomNo: room.roomNo,
          address: room.address,
          landlordId: room.landlordId,
          landlordName: landlord?.name ?? contract?.landlordName,
          contractId: contract?.id,
          contractStatus: contract?.lifecycle,
          isCurrent: room.id === currentRoomId,
          updatedAt: contract?.updatedAt
        };
      })
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        return this.timeOf(right.updatedAt) - this.timeOf(left.updatedAt);
      });
  }

  listTenantMoveouts(tenantId: string) {
    return this.moveout.listTenantMoveouts(tenantId);
  }

  getTenantMoveout(tenantId: string, moveoutId: string) {
    return this.moveout.getTenantMoveout(tenantId, moveoutId);
  }

  listTenantMoveoutRecords(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutRecords(tenantId, moveoutId);
  }

  listTenantMoveoutChecklist(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutChecklist(tenantId, moveoutId);
  }

  updateTenantMoveoutChecklist(
    tenantId: string,
    moveoutId: string,
    input: UpdateMoveoutChecklistInput
  ) {
    return this.moveout.updateTenantMoveoutChecklist(tenantId, moveoutId, input);
  }

  getTenantMoveoutSettlement(tenantId: string, moveoutId: string) {
    return this.moveout.getTenantMoveoutSettlement(tenantId, moveoutId);
  }

  listTenantMoveoutDisputes(tenantId: string, moveoutId: string) {
    return this.moveout.listTenantMoveoutDisputes(tenantId, moveoutId);
  }

  createTenantMoveoutInquiry(
    tenantId: string,
    moveoutId: string,
    input: CreateTenantMoveoutInquiryInput
  ) {
    return this.moveout.createTenantMoveoutInquiry(tenantId, moveoutId, input);
  }

  createTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: CreateMoveoutDisputeInput
  ) {
    return this.moveout.createTenantMoveoutDispute(tenantId, moveoutId, input);
  }

  updateTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: UpdateTenantMoveoutDisputeInput
  ) {
    return this.moveout.updateTenantMoveoutDispute(tenantId, moveoutId, input);
  }

  escalateTenantMoveoutDispute(
    tenantId: string,
    moveoutId: string,
    input: EscalateMoveoutDisputeInput
  ) {
    return this.moveout.escalateTenantMoveoutDispute(tenantId, moveoutId, input);
  }

  getManagerMoveoutDashboard(managerId: string) {
    return this.moveout.getManagerMoveoutDashboard(managerId);
  }

  listManagerMoveoutRows(managerId: string) {
    return this.moveout.listManagerMoveoutRows(managerId);
  }

  getManagerMoveout(managerId: string, moveoutId: string) {
    return this.moveout.getManagerMoveout(managerId, moveoutId);
  }

  getManagerMoveoutRecords(managerId: string, moveoutId: string) {
    return this.moveout.getManagerMoveoutRecords(managerId, moveoutId);
  }

  getManagerReportAudit(managerId: string, moveoutId: string) {
    return this.moveout.getManagerReportAudit(managerId, moveoutId);
  }

  getManagerMoveoutSettlement(
    managerId: string,
    moveoutId: string
  ): MoveoutManagerSettlementReview {
    return this.moveout.getManagerMoveoutSettlement(managerId, moveoutId);
  }

  adjustManagerMoveoutWearVerdict(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustWearVerdictInput
  ) {
    return this.moveout.adjustManagerMoveoutWearVerdict(managerId, moveoutId, input);
  }

  adjustManagerMoveoutDeduction(
    managerId: string,
    moveoutId: string,
    input: MoveoutAdjustDeductionInput
  ) {
    return this.moveout.adjustManagerMoveoutDeduction(managerId, moveoutId, input);
  }

  completeManagerMoveoutReview(
    managerId: string,
    moveoutId: string,
    input: MoveoutCompleteReviewInput
  ) {
    return this.moveout.completeManagerMoveoutReview(managerId, moveoutId, input);
  }

  respondManagerMoveoutDispute(
    managerId: string,
    moveoutId: string,
    input: MoveoutRespondDisputeInput
  ) {
    return this.moveout.respondManagerMoveoutDispute(managerId, moveoutId, input);
  }

  createMessagingThread(managerId: string, input: CreateMessagingThreadInput) {
    return this.messaging.createMessagingThread(managerId, input);
  }

  createTenantMessagingThread(tenantId: string, input: CreateTenantMessagingThreadInput) {
    return this.messaging.createTenantMessagingThread(tenantId, input);
  }

  getTenantLandlordConversation(tenantId: string, roomId?: string) {
    return this.messaging.getTenantLandlordConversation(tenantId, roomId);
  }

  listTenantMessagingThreads(tenantId: string) {
    return this.messaging.listTenantMessagingThreads(tenantId);
  }

  getTenantMessagingThread(tenantId: string, threadId: string) {
    return this.messaging.getTenantMessagingThread(tenantId, threadId);
  }

  markTenantMessagingThreadRead(tenantId: string, threadId: string) {
    return this.messaging.markTenantMessagingThreadRead(tenantId, threadId);
  }

  addTenantMessagingThreadMessage(
    tenantId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ) {
    return this.messaging.addTenantMessagingThreadMessage(tenantId, threadId, input);
  }

  deleteTenantMessagingThread(tenantId: string, threadId: string) {
    return this.messaging.deleteTenantMessagingThread(tenantId, threadId);
  }

  listManagerMessagingThreads(managerId: string, context?: MessagingThreadContext) {
    return this.messaging.listManagerMessagingThreads(managerId, context);
  }

  listManagerMessagingRecipients(managerId: string) {
    return this.messaging.listManagerMessagingRecipients(managerId);
  }

  startManagerConversation(managerId: string, input: StartManagerConversationInput) {
    return this.messaging.startManagerConversation(managerId, input);
  }

  getManagerMessagingThread(managerId: string, threadId: string) {
    return this.messaging.getManagerMessagingThread(managerId, threadId);
  }

  markManagerMessagingThreadRead(managerId: string, threadId: string) {
    return this.messaging.markManagerMessagingThreadRead(managerId, threadId);
  }

  addManagerMessagingThreadMessage(
    managerId: string,
    threadId: string,
    input: AddMessagingThreadMessageInput
  ) {
    return this.messaging.addManagerMessagingThreadMessage(managerId, threadId, input);
  }

  deleteManagerMessagingThread(managerId: string, threadId: string) {
    return this.messaging.deleteManagerMessagingThread(managerId, threadId);
  }

  createManagerAnnouncementDraft(managerId: string, input: CreateAnnouncementDraftInput) {
    return this.messaging.createManagerAnnouncementDraft(managerId, input);
  }

  listManagerAnnouncementDrafts(managerId: string) {
    return this.messaging.listManagerAnnouncementDrafts(managerId);
  }

  getManagerAnnouncementDraft(managerId: string, draftId: string) {
    return this.messaging.getManagerAnnouncementDraft(managerId, draftId);
  }

  updateManagerAnnouncementDraft(
    managerId: string,
    draftId: string,
    input: UpdateAnnouncementDraftInput
  ) {
    return this.messaging.updateManagerAnnouncementDraft(managerId, draftId, input);
  }

  translateManagerAnnouncement(managerId: string, input: AnnouncementTranslationRequest) {
    return this.announcementTranslation.translate(managerId, input);
  }

  listManagerAnnouncementRecipients(managerId: string, draftId: string) {
    return this.messaging.listManagerAnnouncementRecipients(managerId, draftId);
  }

  sendManagerAnnouncementDraft(managerId: string, draftId: string) {
    return this.messaging.sendManagerAnnouncementDraft(managerId, draftId);
  }

  listTenantMessagingAnnouncements(tenantId: string, roomId?: string) {
    return this.messaging.listTenantMessagingAnnouncements(tenantId, roomId);
  }

  getTenantMessagingAnnouncement(tenantId: string, announcementId: string) {
    return this.messaging.getTenantMessagingAnnouncement(tenantId, announcementId);
  }

  markTenantMessagingAnnouncementRead(tenantId: string, announcementId: string) {
    return this.messaging.markTenantMessagingAnnouncementRead(tenantId, announcementId);
  }

  confirmTenantMessagingAnnouncement(tenantId: string, announcementId: string) {
    return this.messaging.confirmTenantMessagingAnnouncement(tenantId, announcementId);
  }

  listManagerAnnouncementResults(managerId: string) {
    return this.messaging.listManagerAnnouncementResults(managerId);
  }

  getManagerAnnouncementResult(managerId: string, announcementId: string) {
    return this.messaging.getManagerAnnouncementResult(managerId, announcementId);
  }

  listManagerReports(managerId: string) {
    return this.report.listManagerReports(managerId);
  }

  async createManagerReport(managerId: string, input: CreateManagerReportInput) {
    const managerCosts = await this.listManagerCosts(managerId);
    return this.report.createManagerReport(managerId, input, managerCosts);
  }

  getManagerReport(managerId: string, reportId: string) {
    return this.report.getManagerReport(managerId, reportId);
  }

  listManagerReportSourceReferences(managerId: string, reportId: string) {
    return this.report.listManagerReportSourceReferences(managerId, reportId);
  }

  askManagerReportChat(
    managerId: string,
    reportId: string,
    input: AskManagerReportChatInput
  ) {
    return this.report.askManagerReportChat(managerId, reportId, input);
  }

  createManagerReportExternalShare(
    managerId: string,
    reportId: string,
    input: CreateManagerReportExternalShareInput
  ) {
    return this.report.createManagerReportExternalShare(managerId, reportId, input);
  }

  getExternalReportShare(token: string) {
    return this.report.getExternalReportShare(token);
  }

  revokeManagerReportExternalShare(managerId: string, reportId: string, shareId: string) {
    return this.report.revokeManagerReportExternalShare(managerId, reportId, shareId);
  }

  listManagerReportAuditLog(managerId: string, reportId: string) {
    return this.report.listManagerReportAuditLog(managerId, reportId);
  }

  createManagerReportFollowUp(
    managerId: string,
    reportId: string,
    input: CreateManagerReportFollowUpInput
  ) {
    return this.report.createManagerReportFollowUp(managerId, reportId, input);
  }

  private tenantBills(tenantId: string) {
    const roomId = this.store.tenantRooms[tenantId];

    if (!roomId) {
      return [];
    }

    const room = this.findRoom(roomId);
    // 청구는 호실 기준이라 재계약 시 전 세입자 청구(미납·연체 포함)가 새 세입자에게 넘어간다.
    // 내 입주 시점 이전에 발행된 청구는 내 것이 아니다 — 남의 연체를 새 세입자에게 보이지 않는다.
    // 입주 시점을 알 수 없으면(계약 미연결) 기존대로 전부 반환 — 정상 청구를 숨기지 않는다.
    const occupancyStart = this.tenantOccupancyStart(tenantId, room.id);

    return this.store.bills
      .filter((bill) => this.roomForBill(bill)?.id === room.id)
      .filter(
        (bill) => occupancyStart === undefined || this.timeOf(bill.createdAt) >= occupancyStart
      )
      .sort((left, right) => right.billingMonth.localeCompare(left.billingMonth));
  }

  /** 해당 호실에서 내 계약이 시작된 시각(거래 수락 시각 우선). 계약이 없으면 undefined. */
  private tenantOccupancyStart(tenantId: string, roomId: string): number | undefined {
    const starts = this.store.contracts
      .filter((contract) => contract.tenantId === tenantId && contract.roomId === roomId)
      .map((contract) => this.timeOf(contract.tradeAcceptedAt ?? contract.createdAt))
      .filter((time) => Number.isFinite(time) && time > 0);

    return starts.length > 0 ? Math.min(...starts) : undefined;
  }

  private billIsVisibleToTenant(bill: Bill, at: Date) {
    const status = this.deriveBillStatus(bill);

    return (
      !["DRAFT", "CORRECTED", "CANCELED"].includes(status) &&
      isBillPaymentOpen(bill.dueDate, at)
    );
  }

  private billCanAcceptPayment(bill: Bill) {
    const status = this.deriveBillStatus(bill);

    return (
      !["DRAFT", "CONFIRMING", "PAID", "CORRECTED", "CANCELED"].includes(status) &&
      this.unpaidAmount(bill) > 0 &&
      !this.dunningGuardForBill(bill).blocked
    );
  }

  private assertBillPaymentOpen(bill: Bill, at: Date) {
    const payableFrom = billPayableFrom(bill.dueDate);

    if (!isBillPaymentOpen(bill.dueDate, at)) {
      const [year, month, day] = payableFrom.slice(0, 10).split("-");
      throw new ConflictException({
        code: "BILL_NOT_PAYABLE_YET",
        message: `결제일 한 달 전인 ${year}년 ${Number(month)}월 ${Number(day)}일부터 납부할 수 있습니다.`,
        billingMonth: bill.billingMonth,
        payableFrom
      });
    }
  }

  private assertBillCanAcceptPayment(bill: Bill) {
    if (!this.billCanAcceptPayment(bill)) {
      throw new ConflictException({
        code: "BILL_PAYMENT_NOT_AVAILABLE",
        message: "현재 이 청구서에는 납부를 진행할 수 없습니다."
      });
    }
  }

  private assertNoPaymentConfirmationInProgress(bill: Bill) {
    if (this.billsWithPaymentConfirmation.has(bill.id)) {
      throw new ConflictException({
        code: "PAYMENT_CONFIRMATION_IN_PROGRESS",
        message: "결제 승인을 처리 중입니다. 잠시 후 납부 상태를 다시 확인해주세요."
      });
    }
  }

  private billIsRetainedInTenantHistory(bill: Bill, at: Date) {
    return (
      !["DRAFT", "CORRECTED", "CANCELED"].includes(bill.status) &&
      isBillPaymentOpen(bill.dueDate, at)
    );
  }

  private tenantPaymentHistoryMinimum(tenantId: string, bills: Bill[], today: string) {
    const roomId = this.store.tenantRooms[tenantId];
    const matchingContracts = roomId
      ? this.store.contracts.filter(
          (contract) =>
            contract.roomId === roomId &&
            contract.review === "confirmed" &&
            contract.valueSource === "confirmed" &&
            Boolean(contract.startDate) &&
            (contract.tenantId === tenantId || contract.tenantId === undefined)
        )
      : [];
    const tenantContracts = matchingContracts.filter(
      (contract) => contract.tenantId === tenantId
    );
    const contracts = tenantContracts.length > 0 ? tenantContracts : matchingContracts;
    const contractStart = contracts
      .map((contract) => billingDateInSeoul(contract.startDate!))
      .sort((left, right) => left.localeCompare(right))[0];

    if (contractStart) {
      return contractStart;
    }

    return (
      bills
        .map((bill) => billingDateInSeoul(bill.dueDate))
        .sort((left, right) => left.localeCompare(right))[0] ?? today
    );
  }

  private tenantPaymentHistoryEvents(bill: Bill): TeamTenantPaymentHistoryEvent[] {
    const events: TeamTenantPaymentHistoryEvent[] = [
      ...this.store.paymentTransactions
        .filter(
          (item) => item.billId === bill.id && item.status === "APPROVED" && item.approvedAt
        )
        .map((item) => ({
          id: item.id,
          type: "TOSS" as const,
          activityDate: item.approvedAt!,
          amount: item.amount,
          status: "CONFIRMED" as const,
          receiptAvailable: true
        })),
      ...this.store.deposits
        .filter(
          (item) =>
            item.matchedBillId === bill.id &&
            item.matchStatus === "MATCHED" &&
            !item.paymentTransactionId
        )
        .map((item) => ({
          id: item.id,
          type: "DEPOSIT" as const,
          activityDate: item.depositedAt,
          amount: item.amount,
          status: "CONFIRMED" as const,
          receiptAvailable: true
        })),
      ...this.store.paymentReports
        .filter((item) => item.billId === bill.id && item.status !== "MATCHED")
        .map((item) => ({
          id: item.id,
          type: "REPORT" as const,
          activityDate: item.reportedAt,
          amount: item.amount,
          status: "CONFIRMING" as const,
          receiptAvailable: false
        }))
    ];

    if (events.length === 0 && this.unpaidAmount(bill) > 0) {
      events.push({
        id: `${bill.id}-due`,
        type: "BILL_DUE",
        activityDate: bill.dueDate,
        amount: this.unpaidAmount(bill),
        status: "DUE",
        receiptAvailable: false
      });
    }

    return events;
  }

  private managerBills(managerId: string) {
    return this.store.bills
      .filter((bill) => this.canManagerAccessBill(managerId, bill))
      .sort((left, right) => right.billingMonth.localeCompare(left.billingMonth));
  }

  private managerRooms(managerId: string) {
    return this.store.rooms
      .filter((room) => room.landlordId === managerId)
      .sort((left, right) =>
        `${left.buildingName}-${left.roomNo}`.localeCompare(
          `${right.buildingName}-${right.roomNo}`,
          "ko"
        )
      );
  }

  private resolveManagerBillingScope(managerId: string, buildingName?: string): {
    scope: TeamBillingScope;
    rooms: Room[];
  } {
    const allRooms = this.managerRooms(managerId);
    const normalizedBuilding = buildingName?.trim() || undefined;
    const grouped = new Map<string, Room[]>();
    for (const room of allRooms) {
      grouped.set(room.buildingName, [...(grouped.get(room.buildingName) ?? []), room]);
    }
    if (normalizedBuilding && !grouped.has(normalizedBuilding)) {
      throw new ForbiddenException("담당 건물만 조회할 수 있습니다.");
    }
    const buildings = [...grouped.entries()]
      .map(([name, rooms]) => ({
        buildingName: name,
        address: rooms[0]?.address ?? "",
        roomCount: rooms.length
      }))
      .sort((left, right) => left.buildingName.localeCompare(right.buildingName, "ko"));

    return {
      scope: {
        buildings,
        selectedBuilding: normalizedBuilding
      },
      rooms: normalizedBuilding
        ? allRooms.filter((room) => room.buildingName === normalizedBuilding)
        : allRooms
    };
  }

  private candidateRoomsForBill(bill: Bill) {
    if (bill.roomId) {
      const room = this.store.rooms.find((candidate) => candidate.id === bill.roomId);
      return room ? [room] : [];
    }

    return this.store.rooms.filter((room) => this.unitMatchesRoom(bill.unitId, room));
  }

  private roomForBill(bill: Bill) {
    const candidates = this.candidateRoomsForBill(bill);
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private roomForManagerBill(managerId: string, bill: Bill) {
    const room = this.roomForBill(bill);
    return room?.landlordId === managerId ? room : undefined;
  }

  private roomForManagerDeposit(managerId: string, deposit: Deposit) {
    if (deposit.matchedBillId) {
      const bill = this.store.bills.find((item) => item.id === deposit.matchedBillId);
      return bill ? this.roomForManagerBill(managerId, bill) : undefined;
    }
    if (!deposit.guessedUnitId) {
      return undefined;
    }

    const candidates = this.store.rooms.filter((room) =>
      this.unitMatchesRoom(deposit.guessedUnitId, room)
    );
    const room = candidates.length === 1 ? candidates[0] : undefined;
    return room?.landlordId === managerId ? room : undefined;
  }

  private validateBillingMonth(value?: string) {
    const month = value?.trim() || this.currentBillingMonthInSeoul();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) {
      throw new BadRequestException("청구 월은 YYYY-MM 형식이어야 합니다.");
    }
    return month;
  }

  private currentBillingMonthInSeoul() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    return `${year}-${month}`;
  }

  private todayInSeoul() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((candidate) => candidate.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  }

  private shiftBillingMonth(month: string, offset: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private billingMonthsBetween(fromMonth: string, toMonth: string) {
    const [fromYear, fromNumber] = fromMonth.split("-").map(Number);
    const [toYear, toNumber] = toMonth.split("-").map(Number);
    const monthCount = (toYear - fromYear) * 12 + toNumber - fromNumber;
    return Array.from(
      { length: monthCount + 1 },
      (_, index) => this.shiftBillingMonth(fromMonth, index)
    );
  }

  private billingDueDate(month: string, paymentDay: number) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const day = Math.min(lastDay, Math.max(1, Math.round(paymentDay)));
    return `${month}-${String(day).padStart(2, "0")}`;
  }

  private managerBillCreationUnavailableReasons(
    contract?: Contract
  ): TeamBillCreationUnavailableReason[] {
    if (!contract) {
      return ["NO_CONTRACT"];
    }

    const reasons = new Set<TeamBillCreationUnavailableReason>();
    if (contract.lifecycle !== "active") reasons.add("CONTRACT_NOT_ACTIVE");
    if (contract.review !== "confirmed") reasons.add("CONTRACT_NOT_CONFIRMED");
    if (contract.valueSource !== "confirmed") {
      reasons.add("CONTRACT_VALUES_NOT_CONFIRMED");
    }

    const rent = contract.monthlyRent;
    const maintenance = contract.maintenanceFee;
    const validRent = Number.isSafeInteger(rent) && rent !== undefined && rent >= 0;
    const validMaintenance =
      Number.isSafeInteger(maintenance) && maintenance !== undefined && maintenance >= 0;

    if (rent === undefined) reasons.add("MONTHLY_RENT_MISSING");
    else if (!validRent) reasons.add("BILL_AMOUNT_INVALID");
    if (maintenance === undefined) reasons.add("MAINTENANCE_FEE_MISSING");
    else if (!validMaintenance) reasons.add("BILL_AMOUNT_INVALID");

    if (validRent && validMaintenance) {
      const total = rent + maintenance;
      if (!Number.isSafeInteger(total) || total <= 0) {
        reasons.add("BILL_AMOUNT_INVALID");
      }
    }

    if (contract.paymentDay === undefined) {
      reasons.add("PAYMENT_DAY_MISSING");
    } else if (
      !Number.isInteger(contract.paymentDay) ||
      contract.paymentDay < 1 ||
      contract.paymentDay > 31
    ) {
      reasons.add("PAYMENT_DAY_INVALID");
    }

    return [...reasons];
  }

  private validateBillAmount(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new BadRequestException(`${label}는 0 이상의 원 단위 정수여야 합니다.`);
    }
    return value;
  }

  private validateBillDueDate(value: string, billingMonth: string) {
    const dueDate = value?.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(dueDate ?? "")) {
      throw new BadRequestException("납부 기한은 YYYY-MM-DD 형식이어야 합니다.");
    }
    if (!dueDate.startsWith(`${billingMonth}-`)) {
      throw new BadRequestException("납부 기한은 청구 월 안에서 선택해주세요.");
    }
    const [year, month, day] = dueDate.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      throw new BadRequestException("유효한 납부 기한을 입력해주세요.");
    }
    return dueDate;
  }

  private collectionPointForBills(
    billingMonth: string,
    bills: Bill[]
  ): TeamCollectionPoint {
    const included = bills.filter(
      (bill) => !["CANCELED", "CORRECTED"].includes(bill.status)
    );
    const billedAmount = included.reduce((sum, bill) => sum + bill.totalAmount, 0);
    const collectedAmount = included.reduce((sum, bill) => sum + bill.paidAmount, 0);
    const billedUnits = included.length;
    const fullyPaidUnits = included.filter(
      (bill) => bill.totalAmount > 0 && bill.paidAmount >= bill.totalAmount
    ).length;
    const partiallyPaidUnits = included.filter(
      (bill) => bill.paidAmount > 0 && bill.paidAmount < bill.totalAmount
    ).length;
    return {
      billingMonth,
      billedAmount,
      collectedAmount,
      unpaidAmount: Math.max(0, billedAmount - collectedAmount),
      collectionRate: billedAmount > 0 ? collectedAmount / billedAmount : 0,
      billedUnits,
      fullyPaidUnits,
      partiallyPaidUnits
    };
  }

  private averageCollectionRate(points: TeamCollectionPoint[], months: number) {
    const eligible = points.filter((point) => point.billedAmount > 0).slice(-months);
    return eligible.length > 0
      ? eligible.reduce((sum, point) => sum + point.collectionRate, 0) / eligible.length
      : 0;
  }

  private collectionTimingForBills(
    currentMonth: string,
    currentBills: Bill[],
    previousMonth: string,
    previousBills: Bill[]
  ): TeamCollectionTiming {
    const currentEvents = this.confirmedCollectionEventsForBills(currentBills);
    const previousEvents = this.confirmedCollectionEventsForBills(previousBills);
    const totalCurrentAmount = currentEvents.reduce((sum, event) => sum + event.amount, 0);
    const onTimeAmount = currentEvents
      .filter(
        (event) =>
          billingDateInSeoul(event.occurredAt) <= billingDateInSeoul(event.bill.dueDate)
      )
      .reduce((sum, event) => sum + event.amount, 0);
    const weightedCollectionDay = currentEvents.reduce(
      (sum, event) =>
        sum + this.collectionDayForMonth(event.occurredAt, currentMonth) * event.amount,
      0
    );

    return {
      currentMonth,
      previousMonth,
      onTimeCollectionRate: totalCurrentAmount > 0 ? onTimeAmount / totalCurrentAmount : 0,
      averageCollectionDay:
        totalCurrentAmount > 0 ? weightedCollectionDay / totalCurrentAmount : undefined,
      points: Array.from({ length: 31 }, (_, index) => {
        const day = index + 1;
        return {
          day,
          currentCumulativeAmount: currentEvents
            .filter((event) => this.collectionDayForMonth(event.occurredAt, currentMonth) <= day)
            .reduce((sum, event) => sum + event.amount, 0),
          previousCumulativeAmount: previousEvents
            .filter((event) => this.collectionDayForMonth(event.occurredAt, previousMonth) <= day)
            .reduce((sum, event) => sum + event.amount, 0)
        };
      })
    };
  }

  private confirmedCollectionEventsForBills(bills: Bill[]) {
    return bills
      .filter((bill) => !["CANCELED", "CORRECTED"].includes(bill.status))
      .flatMap((bill) => {
        const events: Array<{ bill: Bill; amount: number; occurredAt: string }> = [];
        let remainingAmount = Math.max(0, bill.paidAmount);
        const appendEvent = (amount: number, occurredAt: string) => {
          const confirmedAmount = Math.min(remainingAmount, Math.max(0, amount));
          if (confirmedAmount <= 0) return;
          events.push({ bill, amount: confirmedAmount, occurredAt });
          remainingAmount -= confirmedAmount;
        };

        this.store.deposits
          .filter(
            (deposit) => deposit.matchStatus === "MATCHED" && deposit.matchedBillId === bill.id
          )
          .sort((left, right) => left.depositedAt.localeCompare(right.depositedAt))
          .forEach((deposit) => appendEvent(deposit.amount, deposit.depositedAt));

        this.store.paymentReports
          .filter(
            (report) =>
              report.billId === bill.id &&
              report.status === "MATCHED" &&
              Boolean(report.confirmedAt)
          )
          .sort((left, right) =>
            (left.confirmedAt ?? "").localeCompare(right.confirmedAt ?? "")
          )
          .forEach((report) => appendEvent(report.amount, report.confirmedAt ?? bill.updatedAt));

        appendEvent(remainingAmount, bill.updatedAt);
        return events;
      });
  }

  private collectionDayForMonth(occurredAt: string, billingMonth: string) {
    const occurredDate = billingDateInSeoul(occurredAt);
    const elapsed = Math.floor(
      (Date.parse(`${occurredDate}T00:00:00.000Z`) -
        Date.parse(`${billingMonth}-01T00:00:00.000Z`)) /
        86_400_000
    );
    return Math.min(31, Math.max(1, elapsed + 1));
  }

  private findBill(billId: string) {
    const bill = this.store.bills.find((item) => item.id === billId);

    if (!bill) {
      throw new NotFoundException("청구서를 찾을 수 없습니다.");
    }

    return bill;
  }

  private findTenantBill(tenantId: string, billId: string, at: Date) {
    const bill = this.findTenantBillInScope(tenantId, billId);

    if (!this.billIsVisibleToTenant(bill, at)) {
      throw new NotFoundException("청구서를 찾을 수 없습니다.");
    }

    return bill;
  }

  private findTenantBillForMutation(tenantId: string, billId: string) {
    const bill = this.findTenantBillInScope(tenantId, billId);

    if (this.deriveBillStatus(bill) === "DRAFT") {
      throw new NotFoundException("청구서를 찾을 수 없습니다.");
    }

    return bill;
  }

  private findTenantBillInScope(tenantId: string, billId: string) {
    const bill = this.findBill(billId);
    const roomId = this.store.tenantRooms[tenantId];
    const room = roomId ? this.findRoom(roomId) : undefined;

    if (!room || this.roomForBill(bill)?.id !== room.id) {
      throw new ForbiddenException("본인 호실의 청구서만 조회할 수 있습니다.");
    }

    return bill;
  }

  private findManagerBill(managerId: string, billId: string) {
    const bill = this.findBill(billId);

    this.assertManagerCanAccessBill(managerId, bill);

    return bill;
  }

  private findDeposit(depositId: string) {
    const deposit = this.store.deposits.find((item) => item.id === depositId);

    if (!deposit) {
      throw new NotFoundException("입금 내역을 찾을 수 없습니다.");
    }

    return deposit;
  }

  private canManagerAccessBill(managerId: string, bill: Bill) {
    const candidates = this.candidateRoomsForBill(bill);
    return (
      candidates.length > 0 &&
      candidates.every((room) => room.landlordId === managerId)
    );
  }

  private assertManagerCanAccessBill(managerId: string, bill: Bill) {
    if (!this.canManagerAccessBill(managerId, bill)) {
      throw new ForbiddenException("담당 호실의 청구서만 조회할 수 있습니다.");
    }
  }

  private unitMatchesRoom(unitId: string | undefined, room: Room) {
    return (
      this.unitsEqual(unitId, room.roomNo) ||
      this.unitsEqual(unitId, room.id) ||
      this.unitsEqual(unitId, `${room.roomNo}호`)
    );
  }

  private unitsEqual(left?: string, right?: string) {
    return Boolean(left && right && this.normalizeUnitId(left) === this.normalizeUnitId(right));
  }

  private normalizeUnitId(value: string) {
    return value.replace(/\s*호\s*$/u, "").trim();
  }

  private monthKey(iso: string) {
    return iso.slice(0, 7);
  }

  private unpaidAmount(bill: Bill) {
    return Math.max(0, bill.totalAmount - bill.paidAmount);
  }

  private normalizeBillItems(items: BillLineItem[], billPaidAmount = 0): BillLineItem[] {
    let remainingPaidAmount = Math.max(0, billPaidAmount);
    const shouldDistributeAggregate =
      remainingPaidAmount > 0 && items.every((item) => (item.paidAmount ?? 0) === 0);

    return items.map((item, index) => {
      const amount = Math.max(0, Math.round(Number(item.amount) || 0));
      const paidAmount =
        item.paidAmount !== undefined && !shouldDistributeAggregate
          ? Math.min(amount, Math.max(0, Math.round(Number(item.paidAmount) || 0)))
          : Math.min(amount, remainingPaidAmount);

      remainingPaidAmount = Math.max(0, remainingPaidAmount - paidAmount);

      return {
        ...item,
        amount,
        kind: item.kind ?? this.inferBillLineItemKind(item.label, index),
        paidAmount
      };
    });
  }

  private inferBillLineItemKind(label: string, index = 0): BillLineItemKind {
    if (/월세|임대료|rent/i.test(label)) return "RENT";
    if (/관리비|maintenance/i.test(label)) return "MAINTENANCE";
    return index === 0 ? "RENT" : "OTHER";
  }

  private lineItemStatus(item: BillLineItem): BillLineItemStatus {
    const paidAmount = Math.min(item.amount, Math.max(0, item.paidAmount ?? 0));

    if (paidAmount >= item.amount && item.amount > 0) return "PAID";
    if (paidAmount > 0) return "PARTIAL";
    return "UNPAID";
  }

  private billLineItemId(bill: Bill, item: BillLineItem, index: number) {
    return item.id ?? `${bill.id}-line-${index + 1}`;
  }

  private billItemsByKind(bill: Bill, kinds: BillLineItemKind[]) {
    const requestedKinds = new Set(kinds);
    return bill.items.filter((item) => requestedKinds.has(item.kind ?? "OTHER"));
  }

  private isBillPastDue(bill: Bill) {
    return Date.parse(bill.dueDate) < Date.now();
  }

  private canAutoOverdue(bill: Bill) {
    return (
      this.isBillPastDue(bill) &&
      this.unpaidAmount(bill) > 0 &&
      !["DRAFT", "PAID", "CORRECTED", "CANCELED"].includes(bill.status)
    );
  }

  private isBillInActiveOverdue(bill: Bill) {
    return this.canAutoOverdue(bill) && !this.dunningGuardForBill(bill).blocked;
  }

  private deriveBillStatus(bill: Bill): BillStatus {
    if (bill.status === "CANCELED" || bill.status === "CORRECTED" || bill.status === "DRAFT") {
      return bill.status;
    }

    if (this.unpaidAmount(bill) === 0) {
      return "PAID";
    }

    const guard = this.dunningGuardForBill(bill);

    if (guard.hasConfirming) {
      return "CONFIRMING";
    }

    if (bill.paidAmount > 0) {
      return this.canAutoOverdue(bill) && !guard.blocked ? "OVERDUE" : "PARTIALLY_PAID";
    }

    if (this.canAutoOverdue(bill) && !guard.blocked) {
      return "OVERDUE";
    }

    if (bill.status === "OVERDUE" && !this.isBillInActiveOverdue(bill)) {
      return bill.paidAmount > 0 ? "PARTIALLY_PAID" : "SENT";
    }

    return bill.status;
  }

  private refreshBillStatusAfterPaymentChange(bill: Bill) {
    bill.status = this.deriveBillStatus(bill);
    bill.updatedAt = now();
  }

  private applyConfirmedPayment(bill: Bill, amount: number) {
    const items = this.normalizeBillItems(bill.items, bill.paidAmount);

    if (amount >= 0) {
      let remaining = amount;
      for (const item of items) {
        const currentPaid = Math.min(item.amount, item.paidAmount ?? 0);
        const addition = Math.min(Math.max(0, item.amount - currentPaid), remaining);
        item.paidAmount = currentPaid + addition;
        remaining -= addition;
        if (remaining <= 0) break;
      }
    } else {
      let remaining = Math.abs(amount);
      for (const item of [...items].reverse()) {
        const currentPaid = Math.min(item.amount, item.paidAmount ?? 0);
        const subtraction = Math.min(currentPaid, remaining);
        item.paidAmount = currentPaid - subtraction;
        remaining -= subtraction;
        if (remaining <= 0) break;
      }
    }

    bill.items = items;
    bill.paidAmount = Math.min(
      bill.totalAmount,
      items.reduce((sum, item) => sum + Math.min(item.amount, item.paidAmount ?? 0), 0)
    );
    bill.updatedAt = now();
  }

  private applyConfirmedPaymentToItems(
    bill: Bill,
    transaction: BillPaymentTransaction
  ) {
    const items = this.normalizeBillItems(bill.items, bill.paidAmount);

    for (const allocation of transaction.allocations) {
      const item = items.find(
        (candidate, index) =>
          this.billLineItemId(bill, candidate, index) === allocation.billLineItemId
      );
      if (!item) continue;
      item.paidAmount = Math.min(
        item.amount,
        Math.max(0, (item.paidAmount ?? 0) + allocation.amount)
      );
    }

    bill.items = items;
    bill.paidAmount = Math.min(
      bill.totalAmount,
      items.reduce((sum, item) => sum + Math.min(item.amount, item.paidAmount ?? 0), 0)
    );
    bill.updatedAt = now();
  }

  private paymentAllocationsRemainOutstanding(
    bill: Bill,
    transaction: BillPaymentTransaction
  ) {
    const items = this.normalizeBillItems(bill.items, bill.paidAmount);
    const outstandingByItemId = new Map(
      items.map((item, index) => [
        this.billLineItemId(bill, item, index),
        Math.max(0, item.amount - (item.paidAmount ?? 0))
      ])
    );
    const allocatedByItemId = new Map<string, number>();

    for (const allocation of transaction.allocations) {
      allocatedByItemId.set(
        allocation.billLineItemId,
        (allocatedByItemId.get(allocation.billLineItemId) ?? 0) + allocation.amount
      );
    }

    return (
      transaction.allocations.length > 0 &&
      transaction.allocations.reduce((sum, allocation) => sum + allocation.amount, 0) ===
        transaction.amount &&
      [...allocatedByItemId.entries()].every(
        ([itemId, allocated]) =>
          allocated > 0 &&
          outstandingByItemId.has(itemId) &&
          allocated <= (outstandingByItemId.get(itemId) ?? 0)
      )
    );
  }

  private dunningGuardForBill(bill: Bill) {
    const hasConfirming = this.hasConfirmingPaymentContext(bill);
    const hasOrphan = this.hasOrphanDepositForBillPeriod(bill);

    return {
      blocked: hasConfirming || hasOrphan,
      hasConfirming,
      hasOrphan
    };
  }

  private hasConfirmingPaymentContext(bill: Bill) {
    return (
      this.store.paymentReports.some(
        (report) => report.billId === bill.id && report.status === "CONFIRMING"
      ) ||
      this.store.deposits.some(
        (deposit) => deposit.matchedBillId === bill.id && deposit.matchStatus === "MISMATCH"
      )
    );
  }

  // orphan 입금은 입금월 또는 그 이전의 같은 호실 미납 청구를 가드한다.
  // 미래 청구월은 가드하지 않아 다음 달 청구의 과잉 차단을 막는다.
  private orphanDepositAppliesToBill(deposit: Deposit, bill: Bill) {
    // 건물이 확정되지 않은 입금은 같은 호수의 모든 후보를 보수적으로 가드한다.
    // 임의 귀속은 하지 않되, 실제 납부자가 독촉 대상이 되는 피해를 우선 차단한다.
    return (
      this.unitsEqual(deposit.guessedUnitId, bill.unitId) &&
      bill.billingMonth <= this.monthKey(deposit.depositedAt)
    );
  }

  private hasOrphanDepositForBillPeriod(bill: Bill) {
    return this.store.deposits.some(
      (deposit) =>
        deposit.matchStatus === "ORPHAN" &&
        this.orphanDepositAppliesToBill(deposit, bill)
    );
  }

  private confirmingAmountForBill(bill: Bill) {
    const reports = this.store.paymentReports
      .filter((report) => report.billId === bill.id && report.status === "CONFIRMING")
      .reduce((sum, report) => sum + report.amount, 0);
    const mismatches = this.store.deposits
      .filter((deposit) => deposit.matchedBillId === bill.id && deposit.matchStatus === "MISMATCH")
      .reduce((sum, deposit) => sum + deposit.amount, 0);

    return reports + mismatches;
  }

  private managerRelevantDeposits(managerId: string) {
    return this.store.deposits.filter((deposit) => {
      return this.canManagerAccessDeposit(managerId, deposit);
    });
  }

  private canManagerAccessDeposit(managerId: string, deposit: Deposit) {
    if (deposit.matchedBillId) {
      const bill = this.store.bills.find((item) => item.id === deposit.matchedBillId);
      return Boolean(bill && this.canManagerAccessBill(managerId, bill));
    }
    if (!deposit.guessedUnitId) {
      return false;
    }
    const candidates = this.store.rooms.filter((room) =>
      this.unitMatchesRoom(deposit.guessedUnitId, room)
    );
    return (
      candidates.length > 0 &&
      candidates.every((room) => room.landlordId === managerId)
    );
  }

  private resolveMaintenanceFeeForBill(bill: Bill): MaintenanceFee {
    const maintenanceFee =
      (bill.maintenanceFeeId
        ? this.store.maintenanceFees.find((item) => item.id === bill.maintenanceFeeId)
        : undefined) ??
      this.store.maintenanceFees.find(
        (item) => this.unitsEqual(item.unitId, bill.unitId) && item.billingMonth === bill.billingMonth
      );

    return (
      maintenanceFee ?? {
        id: bill.maintenanceFeeId ?? `maintenance-${bill.id}`,
        unitId: bill.unitId,
        billingMonth: bill.billingMonth,
        totalAmount: 0,
        available: false,
        items: []
      }
    );
  }

  private tenantNameForBill(bill: Bill) {
    const room = this.roomForBill(bill);
    return room ? this.tenantNameForRoom(room.id) : "미연결 임차인";
  }

  private tenantNameForRoom(roomId: string) {
    const tenantId = Object.entries(this.store.tenantRooms).find(
      ([, linkedRoomId]) => linkedRoomId === roomId
    )?.[0];
    return this.store.users.find((user) => user.id === tenantId)?.name ?? "미연결 임차인";
  }

  private paymentCustomerKey(tenantId: string) {
    return `roomlog-${createHash("sha256").update(tenantId).digest("hex").slice(0, 24)}`;
  }

  private paymentBadgeForBill(bill: Bill): PaymentBadge {
    const status = this.deriveBillStatus(bill);
    const map: Record<BillStatus, PaymentBadge> = {
      DRAFT: "NONE",
      SENT: "DUE",
      CONFIRMING: "CONFIRMING",
      PARTIALLY_PAID: "PARTIAL",
      PAID: "PAID",
      OVERDUE: "OVERDUE",
      CORRECTED: "DUE",
      CANCELED: "NONE"
    };

    return map[status];
  }

  private presentBill(bill: Bill): TeamBill {
    const items = this.normalizeBillItems(bill.items, bill.paidAmount);

    return {
      id: bill.id,
      roomId: bill.roomId,
      unitId: bill.unitId,
      billingMonth: bill.billingMonth,
      status: this.deriveBillStatus(bill),
      items: items.map((item) => ({
        label: item.label,
        kind: item.kind ?? "OTHER",
        amount: item.amount,
        paidAmount: item.paidAmount ?? 0,
        status: this.lineItemStatus(item)
      })),
      totalAmount: bill.totalAmount,
      paidAmount: bill.paidAmount,
      dueDate: bill.dueDate,
      account: {
        bankName: bill.bankName,
        accountNumber: bill.accountNumber,
        accountHolder: bill.accountHolder
      },
      correctionHistory: bill.correctionHistory ?? [],
      maintenanceFeeId: bill.maintenanceFeeId,
      depositConfirmationRequested: bill.depositConfirmationRequested ?? false,
      createdAt: bill.createdAt,
      updatedAt: bill.updatedAt
    };
  }

  private presentPaymentReport(report: PaymentReport): TeamReport {
    return { ...report };
  }

  private presentDeposit(deposit: Deposit): TeamDeposit {
    return { ...deposit };
  }

  private presentMaintenanceFee(fee: MaintenanceFee): TeamMaintenance {
    return {
      id: fee.id,
      unitId: fee.unitId,
      billingMonth: fee.billingMonth,
      totalAmount: fee.totalAmount,
      available: fee.available,
      items: fee.items.map((item) => ({
        label: item.label,
        amount: item.amount,
        receiptAvailable: item.receiptAvailable
      }))
    };
  }

  private presentManagerBillRow(bill: Bill, managerId?: string): TeamBillRow {
    const room = managerId ? this.roomForManagerBill(managerId, bill) : this.roomForBill(bill);
    const daysOverdue = this.daysOverdueForBill(bill);
    return {
      billId: bill.id,
      roomId: room?.id,
      buildingName: room?.buildingName,
      unitId: bill.unitId,
      tenantName: this.tenantNameForBill(bill),
      billingMonth: bill.billingMonth,
      totalAmount: bill.totalAmount,
      paidAmount: bill.paidAmount,
      unpaidAmount: this.unpaidAmount(bill),
      daysOverdue,
      status: this.deriveBillStatus(bill),
      dueDate: bill.dueDate,
      badge: this.paymentBadgeForBill(bill),
      guard: this.dunningGuardForBill(bill)
    };
  }

  private daysOverdueForBill(bill: Bill) {
    return Math.max(
      0,
      Math.floor((Date.now() - Date.parse(bill.dueDate)) / (24 * 60 * 60 * 1000))
    );
  }

  private presentOverdueCase(bill: Bill, managerId?: string): TeamOverdue {
    const daysOverdue = this.daysOverdueForBill(bill);
    const room = managerId ? this.roomForManagerBill(managerId, bill) : this.roomForBill(bill);

    return {
      billId: bill.id,
      roomId: room?.id,
      buildingName: room?.buildingName,
      unitId: bill.unitId,
      tenantName: this.tenantNameForBill(bill),
      billingMonth: bill.billingMonth,
      totalAmount: bill.totalAmount,
      paidAmount: bill.paidAmount,
      unpaidAmount: this.unpaidAmount(bill),
      daysOverdue,
      stage: this.stageForDaysOverdue(daysOverdue),
      dueDate: bill.dueDate,
      guard: this.dunningGuardForBill(bill)
    };
  }

  private presentManagerBillingDeposit(managerId: string, deposit: Deposit) {
    const room = this.roomForManagerDeposit(managerId, deposit);
    return {
      ...this.presentDeposit(deposit),
      buildingName: room?.buildingName,
      unitId: room?.roomNo ?? deposit.guessedUnitId,
      needsBuildingReview: !room
    };
  }

  private presentManagerTransactionDeposit(
    managerId: string,
    deposit: Deposit
  ): TeamTransactionLedgerRow {
    const bill = deposit.matchedBillId
      ? this.managerBills(managerId).find((candidate) => candidate.id === deposit.matchedBillId)
      : undefined;
    const presentedBill = bill ? this.presentBill(bill) : undefined;
    const room = bill ? this.roomForManagerBill(managerId, bill) : undefined;
    const statusLabels: Record<Deposit["matchStatus"], string> = {
      MATCHED: "매칭 완료",
      UNMATCHED: "확인 필요",
      ORPHAN: "미연결",
      MISMATCH: "불일치"
    };

    return {
      id: deposit.id,
      direction: "deposit",
      occurredAt: deposit.depositedAt,
      amount: deposit.amount,
      statusLabel: statusLabels[deposit.matchStatus],
      buildingName: room?.buildingName,
      unitId: bill ? room?.roomNo ?? this.normalizeUnitId(bill.unitId) : undefined,
      candidateUnitId: bill ? undefined : deposit.guessedUnitId,
      partyName: bill ? this.tenantNameForBill(bill) : undefined,
      itemLabel:
        presentedBill && presentedBill.items.length > 0
          ? presentedBill.items.map((item) => item.label).join(" · ")
          : "입금",
      depositorName: deposit.depositorName,
      linkedBillRelation: bill
        ? deposit.matchStatus === "MATCHED"
          ? "matched"
          : "candidate"
        : undefined,
      linkedBill:
        bill && presentedBill
          ? {
              buildingName: room?.buildingName,
              unitId: room?.roomNo ?? this.normalizeUnitId(bill.unitId),
              tenantName: this.tenantNameForBill(bill),
              billingMonth: bill.billingMonth,
              dueDate: bill.dueDate,
              totalAmount: bill.totalAmount,
              paidAmount: bill.paidAmount,
              status: presentedBill.status,
              items: presentedBill.items
            }
          : undefined
    };
  }

  private presentManagerTransactionCost(
    managerId: string,
    cost: Cost & { status: "confirmed" | "amended" }
  ): TeamTransactionLedgerRow {
    const candidateRooms =
      cost.scope === "unit" && cost.unitId
        ? this.store.rooms.filter(
            (room) =>
              this.canManagerAccessRoom(managerId, room.id) &&
              this.unitsEqual(this.displayUnitId(room), cost.unitId)
          )
        : [];
    const room = candidateRooms.length === 1 ? candidateRooms[0] : undefined;
    const receipt = cost.receiptId
      ? this.store.receipts.find((candidate) => candidate.id === cost.receiptId)
      : undefined;

    return {
      id: cost.id,
      direction: "withdrawal",
      occurredAt: cost.date,
      amount: cost.amount,
      statusLabel:
        cost.status === "amended"
          ? "정정된 비용"
          : cost.verified
            ? "확정 비용"
            : "확정 비용 · 미검증",
      buildingName: room?.buildingName,
      unitId: cost.unitId,
      itemLabel: cost.item,
      cost: {
        type: cost.type,
        scope: cost.scope,
        verified: cost.verified,
        evidenceAvailable: Boolean(receipt?.hasEvidence),
        status: cost.status
      }
    };
  }

  private stageForDaysOverdue(daysOverdue: number): TeamOverdue["stage"] {
    if (daysOverdue >= 31) {
      return "SEVERE";
    }

    if (daysOverdue >= 8) {
      return "WARNING";
    }

    return "MINOR";
  }

  private presentDunningDraft(bill: Bill): TeamDunning {
    const tenantName = this.tenantNameForBill(bill);
    const unpaidAmount = this.unpaidAmount(bill);
    const dueDate = bill.dueDate.slice(0, 10);
    const room = this.roomForBill(bill);

    return {
      billId: bill.id,
      buildingName: room?.buildingName,
      unitId: room ? this.displayUnitId(room) : bill.unitId.replace(/호$/u, "").trim(),
      tenantName,
      billingMonth: bill.billingMonth,
      unpaidAmount,
      dueDate,
      daysOverdue: this.daysOverdueForBill(bill),
      draftText: `${tenantName}님, ${bill.billingMonth} 청구 잔액 ${unpaidAmount.toLocaleString("ko-KR")}원이 ${dueDate} 기준 미납으로 확인되어 안내드립니다. 이미 납부하셨다면 앱에서 입금 확인 신고를 남겨주세요.`,
      channel: "룸로그 알림",
      guard: this.dunningGuardForBill(bill)
    };
  }

  private loadStore(): Store {
    if (!this.storeFilePath || !existsSync(this.storeFilePath)) {
      return this.seedDemoData ? createDemoStore() : createEmptyStore();
    }

    const parsed = JSON.parse(readFileSync(this.storeFilePath, "utf8")) as unknown;

    if (!this.isStoreSnapshot(parsed)) {
      throw new Error(`Roomlog store snapshot is invalid: ${this.storeFilePath}`);
    }

    return this.normalizeStoreSnapshot(parsed);
  }

  private normalizeStoreSnapshot(parsed: Store): Store {
    return {
      ...parsed,
      socialAccounts: parsed.socialAccounts ?? [],
      vendors: (parsed.vendors ?? []).map((vendor) => ({
        ...vendor,
        trades: vendor.trades ?? [],
        serviceAreas: vendor.serviceAreas ?? []
      })),
      vendorInvites: parsed.vendorInvites ?? [],
      tenantInvites: parsed.tenantInvites ?? [],
      contracts: parsed.contracts ?? [],
      contractDocuments: parsed.contractDocuments ?? [],
      contractExtractions: parsed.contractExtractions ?? [],
      contractPrivacies: parsed.contractPrivacies ?? [],
      contractInvites: parsed.contractInvites ?? [],
      bills: (parsed.bills ?? []).map((bill) => ({
        ...bill,
        correctionHistory: bill.correctionHistory ?? [],
        depositConfirmationRequested: bill.depositConfirmationRequested ?? false,
        items: bill.items ?? []
      })),
      paymentReports: parsed.paymentReports ?? [],
      deposits: parsed.deposits ?? [],
      paymentTransactions: (parsed.paymentTransactions ?? []).map((transaction) => ({
        ...transaction,
        allocations: transaction.allocations ?? []
      })),
      maintenanceFees: (parsed.maintenanceFees ?? []).map((fee) => ({
        ...fee,
        items: fee.items ?? []
      })),
      attachments: parsed.attachments ?? [],
      floorPlans: (parsed.floorPlans ?? []).map((floorPlan) => ({
        ...floorPlan,
        roomId: floorPlan.roomId,
        extractionMeta: floorPlan.extractionMeta ?? { scaleConfirmed: false },
        openings: floorPlan.openings ?? [],
        fixtures: floorPlan.fixtures ?? [],
        furnitures: []
      })),
      moveInChecklist: parsed.moveInChecklist ?? [],
      aiFeedback: parsed.aiFeedback ?? [],
      rooms: parsed.rooms.map((room) => ({
        ...room,
        landlordId: room.landlordId ?? "landlord-demo"
      })),
      roomWalls: parsed.roomWalls ?? [],
      intakeSessions: parsed.intakeSessions.map((session) => ({
        ...session,
        draft: {
          ...session.draft,
          contextHints: session.draft.contextHints ?? [],
          nextQuestions: session.draft.nextQuestions ?? [],
          tenantGuidance: session.draft.tenantGuidance ?? [],
          photoAnalysis: session.draft.photoAnalysis ?? this.emptyPhotoAnalysis(),
          intakeSlots: session.draft.intakeSlots ?? [],
          requiredInfo: session.draft.requiredInfo ?? [],
          duplicateCandidates: session.draft.duplicateCandidates ?? []
        },
        messages: session.messages.map((message) => ({
          ...message,
          attachmentUrls: message.attachmentUrls ?? []
        }))
      })),
      messages: parsed.messages.map((message) => ({
        ...message,
        attachmentUrls: message.attachmentUrls ?? []
      })),
      costs: parsed.costs ?? [],
      receipts: parsed.receipts ?? [],
      receiptOcrs: (parsed.receiptOcrs ?? []).map((ocr) => this.cloneReceiptOcr(ocr)),
      messagingThreads: (parsed.messagingThreads ?? []).map((thread) => ({
        ...thread,
        archivedNotice: thread.archivedNotice ?? true,
        pendingRequest: thread.pendingRequest ?? false,
        unreadCount: thread.unreadCount ?? 0,
        managerUnreadCount: thread.managerUnreadCount ?? 0
      })),
      messagingMessages: (parsed.messagingMessages ?? []).map((message) => ({
        ...message,
        attachmentUrls: message.attachmentUrls ?? []
      })),
      messagingAnnouncementDrafts: (parsed.messagingAnnouncementDrafts ?? []).map((draft) => ({
        ...draft,
        targetRoomIds: draft.targetRoomIds ?? [],
        translations: draft.translations ?? []
      })),
      messagingAnnouncements: parsed.messagingAnnouncements ?? [],
      messagingAnnouncementDeliveries: parsed.messagingAnnouncementDeliveries ?? [],
      managerTicketReads: parsed.managerTicketReads ?? [],
      managerReports: (parsed.managerReports ?? []).map((report) => ({
        ...report,
        scope: {
          ...report.scope,
          roomIds: report.scope.roomIds ?? [],
          unitIds: report.scope.unitIds ?? []
        },
        nextActions: report.nextActions ?? [],
        sections: report.sections ?? [],
        linkedFollowUps: report.linkedFollowUps ?? []
      })),
      managerReportSourceReferences: parsed.managerReportSourceReferences ?? [],
      managerReportExternalShares: parsed.managerReportExternalShares ?? [],
      managerReportAuditLogs: parsed.managerReportAuditLogs ?? [],
      moveouts: parsed.moveouts ?? [],
      moveoutRecords: parsed.moveoutRecords ?? [],
      moveoutChecklist: parsed.moveoutChecklist ?? [],
      moveoutSettlements: (parsed.moveoutSettlements ?? []).map((settlement) => ({
        ...settlement,
        deductions: settlement.deductions ?? []
      })),
      moveoutDeductions: parsed.moveoutDeductions ?? [],
      moveoutDisputes: (parsed.moveoutDisputes ?? []).map((dispute) => ({
        ...dispute,
        history: dispute.history ?? []
      })),
      moveoutReportAudits: parsed.moveoutReportAudits ?? []
    };
  }

  private backfillDemoStoreSnapshot(snapshot: Store): Store {
    const demo = createDemoStore();

    return {
      ...snapshot,
      tenantRooms: {
        ...demo.tenantRooms,
        ...snapshot.tenantRooms
      },
      analyses: {
        ...demo.analyses,
        ...snapshot.analyses
      },
      users: mergeMissingById(snapshot.users, demo.users),
      socialAccounts: mergeMissingById(snapshot.socialAccounts, demo.socialAccounts),
      rooms: mergeMissingById(snapshot.rooms, demo.rooms),
      vendors: mergeMissingById(snapshot.vendors, demo.vendors),
      vendorInvites: mergeMissingById(snapshot.vendorInvites, demo.vendorInvites),
      tenantInvites: mergeMissingById(snapshot.tenantInvites, demo.tenantInvites),
      contracts: mergeMissingById(snapshot.contracts, demo.contracts),
      contractDocuments: mergeMissingById(snapshot.contractDocuments, demo.contractDocuments),
      contractExtractions: mergeMissingById(snapshot.contractExtractions, demo.contractExtractions),
      contractPrivacies: mergeMissingByKey(
        snapshot.contractPrivacies,
        demo.contractPrivacies,
        (privacy) => privacy.contractId
      ),
      contractInvites: mergeMissingById(snapshot.contractInvites, demo.contractInvites),
      bills: mergeMissingById(snapshot.bills, demo.bills),
      paymentReports: mergeMissingById(snapshot.paymentReports, demo.paymentReports),
      deposits: mergeMissingById(snapshot.deposits, demo.deposits),
      paymentTransactions: mergeMissingById(
        snapshot.paymentTransactions,
        demo.paymentTransactions
      ),
      maintenanceFees: mergeMissingById(snapshot.maintenanceFees, demo.maintenanceFees),
      attachments: mergeMissingById(snapshot.attachments, demo.attachments),
      floorPlans: mergeMissingById(snapshot.floorPlans, demo.floorPlans),
      moveInChecklist: mergeMissingById(snapshot.moveInChecklist, demo.moveInChecklist),
      aiFeedback: mergeMissingById(snapshot.aiFeedback, demo.aiFeedback),
      intakeSessions: mergeMissingById(snapshot.intakeSessions, demo.intakeSessions),
      complaints: mergeMissingById(snapshot.complaints, demo.complaints),
      tickets: mergeMissingById(snapshot.tickets, demo.tickets),
      repairs: mergeMissingById(snapshot.repairs, demo.repairs),
      costs: mergeMissingById(snapshot.costs, demo.costs),
      receipts: mergeMissingById(snapshot.receipts, demo.receipts),
      receiptOcrs: mergeMissingById(snapshot.receiptOcrs, demo.receiptOcrs),
      messages: mergeMissingById(snapshot.messages, demo.messages),
      messagingThreads: mergeMissingById(snapshot.messagingThreads, demo.messagingThreads),
      messagingMessages: mergeMissingById(snapshot.messagingMessages, demo.messagingMessages),
      messagingAnnouncementDrafts: mergeMissingById(
        snapshot.messagingAnnouncementDrafts,
        demo.messagingAnnouncementDrafts
      ),
      messagingAnnouncements: mergeMissingById(snapshot.messagingAnnouncements, demo.messagingAnnouncements),
      messagingAnnouncementDeliveries: mergeMissingById(
        snapshot.messagingAnnouncementDeliveries,
        demo.messagingAnnouncementDeliveries
      ),
      managerReports: mergeMissingById(snapshot.managerReports, demo.managerReports),
      managerReportSourceReferences: mergeMissingById(
        snapshot.managerReportSourceReferences,
        demo.managerReportSourceReferences
      ),
      managerReportExternalShares: mergeMissingById(
        snapshot.managerReportExternalShares,
        demo.managerReportExternalShares
      ),
      managerReportAuditLogs: mergeMissingById(snapshot.managerReportAuditLogs, demo.managerReportAuditLogs),
      moveouts: mergeMissingById(snapshot.moveouts, demo.moveouts),
      moveoutRecords: mergeMissingById(snapshot.moveoutRecords, demo.moveoutRecords),
      moveoutChecklist: mergeMissingById(snapshot.moveoutChecklist, demo.moveoutChecklist),
      moveoutSettlements: mergeMissingById(snapshot.moveoutSettlements, demo.moveoutSettlements),
      moveoutDeductions: mergeMissingById(snapshot.moveoutDeductions, demo.moveoutDeductions),
      moveoutDisputes: mergeMissingById(snapshot.moveoutDisputes, demo.moveoutDisputes),
      moveoutReportAudits: mergeMissingById(snapshot.moveoutReportAudits, demo.moveoutReportAudits),
      history: mergeMissingById(snapshot.history, demo.history)
    };
  }

  private hasDemoBackfillChanges(before: Store, after: Store) {
    const collectionKeys: Array<keyof Store> = [
      "users",
      "socialAccounts",
      "rooms",
      "vendors",
      "vendorInvites",
      "tenantInvites",
      "contracts",
      "contractDocuments",
      "contractExtractions",
      "contractPrivacies",
      "contractInvites",
      "bills",
      "paymentReports",
      "deposits",
      "maintenanceFees",
      "attachments",
      "floorPlans",
      "moveInChecklist",
      "aiFeedback",
      "intakeSessions",
      "complaints",
      "tickets",
      "repairs",
      "costs",
      "receipts",
      "receiptOcrs",
      "messages",
      "messagingThreads",
      "messagingMessages",
      "messagingAnnouncementDrafts",
      "messagingAnnouncements",
      "messagingAnnouncementDeliveries",
      "managerReports",
      "managerReportSourceReferences",
      "managerReportExternalShares",
      "managerReportAuditLogs",
      "moveouts",
      "moveoutRecords",
      "moveoutChecklist",
      "moveoutSettlements",
      "moveoutDeductions",
      "moveoutDisputes",
      "moveoutReportAudits",
      "history"
    ];

    const hasArrayBackfill = collectionKeys.some((key) => {
      const beforeValue = before[key];
      const afterValue = after[key];

      return (
        Array.isArray(beforeValue) &&
        Array.isArray(afterValue) &&
        beforeValue.length !== afterValue.length
      );
    });

    return (
      hasArrayBackfill ||
      Object.keys(before.tenantRooms).length !== Object.keys(after.tenantRooms).length ||
      Object.keys(before.analyses).length !== Object.keys(after.analyses).length
    );
  }

  private persistStore() {
    this.assertPersistenceAdmissionOpen();

    if (!this.storeFilePath) {
      this.projectStore();
      return;
    }

    mkdirSync(dirname(this.storeFilePath), { recursive: true });
    const tempFilePath = `${this.storeFilePath}.tmp`;
    // DB가 인증 원본인 환경에서는 JSON 백업에 passwordHash를 복제하지 않는다(민감정보 최소화).
    // DB 모드에서 JSON은 부팅 소스로 쓰이지 않으므로(initialStore가 우선) 빈 해시가 안전하다.
    const fileSnapshot = this.authRepository
      ? { ...this.store, users: this.store.users.map((user) => ({ ...user, passwordHash: "" })) }
      : this.store;
    writeFileSync(tempFilePath, JSON.stringify(fileSnapshot, null, 2));
    renameSync(tempFilePath, this.storeFilePath);
    this.projectStore();
  }

  private projectStore(): number {
    this.assertPersistenceAdmissionOpen();

    if (!this.storeProjector) {
      return this.persistenceGeneration;
    }

    const generation = ++this.persistenceGeneration;
    const snapshot = JSON.parse(JSON.stringify(this.store)) as Store;
    this.pendingPersistence = this.pendingPersistence
      .then(() => this.storeProjector!.persist(snapshot))
      .then(
        () => {
          this.completedPersistenceGeneration = Math.max(
            this.completedPersistenceGeneration,
            generation
          );
          if ((this.persistenceFailure?.generation ?? -1) <= generation) {
            this.persistenceFailure = undefined;
          }
        },
        (error) => {
          if (generation >= (this.persistenceFailure?.generation ?? -1)) {
            this.persistenceFailure = { generation, error };
          }
        }
      );
    return generation;
  }

  private assertPersistenceAdmissionOpen() {
    if (this.shutdownStarted) {
      throw new Error("서비스 종료 중에는 저장할 수 없습니다.");
    }
  }

  private isStoreSnapshot(value: unknown): value is Store {
    const snapshot = value as Partial<Store> | undefined;

    return Boolean(
      snapshot &&
        Array.isArray(snapshot.users) &&
        (snapshot.socialAccounts === undefined || Array.isArray(snapshot.socialAccounts)) &&
        Array.isArray(snapshot.rooms) &&
        (snapshot.roomWalls === undefined || Array.isArray(snapshot.roomWalls)) &&
        snapshot.tenantRooms &&
        Array.isArray(snapshot.vendors) &&
        (snapshot.vendorInvites === undefined || Array.isArray(snapshot.vendorInvites)) &&
        (snapshot.tenantInvites === undefined || Array.isArray(snapshot.tenantInvites)) &&
        (snapshot.contracts === undefined || Array.isArray(snapshot.contracts)) &&
        (snapshot.contractDocuments === undefined || Array.isArray(snapshot.contractDocuments)) &&
        (snapshot.contractExtractions === undefined || Array.isArray(snapshot.contractExtractions)) &&
        (snapshot.contractPrivacies === undefined || Array.isArray(snapshot.contractPrivacies)) &&
        (snapshot.contractInvites === undefined || Array.isArray(snapshot.contractInvites)) &&
        (snapshot.bills === undefined || Array.isArray(snapshot.bills)) &&
        (snapshot.paymentReports === undefined || Array.isArray(snapshot.paymentReports)) &&
        (snapshot.deposits === undefined || Array.isArray(snapshot.deposits)) &&
        (snapshot.paymentTransactions === undefined || Array.isArray(snapshot.paymentTransactions)) &&
        (snapshot.maintenanceFees === undefined || Array.isArray(snapshot.maintenanceFees)) &&
        (snapshot.attachments === undefined || Array.isArray(snapshot.attachments)) &&
        (snapshot.floorPlans === undefined || Array.isArray(snapshot.floorPlans)) &&
        (snapshot.moveInChecklist === undefined || Array.isArray(snapshot.moveInChecklist)) &&
        (snapshot.aiFeedback === undefined || Array.isArray(snapshot.aiFeedback)) &&
        Array.isArray(snapshot.intakeSessions) &&
        Array.isArray(snapshot.complaints) &&
        snapshot.analyses &&
        Array.isArray(snapshot.tickets) &&
        Array.isArray(snapshot.repairs) &&
        (snapshot.costs === undefined || Array.isArray(snapshot.costs)) &&
        (snapshot.receipts === undefined || Array.isArray(snapshot.receipts)) &&
        (snapshot.receiptOcrs === undefined || Array.isArray(snapshot.receiptOcrs)) &&
        (snapshot.messagingThreads === undefined || Array.isArray(snapshot.messagingThreads)) &&
        (snapshot.messagingMessages === undefined || Array.isArray(snapshot.messagingMessages)) &&
        (snapshot.messagingAnnouncementDrafts === undefined ||
          Array.isArray(snapshot.messagingAnnouncementDrafts)) &&
        (snapshot.messagingAnnouncements === undefined ||
          Array.isArray(snapshot.messagingAnnouncements)) &&
        (snapshot.messagingAnnouncementDeliveries === undefined ||
          Array.isArray(snapshot.messagingAnnouncementDeliveries)) &&
        (snapshot.managerTicketReads === undefined ||
          Array.isArray(snapshot.managerTicketReads)) &&
        (snapshot.managerReports === undefined || Array.isArray(snapshot.managerReports)) &&
        (snapshot.managerReportSourceReferences === undefined ||
          Array.isArray(snapshot.managerReportSourceReferences)) &&
        (snapshot.managerReportExternalShares === undefined ||
          Array.isArray(snapshot.managerReportExternalShares)) &&
        (snapshot.managerReportAuditLogs === undefined ||
          Array.isArray(snapshot.managerReportAuditLogs)) &&
        (snapshot.moveouts === undefined || Array.isArray(snapshot.moveouts)) &&
        (snapshot.moveoutRecords === undefined || Array.isArray(snapshot.moveoutRecords)) &&
        (snapshot.moveoutChecklist === undefined || Array.isArray(snapshot.moveoutChecklist)) &&
        (snapshot.moveoutSettlements === undefined || Array.isArray(snapshot.moveoutSettlements)) &&
        (snapshot.moveoutDeductions === undefined || Array.isArray(snapshot.moveoutDeductions)) &&
        (snapshot.moveoutDisputes === undefined || Array.isArray(snapshot.moveoutDisputes)) &&
        (snapshot.moveoutReportAudits === undefined || Array.isArray(snapshot.moveoutReportAudits)) &&
        Array.isArray(snapshot.messages) &&
        Array.isArray(snapshot.history)
    );
  }

  private validateComplaintInput(input: CreateComplaintInput) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      throw new BadRequestException("신고 제목을 입력해주세요.");
    }

    if (typeof input.description !== "string" || !input.description.trim()) {
      throw new BadRequestException("신고 내용을 입력해주세요.");
    }

    if (typeof input.location !== "string" || !input.location.trim()) {
      throw new BadRequestException("발생 위치를 입력해주세요.");
    }

    if (
      input.attachmentUrls !== undefined &&
      (!Array.isArray(input.attachmentUrls) ||
        input.attachmentUrls.some((url) => typeof url !== "string" || !url.trim()))
    ) {
      throw new BadRequestException("첨부 이미지 주소가 올바르지 않습니다.");
    }

    if (
      input.clientRequestId !== undefined &&
      (typeof input.clientRequestId !== "string" || !input.clientRequestId.trim())
    ) {
      throw new BadRequestException("접수 요청 식별자가 올바르지 않습니다.");
    }

    if (
      input.occurredAt !== undefined &&
      (typeof input.occurredAt !== "string" ||
        !this.isValidFullIsoDateTime(input.occurredAt))
    ) {
      throw new BadRequestException("발생 시점이 올바르지 않습니다.");
    }

    if (
      input.availableTimes !== undefined &&
      (typeof input.availableTimes !== "string" || !input.availableTimes.trim())
    ) {
      throw new BadRequestException("방문 가능 시간이 올바르지 않습니다.");
    }

    if (input.urgency !== undefined && ![1, 2, 3, 4].includes(input.urgency)) {
      throw new BadRequestException("긴급도는 1부터 4 사이로 입력해주세요.");
    }
  }

  private isValidFullIsoDateTime(value: string) {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/u
    );
    if (!match) return false;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;

    const timezoneOffsetMinutes =
      match[8] === "Z"
        ? 0
        : (match[9] === "+" ? 1 : -1) *
          (Number(match[10]) * 60 + Number(match[11]));
    const calendarAtInputOffset = new Date(
      parsed.getTime() + timezoneOffsetMinutes * 60 * 1000
    );
    const expectedMilliseconds = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));

    return (
      calendarAtInputOffset.getUTCFullYear() === Number(match[1]) &&
      calendarAtInputOffset.getUTCMonth() + 1 === Number(match[2]) &&
      calendarAtInputOffset.getUTCDate() === Number(match[3]) &&
      calendarAtInputOffset.getUTCHours() === Number(match[4]) &&
      calendarAtInputOffset.getUTCMinutes() === Number(match[5]) &&
      calendarAtInputOffset.getUTCSeconds() === Number(match[6]) &&
      calendarAtInputOffset.getUTCMilliseconds() === expectedMilliseconds
    );
  }

  private complaintRequestFingerprint(
    roomId: string,
    input: CreateComplaintInput & { reportedVia?: ManagerProxyIntakeInput["reportedVia"] }
  ) {
    const payload: Record<string, unknown> = {
      roomId,
      title: input.title,
      description: input.description,
      location: input.location,
      occurredAt: input.occurredAt ?? null,
      availableTimes: input.availableTimes ?? null,
      urgency: input.urgency ?? null,
      attachmentUrls: input.attachmentUrls ?? []
    };
    if (input.reportedVia !== undefined) payload.reportedVia = input.reportedVia;

    return createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  private emptyDraft(): IntakeDraft {
    return {
      title: "상담 초안",
      summary: "아직 접수할 내용이 충분하지 않습니다.",
      category: "기타",
      detailCategory: "확인 필요",
      priority: 4,
      responsibilityHint: "판단 어려움",
      confidenceScore: 0,
      reasons: ["상담 시작 전"],
      recommendedAction: "문제 위치와 증상을 먼저 확인하세요.",
      contextHints: [],
      nextQuestions: [
        "어느 공간의 어떤 부위에서 문제가 보이나요?",
        "언제부터 시작됐고 지금도 계속되고 있나요?",
        "방문 가능한 시간대가 언제인가요?"
      ],
      tenantGuidance: ["사진이 있으면 상담창에 첨부해 주세요."],
      photoAnalysis: this.emptyPhotoAnalysis(),
      intakeSlots: [
        {
          key: "symptom",
          label: "증상",
          status: "NEEDS_INFO",
          evidence: "아직 세입자 증상이 없습니다.",
          action: "어떤 문제가 보이는지 한 문장으로 알려주세요."
        },
        {
          key: "location",
          label: "위치",
          status: "NEEDS_INFO",
          evidence: "문제 위치가 필요합니다.",
          action: "방/공간과 문제 부위를 알려주세요."
        },
        {
          key: "occurrence",
          label: "발생 시점",
          status: "NEEDS_INFO",
          evidence: "언제부터 발생했는지 아직 모릅니다.",
          action: "언제 시작됐고 지금도 계속되는지 알려주세요."
        },
        {
          key: "risk",
          label: "위험 여부",
          status: "NEEDS_INFO",
          evidence: "안전 위험 여부를 확인해야 합니다.",
          action: "전기, 가스, 침수, 문 잠김 같은 안전 위험이 있는지 알려주세요."
        },
        {
          key: "photo",
          label: "사진",
          status: "NEEDS_INFO",
          evidence: "사진이 아직 첨부되지 않았습니다.",
          action: "문제 부위 근접 사진과 공간 전체 사진을 올려주세요."
        },
        {
          key: "visitTime",
          label: "방문 가능 시간",
          status: "NEEDS_INFO",
          evidence: "방문 가능 시간이 필요합니다.",
          action: "관리자나 업체가 확인할 수 있는 시간대를 알려주세요."
        }
      ],
      requiredInfo: ["문제 위치", "증상", "방문 가능 시간"],
      photoRequested: false,
      readyToFinalize: false,
      filingIntent: false,
      duplicateCandidates: []
    };
  }

  private emptyPhotoAnalysis(): PhotoAnalysis {
    return {
      attachmentUrls: [],
      previousAttachmentUrls: [],
      candidates: [],
      comparisonStatus: "추가 사진 필요",
      summary: "사진이 아직 첨부되지 않았습니다.",
      evidence: ["사진 첨부 후 문제 후보와 비교 상태를 분석합니다."],
      recommendedRetake: false
    };
  }

  private detectOccurrenceInfo(text: string) {
    const compact = text.replace(/\s+/g, " ").trim();

    if (!compact) {
      return undefined;
    }

    const match = compact.match(
      /(방금|어제(?:부터)?|오늘\s*(?:아침|오전|낮|오후|저녁|밤)?\s*부터|오늘부터|오늘\s*(?:처음|다시|또)|지난\s*\d*\s*(?:주|달|개월|일)?|며칠\s*(?:전|째|동안)?|\d{1,2}\s*일\s*전|\d{1,2}\s*시간\s*전|계속|지금도|반복|시작(?:됐|되었)?|발생(?:했|하였)?|떨어지(?:고|는|며|네요|나요|습니다)|떨어(?:집니다|져|졌)|새(?:고|는|네요|나요|어)|샙니다|고이(?:고|는|며|네요|나요|었습니다)|젖(?:고|은|었습니다)|잠기지\s*않|안\s*잠|나지\s*않|안\s*나|작동하지\s*않|고장(?:났|입니다)|[가-힣0-9]+\s*부터)/
    );

    return match?.[0]?.trim();
  }

  private detectSafetyRiskInfo(
    text: string,
    category: IntakeDraft["category"],
    priority: IntakeDraft["priority"]
  ) {
    if (category !== "하자") {
      return undefined;
    }

    if (priority === 1) {
      return "긴급 위험 가능성";
    }

    const compact = text.replace(/\s+/g, " ").trim();
    const match = compact.match(
      /(위험(?:은|한)?\s*(?:없|아니)|안전(?:은)?\s*(?:괜찮|문제\s*없)|전기(?:나|는|와)?\s*(?:가스)?[^.。!?]{0,16}(?:없|아니|괜찮)|가스[^.。!?]{0,16}(?:없|아니|괜찮)|침수[^.。!?]{0,16}(?:없|아니)|문[^.。!?]{0,12}잠[^.。!?]{0,12}(?:괜찮|됩)|위험|가스|누전|전기|콘센트|스위치|침수|잠기지|문이 안|불꽃|화재|감전|안전|천장에서\s*물|물이\s*(?:떨어|새|샘|고이)|누수|바닥(?:에|이)?\s*(?:물|젖)|곰팡이\s*냄새|도어락)/
    );

    return match?.[0]?.trim();
  }

  private buildIntakeSlots(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    location?: string;
    availableTimes?: string;
    photoRequested: boolean;
  }): IntakeSlot[] {
    const text = input.text.trim();
    const occurrenceInfo = this.detectOccurrenceInfo(text);
    const riskInfo = this.detectSafetyRiskInfo(text, input.category, input.priority);
    const photoIsUseful =
      input.category === "하자" &&
      (input.photoRequested ||
        ["누수", "곰팡이", "벽지", "바닥", "에어컨", "도어락", "보일러"].includes(
          input.detailCategory
        ));

    return [
      {
        key: "symptom",
        label: "증상",
        status: text ? "COLLECTED" : "NEEDS_INFO",
        value: text ? this.compactThreadMessage(text, text) : undefined,
        evidence: text ? "세입자 증상을 확인했습니다." : "아직 세입자 증상이 없습니다.",
        action: text ? undefined : "어떤 문제가 보이는지 한 문장으로 알려주세요."
      },
      {
        key: "location",
        label: "위치",
        status: input.location ? "COLLECTED" : "NEEDS_INFO",
        value: input.location,
        evidence: input.location
          ? `${input.location} 위치를 확인했습니다.`
          : "문제 위치가 필요합니다.",
        action: input.location ? undefined : "방/공간과 문제 부위를 알려주세요."
      },
      {
        key: "occurrence",
        label: "발생 시점",
        status: occurrenceInfo ? "COLLECTED" : input.category === "하자" ? "NEEDS_INFO" : "OPTIONAL",
        value: occurrenceInfo,
        evidence: occurrenceInfo
          ? "발생 시점이나 지속 여부를 확인했습니다."
          : input.category === "하자"
            ? "언제부터 발생했는지 아직 모릅니다."
            : "일반 문의라 발생 시점 확인은 선택 사항입니다.",
        action: occurrenceInfo
          ? undefined
          : input.category === "하자"
            ? "언제 시작됐고 지금도 계속되는지 알려주세요."
            : undefined
      },
      {
        key: "risk",
        label: "위험 여부",
        status: riskInfo ? "COLLECTED" : input.category === "하자" ? "NEEDS_INFO" : "OPTIONAL",
        value: riskInfo,
        evidence: riskInfo
          ? "안전 위험 판단에 필요한 단서를 확인했습니다."
          : input.category === "하자"
            ? "안전 위험 여부를 확인해야 합니다."
            : "일반 문의라 위험 확인은 선택 사항입니다.",
        action: riskInfo
          ? undefined
          : input.category === "하자"
            ? "전기, 가스, 침수, 문 잠김 같은 안전 위험이 있는지 알려주세요."
            : undefined
      },
      {
        key: "photo",
        label: "사진",
        status: input.hasPhoto ? "COLLECTED" : photoIsUseful ? "NEEDS_INFO" : "OPTIONAL",
        value: input.hasPhoto ? "첨부됨" : undefined,
        evidence: input.hasPhoto
          ? "사진이 이 상담 스레드에 첨부되었습니다."
          : photoIsUseful
            ? "사진이 있으면 관리자 판단이 빨라집니다."
            : "사진은 선택 사항입니다.",
        action: input.hasPhoto
          ? undefined
          : photoIsUseful
            ? "문제 부위 근접 사진과 공간 전체 사진을 올려주세요."
            : undefined
      },
      {
        key: "visitTime",
        label: "방문 가능 시간",
        status: input.availableTimes
          ? "COLLECTED"
          : input.category === "하자"
            ? "NEEDS_INFO"
            : "OPTIONAL",
        value: input.availableTimes,
        evidence: input.availableTimes
          ? `${input.availableTimes} 방문 가능 시간을 확인했습니다.`
          : input.category === "하자"
            ? "방문 가능 시간이 필요합니다."
            : "방문 일정이 필요하면 추가로 확인합니다.",
        action: input.availableTimes
          ? undefined
          : input.category === "하자"
            ? "관리자나 업체가 확인할 수 있는 시간대를 알려주세요."
            : undefined
      }
    ];
  }

  private intakeSlotCounts(slots: IntakeSlot[]) {
    return {
      collectedSlotCount: slots.filter((slot) => slot.status === "COLLECTED").length,
      openSlotCount: slots.filter((slot) => slot.status === "NEEDS_INFO").length
    };
  }

  private createIntakeMessage(
    sessionId: string,
    sender: IntakeMessage["sender"],
    messageText: string,
    inputMode: IntakeMessage["inputMode"]
  ): IntakeMessage {
    return {
      id: id("imsg"),
      sessionId,
      sender,
      messageText,
      attachmentUrls: [],
      inputMode,
      createdAt: now()
    };
  }

  private sessionHasPhoto(session: IntakeSession) {
    return session.messages.some(
      (message) => message.sender === "TENANT" && message.attachmentUrls.length > 0
    );
  }

  private buildIntakeDraft(session: IntakeSession): IntakeDraft {
    const tenantMessages = session.messages.filter((message) => message.sender === "TENANT");
    const text = tenantMessages
      .map((message) => [message.messageText, message.transcriptText].filter(Boolean).join(" "))
      .join(" ");
    const hasPhoto = tenantMessages.some((message) => message.attachmentUrls.length > 0);
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const location = this.extractLocation(text) || room?.roomNo;
    const availableTimes = this.extractAvailableTimes(text);
    const detailCategory = this.detectDetailCategory(text);
    const category = this.detectMainCategory(text, detailCategory);
    const priority = this.detectPriority(text, detailCategory);
    const occurredAt = this.detectOccurrenceInfo(text);
    const safetyRiskInfo = this.detectSafetyRiskInfo(text, category, priority);
    const photoRequested = category === "하자" && ["누수", "곰팡이", "벽지", "바닥", "에어컨"].includes(detailCategory) && !hasPhoto;
    const requiredInfo: string[] = [];

    if (!text.trim()) {
      requiredInfo.push("증상");
    }

    if (!location) {
      requiredInfo.push("문제 위치");
    }

    if (photoRequested && priority !== 1) {
      requiredInfo.push("문제 부위 사진");
    }

    if (!occurredAt && category === "하자") {
      requiredInfo.push("발생 시점");
    }

    if (!safetyRiskInfo && category === "하자") {
      requiredInfo.push("안전 위험 여부");
    }

    if (!availableTimes && category === "하자") {
      requiredInfo.push("방문 가능 시간");
    }

    const responsibilityHint = this.detectResponsibilityHint(text);
    const contextHints = this.roomContextHints(session, text, detailCategory);
    const duplicateCandidates = this.duplicateCandidatesForIntake(
      session,
      text,
      detailCategory,
      location
    );
    const photoAnalysis = this.buildPhotoAnalysis(session, text, detailCategory, hasPhoto);
    const nextQuestions = this.nextQuestionsForDraft({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      photoRequested,
      location,
      availableTimes,
      duplicateCandidates
    });
    const intakeSlots = this.buildIntakeSlots({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      location,
      availableTimes,
      photoRequested
    });
    const tenantGuidance = this.tenantGuidanceForDraft({
      text,
      category,
      detailCategory,
      priority,
      hasPhoto,
      contextHints,
      duplicateCandidates
    });
    const summaryLocation = location ?? room?.roomNo ?? "호실";
    const summary = `${summaryLocation}에서 ${detailCategory} 관련 문제가 접수되었습니다. ${
      priority === 1
        ? "피해 확산 또는 안전 위험 가능성이 있어 당일 확인이 필요합니다."
        : priority === 2
          ? "생활 불편이 커 빠른 확인과 일정 조율이 필요합니다."
          : "관리자 확인 후 일반 처리로 진행할 수 있습니다."
    }`;

    return {
      title: `${summaryLocation} ${detailCategory}`,
      summary,
      category,
      detailCategory,
      priority,
      responsibilityHint,
      confidenceScore: requiredInfo.length === 0 ? 0.84 : 0.58,
      reasons: [
        ...this.analysisReasons(text, detailCategory, priority, hasPhoto),
        ...contextHints,
        ...duplicateCandidates.map(
          (candidate) => `중복 가능 티켓: ${candidate.title} (${candidate.displayStatus})`
        )
      ],
      recommendedAction:
        duplicateCandidates.length
          ? "중복 가능성이 있는 기존 티켓이 있습니다. 같은 문제라면 기존 티켓에 상담 내용을 추가하고, 별도 문제라면 새 티켓으로 접수하세요."
          : contextHints.length
          ? "같은 호실의 과거 기록과 현재 증상을 함께 확인하고, 반복 하자 가능성을 관리자에게 전달하세요."
          : priority === 1
          ? "관리자에게 긴급 티켓으로 전달하고 누수 확산 여부와 전기 안전을 먼저 확인하세요."
          : photoRequested
            ? "문제 부위 사진을 받은 뒤 접수 초안을 확정하세요."
            : "관리자 검토 후 추가 정보 요청 또는 업체 배정을 진행하세요.",
      contextHints,
      nextQuestions,
      tenantGuidance,
      photoAnalysis,
      intakeSlots,
      requiredInfo,
      photoRequested,
      readyToFinalize: requiredInfo.length === 0,
      filingIntent: this.detectFilingIntent(text),
      location,
      occurredAt,
      availableTimes,
      duplicateCandidates
    };
  }

  // 세입자가 접수를 명시적으로 요청했는지(로컬 폴백 판정) — 단순 증상 설명은 해당하지 않는다.
  private detectFilingIntent(text: string) {
    const compact = text.replace(/\s+/g, "");
    return /(민원|하자|신고|티켓)(을|를)?(넣|올려|접수)|접수(해줘|해주세요|해요|하고싶|부탁|진행|원해|할래|할게)|신고(해줘|해주세요|하고싶|할래|할게)|넣어줘|넣어주세요|올려줘|올려주세요/.test(
      compact
    );
  }

  private nextQuestionsForDraft(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    photoRequested: boolean;
    location?: string;
    availableTimes?: string;
    duplicateCandidates: DuplicateTicketCandidate[];
  }) {
    const questions: string[] = [];
    const occurrenceInfo = this.detectOccurrenceInfo(input.text);
    const safetyRiskInfo = this.detectSafetyRiskInfo(input.text, input.category, input.priority);

    if (!input.location) {
      questions.push("문제가 보이는 정확한 공간과 부위를 알려주실 수 있나요?");
    }

    if (
      input.priority === 1 &&
      /(누수|천장|물이|침수|바닥)/.test(`${input.text} ${input.detailCategory}`)
    ) {
      questions.push("물이 지금도 떨어지고 있나요, 전기 콘센트나 조명 근처로 번졌나요?");
    } else if (!occurrenceInfo && input.category === "하자") {
      questions.push("언제부터 시작됐고 지금도 같은 증상이 계속되고 있나요?");
    }

    if (!safetyRiskInfo && input.category === "하자") {
      questions.push("전기, 가스, 침수, 문 잠김처럼 바로 위험한 상황은 없나요?");
    }

    if (
      input.category === "하자" &&
      !input.hasPhoto &&
      (input.photoRequested || ["누수", "곰팡이", "벽지", "바닥", "에어컨"].includes(input.detailCategory))
    ) {
      questions.push("문제 부위 근접 사진 1장과 공간 전체가 보이는 사진 1장을 올려주실 수 있나요?");
    }

    if (!input.availableTimes && input.category === "하자") {
      questions.push("관리자나 업체가 확인할 수 있는 방문 가능 시간대가 언제인가요?");
    }

    if (input.duplicateCandidates.length) {
      questions.push("같은 문제라면 기존 티켓에 추가할까요, 별도 문제라 새 티켓으로 접수할까요?");
    }

    if (questions.length === 0 && input.category !== "하자") {
      questions.push("확인받고 싶은 핵심 내용이나 관련 문서/사진이 있으면 함께 알려주세요.");
    }

    return questions.slice(0, 3);
  }

  private tenantGuidanceForDraft(input: {
    text: string;
    category: IntakeDraft["category"];
    detailCategory: string;
    priority: IntakeDraft["priority"];
    hasPhoto: boolean;
    contextHints: string[];
    duplicateCandidates: DuplicateTicketCandidate[];
  }) {
    const text = `${input.text} ${input.detailCategory}`;
    const guidance: string[] = [];

    if (/(가스|가스 냄새|gas)/i.test(text)) {
      guidance.push("가스 냄새가 강하면 창문을 열고 불꽃이나 전기 스위치는 만지지 말아주세요.");
    } else if (input.priority === 1 && /(누수|천장|물이|침수|바닥)/.test(text)) {
      guidance.push("물고임이 전기 콘센트, 조명, 스위치 근처라면 만지지 말고 안전한 곳에서 기다려주세요.");
    } else if (input.priority === 1 && /(누전|감전|전기|콘센트)/.test(text)) {
      guidance.push("전기 설비 주변 문제는 직접 만지지 말고 가능한 경우 관리자에게 차단기 확인을 요청하세요.");
    }

    if (input.category === "하자" && !input.hasPhoto) {
      guidance.push("사진은 문제 부위 근접 사진과 공간 전체 사진을 함께 올리면 관리자가 더 빨리 판단할 수 있습니다.");
    }

    if (input.contextHints.length) {
      guidance.push("같은 호실의 과거 기록은 참고 자료로만 쓰고, 현재 상태는 이번 상담 내용 기준으로 확인하겠습니다.");
    }

    if (input.duplicateCandidates.length) {
      guidance.push("중복 가능성이 있는 경우 새 접수 대신 기존 티켓에 추가 설명과 사진을 연결할 수 있습니다.");
    }

    if (guidance.length === 0) {
      guidance.push("추가 설명을 보내면 같은 상담 스레드에서 이어서 정리하겠습니다.");
    }

    return guidance.slice(0, 4);
  }

  private buildPhotoAnalysis(
    session: IntakeSession,
    text: string,
    detailCategory: string,
    hasPhoto: boolean
  ): PhotoAnalysis {
    const attachmentUrls = Array.from(
      new Set(
        session.messages
          .filter((message) => message.sender === "TENANT")
          .flatMap((message) => message.attachmentUrls)
      )
    );
    const candidates = this.photoCandidatesFor(detailCategory, text);

    if (!hasPhoto || attachmentUrls.length === 0) {
      return {
        attachmentUrls: [],
        previousAttachmentUrls: [],
        candidates,
        comparisonStatus: "추가 사진 필요",
        summary:
          candidates.length > 0
            ? `${candidates.join(", ")} 여부를 확인할 수 있는 사진이 필요합니다.`
            : "사진이 아직 첨부되지 않았습니다.",
        evidence: ["현재 상담 스레드에 하자 사진이 없습니다."],
        recommendedRetake: false
      };
    }

    const previousEntries = this.roomHistoryEntriesForIntake(session).filter(
      (entry) =>
        entry.attachmentUrls.length > 0 &&
        this.timelineEntryMatchesPhotoContext(entry, text, detailCategory)
    );
    const baselineItems = this.moveInChecklistBaselinesForPhoto(
      session.roomId,
      text,
      detailCategory
    );
    const previousAttachmentUrls = Array.from(
      new Set([
        ...baselineItems.flatMap((item) => item.attachmentUrls),
        ...previousEntries.flatMap((entry) => entry.attachmentUrls)
      ])
    ).filter((url) => !attachmentUrls.includes(url));
    const comparisonStatus: PhotoComparisonStatus = baselineItems.length
      ? "신규 발생 가능성"
      : previousAttachmentUrls.length
        ? "기존 하자 가능성"
        : "비교 어려움";
    const evidence = [
      `현재 첨부 사진 ${attachmentUrls.length}건이 기존 티켓에 연결됨`,
      candidates.length
        ? `텍스트와 사진 맥락상 ${candidates.join(", ")} 후보를 우선 검토`
        : "사진 후보는 관리자 검토가 필요함"
    ];

    if (baselineItems.length) {
      evidence.push(`입주 전 체크리스트 기준 사진 ${baselineItems.length}개 항목과 비교 필요`);
    } else if (previousAttachmentUrls.length) {
      evidence.push(`같은 호실의 과거 관련 사진 ${previousAttachmentUrls.length}건과 비교 필요`);
    } else {
      evidence.push("비교 가능한 같은 위치의 과거 사진을 찾지 못함");
    }

    return {
      attachmentUrls,
      previousAttachmentUrls,
      candidates,
      comparisonStatus,
      summary: baselineItems.length
        ? "입주 전 체크리스트 기준 사진이 있어 신규 발생 가능성을 함께 검토해야 합니다."
        : previousAttachmentUrls.length
        ? "같은 호실의 과거 관련 사진이 있어 반복 또는 기존 하자 가능성을 함께 검토해야 합니다."
        : "현재 사진은 접수 자료로 연결되었지만 같은 위치의 과거 사진이 부족해 비교가 어렵습니다.",
      evidence,
      recommendedRetake: previousAttachmentUrls.length === 0 && attachmentUrls.length < 2
    };
  }

  private photoCandidatesFor(detailCategory: string, text: string) {
    const candidates = new Set<string>();
    const normalized = `${detailCategory} ${text}`;

    if (/(누수|물|천장|샘|침수)/.test(normalized)) {
      candidates.add("누수");
    }

    if (/(곰팡이|얼룩)/.test(normalized)) {
      candidates.add("곰팡이");
    }

    if (/(벽지|도배)/.test(normalized)) {
      candidates.add("벽지 훼손");
    }

    if (/(바닥|마루|장판)/.test(normalized)) {
      candidates.add("바닥 손상");
    }

    if (/(에어컨|냉방|실내기)/.test(normalized)) {
      candidates.add("에어컨 문제");
    }

    if (/(창틀|창문|샷시)/.test(normalized)) {
      candidates.add("창틀 문제");
    }

    if (candidates.size === 0 && detailCategory && detailCategory !== "확인 필요") {
      candidates.add(detailCategory);
    }

    return Array.from(candidates);
  }

  private moveInChecklistBaselinesForPhoto(
    roomId: string,
    text: string,
    detailCategory: string
  ) {
    return this.store.moveInChecklist.filter(
      (item) =>
        item.roomId === roomId &&
        item.attachmentUrls.length > 0 &&
        this.moveInChecklistItemMatchesPhotoContext(item, text, detailCategory)
    );
  }

  private moveInChecklistItemMatchesPhotoContext(
    item: MoveInChecklistItem,
    text: string,
    detailCategory: string
  ) {
    const itemText = `${item.area} ${item.itemName} ${item.memo ?? ""}`;
    const normalizedText = `${detailCategory} ${text}`;

    return (
      itemText.includes(detailCategory) ||
      (/(화장실|욕실|천장|누수|물|침수)/.test(normalizedText) &&
        /(화장실|욕실|천장|누수|물|침수)/.test(itemText)) ||
      (/(싱크대|주방|수전|배수)/.test(normalizedText) &&
        /(싱크대|주방|수전|배수)/.test(itemText)) ||
      (/(벽지|도배|곰팡이|얼룩)/.test(normalizedText) &&
        /(벽지|도배|곰팡이|얼룩)/.test(itemText)) ||
      (/(바닥|마루|장판)/.test(normalizedText) && /(바닥|마루|장판)/.test(itemText)) ||
      (/(창틀|창문|샷시)/.test(normalizedText) && /(창틀|창문|샷시)/.test(itemText)) ||
      (/(에어컨|실내기|냉방)/.test(normalizedText) && /(에어컨|실내기|냉방)/.test(itemText))
    );
  }

  private timelineEntryMatchesPhotoContext(
    entry: RoomTimelineEntry,
    text: string,
    detailCategory: string
  ) {
    const entryText = `${entry.title} ${entry.description} ${entry.status ?? ""}`;
    const normalizedText = `${detailCategory} ${text}`;

    return (
      entryText.includes(detailCategory) ||
      (/(누수|물|천장|침수)/.test(normalizedText) && /(누수|물|천장|침수)/.test(entryText)) ||
      (/(곰팡이|얼룩)/.test(normalizedText) && /(곰팡이|얼룩)/.test(entryText)) ||
      (/(벽지|도배)/.test(normalizedText) && /(벽지|도배)/.test(entryText)) ||
      (/(바닥|마루|장판)/.test(normalizedText) && /(바닥|마루|장판)/.test(entryText)) ||
      (/(에어컨|냉방|실내기)/.test(normalizedText) && /(에어컨|냉방|실내기)/.test(entryText)) ||
      (/(창틀|창문|샷시)/.test(normalizedText) && /(창틀|창문|샷시)/.test(entryText))
    );
  }

  private async generateIntakeTurn(
    session: IntakeSession,
    fallbackDraft: IntakeDraft
  ): Promise<GeneratedIntakeTurn> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        source: "fallback",
        draft: fallbackDraft,
        assistantMessage: this.composeAssistantReply(fallbackDraft, session)
      };
    }

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": this.safetyIdentifier(session.tenantId, session.id)
        },
        body: JSON.stringify({
          model: process.env.OPENAI_CHAT_MODEL || "gpt-5.4-mini",
          instructions: this.buildIntakeResponseInstructions(session),
          input: [
            {
              role: "user",
              content: await this.buildIntakeResponseContent(session, fallbackDraft)
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "roomlog_intake_turn",
              strict: true,
              schema: this.intakeTurnJsonSchema()
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI Responses failed with ${response.status}`);
      }

      const responseBody = (await response.json()) as Record<string, unknown>;
      const parsed = this.parseOpenAIIntakeTurn(responseBody);
      const draft = this.normalizeGeneratedDraft(parsed.draft, fallbackDraft);

      return {
        source: "openai",
        draft,
        assistantMessage: this.ensureAssistantReplyQuality(
          parsed.assistantMessage,
          draft,
          session
        )
      };
    } catch {
      return {
        source: "fallback",
        draft: fallbackDraft,
        assistantMessage: [
          "OpenAI 상담 생성에 일시적으로 연결하지 못해 로컬 안전 지침으로 먼저 정리합니다.",
          this.composeAssistantReply(fallbackDraft, session)
        ].join("\n")
      };
    }
  }

  private composeAssistantReply(draft: IntakeDraft, session?: IntakeSession) {
    const threadText = this.threadText(session);
    const safetyLines = this.safetyGuidance(threadText, draft);
    const tenantGuidanceLines = draft.tenantGuidance.filter(
      (line) => !(safetyLines.length && /(전기|콘센트|스위치|물고임)/.test(line))
    );
    const guidanceLines = Array.from(new Set([...safetyLines, ...tenantGuidanceLines]));
    const currentPhotoCount =
      draft.photoAnalysis.attachmentUrls.length ||
      session?.messages.reduce((total, message) => total + message.attachmentUrls.length, 0) ||
      0;
    const needsPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const contextLines = draft.contextHints.slice(0, 2);
    const duplicateLines = draft.duplicateCandidates.length
      ? [
          `중복 가능성이 있는 기존 티켓이 ${draft.duplicateCandidates.length}건 있습니다.`,
          `가장 유사한 티켓: ${draft.duplicateCandidates[0].title} (${draft.duplicateCandidates[0].displayStatus})`
        ]
      : [];
    const questionLines = draft.nextQuestions.slice(0, 3).map((question) => `- ${question}`);

    if (!draft.readyToFinalize) {
      return [
        "확인할게요. 이 상담 스레드에서 이어서 정리하고 있어요.",
        "제가 이해한 내용",
        `- ${draft.summary}`,
        `- 분류: ${draft.category} / ${draft.detailCategory}, 긴급도 P${draft.priority}`,
        draft.location ? `- 위치: ${draft.location}` : "",
        draft.availableTimes ? `- 방문 가능 시간: ${draft.availableTimes}` : "",
        "지금 할 일",
        ...(guidanceLines.length ? guidanceLines.map((line) => `- ${line}`) : ["- 추가 설명을 보내면 같은 상담 스레드에서 이어서 반영하겠습니다."]),
        needsPhoto || currentPhotoCount
          ? [
              "필요한 사진",
              currentPhotoCount
                ? `- 현재 첨부 사진 ${currentPhotoCount}건을 이 상담 스레드에 연결했습니다.`
                : "- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올려주세요.",
              `- 사진 판단: ${draft.photoAnalysis.summary}`
            ].join("\n")
          : "",
        [...contextLines, ...duplicateLines].length
          ? ["관리자 참고 맥락", ...[...contextLines, ...duplicateLines].map((line) => `- ${line}`)].join("\n")
          : "",
        questionLines.length ? "다음으로 확인할 질문" : "",
        ...questionLines,
        "접수 상태",
        draft.requiredInfo.length
          ? `- 추가 정보 필요: ${draft.requiredInfo.join(", ")}. 답변을 받으면 관리자에게 전달할 접수 초안을 갱신하겠습니다.`
          : "- 추가 확인 답변을 받으면 관리자에게 전달할 접수 초안 준비 여부를 다시 판단하겠습니다.",
        "- 답변과 사진은 이 상담 스레드에 이어서 저장됩니다."
      ].filter(Boolean).join("\n");
    }

    return [
      "접수 초안이 준비되었습니다. 이 상담 스레드의 내용을 아래처럼 정리했습니다.",
      "제가 이해한 내용",
      `- ${draft.summary}`,
      `- 분류: ${draft.category} / ${draft.detailCategory}, 긴급도 P${draft.priority}`,
      `- 책임 가능성: ${draft.responsibilityHint} 참고`,
      draft.location ? `- 위치: ${draft.location}` : "",
      draft.availableTimes ? `- 방문 가능 시간: ${draft.availableTimes}` : "",
      "지금 할 일",
      ...(guidanceLines.length ? guidanceLines.map((line) => `- ${line}`) : ["- 내용이 맞는지 확인한 뒤 접수 확정을 눌러주세요."]),
      needsPhoto || currentPhotoCount
        ? [
            "필요한 사진",
            currentPhotoCount
              ? `- 현재 첨부 사진 ${currentPhotoCount}건을 관리자 검토 자료로 연결했습니다.`
              : "- 문제 부위 근접 사진 1장과 공간 전체 사진 1장을 올리면 관리자 판단이 빨라집니다.",
            `- 사진 판단: ${draft.photoAnalysis.summary}`
          ].join("\n")
        : "",
      [...contextLines, ...duplicateLines].length
        ? ["관리자 참고 맥락", ...[...contextLines, ...duplicateLines].map((line) => `- ${line}`)].join("\n")
        : "",
      draft.nextQuestions.length
        ? ["다음으로 확인할 질문", ...questionLines].join("\n")
        : "",
      "접수 상태",
      "- 접수 확정 가능: 내용이 맞으면 관리자 티켓으로 전달할 수 있습니다.",
      "- 이후 답변과 사진도 같은 상담 스레드에 이어서 저장됩니다."
    ].filter(Boolean).join("\n");
  }

  private ensureAssistantReplyQuality(
    message: string | undefined,
    draft: IntakeDraft,
    session?: IntakeSession
  ) {
    const generated = message?.trim() ?? "";
    const composed = this.composeAssistantReply(draft, session);

    if (!generated) {
      return composed;
    }

    const compact = generated.replace(/\s+/g, "");
    const isTerse =
      generated.length < 60 ||
      /^(확인했습니다|네|알겠습니다|접수했습니다|처리하겠습니다)[.!。]*$/.test(compact);
    const threadText = this.threadText(session);
    const needsSafety = this.safetyGuidance(threadText, draft).length > 0;
    const lacksSafety =
      needsSafety && !/(안전|전기|콘센트|스위치|가스|환기|불꽃|만지지|119|문이)/.test(generated);
    const needsPhoto =
      draft.photoRequested ||
      draft.photoAnalysis.comparisonStatus === "추가 사진 필요" ||
      draft.nextQuestions.some((question) => /사진|촬영|근접|전체/.test(question));
    const lacksPhoto = needsPhoto && !/(사진|촬영|첨부|근접|전체)/.test(generated);
    const needsVisit =
      draft.requiredInfo.some((item) => /방문|시간/.test(item)) ||
      draft.nextQuestions.some((question) => /방문|시간/.test(question));
    const lacksVisit = needsVisit && !/(방문|시간|일정|가능)/.test(generated);
    const needsQuestion = !draft.readyToFinalize && draft.nextQuestions.length > 0;
    const lacksQuestion = needsQuestion && !/[?？]|알려주|올려주|확인해/.test(generated);
    const lacksRoomlogWorkflow =
      !/(상담\s*스레드|같은 상담|이어.*저장|접수\s*(초안|상태|확정)|관리자|티켓)/.test(
        generated
      );

    if (
      isTerse ||
      lacksSafety ||
      lacksPhoto ||
      lacksVisit ||
      lacksQuestion ||
      lacksRoomlogWorkflow
    ) {
      return composed;
    }

    return generated;
  }

  private buildIntakeResponseInstructions(session: IntakeSession) {
    const room = this.store.rooms.find((item) => item.id === session.roomId);

    return [
      "당신은 Roomlog의 한국어 주거 하자/민원 접수 AI 상담사입니다.",
      "목표는 세입자와 자연스럽게 대화하면서 민원/하자/계약/납부/공용공간 이슈를 스레드별로 정확히 접수하는 것입니다.",
      room
        ? `현재 세입자의 기본 호실은 ${room.buildingName} ${room.roomNo} (${room.address})입니다.`
        : `현재 세입자의 roomId는 ${session.roomId}입니다.`,
      "반드시 지킬 원칙:",
      "- 이전 스레드가 아닌 현재 스레드의 대화와 첨부만 근거로 답합니다.",
      "- 같은 호실 과거 기록은 반복 가능성, 과거 조치, 관리자 확인 포인트를 잡기 위한 참고 자료입니다. 현재 세입자가 말하지 않은 내용을 단정하지 않습니다.",
      "- 법적 책임, 비용 부담, 과실을 확정하지 말고 가능성/관리자 검토 필요로 표현합니다.",
      "- 가스 냄새, 누전, 화재, 침수, 문 잠김 실패, 천장 누수처럼 안전 위험이 있으면 먼저 안전 행동을 안내합니다.",
      "- 질문은 한 번에 1-3개만 하고, 이미 답한 내용을 반복해서 묻지 않습니다.",
      "- draft.nextQuestions에는 세입자에게 바로 물을 1-3개의 구체 질문만 넣습니다.",
      "- draft.tenantGuidance에는 안전 행동, 사진 촬영 방법, 방문 준비처럼 세입자가 지금 할 일을 1-4개 넣습니다.",
      "- draft.intakeSlots에는 symptom, location, occurrence, risk, photo, visitTime 6개를 항상 넣고, 이미 확인된 정보는 COLLECTED, 더 물어볼 정보는 NEEDS_INFO, 이번 이슈에 덜 중요한 정보는 OPTIONAL로 표시합니다.",
      "- 사진이 있으면 사진 URL을 관리자 검토 자료로 연결하고, 사진이 부족하면 근접/전체 사진을 구분해서 요청합니다.",
      "- 응답은 세입자에게 보낼 assistantMessage와 접수 초안 draft를 JSON으로만 반환합니다.",
      "- draft.readyToFinalize는 증상, 위치, 긴급도 판단, 방문 가능 시간 또는 후속 안내가 충분할 때만 true입니다.",
      "- draft.filingIntent는 세입자가 '민원 넣어줘', '접수해 주세요'처럼 접수를 명시적으로 요청하거나 동의했을 때만 true입니다. 문제를 설명하기만 했다면 false입니다.",
      "- filingIntent와 readyToFinalize가 모두 true이면 시스템이 이번 턴에서 민원을 자동 접수하므로, assistantMessage에서 정리한 내용으로 접수를 진행한다고 안내합니다."
    ].join("\n");
  }

  private async buildIntakeResponseContent(session: IntakeSession, fallbackDraft: IntakeDraft) {
    return [
      {
        type: "input_text",
        text: this.buildIntakeResponseInput(session, fallbackDraft)
      },
      ...(await this.intakeImageInputs(session))
    ];
  }

  private buildIntakeResponseInput(session: IntakeSession, fallbackDraft: IntakeDraft) {
    return [
      "현재 상담 스레드 대화:",
      this.threadText(session) || "아직 세입자 메시지가 없습니다.",
      "",
      "같은 호실 과거 기록:",
      this.roomHistoryContextForIntake(session, fallbackDraft) || "참고할 과거 기록이 없습니다.",
      "",
      "로컬 1차 분석 초안:",
      JSON.stringify(fallbackDraft, null, 2),
      "",
      "이 대화를 바탕으로 세입자에게 보낼 다음 답변과 최신 접수 초안을 만들어주세요."
    ].join("\n");
  }

  private async intakeImageInputs(session: IntakeSession) {
    const urls = session.messages
      .filter((message) => message.sender === "TENANT")
      .flatMap((message) => message.attachmentUrls);
    const uniqueUrls = Array.from(new Set(urls));

    const inputs = await Promise.all(
      uniqueUrls.map(async (fileUrl) => {
        const attachment = this.store.attachments.find(
          (item) => item.fileUrl === fileUrl && item.uploadedByUserId === session.tenantId
        );

        if (!attachment) {
          return undefined;
        }

        // 저장소 모드(S3/로컬) 무관하게 읽는다 — 로컬 경로만 보면 S3 저장분이 조용히 빠진다.
        const imageBytes = await this.readAttachmentBytes(attachment);

        if (!imageBytes) {
          return undefined;
        }

        return {
          type: "input_image",
          image_url: `data:${attachment.mimeType};base64,${imageBytes.toString("base64")}`,
          detail: "auto"
        };
      })
    );

    return inputs
      .filter((item): item is { type: string; image_url: string; detail: string } =>
        Boolean(item)
      )
      .slice(0, 4);
  }

  private parseOpenAIIntakeTurn(responseBody: Record<string, unknown>) {
    const outputText =
      typeof responseBody.output_text === "string"
        ? responseBody.output_text
        : this.extractOutputText(responseBody.output);

    if (!outputText) {
      throw new Error("OpenAI response did not include output_text");
    }

    return JSON.parse(outputText) as {
      assistantMessage?: string;
      draft?: Partial<IntakeDraft>;
    };
  }

  private extractOutputText(output: unknown) {
    if (!Array.isArray(output)) {
      return undefined;
    }

    for (const item of output) {
      const content = (item as { content?: unknown }).content;

      if (!Array.isArray(content)) {
        continue;
      }

      for (const part of content) {
        const text = (part as { text?: unknown }).text;

        if (typeof text === "string") {
          return text;
        }
      }
    }

    return undefined;
  }

  private normalizeGeneratedDraft(
    generated: Partial<IntakeDraft> | undefined,
    fallback: IntakeDraft
  ): IntakeDraft {
    if (!generated) {
      return fallback;
    }

    const categoryCandidates: IntakeDraft["category"][] = [
      "하자",
      "소음",
      "설비",
      "납부",
      "계약",
      "공용공간",
      "기타"
    ];
    const responsibilityCandidates: IntakeDraft["responsibilityHint"][] = [
      "임대인 책임 가능성",
      "임차인 책임 가능성",
      "판단 어려움"
    ];
    const priority =
      typeof generated.priority === "number" && generated.priority >= 1 && generated.priority <= 4
        ? (generated.priority as IntakeDraft["priority"])
        : fallback.priority;
    const category = categoryCandidates.includes(generated.category as IntakeDraft["category"])
      ? (generated.category as IntakeDraft["category"])
      : fallback.category;
    const responsibilityHint = responsibilityCandidates.includes(
      generated.responsibilityHint as IntakeDraft["responsibilityHint"]
    )
      ? (generated.responsibilityHint as IntakeDraft["responsibilityHint"])
      : fallback.responsibilityHint;

    return {
      title: generated.title?.trim() || fallback.title,
      summary: generated.summary?.trim() || fallback.summary,
      category,
      detailCategory: generated.detailCategory?.trim() || fallback.detailCategory,
      priority,
      responsibilityHint,
      confidenceScore:
        typeof generated.confidenceScore === "number"
          ? Math.max(0, Math.min(generated.confidenceScore, 1))
          : fallback.confidenceScore,
      reasons: this.nonEmptyStringArray(generated.reasons, fallback.reasons),
      recommendedAction: generated.recommendedAction?.trim() || fallback.recommendedAction,
      contextHints: this.nonEmptyStringArray(
        (generated as { contextHints?: unknown }).contextHints,
        fallback.contextHints
      ),
      nextQuestions: this.nonEmptyStringArray(
        (generated as { nextQuestions?: unknown }).nextQuestions,
        fallback.nextQuestions
      ).slice(0, 3),
      tenantGuidance: this.nonEmptyStringArray(
        (generated as { tenantGuidance?: unknown }).tenantGuidance,
        fallback.tenantGuidance
      ).slice(0, 4),
      photoAnalysis: this.normalizePhotoAnalysis(
        (generated as { photoAnalysis?: unknown }).photoAnalysis,
        fallback.photoAnalysis
      ),
      intakeSlots: this.normalizeIntakeSlots(
        (generated as { intakeSlots?: unknown }).intakeSlots,
        fallback.intakeSlots
      ),
      requiredInfo: this.nonEmptyStringArray(generated.requiredInfo, fallback.requiredInfo),
      photoRequested:
        typeof generated.photoRequested === "boolean"
          ? generated.photoRequested
          : fallback.photoRequested,
      readyToFinalize:
        typeof generated.readyToFinalize === "boolean"
          ? generated.readyToFinalize
          : fallback.readyToFinalize,
      filingIntent:
        typeof generated.filingIntent === "boolean"
          ? generated.filingIntent
          : fallback.filingIntent,
      location: generated.location?.trim() || fallback.location,
      occurredAt: generated.occurredAt?.trim() || fallback.occurredAt,
      availableTimes: generated.availableTimes?.trim() || fallback.availableTimes,
      duplicateCandidates: fallback.duplicateCandidates
    };
  }

  private normalizeIntakeSlots(value: unknown, fallback: IntakeSlot[]) {
    const keys: IntakeSlotKey[] = [
      "symptom",
      "location",
      "occurrence",
      "risk",
      "photo",
      "visitTime"
    ];
    const statuses = ["COLLECTED", "NEEDS_INFO", "OPTIONAL"];
    const input = Array.isArray(value) ? value : [];

    return fallback.map((fallbackSlot) => {
      const candidate = input.find(
        (slot) =>
          slot &&
          typeof slot === "object" &&
          (slot as { key?: unknown }).key === fallbackSlot.key
      ) as Partial<IntakeSlot> | undefined;

      if (!candidate || !keys.includes(candidate.key as IntakeSlotKey)) {
        return { ...fallbackSlot };
      }

      return {
        ...fallbackSlot,
        label: candidate.label?.trim() || fallbackSlot.label,
        status: statuses.includes(candidate.status ?? "")
          ? (candidate.status as IntakeSlot["status"])
          : fallbackSlot.status,
        value: candidate.value?.trim() || fallbackSlot.value,
        evidence: candidate.evidence?.trim() || fallbackSlot.evidence,
        action: candidate.action?.trim() || fallbackSlot.action
      };
    });
  }

  private normalizePhotoAnalysis(value: unknown, fallback: PhotoAnalysis): PhotoAnalysis {
    const input = value as Partial<PhotoAnalysis> | undefined;
    const comparisonStatuses: PhotoComparisonStatus[] = [
      "기존 하자 가능성",
      "신규 발생 가능성",
      "비교 어려움",
      "추가 사진 필요"
    ];

    if (!input || typeof input !== "object") {
      return fallback;
    }

    const comparisonStatus = comparisonStatuses.includes(
      input.comparisonStatus as PhotoComparisonStatus
    )
      ? (input.comparisonStatus as PhotoComparisonStatus)
      : fallback.comparisonStatus;

    return {
      attachmentUrls: this.nonEmptyStringArray(input.attachmentUrls, fallback.attachmentUrls),
      previousAttachmentUrls: this.nonEmptyStringArray(
        input.previousAttachmentUrls,
        fallback.previousAttachmentUrls
      ),
      candidates: this.nonEmptyStringArray(input.candidates, fallback.candidates),
      comparisonStatus,
      summary: input.summary?.trim() || fallback.summary,
      evidence: this.nonEmptyStringArray(input.evidence, fallback.evidence),
      recommendedRetake:
        typeof input.recommendedRetake === "boolean"
          ? input.recommendedRetake
          : fallback.recommendedRetake
    };
  }

  private nonEmptyStringArray(value: unknown, fallback: string[]) {
    if (!Array.isArray(value)) {
      return fallback;
    }

    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return items.length ? items.map((item) => item.trim()) : fallback;
  }

  private safetyGuidance(text: string, draft: IntakeDraft) {
    const lines: string[] = [];

    if (/(가스|가스 냄새|gas)/i.test(text)) {
      lines.push(
        "가스 냄새가 계속 나면 창문을 열어 환기하고, 불꽃·라이터·전기 스위치는 만지지 말아주세요.",
        "어지러움이 있거나 냄새가 강하면 실내 밖 안전한 곳으로 이동한 뒤 즉시 관리자와 119 또는 가스 안전 신고로 연락하세요."
      );
    } else if (/(누전|감전|전기|스위치|콘센트)/.test(text) && draft.priority === 1) {
      lines.push(
        "전기 주변으로 물이 번졌다면 스위치나 콘센트를 만지지 말고, 가능한 경우 안전한 위치에서 차단기 확인을 관리자에게 요청하세요."
      );
    } else if (/(문이 안 잠|안 잠김|도어락|현관)/.test(text) && draft.priority === 1) {
      lines.push(
        "문이 잠기지 않으면 임시로 안전한 곳에 머물고, 바로 관리자에게 긴급 확인을 요청하겠습니다."
      );
    } else if (/(천장에서 물|물이 계속|침수|바닥에 물)/.test(text) && draft.priority === 1) {
      lines.push(
        "물이 전기 설비 근처로 번지면 만지지 말고, 물고임 범위와 천장 전체가 보이게 사진을 남겨주세요."
      );
    }

    return lines;
  }

  private duplicateCandidatesForIntake(
    session: IntakeSession,
    text: string,
    detailCategory: string,
    location?: string
  ): DuplicateTicketCandidate[] {
    const normalizedText = `${text} ${detailCategory} ${location ?? ""}`;
    const locationTokens = this.locationTokens(location ?? text);

    return this.store.tickets
      .filter(
        (ticket) =>
          ticket.tenantId === session.tenantId &&
          ticket.roomId === session.roomId &&
          !["COMPLETED", "CANCELLED"].includes(ticket.status)
      )
      .map((ticket) => {
        const complaint = this.findComplaint(ticket.complaintId);
        const analysis = this.store.analyses[ticket.id];
        const candidateText = [
          complaint.title,
          complaint.description,
          complaint.location,
          ticket.category,
          analysis?.detailCategory,
          ticket.aiSummary
        ]
          .filter(Boolean)
          .join(" ");
        const matchedSignals: string[] = [];

        if (this.issueContextMatches(normalizedText, candidateText, detailCategory)) {
          matchedSignals.push(`유형: ${analysis?.detailCategory ?? ticket.category}`);
        }

        for (const token of locationTokens) {
          if (candidateText.includes(token)) {
            matchedSignals.push(`위치: ${token}`);
          }
        }

        return { ticket, complaint, analysis, matchedSignals };
      })
      .filter((candidate) => candidate.matchedSignals.length > 0)
      .sort(
        (left, right) =>
          right.matchedSignals.length - left.matchedSignals.length ||
          right.ticket.updatedAt.localeCompare(left.ticket.updatedAt)
      )
      .slice(0, 3)
      .map(({ ticket, complaint, analysis, matchedSignals }) => {
        const room = this.store.rooms.find((item) => item.id === ticket.roomId);

        return {
          ticketId: ticket.id,
          complaintId: complaint.id,
          title: complaint.title,
          roomLabel: [room?.buildingName, room?.roomNo].filter(Boolean).join(" ") || ticket.roomId,
          status: ticket.status,
          displayStatus: this.displayStatus(ticket.status),
          category: analysis?.detailCategory ?? ticket.category,
          priority: ticket.priority,
          summary: ticket.aiSummary,
          createdAt: ticket.createdAt,
          matchedSignals: Array.from(new Set(matchedSignals)),
          recommendedAction: "ATTACH_TO_EXISTING"
        };
      });
  }

  private locationTokens(text: string) {
    return ["화장실", "싱크대", "주방", "안방", "거실", "현관", "베란다", "천장", "보일러실"]
      .filter((token) => text.includes(token));
  }

  private roomContextHints(session: IntakeSession, text: string, detailCategory: string) {
    const normalizedText = `${text} ${detailCategory}`;
    const relevantEntries = this.roomHistoryEntriesForIntake(session).filter((entry) =>
      this.timelineEntryMatchesIntakeContext(entry, normalizedText, detailCategory)
    );

    if (!relevantEntries.length) {
      return [];
    }

    const latest = relevantEntries[0];
    return [
      `같은 호실에 ${detailCategory} 관련 과거 기록이 ${relevantEntries.length}건 있습니다.`,
      `최근 관련 기록: ${latest.title} - ${latest.description}`
    ];
  }

  private roomHistoryContextForIntake(session: IntakeSession, draft?: IntakeDraft) {
    return this.roomHistoryEntriesForIntake(session)
      .filter((entry) =>
        draft
          ? this.timelineEntryMatchesIntakeContext(
              entry,
              `${this.threadText(session)} ${draft.location ?? ""} ${draft.detailCategory}`,
              draft.detailCategory
            )
          : true
      )
      .slice(0, 8)
      .map((entry) => {
        const attachmentText = entry.attachmentUrls.length
          ? ` 첨부: ${entry.attachmentUrls.join(", ")}`
          : "";
        const statusText = entry.status ? ` 상태: ${entry.status}` : "";

        return `[${entry.type}] ${entry.title}${statusText} - ${entry.description}${attachmentText}`;
      })
      .join("\n");
  }

  private roomHistoryEntriesForIntake(session: IntakeSession) {
    return this.presentRoomTimeline(session.roomId).filter((entry) => {
      if (entry.sessionId === session.id) {
        return false;
      }

      if (entry.type === "INTAKE_SESSION" && entry.status !== "FINALIZED") {
        return false;
      }

      return true;
    });
  }

  private timelineEntryMatchesIntakeContext(
    entry: RoomTimelineEntry,
    text: string,
    detailCategory: string
  ) {
    const entryText = `${entry.title} ${entry.description} ${entry.status ?? ""}`;
    return this.issueContextMatches(text, entryText, detailCategory);
  }

  private repeatIssueSummaryForTicket(
    ticket: Ticket,
    analysis: AiAnalysis,
    sourceStore: Store = this.store
  ): RepeatIssueSummary | undefined {
    const windowDays = 90;
    const currentComplaint = this.findComplaint(ticket.complaintId, sourceStore);
    const detailCategory = analysis.detailCategory ?? analysis.category ?? ticket.category;
    const currentText = [
      currentComplaint.title,
      currentComplaint.description,
      currentComplaint.location,
      ticket.category,
      detailCategory,
      ticket.aiSummary
    ].join(" ");
    const referenceTime = this.issueReferenceTime(currentComplaint, ticket);
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const matchedTickets = sourceStore.tickets
      .filter((candidate) => candidate.id !== ticket.id && candidate.roomId === ticket.roomId)
      .map((candidate) => {
        const complaint = this.findComplaint(candidate.complaintId, sourceStore);
        const candidateAnalysis = sourceStore.analyses[candidate.id];
        const candidateText = [
          complaint.title,
          complaint.description,
          complaint.location,
          candidate.category,
          candidateAnalysis?.detailCategory,
          candidate.aiSummary
        ]
          .filter(Boolean)
          .join(" ");

        return {
          ticket: candidate,
          complaint,
          candidateText
        };
      })
      .filter(({ ticket: candidate, complaint, candidateText }) => {
        const candidateTime = this.issueReferenceTime(complaint, candidate);

        if (Math.abs(referenceTime - candidateTime) > windowMs) {
          return false;
        }

        return this.issueContextMatches(currentText, candidateText, detailCategory);
      })
      .sort((left, right) => right.ticket.createdAt.localeCompare(left.ticket.createdAt));

    if (matchedTickets.length === 0) {
      return undefined;
    }

    const isRepeated = matchedTickets.length >= 2;
    const room = sourceStore.rooms.find((item) => item.id === ticket.roomId);
    const roomLabel = [room?.buildingName, room?.roomNo].filter(Boolean).join(" ") || ticket.roomId;
    const label = isRepeated
      ? `최근 3개월 ${roomLabel} ${detailCategory} 관련 반복 민원 ${matchedTickets.length}건`
      : `최근 3개월 ${roomLabel} ${detailCategory} 관련 이력 ${matchedTickets.length}건`;

    return {
      isRepeated,
      matchCount: matchedTickets.length,
      windowDays,
      matchedTicketIds: matchedTickets.map(({ ticket: matchedTicket }) => matchedTicket.id),
      matchedComplaintIds: matchedTickets.map(({ complaint }) => complaint.id),
      label,
      evidence: matchedTickets.slice(0, 3).map(({ complaint, ticket: matchedTicket }) => {
        const issueDate = (complaint.occurredAt ?? matchedTicket.createdAt).slice(0, 10);
        return `${issueDate} ${complaint.title}: ${complaint.description}`;
      })
    };
  }

  private issueReferenceTime(complaint: Complaint, ticket: Ticket) {
    const occurredTime = complaint.occurredAt ? Date.parse(complaint.occurredAt) : NaN;

    if (!Number.isNaN(occurredTime)) {
      return occurredTime;
    }

    const createdTime = Date.parse(ticket.createdAt);
    return Number.isNaN(createdTime) ? Date.now() : createdTime;
  }

  private issueContextMatches(currentText: string, candidateText: string, detailCategory: string) {
    if (this.issueExplicitlyNegated(candidateText, detailCategory)) {
      return false;
    }

    if (detailCategory && candidateText.includes(detailCategory)) {
      return true;
    }

    const currentGroups = this.issueKeywordGroups(`${currentText} ${detailCategory}`);
    const candidateGroups = this.issueKeywordGroups(candidateText);

    return currentGroups.some((group) => candidateGroups.includes(group));
  }

  private issueExplicitlyNegated(candidateText: string, detailCategory: string) {
    if (!detailCategory) {
      return false;
    }

    return [
      `${detailCategory}과 무관`,
      `${detailCategory}와 무관`,
      `${detailCategory}와는 무관`,
      `${detailCategory}는 무관`,
      `${detailCategory} 관련 없음`,
      `${detailCategory} 관련이 없음`
    ].some((phrase) => candidateText.includes(phrase));
  }

  private issueKeywordGroups(text: string) {
    const groups: Array<[string, RegExp]> = [
      ["누수", /(누수|물이|물고임|물방울|천장|침수|샘|새고|떨어지)/],
      ["보일러", /(보일러|온수|난방)/],
      ["도어락", /(도어락|현관문|문이\s*(안\s*)?잠|문이\s*열|잠기지|잠김|잠금)/],
      ["에어컨", /(에어컨|냉방|실외기|배수)/],
      ["전기", /(누전|감전|전기|콘센트|스위치)/],
      ["곰팡이", /(곰팡이|얼룩|습기)/],
      ["벽지", /(벽지|도배)/],
      ["바닥", /(바닥|장판|마루)/]
    ];

    return groups.filter(([, pattern]) => pattern.test(text)).map(([group]) => group);
  }

  private threadText(session?: IntakeSession) {
    if (!session) {
      return "";
    }

    return session.messages
      .map((message) => {
        const attachmentText = message.attachmentUrls.length
          ? ` 첨부: ${message.attachmentUrls.join(", ")}`
          : "";
        return `${message.sender}: ${message.transcriptText || message.messageText}${attachmentText}`;
      })
      .join("\n");
  }

  private intakeTurnJsonSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: ["assistantMessage", "draft"],
      properties: {
        assistantMessage: { type: "string" },
        draft: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "summary",
            "category",
            "detailCategory",
            "priority",
            "responsibilityHint",
            "confidenceScore",
            "reasons",
            "recommendedAction",
            "contextHints",
            "nextQuestions",
            "tenantGuidance",
            "photoAnalysis",
            "intakeSlots",
            "requiredInfo",
            "photoRequested",
            "readyToFinalize",
            "filingIntent",
            "location",
            "occurredAt",
            "availableTimes"
          ],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            category: {
              type: "string",
              enum: ["하자", "소음", "설비", "납부", "계약", "공용공간", "기타"]
            },
            detailCategory: { type: "string" },
            priority: { type: "integer", enum: [1, 2, 3, 4] },
            responsibilityHint: {
              type: "string",
              enum: ["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"]
            },
            confidenceScore: { type: "number", minimum: 0, maximum: 1 },
            reasons: {
              type: "array",
              items: { type: "string" }
            },
            recommendedAction: { type: "string" },
            contextHints: {
              type: "array",
              items: { type: "string" }
            },
            nextQuestions: {
              type: "array",
              minItems: 0,
              maxItems: 3,
              items: { type: "string" }
            },
            tenantGuidance: {
              type: "array",
              minItems: 0,
              maxItems: 4,
              items: { type: "string" }
            },
            photoAnalysis: {
              type: "object",
              additionalProperties: false,
              required: [
                "attachmentUrls",
                "previousAttachmentUrls",
                "candidates",
                "comparisonStatus",
                "summary",
                "evidence",
                "recommendedRetake"
              ],
              properties: {
                attachmentUrls: {
                  type: "array",
                  items: { type: "string" }
                },
                previousAttachmentUrls: {
                  type: "array",
                  items: { type: "string" }
                },
                candidates: {
                  type: "array",
                  items: { type: "string" }
                },
                comparisonStatus: {
                  type: "string",
                  enum: [
                    "기존 하자 가능성",
                    "신규 발생 가능성",
                    "비교 어려움",
                    "추가 사진 필요"
                  ]
                },
                summary: { type: "string" },
                evidence: {
                  type: "array",
                  items: { type: "string" }
                },
                recommendedRetake: { type: "boolean" }
              }
            },
            intakeSlots: {
              type: "array",
              minItems: 6,
              maxItems: 6,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "label", "status", "value", "evidence", "action"],
                properties: {
                  key: {
                    type: "string",
                    enum: [
                      "symptom",
                      "location",
                      "occurrence",
                      "risk",
                      "photo",
                      "visitTime"
                    ]
                  },
                  label: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["COLLECTED", "NEEDS_INFO", "OPTIONAL"]
                  },
                  value: { type: "string" },
                  evidence: { type: "string" },
                  action: { type: "string" }
                }
              }
            },
            requiredInfo: {
              type: "array",
              items: { type: "string" }
            },
            photoRequested: { type: "boolean" },
            readyToFinalize: { type: "boolean" },
            filingIntent: { type: "boolean" },
            location: { type: "string" },
            occurredAt: { type: "string" },
            availableTimes: { type: "string" }
          }
        }
      }
    };
  }

  private buildRealtimeInstructions(
    session: IntakeSession,
    input: RealtimeClientSecretInput
  ) {
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const context = session.messages
      .slice(-10)
      .map((message) => {
        const attachmentText = message.attachmentUrls.length
          ? ` 첨부: ${message.attachmentUrls.join(", ")}`
          : "";

        return `${message.sender}: ${message.transcriptText || message.messageText}${attachmentText}`;
      })
      .join("\n");
    const purpose =
      input.purpose === "CALLBOT_INTAKE"
        ? "전화 통화 기반 민원 접수 콜봇"
        : "세입자 채팅/음성 기반 민원 접수 상담";
    const draft = session.draft;
    const slotStatusLabel: Record<IntakeSlot["status"], string> = {
      COLLECTED: "확인됨",
      NEEDS_INFO: "확인 필요",
      OPTIONAL: "선택"
    };
    const intakeSlotStatus = this.draftIntakeSlots(session)
      .map((slot) =>
        [
          `${slot.label}: ${slotStatusLabel[slot.status]}`,
          slot.value ? `값=${slot.value}` : undefined,
          slot.evidence ? `근거=${slot.evidence}` : undefined,
          slot.action ? `다음 행동=${slot.action}` : undefined
        ]
          .filter(Boolean)
          .join(" · ")
      )
      .join("\n");
    const draftStatus = [
      `제목: ${draft.title || "미정"}`,
      `요약: ${draft.summary || "미정"}`,
      `분류: ${draft.category} / ${draft.detailCategory}`,
      `긴급도: P${draft.priority}`,
      `위치: ${draft.location || "미확인"}`,
      `방문 가능 시간: ${draft.availableTimes || "미확인"}`,
      `사진 상태: ${draft.photoAnalysis.summary}`,
      `필요 정보: ${draft.requiredInfo.join(", ") || "없음"}`,
      `다음 질문 후보: ${draft.nextQuestions.join(" / ") || "없음"}`
    ].join("\n");

    return [
      "# 역할과 목표",
      "당신은 Roomlog의 주거 하자/민원 접수 AI 상담사입니다.",
      `상담 목적은 ${purpose}입니다.`,
      room
        ? `대상 호실: ${room.buildingName} ${room.roomNo}, ${room.address}.`
        : `대상 호실 ID: ${session.roomId}.`,
      "",
      "# 말투",
      "- 세입자 말을 끊지 말고 짧고 차분한 한국어로 응답합니다.",
      "- 직접 답변은 1-2문장으로 말하고, 추가 확인은 한 번에 하나의 질문만 합니다.",
      "- 사용자가 이미 말한 위치, 시간, 사진 여부, 위험 신호는 반복해서 묻지 않습니다.",
      "- 불안하거나 긴급한 상황에서는 먼저 안전 행동을 안내한 뒤 필요한 정보를 확인합니다.",
      "",
      "# 대화 흐름",
      "1. 증상과 위치를 자연스럽게 확인합니다.",
      "2. 발생 시점, 현재도 반복되는지, 안전 위험 여부를 확인합니다.",
      "3. 사진이 없고 하자 판단에 필요하면 근접 사진 1장과 공간 전체 사진 1장을 요청합니다.",
      "4. 관리자나 업체 방문 가능 시간대를 확인합니다.",
      "5. 충분한 정보가 모이면 접수 초안 제목, 요약, 위치, 긴급도, 추가 필요 정보를 짧게 정리합니다.",
      "",
      "# 안전 분류",
      "- 누수, 가스 냄새, 누전, 문 잠김 실패, 침수, 화재, 천장 물샘은 긴급 후보로 봅니다.",
      "- 전기 설비 근처 물고임, 가스 냄새, 문이 잠기지 않는 상황은 즉시 안전한 행동을 먼저 안내합니다.",
      "- 책임 소재를 확정하지 말고, 비용 부담도 '관리자 확인 필요' 또는 가능성으로만 표현합니다.",
      "",
      "# 사진과 기록",
      "- 사진이 있으면 현재 상담 스레드와 관리자 검토 자료로 연결된다고 말합니다.",
      "- 사진이 부족하면 어떤 사진이 필요한지 구체적으로 말합니다.",
      "- 같은 호실 과거 기록은 반복 가능성 판단의 참고 자료이며, 현재 세입자가 말하지 않은 내용을 단정하지 않습니다.",
      "",
      "# 불명확한 음성",
      "- 불명확한 음성, 주변 소음, 끊긴 발화는 추측하지 말고 짧게 다시 말해달라고 요청합니다.",
      "- 숫자, 호실, 시간처럼 중요한 값은 들은 값을 다시 확인합니다.",
      "",
      "# 완료 기준",
      "- 증상, 위치, 위험 여부, 사진 필요 여부, 방문 가능 시간이 확인되면 접수 초안을 정리합니다.",
      "- 정보가 부족하면 누락된 항목 중 가장 중요한 하나만 질문합니다.",
      "- 접수 초안이 준비되면 세입자가 화면에서 수정 후 확정할 수 있다고 안내합니다.",
      input.instructions ? `추가 운영 지침: ${input.instructions}` : "",
      "",
      "# 수집 정보 상태",
      intakeSlotStatus || "아직 수집된 정보가 없습니다.",
      "",
      "# 현재 접수 초안 상태",
      draftStatus,
      "",
      "# 현재 상담 스레드 컨텍스트",
      context || "아직 세입자 발화가 없습니다."
    ]
      .filter(Boolean)
      .join("\n");
  }

  private safetyIdentifier(tenantId: string, sessionId: string) {
    return createHash("sha256")
      .update(`roomlog:${tenantId}:${sessionId}:${tokenSecret}`)
      .digest("hex");
  }

  private extractLocation(text: string) {
    const locations = ["화장실", "싱크대", "주방", "안방", "거실", "현관", "베란다", "천장", "보일러실"];
    const roomMatch = text.match(/(\d{2,4}호)/);

    if (roomMatch?.[1]) {
      const afterRoom = text.slice((roomMatch.index ?? 0) + roomMatch[1].length, (roomMatch.index ?? 0) + 30);
      const space = locations.find((location) => afterRoom.includes(location));

      return [roomMatch[1], space].filter(Boolean).join(" ");
    }

    return locations.find((location) => text.includes(location));
  }

  private extractAvailableTimes(text: string) {
    const timeMatch = text.match(/(오늘|내일|평일|주말)?\s*(오전|오후|저녁)?\s*\d{1,2}시\s*(이후|전|부터)?/);

    if (timeMatch?.[0]) {
      return timeMatch[0].trim();
    }

    const naturalTimeMatch = text.match(
      /(오늘|내일|평일|주말)\s*(오전|오후|저녁|밤|낮|퇴근\s*후)|(오전|오후|저녁|밤|낮|퇴근\s*후)\s*(방문|가능)/
    );

    if (naturalTimeMatch?.[0]) {
      return naturalTimeMatch[0].replace(/\s+/g, " ").replace(/\s*(방문|가능).*$/, "").trim();
    }

    if (text.includes("언제든")) {
      return "언제든 가능";
    }

    return undefined;
  }

  private detectMainCategory(text: string, detailCategory: string): IntakeDraft["category"] {
    if (["소음", "층간소음"].some((word) => text.includes(word))) {
      return "소음";
    }

    if (["월세", "관리비", "납부", "연체"].some((word) => text.includes(word))) {
      return "납부";
    }

    if (["계약", "보증금", "특약"].some((word) => text.includes(word))) {
      return "계약";
    }

    if (["복도", "엘리베이터", "주차장", "공용"].some((word) => text.includes(word))) {
      return "공용공간";
    }

    return detailCategory === "일반 문의" ? "기타" : "하자";
  }

  private detectDetailCategory(text: string) {
    if (["누수", "물", "천장", "샘", "침수"].some((word) => text.includes(word))) {
      return "누수";
    }

    if (["보일러", "온수", "난방"].some((word) => text.includes(word))) {
      return "보일러";
    }

    if (["곰팡이", "얼룩"].some((word) => text.includes(word))) {
      return "곰팡이";
    }

    if (["도어락", "문이 안 잠", "현관"].some((word) => text.includes(word))) {
      return "도어락";
    }

    if (["에어컨", "냉방"].some((word) => text.includes(word))) {
      return "에어컨";
    }

    if (["소음", "층간소음"].some((word) => text.includes(word))) {
      return "소음";
    }

    return text.trim() ? "설비" : "확인 필요";
  }

  private detectPriority(text: string, detailCategory: string): IntakeDraft["priority"] {
    const emergencyWords = [
      "가스 냄새",
      "불꽃",
      "누전",
      "물이 계속",
      "천장에서 물",
      "보일러 완전 고장",
      "수도 안 나옴",
      "문이 안 잠김",
      "침수",
      "화재"
    ];

    if (emergencyWords.some((word) => text.includes(word))) {
      return 1;
    }

    if (["누수", "보일러"].includes(detailCategory)) {
      return 2;
    }

    return text.trim() ? 3 : 4;
  }

  private detectResponsibilityHint(text: string): AiAnalysis["responsibilityHint"] {
    if (["깨뜨", "파손", "떨어뜨", "부주의"].some((word) => text.includes(word))) {
      return "임차인 책임 가능성";
    }

    if (["계약", "공용", "이전부터"].some((word) => text.includes(word))) {
      return "판단 어려움";
    }

    return "임대인 책임 가능성";
  }

  private analysisReasons(text: string, detailCategory: string, priority: number, hasPhoto: boolean) {
    const reasons = [`상담 내용에서 ${detailCategory} 관련 표현이 확인됨`];

    if (priority === 1) {
      reasons.push("위험 키워드가 포함되어 긴급도가 상향됨");
    }

    if (hasPhoto) {
      reasons.push("사진 첨부가 있어 관리자 검토 자료로 연결 가능");
    }

    if (text.includes("방문")) {
      reasons.push("방문 가능 시간이 포함됨");
    }

    return reasons;
  }

  private refreshAnalysisFromTenantFollowup(
    ticket: Ticket,
    input: Required<Pick<AddTenantComplaintMessageInput, "attachmentUrls">> & {
      messageText: string;
    }
  ) {
    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      return;
    }

    const note = input.messageText || "추가 사진이 제출되었습니다.";
    const clippedNote = note.length > 120 ? `${note.slice(0, 117)}...` : note;
    const followupSummary = `추가 정보: ${clippedNote}`;
    const reasons = new Set(analysis.reasons ?? []);

    reasons.add("임차인이 기존 티켓에 추가 설명을 제출함");

    if (input.attachmentUrls.length > 0) {
      reasons.add("임차인 추가 사진이 기존 티켓에 연결됨");
    }

    analysis.summary = analysis.summary.includes(followupSummary)
      ? analysis.summary
      : `${analysis.summary}\n${followupSummary}`;
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction =
      input.attachmentUrls.length > 0
        ? "추가 사진과 설명을 바탕으로 문제 부위, 촬영 각도, 기존 기록 비교 가능성을 다시 검토하세요."
        : "추가 설명을 바탕으로 AI 요약과 긴급도 판단을 다시 검토하세요.";

    if (input.attachmentUrls.length > 0) {
      const currentPhotoAnalysis = analysis.photoAnalysis ?? this.emptyPhotoAnalysis();
      const attachmentUrls = Array.from(
        new Set([...currentPhotoAnalysis.attachmentUrls, ...input.attachmentUrls])
      );
      const candidates = currentPhotoAnalysis.candidates.length
        ? currentPhotoAnalysis.candidates
        : this.photoCandidatesFor(analysis.detailCategory ?? analysis.category, input.messageText);
      analysis.photoAnalysis = {
        ...currentPhotoAnalysis,
        attachmentUrls,
        candidates,
        comparisonStatus:
          currentPhotoAnalysis.previousAttachmentUrls.length > 0
            ? currentPhotoAnalysis.comparisonStatus
            : "비교 어려움",
        summary: "임차인이 추가 사진을 제출해 기존 티켓의 사진 분석 자료가 갱신되었습니다.",
        evidence: Array.from(
          new Set([
            ...currentPhotoAnalysis.evidence,
            "추가 사진이 기존 티켓에 연결됨",
            input.messageText || "사진과 함께 추가 설명이 제출됨"
          ])
        ),
        recommendedRetake: false
      };
    }

    analysis.confidenceScore = Math.min(0.95, Math.max(analysis.confidenceScore, 0.72));
    ticket.aiSummary = analysis.summary;
    ticket.priority = Math.min(ticket.priority, analysis.priority);
  }

  private analyzeComplaint(input: CreateComplaintInput): AiAnalysis {
    const text = `${input.title} ${input.description} ${input.location}`;
    const lower = text.toLowerCase();
    const emergencyWords = ["가스", "불꽃", "누전", "물이 계속", "천장", "보일러", "수도 안", "문이 안 잠", "침수", "화재"];
    const isEmergency = emergencyWords.some((word) => text.includes(word));
    const isLeak = ["누수", "물", "천장", "샘"].some((word) => text.includes(word));
    const isBoiler = ["보일러", "온수", "난방"].some((word) => text.includes(word));
    const isMold = ["곰팡이", "얼룩"].some((word) => text.includes(word));
    // 시설 수리가 아닌 일반 민원(소음/납부/주차)도 분류 — 관리자 민원 대시보드(일반 민원)와 연결된다.
    const isNoise = ["소음", "시끄", "층간", "쿵쿵", "소란"].some((word) => text.includes(word));
    const isBilling = ["관리비", "납부", "결제", "청구"].some((word) => text.includes(word));
    const isParking = ["주차"].some((word) => text.includes(word));
    const tenantHint = ["깨뜨", "파손", "떨어뜨", "부주의"].some((word) => text.includes(word));
    // 일반 민원 키워드를 시설 키워드보다 먼저 본다 — 층간소음 신고가 "천장" 언급만으로 누수가 되지 않게.
    const category = isNoise
      ? "소음"
      : isBilling
        ? "납부"
        : isParking
          ? "주차"
          : isLeak
            ? "누수"
            : isBoiler
              ? "보일러"
              : isMold
                ? "곰팡이"
                : lower.includes("door")
                  ? "도어락"
                  : "설비";
    const aiPriority = isEmergency ? 1 : isLeak || isBoiler ? 2 : 3;
    const priority = Math.min(aiPriority, input.urgency ?? aiPriority);
    const responsibilityHint = tenantHint ? "임차인 책임 가능성" : "임대인 책임 가능성";

    return {
      summary: `${input.location}의 ${category} 문제로 보이는 신고입니다. ${priority === 1 ? "즉시 확인이 필요한 긴급 건입니다." : "관리자 확인 후 처리 일정을 잡아야 합니다."}`,
      category,
      detailCategory: category,
      priority,
      responsibilityHint,
      confidenceScore: category === "설비" ? 0.62 : 0.78,
      reasons: [
        `${category} 관련 표현이 신고 내용에서 확인됨`,
        aiPriority === 1 ? "긴급 키워드가 포함됨" : "관리자 검토 후 일정 조율 가능",
        ...(input.urgency !== undefined
          ? [`신고 지정 긴급도 ${input.urgency}순위 반영`]
          : [])
      ],
      recommendedAction:
        priority === 1
          ? "관리자 확인 후 당일 업체 배정을 권장합니다."
          : "사진과 방문 가능 시간을 확인한 뒤 업체 배정을 진행하세요."
    };
  }

  private isAiFeedbackTarget(target: unknown): target is AiFeedbackTarget {
    return ["SUMMARY", "CATEGORY", "PRIORITY", "RESPONSIBILITY", "COMPLETION"].includes(
      `${target}`
    );
  }

  private isResponsibilityHint(value: unknown): value is AiAnalysis["responsibilityHint"] {
    return ["임대인 책임 가능성", "임차인 책임 가능성", "판단 어려움"].includes(`${value}`);
  }

  private aiFeedbackTargetLabel(target: AiFeedbackTarget) {
    const labels: Record<AiFeedbackTarget, string> = {
      SUMMARY: "AI 요약",
      CATEGORY: "민원 유형",
      PRIORITY: "긴급도",
      RESPONSIBILITY: "책임 가능성",
      COMPLETION: "완료 처리"
    };

    return labels[target];
  }

  private aiFeedbackOriginalValue(
    target: AiFeedbackTarget,
    ticket: Ticket,
    complaint: Complaint,
    analysis?: AiAnalysis
  ) {
    if (target === "SUMMARY") {
      return analysis?.summary ?? ticket.aiSummary;
    }

    if (target === "CATEGORY") {
      return `${analysis?.category ?? ticket.category}${
        analysis?.detailCategory ? ` / ${analysis.detailCategory}` : ""
      }`;
    }

    if (target === "PRIORITY") {
      return `P${ticket.priority} ${priorityLabelForAnalysis(ticket.priority)}`;
    }

    if (target === "RESPONSIBILITY") {
      return analysis?.responsibilityHint ?? ticket.responsibilityHint;
    }

    return this.displayStatus(ticket.status) || complaint.status;
  }

  private markAnalysisNeedsHumanReview(
    ticket: Ticket,
    targetLabel: string,
    reason: string
  ) {
    const analysis = this.store.analyses[ticket.id];

    if (!analysis) {
      return;
    }

    const reasons = new Set(analysis.reasons ?? []);
    reasons.add(`임차인이 ${targetLabel} 판단에 이의제기함`);
    reasons.add(`이의제기 사유: ${reason.length > 90 ? `${reason.slice(0, 87)}...` : reason}`);
    analysis.reasons = Array.from(reasons);
    analysis.recommendedAction =
      "임차인 이의제기 내용을 우선 검토하고, 필요하면 AI 요약/긴급도/책임 가능성을 수정한 뒤 답변을 남기세요.";
    ticket.aiSummary = analysis.summary;
  }

  private presentRoomTimeline(
    roomId: string,
    scope: { tenantId?: string } = {},
    sourceStore: Store = this.store
  ): RoomTimelineEntry[] {
    const room = this.findRoom(roomId, sourceStore);
    const tickets = sourceStore.tickets.filter(
      (ticket) =>
        ticket.roomId === roomId && (!scope.tenantId || ticket.tenantId === scope.tenantId)
    );
    const ticketIds = new Set(tickets.map((ticket) => ticket.id));
    const entries: RoomTimelineEntry[] = [];

    for (const item of sourceStore.moveInChecklist.filter(
      (entry) =>
        entry.roomId === roomId && (!scope.tenantId || entry.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${item.id}`,
        type: "MOVE_IN_CHECKLIST",
        roomId,
        room: { ...room },
        title: `${item.area} ${item.itemName}`,
        description: item.memo ?? "입주 전 기준 사진 기록",
        createdAt: item.createdAt,
        status: "입주 전 기록",
        attachmentUrls: [...item.attachmentUrls]
      });
    }

    for (const session of sourceStore.intakeSessions.filter(
      (item) => item.roomId === roomId && (!scope.tenantId || item.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${session.id}`,
        type: "INTAKE_SESSION",
        roomId,
        room: { ...room },
        title: session.draft.title,
        description:
          session.status === "FINALIZED"
            ? "AI 상담 스레드가 민원 티켓으로 접수되었습니다."
            : "AI 상담 스레드가 진행 중입니다.",
        createdAt: session.updatedAt,
        ticketId: session.ticketId,
        complaintId: session.complaintId,
        sessionId: session.id,
        status: session.status,
        attachmentUrls: Array.from(
          new Set(session.messages.flatMap((message) => message.attachmentUrls))
        )
      });
    }

    for (const complaint of sourceStore.complaints.filter(
      (item) => item.roomId === roomId && (!scope.tenantId || item.tenantId === scope.tenantId)
    )) {
      entries.push({
        id: `timeline-${complaint.id}`,
        type: "COMPLAINT",
        roomId,
        room: { ...room },
        title: complaint.title,
        description: complaint.description,
        createdAt: complaint.createdAt,
        ticketId: complaint.ticketId,
        complaintId: complaint.id,
        status: complaint.status,
        attachmentUrls: []
      });
    }

    for (const feedback of sourceStore.aiFeedback.filter((item) => ticketIds.has(item.ticketId))) {
      entries.push({
        id: `timeline-${feedback.id}`,
        type: "AI_FEEDBACK",
        roomId,
        room: { ...room },
        title: `${feedback.targetLabel} 이의제기`,
        description: feedback.reason,
        createdAt: feedback.createdAt,
        ticketId: feedback.ticketId,
        complaintId: feedback.complaintId,
        status: feedback.status === "OPEN" ? "검토 필요" : "검토 완료",
        attachmentUrls: [...feedback.attachmentUrls]
      });
    }

    for (const history of sourceStore.history.filter((item) => ticketIds.has(item.ticketId))) {
      const ticket = this.findTicket(history.ticketId, sourceStore);
      entries.push({
        id: `timeline-${history.id}`,
        type: "STATUS_CHANGE",
        roomId,
        room: { ...room },
        title: history.toStatus,
        description: history.note ?? "상태 변경",
        createdAt: history.createdAt,
        ticketId: history.ticketId,
        complaintId: ticket.complaintId,
        status: history.toStatus,
        attachmentUrls: []
      });
    }

    for (const message of sourceStore.messages.filter((item) => ticketIds.has(item.ticketId))) {
      entries.push({
        id: `timeline-${message.id}`,
        type: "MESSAGE",
        roomId,
        room: { ...room },
        title: this.timelineSenderLabel(message.senderRole),
        description: message.messageText,
        createdAt: message.createdAt,
        ticketId: message.ticketId,
        complaintId: message.complaintId,
        senderRole: message.senderRole,
        attachmentUrls: [...message.attachmentUrls]
      });
    }

    for (const repair of sourceStore.repairs.filter((item) => ticketIds.has(item.ticketId))) {
      const ticket = this.findTicket(repair.ticketId, sourceStore);
      entries.push({
        id: `timeline-${repair.id}`,
        type: "REPAIR",
        roomId,
        room: { ...room },
        title: repair.title,
        description:
          repair.completionNote ??
          repair.estimateDescription ??
          repair.scheduledAt ??
          repair.description,
        createdAt: repair.updatedAt,
        ticketId: repair.ticketId,
        complaintId: ticket.complaintId,
        repairId: repair.id,
        status: repair.status,
        attachmentUrls: [...repair.completionPhotoUrls]
      });
    }

    return entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private timelineSenderLabel(senderRole: TicketMessage["senderRole"]) {
    if (senderRole === "TENANT") {
      return "임차인 메시지";
    }

    if (senderRole === "LANDLORD") {
      return "관리자 답변";
    }

    if (senderRole === "VENDOR") {
      return "업체 메시지";
    }

    if (senderRole === "AI_ASSISTANT") {
      return "AI 상담 기록";
    }

    return "시스템 기록";
  }

  private presentIntakeSession(session: IntakeSession) {
    const intakeSlots = this.draftIntakeSlots(session);

    return {
      ...session,
      threadSummary: this.presentIntakeThreadSummary(session),
      draft: {
        ...session.draft,
        reasons: [...session.draft.reasons],
        contextHints: [...(session.draft.contextHints ?? [])],
        nextQuestions: [...(session.draft.nextQuestions ?? [])],
        tenantGuidance: [...(session.draft.tenantGuidance ?? [])],
        photoAnalysis: this.presentPhotoAnalysis(session.draft.photoAnalysis),
        intakeSlots: this.presentIntakeSlots(intakeSlots),
        requiredInfo: [...session.draft.requiredInfo],
        duplicateCandidates: session.draft.duplicateCandidates.map((candidate) => ({
          ...candidate,
          matchedSignals: [...candidate.matchedSignals]
        }))
      },
      messages: session.messages.map((message) => ({
        ...message,
        attachmentUrls: [...message.attachmentUrls]
      })),
      room: this.store.rooms.find((room) => room.id === session.roomId)
    };
  }

  private draftIntakeSlots(session: IntakeSession) {
    return session.draft.intakeSlots?.length
      ? session.draft.intakeSlots
      : this.buildIntakeDraft(session).intakeSlots;
  }

  private presentIntakeSlots(slots: IntakeSlot[]) {
    return slots.map((slot) => ({ ...slot }));
  }

  private presentIntakeThreadSummary(session: IntakeSession): IntakeThreadSummary {
    const tenantMessages = session.messages.filter((message) => message.sender === "TENANT");
    const assistantMessages = session.messages.filter((message) => message.sender === "AI_ASSISTANT");
    const lastUserMessage = tenantMessages.at(-1);
    const lastAssistantMessage = assistantMessages.at(-1);
    const attachmentCount = session.messages.reduce(
      (total, message) => total + message.attachmentUrls.length,
      0
    );
    const room = this.store.rooms.find((item) => item.id === session.roomId);
    const roomLabel = room ? `${room.buildingName} ${room.roomNo}` : "호실";
    const slotCounts = this.intakeSlotCounts(this.draftIntakeSlots(session));

    return {
      title: this.intakeThreadTitle(session, roomLabel),
      channelLabel: this.intakeChannelLabel(session.sourceChannel),
      statusLabel: this.intakeThreadStatusLabel(session),
      detailCategory: session.draft.detailCategory,
      priority: session.draft.priority,
      lastUserMessage: this.compactThreadMessage(
        lastUserMessage?.transcriptText || lastUserMessage?.messageText,
        "아직 세입자 메시지가 없습니다."
      ),
      lastAssistantMessage: this.compactThreadMessage(
        lastAssistantMessage?.messageText,
        "AI가 상담 시작을 기다리고 있습니다."
      ),
      messageCount: session.messages.length,
      attachmentCount,
      collectedSlotCount: slotCounts.collectedSlotCount,
      openSlotCount: slotCounts.openSlotCount,
      requiredInfoCount: session.draft.requiredInfo.length,
      unresolvedQuestionCount: session.draft.nextQuestions.length,
      readyToFinalize: session.draft.readyToFinalize,
      updatedAt: session.updatedAt
    };
  }

  private intakeThreadTitle(session: IntakeSession, roomLabel: string) {
    if (session.messages.every((message) => message.sender !== "TENANT")) {
      return `${roomLabel} 새 상담`;
    }

    return session.draft.title || `${roomLabel} ${session.draft.detailCategory}`;
  }

  private intakeChannelLabel(sourceChannel: ComplaintSourceChannel) {
    const labels: Record<ComplaintSourceChannel, string> = {
      DIRECT_FORM: "앱 입력",
      REALTIME_CHAT: "AI 채팅",
      VOICE_CHAT: "AI 음성",
      CALLBOT: "콜봇",
      MANAGER_PROXY: "관리자 대리 접수"
    };

    return labels[sourceChannel];
  }

  private intakeThreadStatusLabel(session: IntakeSession) {
    if (session.status === "FINALIZED") {
      return "접수 완료";
    }

    if (session.status === "CANCELLED") {
      return "취소됨";
    }

    if (session.draft.readyToFinalize) {
      return "접수 확정 가능";
    }

    if (session.draft.requiredInfo.length > 0) {
      return `추가 정보 ${session.draft.requiredInfo.length}개 필요`;
    }

    return "상담 진행 중";
  }

  private compactThreadMessage(messageText: string | undefined, fallback: string) {
    const text = messageText?.replace(/\s+/g, " ").trim();

    if (!text) {
      return fallback;
    }

    return text.length > 86 ? `${text.slice(0, 83)}...` : text;
  }

  private inferManagerReplyIntent(ticket: Ticket): ManagerReplyIntent {
    if (ticket.status === "COMPLETION_REPORTED" || ticket.status === "COMPLETED") {
      return "COMPLETION_NOTICE";
    }

    if (ticket.assignedVendorId || ticket.status === "VENDOR_ASSIGNED") {
      return "ASSIGN_VENDOR_NOTICE";
    }

    if (this.ticketNeedsPhotoForManagerAssistant(ticket)) {
      return "REQUEST_PHOTO";
    }

    const complaint = this.findComplaint(ticket.complaintId);

    if (!complaint.availableTimes) {
      return "SCHEDULE_VISIT";
    }

    return ticket.status === "RECEIVED" ? "RECEIPT_ACK" : "REQUEST_DETAILS";
  }

  private managerReplySubject(
    intent: ManagerReplyIntent,
    ticket: Ticket,
    complaint: Complaint
  ) {
    const prefix: Record<ManagerReplyIntent, string> = {
      RECEIPT_ACK: "접수 확인",
      REQUEST_PHOTO: "추가 사진 요청",
      REQUEST_DETAILS: "추가 설명 요청",
      SCHEDULE_VISIT: "방문 일정 확인",
      ASSIGN_VENDOR_NOTICE: "업체 배정 안내",
      COMPLETION_NOTICE: "수리 완료 확인"
    };

    return `${prefix[intent]} · ${complaint.title || ticket.category}`;
  }

  private managerReplyTenantActionLabel(intent: ManagerReplyIntent) {
    const map: Partial<Record<ManagerReplyIntent, string>> = {
      REQUEST_PHOTO: "문제 부위 사진 업로드",
      REQUEST_DETAILS: "증상/발생 시점 추가 설명",
      SCHEDULE_VISIT: "방문 가능 시간 회신"
    };

    return map[intent];
  }

  private managerReplyEvidence(
    ticket: Ticket,
    complaint: Complaint,
    callbot: CallbotTicketContext | undefined
  ) {
    const analysis = this.store.analyses[ticket.id];
    const evidence = [
      `접수 채널: ${this.sourceChannelDisplay(ticket.sourceChannel)}`,
      `AI 요약: ${ticket.aiSummary}`,
      `긴급도: P${ticket.priority}`,
      `방문 가능 시간: ${complaint.availableTimes || "확인 필요"}`
    ];

    if (callbot) {
      evidence.push(`전사 내용: ${callbot.transcriptText}`);
      evidence.push(`콜봇 상태: ${callbot.statusNote}`);

      if (callbot.photoUploadUrl) {
        evidence.push(`사진 업로드 링크: ${callbot.photoUploadUrl}`);
      }
    }

    if (analysis?.photoAnalysis?.summary) {
      evidence.push(`사진 분석: ${analysis.photoAnalysis.summary}`);
    }

    return evidence;
  }

  private composeManagerReplyDraftMessage(input: {
    intent: ManagerReplyIntent;
    ticket: Ticket;
    complaint: Complaint;
    room?: Room;
    analysis?: AiAnalysis;
    callbot?: CallbotTicketContext;
    note?: string;
  }) {
    const { intent, ticket, complaint, room, analysis, callbot, note } = input;
    const roomLabel = room ? `${room.buildingName} ${room.roomNo}` : complaint.location;
    const channelText = callbot
      ? "콜봇 통화로 접수된 내용"
      : `${this.sourceChannelDisplay(ticket.sourceChannel)}로 접수된 내용`;
    const availableText = complaint.availableTimes
      ? `기록된 방문 가능 시간은 ${complaint.availableTimes}입니다.`
      : "방문 가능 시간은 아직 확인되지 않았습니다.";
    const noteLine = note ? `\n\n관리자 확인 메모: ${note}` : "";
    const referenceLine =
      "AI 분석은 참고용이며, 책임 소재와 비용 부담은 관리자 확인 후 별도로 안내드리겠습니다.";

    if (intent === "REQUEST_PHOTO") {
      return [
        `${roomLabel} ${complaint.title} 건 확인했습니다.`,
        `${channelText} 기준으로 ${ticket.aiSummary}`,
        "정확한 확인을 위해 문제 부위가 보이는 근접 사진 1장과 공간 전체가 보이는 사진 1장을 추가로 올려주세요.",
        availableText,
        "사진을 확인한 뒤 긴급도, 업체 배정 여부, 다음 조치 일정을 이어서 안내드리겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "REQUEST_DETAILS") {
      return [
        `${roomLabel} ${complaint.title} 건을 검토 중입니다.`,
        `${channelText}과 AI 요약은 확인했으나 처리 방향을 정하려면 추가 설명이 필요합니다.`,
        "증상이 시작된 시점, 현재도 반복되는지, 사용이 완전히 불가능한지 알려주세요.",
        availableText,
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "SCHEDULE_VISIT") {
      return [
        `${roomLabel} ${complaint.title} 건 확인했습니다.`,
        `${analysis?.recommendedAction ?? "현장 확인 또는 업체 점검 일정을 조율하겠습니다."}`,
        "방문 가능한 날짜와 시간대를 2개 이상 남겨주시면 가장 빠른 일정으로 조율하겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "ASSIGN_VENDOR_NOTICE") {
      return [
        `${roomLabel} ${complaint.title} 건은 협력업체 확인 단계로 넘겼습니다.`,
        `${analysis?.recommendedAction ?? "업체가 사진과 증상 요약을 확인한 뒤 방문 일정을 제안할 예정입니다."}`,
        availableText,
        "일정이 확정되면 이 티켓에서 다시 안내드리겠습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    if (intent === "COMPLETION_NOTICE") {
      return [
        `${roomLabel} ${complaint.title} 건의 수리 완료 보고가 접수되었습니다.`,
        "수리 결과를 확인하시고 문제가 해결되었으면 완료 확인을 눌러주세요.",
        "아직 문제가 남아 있다면 미해결 사유와 사진을 남겨 재요청할 수 있습니다.",
        referenceLine
      ].join("\n") + noteLine;
    }

    return [
      `${roomLabel} ${complaint.title} 건 접수를 확인했습니다.`,
      `${channelText} 기준으로 ${ticket.aiSummary}`,
      `${availableText}`,
      "관리자가 AI 요약, 긴급도, 사진 자료를 검토한 뒤 다음 조치를 안내드리겠습니다.",
      referenceLine
    ].join("\n") + noteLine;
  }

  private sourceChannelDisplay(sourceChannel: ComplaintSourceChannel) {
    const labels: Record<ComplaintSourceChannel, string> = {
      DIRECT_FORM: "앱 직접 입력",
      REALTIME_CHAT: "리얼타임 챗봇",
      VOICE_CHAT: "음성 챗봇",
      CALLBOT: "콜봇",
      MANAGER_PROXY: "관리자 대리 접수"
    };

    return labels[sourceChannel];
  }

  private presentManagerAssistantTicket(ticket: Ticket): ManagerAssistantTicketMatch {
    const complaint = this.findComplaint(ticket.complaintId);
    const room = this.store.rooms.find((item) => item.id === ticket.roomId);

    return {
      ticketId: ticket.id,
      complaintId: complaint.id,
      title: complaint.title,
      roomLabel: room ? `${room.buildingName} ${room.roomNo}` : "호실 확인 필요",
      status: ticket.status,
      displayStatus: this.displayStatus(ticket.status),
      sourceChannel: ticket.sourceChannel,
      priority: ticket.priority,
      category: ticket.category,
      summary: ticket.aiSummary,
      dueAt: ticket.dueAt
    };
  }

  private managerAssistantTicketKeywordFilters(question: string) {
    const normalizedQuestion = question.toLocaleLowerCase("ko-KR");
    const groups = [
      { label: "에어컨", aliases: ["에어컨", "냉방", "실내기", "냉난방"] },
      { label: "세면대", aliases: ["세면대", "수전", "배수 트랩"] },
      { label: "보일러", aliases: ["보일러", "온수", "난방"] },
      { label: "도어락", aliases: ["도어락", "현관 잠금", "잠금장치"] },
      { label: "창문", aliases: ["창문", "창호", "창틀"] },
      { label: "누수", aliases: ["누수", "물샘", "물방울", "물이 떨어"] }
    ];

    return groups.filter((group) =>
      group.aliases.some((alias) => normalizedQuestion.includes(alias.toLocaleLowerCase("ko-KR")))
    );
  }

  private managerAssistantTicketMatchesKeyword(ticket: Ticket, aliases: string[]) {
    const complaint = this.findComplaint(ticket.complaintId);
    const analysis = this.store.analyses[ticket.id];
    const messages = this.store.messages.filter((message) => message.ticketId === ticket.id);
    const searchable = [
      ticket.id,
      ticket.category,
      ticket.aiSummary,
      ticket.responsibilityHint,
      complaint.title,
      complaint.description,
      complaint.location,
      analysis?.summary,
      analysis?.category,
      analysis?.detailCategory,
      analysis?.recommendedAction,
      ...(analysis?.reasons ?? []),
      ...(analysis?.photoAnalysis?.candidates ?? []),
      analysis?.photoAnalysis?.summary,
      ...(analysis?.photoAnalysis?.evidence ?? []),
      ...messages.map((message) => message.messageText)
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n")
      .toLocaleLowerCase("ko-KR");

    return aliases.some((alias) => searchable.includes(alias.toLocaleLowerCase("ko-KR")));
  }

  private ticketNeedsPhotoForManagerAssistant(ticket: Ticket) {
    const analysis = this.store.analyses[ticket.id];
    const photoAnalysis = analysis?.photoAnalysis;
    const hasPhoto =
      (photoAnalysis?.attachmentUrls.length ?? 0) > 0 ||
      this.store.messages.some(
        (message) => message.ticketId === ticket.id && message.attachmentUrls.length > 0
      );
    const callbot = this.presentCallbotContext(ticket);
    const relatedText = [
      ticket.aiSummary,
      analysis?.recommendedAction,
      ...(analysis?.reasons ?? []),
      ...this.store.messages
        .filter((message) => message.ticketId === ticket.id)
        .map((message) => message.messageText)
    ].join("\n");

    return (
      Boolean(callbot?.needPhoto) ||
      (ticket.status === "ADDITIONAL_INFO_REQUESTED" && /사진|촬영|첨부/.test(relatedText)) ||
      (!hasPhoto && /사진|누수|천장|곰팡이|파손|하자/.test(relatedText))
    );
  }

  private composeManagerAssistantAnswer(
    question: string,
    filters: string[],
    matchedTickets: ManagerAssistantTicketMatch[]
  ) {
    const filterSummary = filters.join(", ");

    if (matchedTickets.length === 0) {
      return `"${question}" 조건으로 조회했지만 ${filterSummary}에 맞는 티켓은 없습니다. 기간이나 상태 조건을 넓히면 다시 확인할 수 있습니다.`;
    }

    const examples = matchedTickets
      .slice(0, 3)
      .map(
        (ticket) =>
          `${ticket.roomLabel} ${ticket.title}(${ticket.displayStatus}, P${ticket.priority})`
      )
      .join("; ");

    return `${filterSummary} 조건으로 ${matchedTickets.length}건을 찾았습니다. 우선 확인할 티켓은 ${examples}입니다.`;
  }

  private managerAssistantNextActions(
    matchedTickets: ManagerAssistantTicketMatch[],
    filters: string[]
  ) {
    if (matchedTickets.length === 0) {
      return ["조건을 넓히거나 호실/기간 조건을 제거해 다시 조회하세요."];
    }

    const actions = new Set<string>();

    if (filters.includes("업체 배정: 미배정")) {
      actions.add("긴급도와 사진 자료를 확인한 뒤 우선순위가 높은 티켓부터 업체 배정을 진행하세요.");
    }

    if (filters.some((filter) => filter.startsWith("사진:"))) {
      actions.add("사진이 필요한 티켓은 세입자에게 근접 사진과 공간 전체 사진을 요청하세요.");
    }

    if (filters.includes("접수 채널: 콜봇")) {
      actions.add("콜봇 티켓은 전사 내용, 통화 녹음, 사진 업로드 링크 발송 상태를 함께 확인하세요.");
    }

    if (filters.includes("긴급도: 1순위")) {
      actions.add("긴급 티켓은 당일 확인 여부와 위험 확산 가능성을 먼저 점검하세요.");
    }

    return actions.size ? Array.from(actions) : ["목록에서 티켓을 선택해 AI 요약과 처리 이력을 확인하세요."];
  }

  private buildManagerRealtimeInstructions(input: RealtimeClientSecretInput) {
    return buildManagerRealtimeInstructions(input);
  }

  private managerRealtimeTools(): Array<Record<string, unknown>> {
    return toRealtimeTools();
  }

  private managerAgentBlockedCommand(command: string, text: string) {
    const normalized = `${command} ${text}`.toLowerCase();

    if (/confirm_payment|payment\.confirm|match_deposit|deposit\.match|announcement\.send|send_announcement|결제\s*확정|입금\s*확정|입금\s*매칭|공지\s*발송/.test(normalized)) {
      return true;
    }

    if (command !== "billing.send_dunning" && /send_dunning|dunning|독촉/.test(normalized)) {
      return true;
    }

    return false;
  }

  private managerAgentDomainFor(command: string): ManagerAgentCommandResult["domain"] {
    if (command.startsWith("ticket.")) {
      return "ticket";
    }

    if (command.startsWith("billing.")) {
      return "billing";
    }

    if (command.startsWith("credit.")) {
      return "credit";
    }

    if (command.startsWith("messaging.")) {
      return "messaging";
    }

    return "system";
  }

  private presentComplaint(complaint: Complaint) {
    const ticket = this.findTicket(complaint.ticketId);
    const messages = this.store.messages
      .filter((message) => message.ticketId === ticket.id)
      .map((message) => this.presentTicketMessage(message));

    return {
      ...complaint,
      room: this.store.rooms.find((room) => room.id === complaint.roomId),
      displayStatus: this.displayStatus(ticket.status),
      ticket: this.presentTicket(ticket),
      nextAction: this.presentTenantNextAction(ticket, messages),
      aiFeedback: this.store.aiFeedback
        .filter((feedback) => feedback.ticketId === ticket.id)
        .map((feedback) => this.presentAiFeedback(feedback)),
      messages
    };
  }

  private presentTenantNextAction(
    ticket: Ticket,
    messages: ReturnType<typeof this.presentTicketMessage>[]
  ) {
    if (ticket.status !== "ADDITIONAL_INFO_REQUESTED") {
      return undefined;
    }

    const requestMessages = messages
      .filter(
        (message) =>
          ["LANDLORD", "SYSTEM", "AI_ASSISTANT"].includes(message.senderRole) &&
          /사진|촬영|첨부|추가 정보|추가 설명|업로드 링크/.test(message.messageText)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latestRequest = requestMessages[0];
    const requestText = latestRequest?.messageText ?? ticket.aiSummary;
    const requiresPhoto = /사진|촬영|첨부|업로드 링크/.test(requestText);
    const requestedItems = [
      requiresPhoto ? "문제 부위 근접 사진" : undefined,
      requiresPhoto ? "공간 전체가 보이는 사진" : undefined,
      /설명|상태|추가 정보/.test(requestText) ? "현재 상태 설명" : undefined,
      /방문|시간/.test(requestText) ? "방문 가능 시간" : undefined
    ].filter((item): item is string => Boolean(item));

    return {
      kind: requiresPhoto ? "PHOTO_REQUEST" : "ADDITIONAL_INFO",
      title: requiresPhoto ? "추가 사진이 필요합니다" : "추가 정보가 필요합니다",
      description: requestText,
      requestedItems: requestedItems.length ? requestedItems : ["요청받은 추가 자료"],
      requiresPhoto,
      uploadHint: requiresPhoto
        ? "아래 추가 자료 제출에서 사진을 첨부하면 기존 티켓에 자동 연결됩니다."
        : "아래 추가 자료 제출에서 설명을 남기면 기존 티켓에 자동 연결됩니다."
    };
  }

  private presentTicket(ticket: Ticket, sourceStore: Store = this.store) {
    const complaint = this.findComplaint(ticket.complaintId, sourceStore);
    const room = sourceStore.rooms.find((item) => item.id === ticket.roomId);
    const analysis = sourceStore.analyses[ticket.id];

    if (!analysis) {
      throw new NotFoundException("AI 분석을 찾을 수 없습니다.");
    }

    return {
      ...ticket,
      responsibilityDecision:
        ticket.responsibilityDecidedById &&
        ticket.responsibilityDecidedAt &&
        ticket.responsibilityDecisionNote
          ? {
              responsibility:
                ticket.responsibilityHint === "임차인 책임 가능성" ? "TENANT" : "LANDLORD",
              decidedById: ticket.responsibilityDecidedById,
              decidedAt: ticket.responsibilityDecidedAt,
              note: ticket.responsibilityDecisionNote
            }
          : undefined,
      directHandling: ticket.directHandlingStartedAt
        ? {
            startedAt: ticket.directHandlingStartedAt,
            ...(ticket.directHandlingCompletedAt
              ? { completedAt: ticket.directHandlingCompletedAt }
              : {}),
            ...(ticket.directHandlingNote ? { note: ticket.directHandlingNote } : {})
          }
        : null,
      kind: this.ticketKindFromCategory(ticket.category),
      complaint,
      room,
      analysis: this.presentAnalysis(analysis, ticket, sourceStore),
      aiFeedback: sourceStore.aiFeedback
        .filter((feedback) => feedback.ticketId === ticket.id)
        .map((feedback) => this.presentAiFeedback(feedback)),
      assignedVendor: ticket.assignedVendorId
        ? sourceStore.vendors.find((vendor) => vendor.id === ticket.assignedVendorId)
        : undefined,
      repairs: sourceStore.repairs.filter((repair) => repair.ticketId === ticket.id),
      messages: sourceStore.messages
        .filter((message) => message.ticketId === ticket.id)
        .map((message) => this.presentTicketMessage(message)),
      history: sourceStore.history.filter((history) => history.ticketId === ticket.id),
      roomTimeline: this.presentRoomTimeline(ticket.roomId, {}, sourceStore),
      callbot: this.presentCallbotContext(ticket, sourceStore)
    };
  }

  private presentTicketForManager(
    managerId: string,
    ticket: Ticket,
    sourceStore: Store = this.store,
    options: { includeDetail?: boolean } = {}
  ) {
    const managerReadAt = sourceStore.managerTicketReads?.find(
      (read) => read.managerId === managerId && read.ticketId === ticket.id,
    )?.readAt;
    const selfRepair = sourceStore.repairs
      .filter(
        (repair) =>
          repair.ticketId === ticket.id &&
          repair.tenantInitiated === true &&
          !["COMPLETED", "CANCELLED"].includes(repair.status)
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    const presentedTicket = this.presentTicket(ticket, sourceStore);
    const { messages: unsortedMessages, ...ticketWithoutMessages } = presentedTicket;
    const vendorDecline = sourceStore.repairs
      .filter(
        (repair) =>
          repair.ticketId === ticket.id &&
          repair.status === "CANCELLED" &&
          repair.latestEstimate?.status === "DECLINED" &&
          Boolean(repair.latestEstimate.declineReason?.trim())
      )
      .sort((left, right) => {
        const leftAt = left.latestEstimate?.submittedAt ?? left.updatedAt;
        const rightAt = right.latestEstimate?.submittedAt ?? right.updatedAt;
        return rightAt.localeCompare(leftAt);
      })[0];

    return {
      ...ticketWithoutMessages,
      managerReadAt,
      isManagerUnread: !managerReadAt,
      selfRepair: selfRepair
        ? {
            active: true as const,
            statusLabel: this.repairStatusLabel(selfRepair.status)
          }
        : null,
      ...(options.includeDetail
        ? {
            messages: [...unsortedMessages].sort(
              (left, right) =>
                left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
            ),
            ...(vendorDecline
              ? {
                  vendorDecline: {
                    repairId: vendorDecline.id,
                    reason: vendorDecline.latestEstimate!.declineReason!.trim()
                  }
                }
              : {})
          }
        : {}),
    };
  }

  private repairStatusLabel(status: RepairStatus) {
    const labels: Record<RepairStatus, string> = {
      REQUESTED: "견적 요청",
      ACCEPTED: "견적 작성 중",
      ESTIMATE_SUBMITTED: "견적 검토 중",
      ESTIMATE_APPROVED: "일정 확인 필요",
      SCHEDULED: "방문 예정",
      IN_PROGRESS: "작업 중",
      COMPLETION_REPORTED: "완료 확인 중",
      COMPLETED: "작업 완료",
      CANCELLED: "종료"
    };

    return labels[status];
  }

  private ticketKindFromCategory(category: string): TicketType {
    return ["소음", "납부", "계약", "공용공간", "기타", "주차", "민원"].includes(category)
      ? "complaint"
      : "defect";
  }

  private presentCallbotContext(
    ticket: Ticket,
    sourceStore: Store = this.store
  ): CallbotTicketContext | undefined {
    if (ticket.sourceChannel !== "CALLBOT") {
      return undefined;
    }

    const messages = sourceStore.messages.filter((message) => message.ticketId === ticket.id);
    const recordingMessage = messages.find((message) =>
      message.messageText.startsWith("콜봇 통화 녹음:")
    );
    const uploadMessage = messages.find((message) =>
      message.messageText.startsWith("사진 업로드 링크 발송 대기:")
    );
    const uploadedAfterRequest = messages.some(
      (message) =>
        message.senderRole === "TENANT" &&
        message.attachmentUrls.length > 0 &&
        (!uploadMessage || message.createdAt.localeCompare(uploadMessage.createdAt) >= 0)
    );
    const recordingUrl = recordingMessage?.messageText.replace("콜봇 통화 녹음:", "").trim();
    const pendingPhotoUploadUrl = uploadMessage?.messageText
      .replace("사진 업로드 링크 발송 대기:", "")
      .trim();
    const photoUploadUrl = uploadedAfterRequest ? undefined : pendingPhotoUploadUrl;
    const tenantTranscript = messages
      .filter((message) => message.senderRole === "TENANT")
      .map((message) => message.messageText.trim())
      .filter(Boolean)
      .join("\n");
    const aiSummary =
      messages
        .filter((message) => message.senderRole === "AI_ASSISTANT")
        .map((message) => message.messageText.trim())
        .filter(Boolean)
        .join("\n") || ticket.aiSummary;
    const needPhoto =
      !uploadedAfterRequest &&
      (Boolean(photoUploadUrl) ||
      (ticket.status === "ADDITIONAL_INFO_REQUESTED" &&
        /사진|촬영|첨부/.test(`${ticket.aiSummary}\n${tenantTranscript}\n${aiSummary}`)));

    return {
      hasRecording: Boolean(recordingUrl),
      recordingUrl,
      transcriptText: tenantTranscript || "통화 전사 확인 필요",
      aiSummary,
      needPhoto,
      photoUploadUrl,
      statusNote: uploadedAfterRequest
        ? "사진 수신 후 검토중"
        : photoUploadUrl
          ? "사진 업로드 링크 발송 대기"
          : this.displayStatus(ticket.status)
    };
  }

  private presentTicketMessage(message: TicketMessage) {
    return {
      ...message,
      attachmentUrls: [...message.attachmentUrls]
    };
  }

  private presentAiFeedback(feedback: AiFeedback) {
    return {
      ...feedback,
      attachmentUrls: [...feedback.attachmentUrls]
    };
  }

  private presentAnalysis(
    analysis: AiAnalysis,
    ticket?: Ticket,
    sourceStore: Store = this.store
  ) {
    const repeatSummary = ticket
      ? this.repeatIssueSummaryForTicket(ticket, analysis, sourceStore)
      : analysis.repeatSummary;

    return {
      ...analysis,
      reasons: analysis.reasons ? [...analysis.reasons] : undefined,
      photoAnalysis: analysis.photoAnalysis
        ? this.presentPhotoAnalysis(analysis.photoAnalysis)
        : undefined,
      repeatSummary: repeatSummary ? this.presentRepeatIssueSummary(repeatSummary) : undefined
    };
  }

  private presentRepeatIssueSummary(summary: RepeatIssueSummary): RepeatIssueSummary {
    return {
      ...summary,
      matchedTicketIds: [...summary.matchedTicketIds],
      matchedComplaintIds: [...summary.matchedComplaintIds],
      evidence: [...summary.evidence]
    };
  }

  private presentPhotoAnalysis(photoAnalysis: PhotoAnalysis): PhotoAnalysis {
    return {
      ...photoAnalysis,
      attachmentUrls: [...photoAnalysis.attachmentUrls],
      previousAttachmentUrls: [...photoAnalysis.previousAttachmentUrls],
      candidates: [...photoAnalysis.candidates],
      evidence: [...photoAnalysis.evidence]
    };
  }

  private presentRepair(repair: RepairRequest) {
    const ticket = this.findTicket(repair.ticketId);

    return {
      ...repair,
      ticket: this.presentTicket(ticket)
    };
  }

  private cloneReceiptOcr(ocr: ReceiptOcr): ReceiptOcr {
    return {
      ...ocr,
      fields: {
        item: { ...ocr.fields.item },
        date: { ...ocr.fields.date },
        amount: { ...ocr.fields.amount },
        unitId: ocr.fields.unitId ? { ...ocr.fields.unitId } : undefined
      },
      lineItems: ocr.lineItems.map((item) => ({ ...item }))
    };
  }

  private displayUnitId(room: Room) {
    return room.roomNo.replace(/호$/u, "");
  }

  private tradeListingBuildingName(listing: { title?: string; buildingName?: string }) {
    const buildingName = listing.buildingName?.trim();
    if (buildingName) return buildingName;
    return listing.title?.trim() || "Trade listing";
  }

  private tradeListingRoomNo(listing: { detailAddress?: string }) {
    const roomNo = listing.detailAddress?.trim().replace(/호+$/u, "").trim();
    return roomNo || "101";
  }

  private tradeListingAddress(listing: { location?: string }) {
    return listing.location?.trim() || "Location unavailable";
  }

  private elapsedHours(startIso: string, endIso: string) {
    const elapsed = this.timeOf(endIso) - this.timeOf(startIso);

    return elapsed > 0 ? Math.round((elapsed / 3_600_000) * 10) / 10 : undefined;
  }

  private median(values: number[]) {
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    return sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  }

  private average(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private timeOf(iso?: string) {
    return iso ? new Date(iso).getTime() || 0 : 0;
  }

  private displayStatus(status: TicketStatus) {
    const map: Record<TicketStatus, string> = {
      RECEIVED: "접수됨",
      REVIEWING: "검토중",
      ADDITIONAL_INFO_REQUESTED: "추가정보 요청",
      VENDOR_ASSIGNMENT_PENDING: "처리 준비중",
      VENDOR_ASSIGNED: "업체 배정",
      ESTIMATE_REVIEW: "처리 준비중",
      REPAIR_IN_PROGRESS: "수리중",
      COMPLETION_REPORTED: "완료 확인중",
      COMPLETED: "완료",
      REOPENED: "재요청",
      CANCELLED: "취소됨"
    };

    return map[status];
  }

  private assertTicketStatus(ticketId: string, allowed: TicketStatus[], action: string) {
    const ticket = this.findTicket(ticketId);

    if (!allowed.includes(ticket.status)) {
      throw new BadRequestException(
        `${action}을 처리할 수 없는 티켓 상태입니다. 현재 상태: ${ticket.status}`
      );
    }
  }

  private assertRepairStatus(repair: RepairRequest, allowed: RepairStatus[], action: string) {
    if (!allowed.includes(repair.status)) {
      throw new BadRequestException(
        `${action}을 처리할 수 없는 수리 상태입니다. 현재 상태: ${repair.status}`
      );
    }
  }

  private transitionTicket(ticketId: string, toStatus: TicketStatus, changedByUserId: string, note?: string) {
    const ticket = this.findTicket(ticketId);
    const fromStatus = ticket.status;
    ticket.status = toStatus;
    ticket.updatedAt = now();
    const complaint = this.findComplaint(ticket.complaintId);
    complaint.status = complaintStatusFor(toStatus);
    complaint.updatedAt = now();
    this.pushHistory(ticketId, changedByUserId, fromStatus, toStatus, note);

    return ticket;
  }

  private pushHistory(
    ticketId: string,
    changedByUserId: string,
    fromStatus: TicketStatus | undefined,
    toStatus: TicketStatus,
    note?: string
  ) {
    const history: StatusHistory = {
      id: id("hst"),
      ticketId,
      changedByUserId,
      fromStatus,
      toStatus,
      note,
      createdAt: now()
    };
    this.store.history.unshift(history);

    return history;
  }

  private addMessageInternal(
    ticketId: string,
    complaintId: string | undefined,
    senderUserId: string,
    senderRole: TicketMessage["senderRole"],
    messageText: string,
    attachmentUrls: string[] = [],
    repairId?: string
  ) {
    const message: TicketMessage = {
      id: id("msg"),
      ticketId,
      complaintId,
      ...(repairId ? { repairId } : {}),
      senderUserId,
      senderRole,
      messageText,
      attachmentUrls: [...attachmentUrls],
      createdAt: now()
    };

    this.store.messages.push(message);

    return message;
  }

  private activeRepairIdForTicket(ticketId: string): string | undefined {
    return this.store.repairs
      .filter(
        (repair) =>
          repair.ticketId === ticketId &&
          !["COMPLETED", "CANCELLED"].includes(repair.status)
      )
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)
      )[0]?.id;
  }

  private findComplaint(complaintId: string, sourceStore: Store = this.store) {
    const complaint = sourceStore.complaints.find((item) => item.id === complaintId);

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    return complaint;
  }

  private findTicket(ticketId: string, sourceStore: Store = this.store) {
    const ticket = sourceStore.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      throw new NotFoundException("티켓을 찾을 수 없습니다.");
    }

    return ticket;
  }

  private findRoom(roomId: string, sourceStore: Store = this.store) {
    const room = sourceStore.rooms.find((item) => item.id === roomId);

    if (!room) {
      throw new NotFoundException("호실을 찾을 수 없습니다.");
    }

    return room;
  }

  private canManagerAccessRoom(
    managerId: string,
    roomId: string,
    sourceStore: Store = this.store
  ) {
    return sourceStore.rooms.some(
      (room) => room.id === roomId && room.landlordId === managerId
    );
  }

  private assertManagerCanAccessRoom(
    managerId: string,
    roomId: string,
    sourceStore: Store = this.store
  ) {
    const room = this.findRoom(roomId, sourceStore);

    if (room.landlordId !== managerId) {
      throw new ForbiddenException("담당 호실에만 접근할 수 있습니다.");
    }
  }

  private assertManagerCanAccessTicket(
    managerId: string,
    ticket: Ticket,
    sourceStore: Store = this.store
  ) {
    this.assertManagerCanAccessRoom(managerId, ticket.roomId, sourceStore);
  }

  private findIntakeSession(tenantId: string, sessionId: string) {
    const session = this.store.intakeSessions.find(
      (item) => item.id === sessionId && item.tenantId === tenantId
    );

    if (!session) {
      throw new NotFoundException("상담 스레드를 찾을 수 없습니다.");
    }

    return session;
  }

  private findRepair(repairId: string) {
    const repair = this.store.repairs.find((item) => item.id === repairId);

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return repair;
  }

}
