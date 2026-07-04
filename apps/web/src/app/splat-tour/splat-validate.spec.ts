import assert from "node:assert/strict";
import test from "node:test";
import { validateSplatFile } from "./splat-validate";

test("rejects mesh PLY files with face elements", () => {
  const result = validateSplatFile(
    encodeHeader(`ply
format ascii 1.0
element vertex 4
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
element face 2
property list uchar int vertex_indices
end_header
`),
    "scaniverse-mesh.ply"
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "mesh-ply");
  assert.equal(result.stats?.vertexCount, 4);
  assert.match(result.reason, /mesh 모드/);
});

test("rejects xyz rgb point cloud PLY files without gaussian properties", () => {
  const result = validateSplatFile(
    encodeHeader(`ply
format binary_little_endian 1.0
element vertex 12
property float x
property float y
property float z
property uchar red
property uchar green
property uchar blue
end_header
`),
    "scaniverse-pointcloud.ply"
  );

  assert.equal(result.ok, false);
  assert.equal(result.kind, "pointcloud-ply");
  assert.equal(result.stats?.vertexCount, 12);
  assert.match(result.reason, /Gaussian 속성/);
});

test("accepts gaussian splat PLY files", () => {
  const result = validateSplatFile(
    encodeHeader(`ply
format binary_little_endian 1.0
element vertex 32
property float x
property float y
property float z
property float f_dc_0
property float f_dc_1
property float f_dc_2
property float opacity
property float scale_0
property float scale_1
property float scale_2
property float rot_0
property float rot_1
property float rot_2
property float rot_3
end_header
`),
    "scaniverse-splat.ply"
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "splat-ply");
  assert.equal(result.stats?.vertexCount, 32);
});

test("accepts gzip SPZ files", () => {
  const result = validateSplatFile(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer, "room.spz");

  assert.equal(result.ok, true);
  assert.equal(result.kind, "spz");
});

test("rejects extension and content mismatches", () => {
  const result = validateSplatFile(new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer, "room.ply");

  assert.equal(result.ok, false);
  assert.equal(result.kind, "spz");
  assert.match(result.reason, /\.spz/);
});

function encodeHeader(source: string): ArrayBuffer {
  return new TextEncoder().encode(source).buffer;
}
