# Wall Mask Cleanup

## Goal

Clean MitUNet's binary wall prediction before it reaches the review editor, Roboflow opening alignment, or 3D polygon extraction.

## Behavior

- Convert every input to a strict `0/1` wall mask without changing its dimensions.
- Remove isolated connected components smaller than `120 px2` on the `1024 x 1024` inference canvas.
- Apply a `5 x 5` rectangular morphological close to bridge small wall gaps.
- Keep openings wider than the closing kernel intact.
- Use a `3 px` Douglas-Peucker tolerance and `120 px2` minimum wall polygon area at 1024 resolution.
- Keep door/window cleanup conservative at the existing `3 x 3`, `1.5 px`, and `4 px2` settings.
- Preserve model weights and source datasets; this is inference-time post-processing only.

## Data Flow

`MitUNet probability -> threshold -> clean_wall_mask -> Roboflow alignment -> review editor -> polygon extraction -> 3D`

The review editor and 3D composition receive the same cleaned wall mask so the reviewed colors match the generated geometry.

## Verification

- Unit tests prove that small islands disappear, short wall gaps close, and real openings remain.
- Existing opening alignment, review editing, and polygon tests remain green.
- A live sample confirms that the API returns a cleaned mask and the editor/3D flow still works.

