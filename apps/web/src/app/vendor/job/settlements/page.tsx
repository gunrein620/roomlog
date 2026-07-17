import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { listVendorSettlements } from "@/lib/vendor-workflow-api";
import { paymentStatusLabel } from "@/lib/vendor-workflow-presenter";
import {
  Body,
  DemoReadOnlyNotice,
  InfoRow,
  ScreenHeader,
  formatDateTime,
  mutedStyle,
  primaryLinkStyle,
} from "../_components";
import { DirectPaymentConfirmButton } from "./DirectPaymentConfirmButton";

export default async function Page() {
  const { data: rows, source } = await listVendorSettlements();

  return (
    <>
      <ScreenHeader title="정산 내역" />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {rows.length === 0 ? (
          <Card style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>아직 정산 내역이 없습니다.</div>
            <p style={{ ...mutedStyle, margin: 0 }}>
              완료 보고가 승인되면 지급 요청과 처리 상태가 이곳에 표시됩니다.
            </p>
          </Card>
        ) : rows.map((row) => {
          const directPending = row.paymentRequest?.status === "PENDING_APPROVAL"
            && row.paymentRequest.lastAttemptMode === "DIRECT";
          const directPaid = row.paymentRequest?.status === "DIRECT_PAID"
            && row.paymentRequest.lastAttemptMode === "DIRECT";
          return (
            <Card
              key={row.repairId}
              style={{ display: "flex", flexDirection: "column", gap: 9 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{row.jobTitle}</div>
                <Badge emphasis>
                  {row.paymentRequest
                    ? paymentStatusLabel(
                        row.paymentRequest.status,
                        row.paymentRequest.lastAttemptMode,
                      )
                    : "정산 정보 확인 중"}
                </Badge>
              </div>
              <InfoRow label="작업 완료" value={formatDateTime(row.completedAt)} />
              {row.approvedAmount !== undefined ? (
                <InfoRow label="승인된 금액" value={`${row.approvedAmount.toLocaleString()}원`} />
              ) : null}
              {row.requestedAt ? (
                <InfoRow label="정산 요청" value={formatDateTime(row.requestedAt)} />
              ) : null}
              {row.paymentRequest?.processedAt ? (
                <InfoRow label="처리 일시" value={formatDateTime(row.paymentRequest.processedAt)} />
              ) : null}
              <p style={{ ...mutedStyle, margin: 0 }}>
                {directPending
                  ? "세입자가 직접 지급했다고 요청했습니다. 실제 수령 후 확인해 주세요."
                  : directPaid
                    ? "직접결제 수령 확인이 기록되었습니다."
                    : "지급 방식과 승인 여부는 관리자 정책에 따라 처리되며, 최종 결과만 표시됩니다."}
              </p>
              {directPending && row.paymentRequest ? (
                <DirectPaymentConfirmButton paymentRequestId={row.paymentRequest.id} />
              ) : null}
              <Link
                href={withId(ROUTES["V-JOB-06"], row.repairId)}
                style={primaryLinkStyle}
              >
                작업 결과 보기
              </Link>
            </Card>
          );
        })}
      </Body>
    </>
  );
}
