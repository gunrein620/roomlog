import { strict as assert } from "node:assert";
import test from "node:test";
import { placeTicketActionMenu } from "./ticket-action-menu-position";

test("places the ticket action menu below when space is available", () => {
  assert.deepEqual(
    placeTicketActionMenu({
      trigger: { top: 100, right: 300, bottom: 144 },
      menu: { width: 180, height: 140 },
      viewport: { width: 1200, height: 800 },
      gap: 8,
    }),
    { top: 152, left: 120, placement: "bottom" },
  );
});

test("flips the ticket action menu above when the lower edge would clip it", () => {
  assert.deepEqual(
    placeTicketActionMenu({
      trigger: { top: 680, right: 500, bottom: 724 },
      menu: { width: 180, height: 140 },
      viewport: { width: 800, height: 740 },
      gap: 8,
    }),
    { top: 532, left: 320, placement: "top" },
  );
});

test("keeps the ticket action menu inside both horizontal viewport edges", () => {
  assert.equal(
    placeTicketActionMenu({
      trigger: { top: 100, right: 90, bottom: 144 },
      menu: { width: 180, height: 140 },
      viewport: { width: 800, height: 740 },
      gap: 8,
    }).left,
    8,
  );

  assert.equal(
    placeTicketActionMenu({
      trigger: { top: 100, right: 900, bottom: 144 },
      menu: { width: 180, height: 140 },
      viewport: { width: 800, height: 740 },
      gap: 8,
    }).left,
    612,
  );
});
