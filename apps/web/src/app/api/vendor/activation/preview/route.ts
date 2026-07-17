import { apiUrl } from "@/lib/api-url";
import { handleVendorActivationPreviewRequest } from "@/lib/vendor-activation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleVendorActivationPreviewRequest(request, {
    endpoint: apiUrl("/auth/vendor-activations/preview", { requestUrl: request.url })
  });
}
