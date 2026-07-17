import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api-url";
import { handleVendorActivationClaimRequest } from "@/lib/vendor-activation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const store = await cookies();
  return handleVendorActivationClaimRequest(request, {
    endpoint: apiUrl("/auth/vendor-activations/claim", { requestUrl: request.url }),
    cookieStore: {
      get: (name) => store.get(name)
    }
  });
}
