import { Module } from "@nestjs/common";
import { RoomlogController } from "./roomlog.controller";
import {
  ROOMLOG_SERVICE_OPTIONS,
  RoomlogService,
  RoomlogServiceOptions,
  coreDemoLoginAccounts,
  type AuthAccountRepository,
  type Store
} from "./roomlog.service";
import { PrismaStoreProjector } from "./prisma-store-projector";
import { PrismaAuthRepository } from "./prisma-auth-repository";
import { RealtimeModule } from "../realtime/realtime.module";

/**
 * DB 부팅 스토어에 핵심 데모 계정이 빠져 있으면 병합하고 DB에도 동기 커밋한다.
 * DB가 원본인 환경에서 계정 데이터가 유실돼도(2026-07-16 프로드 사고: DB에 계정이
 * 없는 채로 부팅해 메모리 데모 계정까지 증발) 데모 로그인은 부팅 시 항상 복구된다.
 */
export async function ensureCoreDemoLoginAccounts(
  store: Pick<Store, "users">,
  authRepository?: AuthAccountRepository
): Promise<void> {
  for (const account of coreDemoLoginAccounts()) {
    if (store.users.some((user) => user.email === account.email)) continue;

    store.users.push(account);
    try {
      await authRepository?.saveUser(account);
    } catch {
      // DB 커밋이 실패해도 메모리 병합만으로 데모 로그인은 동작한다 — 다음 프로젝션이 따라잡는다.
    }
  }
}

export async function createRoomlogServiceOptions(
  env: NodeJS.ProcessEnv = process.env
): Promise<RoomlogServiceOptions> {
  const databaseUrl = env.DATABASE_URL?.trim();
  const storeProjector = databaseUrl ? new PrismaStoreProjector(databaseUrl) : undefined;
  // 인증 계정은 DB를 단일 원본으로 — 가입/로그인/소셜이 응답 전에 동기 커밋·직접 조회한다.
  const authRepository = databaseUrl ? new PrismaAuthRepository(databaseUrl) : undefined;
  const initialStore = await storeProjector?.load?.();

  if (initialStore) {
    await ensureCoreDemoLoginAccounts(initialStore, authRepository);
  }

  return {
    initialStore,
    storeProjector,
    authRepository
  };
}

@Module({
  imports: [RealtimeModule],
  controllers: [RoomlogController],
  providers: [
    {
      provide: ROOMLOG_SERVICE_OPTIONS,
      useFactory: async () => createRoomlogServiceOptions()
    },
    RoomlogService
  ],
  // 거래(trade) 모듈이 같은 토큰 인증을 재사용한다.
  exports: [RoomlogService]
})
export class RoomlogModule {}
