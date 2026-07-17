# Wall Mask Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply resolution-correct wall cleanup before review and 3D composition.

**Architecture:** Add one pure OpenCV cleanup function beside the MitUNet polygon conversion and call it immediately after binary thresholding. Split wall polygon constants from opening constants so stronger wall cleanup cannot erase thin door/window geometry.

**Tech Stack:** Python, NumPy, OpenCV, unittest, FastAPI, Playwright.

## Global Constraints

- Inference canvas remains `1024 x 1024`.
- Remove wall components smaller than `120 px2`.
- Use wall closing kernel `5 x 5` and polygon epsilon `3 px`.
- Do not modify model weights, datasets, or Git history.

---

### Task 1: Test Wall Cleanup

**Files:**
- Modify: `tests/test_mitunet_polygons.py`
- Modify: `src/buildingcv/mitunet_polygons.py`

**Interfaces:**
- Produces: `clean_wall_mask(mask: np.ndarray) -> np.ndarray`.

- [x] Write tests for binary normalization, small-component removal, three-pixel gap closing, and preservation of a wide opening.
- [x] Run `python -m unittest tests.test_mitunet_polygons -v` and verify failure because the cleanup function is missing.
- [x] Implement connected-component filtering followed by rectangular morphological closing.
- [x] Run the focused tests and verify they pass.

### Task 2: Wire Cleanup Into Inference

**Files:**
- Modify: `src/buildingcv/mitunet.py`
- Modify: `src/buildingcv/mitunet_polygons.py`
- Test: `tests/test_mitunet_polygons.py`

**Interfaces:**
- Consumes: `clean_wall_mask(mask)`.
- Produces: a cleaned wall mask from `MitUNetPolygonExtractor.predict_mask()`.

- [x] Add an integration assertion that inference returns the cleaned mask after thresholding.
- [x] Run the focused test and verify the integration assertion fails.
- [x] Call the cleanup function before returning the predicted mask.
- [x] Split wall and opening polygon cleanup parameters and run focused tests.

### Task 3: Regression And Browser Verification

**Files:**
- Runtime artifacts only under `output/playwright/`.

**Interfaces:**
- Consumes: the existing `/extract-image` and `/compose-edits` APIs.
- Produces: verified review and 3D screenshots.

- [x] Run all JavaScript and Python tests.
- [x] Restart the local server so it loads the changed Python modules.
- [x] Upload the existing demo image and confirm review and 3D views work without browser errors.
- [x] Record cleanup pixel statistics and capture screenshots.
