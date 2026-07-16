import { BadGatewayException, ConflictException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { AuthAccountRepository } from "./roomlog.service";
import type { SocialAccount, UserAccount } from "./roomlog.types";

/**
 * 인증 계정의 DB 단일 원본(PostgreSQL) 저장소.
 * 회원가입·로그인·소셜 로그인 경로에서 UserAccount/SocialAccount를 "응답 전에" 동기 커밋한다 —
 * 기존 전체 스토어 프로젝션(PrismaStoreProjector)은 응답 이후 비동기라서
 * DB 저장 실패에도 가입 성공 응답이 나가던 문제를 이 저장소가 막는다.
 * 프로젝션의 UserAccount upsert와는 멱등하게 겹친다(같은 id upsert).
 */
export class PrismaAuthRepository implements AuthAccountRepository {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl });
    this.prisma = new PrismaClient({ adapter });
  }

  /** 가입 전 DB 기준 중복 검사 — 메모리 검사만으로는 다른 인스턴스/운영자 직접 추가 계정을 놓친다. */
  async assertAccountAvailable(email: string, phone?: string): Promise<void> {
    let emailHit: unknown;
    let phoneHit: unknown;
    try {
      [emailHit, phoneHit] = await Promise.all([
        this.prisma.userAccount.findUnique({ where: { email }, select: { id: true } }),
        phone
          ? this.prisma.userAccount.findFirst({ where: { phone }, select: { id: true } })
          : Promise.resolve(null)
      ]);
    } catch {
      // DB가 원본인 환경에서 DB에 못 닿으면 가입을 확정할 수 없다 — 성공 응답을 내지 않는다.
      throw new BadGatewayException("데이터베이스에 연결할 수 없어 가입을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
    if (emailHit) throw new ConflictException("이미 가입된 이메일입니다.");
    if (phoneHit) throw new ConflictException("이미 가입된 휴대폰 번호입니다.");
  }

  async findUserByEmail(email: string): Promise<UserAccount | null> {
    const row = await this.prisma.userAccount.findUnique({ where: { email } });
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      name: row.name,
      phone: row.phone ?? undefined,
      role: row.role as UserAccount["role"],
      status: row.status as UserAccount["status"],
      createdAt: row.createdAt.toISOString()
    };
  }

  /** 계정 upsert — UNIQUE 충돌(P2002)은 어떤 컬럼인지에 따라 사용자 메시지로 매핑한다. */
  async saveUser(user: UserAccount): Promise<void> {
    const data = {
      email: user.email,
      passwordHash: user.passwordHash,
      name: user.name,
      phone: user.phone ?? null,
      role: user.role as unknown as Prisma.UserAccountCreateInput["role"],
      status: user.status as unknown as Prisma.UserAccountCreateInput["status"]
    };
    try {
      await this.prisma.userAccount.upsert({
        where: { id: user.id },
        create: { id: user.id, createdAt: new Date(user.createdAt), ...data },
        update: data
      });
    } catch (error) {
      throw this.mapSaveError(error);
    }
  }

  async saveSocialAccount(account: SocialAccount): Promise<void> {
    const data = {
      userId: account.userId,
      email: account.email ?? null,
      name: account.name ?? null,
      avatarUrl: account.avatarUrl ?? null
    };
    try {
      await this.prisma.socialAccount.upsert({
        where: {
          provider_providerUserId: {
            provider: account.provider as unknown as Prisma.SocialAccountCreateInput["provider"],
            providerUserId: account.providerUserId
          }
        },
        create: {
          id: account.id,
          provider: account.provider as unknown as Prisma.SocialAccountCreateInput["provider"],
          providerUserId: account.providerUserId,
          createdAt: new Date(account.createdAt),
          ...data
        },
        update: data
      });
    } catch (error) {
      throw this.mapSaveError(error);
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private mapSaveError(error: unknown): Error {
    const known = error as { code?: string; meta?: { target?: unknown } };
    if (known?.code === "P2002") {
      const target = String(known.meta?.target ?? "");
      if (target.includes("phone")) return new ConflictException("이미 가입된 휴대폰 번호입니다.");
      return new ConflictException("이미 가입된 이메일입니다.");
    }
    return new BadGatewayException("계정 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}
