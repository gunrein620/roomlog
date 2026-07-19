import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  issuePublicGaraSocketTicket,
  verifySocketTicket,
} from "./socket-ticket";

test("issues a short-lived public ticket scoped only to Gara updates", () => {
  const ticket = issuePublicGaraSocketTicket();
  const payload = verifySocketTicket(ticket);

  assert.deepEqual(payload?.scope, "PUBLIC_GARA");
  assert.equal(payload?.sub, "public-gara");
});
