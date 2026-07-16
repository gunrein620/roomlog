import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ConflictException } from "@nestjs/common";
import { RoomlogService, type AuthAccountRepository } from "./roomlog.service";
import type { SocialAccount, UserAccount } from "./roomlog.types";
import { hashPassword } from "./roomlog-support";

/**
 * 인증 DB-first 경로 검증 — 가입은 DB 커밋 성공 후에만 응답하고,
 * 로그인은 DB에서 계정을 직접 조회하며, DB 실패 시 메모리가 롤백되는지 본다.
 */

function makeFakeRepo(options: { failSaveUser?: boolean } = {}) {
  const dbUsers = new Map<string, UserAccount>();
  const dbSocials: SocialAccount[] = [];
  const calls: string[] = [];
  const repo: AuthAccountRepository = {
    async assertAccountAvailable(email, phone) {
      calls.push(`assert:${email}`);
      for (const user of dbUsers.values()) {
        if (user.email === email) throw new ConflictException("이미 가입된 이메일입니다.");
        if (phone && user.phone === phone) throw new ConflictException("이미 가입된 휴대폰 번호입니다.");
      }
    },
    async findUserByEmail(email) {
      calls.push(`find:${email}`);
      return [...dbUsers.values()].find((user) => user.email === email) ?? null;
    },
    async saveUser(user) {
      calls.push(`save:${user.email}`);
      if (options.failSaveUser) throw new Error("DB down");
      dbUsers.set(user.id, { ...user });
    },
    async saveSocialAccount(account) {
      dbSocials.push({ ...account });
    }
  };
  return { repo, dbUsers, dbSocials, calls };
}

function makeService(repo: AuthAccountRepository) {
  return new RoomlogService({ seedDemoData: false, authRepository: repo });
}

const signupInput = {
  email: "db-first@roomlog.test",
  password: "password123",
  name: "디비퍼스트",
  role: "SEEKER" as const
};

describe("RoomlogService auth DB-first", () => {
  it("commits the account to the DB before returning a signup token", async () => {
    const { repo, dbUsers, calls } = makeFakeRepo();
    const service = makeService(repo);

    const result = await service.signupWithDb(signupInput);

    assert.ok(result.accessToken);
    assert.equal(dbUsers.size, 1);
    assert.equal([...dbUsers.values()][0].email, "db-first@roomlog.test");
    // 중복 검사(DB) → 저장(DB) 순서
    assert.deepEqual(calls, ["assert:db-first@roomlog.test", "save:db-first@roomlog.test"]);
  });

  it("rejects signup when the email already exists in the DB (memory unaware)", async () => {
    const { repo, dbUsers } = makeFakeRepo();
    dbUsers.set("usr-db-only", {
      id: "usr-db-only",
      email: "db-first@roomlog.test",
      passwordHash: hashPassword("password123"),
      name: "운영자추가",
      role: "SEEKER",
      status: "ACTIVE",
      createdAt: "2026-07-01T00:00:00.000Z"
    });
    const service = makeService(repo);

    await assert.rejects(service.signupWithDb(signupInput), /이미 가입된 이메일/);
    // 메모리에도 계정이 만들어지지 않아야 한다.
    assert.throws(() => service.login(signupInput), /올바르지 않습니다/);
  });

  it("rolls back the in-memory account when the DB commit fails", async () => {
    const { repo } = makeFakeRepo({ failSaveUser: true });
    const service = makeService(repo);

    await assert.rejects(service.signupWithDb(signupInput), /DB down/);
    // 롤백 확인 — 실패한 가입의 계정으로 로그인할 수 없어야 한다.
    assert.throws(
      () => service.login({ email: signupInput.email, password: signupInput.password }),
      /올바르지 않습니다/
    );
  });

  it("logs in an account that only exists in the DB by hydrating the memory cache", async () => {
    const { repo, dbUsers } = makeFakeRepo();
    dbUsers.set("usr-db-only", {
      id: "usr-db-only",
      email: "operator@roomlog.test",
      passwordHash: hashPassword("operator123"),
      name: "운영자계정",
      role: "SEEKER",
      status: "ACTIVE",
      createdAt: "2026-07-01T00:00:00.000Z"
    });
    const service = makeService(repo);

    // 메모리에는 없다 — DB 조회로 캐시가 채워져 로그인돼야 한다.
    const result = await service.loginWithDb({ email: "Operator@roomlog.test", password: "operator123" });
    assert.equal(result.userId, "usr-db-only");
    assert.ok(result.accessToken);
  });

  it("keeps signup working without a repository (local dev fallback)", async () => {
    const service = new RoomlogService({ seedDemoData: false });
    const result = await service.signupWithDb(signupInput);
    assert.ok(result.accessToken);
    const login = await service.loginWithDb({ email: signupInput.email, password: signupInput.password });
    assert.equal(login.userId, result.userId);
  });
});
