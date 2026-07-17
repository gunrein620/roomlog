export function boundsOverlap(first, second, padding = 0) {
  return !(
    first.right + padding <= second.left ||
    second.right + padding <= first.left ||
    first.bottom + padding <= second.top ||
    second.bottom + padding <= first.top
  );
}

const rotatedBounds = (center, width, height, angle) => {
  const cosine = Math.abs(Math.cos(angle));
  const sine = Math.abs(Math.sin(angle));
  const halfWidth = (width * cosine + height * sine) / 2;
  const halfHeight = (width * sine + height * cosine) / 2;
  return {
    left: center.x - halfWidth,
    top: center.y - halfHeight,
    right: center.x + halfWidth,
    bottom: center.y + halfHeight,
  };
};

export function layoutDimensionLabels(
  candidates,
  reservedBounds = [],
  { baseOffset = 14, laneStep = 20, collisionPadding = 2 } = {},
) {
  const occupied = reservedBounds.map(bounds => ({ ...bounds }));
  return candidates.map(candidate => {
    let lane = 0;
    let offset;
    let center;
    let bounds;
    do {
      offset = baseOffset + lane * laneStep;
      center = {
        x: candidate.anchor.x + candidate.normal.x * offset,
        y: candidate.anchor.y + candidate.normal.y * offset,
      };
      bounds = rotatedBounds(center, candidate.width, candidate.height, candidate.angle);
      lane += 1;
    } while (occupied.some(item => boundsOverlap(bounds, item, collisionPadding)));
    occupied.push(bounds);
    return { ...candidate, offset, center, bounds };
  });
}
