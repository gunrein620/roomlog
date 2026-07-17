import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { VendorJobMessageView } from "@roomlog/types";
import * as vendorJobChat from "./vendor-job-chat";

type SenderLabel = (role: VendorJobMessageView["senderRole"]) => string;
type SendGate = (status: string) => boolean;

const senderLabel = (vendorJobChat as Record<string, unknown>)
  .vendorJobMessageSenderLabel as SenderLabel | undefined;
const canSend = (vendorJobChat as Record<string, unknown>)
  .canVendorSendJobMessage as SendGate | undefined;

function source(path: string) {
  return readFileSync(join(process.cwd(), "src", path), "utf8");
}

const typeSource = source("../../../packages/types/src/vendor-workflow.ts");
const apiSource = source("lib/vendor-workflow-api.ts");
const actionSource = source("app/vendor/job/actions.ts");
const pageSource = source("app/vendor/job/01/page.tsx");
const componentSource = source("app/vendor/job/_components.tsx");

test("vendor job chat labels each participant from the vendor perspective", () => {
  assert.equal(typeof senderLabel, "function");
  if (!senderLabel) return;

  assert.equal(senderLabel("VENDOR"), "나");
  assert.equal(senderLabel("TENANT"), "세입자");
  assert.equal(senderLabel("LANDLORD"), "관리자");
});

test("vendor job chat is read-only after completion or cancellation", () => {
  assert.equal(typeof canSend, "function");
  if (!canSend) return;

  for (const active of [
    "REQUESTED",
    "ACCEPTED",
    "ESTIMATE_SUBMITTED",
    "ESTIMATE_APPROVED",
    "SCHEDULED",
    "IN_PROGRESS",
    "COMPLETION_REPORTED"
  ]) {
    assert.equal(canSend(active), true, active);
  }
  assert.equal(canSend("COMPLETED"), false);
  assert.equal(canSend("CANCELLED"), false);
  assert.equal(canSend("CLOSED"), false);
  assert.equal(canSend("UNKNOWN_FUTURE_STATUS"), false);
});

test("vendor job detail exposes privacy-safe repair-scoped message views", () => {
  assert.match(typeSource, /export interface VendorJobMessageView/);
  assert.match(typeSource, /messages: VendorJobMessageView\[\]/);
  const messageView = typeSource.slice(
    typeSource.indexOf("export interface VendorJobMessageView"),
    typeSource.indexOf("export interface RequestTenantDirectPaymentInput")
  );
  assert.doesNotMatch(messageView, /senderUserId/);
  assert.doesNotMatch(messageView, /repairId/);
});

test("vendor chat mutation posts through the authenticated workflow API and revalidates detail", () => {
  assert.match(apiSource, /export function sendVendorRepairMessage/);
  assert.match(apiSource, /vendor\/jobs\/\$\{encodeURIComponent\(repairId\)\}\/messages/);
  assert.match(apiSource, /method: "POST"/);
  assert.match(actionSource, /export async function sendVendorRepairMessageAction/);
  assert.match(actionSource, /sendVendorRepairMessage\(repairId/);
  assert.match(actionSource, /revalidatePath\(withId\(ROUTES\["V-JOB-01"\], repairId\)\)/);
});

test("vendor detail renders the progress thread and hides the composer when read-only", () => {
  assert.match(pageSource, /<VendorJobChat/);
  assert.match(pageSource, /job=\{job\}/);
  assert.match(componentSource, /export function VendorJobChat/);
  assert.match(componentSource, />진행 메시지</);
  assert.match(componentSource, /job\.messages\.map/);
  assert.match(componentSource, /vendorJobMessageSenderLabel\(message\.senderRole\)/);
  assert.match(componentSource, /canVendorSendJobMessage\(job\.status\)/);
  assert.match(componentSource, /name="messageText"/);
  assert.match(componentSource, /sendVendorRepairMessageAction/);
  assert.match(componentSource, /완료되거나 취소된 작업은 메시지를 읽기만 할 수 있습니다/);
  assert.match(componentSource, /API에 연결되면 진행 메시지를 보낼 수 있습니다/);
});
