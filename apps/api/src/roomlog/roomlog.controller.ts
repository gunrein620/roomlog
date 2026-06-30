import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post
} from "@nestjs/common";
import { CreateComplaintInput, UserAccount, UserRole } from "./roomlog.types";
import { RoomlogService } from "./roomlog.service";

@Controller()
export class RoomlogController {
  constructor(private readonly roomlogService: RoomlogService) {}

  @Get("roomlog/demo")
  getDemoState() {
    return this.roomlogService.getDemoState();
  }

  @Post("auth/signup")
  signup(@Body() body: { email: string; password: string; name: string; phone?: string; role: UserRole }) {
    return this.roomlogService.signup(body);
  }

  @Post("auth/login")
  login(@Body() body: { email: string; password: string }) {
    return this.roomlogService.login(body);
  }

  @Get("auth/me")
  getMe(@Headers("authorization") authorization?: string) {
    return this.roomlogService.getMe(authorization);
  }

  @Get("tenant/home")
  getTenantHome(@Headers("authorization") authorization?: string) {
    const user = this.requireRole(authorization, ["TENANT"]);

    return {
      profile: this.roomlogService.getMe(authorization),
      complaints: this.roomlogService.listTenantComplaints(user.id)
    };
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
    @Body() body: { messageText: string }
  ) {
    const user = this.requireRole(authorization, ["TENANT"]);
    const complaint = this.roomlogService.getComplaintDetail(user.id, complaintId);

    return this.roomlogService.addMessage(user.id, complaint.ticket.id, body.messageText);
  }

  @Get("manager/tickets")
  listManagerTickets(@Headers("authorization") authorization?: string) {
    this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listTickets();
  }

  @Get("manager/tickets/:ticketId")
  getManagerTicket(
    @Headers("authorization") authorization: string | undefined,
    @Param("ticketId") ticketId: string
  ) {
    this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.getTicketDetail(ticketId);
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

  @Get("manager/vendors")
  listVendors(@Headers("authorization") authorization?: string) {
    this.requireRole(authorization, ["LANDLORD"]);

    return this.roomlogService.listVendors();
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
