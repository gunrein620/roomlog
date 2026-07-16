import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";
import { TenantRepairPaymentCheckout } from "./TenantRepairPaymentCheckout";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TenantRepairPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentRequestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("TENANT");
  const { paymentRequestId } = await params;
  const query = await searchParams;

  return (
    <PhoneFrame
      label={<span>사는 집 · 수리비 결제</span>}
      homeHref="/living"
      fitViewport
    >
      <TenantRepairPaymentCheckout
        paymentRequestId={paymentRequestId}
        complaintId={first(query.complaintId) ?? ""}
        callbackMarker={first(query.repairPayment)}
      />
    </PhoneFrame>
  );
}
