// 기존 인메모리 업체 주소록은 Prisma 기반 업체 관리 도메인으로 교체됐다.
// 이 협력 클래스에는 그 흐름과 무관한 임차인 초대만 남긴다.
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { deriveUserRoles, id, normalizePhoneNumber, now } from "../roomlog-support";
import type {
  CreateTenantInviteInput,
  Store,
  TenantInvite
} from "../roomlog.service";

export class RoomlogVendorMgmtDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly assertManagerCanAccessRoom: (managerId: string, roomId: string) => void
  ) {}

  createTenantInvite(managerId: string, input: CreateTenantInviteInput) {
    const manager = this.findLandlord(managerId);

    if (!manager) {
      throw new ForbiddenException("관리자만 임차인을 초대할 수 있습니다.");
    }

    const roomId = input.roomId?.trim();
    const tenantName = input.tenantName?.trim();
    const phone = normalizePhoneNumber(input.phone);
    const moveInDate = input.moveInDate?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!roomId) {
      throw new BadRequestException("초대할 호실을 선택해주세요.");
    }

    this.assertManagerCanAccessRoom(managerId, roomId);

    if (!tenantName) {
      throw new BadRequestException("임차인 이름을 입력해주세요.");
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("초대 이메일 형식이 올바르지 않습니다.");
    }

    const inviteToken = randomBytes(18).toString("base64url");
    const createdAt = now();
    const invite: TenantInvite = {
      id: id("tinv"),
      inviteToken,
      invitedByManagerId: managerId,
      roomId,
      email,
      tenantName,
      phone,
      moveInDate,
      status: "PENDING",
      signupUrl: `/tenant?inviteToken=${inviteToken}`,
      createdAt
    };

    this.store.tenantInvites.unshift(invite);
    this.persistStore();

    return this.presentTenantInvite(invite);
  }

  listTenantInvites(managerId: string) {
    return this.store.tenantInvites
      .filter((invite) => invite.invitedByManagerId === managerId)
      .map((invite) => this.presentTenantInvite(invite));
  }

  // capability 기준 관리인 조회 — legacy role이 TENANT인 겸직 계정도 소유한 집이 있으면 관리인이다.
  private findLandlord(managerId: string) {
    const user = this.store.users.find((account) => account.id === managerId);

    if (!user) return undefined;

    return deriveUserRoles(user, this.store).includes("LANDLORD") ? user : undefined;
  }

  private presentTenantInvite(invite: TenantInvite) {
    const room = this.store.rooms.find((item) => item.id === invite.roomId);

    return {
      ...invite,
      room: room ? { ...room } : undefined
    };
  }
}
