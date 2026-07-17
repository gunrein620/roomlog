ALTER TABLE "VendorPaymentRequest"
  ADD COLUMN "directPaidAt" TIMESTAMP(3),
  ADD COLUMN "directPaymentReference" TEXT;

ALTER TABLE "VendorPaymentRequest"
  ADD CONSTRAINT "VendorPaymentRequest_direct_payment_evidence_check"
  CHECK (
    ("status" = 'DIRECT_PAID' AND "directPaidAt" IS NOT NULL AND "directPaymentReference" IS NOT NULL)
    OR
    ("status" <> 'DIRECT_PAID')
  );
