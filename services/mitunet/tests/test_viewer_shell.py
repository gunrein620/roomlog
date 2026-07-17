import unittest
from pathlib import Path


class ViewerShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (Path(__file__).parents[1] / "viewer" / "index.html").read_text(
            encoding="utf-8"
        )
        cls.editor = (
            Path(__file__).parents[1] / "viewer" / "review-editor.mjs"
        ).read_text(encoding="utf-8")

    def test_embeds_empty_favicon_to_avoid_browser_404(self):
        self.assertIn('<link rel="icon" href="data:,">', self.html)

    def test_review_and_3d_canvases_share_the_full_workspace(self):
        self.assertIn("canvas#scene,\n  #review-canvas {", self.html)
        self.assertIn("position: fixed;\n    inset: 0;", self.html)
        self.assertIn("width: 100%;\n    height: 100%;", self.html)
        self.assertNotIn("calc(var(--panel-width) + 40px)", self.html)
        self.assertNotIn("height: calc(58vh - 8px)", self.html)

    def test_editor_tools_are_a_separate_floating_palette(self):
        self.assertIn('<div id="control-stack">', self.html)
        self.assertIn('<aside id="editor-tools" hidden>', self.html)
        self.assertIn("#control-stack {", self.html)
        self.assertIn("body.view-original #editor-tools", self.html)

    def test_touch_navigation_controls_are_present(self):
        self.assertIn('data-tool="pan"', self.html)
        self.assertIn('id="zoom-out-btn"', self.html)
        self.assertIn('id="fit-view-btn"', self.html)
        self.assertIn('id="zoom-in-btn"', self.html)

    def test_scale_calibration_controls_are_present(self):
        self.assertIn('data-tool="scale"', self.html)
        self.assertIn('id="scale-length"', self.html)
        self.assertIn('id="apply-scale-btn"', self.html)
        self.assertIn('id="clear-scale-btn"', self.html)
        self.assertIn('id="scale-summary"', self.html)
        self.assertIn("Choose two points.", self.html)
        self.assertIn("First point selected. Choose the second point.", self.html)
        self.assertIn("Choose Scale, then click two points.", self.html)
        self.assertNotIn("wall corner", self.html.lower())

    def test_manual_measurements_use_black_dimensions_and_room_area_overlay(self):
        self.assertIn('from "./room-areas.mjs"', self.editor)
        self.assertNotIn('from "./measurement-layout.mjs"', self.editor)
        self.assertNotIn("dimensionLabelLayout(", self.editor)
        self.assertIn("const offset = 16;", self.editor)
        self.assertIn('strokeStyle = "#111827"', self.editor)
        self.assertIn('strokeStyle = "rgba(17, 24, 39, 0.4)"', self.editor)
        self.assertIn("context.strokeText(label, 0, 0)", self.editor)
        self.assertIn("refreshRoomAreas()", self.editor)
        self.assertIn("drawRoomAreaLabels(roomAreaLayout)", self.editor)
        self.assertIn("{ minimumAreaM2: 1 }", self.editor)

    def test_calibrated_plan_uses_real_world_scale_in_3d(self):
        self.assertIn("PHYSICAL_WALL_HEIGHT = 2.7", self.html)
        self.assertIn("calibration?.millimetersPerPixel", self.html)
        self.assertIn("millimetersPerPixel / 1000", self.html)

    def test_3d_status_reports_the_applied_real_world_plan_size(self):
        self.assertIn("function describePhysicalScale(data)", self.html)
        self.assertIn("1px=${millimetersPerPixel.toFixed(2)}mm", self.html)
        self.assertIn("${widthMeters.toFixed(2)}m × ${depthMeters.toFixed(2)}m", self.html)

    def test_json_save_is_available_only_for_a_composed_3d_plan(self):
        self.assertIn('id="save-json-btn"', self.html)
        self.assertIn('data-lucide="download"', self.html)
        self.assertIn('from "/viewer-assets/plan-export.mjs"', self.html)
        self.assertIn("saveJsonButton.hidden = !canSave", self.html)
        self.assertIn("downloadPlanJson(payload, filename)", self.html)

    def test_live_view_does_not_show_bundled_sample_buttons(self):
        self.assertNotIn('data-sample=', self.html)
        self.assertNotIn('Try a sample', self.html)
        self.assertIn('<div id="demo-controls" hidden>', self.html)
        self.assertIn('id="demo-select"', self.html)

    def test_view_switch_crossfades_overlapping_canvases(self):
        self.assertIn('from "/viewer-assets/view-transition.mjs"', self.html)
        self.assertIn("prefers-reduced-motion: reduce", self.html)
        self.assertNotIn("@keyframes view-enter", self.html)
        self.assertNotIn("restartEntranceAnimation", self.html)
        self.assertIn("function setCanvasViewState(view)", self.html)
        self.assertIn("async function transitionCanvasView(view)", self.html)
        self.assertNotIn("reviewCanvas.hidden =", self.html)
        self.assertNotIn("sceneCanvas.hidden =", self.html)

    def test_entering_3d_replays_existing_mesh_rise_without_recomposition(self):
        self.assertIn(
            "replayRiseAnimations(animations, performance.now(), reducedMotion)",
            self.html,
        )
        self.assertIn('await transitionCanvasView("3d")', self.html)

    def test_wall_and_window_sections_rise_from_floor_over_1200ms(self):
        self.assertIn(
            'import { applyRiseAnimationFrame, replayRiseAnimations } from "/viewer-assets/view-transition.mjs";',
            self.html,
        )
        self.assertIn("const RISE_DURATION_MS = 1200;", self.html)
        self.assertIn("applyRiseAnimationFrame(a, now);", self.html)
        self.assertIn("const finalBottom = mesh.position.y;", self.html)
        self.assertIn("mesh.position.y = 0;", self.html)
        self.assertIn("finalBottom,", self.html)

    def test_view_switch_reuses_the_original_camera_glide(self):
        self.assertIn("const CAMERA_TWEEN_MS = 600", self.html)
        self.assertIn("function overheadPosition(center, radius)", self.html)
        self.assertIn("const cameraTween = { active: false", self.html)
        self.assertIn(
            "camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased)",
            self.html,
        )
        self.assertIn("async function showOriginalView()", self.html)

    def test_original_glide_crossfades_after_reaching_overhead(self):
        self.assertIn("setPlanGeometryVisible(false)", self.html)
        self.assertIn(
            "await tweenCamera(overheadPosition(center, radius), center, CAMERA_TWEEN_MS)",
            self.html,
        )
        self.assertIn('await transitionCanvasView("original")', self.html)

    def test_window_glass_is_visible_and_has_a_frame_edge(self):
        self.assertIn("opacity: 0.72", self.html)
        self.assertIn("transmission: 0.12", self.html)
        self.assertIn(
            "windowSill, windowTop, windowMat, true",
            self.html,
        )

    def test_door_renders_as_an_open_passage_to_the_ceiling(self):
        self.assertNotIn("COLOR_DOOR", self.html)
        self.assertNotIn("doorMat", self.html)
        self.assertNotIn("function buildDoorwayHeaderWall(", self.html)
        self.assertNotIn("doorHeight, wallHeight, wallMat", self.html)

    def test_fixed_wall_threshold_is_not_shown_as_auto_selected(self):
        self.assertNotIn('data.wall_threshold', self.html)
        self.assertNotIn('wall threshold ${Number(data.wall_threshold).toFixed(2)}', self.html)

    def test_furnishing_stage_has_separate_controls_and_scene_groups(self):
        self.assertIn('id="furnish-btn"', self.html)
        self.assertIn('id="furniture-panel"', self.html)
        self.assertIn("const finishGroup = new THREE.Group()", self.html)
        self.assertIn("const furnitureGroup = new THREE.Group()", self.html)
        self.assertIn("function enterFurnishingStage()", self.html)
        self.assertIn("function leaveFurnishingStage()", self.html)

    def test_furnishing_stage_uses_generated_finishes_not_the_source_plan(self):
        self.assertIn('from "/viewer-assets/floor-finishes.mjs"', self.html)
        self.assertIn("child.userData.isInputImage", self.html)
        self.assertIn("inputImage.visible = !furnishing", self.html)
        self.assertIn("buildInteriorMask(", self.html)

    def test_walls_use_white_sides_and_black_caps(self):
        self.assertIn(
            "const wallCapMat = new THREE.MeshStandardMaterial({ color: COLOR_INK",
            self.html,
        )
        self.assertIn("[wallCapMat, wallSideMat]", self.html)

    def test_floor_finish_transform_matches_pointer_mask_coordinates(self):
        self.assertIn("texture.flipY = false", self.html)
        self.assertIn("(width / 2 - cx) * scale", self.html)
        self.assertIn("-(height / 2 - cy) * scale", self.html)
        self.assertIn("function pointIsInsideFinishedFloor(point)", self.html)
        self.assertIn("worldToMaskPixel(point, floorPlacementState)", self.html)

    def test_show_3d_leaves_furnishing_before_starting_a_transition(self):
        function_body = self.html.split(
            "async function showThreeDimensionalView()", 1
        )[1].split("// Retained for static demo JSON callers", 1)[0]
        self.assertIn('if (currentView === "furnishing") {', function_body)
        self.assertIn("leaveFurnishingStage();", function_body)
        self.assertLess(
            function_body.index("leaveFurnishingStage();"),
            function_body.index("inFlight = true"),
        )
        self.assertLess(
            function_body.index("leaveFurnishingStage();"),
            function_body.index('await transitionCanvasView("3d")'),
        )

    def test_viewer_loads_and_places_glb_furniture(self):
        self.assertIn('GLTFLoader', self.html)
        self.assertIn('FURNITURE_MANIFEST_URL', self.html)
        self.assertIn('const furnitureModelCache = new Map()', self.html)
        self.assertIn('const furnitureRaycaster = new THREE.Raycaster()', self.html)
        self.assertIn('function renderFurnitureCatalog()', self.html)
        self.assertIn('function beginFurniturePlacement(item)', self.html)
        self.assertIn('function confirmFurniturePlacement()', self.html)

    def test_furniture_gltf_loader_supports_draco_compressed_models(self):
        self.assertIn(
            'import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"',
            self.html,
        )
        self.assertIn("const dracoLoader = new DRACOLoader()", self.html)
        self.assertIn("dracoLoader.setDecoderPath(", self.html)
        self.assertIn("gltfLoader.setDRACOLoader(dracoLoader)", self.html)
        self.assertLess(
            self.html.index("gltfLoader.setDRACOLoader(dracoLoader)"),
            self.html.index("gltfLoader.loadAsync(item.modelUrl)"),
        )

    def test_furniture_catalog_is_korean_counted_and_truly_paginated(self):
        self.assertIn('const FURNITURE_PAGE_SIZE = 60', self.html)
        self.assertIn('let catalogOffset = 0', self.html)
        self.assertIn('filterFurnitureCatalog(', self.html)
        self.assertIn('catalogOffset + FURNITURE_PAGE_SIZE', self.html)
        self.assertIn('categoryCounts.set(item.category', self.html)
        self.assertIn('category === "all" ? "전체"', self.html)
        self.assertIn('.replace(/-?[a-z]?\\d{6,}$/i, "")', self.html)
        self.assertIn('id="furniture-prev-btn"', self.html)
        self.assertIn('id="furniture-next-btn"', self.html)
        self.assertIn('width × height × depth', self.html)
        self.assertNotIn('catalogLimit += 60', self.html)

    def test_furniture_cache_retries_and_clones_instance_materials(self):
        self.assertIn('furnitureModelCache.delete(item.modelUrl)', self.html)
        self.assertIn('Array.isArray(node.material)', self.html)
        self.assertIn('node.material.map(material => material.clone())', self.html)
        self.assertIn('previewMaterialState', self.html)
        self.assertIn('material.depthWrite = state.depthWrite', self.html)
        self.assertIn('material.color.copy(state.color)', self.html)
        self.assertIn('if (source) disposeFurnitureMaterials(source)', self.html)

    def test_furniture_scale_and_footprint_follow_floor_state(self):
        self.assertIn('hasPhysicalScale, furnitureSceneScale', self.html)
        self.assertIn('WALL_HEIGHT / PHYSICAL_WALL_HEIGHT', self.html)
        self.assertIn('function furnitureFootprintCorners(', self.html)
        self.assertIn('corners.every(pointIsInsideFinishedFloor)', self.html)

    def test_furniture_controls_are_drag_safe_and_resettable(self):
        self.assertIn('controls.enabled = !pendingFurniture', self.html)
        self.assertIn('controls.addEventListener("start"', self.html)
        self.assertIn('if (suppressCanvasClick)', self.html)
        self.assertIn('function cancelFurnitureInteraction(', self.html)
        self.assertIn('function resetFurniturePlacements(', self.html)
        self.assertIn('id="furniture-cancel-btn"', self.html)
        self.assertIn('id="furniture-reset-btn"', self.html)

    def test_furniture_controls_use_an_accessible_floating_icon_toolbar(self):
        self.assertIn('id="furniture-floating-toolbar"', self.html)
        self.assertIn('role="toolbar"', self.html)
        self.assertIn('aria-label="선택한 가구 조작"', self.html)
        for button_id in (
            "furniture-move-btn",
            "furniture-rotate-left-btn",
            "furniture-rotate-right-btn",
            "furniture-delete-btn",
            "furniture-cancel-btn",
            "furniture-confirm-btn",
        ):
            self.assertIn(f'id="{button_id}"', self.html)
        for icon_name in ("move", "rotate-ccw", "rotate-cw", "trash-2", "x", "check"):
            self.assertIn(f'data-lucide="{icon_name}"', self.html)
        self.assertNotIn('id="furniture-selection-actions"', self.html)
        self.assertNotIn('id="furniture-placement-actions"', self.html)

    def test_furniture_toolbar_tracks_the_active_three_object(self):
        self.assertIn("resolveFurnitureToolbarMode({", self.html)
        self.assertIn("positionFurnitureToolbar({", self.html)
        self.assertIn("function activeFurnitureToolbarObject()", self.html)
        self.assertIn("function updateFurnitureFloatingToolbarPosition()", self.html)
        self.assertIn("furnitureToolbarBounds.setFromObject(target)", self.html)
        self.assertIn("furnitureToolbarAnchor.project(camera)", self.html)
        self.assertIn("furnitureConfirmButton.disabled = !pendingFurniture?.valid", self.html)

    def test_furniture_can_be_rotated_deleted_and_exported(self):
        self.assertIn('selectedFurniture.rotation.y += rotationDelta', self.html)
        self.assertIn('furnitureGroup.remove(selectedFurniture)', self.html)
        self.assertIn('furnitures: currentFurniturePlacements()', self.html)
        self.assertIn('currentFurniturePlacements(),\n      );', self.html)
        self.assertIn('saveJsonButton.disabled = !canSave || inFlight || Boolean(pendingFurniture)', self.html)
        self.assertIn('connectRoomLogButton.disabled = !roomLogContext || !canSave || inFlight || Boolean(pendingFurniture)', self.html)

    def test_furniture_toolbar_requires_explicit_confirmation_and_supports_both_rotations(self):
        self.assertIn("function rotateSelectedFurniture(direction)", self.html)
        self.assertIn("const rotationDelta = direction * Math.PI / 2", self.html)
        self.assertIn(
            'furnitureRotateLeftButton.addEventListener("click", () => rotateSelectedFurniture(-1))',
            self.html,
        )
        self.assertIn(
            'furnitureRotateRightButton.addEventListener("click", () => rotateSelectedFurniture(1))',
            self.html,
        )
        self.assertIn(
            'furnitureConfirmButton.addEventListener("click", confirmFurniturePlacement)',
            self.html,
        )
        click_body = self.html.split(
            'sceneCanvas.addEventListener("click", event => {', 1
        )[1].split("});", 1)[0]
        self.assertIn("updateFurniturePreview(event, { force: true })", click_body)
        self.assertNotIn("confirmFurniturePlacement()", click_body)

    def test_furniture_floor_click_locks_preview_until_explicit_confirmation(self):
        self.assertIn("trackingPointer: true", self.html)
        self.assertIn(
            "function updateFurniturePreview(event, { force = false } = {})",
            self.html,
        )
        self.assertIn("shouldUpdateFurniturePreview({", self.html)
        click_body = self.html.split(
            'sceneCanvas.addEventListener("click", event => {', 1
        )[1].split("});", 1)[0]
        self.assertIn("updateFurniturePreview(event, { force: true })", click_body)
        self.assertIn("pendingFurniture.trackingPointer = false", click_body)
        self.assertNotIn("confirmFurniturePlacement()", click_body)


if __name__ == "__main__":
    unittest.main()
