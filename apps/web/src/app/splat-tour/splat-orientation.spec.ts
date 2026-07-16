import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { PLY_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES, defaultRotationXDegreesForSrc } from "./splat-orientation";

describe("defaultRotationXDegreesForSrc — 포맷 기반 기본 rotX", () => {
  it(".spz는 이미 Y-up으로 구워지므로 회전 0", () => {
    assert.equal(defaultRotationXDegreesForSrc("/api/files/splat-reconstructed-abc-yup.spz"), 0);
    assert.equal(defaultRotationXDegreesForSrc("/samples/room.spz"), 0);
  });

  it(".ply는 Y-down으로 읽혀 180° 뒤집어야 Y-up", () => {
    assert.equal(defaultRotationXDegreesForSrc("/samples/home_clean.ply"), PLY_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES);
    assert.equal(PLY_Y_DOWN_TO_Y_UP_ROTATION_X_DEGREES, 180);
  });

  it("대소문자·query·hash가 붙어도 .ply를 인식", () => {
    assert.equal(defaultRotationXDegreesForSrc("/a/B.PLY"), 180);
    assert.equal(defaultRotationXDegreesForSrc("http://h/x.ply?v=2"), 180);
    assert.equal(defaultRotationXDegreesForSrc("http://h/x.ply#frag"), 180);
  });

  it("확장자 없거나 다른 포맷은 0(.spz 기본과 동일)", () => {
    assert.equal(defaultRotationXDegreesForSrc("/no-extension"), 0);
    assert.equal(defaultRotationXDegreesForSrc("/x.splat"), 0);
    // 'ply'가 경로 중간에 있을 뿐 확장자가 아니면 180이 아니다.
    assert.equal(defaultRotationXDegreesForSrc("/ply-room/model.spz"), 0);
  });
});
