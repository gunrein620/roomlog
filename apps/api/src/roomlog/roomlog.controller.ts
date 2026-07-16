import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AddMessagingThreadMessageInput,
  AnnouncementTranslationRequest,
  AttachmentCategory,
  AddTenantComplaintMessageInput,
  AddVendorRepairMessageInput,
  ApproveRepairEstimateInput,
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
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { issueSocketTicket } from "../realtime/socket-ticket";

type UploadedImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller()
export class RoomlogController {
  constructor(
    private readonly roomlogService: RoomlogService,
    private readonly realtime: RealtimeGateway
  ) {}

  @Get("roomlog/demo")
  getDemoState() {
    return this.roomlogService.getDemoState();
  }

  @Get("roomlog/runtime-config")
  getRuntimeConfig() {
    return this.roomlogService.getRuntimeConfig();
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
    return this.roomlogService.signup(body);
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
    return this.roomlogService.login(body);
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
  getMe(@Headers("authorization") authorization?: string) {
    return this.roomlogService.getMe(authorization);
  }

  // 소켓 핸드셰이크용 단기 티켓 — httpOnly 쿠키 토큰을 못 읽는 브라우저 JS 대신 BFF가 받아간다.
  @Post("auth/socket-ticket")
  issueSocketTicket(@Headers("authorization") authorization?: string) {
    const user = this.roomlogService.getUserFromToken(authorization);

    return { ticket: issueSocketTicket(user.id, user.name) };
  }

  @Post("attachments")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadAttachment(
    @Headers("authorization") authorization: string | undefined,
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() body: { category?: AttachmentCategory }
  ) {
    const user = this.requireRole(authorization, ["TENANT", "LANDLORD", "VENDOR"]);

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
  getTenantHome(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return {
      profile: this.roomlogService.getMe(authorization),
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
  finalizeIntakeSession(
    @Headers("authorization") authorization: string | undefined,
    @Param("sessionId") sessionId: string,
    @Body() body: FinalizeIntakeInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.finalizeIntakeSession(user.id, sessionId, body);
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
  listTenantMessagingAnnouncements(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.listTenantMessagingAnnouncements(user.id);
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
  listManagerBillDeposits(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerBillDeposits(user.id);
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
  listManagerCosts(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerCosts(user.id);
  }

  @Get("manager/costs/review-queue-summary")
  getManagerCostReviewQueueSummary(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerCostReviewQueueSummary(user.id);
  }

  @Get("manager/costs/monthly-summary")
  getManagerMonthlyCostSummary(
    @Headers("authorization") authorization: string | undefined,
    @Query("month") month?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerMonthlyCostSummary(user.id, month);
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
  confirmManagerReceiptOcr(
    @Headers("authorization") authorization: string | undefined,
    @Param("ocrId") ocrId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.confirmManagerReceiptOcr(user.id, ocrId);
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
  getManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerCost(user.id, costId);
  }

  @Post("manager/costs/:costId/confirm")
  confirmManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.confirmManagerCost(user.id, costId);
  }

  @Post("manager/costs/:costId/void")
  voidManagerCost(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string,
    @Body() body: { reason?: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.voidManagerCost(user.id, costId, body.reason);
  }

  @Patch("manager/costs/:costId/disclosure")
  updateManagerCostDisclosure(
    @Headers("authorization") authorization: string | undefined,
    @Param("costId") costId: string,
    @Body() body: { disclosure: "public" | "private" }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerCostDisclosure(user.id, costId, body.disclosure);
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

  @Get("manager/vendors")
  listVendors(@Headers("authorization") authorization?: string) {
    this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listVendors();
  }

  @Get("manager/vendor-mgmt/vendors")
  listManagerVendorMgmtVendors(
    @Headers("authorization") authorization: string | undefined,
    @Query("q") q?: string,
    @Query("trade") trade?: string,
    @Query("sort") sort?: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerVendorMgmtVendors(user.id, { q, trade, sort });
  }

  @Post("manager/vendor-mgmt/vendors")
  createManagerVendorMgmtVendor(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      businessName?: string;
      contactPerson?: string;
      phone?: string;
      serviceArea?: string;
    }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createManagerVendorProfile(user.id, body);
  }

  @Get("manager/vendor-mgmt/vendors/:vendorId")
  getManagerVendorMgmtDetail(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerVendorMgmtDetail(user.id, vendorId);
  }

  @Patch("manager/vendor-mgmt/vendors/:vendorId")
  updateManagerVendorMgmtVendor(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string,
    @Body()
    body: {
      businessName?: string;
      contactPerson?: string;
      phone?: string;
      serviceArea?: string;
    }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.updateManagerVendorProfile(user.id, vendorId, body);
  }

  @Get("manager/vendor-mgmt/vendors/:vendorId/perf")
  getManagerVendorMgmtPerf(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerVendorMgmtPerf(user.id, vendorId);
  }

  @Get("manager/vendor-mgmt/duplicate-candidates")
  listManagerVendorDuplicateCandidates(@Headers("authorization") authorization: string | undefined) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listManagerVendorDuplicateCandidates(user.id);
  }

  @Post("manager/vendors/invites")
  createVendorInvite(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      email?: string;
      businessName: string;
      contactPerson: string;
      phone: string;
      serviceArea: string;
    }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.createVendorInvite(user.id, body);
  }

  @Get("manager/vendors/invites")
  listVendorInvites(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listVendorInvites(user.id);
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
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.assignVendor(user.id, ticketId, body);
  }

  @Post("manager/tickets/:ticketId/approve-completion")
  approveCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string,
    @Body() body: { note?: string }
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.approveCompletion(user.id, ticketId, body.note);
  }

  @Post("manager/repairs/:repairId/approve-estimate")
  approveRepairEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: ApproveRepairEstimateInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.approveRepairEstimate(user.id, repairId, body);
  }

  @Get("vendor/repairs")
  listVendorRepairs(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.listVendorRepairs(user.id);
  }

  @Get("vendor/repairs/:repairId")
  getVendorRepair(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string
  ) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.getVendorRepair(user.id, repairId);
  }

  @Post("vendor/repairs/:repairId/messages")
  addVendorRepairMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: AddVendorRepairMessageInput
  ) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.addVendorRepairMessage(user.id, repairId, body);
  }

  @Post("vendor/repairs/:repairId/estimate")
  submitEstimate(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: { estimateAmount: number; estimateDescription: string }
  ) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.submitEstimate(user.id, repairId, body);
  }

  @Post("vendor/repairs/:repairId/schedule")
  scheduleRepair(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: { scheduledAt: string }
  ) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.scheduleRepair(user.id, repairId, body);
  }

  @Post("vendor/repairs/:repairId/report-completion")
  reportCompletion(
    @Headers("authorization") authorization: string | undefined,
    @Param("repairId") repairId: string,
    @Body() body: { completionNote: string; completionPhotoUrls?: string[] }
  ) {
    const user = this.requireRole(authorization, ["VENDOR"]);

    return this.roomlogService.reportCompletion(user.id, repairId, body);
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
}
