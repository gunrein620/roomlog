import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TICKET_CHAT_IMAGE_BYTES,
  resolveTicketChatAttachmentUrl,
  uploadTicketChatImages,
  validateTicketChatImages,
} from "./ticket-chat-attachments";

test("채팅 사진은 최대 5장, 이미지 형식, 장당 10MB를 검증한다", () => {
  assert.equal(validateTicketChatImages([
    { name: "one.jpg", type: "image/jpeg", size: 1024 },
  ], 4), null);
  assert.match(validateTicketChatImages([
    { name: "six.jpg", type: "image/jpeg", size: 1024 },
  ], 5) ?? "", /최대 5장/);
  assert.match(validateTicketChatImages([
    { name: "memo.pdf", type: "application/pdf", size: 1024 },
  ]) ?? "", /이미지 파일만/);
  assert.match(validateTicketChatImages([
    { name: "large.jpg", type: "image/jpeg", size: MAX_TICKET_CHAT_IMAGE_BYTES + 1 },
  ]) ?? "", /10MB 이하/);
});

test("선택 순서대로 사진을 업로드하고 URL을 반환한다", async () => {
  const firstFile = new File(["first"], "first.jpg", { type: "image/jpeg" });
  const secondFile = new File(["second"], "second.png", { type: "image/png" });
  const names: string[] = [];

  const urls = await uploadTicketChatImages(
    [firstFile, secondFile],
    async (_url: string | URL | Request, init?: RequestInit) => {
      const file = (init?.body as FormData).get("file");
      assert.ok(file instanceof File);
      names.push(file.name);
      return new Response(JSON.stringify({ fileUrl: `/api/files/${file.name}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  assert.deepEqual(names, ["first.jpg", "second.png"]);
  assert.deepEqual(urls, ["/api/files/first.jpg", "/api/files/second.png"]);
});

test("업로드 오류 메시지를 보존하고 첨부 URL을 API 기준으로 해석한다", async () => {
  const file = new File(["broken"], "broken.jpg", { type: "image/jpeg" });
  await assert.rejects(
    uploadTicketChatImages([file], async () => new Response(
      JSON.stringify({ message: "저장소 오류" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )),
    /저장소 오류/,
  );

  assert.equal(resolveTicketChatAttachmentUrl("/api/files/photo.jpg", ""), "/api/files/photo.jpg");
  assert.equal(
    resolveTicketChatAttachmentUrl("/api/files/photo.jpg", "https://api.roomlog.kr/api"),
    "https://api.roomlog.kr/api/files/photo.jpg",
  );
  assert.equal(
    resolveTicketChatAttachmentUrl("https://cdn.roomlog.kr/photo.jpg", "https://api.roomlog.kr"),
    "https://cdn.roomlog.kr/photo.jpg",
  );
});
