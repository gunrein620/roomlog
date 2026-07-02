import {
  BadRequestException,
  Body,
  Controller,
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
  AttachmentCategory,
  AddTenantComplaintMessageInput,
  AddVendorRepairMessageInput,
  ApproveRepairEstimateInput,
  ConfirmTenantCompletionInput,
  CreateComplaintInput,
  CreateComplaintFromCallInput,
  CreateIntakeSessionInput,
  CreateMoveInChecklistItemInput,
  FinalizeIntakeInput,
  ManagerAssistantQueryInput,
  ManagerReplyDraftInput,
  ManagerTicketReplyInput,
  RealtimeClientSecretInput,
  RecordRealtimeTurnInput,
  ReopenTenantComplaintInput,
  ReviewTenantAiFeedbackInput,
  SaveFloorPlanDraftInput,
  SendIntakeMessageInput,
  SubmitTenantAiFeedbackInput,
  UserAccount,
  UserRole
} from "./roomlog.types";
import { RoomlogService } from "./roomlog.service";

type UploadedImageFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller()
export class RoomlogController {
  constructor(private readonly roomlogService: RoomlogService) {}

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

  @Post("auth/login")
  login(@Body() body: { email: string; password: string }) {
    return this.roomlogService.login(body);
  }

  @Get("auth/me")
  getMe(@Headers("authorization") authorization?: string) {
    return this.roomlogService.getMe(authorization);
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

  @Post("tenant/complaints")
  createComplaint(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateComplaintInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createComplaint(user.id, body);
  }

  @Post("tenant/complaints/from-call")
  createComplaintFromCall(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: CreateComplaintFromCallInput
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return this.roomlogService.createComplaintFromCall(user.id, body);
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

  @Get("manager/tickets")
  listManagerTickets(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listTicketsForManager(user.id);
  }

  @Post("manager/assistant/query")
  queryManagerAssistant(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: ManagerAssistantQueryInput
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.queryManagerAssistant(user.id, body);
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

  @Get("manager/vendor-mgmt/vendors/:vendorId")
  getManagerVendorMgmtDetail(
    @Headers("authorization") authorization: string | undefined,
    @Param("vendorId") vendorId: string
  ) {
    const user = this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getManagerVendorMgmtDetail(user.id, vendorId);
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

  private requireRole(authorization: string | undefined, roles: UserRole[]): UserAccount {
    const user = this.roomlogService.getUserFromToken(authorization);

    if (!roles.includes(user.role)) {
      throw new ForbiddenException("이 역할로 접근할 수 없습니다.");
    }

    return user;
  }
}
