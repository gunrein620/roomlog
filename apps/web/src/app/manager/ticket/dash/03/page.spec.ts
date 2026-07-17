import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/manager/ticket/dash/03/page.tsx"),
  "utf8",
);
const formPath = join(
  process.cwd(),
  "src/app/manager/ticket/dash/03/ManagerTicketReplyForm.tsx",
);

test("reply page loads a real draft and renders the editable reply form", () => {
  assert.match(pageSource, /draftManagerTicketReply/);
  assert.match(pageSource, /ManagerTicketReplyForm/);
  assert.doesNotMatch(pageSource, /수정 후 발송<\/LinkButton>/);
});

test("reply form supports regeneration, editing, and actual send actions", () => {
  const formSource = readFileSync(formPath, "utf8");

  assert.match(formSource, /useActionState/);
  assert.match(formSource, /name="messageText"/);
  assert.match(formSource, /name="intent"/);
  assert.match(formSource, /value="regenerate"/);
  assert.match(formSource, /value="send"/);
  assert.match(formSource, /초안 다시 생성/);
  assert.match(formSource, /수정 후 발송/);
});
