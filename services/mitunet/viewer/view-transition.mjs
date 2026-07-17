const COLLAPSED_SCALE = 0.001;

function finalBottomFor(animation) {
  if (!Number.isFinite(animation.finalBottom)) {
    animation.finalBottom = Number.isFinite(animation.mesh?.position?.y)
      ? animation.mesh.position.y
      : 0;
  }
  return animation.finalBottom;
}

export function applyRiseAnimationFrame(animation, now) {
  const delay = Number.isFinite(animation.delay) ? animation.delay : 0;
  const duration = Number.isFinite(animation.duration) && animation.duration > 0
    ? animation.duration
    : 1;
  const start = Number.isFinite(animation.start) ? animation.start : now;
  const t = Math.min(1, Math.max(0, (now - start - delay) / duration));
  const eased = 1 - Math.pow(1 - t, 3);

  animation.mesh.position.y = finalBottomFor(animation) * eased;
  animation.mesh.scale.z = Math.max(COLLAPSED_SCALE, eased);
}

export function replayRiseAnimations(animations, now, reducedMotion = false) {
  for (const animation of animations) {
    const finalBottom = finalBottomFor(animation);
    animation.start = reducedMotion
      ? now - (animation.delay ?? 0) - (animation.duration ?? 0)
      : now;
    animation.mesh.position.y = reducedMotion ? finalBottom : 0;
    animation.mesh.scale.z = reducedMotion ? 1 : COLLAPSED_SCALE;
  }
}
