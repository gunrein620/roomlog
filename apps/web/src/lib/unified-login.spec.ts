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
      unifiedLoginPath("landlord", "/sell"),
      "/login?intent=landlord&redirectTo=%2Fsell"
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
      legacyLoginRedirectTarget("tenant", { redirectTo: "/living" }),
      "/login?intent=tenant&redirectTo=%2Fliving"
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
    assert.equal(resolvePostLoginDestination(multiRoleUser, "tenant"), defaultRedirectForIntent("tenant"));
    assert.equal(resolvePostLoginDestination(multiRoleUser, "landlord"), defaultRedirectForIntent("landlord"));
  });

  it("sends a capability-less account straight to the relation entry point (no interstitial)", () => {
    assert.equal(resolvePostLoginDestination(multiRoleUser, "vendor"), "/vendor/activate");
    const seekerOnly = { role: "SEEKER", roles: ["SEEKER"] };
    assert.equal(resolvePostLoginDestination(seekerOnly, "landlord"), "/sell");
    assert.equal(resolvePostLoginDestination(seekerOnly, "tenant"), "/");
  });

  it("ignores redirectTo when capability is missing (protected-path loop guard)", () => {
    const seekerOnly = { role: "SEEKER", roles: ["SEEKER"] };
    assert.equal(resolvePostLoginDestination(seekerOnly, "landlord", "/manager/home/00"), "/sell");
  });

  it("falls back to the legacy single role when roles[] is absent", () => {
    const legacyUser = { role: "VENDOR" };
    assert.equal(hasCapability(legacyUser, "VENDOR"), true);
    assert.equal(hasCapability(legacyUser, "TENANT"), false);
    assert.equal(resolvePostLoginDestination(legacyUser, "vendor"), "/vendor/job/00");
  });

  it("honors a safe redirectTo and rejects unsafe ones", () => {
    assert.equal(resolvePostLoginDestination(multiRoleUser, "tenant", "/tenant/home/00"), "/tenant/home/00");
    assert.equal(resolvePostLoginDestination(multiRoleUser, undefined, "https://evil.test"), "/");
  });
});
