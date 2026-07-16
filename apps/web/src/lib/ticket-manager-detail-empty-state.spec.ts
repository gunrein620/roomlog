import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/01/page.tsx"),
  "utf8",
);
const layoutSource = readFileSync(
  join(__dirname, "../app/manager/ticket/dash/layout.tsx"),
  "utf8",
);
const backButtonPath = join(
  __dirname,
  "../app/manager/ticket/dash/01/TicketDetailBackButton.tsx",
);
const backButtonSource = existsSync(backButtonPath)
  ? readFileSync(backButtonPath, "utf8")
  : "";
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

  it("removes the shared ticket header box and uses the concise detail title", () => {
    assert.match(layoutSource, /hideHeader/);
    assert.match(pageSource, /하자\/민원 처리/);
    assert.doesNotMatch(pageSource, /티켓 상세 & 검토/);
  });

  it("returns to the previous page from both ticket detail title states", () => {
    assert.equal(
      pageSource.match(/<TicketDetailBackButton/g)?.length,
      2,
    );
    assert.match(backButtonSource, /useRouter/);
    assert.match(backButtonSource, /window\.history\.length/);
    assert.match(backButtonSource, /router\.back\(\)/);
    assert.match(backButtonSource, /\/manager\/ticket\/dash\/00/);
    assert.match(backButtonSource, /이전 페이지로 돌아가기/);
    assert.match(backButtonSource, /ArrowLeft/);
  });
});
