import { cloneFurniturePlacements } from "./furniture-placement.mjs";

const PROJECT_SCHEMA = "mitunet-floorplan-3d-project";

export function buildPlanExport(composedPlan, options = {}) {
  if (!composedPlan || typeof composedPlan !== "object") {
    throw new TypeError("A composed plan is required before saving");
  }
  if (!composedPlan.polygons || typeof composedPlan.polygons !== "object") {
    throw new TypeError("The composed plan has no polygon data");
  }

  const savedAt = options.savedAt ?? new Date().toISOString();
  const sourceName = String(options.sourceName ?? "").trim();
  const plan = JSON.parse(JSON.stringify(composedPlan));

  return {
    schema: PROJECT_SCHEMA,
    version: 1,
    saved_at: savedAt,
    source_name: sourceName,
    plan,
    furnitures: cloneFurniturePlacements(options.furnitures ?? []),
  };
}

export function planExportFilename(sourceName) {
  const leafName = String(sourceName ?? "").split(/[\\/]/).at(-1) ?? "";
  const baseName = leafName.replace(/\.[^.]+$/, "").trim();
  const safeName = baseName
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "floorplan"}-3d.json`;
}

export function downloadPlanJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
