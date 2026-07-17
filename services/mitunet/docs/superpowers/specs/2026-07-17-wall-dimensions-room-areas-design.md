# Wall Dimensions And Room Areas Design

## Goal

After the user calibrates the drawing with two freely chosen points and a real-world length, make the 2D review overlay resemble a clean architectural measurement drawing:

- Keep every detected wall dimension visible.
- Draw dimensions with thin black lines instead of cyan lines.
- Prevent dense dimensions from becoming an unreadable pile.
- Calculate and display the usable area of each enclosed room in square metres.

This work is a derived 2D overlay only. It must not change the wall mask, opening data, polygon conversion, or 3D wall geometry.

## Reference Direction

The supplied reference image uses compact black dimension lines close to wall faces and places a simple area value near the visual centre of each room. The implementation follows that visual hierarchy without copying its editable corner handles, room-name labels, floor textures, or door graphics.

## User Flow

1. The user selects two arbitrary points with the Scale tool.
2. The user enters the real length between those points.
3. The editor calculates millimetres per image pixel.
4. All wall-face dimensions appear as thin black architectural dimension lines.
5. Enclosed room regions are calculated from the reviewed wall mask and opening footprints.
6. Each room of at least `1 m²` receives one area label such as `10.2 m²`.
7. Wall or opening edits refresh both overlays without changing the underlying recognition data.

Estimated scale from a detected door does not enable these measurements. The overlays appear only after explicit manual calibration, matching the existing wall-dimension behaviour.

## Wall Dimension Presentation

Every existing dimension segment remains present. No segment is removed because it is short, internal, external, or close to another label.

### Visual Style

- Main dimension line: near-black, approximately `1 px` in screen space.
- Extension lines: the same black with reduced opacity so they do not compete with the wall drawing.
- Arrowheads: smaller than the current cyan arrowheads and proportional to the visible segment length.
- Label: compact semibold system text, black on a small translucent white plate.
- Units remain millimetres to match the reference and the existing formatter.
- Line width, arrow size, text size, and plate padding remain stable while zooming.

### Collision-Aware Lanes

The renderer assigns dimension labels to screen-space lanes rather than drawing every label at the same fixed offset.

1. Start with the closest preferred offset from the wall.
2. Test the proposed label plate against plates already accepted in the current frame.
3. If the plates overlap, move that dimension to the next outward lane.
4. Continue through a small deterministic set of offsets, extending by the same interval when required.
5. Keep the full line and label visible; collision handling never hides a measurement.

Segments are processed in a stable order so panning, zooming, and rerendering do not make labels jump unpredictably. Only label plates drive lane changes; crossing extension lines are allowed because forcing every line into a unique lane would spread the overlay too far from the plan.

## Room Region Calculation

The current response has wall, door, and window recognition data but no authoritative room polygons. Room areas will therefore be derived locally from the same reviewed 2D state used by the overlay.

### Temporary Barrier Mask

Build a temporary raster barrier from:

- the current reviewed wall mask;
- valid door footprints;
- valid window footprints.

Door and window footprints are filled only in this temporary mask so openings do not connect adjacent rooms or leak to the exterior during area classification. A very small gap-closing operation may be applied to the temporary barrier to bridge raster seams. The current wall mask and opening objects remain untouched.

### Region Extraction

1. Flood-fill empty pixels from the canvas border to classify the exterior.
2. Find connected components among the remaining non-barrier, non-exterior pixels.
3. Convert each component's pixel count with the manual calibration:

   `areaM2 = pixelCount * millimetersPerPixel² / 1,000,000`

4. Discard components smaller than `1 m²` to avoid labels for shafts, raster gaps, and tiny accidental enclosures.
5. Keep balconies and utility rooms when they form a valid enclosed component of at least `1 m²`.

The area represents interior floor pixels bounded by the recognised wall/opening barrier. Wall thickness is not included.

## Room Area Labels

- Display one label per accepted room region.
- Format to one decimal place, for example `10.2 m²`.
- Place the label at an interior point near the component centroid.
- If the centroid falls outside a concave region, choose the component pixel nearest to that centroid.
- Use a compact black label with a subtle translucent white backing so it stays readable over the source drawing.
- Area labels participate in collision avoidance against dimension labels. They stay in the room and move only a small amount; dimension labels move outward when the two compete.

Room names are not inferred because the current model does not provide reliable semantic room labels. The overlay displays area only.

## State And Refresh Rules

The editor stores derived `wallDimensionSegments` and derived room-region measurements separately from the review document.

Recalculate room regions when:

- manual calibration is applied or cleared;
- the wall mask changes;
- a door or window is added, removed, moved, resized, validated, or changes type;
- the review document is reset.

Panning and zooming reuse the same image-space regions and only recompute screen-space label placement.

## Failure Behaviour

- No manual calibration: show neither wall lengths nor room areas.
- Open exterior boundary: do not label the leaked region as a room.
- Missing or invalid opening footprint: do not invent a barrier from confidence alone.
- No enclosed component of at least `1 m²`: keep the editor usable and show no area labels.
- Bad numeric calibration: skip measurement overlays rather than drawing misleading values.

## Testing And Verification

- Unit-test square and rectangular room area conversion at a known calibration.
- Unit-test multiple rooms separated by a door barrier.
- Unit-test exterior flood-fill rejection and the `1 m²` minimum.
- Unit-test centroid fallback for a concave room.
- Unit-test deterministic dimension-lane assignment and non-overlapping label plates.
- Verify all input dimension segments still produce labels.
- Viewer-shell test the black dimension style and room-area rendering hook.
- Visually verify the supplied apartment drawing at several zoom levels.
- Confirm 2D edits, 3D generation, and return to 2D preserve the overlays without altering wall geometry.

## Out Of Scope

- Changing wall recognition, wall post-processing, or wall polygon extraction.
- Changing door or window alignment.
- Adding wall geometry above doors or windows.
- Persisting room polygons or area labels in the database.
- Displaying room-area labels inside the 3D view.
- Inferring room names such as bedroom, bathroom, or living room.
