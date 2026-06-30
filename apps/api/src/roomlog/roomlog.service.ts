import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  AiAnalysis,
  AssignVendorInput,
  Complaint,
  ComplaintStatus,
  CreateComplaintInput,
  RepairRequest,
  RepairStatus,
  ReportCompletionInput,
  Room,
  ScheduleRepairInput,
  StatusHistory,
  SubmitEstimateInput,
  Ticket,
  TicketMessage,
  TicketStatus,
  UserAccount,
  UserRole
} from "./roomlog.types";

type SignupInput = {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: UserRole;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthResult = {
  userId: string;
  role: UserRole;
  accessToken: string;
  name: string;
};

type VendorSummary = {
  id: string;
  userId: string;
  businessName: string;
  contactPerson: string;
  phone: string;
  serviceArea: string;
  activeJobs: number;
};

type Store = {
  users: UserAccount[];
  rooms: Room[];
  tenantRooms: Record<string, string>;
  vendors: VendorSummary[];
  complaints: Complaint[];
  analyses: Record<string, AiAnalysis>;
  tickets: Ticket[];
  repairs: RepairRequest[];
  messages: TicketMessage[];
  history: StatusHistory[];
};

const now = () => new Date().toISOString();

function id(prefix: string) {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

function hashPassword(password: string, salt = randomBytes(12).toString("hex")) {
  const key = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${key}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, key] = storedHash.split(":");
  const actual = Buffer.from(hashPassword(password, salt).split(":")[1], "hex");
  const expected = Buffer.from(key, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function tokenFor(user: UserAccount) {
  return Buffer.from(`${user.id}:${user.role}:${user.email}`).toString("base64url");
}

function priorityDueAt(priority: number) {
  const due = new Date();
  due.setDate(due.getDate() + (priority === 1 ? 1 : priority === 2 ? 2 : 7));
  return due.toISOString();
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

function createDemoStore(): Store {
  const createdAt = now();
  const users: UserAccount[] = [
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
    }
  ];

  return {
    users,
    rooms: [
      {
        id: "room-301",
        buildingName: "정글빌라",
        roomNo: "301호",
        address: "서울시 성동구 성수동"
      }
    ],
    tenantRooms: {
      "tenant-demo": "room-301"
    },
    vendors: [
      {
        id: "vendor-demo",
        userId: "vendor-demo-user",
        businessName: "빠른누수 설비",
        contactPerson: "이수리",
        phone: "010-3000-0001",
        serviceArea: "성동구, 광진구",
        activeJobs: 0
      }
    ],
    complaints: [],
    analyses: {},
    tickets: [],
    repairs: [],
    messages: [],
    history: []
  };
}

@Injectable()
export class RoomlogService {
  private readonly store = createDemoStore();

  signup(input: SignupInput): AuthResult {
    if (this.store.users.some((user) => user.email === input.email)) {
      throw new UnauthorizedException("이미 가입된 이메일입니다.");
    }

    const user: UserAccount = {
      id: id("usr"),
      email: input.email,
      passwordHash: hashPassword(input.password),
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: "ACTIVE",
      createdAt: now()
    };

    this.store.users.push(user);

    if (user.role === "TENANT") {
      this.store.tenantRooms[user.id] = "room-301";
    }

    if (user.role === "VENDOR") {
      this.store.vendors.push({
        id: id("vnd"),
        userId: user.id,
        businessName: `${user.name} 협력업체`,
        contactPerson: user.name,
        phone: user.phone ?? "",
        serviceArea: "서울",
        activeJobs: 0
      });
    }

    return this.authResult(user);
  }

  login(input: LoginInput): AuthResult {
    const user = this.store.users.find((account) => account.email === input.email);

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    return this.authResult(user);
  }

  getUserFromToken(authorization?: string): UserAccount {
    const token = authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      throw new UnauthorizedException("인증 토큰이 필요합니다.");
    }

    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [userId] = decoded.split(":");
    const user = this.store.users.find((account) => account.id === userId);

    if (!user || tokenFor(user) !== token) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    return user;
  }

  getMe(authorization?: string) {
    const user = this.getUserFromToken(authorization);

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      roomId: this.store.tenantRooms[user.id],
      vendorId: this.store.vendors.find((vendor) => vendor.userId === user.id)?.id
    };
  }

  getDemoState() {
    return {
      users: this.store.users.map(({ passwordHash, ...user }) => user),
      rooms: this.store.rooms,
      vendors: this.listVendors(),
      complaints: this.store.complaints,
      tickets: this.store.tickets,
      repairs: this.store.repairs,
      messages: this.store.messages
    };
  }

  createComplaint(tenantId: string, input: CreateComplaintInput) {
    const roomId = input.roomId ?? this.store.tenantRooms[tenantId] ?? "room-301";
    const createdAt = now();
    const analysis = this.analyzeComplaint(input);
    const complaintId = id("cmp");
    const ticketId = id("tkt");
    const complaint: Complaint = {
      id: complaintId,
      tenantId,
      roomId,
      ticketId,
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
      category: analysis.category,
      priority: analysis.priority,
      status: "RECEIVED",
      responsibilityHint: analysis.responsibilityHint,
      aiSummary: analysis.summary,
      dueAt: priorityDueAt(analysis.priority),
      createdAt,
      updatedAt: createdAt
    };

    this.store.complaints.unshift(complaint);
    this.store.tickets.unshift(ticket);
    this.store.analyses[ticket.id] = analysis;
    this.pushHistory(ticket.id, "system", undefined, "RECEIVED", "임차인 신고 접수");
    this.addMessageInternal(ticket.id, complaint.id, tenantId, "TENANT", input.description);

    return { complaint, ticket, analysis };
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

  listTickets() {
    return this.store.tickets.map((ticket) => this.presentTicket(ticket));
  }

  getTicket(ticketId: string) {
    return this.store.tickets.find((ticket) => ticket.id === ticketId);
  }

  getTicketDetail(ticketId: string) {
    const ticket = this.findTicket(ticketId);

    return this.presentTicket(ticket);
  }

  updateTicket(managerId: string, ticketId: string, input: Partial<Pick<Ticket, "category" | "priority" | "responsibilityHint" | "aiSummary">>) {
    const ticket = this.findTicket(ticketId);
    Object.assign(ticket, input, { updatedAt: now() });
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", "AI 분석 값을 검토했습니다.");

    return this.presentTicket(ticket);
  }

  requestAdditionalInfo(managerId: string, ticketId: string, messageText: string) {
    const ticket = this.transitionTicket(
      ticketId,
      "ADDITIONAL_INFO_REQUESTED",
      managerId,
      "추가 정보 요청"
    );
    this.addMessageInternal(ticket.id, ticket.complaintId, managerId, "LANDLORD", messageText);

    return this.presentTicket(ticket);
  }

  assignVendor(managerId: string, ticketId: string, input: AssignVendorInput): RepairRequest {
    const ticket = this.transitionTicket(ticketId, "VENDOR_ASSIGNED", managerId, "업체 배정");
    const vendor = this.store.vendors.find((item) => item.id === input.vendorId);

    if (!vendor) {
      throw new NotFoundException("협력업체를 찾을 수 없습니다.");
    }

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

    return repair;
  }

  listVendors() {
    return this.store.vendors.map((vendor) => ({ ...vendor }));
  }

  listVendorRepairs(vendorUserOrProfileId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);

    return this.store.repairs
      .filter((repair) => repair.vendorId === vendor.id)
      .map((repair) => this.presentRepair(repair));
  }

  getVendorRepair(vendorUserOrProfileId: string, repairId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    const repair = this.store.repairs.find(
      (item) => item.id === repairId && item.vendorId === vendor.id
    );

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return this.presentRepair(repair);
  }

  submitEstimate(vendorUserOrProfileId: string, repairId: string, input: SubmitEstimateInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    repair.estimateAmount = input.estimateAmount;
    repair.estimateDescription = input.estimateDescription;
    repair.status = "ESTIMATE_SUBMITTED";
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "ESTIMATE_REVIEW", repair.vendorId, "견적 제출");

    return repair;
  }

  scheduleRepair(vendorUserOrProfileId: string, repairId: string, input: ScheduleRepairInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    repair.scheduledAt = input.scheduledAt;
    repair.status = "SCHEDULED";
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "REPAIR_IN_PROGRESS", repair.vendorId, "방문 일정 확정");

    return repair;
  }

  reportCompletion(vendorUserOrProfileId: string, repairId: string, input: ReportCompletionInput) {
    const repair = this.findVendorRepair(vendorUserOrProfileId, repairId);
    repair.status = "COMPLETION_REPORTED";
    repair.completedAt = now();
    repair.completionNote = input.completionNote;
    repair.completionPhotoUrls = input.completionPhotoUrls ?? [];
    repair.updatedAt = now();
    this.transitionTicket(repair.ticketId, "COMPLETION_REPORTED", repair.vendorId, "완료 보고");

    return repair;
  }

  approveCompletion(managerId: string, ticketId: string, note?: string) {
    const ticket = this.transitionTicket(ticketId, "COMPLETED", managerId, note ?? "완료 승인");
    const complaint = this.findComplaint(ticket.complaintId);
    const repairs = this.store.repairs.filter((repair) => repair.ticketId === ticketId);

    for (const repair of repairs) {
      repair.status = "COMPLETED";
      repair.updatedAt = now();
    }

    complaint.status = "COMPLETED";
    complaint.updatedAt = now();

    return ticket;
  }

  addMessage(senderUserId: string, ticketId: string, messageText: string) {
    const ticket = this.findTicket(ticketId);
    const user = this.store.users.find((account) => account.id === senderUserId);

    return this.addMessageInternal(
      ticket.id,
      ticket.complaintId,
      senderUserId,
      user?.role ?? "TENANT",
      messageText
    );
  }

  private authResult(user: UserAccount): AuthResult {
    return {
      userId: user.id,
      role: user.role,
      accessToken: tokenFor(user),
      name: user.name
    };
  }

  private analyzeComplaint(input: CreateComplaintInput): AiAnalysis {
    const text = `${input.title} ${input.description} ${input.location}`;
    const lower = text.toLowerCase();
    const emergencyWords = ["가스", "불꽃", "누전", "물이 계속", "천장", "보일러", "수도 안", "문이 안 잠", "침수", "화재"];
    const isEmergency = emergencyWords.some((word) => text.includes(word));
    const isLeak = ["누수", "물", "천장", "샘"].some((word) => text.includes(word));
    const isBoiler = ["보일러", "온수", "난방"].some((word) => text.includes(word));
    const isMold = ["곰팡이", "얼룩"].some((word) => text.includes(word));
    const tenantHint = ["깨뜨", "파손", "떨어뜨", "부주의"].some((word) => text.includes(word));
    const category = isLeak ? "누수" : isBoiler ? "보일러" : isMold ? "곰팡이" : lower.includes("door") ? "도어락" : "설비";
    const priority = isEmergency ? 1 : isLeak || isBoiler ? 2 : 3;
    const responsibilityHint = tenantHint ? "임차인 책임 가능성" : "임대인 책임 가능성";

    return {
      summary: `${input.location}의 ${category} 문제로 보이는 신고입니다. ${priority === 1 ? "즉시 확인이 필요한 긴급 건입니다." : "관리자 확인 후 처리 일정을 잡아야 합니다."}`,
      category,
      priority,
      responsibilityHint,
      confidenceScore: category === "설비" ? 0.62 : 0.78,
      recommendedAction:
        priority === 1
          ? "관리자 확인 후 당일 업체 배정을 권장합니다."
          : "사진과 방문 가능 시간을 확인한 뒤 업체 배정을 진행하세요."
    };
  }

  private presentComplaint(complaint: Complaint) {
    const ticket = this.findTicket(complaint.ticketId);

    return {
      ...complaint,
      room: this.store.rooms.find((room) => room.id === complaint.roomId),
      displayStatus: this.displayStatus(ticket.status),
      ticket: this.presentTicket(ticket),
      messages: this.store.messages.filter((message) => message.ticketId === ticket.id)
    };
  }

  private presentTicket(ticket: Ticket) {
    const complaint = this.findComplaint(ticket.complaintId);

    return {
      ...ticket,
      complaint,
      room: this.store.rooms.find((room) => room.id === ticket.roomId),
      analysis: this.store.analyses[ticket.id],
      assignedVendor: ticket.assignedVendorId
        ? this.store.vendors.find((vendor) => vendor.id === ticket.assignedVendorId)
        : undefined,
      repairs: this.store.repairs.filter((repair) => repair.ticketId === ticket.id),
      messages: this.store.messages.filter((message) => message.ticketId === ticket.id),
      history: this.store.history.filter((history) => history.ticketId === ticket.id)
    };
  }

  private presentRepair(repair: RepairRequest) {
    const ticket = this.findTicket(repair.ticketId);

    return {
      ...repair,
      ticket: this.presentTicket(ticket)
    };
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
    this.store.history.unshift({
      id: id("hst"),
      ticketId,
      changedByUserId,
      fromStatus,
      toStatus,
      note,
      createdAt: now()
    });
  }

  private addMessageInternal(
    ticketId: string,
    complaintId: string | undefined,
    senderUserId: string,
    senderRole: UserRole,
    messageText: string
  ) {
    const message: TicketMessage = {
      id: id("msg"),
      ticketId,
      complaintId,
      senderUserId,
      senderRole,
      messageText,
      createdAt: now()
    };

    this.store.messages.push(message);

    return message;
  }

  private findComplaint(complaintId: string) {
    const complaint = this.store.complaints.find((item) => item.id === complaintId);

    if (!complaint) {
      throw new NotFoundException("민원을 찾을 수 없습니다.");
    }

    return complaint;
  }

  private findTicket(ticketId: string) {
    const ticket = this.store.tickets.find((item) => item.id === ticketId);

    if (!ticket) {
      throw new NotFoundException("티켓을 찾을 수 없습니다.");
    }

    return ticket;
  }

  private resolveVendor(vendorUserOrProfileId: string) {
    const vendor = this.store.vendors.find(
      (item) => item.id === vendorUserOrProfileId || item.userId === vendorUserOrProfileId
    );

    if (!vendor) {
      throw new NotFoundException("협력업체를 찾을 수 없습니다.");
    }

    return vendor;
  }

  private findVendorRepair(vendorUserOrProfileId: string, repairId: string) {
    const vendor = this.resolveVendor(vendorUserOrProfileId);
    const repair = this.store.repairs.find(
      (item) => item.id === repairId && item.vendorId === vendor.id
    );

    if (!repair) {
      throw new NotFoundException("수리 요청을 찾을 수 없습니다.");
    }

    return repair;
  }
}
