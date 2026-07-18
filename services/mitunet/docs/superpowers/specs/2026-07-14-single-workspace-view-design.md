# Single Workspace View Design

## Goal

Make `Show Original` and `Show 3D` feel like two modes of one continuous floor-plan workspace instead of separate screens.

## Layout

- Both the review canvas and Three.js canvas occupy the full viewport.
- The main control card stays fixed at the same top-left position in both modes.
- The review tools render as a floating palette over the plan instead of reserving horizontal canvas space.
- The tools are visible only in Original mode. Their appearance and disappearance must not resize or move the main control card.

## Transition

- Keep the current 3D camera glide and wall-rise animation.
- During `3D -> Original`, keep the Three.js canvas visible while the camera glides overhead, then crossfade to the review canvas.
- During `Original -> 3D`, crossfade to the Three.js canvas from the same full-viewport position, then replay the perspective glide and wall-rise animation.
- Do not use `hidden` to perform the visual handoff; use opacity and pointer-event state so the canvases can overlap during the transition.

## Interaction

- Only the active canvas receives pointer events.
- The review tool palette receives pointer events only in Original mode.
- Reduced-motion users receive an immediate mode switch without crossfade or camera tween.
- Existing extraction, editing, composition, and 3D geometry behavior remains unchanged.

## Verification

- Shell tests verify full-viewport overlapping canvases and stable floating controls.
- JavaScript tests continue to verify repeatable wall-rise behavior.
- Browser checks exercise upload, Original, 3D, and return-to-Original at desktop and mobile widths.

## Constraint

Do not create a Git commit for this change.
