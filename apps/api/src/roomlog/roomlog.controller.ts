import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  GoneException,
  Headers,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  ConfirmTenantVendorConnectionInput,
  DecideRepairCompletionInput,
  PrepareTenantVendorConnectionInput,
  SubmitVendorCompletionInput,
  TenantVendorCompletionDecisionInput,
  TenantVendorEstimateReviewInput,
  TenantVendorVisitScheduleInput,
  VendorCatalogSearchFilters,
  VendorEstimateDraftInput,
  VendorEstimateReviewInput,
  VendorVisitScheduleInput
} from "@roomlog/types";
import {
  AddMessagingThreadMessageInput,
  AnnouncementTranslationRequest,
  AttachmentCategory,
  AddTenantComplaintMessageInput,
  ConfirmTenantCompletionInput,
  ConfirmBillPaymentInput,
  CreateAnnouncementDraftInput,
  CreateManagerReportExternalShareInput,
  CreateManagerReportFollowUpInput,
  CreateManagerReportInput,
  CreateComplaintInput,
  CreateComplaintFromCallInput,
  CreateIntakeSessionInput,
  CreateMessagingThreadInput,
  CreateManagerContractInput,
  CreateManagerContractInviteInput,
  CreateManagerBillsInput,
  CreateMoveoutDisputeInput,
  CreateMoveInChecklistItemInput,
  CreateBillPaymentOrderInput,
  CreatePaymentReportInput,
  CreateTenantContractInput,
  CreateTenantMessagingThreadInput,
  CreateTenantMoveoutInquiryInput,
  DeletionState,
  EscalateMoveoutDisputeInput,
  FinalizeIntakeInput,
  FloorPlanOpeningDetectionInput,
  AskManagerReportChatInput,
  CreateRoomInput,
  FloorPlanAiAnalysisInput,
  CopilotChatRequest,
  ManagerAgentCommandInput,
  ManagerAssistantQueryInput,
  ManagerReplyDraftInput,
  MessagingThreadContext,
  MoveoutAdjustDeductionInput,
  MoveoutAdjustWearVerdictInput,
  MoveoutCompleteReviewInput,
  MoveoutRespondDisputeInput,
  UpdateTenantMoveoutDisputeInput,
  UpdateAnnouncementDraftInput,
  UpdateMoveoutChecklistInput,
  ManagerTicketReplyInput,
  MatchDepositInput,
  RealtimeClientSecretInput,
  RecordRealtimeTurnInput,
  ReopenTenantComplaintInput,
  ReviewTenantAiFeedbackInput,
  SaveFloorPlanDraftInput,
  SaveRoomWallsInput,
  SendIntakeMessageInput,
  SendDunningInput,
  StartManagerConversationInput,
  SubmitTenantAiFeedbackInput,
  UpdateManagerContractInventoryInput,
  UpdateManagerContractInviteInput,
  UpdateManagerContractManualValuesInput,
  UpdateManagerContractPrivacyInput,
  UserAccount,
  UserRole
} from "./roomlog.types";
import { RoomlogService } from "./roomlog.service";
import { VendorActivationDomainError } from "./services/roomlog-vendor-activation.domain";
import { RoomlogManagerVendorDomain } from "./services/roomlog-manager-vendor.domain";
import { RoomlogVendorWorkflowDomain } from "./services/roomlog-vendor-workflow.domain";
import { RoomlogTenantVendorConnectionDomain } from "./services/roomlog-tenant-vendor-connection.domain";
import { VendorCompletionAttachmentService } from "./vendor-completion-attachment.service";
import { VendorActivationRepositoryError } from "./vendor-activation.repository";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { issueSocketTicket } from "../realtime/socket-ticket";

type UploadedImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

function exactStringBody(body: unknown, field: string): string {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    throw new BadRequestException("요청 본문 형식이 올바르지 않습니다.");
  }

  const keys = Reflect.ownKeys(body);
  const value = (body as Record<string, unknown>)[field];
  if (
    keys.length !== 1 ||
    keys[0] !== field ||
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new BadRequestException("요청 본문 형식이 올바르지 않습니다.");
  }

  return value;
}

function rejectCallerIdentity(body: unknown, forbiddenFields: readonly string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const record = body as Record<string, unknown>;
  if (forbiddenFields.some((field) => Object.hasOwn(record, field))) {
    throw new BadRequestException("요청 본문에 사용자 식별자를 포함할 수 없습니다.");
  }
}

function catalogFilters(
  query?: string,
  trade?: string,
  serviceArea?: string,
  verificationStatus?: string,
  isActive?: string
): VendorCatalogSearchFilters {
  const filters: VendorCatalogSearchFilters = {};
  if (query?.trim()) filters.query = query.trim();
  if (trade?.trim()) filters.trade = trade.trim();
  if (serviceArea?.trim()) filters.serviceArea = serviceArea.trim();
  if (verificationStatus?.trim()) {
    if (!["VERIFIED", "PENDING", "REJECTED"].includes(verificationStatus)) {
      throw new BadRequestException("업체 인증 상태 필터가 올바르지 않습니다.");
    }
    filters.verificationStatus = verificationStatus as VendorCatalogSearchFilters["verificationStatus"];
  }
  if (isActive !== undefined) {
    if (isActive !== "true" && isActive !== "false") {
      throw new BadRequestException("업체 활성 상태 필터가 올바르지 않습니다.");
    }
    filters.isActive = isActive === "true";
  }
  return filters;
}

function rethrowVendorActivationError(error: unknown): never {
  if (!(error instanceof VendorActivationDomainError)) throw error;

  switch (error.response.code) {
    case "INVALID_KEY":
      throw new BadRequestException(error.response);
    case "EXPIRED_KEY":
      throw new GoneException(error.response);
    case "UNAVAILABLE_VENDOR":
    case "ALREADY_CLAIMED":
    case "DEDICATED_ACCOUNT_REQUIRED":
    case "ACCOUNT_ALREADY_LINKED":
      throw new ConflictException(error.response);
    case "ACTIVATION_UNAVAILABLE":
      throw new ServiceUnavailableException(error.response);
  }
}

@Controller()
export class RoomlogController {
  constructor(
    private readonly roomlogService: RoomlogService,
    private readonly realtime: RealtimeGateway,
    @Optional()
    private readonly managerVendor?: RoomlogManagerVendorDomain,
    @Optional()
    private readonly vendorWorkflow?: RoomlogVendorWorkflowDomain,
    @Optional()
    private readonly vendorCompletionAttachments?: VendorCompletionAttachmentService,
    @Optional()
    private readonly tenantVendorConnection?: RoomlogTenantVendorConnectionDomain
  ) {}

  @Get("roomlog/demo")
  getDemoState() {
    return this.roomlogService.getDemoState();
  }

  @Get("roomlog/runtime-config")
  getRuntimeConfig() {
    return this.roomlogService.getRuntimeConfig();
  }

  @Post("auth/vendor-activations/preview")
  async previewVendorActivation(@Body() body: unknown) {
    const key = exactStringBody(body, "key");

    try {
      return await this.roomlogService.previewVendorActivation(key);
    } catch (error) {
      return rethrowVendorActivationError(error);
    }
  }

  @Post("auth/vendor-activations/claim")
  async claimVendorActivation(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ) {
    const activationSession = exactStringBody(body, "activationSession");
    const user = this.roomlogService.getUserFromToken(authorization);

    try {
      return await this.roomlogService.claimVendorActivation(
        user.id,
        activationSession
      );
    } catch (error) {
      return rethrowVendorActivationError(error);
    }
  }

  @Post("auth/signup")
  signup(
    @Body()
    body: {
      email: string;
      password: string;
      passwordConfirm?: string;
      name: string;
      phone?: string;
      role: UserRole;
      buildingName?: string;
      roomNo?: string;
      address?: string;
      inviteToken?: string;
      businessName?: string;
      serviceArea?: string;
    }
  ) {
    // DB가 연결된 환경에서는 DB 커밋이 성공해야 가입 성공을 응답한다.
    return this.roomlogService.signupWithDb(body);
  }

  @Get("auth/invites/:role/:inviteToken")
  getSignupInvitePreview(
    @Param("role") role: UserRole,
    @Param("inviteToken") inviteToken: string
  ) {
    return this.roomlogService.getSignupInvitePreview(role, inviteToken);
  }

  // 초대 수락(연결) — 새 계정 생성 루트가 아니라 "이미 로그인한 계정에 관계를 붙이는" 루트.
  // 역할 가드 없이 인증만 요구한다: 어떤 capability의 계정이든 초대로 새 관계를 얻을 수 있다.
  @Post("auth/invites/:role/:inviteToken/accept")
  acceptInvite(
    @Headers("authorization") authorization: string | undefined,
    @Param("role") role: UserRole,
    @Param("inviteToken") inviteToken: string
  ) {
    const user = this.roomlogService.getUserFromToken(authorization);

    return this.roomlogService.acceptInviteForUser(user.id, role, inviteToken);
  }

  @Post("auth/login")
  login(@Body() body: { email: string; password: string }) {
    // DB에서 이메일로 직접 조회 — 다른 인스턴스/운영자 추가 계정도 재시작 없이 로그인된다.
    return this.roomlogService.loginWithDb(body);
  }

  @Post("auth/social/google/callback")
  loginWithGoogle(
    @Body()
    body: {
      code: string;
      redirectUri: string;
      role?: UserRole;
      inviteToken?: string;
      flow?: "login" | "signup";
    }
  ) {
    return this.roomlogService.loginWithGoogle(body);
  }

  @Post("auth/social/kakao/callback")
  loginWithKakao(
    @Body()
    body: {
      code: string;
      redirectUri: string;
      role?: UserRole;
      inviteToken?: string;
      flow?: "login" | "signup";
    }
  ) {
    return this.roomlogService.loginWithKakao(body);
  }

  @Get("auth/me")
  async getMe(@Headers("authorization") authorization?: string) {
    return await this.roomlogService.getMe(authorization);
  }

  // 소켓 핸드셰이크용 단기 티켓 — httpOnly 쿠키 토큰을 못 읽는 브라우저 JS 대신 BFF가 받아간다.
  @Post("auth/socket-ticket")
  issueSocketTicket(@Headers("authorization") authorization?: string) {
    const user = this.roomlogService.getUserFromToken(authorization);

    return { ticket: issueSocketTicket(user.id, user.name) };
  }

  @Post("attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadAttachment(
    @Headers("authorization") authorization: string | undefined,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() body: { category?: AttachmentCategory }
  ) {
    const user = this.roomlogService.getUserFromToken(authorization);
    const locallyAuthorized = this.roomlogService
      .rolesForUser(user)
      .some((role) => role === "TENANT" || role === "LANDLORD");

    if (!locallyAuthorized) {
      const vendorId = await this.resolveActiveVendorId(user.id);
      if (!vendorId) {
        throw new ForbiddenException("업체 계정 연결이 필요합니다.");
      }
    }

    if (!file?.buffer) {
      throw new BadRequestException("업로드할 이미지 파일이 필요합니다.");
    }

    return this.roomlogService.saveAttachment(user.id, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      category: body.category ?? "COMPLAINT_PHOTO"
    });
  }

  @Post("floor-plans")
  createFloorPlanDraft(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: SaveFloorPlanDraftInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createFloorPlanDraft(user.id, body);
  }

  @Get("floor-plans/ai-models")
  listFloorPlanAiModels(@Headers("authorization") authorization: string | undefined) {
    this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listFloorPlanAiModels();
  }

  @Post("floor-plans/ai-analysis")
  analyzeFloorPlanWithAi(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: FloorPlanAiAnalysisInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.analyzeFloorPlanWithAi(body, user.id);
  }

  @Post("floor-plans/opening-detection")
  detectFloorPlanOpenings(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: FloorPlanOpeningDetectionInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.detectFloorPlanOpenings(body, user.id);
  }

  @Get("floor-plans/:floorPlanId")
  getFloorPlanDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("floorPlanId") floorPlanId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getFloorPlanDraft(user.id, floorPlanId);
  }

  @Patch("floor-plans/:floorPlanId")
  updateFloorPlanDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("floorPlanId") floorPlanId: string,
    @Body() body: SaveFloorPlanDraftInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateFloorPlanDraft(user.id, floorPlanId, body);
  }

  @Post("rooms")
  createRoom(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateRoomInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createRoom(user.id, body);
  }

  @Get("room-walls/:roomId")
  getRoomWalls(@Param("roomId") roomId: string) {
    return this.roomlogService.listRoomWalls(roomId);
  }

  @Patch("room-walls/:roomId")
  replaceRoomWalls(
    @Headers("authorization") authorization: string | undefined,
    @Param("roomId") roomId: string,
    @Body() body: SaveRoomWallsInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.replaceRoomWalls(user.id, roomId, body);
  }

  @Get("sim/load/:roomId")
  loadSimulatorRoom(@Param("roomId") roomId: string) {
    return this.roomlogService.loadSimulatorRoom(roomId);
  }

  @Get("tenant/home")
  async getTenantHome(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);
    const profile = await this.roomlogService.getMe(authorization);

    return {
      profile,
      complaints: this.roomlogService.listTenantComplaints(user.id),
      moveInChecklist: this.roomlogService.listTenantMoveInChecklist(user.id),
      roomTimeline: this.roomlogService.getTenantRoomTimeline(user.id)
    };
  }

  @Get("tenant/room/timeline")
  getTenantRoomTimeline(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantRoomTimeline(user.id);
  }

  @Get("tenant/rooms")
  listTenantRooms(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantRooms(user.id);
  }

  @Get("tenant/move-in-checklist")
  listTenantMoveInChecklist(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMoveInChecklist(user.id);
  }

  @Post("tenant/move-in-checklist")
  createTenantMoveInChecklistItem(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateMoveInChecklistItemInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createMoveInChecklistItem(user.id, body);
  }

  @Get("tenant/complaints")
  listTenantComplaints(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantComplaints(user.id);
  }

  @Get("tenant/bills")
  listTenantBills(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantBills(user.id);
  }

  @Get("tenant/bills/overview")
  getTenantBillingOverview(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantBillingOverview(user.id);
  }

  @Get("tenant/current-contract")
  getTenantCurrentContract(
    @Headers("authorization") authorization?: string,
    @Query("roomId") roomId?: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantCurrentContract(user.id, roomId);
  }

  @Get("tenant/bills/history")
  getTenantPaymentHistory(
    @Headers("authorization") authorization: string | undefined,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantPaymentHistory(user.id, from, to);
  }

  @Get("tenant/bills/:billId/maintenance")
  getTenantBillMaintenance(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantBillMaintenance(user.id, billId);
  }

  @Post("tenant/bills/:billId/reports")
  createTenantPaymentReport(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string,
    @Body() body: CreatePaymentReportInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createTenantPaymentReport(user.id, billId, body);
  }

  @Post("tenant/bills/:billId/payment-orders")
  createTenantBillPaymentOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string,
    @Body() body: CreateBillPaymentOrderInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createTenantBillPaymentOrder(user.id, billId, body);
  }

  @Post("tenant/bills/:billId/payment-orders/confirm")
  confirmTenantBillPayment(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string,
    @Body() body: ConfirmBillPaymentInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.confirmTenantBillPayment(user.id, billId, body);
  }

  @Get("tenant/bills/:billId")
  getTenantBill(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantBill(user.id, billId);
  }

  @Post("tenant/complaints")
  createComplaint(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateComplaintInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    const result = this.roomlogService.createComplaint(user.id, body);
    this.realtime.broadcast("roomlog:activity", { kind: "ticket" });
    return result;
  }

  @Post("tenant/complaints/from-call")
  createComplaintFromCall(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateComplaintFromCallInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    const result = this.roomlogService.createComplaintFromCall(user.id, body);
    this.realtime.broadcast("roomlog:activity", { kind: "ticket" });
    return result;
  }

  @Post("tenant/complaints/intake/sessions")
  createIntakeSession(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateIntakeSessionInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createIntakeSession(user.id, body);
  }

  @Get("tenant/complaints/intake/sessions")
  listIntakeSessions(@Headers("authorization") authorization: string | undefined) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listIntakeSessions(user.id);
  }

  @Get("tenant/complaints/intake/sessions/:sessionId")
  getIntakeSession(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getIntakeSession(user.id, sessionId);
  }

  @Post("tenant/complaints/intake/sessions/:sessionId/messages")
  sendIntakeMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: SendIntakeMessageInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.sendIntakeMessage(user.id, sessionId, body);
  }

  @Post("tenant/complaints/intake/sessions/:sessionId/finalize")
  async finalizeIntakeSession(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: FinalizeIntakeInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    const result = await Promise.resolve(
      this.roomlogService.finalizeIntakeSession(user.id, sessionId, body)
    );
    await this.roomlogService.ensurePersistenceDurability();
    return result;
  }

  @Post("tenant/complaints/intake/sessions/:sessionId/realtime/client-secret")
  createRealtimeClientSecret(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: RealtimeClientSecretInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createRealtimeClientSecret(user.id, sessionId, body);
  }

  @Post("tenant/complaints/intake/sessions/:sessionId/realtime/turns")
  recordRealtimeTurn(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: RecordRealtimeTurnInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.recordRealtimeTurn(user.id, sessionId, body);
  }

  @Post("tenant/complaints/:complaintId/confirm-completion")
  confirmTenantCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: ConfirmTenantCompletionInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.confirmTenantCompletion(user.id, complaintId, body);
  }

  @Post("tenant/complaints/:complaintId/reopen")
  reopenTenantComplaint(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: ReopenTenantComplaintInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.reopenTenantComplaint(user.id, complaintId, body);
  }

  @Get("tenant/complaints/:complaintId")
  getComplaint(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getComplaintDetail(user.id, complaintId);
  }

  @Post("tenant/complaints/:complaintId/messages")
  addTenantMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: AddTenantComplaintMessageInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.addTenantComplaintMessage(user.id, complaintId, body);
  }

  @Post("tenant/complaints/:complaintId/ai-feedback")
  submitTenantAiFeedback(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: SubmitTenantAiFeedbackInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.submitTenantAiFeedback(user.id, complaintId, body);
  }

  @Get("tenant/complaints/:complaintId/vendor-candidates")
  searchTenantPartnerVendors(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Query("query") query?: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireTenantVendorConnectionDomain().search(
      user.id,
      complaintId,
      query
    );
  }

  @Post("tenant/complaints/:complaintId/vendor-connection/preview")
  prepareTenantVendorConnection(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: PrepareTenantVendorConnectionInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireTenantVendorConnectionDomain().prepare(
      user.id,
      complaintId,
      body
    );
  }

  @Post("tenant/complaints/:complaintId/vendor-connection/confirm")
  confirmTenantVendorConnection(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string,
    @Body() body: ConfirmTenantVendorConnectionInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireTenantVendorConnectionDomain().confirm(
      user.id,
      complaintId,
      body
    );
  }

  @Get("tenant/complaints/:complaintId/vendor-workflow")
  getTenantVendorWorkflow(
    @Headers("authorization") authorization: string | undefined,
    @Param("complaintId") complaintId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireVendorWorkflowDomain().getTenantWorkflow(
      user.id,
      complaintId
    );
  }

  @Post("tenant/repairs/:repairId/estimates/:estimateId/review")
  reviewTenantVendorEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: TenantVendorEstimateReviewInput
  ) {
    rejectCallerIdentity(body, ["tenantId", "managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireVendorWorkflowDomain().reviewTenantEstimate(
      user.id,
      repairId,
      estimateId,
      body
    );
  }

  @Post("tenant/repairs/:repairId/estimates/:estimateId/confirm-visit")
  confirmTenantVendorEstimateVisit(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: TenantVendorVisitScheduleInput
  ) {
    rejectCallerIdentity(body, ["tenantId", "managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireVendorWorkflowDomain().confirmTenantEstimateVisit(
      user.id,
      repairId,
      estimateId,
      body
    );
  }

  @Post("tenant/repairs/:repairId/completion-decisions")
  decideTenantVendorCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: TenantVendorCompletionDecisionInput
  ) {
    rejectCallerIdentity(body, ["tenantId", "managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["TENANT"]);
    return this.requireVendorWorkflowDomain().decideTenantCompletion(
      user.id,
      repairId,
      body
    );
  }

  @Post("tenant/messaging/threads")
  createTenantMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateTenantMessagingThreadInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    const result = this.roomlogService.createTenantMessagingThread(user.id, body);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Get("tenant/messaging/landlord-conversation")
  getTenantLandlordConversation(
    @Headers("authorization") authorization?: string,
    @Query("roomId") roomId?: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantLandlordConversation(user.id, roomId);
  }

  @Get("tenant/messaging/threads")
  listTenantMessagingThreads(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMessagingThreads(user.id);
  }

  @Get("tenant/messaging/threads/:threadId")
  getTenantMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantMessagingThread(user.id, threadId);
  }

  @Post("tenant/messaging/threads/:threadId/messages")
  addTenantMessagingThreadMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string,
    @Body() body: AddMessagingThreadMessageInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    const result = this.roomlogService.addTenantMessagingThreadMessage(user.id, threadId, body);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Delete("tenant/messaging/threads/:threadId")
  deleteTenantMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.deleteTenantMessagingThread(user.id, threadId);
  }

  @Get("tenant/messaging/announcements")
  listTenantMessagingAnnouncements(
    @Headers("authorization") authorization: string | undefined,
    @Query("roomId") roomId?: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMessagingAnnouncements(user.id, roomId);
  }

  @Get("tenant/messaging/announcements/:announcementId")
  getTenantMessagingAnnouncement(
    @Headers("authorization") authorization: string | undefined,
    @Param("announcementId") announcementId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantMessagingAnnouncement(user.id, announcementId);
  }

  @Post("tenant/messaging/announcements/:announcementId/read")
  markTenantMessagingAnnouncementRead(
    @Headers("authorization") authorization: string | undefined,
    @Param("announcementId") announcementId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.markTenantMessagingAnnouncementRead(user.id, announcementId);
  }

  @Post("tenant/messaging/announcements/:announcementId/confirm")
  confirmTenantMessagingAnnouncement(
    @Headers("authorization") authorization: string | undefined,
    @Param("announcementId") announcementId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.confirmTenantMessagingAnnouncement(user.id, announcementId);
  }

  @Get("contracts/manager")
  getManagerContractDashboard(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerContractDashboard(user.id);
  }

  @Post("contracts/manager/uploads")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadManagerContractDocument(
    @Headers("authorization") authorization: string | undefined,
    @UploadedFile() file: UploadedImageFile | undefined
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    if (!file?.buffer) {
      throw new BadRequestException("업로드할 계약서 파일이 필요합니다.");
    }

    return this.roomlogService.saveManagerContractUpload(user.id, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype
    });
  }

  @Get("contracts/manager/:contractId")
  getManagerContractDetail(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerContractDetail(user.id, contractId);
  }

  @Post("contracts/manager/:contractId/ocr")
  runManagerContractOcr(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.runManagerContractOcr(user.id, contractId);
  }

  @Post("contracts/manager/:contractId/confirm")
  async confirmManagerContract(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: { confirmNeedsCheck?: boolean; note?: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    const result = this.roomlogService.confirmManagerContractReview(user.id, contractId, body);
    await this.roomlogService.ensurePersistenceDurability();
    return result;
  }

  @Post("contracts/manager/:contractId/request-info")
  requestManagerContractInfo(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.requestManagerContractInfo(user.id, contractId);
  }

  @Post("contracts/manager")
  createManagerContract(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateManagerContractInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerContract(user.id, body);
  }

  @Patch("contracts/manager/:contractId/manual-values")
  async updateManagerContractManualValues(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: UpdateManagerContractManualValuesInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    const result = this.roomlogService.updateManagerContractManualValues(user.id, contractId, body);
    await this.roomlogService.ensurePersistenceDurability();
    return result;
  }

  @Patch("contracts/manager/:contractId/inventory")
  updateManagerContractInventory(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: UpdateManagerContractInventoryInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerContractInventory(user.id, contractId, body);
  }

  @Post("contracts/manager/:contractId/invites")
  createManagerContractInvite(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: CreateManagerContractInviteInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerContractInvite(user.id, contractId, body);
  }

  @Patch("contracts/manager/invites/:inviteId")
  updateManagerContractInvite(
    @Headers("authorization") authorization: string | undefined,
    @Param("inviteId") inviteId: string,
    @Body() body: UpdateManagerContractInviteInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerContractInvite(user.id, inviteId, body);
  }

  @Patch("contracts/manager/:contractId/privacy")
  updateManagerContractPrivacy(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: UpdateManagerContractPrivacyInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerContractPrivacy(user.id, contractId, body);
  }

  @Post("contracts/manager/:contractId/deletion-decision")
  decideManagerContractDeletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string,
    @Body() body: { state: DeletionState; retentionNote?: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.decideManagerContractDeletion(
      user.id,
      contractId,
      body.state,
      body.retentionNote
    );
  }

  @Get("contracts")
  listTenantContracts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantContracts(user.id);
  }

  @Get("contracts/:contractId")
  getTenantContract(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantContract(user.id, contractId);
  }

  @Get("contracts/:contractId/extraction")
  getTenantContractExtraction(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantContractExtraction(user.id, contractId);
  }

  @Get("contracts/:contractId/privacy")
  getTenantContractPrivacy(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantContractPrivacy(user.id, contractId);
  }

  @Post("contracts/:contractId/deletion-request")
  requestTenantContractDeletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("contractId") contractId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.requestTenantContractDeletion(user.id, contractId);
  }

  @Post("contracts")
  createTenantContract(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateTenantContractInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createTenantContract(user.id, body);
  }

  @Get("moveouts/manager/dashboard")
  getManagerMoveoutDashboard(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMoveoutDashboard(user.id);
  }

  @Get("moveouts/manager/rows")
  listManagerMoveoutRows(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerMoveoutRows(user.id);
  }

  @Get("moveouts/:moveoutId/manager")
  getManagerMoveout(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMoveout(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/manager-records")
  listManagerMoveoutRecords(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMoveoutRecords(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/manager-settlement")
  getManagerMoveoutSettlement(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMoveoutSettlement(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/report-audit")
  getManagerMoveoutReportAudit(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerReportAudit(user.id, moveoutId);
  }

  @Patch("moveouts/:moveoutId/records/wear-verdict")
  adjustManagerMoveoutWearVerdict(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: MoveoutAdjustWearVerdictInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.adjustManagerMoveoutWearVerdict(user.id, moveoutId, body);
  }

  @Patch("moveouts/:moveoutId/deductions")
  adjustManagerMoveoutDeduction(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: MoveoutAdjustDeductionInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.adjustManagerMoveoutDeduction(user.id, moveoutId, body);
  }

  @Post("moveouts/:moveoutId/complete-review")
  completeManagerMoveoutReview(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: MoveoutCompleteReviewInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.completeManagerMoveoutReview(user.id, moveoutId, body);
  }

  @Post("moveouts/:moveoutId/disputes/respond")
  respondManagerMoveoutDispute(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: MoveoutRespondDisputeInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.respondManagerMoveoutDispute(user.id, moveoutId, body);
  }

  @Get("moveouts")
  listTenantMoveouts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMoveouts(user.id);
  }

  @Get("moveouts/:moveoutId")
  getTenantMoveout(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantMoveout(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/records")
  listTenantMoveoutRecords(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMoveoutRecords(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/checklist")
  listTenantMoveoutChecklist(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMoveoutChecklist(user.id, moveoutId);
  }

  @Patch("moveouts/:moveoutId/checklist")
  updateTenantMoveoutChecklist(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: UpdateMoveoutChecklistInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.updateTenantMoveoutChecklist(user.id, moveoutId, body);
  }

  @Get("moveouts/:moveoutId/settlement")
  getTenantMoveoutSettlement(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.getTenantMoveoutSettlement(user.id, moveoutId);
  }

  @Get("moveouts/:moveoutId/disputes")
  listTenantMoveoutDisputes(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMoveoutDisputes(user.id, moveoutId);
  }

  @Post("moveouts/:moveoutId/disputes")
  createTenantMoveoutDispute(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: CreateMoveoutDisputeInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createTenantMoveoutDispute(user.id, moveoutId, body);
  }

  @Post("moveouts/:moveoutId/disputes/action")
  updateTenantMoveoutDispute(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: UpdateTenantMoveoutDisputeInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.updateTenantMoveoutDispute(user.id, moveoutId, body);
  }

  @Post("moveouts/:moveoutId/disputes/escalate")
  escalateTenantMoveoutDispute(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: EscalateMoveoutDisputeInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.escalateTenantMoveoutDispute(user.id, moveoutId, body);
  }

  @Post("moveouts/:moveoutId/inquiries")
  createTenantMoveoutInquiry(
    @Headers("authorization") authorization: string | undefined,
    @Param("moveoutId") moveoutId: string,
    @Body() body: CreateTenantMoveoutInquiryInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createTenantMoveoutInquiry(user.id, moveoutId, body);
  }

  @Get("manager/tickets")
  listManagerTickets(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listTicketsForManager(user.id);
  }

  @Post("manager/tickets/:ticketId/read")
  markManagerTicketRead(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const result = this.roomlogService.markManagerTicketRead(user.id, ticketId);
    this.realtime.broadcast("roomlog:activity", {
      kind: "ticket",
      action: "read",
    });

    return result;
  }

  @Get("manager/bills/dashboard")
  getManagerBillDashboard(
    @Headers("authorization") authorization?: string,
    @Query("building") building?: string,
    @Query("month") month?: string,
    @Query("allMonths") allMonths?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerBillDashboard(
      user.id,
      building,
      month,
      allMonths === "true"
    );
  }

  @Get("manager/bills/collection")
  getManagerCollection(
    @Headers("authorization") authorization?: string,
    @Query("building") building?: string,
    @Query("month") month?: string,
    @Query("historyFrom") historyFrom?: string,
    @Query("historyTo") historyTo?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerCollection(
      user.id,
      building,
      month,
      historyFrom,
      historyTo
    );
  }

  @Get("manager/bills/deposits")
  async listManagerBillDeposits(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.listManagerBillDeposits(user.id);
  }

  @Post("manager/bills/deposits/:depositId/match")
  matchManagerDeposit(
    @Headers("authorization") authorization: string | undefined,
    @Param("depositId") depositId: string,
    @Body() body: MatchDepositInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.matchManagerDeposit(user.id, depositId, body);
  }

  @Get("manager/bills/overdue")
  listManagerOverdueCases(
    @Headers("authorization") authorization?: string,
    @Query("building") building?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerOverdueCases(user.id, building);
  }

  @Get("manager/bills/creation-options")
  getManagerBillCreationOptions(
    @Headers("authorization") authorization?: string,
    @Query("building") building?: string,
    @Query("month") month?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerBillCreationOptions(user.id, building, month);
  }

  @Post("manager/bills")
  createManagerBills(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateManagerBillsInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerBills(user.id, body);
  }

  @Post("manager/bills/:billId/publish")
  publishManagerBill(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.publishManagerBill(user.id, billId);
  }

  @Get("manager/bills/:billId/dunning")
  getManagerDunningDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerDunningDraft(user.id, billId);
  }

  @Post("manager/bills/:billId/dunning/send")
  sendManagerDunning(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string,
    @Body() body: SendDunningInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.sendManagerDunning(user.id, billId, body);
  }

  @Post("manager/bills/:billId/reports/:reportId/confirm")
  confirmManagerPaymentReport(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string,
    @Param("reportId") reportId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.confirmManagerPaymentReport(user.id, billId, reportId);
  }

  @Get("manager/bills/:billId")
  getManagerBill(
    @Headers("authorization") authorization: string | undefined,
    @Param("billId") billId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerBill(user.id, billId);
  }

  @Post("manager/assistant/query")
  queryManagerAssistant(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: ManagerAssistantQueryInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.queryManagerAssistant(user.id, body);
  }

  @Post("manager/agent/realtime/client-secret")
  createManagerRealtimeClientSecret(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: RealtimeClientSecretInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerRealtimeClientSecret(user.id, body);
  }

  @Post("manager/agent/realtime/command")
  runManagerAgentCommand(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: ManagerAgentCommandInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.runManagerAgentCommandForRealtime(user.id, body);
  }

  @Post("manager/copilot/chat")
  chatManagerCopilot(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CopilotChatRequest
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.chatManagerCopilot(user.id, body);
  }

  @Get("manager/messaging/threads")
  listManagerMessagingThreads(
    @Headers("authorization") authorization: string | undefined,
    @Query("context") context?: MessagingThreadContext
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerMessagingThreads(user.id, context);
  }

  @Get("manager/messaging/recipients")
  listManagerMessagingRecipients(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerMessagingRecipients(user.id);
  }

  @Post("manager/messaging/conversations")
  startManagerConversation(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: StartManagerConversationInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const result = this.roomlogService.startManagerConversation(user.id, body);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Post("manager/messaging/threads")
  createMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateMessagingThreadInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    const result = this.roomlogService.createMessagingThread(user.id, body);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Get("manager/messaging/threads/:threadId")
  getManagerMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMessagingThread(user.id, threadId);
  }

  @Post("manager/messaging/threads/:threadId/read")
  markManagerMessagingThreadRead(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.markManagerMessagingThreadRead(user.id, threadId);
  }

  @Post("manager/messaging/threads/:threadId/messages")
  addManagerMessagingThreadMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string,
    @Body() body: AddMessagingThreadMessageInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    const result = this.roomlogService.addManagerMessagingThreadMessage(user.id, threadId, body);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Delete("manager/messaging/threads/:threadId")
  deleteManagerMessagingThread(
    @Headers("authorization") authorization: string | undefined,
    @Param("threadId") threadId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.deleteManagerMessagingThread(user.id, threadId);
  }

  @Get("manager/messaging/announcement-drafts")
  listManagerAnnouncementDrafts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerAnnouncementDrafts(user.id);
  }

  @Post("manager/messaging/announcement-drafts")
  createManagerAnnouncementDraft(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateAnnouncementDraftInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerAnnouncementDraft(user.id, body);
  }

  @Get("manager/messaging/announcement-drafts/:draftId")
  getManagerAnnouncementDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("draftId") draftId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerAnnouncementDraft(user.id, draftId);
  }

  @Patch("manager/messaging/announcement-drafts/:draftId")
  updateManagerAnnouncementDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("draftId") draftId: string,
    @Body() body: UpdateAnnouncementDraftInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerAnnouncementDraft(user.id, draftId, body);
  }

  @Post("manager/messaging/announcement-translations")
  translateManagerAnnouncement(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: AnnouncementTranslationRequest
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.translateManagerAnnouncement(user.id, body);
  }

  @Get("manager/messaging/announcement-drafts/:draftId/recipients")
  listManagerAnnouncementRecipients(
    @Headers("authorization") authorization: string | undefined,
    @Param("draftId") draftId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerAnnouncementRecipients(user.id, draftId);
  }

  @Post("manager/messaging/announcement-drafts/:draftId/send")
  sendManagerAnnouncementDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("draftId") draftId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    const result = this.roomlogService.sendManagerAnnouncementDraft(user.id, draftId);
    this.realtime.broadcast("roomlog:activity", { kind: "messaging" });

    return result;
  }

  @Get("manager/messaging/announcement-results")
  listManagerAnnouncementResults(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerAnnouncementResults(user.id);
  }

  @Get("manager/messaging/announcement-results/:announcementId")
  getManagerAnnouncementResult(
    @Headers("authorization") authorization: string | undefined,
    @Param("announcementId") announcementId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerAnnouncementResult(user.id, announcementId);
  }

  @Get("manager/reports")
  listManagerReports(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerReports(user.id);
  }

  @Post("manager/reports")
  createManagerReport(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateManagerReportInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerReport(user.id, body);
  }

  @Get("manager/reports/:reportId")
  getManagerReport(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerReport(user.id, reportId);
  }

  @Get("manager/reports/:reportId/source-references")
  listManagerReportSourceReferences(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerReportSourceReferences(user.id, reportId);
  }

  @Post("manager/reports/:reportId/chat")
  askManagerReportChat(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string,
    @Body() body: AskManagerReportChatInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.askManagerReportChat(user.id, reportId, body);
  }

  @Post("manager/reports/:reportId/external-shares")
  createManagerReportExternalShare(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string,
    @Body() body: CreateManagerReportExternalShareInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerReportExternalShare(user.id, reportId, body);
  }

  @Post("manager/reports/:reportId/external-shares/:shareId/revoke")
  revokeManagerReportExternalShare(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string,
    @Param("shareId") shareId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.revokeManagerReportExternalShare(user.id, reportId, shareId);
  }

  @Get("manager/reports/:reportId/audit-log")
  listManagerReportAuditLog(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerReportAuditLog(user.id, reportId);
  }

  @Post("manager/reports/:reportId/follow-ups")
  createManagerReportFollowUp(
    @Headers("authorization") authorization: string | undefined,
    @Param("reportId") reportId: string,
    @Body() body: CreateManagerReportFollowUpInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerReportFollowUp(user.id, reportId, body);
  }

  @Get("reports/external/:shareToken")
  getExternalReportShare(@Param("shareToken") shareToken: string) {
    return this.roomlogService.getExternalReportShare(shareToken);
  }

  @Get("manager/tickets/:ticketId")
  getManagerTicket(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getTicketDetailForManager(user.id, ticketId);
  }

  @Get("manager/rooms/:roomId/timeline")
  getManagerRoomTimeline(
    @Headers("authorization") authorization: string | undefined,
    @Param("roomId") roomId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerRoomTimeline(user.id, roomId);
  }

  @Get("manager/rooms/:roomId/move-in-checklist")
  listManagerMoveInChecklist(
    @Headers("authorization") authorization: string | undefined,
    @Param("roomId") roomId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerMoveInChecklist(user.id, roomId);
  }

  @Get("manager/costs")
  async listManagerCosts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.listManagerCosts(user.id);
  }

  @Get("manager/costs/review-queue-summary")
  getManagerCostReviewQueueSummary(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerCostReviewQueueSummary(user.id);
  }

  @Get("manager/costs/monthly-summary")
  async getManagerMonthlyCostSummary(
    @Headers("authorization") authorization: string | undefined,
    @Query("month") month?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.getManagerMonthlyCostSummary(user.id, month);
  }

  @Get("manager/costs/receipts")
  listManagerReceipts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerReceipts(user.id);
  }

  @Get("manager/costs/receipt-ocrs/:ocrId")
  getManagerReceiptOcr(
    @Headers("authorization") authorization: string | undefined,
    @Param("ocrId") ocrId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerReceiptOcr(user.id, ocrId);
  }

  @Post("manager/costs/receipt-ocrs/:ocrId/confirm")
  async confirmManagerReceiptOcr(
    @Headers("authorization") authorization: string | undefined,
    @Param("ocrId") ocrId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.confirmManagerReceiptOcr(user.id, ocrId);
  }

  @Get("manager/costs/disclosure-settings")
  getManagerDisclosureSetting(
    @Headers("authorization") authorization: string | undefined,
    @Query("month") month?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerDisclosureSetting(user.id, month);
  }

  @Get("manager/costs/:costId")
  async getManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.getManagerCost(user.id, costId);
  }

  @Post("manager/costs/:costId/confirm")
  async confirmManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.confirmManagerCost(user.id, costId);
  }

  @Post("manager/costs/:costId/void")
  async voidManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string,
    @Body() body: { reason?: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.voidManagerCost(user.id, costId, body.reason);
  }

  @Patch("manager/costs/:costId/disclosure")
  async updateManagerCostDisclosure(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string,
    @Body() body: { disclosure: "public" | "private" }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return await this.roomlogService.updateManagerCostDisclosure(user.id, costId, body.disclosure);
  }

  @Patch("manager/tickets/:ticketId")
  updateTicket(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body()
    body: {
      category?: string;
      priority?: number;
      responsibilityHint?: string;
      aiSummary?: string;
    }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateTicket(user.id, ticketId, body);
  }

  @Post("manager/tickets/:ticketId/request-info")
  requestInfo(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() body: { messageText: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.requestAdditionalInfo(user.id, ticketId, body.messageText);
  }

  @Post("manager/tickets/:ticketId/reply-draft")
  draftManagerReply(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() body: ManagerReplyDraftInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.draftManagerTicketReply(user.id, ticketId, body);
  }

  @Post("manager/tickets/:ticketId/replies")
  sendManagerReply(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() body: ManagerTicketReplyInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.sendManagerTicketReply(user.id, ticketId, body);
  }

  @Post("manager/tickets/:ticketId/ai-feedback/:feedbackId/review")
  reviewTenantAiFeedback(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Param("feedbackId") feedbackId: string,
    @Body() body: ReviewTenantAiFeedbackInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.reviewTenantAiFeedback(user.id, ticketId, feedbackId, body);
  }

  @Get("manager/vendor-mgmt/vendors")
  listManagerVendorMgmtVendors(
    @Headers("authorization") authorization: string | undefined,
    @Query("query") query?: string,
    @Query("trade") trade?: string,
    @Query("serviceArea") serviceArea?: string,
    @Query("verificationStatus") verificationStatus?: string,
    @Query("isActive") isActive?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().list(
      user.id,
      catalogFilters(query, trade, serviceArea, verificationStatus, isActive)
    );
  }

  @Get("manager/vendor-mgmt/tickets/:ticketId/job")
  getManagerVendorJobByTicket(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().findJobByTicket(user.id, ticketId);
  }

  @Get("manager/vendor-mgmt/vendors/:vendorId")
  getManagerVendorMgmtDetail(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().getDetail(user.id, vendorId);
  }

  @Get("manager/vendor-mgmt/vendors/:vendorId/performance")
  async getManagerVendorMgmtPerformance(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    const detail = await this.requireManagerVendorDomain().getDetail(user.id, vendorId);
    return detail.performance;
  }

  @Get("manager/vendor-mgmt/search")
  searchManagerVendorCatalog(
    @Headers("authorization") authorization: string | undefined,
    @Query("query") query?: string,
    @Query("trade") trade?: string,
    @Query("serviceArea") serviceArea?: string,
    @Query("verificationStatus") verificationStatus?: string,
    @Query("isActive") isActive?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().searchCatalog(
      user.id,
      catalogFilters(query, trade, serviceArea, verificationStatus, isActive)
    );
  }

  @Put("manager/vendor-mgmt/vendors/:vendorId/registration")
  registerManagerVendor(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().register(user.id, vendorId);
  }

  @Delete("manager/vendor-mgmt/vendors/:vendorId/registration")
  archiveManagerVendor(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().archive(user.id, vendorId);
  }

  @Patch("manager/vendor-mgmt/vendors/:vendorId/manager-note")
  updateManagerVendorNote(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string,
    @Body() body: { managerNote: string }
  ) {
    rejectCallerIdentity(body, ["managerId", "actorUserId"]);
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireManagerVendorDomain().updateNote(
      user.id,
      vendorId,
      body.managerNote
    );
  }

  @Post("manager/tenants/invites")
  createTenantInvite(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      roomId: string;
      email?: string;
      tenantName: string;
      phone?: string;
      moveInDate?: string;
    }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createTenantInvite(user.id, body);
  }

  @Get("manager/tenants/invites")
  listTenantInvites(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listTenantInvites(user.id);
  }

  @Post("manager/tickets/:ticketId/assign-vendor")
  assignVendor(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() body: { vendorId: string; requestNote: string }
  ) {
    rejectCallerIdentity(body, ["managerId", "actorUserId"]);
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireVendorWorkflowDomain().assignVendor(user.id, ticketId, body);
  }

  @Post("manager/repairs/:repairId/estimates/:estimateId/review")
  reviewVendorEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: VendorEstimateReviewInput
  ) {
    rejectCallerIdentity(body, ["managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireVendorWorkflowDomain().reviewEstimate(
      user.id,
      repairId,
      estimateId,
      body
    );
  }

  @Post("manager/repairs/:repairId/estimates/:estimateId/confirm-visit")
  confirmVendorEstimateVisit(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: VendorVisitScheduleInput
  ) {
    rejectCallerIdentity(body, ["managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireVendorWorkflowDomain().confirmEstimateVisit(
      user.id,
      repairId,
      estimateId,
      body
    );
  }

  @Post("manager/repairs/:repairId/completion-decisions")
  decideVendorCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: DecideRepairCompletionInput
  ) {
    rejectCallerIdentity(body, ["managerId", "actorUserId", "vendorId"]);
    const user = this.requireRole(authorization, ["LANDLORD"]);
    return this.requireVendorWorkflowDomain().decideCompletion(user.id, repairId, body);
  }

  @Get("vendor/jobs")
  async listVendorJobs(@Headers("authorization") authorization?: string) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().listJobs(user.id);
  }

  @Get("vendor/jobs/:repairId")
  async getVendorJob(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string
  ) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().getJob(user.id, repairId);
  }

  @Put("vendor/jobs/:repairId/estimate-draft")
  async saveVendorEstimateDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: VendorEstimateDraftInput
  ) {
    rejectCallerIdentity(body, ["vendorId", "userId", "managerId", "actorUserId"]);
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().saveEstimateDraft(
      user.id,
      repairId,
      undefined,
      body
    );
  }

  @Put("vendor/jobs/:repairId/estimate-draft/:estimateId")
  async updateVendorEstimateDraft(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: VendorEstimateDraftInput
  ) {
    rejectCallerIdentity(body, ["vendorId", "userId", "managerId", "actorUserId"]);
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().saveEstimateDraft(
      user.id,
      repairId,
      estimateId,
      body
    );
  }

  @Post("vendor/jobs/:repairId/estimates/:estimateId/submit")
  async submitVendorEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string
  ) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().submitEstimate(user.id, repairId, estimateId);
  }

  @Post("vendor/jobs/:repairId/estimates/:estimateId/withdraw")
  async withdrawVendorEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Param("estimateId") estimateId: string
  ) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().withdrawEstimate(user.id, repairId, estimateId);
  }

  @Post("vendor/jobs/:repairId/schedule")
  async scheduleVendorJob(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: VendorVisitScheduleInput
  ) {
    rejectCallerIdentity(body, ["vendorId", "userId", "managerId", "actorUserId"]);
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().scheduleApprovedJob(user.id, repairId, body);
  }

  @Post("vendor/jobs/:repairId/start")
  async startVendorJob(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string
  ) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().startJob(user.id, repairId);
  }

  @Post("vendor/jobs/:repairId/completion-attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadVendorCompletionAttachment(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @UploadedFile() file: UploadedImageFile | undefined
  ) {
    if (!file?.buffer) {
      throw new BadRequestException("업로드할 완료 사진이 필요합니다.");
    }
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorCompletionAttachmentService().save(user.id, repairId, {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype
    });
  }

  @Get("vendor-completion-files/:fileKey")
  async readVendorCompletionAttachment(
    @Headers("authorization") authorization: string | undefined,
    @Param("fileKey") fileKey: string
  ) {
    const user = this.roomlogService.getUserFromToken(authorization);
    const file = await this.requireVendorCompletionAttachmentService().read(
      user.id,
      this.roomlogService.rolesForUser(user),
      fileKey
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: "inline",
      length: file.buffer.length
    });
  }

  @Post("vendor/jobs/:repairId/completion-reports")
  async submitVendorCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: SubmitVendorCompletionInput
  ) {
    rejectCallerIdentity(body, ["vendorId", "userId", "managerId", "actorUserId"]);
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().submitCompletion(user.id, repairId, body);
  }

  @Get("vendor/settlements")
  async listVendorSettlements(@Headers("authorization") authorization?: string) {
    const user = await this.requireVendorRole(authorization);
    return this.requireVendorWorkflowDomain().listSettlements(user.id);
  }

  // 한 릴리스 동안만 유지하는 읽기 전용 별칭. 모든 mutation은 vendor/jobs로만 제공한다.
  @Get("vendor/repairs")
  listVendorRepairs(@Headers("authorization") authorization?: string) {
    return this.listVendorJobs(authorization);
  }

  @Get("vendor/repairs/:repairId")
  getVendorRepair(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string
  ) {
    return this.getVendorJob(authorization, repairId);
  }

  // capability 가드 — user.role 단일값이 아니라 관계에서 파생한 roles로 판단한다.
  // 한 계정이 TENANT이면서 LANDLORD인 겸직 계정도 각 표면에 진입할 수 있다.
  private requireRole(authorization: string | undefined, roles: UserRole[]): UserAccount {
    const user = this.roomlogService.getUserFromToken(authorization);
    const userRoles = this.roomlogService.rolesForUser(user);

    if (!roles.some((role) => userRoles.includes(role))) {
      throw new ForbiddenException("이 역할로 접근할 수 없습니다.");
    }

    return user;
  }

  private requireManagerVendorDomain() {
    if (!this.managerVendor) {
      throw new ServiceUnavailableException("업체 관리 데이터 연결을 사용할 수 없습니다.");
    }
    return this.managerVendor;
  }

  private async requireVendorRole(
    authorization: string | undefined
  ): Promise<UserAccount> {
    const user = this.roomlogService.getUserFromToken(authorization);
    if (this.roomlogService.rolesForUser(user).includes("VENDOR")) return user;

    // 업체 등록키로 활성화한 전용 SEEKER 계정은 legacy store role을 바꾸지 않는다.
    // 활성 account-link가 VENDOR capability의 권위이며 workflow domain도 다시 검증한다.
    const vendorId = await this.resolveActiveVendorId(user.id);
    if (!vendorId) {
      throw new ForbiddenException("활성 업체 계정으로만 접근할 수 있습니다.");
    }
    return user;
  }

  private requireVendorWorkflowDomain() {
    if (!this.vendorWorkflow) {
      throw new ServiceUnavailableException("업체 작업 데이터 연결을 사용할 수 없습니다.");
    }
    return this.vendorWorkflow;
  }

  private requireTenantVendorConnectionDomain() {
    if (!this.tenantVendorConnection) {
      throw new ServiceUnavailableException(
        "임차인 협력업체 연결 데이터를 사용할 수 없습니다."
      );
    }
    return this.tenantVendorConnection;
  }

  private requireVendorCompletionAttachmentService() {
    if (!this.vendorCompletionAttachments) {
      throw new ServiceUnavailableException("완료 사진 저장 연결을 사용할 수 없습니다.");
    }
    return this.vendorCompletionAttachments;
  }

  private async resolveActiveVendorId(userId: string): Promise<string | undefined> {
    try {
      return await this.roomlogService.resolveActiveVendorId(userId);
    } catch (error) {
      if (
        error instanceof VendorActivationRepositoryError &&
        error.code === "ACTIVATION_UNAVAILABLE"
      ) {
        throw new ServiceUnavailableException({
          code: "ACTIVATION_UNAVAILABLE",
          message: "업체 계정 활성화를 현재 사용할 수 없습니다."
        });
      }
      throw error;
    }
  }
}
