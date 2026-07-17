import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRiseAnimationFrame,
  replayRiseAnimations,
} from "../viewer/view-transition.mjs";

test("rise animations reset raised sections to the floor on every replay", () => {
  const animation = {
    mesh: { position: { y: 0.9 }, scale: { z: 1 } },
    finalBottom: 0.9,
    start: 10,
    delay: 30,
    duration: 1200,
  };

  replayRiseAnimations([animation], 100, false);
  assert.equal(animation.start, 100);
  assert.equal(animation.mesh.position.y, 0);
  assert.equal(animation.mesh.scale.z, 0.001);

  animation.mesh.position.y = 0.9;
  animation.mesh.scale.z = 1;
  replayRiseAnimations([animation], 250, false);
  assert.equal(animation.start, 250);
  assert.equal(animation.mesh.position.y, 0);
  assert.equal(animation.mesh.scale.z, 0.001);
});

test("a rise frame moves and grows a raised section from the floor", () => {
  const animation = {
    mesh: { position: { y: 0 }, scale: { z: 0.001 } },
    finalBottom: 0.9,
    start: 100,
    delay: 20,
    duration: 200,
  };

  applyRiseAnimationFrame(animation, 220);
  assert.equal(animation.mesh.position.y, 0.7875);
  assert.equal(animation.mesh.scale.z, 0.875);

  applyRiseAnimationFrame(animation, 320);
  assert.equal(animation.mesh.position.y, 0.9);
  assert.equal(animation.mesh.scale.z, 1);
});

test("reduced motion shows raised geometry at its final position immediately", () => {
  const animation = {
    mesh: { position: { y: 0 }, scale: { z: 0.001 } },
    finalBottom: 2.1,
    start: 10,
    delay: 30,
    duration: 1200,
  };

  replayRiseAnimations([animation], 300, true);

  assert.equal(animation.start, -930);
  assert.equal(animation.mesh.position.y, 2.1);
  assert.equal(animation.mesh.scale.z, 1);
});
