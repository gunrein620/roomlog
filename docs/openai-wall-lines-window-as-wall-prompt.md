# OpenAI Wall Lines Prompt: Window As Wall

Use this prompt for direct wall centerline extraction from floor plan images.

## Policy

- Windows are treated as part of the wall. Continue the structural wall centerline through window symbols.
- Doors, entrance openings, and door swing areas are not walls. Split wall lines at visible door openings.
- Do not output door objects or window objects. Output only wall centerlines.
- Do not create wall lines from window frames, door leaves, door swing arcs, furniture, fixtures, stairs, hatching, tiles, text, watermarks, dimension lines, arrows, or UI chrome.
- Prefer missing a questionable short wall over creating false geometry from a symbol.

## Instructions

```text
You extract architectural floor-plan walls for a 2D/3D room modeling pipeline.
Return JSON only using the provided schema.

The original image size is {width}x{height} pixels. Coordinates must use this original pixel coordinate system, origin at top-left.

Output wall centerlines only:
- One line per structural wall segment.
- Merge thick wall graphics into one centerline.
- Merge double parallel wall lines into one centerline.
- Use the visual center of the wall mass.
- Prefer orthogonal horizontal/vertical segments.
- Split at corners, T-junctions, major room boundary turns, and visible door/entrance openings.

Window policy:
- Windows are treated as wall, not openings.
- Continue the structural wall centerline through window symbols.
- Ignore the thin frame/sash lines of the window itself.
- Do not output separate wall segments for the window frame.

Door/opening policy:
- Doors, entrance openings, and door swing arcs are not walls.
- Do not draw a wall line through a visible door opening.
- Split the wall at the two sides of the door opening if the wall continues on both sides.
- Ignore door leaves, door swing arcs, thresholds, and hinge graphics.

Exclude:
- furniture outlines
- bed/table/chair/sofa/cabinet/appliance symbols
- sink/toilet/bath/shower fixtures
- stairs and stair rails
- hatching, tile grids, stone patterns, floor textures
- dimension lines, arrows, extension lines, labels, text, watermarks
- app/browser/profile buttons or screenshot UI chrome

Length policy:
- If a printed dimension clearly applies to a wall or span, attach lengthMm and lengthText to that wall.
- If a printed dimension is an overall span across multiple wall segments, put it in dimensionTexts and scaleCandidates, but do not force it onto one wall unless the match is clear.
- If no printed dimension applies clearly, set lengthMm and lengthText to null.

Evidence policy:
- sourceEvidence must describe why the line is a wall:
  - thick-wall
  - double-line-wall
  - filled-wall-mass
  - room-boundary
  - window-bridged-wall
  - uncertain-wall
- Do not output a wall if the only evidence is:
  - door-arc
  - door-leaf
  - window-frame-only
  - furniture-outline
  - fixture-outline
  - dimension-line
  - texture-line
  - text-or-watermark

When unsure whether a thin line is a wall or a symbol, reject it. It is better to miss a small wall than to create false wall geometry.
```

## JSON Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["summary", "imageSize", "walls", "dimensionTexts", "scaleCandidates", "rejectionSummary", "warnings"],
  "properties": {
    "summary": { "type": "string" },
    "imageSize": {
      "type": "object",
      "additionalProperties": false,
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "number" },
        "height": { "type": "number" }
      }
    },
    "walls": {
      "type": "array",
      "maxItems": 90,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "role",
          "sourceEvidence",
          "openingPolicy",
          "start",
          "end",
          "confidence",
          "lengthMm",
          "lengthText",
          "dimensionEvidence",
          "notes"
        ],
        "properties": {
          "id": { "type": "string" },
          "role": { "type": "string", "enum": ["outer", "inner", "balcony", "wet-area", "unknown"] },
          "sourceEvidence": {
            "type": "string",
            "enum": ["thick-wall", "double-line-wall", "filled-wall-mass", "room-boundary", "window-bridged-wall", "uncertain-wall"]
          },
          "openingPolicy": { "type": "string", "enum": ["none", "door-gap-split", "window-bridged"] },
          "start": {
            "type": "object",
            "additionalProperties": false,
            "required": ["x", "y"],
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            }
          },
          "end": {
            "type": "object",
            "additionalProperties": false,
            "required": ["x", "y"],
            "properties": {
              "x": { "type": "number" },
              "y": { "type": "number" }
            }
          },
          "confidence": { "type": "number" },
          "lengthMm": { "type": ["number", "null"] },
          "lengthText": { "type": ["string", "null"] },
          "dimensionEvidence": { "type": ["string", "null"] },
          "notes": { "type": "string" }
        }
      }
    },
    "dimensionTexts": {
      "type": "array",
      "maxItems": 50,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["text", "valueMm", "appliesTo", "confidence"],
        "properties": {
          "text": { "type": "string" },
          "valueMm": { "type": ["number", "null"] },
          "appliesTo": { "type": "string" },
          "confidence": { "type": "number" }
        }
      }
    },
    "scaleCandidates": {
      "type": "array",
      "maxItems": 12,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["sourceText", "pixelLength", "realLengthMm", "pixelToMmRatio", "confidence"],
        "properties": {
          "sourceText": { "type": "string" },
          "pixelLength": { "type": "number" },
          "realLengthMm": { "type": "number" },
          "pixelToMmRatio": { "type": "number" },
          "confidence": { "type": "number" }
        }
      }
    },
    "rejectionSummary": {
      "type": "object",
      "additionalProperties": false,
      "required": ["doorSymbols", "windowFrameOnly", "furnitureOrFixtures", "dimensionOrText", "textureOrHatching", "uiChrome"],
      "properties": {
        "doorSymbols": { "type": "number" },
        "windowFrameOnly": { "type": "number" },
        "furnitureOrFixtures": { "type": "number" },
        "dimensionOrText": { "type": "number" },
        "textureOrHatching": { "type": "number" },
        "uiChrome": { "type": "number" }
      }
    },
    "warnings": {
      "type": "array",
      "maxItems": 20,
      "items": { "type": "string" }
    }
  }
}
```
