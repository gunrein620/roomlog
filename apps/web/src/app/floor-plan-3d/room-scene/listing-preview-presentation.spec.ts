import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx"),
  "utf8"
);
const landlordSource = readFileSync(join(process.cwd(), "src/app/my/flows/LandlordMyPage.tsx"), "utf8");
const listingTourSource = readFileSync(join(process.cwd(), "src/app/_components/ListingTourRoom3D.tsx"), "utf8");
const globalCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("listing-only 3D preview", () => {
  it("uses the same saved-plan presentation in registration and listing detail", () => {
    assert.match(landlordSource, /<FloorPlan3DPreview[\s\S]*?controlsEnabled[\s\S]*?fitDistanceScale=\{0\.9\}[\s\S]*?listingPreview[\s\S]*?previewFit/);
    assert.match(listingTourSource, /<RoomlogThreeFloorPlanView[\s\S]*?fitDistanceScale=\{0\.9\}[\s\S]*?listingPreview[\s\S]*?previewFit/);
    assert.doesNotMatch(listingTourSource, /cameraPosition=\{\[9, 7\.5, 11\]\}/);
    assert.doesNotMatch(listingTourSource, /sceneBackground=\{variant === "hero" \? null : undefined\}/);
    assert.doesNotMatch(listingTourSource, /furnitureVerticalScale=\{sceneHorizontalScale\}/);
    assert.doesNotMatch(listingTourSource, /horizontalScale=\{sceneHorizontalScale\}/);
    assert.match(viewerSource, /listingPreview\?: boolean/);
    assert.match(viewerSource, /<RoomCameraAutoFit bounds=\{wallBounds\} distanceScale=\{fitDistanceScale\} previewFit=\{previewFit\}/);
    assert.match(viewerSource, /showGround=\{!listingPreview\}/);
    assert.match(viewerSource, /enabled=\{controlsEnabled\}/);
    assert.match(viewerSource, /gl=\{\{ alpha: listingPreview \}\}/);
  });

  it("keeps the render background, rotates on drag, and opens the editor on a click", () => {
    assert.match(landlordSource, /const previewWasDraggedRef = useRef\(false\)/);
    assert.match(landlordSource, /function handlePreviewCardPointerMove\([\s\S]*?previewWasDraggedRef\.current = true/);
    assert.match(landlordSource, /function handlePreviewCardClick\(\)[\s\S]*?if \(previewWasDraggedRef\.current\) \{/);
    assert.match(landlordSource, /onClick=\{floorPlan3D \? handlePreviewCardClick : undefined\}/);
    assert.match(landlordSource, /onPointerMove=\{handlePreviewCardPointerMove\}/);
    assert.match(landlordSource, /onKeyDown=\{\(event\) => \{[\s\S]*?openMitunetEditor\(\)/);
    assert.match(viewerSource, /style=\{hasMitunetStyle \? \{/);
    assert.doesNotMatch(viewerSource, /hasMitunetStyle && !listingPreview/);
    assert.match(
      globalCss,
      /\.summary-media-3d\.is-listing-preview \.floor-plan-3d-preview\s*\{[\s\S]*?cursor: pointer/
    );
  });
});
