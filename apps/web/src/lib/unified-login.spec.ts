import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  defaultRedirectForIntent,
  hasCapability,
  intentForRole,
  legacyLoginRedirectTarget,
  normalizeLoginIntent,
  resolvePostLoginDestination,
  safeRedirectPath,
  unifiedLoginPath
} from "./unified-login";

describe("unified login path", () => {
  it("builds the canonical /login path with intent and redirectTo", () => {
    assert.equal(unifiedLoginPath(), "/login");
    assert.equal(unifiedLoginPath("tenant"), "/login?intent=tenant");
    assert.equal(
      unifiedLoginPath("landlord", "/?role=landlord&tab=mypage"),
      "/login?intent=landlord&redirectTo=%2F%3Frole%3Dlandlord%26tab%3Dmypage"
    );
  });

  it("maps roles to intents (SEEKER has no roomlog intent)", () => {
    assert.equal(intentForRole("TENANT"), "tenant");
    assert.equal(intentForRole("LANDLORD"), "landlord");
    assert.equal(intentForRole("VENDOR"), "vendor");
    assert.equal(intentForRole("SEEKER"), undefined);
    assert.equal(intentForRole(undefined), undefined);
  });

  it("normalizes only known intents", () => {
    assert.equal(normalizeLoginIntent("tenant"), "tenant");
    assert.equal(normalizeLoginIntent("LANDLORD"), undefined);
    assert.equal(normalizeLoginIntent(null), undefined);
  });

  it("rejects unsafe redirect paths", () => {
    assert.equal(safeRedirectPath("https://evil.test", "/"), "/");
    assert.equal(safeRedirectPath("//evil.test", "/"), "/");
    assert.equal(safeRedirectPath("/tenant/home/00", "/"), "/tenant/home/00");
  });
});

describe("legacy login compatibility redirects", () => {
  it("maps role login paths to /login with intent preserved", () => {
    assert.equal(legacyLoginRedirectTarget("tenant", {}), "/login?intent=tenant");
    assert.equal(legacyLoginRedirectTarget("landlord", {}), "/login?intent=landlord");
    assert.equal(legacyLoginRedirectTarget("vendor", {}), "/login?intent=vendor");
  });

  it("preserves a safe redirectTo and error message", () => {
    assert.equal(
      legacyLoginRedirectTarget("tenant", { redirectTo: "/?role=tenant&tab=mypage" }),
      "/login?intent=tenant&redirectTo=%2F%3Frole%3Dtenant%26tab%3Dmypage"
    );
    assert.equal(
      legacyLoginRedirectTarget("landlord", { redirectTo: "https://evil.test", error: "google_state" }),
      "/login?intent=landlord&error=google_state"
    );
  });
});

describe("post-login destination (capability, not identity)", () => {
  const multiRoleUser = { role: "TENANT", roles: ["SEEKER", "TENANT", "LANDLORD"] };

  it("routes a multi-role account into both tenant and landlord surfaces", () => {
    assert.deepEqual(resolvePostLoginDestination(multiRoleUser, "tenant"), {
      kind: "redirect",
      path: defaultRedirectForIntent("tenant")
    });
    assert.deepEqual(resolvePostLoginDestination(multiRoleUser, "landlord"), {
      kind: "redirect",
      path: defaultRedirectForIntent("landlord")
    });
  });

  it("asks for a relation link instead of re-login when capability is missing", () => {
    assert.deepEqual(resolvePostLoginDestination(multiRoleUser, "vendor"), {
      kind: "link-required",
      intent: "vendor"
    });
  });

  it("falls back to the legacy single role when roles[] is absent", () => {
    const legacyUser = { role: "VENDOR" };
    assert.equal(hasCapability(legacyUser, "VENDOR"), true);
    assert.equal(hasCapability(legacyUser, "TENANT"), false);
    assert.deepEqual(resolvePostLoginDestination(legacyUser, "vendor"), {
      kind: "redirect",
      path: "/vendor/job/00"
    });
  });

  it("honors a safe redirectTo and rejects unsafe ones", () => {
    assert.deepEqual(resolvePostLoginDestination(multiRoleUser, "tenant", "/tenant/home/00"), {
      kind: "redirect",
      path: "/tenant/home/00"
    });
    assert.deepEqual(resolvePostLoginDestination(multiRoleUser, undefined, "https://evil.test"), {
      kind: "redirect",
      path: "/"
    });
  });
});
