import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api-url";
import { handleVendorActivationPreviewRequest } from "@/lib/vendor-activation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const store = await cookies();
  return handleVendorActivationPreviewRequest(request, {
    endpoint: apiUrl("/auth/vendor-activations/preview", { requestUrl: request.url }),
    cookieStore: {
      get: (name) => store.get(name),
      set: (name, value, options) => store.set(name, value, options),
      delete: (name) => store.delete(name)
    }
  });
}
