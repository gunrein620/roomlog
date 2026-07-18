-- 2C 방문시간 재협의: VISIT_REQUIRED 견적도 REQUEST_REVISION/REJECT 검토를 받을 수 있는데
-- 기존 shape 제약이 해당 상태를 금지해 재협의 요청이 500으로 죽었다(브라우저 E2E에서 발견).
-- 코드 상태 머신(REVISION_REQUESTED·REJECTED에서 새 버전 제출 허용)과 제약을 일치시킨다.
ALTER TABLE "VendorEstimate" DROP CONSTRAINT "VendorEstimate_response_shape";
ALTER TABLE "VendorEstimate" ADD CONSTRAINT "VendorEstimate_response_shape" CHECK (
  "origin" = 'LEGACY_MIGRATION'
  OR (
    "origin" = 'LIVE'
    AND (
      (
        "responseType" = 'FIXED_ESTIMATE'
        AND "status" IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED')
        AND NULLIF(BTRIM("workDescription"), '') IS NOT NULL
        AND "totalAmount" IS NOT NULL
        AND "totalAmount" > 0
        AND "visitAvailableAt" IS NULL
        AND "declineReason" IS NULL
        AND (
          ("status" = 'DRAFT' AND "submittedAt" IS NULL)
          OR "status" = 'WITHDRAWN'
          OR ("status" NOT IN ('DRAFT', 'WITHDRAWN') AND "submittedAt" IS NOT NULL)
        )
      ) OR (
        "responseType" = 'VISIT_REQUIRED'
        AND "status" IN ('DRAFT', 'SUBMITTED', 'REVISION_REQUESTED', 'REJECTED', 'VISIT_SCHEDULED', 'WITHDRAWN', 'SUPERSEDED')
        AND "visitAvailableAt" IS NOT NULL
        AND NULLIF(BTRIM("workDescription"), '') IS NOT NULL
        AND "declineReason" IS NULL
        AND "totalAmount" IS NULL
        AND (
          ("status" = 'DRAFT' AND "submittedAt" IS NULL)
          OR "status" = 'WITHDRAWN'
          OR ("status" NOT IN ('DRAFT', 'WITHDRAWN') AND "submittedAt" IS NOT NULL)
        )
      ) OR (
        "responseType" = 'DECLINED'
        AND "status" IN ('DRAFT', 'DECLINED', 'WITHDRAWN')
        AND NULLIF(BTRIM("declineReason"), '') IS NOT NULL
        AND "visitAvailableAt" IS NULL
        AND "workDescription" IS NULL
        AND "totalAmount" IS NULL
        AND (
          ("status" = 'DRAFT' AND "submittedAt" IS NULL)
          OR "status" = 'WITHDRAWN'
          OR ("status" = 'DECLINED' AND "submittedAt" IS NOT NULL)
        )
      )
    )
  )
);
