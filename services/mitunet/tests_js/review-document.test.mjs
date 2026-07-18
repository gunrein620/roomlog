import test from "node:test";
import assert from "node:assert/strict";

import { ReviewDocument } from "../viewer/review-document.mjs";

test("one committed gesture is one undo step", () => {
  const doc = new ReviewDocument(new Uint8Array([0, 1, 0, 0]), []);

  doc.beginEdit();
  doc.wallMask[0] = 1;
  doc.wallMask[2] = 1;
  doc.commitEdit();

  assert.deepEqual([...doc.wallMask], [1, 1, 1, 0]);
  assert.equal(doc.undoDepth, 1);

  doc.undo();

  assert.deepEqual([...doc.wallMask], [0, 1, 0, 0]);
});

test("view switching can detect a stale 3d render", () => {
  const doc = new ReviewDocument(new Uint8Array([1]), []);

  assert.equal(doc.needsCompose(), true);

  doc.markRendered();
  assert.equal(doc.needsCompose(), false);

  doc.beginEdit();
  doc.openings.push({ id: "door-1", kind: "door" });
  doc.commitEdit();

  assert.equal(doc.needsCompose(), true);
});

test("history is bounded to 30 committed gestures", () => {
  const doc = new ReviewDocument(new Uint8Array([0]), []);

  for (let index = 0; index < 40; index += 1) {
    doc.beginEdit();
    doc.wallMask[0] = index % 2;
    doc.commitEdit();
  }

  assert.equal(doc.undoDepth, 30);
});

test("redo restores the undone state as one complete gesture", () => {
  const doc = new ReviewDocument(new Uint8Array([0, 0]), []);

  doc.beginEdit();
  doc.wallMask[1] = 1;
  doc.commitEdit();
  doc.undo();
  assert.deepEqual([...doc.wallMask], [0, 0]);

  const redone = doc.redo();

  assert.equal(redone, true);
  assert.deepEqual([...doc.wallMask], [0, 1]);
});

test("reset restores the original ai mask and openings", () => {
  const originalOpenings = [{ id: "door-1", kind: "door", width: 10 }];
  const doc = new ReviewDocument(new Uint8Array([1, 0]), originalOpenings);

  doc.beginEdit();
  doc.wallMask[1] = 1;
  doc.openings[0].kind = "window";
  doc.openings.push({ id: "window-2", kind: "window", width: 14 });
  doc.commitEdit();

  doc.reset();

  assert.deepEqual([...doc.wallMask], [1, 0]);
  assert.deepEqual(doc.openings, originalOpenings);
});

test("undo restores the previous opening type from a cloned snapshot", () => {
  const openings = [{ id: "door-1", kind: "door", width: 10 }];
  const doc = new ReviewDocument(new Uint8Array([1]), openings);

  doc.beginEdit();
  doc.openings[0].kind = "window";
  doc.commitEdit();
  doc.undo();

  assert.equal(doc.openings[0].kind, "door");

  doc.openings[0].kind = "window";
  assert.equal(openings[0].kind, "door");
});
