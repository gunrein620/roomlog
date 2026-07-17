import type {
  TenantPartnerVendorSearchResult,
  TenantVendorConnectionPreview,
  TenantVendorConnectionRequestResult,
} from "@roomlog/types";
import { vendorTradeLabel } from "@roomlog/types";
import type { TenantIntakeResponsibilityHint } from "@/lib/tenant-intake-api";

export type TenantVendorConnectionState =
  | { step: "idle" }
  | { step: "searching" }
  | { step: "candidates"; search: TenantPartnerVendorSearchResult; error?: string }
  | { step: "preparing"; search: TenantPartnerVendorSearchResult }
  | {
      step: "preview";
      search: TenantPartnerVendorSearchResult;
      preview: TenantVendorConnectionPreview;
      error?: string;
    }
  | {
      step: "confirming";
      search: TenantPartnerVendorSearchResult;
      preview: TenantVendorConnectionPreview;
    }
  | { step: "requested"; result: TenantVendorConnectionRequestResult }
  | { step: "error"; message: string };

export type TenantVendorConnectionAction =
  | { type: "SEARCH_STARTED" }
  | { type: "SEARCH_SUCCEEDED"; result: TenantPartnerVendorSearchResult }
  | { type: "PREVIEW_STARTED" }
  | { type: "PREVIEW_SUCCEEDED"; preview: TenantVendorConnectionPreview }
  | { type: "CONFIRM_STARTED" }
  | { type: "CONFIRM_SUCCEEDED"; result: TenantVendorConnectionRequestResult }
  | { type: "FAILED"; message: string }
  | { type: "BACK_TO_CANDIDATES" }
  | { type: "RESET" };

export function initialTenantVendorConnectionState(): TenantVendorConnectionState {
  return { step: "idle" };
}

export function tenantVendorConnectionEligible(
  responsibilityHint?: TenantIntakeResponsibilityHint,
) {
  return responsibilityHint === "임차인 책임 가능성";
}

export function tenantVendorTradeLabel(trade: string) {
  return vendorTradeLabel(trade);
}

export function tenantVendorConnectionReducer(
  state: TenantVendorConnectionState,
  action: TenantVendorConnectionAction,
): TenantVendorConnectionState {
  switch (action.type) {
    case "SEARCH_STARTED":
      return { step: "searching" };
    case "SEARCH_SUCCEEDED":
      return state.step === "searching"
        ? { step: "candidates", search: action.result }
        : state;
    case "PREVIEW_STARTED":
      return state.step === "candidates"
        ? { step: "preparing", search: state.search }
        : state;
    case "PREVIEW_SUCCEEDED":
      return state.step === "preparing"
        ? { step: "preview", search: state.search, preview: action.preview }
        : state;
    case "CONFIRM_STARTED":
      return state.step === "preview"
        ? { step: "confirming", search: state.search, preview: state.preview }
        : state;
    case "CONFIRM_SUCCEEDED":
      return state.step === "confirming"
        ? { step: "requested", result: action.result }
        : state;
    case "FAILED":
      if (state.step === "confirming") {
        return {
          step: "preview",
          search: state.search,
          preview: state.preview,
          error: action.message,
        };
      }
      if (state.step === "preparing") {
        return { step: "candidates", search: state.search, error: action.message };
      }
      return { step: "error", message: action.message };
    case "BACK_TO_CANDIDATES":
      return state.step === "preview" || state.step === "confirming"
        ? { step: "candidates", search: state.search }
        : state;
    case "RESET":
      return initialTenantVendorConnectionState();
  }
}
