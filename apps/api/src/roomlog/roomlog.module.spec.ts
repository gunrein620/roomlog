import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createRoomlogServiceOptions, ensureCoreDemoLoginAccounts } from "./roomlog.module";
import type { AuthAccountRepository } from "./roomlog.service";
import type { UserAccount } from "./roomlog.types";
import { verifyPassword } from "./roomlog-support";

describe("ensureCoreDemoLoginAccounts", () => {
  function makeFakeRepo() {
    const saved: UserAccount[] = [];
    const repo: AuthAccountRepository = {
      async assertAccountAvailable() {},
      async findUserByEmail() {
        return null;
      },
      async saveUser(user) {
        saved.push({ ...user });
      },
      async saveSocialAccount() {}
    };
    return { repo, saved };
  }

  it("merges missing demo accounts into the store and commits them to the DB", async () => {
    const { repo, saved } = makeFakeRepo();
    const store = { users: [] as UserAccount[] };

    await ensureCoreDemoLoginAccounts(store, repo);

    const emails = store.users.map((user) => user.email);
    assert.deepEqual(emails, [
      "tenant@roomlog.test",
      "manager@roomlog.test",
      "vendor@roomlog.test",
      "multi@roomlog.test"
    ]);
    assert.equal(saved.length, 4);
    // 시드 비밀번호로 실제 로그인 검증이 통과해야 한다.
    assert.ok(verifyPassword("password123!", store.users[0].passwordHash));
  });

  it("keeps existing accounts untouched and only fills the gaps", async () => {
    const { repo, saved } = makeFakeRepo();
    const existing: UserAccount = {
      id: "landlord-live",
      email: "manager@roomlog.test",
      passwordHash: "keep-this-hash",
      name: "운영중인관리자",
      role: "LANDLORD",
      status: "ACTIVE",
      createdAt: "2026-07-01T00:00:00.000Z"
    };
    const store = { users: [existing] };

    await ensureCoreDemoLoginAccounts(store, repo);

    assert.equal(store.users.length, 4);
    assert.equal(store.users[0], existing);
    assert.equal(saved.some((user) => user.email === "manager@roomlog.test"), false);
  });

  it("still merges into memory when the DB commit fails", async () => {
    const repo: AuthAccountRepository = {
      async assertAccountAvailable() {},
      async findUserByEmail() {
        return null;
      },
      async saveUser() {
        throw new Error("DB down");
      },
      async saveSocialAccount() {}
    };
    const store = { users: [] as UserAccount[] };

    await ensureCoreDemoLoginAccounts(store, repo);

    assert.equal(store.users.length, 4);
  });
});

describe("RoomlogModule", () => {
  const testDatabaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

  it("configures a Prisma projector when DATABASE_URL is present", { skip: !testDatabaseUrl }, async () => {
    const options = await createRoomlogServiceOptions({
      DATABASE_URL: testDatabaseUrl!
    });

    assert.equal(Boolean(options.storeProjector), true);
    await options.storeProjector?.disconnect?.();
  });

  it("does not configure a Prisma projector without DATABASE_URL", async () => {
    const options = await createRoomlogServiceOptions({});

    assert.equal(options.storeProjector, undefined);
  });
});
