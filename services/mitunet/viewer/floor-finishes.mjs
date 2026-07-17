function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonContains(x, y, polygon) {
  if (!pointInRing(x, y, polygon.outer ?? [])) return false;
  return !(polygon.holes ?? []).some(hole => pointInRing(x, y, hole));
}

function rasterize(polygons, width, height, blocked) {
  for (const polygon of polygons) {
    const xs = polygon.outer.map(([x]) => x);
    const ys = polygon.outer.map(([, y]) => y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (polygonContains(x + 0.5, y + 0.5, polygon)) blocked[y * width + x] = 1;
      }
    }
  }
}

function closeRasterGaps(mask, width, height, radius) {
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let blocked = false;
      for (let dy = -radius; dy <= radius && !blocked; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px]) {
            blocked = true;
            break;
          }
        }
      }
      dilated[y * width + x] = blocked ? 1 : 0;
    }
  }

  const closed = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let blocked = true;
      for (let dy = -radius; dy <= radius && blocked; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height || !dilated[py * width + px]) {
            blocked = false;
            break;
          }
        }
      }
      closed[y * width + x] = blocked ? 1 : 0;
    }
  }
  return closed;
}

// A doorway is a gap in the wall mask whether or not opening alignment accepted
// the detection, so a rejected door still leaks the flood fill into the rooms
// behind it. Sealing those gaps needs the detection footprint alone, not a
// wall-aligned one — but only when the detector was actually sure: the same
// confidence floor the server applies to doors keeps false positives from
// walling off genuinely open space.
const MIN_BARRIER_DOOR_CONFIDENCE = 0.6;

function rejectedDoorBarriers(openings) {
  return openings
    .filter(opening => (
      opening?.valid === false
      && opening.kind === "door"
      && Number(opening.confidence) >= MIN_BARRIER_DOOR_CONFIDENCE
      && Array.isArray(opening.mask_polygon)
      && opening.mask_polygon.length >= 3
    ))
    .map(opening => ({ outer: opening.mask_polygon, holes: [] }));
}

export function buildInteriorMask(polygons = {}, width, height, openings = []) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Interior mask dimensions must be positive integers");
  }
  const permanentSolid = new Uint8Array(width * height);
  rasterize([
    ...(polygons.wall ?? []),
    ...(polygons.window ?? []),
  ], width, height, permanentSolid);

  // Doors seal gaps only while classifying the enclosed region. They are open
  // passages in the rendered structure, so their pixels become floor again in
  // the final mask instead of leaving door-shaped holes in the wood finish.
  const floodBlocked = permanentSolid.slice();
  rasterize([
    ...(polygons.door ?? []),
    ...rejectedDoorBarriers(Array.isArray(openings) ? openings : []),
  ], width, height, floodBlocked);
  // Corrected polygon fragments can share vector endpoints while leaving a
  // narrow seam after pixel-center rasterization. Close only this temporary
  // flood barrier; the rendered geometry and final solid pixels stay exact.
  const floodBarrier = closeRasterGaps(floodBlocked, width, height, 2);

  const outside = new Uint8Array(width * height);
  const queue = [];
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (floodBarrier[index] || outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }

  const interior = new Uint8Array(width * height);
  for (let index = 0; index < interior.length; index += 1) {
    interior[index] = permanentSolid[index] || outside[index] ? 0 : 1;
  }
  return interior;
}

export function maskContains(mask, width, height, x, y) {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return false;
  return mask[py * width + px] === 1;
}

export function worldToMaskPixel(point, { scale, cx, cy }) {
  return {
    x: Math.round(point.x / scale + cx),
    y: Math.round(-point.z / scale + cy),
  };
}
