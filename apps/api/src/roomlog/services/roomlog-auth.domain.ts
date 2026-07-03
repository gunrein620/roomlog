// 인증(auth) 도메인 협력 클래스 — roomlog.service.ts에서 추출(동작 불변).
// RoomlogService가 생성자에서 store/persistStore/findRoom을 주입해 생성하고, public 표면은 그대로 위임한다.
// 메서드 본문은 원본을 verbatim 복사(this.store/this.persistStore()/this.findRoom() 참조 동일).
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  UnauthorizedException
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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
} from "../roomlog-support";
import type { Room, UserAccount, UserRole } from "../roomlog.types";
import type {
  AuthResult,
  GoogleSocialLoginInput,
  LoginInput,
  SignupInput,
  Store,
  TenantInvite,
  VendorInvite
} from "../roomlog.service";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SOCIAL_SIGNUP_REQUIRED = "SOCIAL_SIGNUP_REQUIRED";
const rootEnvCandidatePaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
  resolve(process.cwd(), "..", "..", ".env")
];

function runtimeEnv(key: string) {
  const current = process.env[key]?.trim();
  if (current) return current;

  for (const envPath of rootEnvCandidatePaths) {
    if (!existsSync(envPath)) continue;

    const contents = readFileSync(envPath, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(rawLine.trim());
      if (!match || match[1] !== key) continue;

      let value = match[2].trim();
      const quote = value[0];
      if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }

      if (value) {
        process.env[key] = value;
        return value;
      }
    }
  }

  return undefined;
}

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

export class RoomlogAuthDomain {
  constructor(
    private readonly store: Store,
    private readonly persistStore: () => void,
    private readonly findRoom: (roomId: string) => Room
  ) {}

  signup(input: SignupInput): AuthResult {
    const normalizedInput = this.normalizeSignupInput(input);
    this.validateSignupInput(normalizedInput);
    const vendorInvite =
      normalizedInput.role === "VENDOR"
        ? this.resolvePendingVendorInvite(normalizedInput)
        : undefined;
    const tenantInvite =
      normalizedInput.role === "TENANT" && normalizedInput.inviteToken
        ? this.resolvePendingTenantInvite(normalizedInput)
        : undefined;

    if (this.store.users.some((user) => user.email === normalizedInput.email)) {
      throw new ConflictException("이미 가입된 이메일입니다.");
    }

    if (
      normalizedInput.phone &&
      this.store.users.some((user) => user.phone === normalizedInput.phone)
    ) {
      throw new ConflictException("이미 가입된 휴대폰 번호입니다.");
    }

    const user: UserAccount = {
      id: id("usr"),
      email: normalizedInput.email,
      passwordHash: hashPassword(normalizedInput.password),
      name: normalizedInput.name,
      phone: normalizedInput.phone,
      role: normalizedInput.role,
      status: "ACTIVE",
      createdAt: now()
    };

    this.store.users.push(user);

    if (user.role === "TENANT") {
      this.store.tenantRooms[user.id] =
        tenantInvite?.roomId ??
        this.findOrCreateRoomForSignup(normalizedInput, this.seededLandlordId());

      if (tenantInvite) {
        tenantInvite.status = "ACCEPTED";
        tenantInvite.acceptedAt = now();
        tenantInvite.acceptedByUserId = user.id;
      }
    }

    if (user.role === "LANDLORD") {
      this.findOrCreateRoomForSignup(normalizedInput, user.id);
    }

    if (user.role === "VENDOR") {
      this.store.vendors.push({
        id: id("vnd"),
        userId: user.id,
        businessName:
          vendorInvite?.businessName ?? normalizedInput.businessName ?? `${user.name} 협력업체`,
        contactPerson: vendorInvite?.contactPerson ?? user.name,
        phone: user.phone ?? vendorInvite?.phone ?? "",
        serviceArea: vendorInvite?.serviceArea ?? normalizedInput.serviceArea ?? "서울",
        activeJobs: 0
      });

      if (vendorInvite) {
        vendorInvite.status = "ACCEPTED";
        vendorInvite.acceptedAt = now();
        vendorInvite.acceptedByUserId = user.id;
      }
    }

    this.persistStore();
    return this.authResult(user);
  }

  login(input: LoginInput): AuthResult {
    const user = this.store.users.find((account) => account.email === input.email);

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    return this.authResult(user);
  }

  async loginWithGoogle(input: GoogleSocialLoginInput): Promise<AuthResult> {
    const role = this.normalizeSocialRole(input.role);
    const flow = input.flow === "signup" ? "signup" : "login";
    const code = input.code?.trim();
    const redirectUri = input.redirectUri?.trim();

    if (!code || !redirectUri) {
      throw new BadRequestException("Google authorization code and redirect URI are required.");
    }

    const profile = await this.fetchGoogleProfile(code, redirectUri);
    const email = profile.email?.trim().toLowerCase();

    if (!profile.sub || !email) {
      throw new UnauthorizedException("Google account did not return a usable email identity.");
    }

    if (!this.isVerifiedGoogleEmail(profile.email_verified)) {
      throw new UnauthorizedException("Google email verification is required.");
    }

    const existingSocialAccount = this.store.socialAccounts.find(
      (account) => account.provider === "GOOGLE" && account.providerUserId === profile.sub
    );

    if (existingSocialAccount) {
      const user = this.findActiveSocialUser(existingSocialAccount.userId, role);
      this.updateSocialAccount(existingSocialAccount.id, user.id, profile);
      this.persistStore();
      return this.authResult(user);
    }

    const existingUser = this.store.users.find((account) => account.email === email);

    if (!existingUser && flow === "login") {
      throw new BadRequestException(SOCIAL_SIGNUP_REQUIRED);
    }

    const user = existingUser ?? this.createSocialUser(profile, role, input.inviteToken);

    if (existingUser) {
      this.assertSocialRole(existingUser, role);
      this.assertActiveUser(existingUser);
    }

    this.updateSocialAccount(undefined, user.id, profile);
    this.persistStore();
    return this.authResult(user);
  }

  getUserFromToken(authorization?: string): UserAccount {
    const token = authorization?.replace(/^Bearer\s+/i, "");

    if (!token) {
      throw new UnauthorizedException("인증 토큰이 필요합니다.");
    }

    const [payload, signature] = token.split(".");

    if (!payload || !signature) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    const expectedSignature = createHmac("sha256", tokenSecret)
      .update(payload)
      .digest("base64url");

    if (signature !== expectedSignature) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
    };
    const userId = decoded.sub;
    const user = this.store.users.find((account) => account.id === userId);

    if (!user) {
      throw new UnauthorizedException("인증 토큰이 올바르지 않습니다.");
    }

    return user;
  }

  getMe(authorization?: string) {
    const user = this.getUserFromToken(authorization);
    const roomId = this.store.tenantRooms[user.id];
    const room = roomId ? this.store.rooms.find((item) => item.id === roomId) : undefined;
    const vendor = this.store.vendors.find((item) => item.userId === user.id);
    const managedRooms =
      user.role === "LANDLORD"
        ? this.store.rooms.filter((item) => item.landlordId === user.id).map((item) => ({ ...item }))
        : undefined;

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      roomId,
      room: room ? { ...room } : undefined,
      managedRooms,
      vendorId: vendor?.id,
      vendor: vendor ? { ...vendor } : undefined
    };
  }

  getSignupInvitePreview(role: UserRole, inviteToken: string) {
    const token = inviteToken?.trim();

    if (!token) {
      throw new BadRequestException("초대 토큰이 필요합니다.");
    }

    if (role === "TENANT") {
      const invite = this.store.tenantInvites.find((item) => item.inviteToken === token);

      if (!invite) {
        throw new BadRequestException("유효하지 않은 임차인 초대입니다.");
      }

      this.assertPendingTenantInvite(invite);

      const room = this.findRoom(invite.roomId);
      const manager = this.store.users.find((user) => user.id === invite.invitedByManagerId);

      return {
        role,
        inviteToken: invite.inviteToken,
        status: invite.status,
        expectedName: invite.tenantName,
        invitedBy: manager?.name ?? "관리자",
        email: invite.email,
        phone: invite.phone,
        emailLocked: Boolean(invite.email),
        phoneLocked: Boolean(invite.phone),
        moveInDate: invite.moveInDate,
        targetLabel: [room.buildingName, room.roomNo].filter(Boolean).join(" "),
        room: { ...room },
        signupUrl: invite.signupUrl
      };
    }

    if (role === "VENDOR") {
      const invite = this.store.vendorInvites.find((item) => item.inviteToken === token);

      if (!invite) {
        throw new BadRequestException("유효하지 않은 협력업체 초대입니다.");
      }

      this.assertPendingVendorInvite(invite);

      const manager = this.store.users.find((user) => user.id === invite.invitedByManagerId);

      return {
        role,
        inviteToken: invite.inviteToken,
        status: invite.status,
        expectedName: invite.contactPerson,
        invitedBy: manager?.name ?? "관리자",
        email: invite.email,
        phone: invite.phone,
        emailLocked: Boolean(invite.email),
        phoneLocked: Boolean(invite.phone),
        businessName: invite.businessName,
        serviceArea: invite.serviceArea,
        targetLabel: invite.businessName,
        signupUrl: invite.signupUrl
      };
    }

    throw new BadRequestException("초대 역할이 올바르지 않습니다.");
  }

  private async fetchGoogleProfile(code: string, redirectUri: string): Promise<GoogleUserInfoResponse> {
    const clientId = runtimeEnv("GOOGLE_LOGIN_CLIENT_ID");
    const clientSecret = runtimeEnv("GOOGLE_LOGIN_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new BadRequestException("Google login client credentials are not configured.");
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    }).catch((error) => {
      throw new BadGatewayException(`Google token request failed: ${String(error)}`);
    });

    const tokenJson = (await tokenResponse.json().catch(() => ({}))) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new UnauthorizedException(
        tokenJson.error_description || tokenJson.error || "Google authorization code exchange failed."
      );
    }

    const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json" }
    }).catch((error) => {
      throw new BadGatewayException(`Google profile request failed: ${String(error)}`);
    });

    const profile = (await profileResponse.json().catch(() => ({}))) as GoogleUserInfoResponse;

    if (!profileResponse.ok) {
      throw new UnauthorizedException("Google profile lookup failed.");
    }

    return profile;
  }

  private normalizeSocialRole(role?: UserRole): UserRole {
    const normalizedRole = role ?? "TENANT";

    if (!["TENANT", "LANDLORD", "VENDOR"].includes(normalizedRole)) {
      throw new BadRequestException("Invalid social login role.");
    }

    return normalizedRole;
  }

  private isVerifiedGoogleEmail(value: boolean | string | undefined) {
    return value === true || value === "true";
  }

  private findActiveSocialUser(userId: string, role: UserRole) {
    const user = this.store.users.find((account) => account.id === userId);

    if (!user) {
      throw new UnauthorizedException("Linked Roomlog account was not found.");
    }

    this.assertSocialRole(user, role);
    this.assertActiveUser(user);
    return user;
  }

  private assertSocialRole(user: UserAccount, role: UserRole) {
    if (user.role !== role) {
      throw new BadRequestException("Google account is linked to a different Roomlog role.");
    }
  }

  private assertActiveUser(user: UserAccount) {
    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException("Roomlog account is not active.");
    }
  }

  private createSocialUser(
    profile: GoogleUserInfoResponse,
    role: UserRole,
    inviteToken?: string
  ): UserAccount {
    const email = profile.email?.trim().toLowerCase();

    if (!email) {
      throw new UnauthorizedException("Google account email is required.");
    }

    let phone: string | undefined;
    const nowIso = now();
    const user: UserAccount = {
      id: id("usr"),
      email,
      passwordHash: hashPassword(`google:${profile.sub}:${id("pwd")}`),
      name: profile.name?.trim() || email.split("@")[0],
      role,
      status: "ACTIVE",
      createdAt: nowIso
    };

    if (role === "TENANT" && inviteToken?.trim()) {
      const tenantInvite = this.resolvePendingTenantInvite({
        email,
        inviteToken,
        name: user.name,
        password: "google-social-login",
        role: "TENANT"
      });
      phone = tenantInvite.phone;
      this.store.tenantRooms[user.id] = tenantInvite.roomId;
      tenantInvite.status = "ACCEPTED";
      tenantInvite.acceptedAt = nowIso;
      tenantInvite.acceptedByUserId = user.id;
    }

    if (role === "VENDOR") {
      if (!inviteToken?.trim()) {
        throw new BadRequestException("Vendor Google login requires a manager invite token.");
      }

      const vendorInvite = this.resolvePendingVendorInvite({
        email,
        inviteToken,
        name: user.name,
        password: "google-social-login",
        role: "VENDOR"
      });
      phone = vendorInvite.phone;
      this.store.vendors.push({
        id: id("vnd"),
        userId: user.id,
        businessName: vendorInvite.businessName,
        contactPerson: vendorInvite.contactPerson || user.name,
        phone: vendorInvite.phone,
        serviceArea: vendorInvite.serviceArea,
        activeJobs: 0
      });
      vendorInvite.status = "ACCEPTED";
      vendorInvite.acceptedAt = nowIso;
      vendorInvite.acceptedByUserId = user.id;
    }

    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);

      if (normalizedPhone && this.store.users.some((account) => account.phone === normalizedPhone)) {
        throw new ConflictException("Phone number is already registered.");
      }

      user.phone = normalizedPhone;
    }

    this.store.users.push(user);
    return user;
  }

  private updateSocialAccount(
    socialAccountId: string | undefined,
    userId: string,
    profile: GoogleUserInfoResponse
  ) {
    const nowIso = now();
    const existing =
      socialAccountId !== undefined
        ? this.store.socialAccounts.find((account) => account.id === socialAccountId)
        : this.store.socialAccounts.find(
            (account) => account.provider === "GOOGLE" && account.providerUserId === profile.sub
          );

    if (existing) {
      existing.userId = userId;
      existing.email = profile.email?.trim().toLowerCase();
      existing.name = profile.name?.trim();
      existing.avatarUrl = profile.picture;
      existing.updatedAt = nowIso;
      return existing;
    }

    const created = {
      id: id("social"),
      provider: "GOOGLE" as const,
      providerUserId: profile.sub || "",
      userId,
      email: profile.email?.trim().toLowerCase(),
      name: profile.name?.trim(),
      avatarUrl: profile.picture,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    this.store.socialAccounts.push(created);
    return created;
  }

  private normalizeSignupInput(input: SignupInput): SignupInput {
    return {
      ...input,
      email: input.email?.trim().toLowerCase(),
      name: input.name?.trim(),
      phone: normalizePhoneNumber(input.phone),
      inviteToken: input.inviteToken?.trim(),
      buildingName: input.buildingName?.trim(),
      roomNo: input.roomNo?.trim(),
      address: input.address?.trim(),
      businessName: input.businessName?.trim(),
      serviceArea: input.serviceArea?.trim()
    };
  }

  private validateSignupInput(input: SignupInput) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || "")) {
      throw new BadRequestException("이메일 형식이 올바르지 않습니다.");
    }

    if (!input.password || input.password.length < 8) {
      throw new BadRequestException("비밀번호는 8자 이상이어야 합니다.");
    }

    if (!hasRequiredPasswordMix(input.password)) {
      throw new BadRequestException("비밀번호는 영문과 숫자를 포함해야 합니다.");
    }

    if (input.passwordConfirm !== undefined && input.password !== input.passwordConfirm) {
      throw new BadRequestException("비밀번호 확인이 일치하지 않습니다.");
    }

    if (!input.name?.trim()) {
      throw new BadRequestException("이름을 입력해주세요.");
    }

    if (!input.phone?.trim()) {
      throw new BadRequestException("휴대폰 번호를 입력해주세요.");
    }

    if (!isValidPhoneNumber(input.phone)) {
      throw new BadRequestException("휴대폰 번호는 숫자 10~11자리여야 합니다.");
    }

    if (!["TENANT", "LANDLORD", "VENDOR"].includes(input.role)) {
      throw new BadRequestException("가입 역할이 올바르지 않습니다.");
    }

    if ((input.role === "TENANT" && !input.inviteToken) || input.role === "LANDLORD") {
      if (!input.buildingName?.trim()) {
        throw new BadRequestException("건물명을 입력해주세요.");
      }

      if (!input.roomNo?.trim()) {
        throw new BadRequestException("호실을 입력해주세요.");
      }

      if (!input.address?.trim()) {
        throw new BadRequestException("건물 주소를 입력해주세요.");
      }
    }

    if (input.role === "VENDOR") {
      if (!input.inviteToken?.trim()) {
        throw new BadRequestException("협력업체 가입은 관리자 초대 토큰이 필요합니다.");
      }
    }
  }

  private findOrCreateRoomForSignup(input: SignupInput, landlordId?: string) {
    const buildingName = input.buildingName?.trim();
    const roomNo = input.roomNo?.trim();
    const address = input.address?.trim();

    if (!buildingName || !roomNo || !address) {
      throw new BadRequestException("건물명, 호실, 주소가 필요합니다.");
    }

    const existingRoom = this.store.rooms.find(
      (room) =>
        room.buildingName === buildingName &&
        room.roomNo === roomNo &&
        room.address === address
    );

    if (existingRoom) {
      if (landlordId && !existingRoom.landlordId) {
        existingRoom.landlordId = landlordId;
      }

      return existingRoom.id;
    }

    const room: Room = {
      id: id("room"),
      buildingName,
      roomNo,
      address,
      landlordId
    };
    this.store.rooms.push(room);

    return room.id;
  }

  private seededLandlordId() {
    return this.store.users.some((user) => user.id === "landlord-demo")
      ? "landlord-demo"
      : undefined;
  }

  private authResult(user: UserAccount): AuthResult {
    return {
      userId: user.id,
      role: user.role,
      accessToken: tokenFor(user),
      name: user.name
    };
  }

  private resolvePendingVendorInvite(input: SignupInput) {
    const inviteToken = input.inviteToken?.trim();

    if (!inviteToken) {
      throw new BadRequestException("협력업체 가입은 관리자 초대 토큰이 필요합니다.");
    }

    const invite = this.store.vendorInvites.find((item) => item.inviteToken === inviteToken);

    if (!invite) {
      throw new BadRequestException("유효하지 않은 협력업체 초대입니다.");
    }

    this.assertPendingVendorInvite(invite);

    if (invite.email && invite.email !== input.email) {
      throw new BadRequestException("초대된 이메일과 가입 이메일이 일치하지 않습니다.");
    }

    return invite;
  }

  private assertPendingVendorInvite(invite: VendorInvite) {
    if (invite.status === "ACCEPTED") {
      throw new BadRequestException("이미 사용된 협력업체 초대입니다.");
    }

    if (invite.status === "EXPIRED") {
      throw new BadRequestException("만료된 협력업체 초대입니다.");
    }

    if (invite.status === "REVOKED") {
      throw new BadRequestException("취소된 협력업체 초대입니다.");
    }

    if (invite.status !== "PENDING") {
      throw new BadRequestException("사용할 수 없는 협력업체 초대입니다.");
    }
  }

  private resolvePendingTenantInvite(input: SignupInput) {
    const inviteToken = input.inviteToken?.trim();

    if (!inviteToken) {
      throw new BadRequestException("임차인 초대 토큰이 필요합니다.");
    }

    const invite = this.store.tenantInvites.find((item) => item.inviteToken === inviteToken);

    if (!invite) {
      throw new BadRequestException("유효하지 않은 임차인 초대입니다.");
    }

    this.assertPendingTenantInvite(invite);

    if (invite.email && invite.email !== input.email) {
      throw new BadRequestException("초대된 이메일과 가입 이메일이 일치하지 않습니다.");
    }

    if (invite.phone && input.phone && invite.phone !== input.phone) {
      throw new BadRequestException("초대된 휴대폰 번호와 가입 휴대폰 번호가 일치하지 않습니다.");
    }

    return invite;
  }

  private assertPendingTenantInvite(invite: TenantInvite) {
    if (invite.status === "ACCEPTED") {
      throw new BadRequestException("이미 사용된 임차인 초대입니다.");
    }

    if (invite.status === "EXPIRED") {
      throw new BadRequestException("만료된 임차인 초대입니다.");
    }

    if (invite.status === "REVOKED") {
      throw new BadRequestException("취소된 임차인 초대입니다.");
    }

    if (invite.status !== "PENDING") {
      throw new BadRequestException("사용할 수 없는 임차인 초대입니다.");
    }
  }
}
