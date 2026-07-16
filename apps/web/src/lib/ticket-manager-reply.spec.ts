import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const apiSource = readFileSync(
  join(process.cwd(), "src/lib/ticket-manager-api.ts"),
  "utf8",
);
const typeSource = readFileSync(
  join(process.cwd(), "../../packages/types/src/ticket.ts"),
  "utf8",
);

test("manager ticket reply contracts are shared from the ticket domain", () => {
  assert.match(typeSource, /export type ManagerReplyIntent/);
  assert.match(typeSource, /export type ManagerReplyAction/);
  assert.match(typeSource, /export interface ManagerReplyDraftResult/);
});

test("manager ticket API requests rule-based drafts from the authenticated backend", () => {
  assert.match(apiSource, /export async function draftManagerTicketReply/);
  assert.match(apiSource, /manager\/tickets\/.*reply-draft/);
  assert.match(apiSource, /method: "POST"/);
});

test("manager ticket API sends edited replies to the authenticated backend", () => {
  assert.match(apiSource, /export async function sendManagerTicketReply/);
  assert.match(apiSource, /manager\/tickets\/.*replies/);
  assert.match(apiSource, /ManagerTicketReplyInput/);
});
