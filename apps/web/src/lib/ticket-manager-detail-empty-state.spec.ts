import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);
const uiSource = readFileSync(
  join(__dirname, "../app/manager/ticket/_components/ticket-manager-ui.tsx"),
  "utf8",
);

describe("manager ticket detail empty states", () => {
  it("uses the strict real-data detail loader without demo fallback getters", () => {
    assert.match(pageSource, /getManagerTicketDetail/);
    assert.doesNotMatch(pageSource, /MANAGER_DEMO_TICKET_ID/);
    assert.doesNotMatch(pageSource, /\bgetManagerTicket\b/);
    assert.doesNotMatch(pageSource, /getManagerAnalysis|getManagerRepair/);
  });

  it("renders explicit ticket and AI analysis empty states", () => {
    assert.match(pageSource, /조회할 티켓이 없습니다\./);
    assert.match(pageSource, /조회할 AI 분석 내용이 없습니다\./);
    assert.match(uiSource, /조회할 책임 검토 내용이 없습니다\./);
  });

  it("does not render the temporary photo comparison card", () => {
    assert.doesNotMatch(pageSource, /TicketEvidenceGallery|사진 비교·근거/);
  });

  it("shows actual attachment thumbnails or an attachment empty state", () => {
    assert.match(pageSource, /AttachmentThumbnailGallery/);
    assert.match(pageSource, /attachmentUrls=\{detail\.attachmentUrls\}/);
    assert.match(pageSource, /조회할 첨부 내용이 없습니다\./);
    assert.doesNotMatch(pageSource, /사진 \{detail\.attachmentUrls\.length\}장|반복 민원 1건|연결 티켓 보기/);
  });

  it("does not expose the temporary voice approval action", () => {
    assert.doesNotMatch(pageSource, /음성으로 빠른 승인|callRoutes/);
  });
});
