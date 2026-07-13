"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import type { Bill, BillLineItemKind, BillLineItemStatus, PaymentReport } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";
import {
  selectPayableItems,
  togglePayableItem,
  type PayableItemSelection,
} from "@/lib/tenant-payment-items";
import styles from "../tenant-payment-pages.module.css";

// T-PAY-02 · 납부 신고 폼
// 자기신고는 실제 입금 확정이 아니며, 서버 액션을 통해 확인 중 큐로만 유입된다.

type ReportActionInput = {
  amount: number;
  depositorName?: string;
};

type PaymentOrderActionInput = {
  itemKinds: BillLineItemKind[];
};

type BillPaymentOrderResult = {
  billId: string;
  orderId: string;
  orderName: string;
  amount: number;
  itemKinds: BillLineItemKind[];
  customerKey: string;
  clientKey?: string;
};

type TossWidgets = {
  setAmount(input: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(input: { selector: string; variantKey?: string }): Promise<void>;
  renderAgreement(input: { selector: string; variantKey?: string }): Promise<void>;
  requestPayment(input: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
    customerName?: string;
  }): Promise<void>;
};

type TossPaymentWindow = {
  requestPayment(input: {
    method: "CARD";
    amount: { currency: "KRW"; value: number };
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
    customerName?: string;
    card?: { flowMode: "DEFAULT" };
  }): Promise<void>;
};

type TossPaymentsInstance = {
  widgets(input: { customerKey: string }): TossWidgets;
  payment(input: { customerKey: string }): TossPaymentWindow;
};

type TossPaymentMode = "widget" | "payment-window";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

function withBillId(route: string, billId?: string): string {
  return billId ? `${route}?id=${encodeURIComponent(billId)}` : route;
}

const itemKindLabel: Record<BillLineItemKind, string> = {
  rent: "월세",
  maintenance: "관리비",
  other: "기타",
};

const itemStatusLabel: Record<BillLineItemStatus, string> = {
  unpaid: "미수납",
  partial: "일부수납",
  paid: "수납완료",
};

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function tossPaymentMode(clientKey: string): TossPaymentMode {
  return clientKey.includes("_gck_") ? "widget" : "payment-window";
}

export function PaymentReportForm({
  bill,
  reportAction,
  paymentOrderAction,
}: {
  bill: Bill;
  reportAction: (dto: ReportActionInput) => Promise<PaymentReport>;
  paymentOrderAction: (dto: PaymentOrderActionInput) => Promise<BillPaymentOrderResult>;
}) {
  const initialSelection = useMemo(() => selectPayableItems(bill.items), [bill.items]);
  const [amount, setAmount] = useState(String(Math.max(bill.totalAmount - bill.paidAmount, 0)));
  const [depositorName, setDepositorName] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [etaHours, setEtaHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);
  const [itemSelection, setItemSelection] = useState<PayableItemSelection>(initialSelection);
  const [sdkReady, setSdkReady] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<BillPaymentOrderResult | null>(null);
  const [paymentMode, setPaymentMode] = useState<TossPaymentMode | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [renderingWidget, setRenderingWidget] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [requestingPayment, setRequestingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const paymentMethodSelector = "#roomlog-toss-payment-method";
  const agreementSelector = "#roomlog-toss-agreement";

  const account = bill.account;
  const paymentItems = itemSelection.items;
  const selectedKinds = itemSelection.selectedKinds;
  const selectedAmount = itemSelection.selectedAmount;

  useEffect(() => {
    setSdkReady(Boolean(window.TossPayments));
  }, []);

  useEffect(() => {
    if (!paymentOrder?.clientKey || paymentMode !== "widget") return;
    if (!sdkReady && !window.TossPayments) return;

    const clientKey = paymentOrder.clientKey;
    let canceled = false;
    const frame = window.requestAnimationFrame(async () => {
      const tossPayments = window.TossPayments;

      if (!tossPayments) {
        setPaymentMessage("Toss 결제위젯 SDK를 불러오지 못했습니다.");
        return;
      }

      setRenderingWidget(true);
      setWidgetReady(false);
      widgetsRef.current = null;

      try {
        const widgets = tossPayments(clientKey).widgets({
          customerKey: paymentOrder.customerKey,
        });

        await widgets.setAmount({ currency: "KRW", value: paymentOrder.amount });
        await Promise.all([
          widgets.renderPaymentMethods({
            selector: paymentMethodSelector,
            variantKey: "DEFAULT",
          }),
          widgets.renderAgreement({
            selector: agreementSelector,
            variantKey: "AGREEMENT",
          }),
        ]);

        if (!canceled) {
          widgetsRef.current = widgets;
          setWidgetReady(true);
          setPaymentMessage("결제수단을 선택한 뒤 Toss로 결제할 수 있어요.");
        }
      } catch (error) {
        if (!canceled) {
          setPaymentMessage(messageFromError(error, "결제위젯을 렌더링하지 못했습니다."));
        }
      } finally {
        if (!canceled) setRenderingWidget(false);
      }
    });

    return () => {
      canceled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [paymentMode, paymentOrder, sdkReady]);

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submitReport = async () => {
    if (submitting) return;

    setSubmitting(true);
    const normalizedDepositorName = depositorName.trim();
    const report = await reportAction({
      amount: Number(amount) || 0,
      ...(normalizedDepositorName ? { depositorName: normalizedDepositorName } : {}),
    });
    setEtaHours(report.etaHours);
    setSubmitted(true);
    setSubmitting(false);
  };

  const togglePaymentKind = (kind: BillLineItemKind) => {
    setItemSelection((current) => {
      widgetsRef.current = null;
      setPaymentOrder(null);
      setPaymentMode(null);
      setWidgetReady(false);
      setPaymentMessage(null);
      return togglePayableItem(current, kind);
    });
  };

  const preparePaymentWidget = async () => {
    if (preparingPayment || renderingWidget) return;
    if (selectedKinds.length === 0 || selectedAmount <= 0) {
      setPaymentMessage("결제할 미수납 항목을 선택해 주세요.");
      return;
    }

    setPreparingPayment(true);
    setPaymentOrder(null);
    setPaymentMode(null);
    setWidgetReady(false);
    setPaymentMessage(null);
    widgetsRef.current = null;

    try {
      const order = await paymentOrderAction({ itemKinds: selectedKinds });

      if (!order.clientKey) {
        setPaymentMessage("Toss 테스트 클라이언트 키가 필요합니다. NEXT_PUBLIC_TOSS_CLIENT_KEY를 설정해 주세요.");
        return;
      }

      const mode = tossPaymentMode(order.clientKey);
      setPaymentOrder(order);
      setPaymentMode(mode);

      if (mode === "payment-window") {
        setWidgetReady(true);
        setPaymentMessage("현재 키는 결제창 연동 키라 Toss 결제창으로 진행해요.");
      }
    } catch (error) {
      setPaymentMessage(messageFromError(error, "결제 주문을 만들지 못했습니다."));
    } finally {
      setPreparingPayment(false);
    }
  };

  const requestTossPayment = async () => {
    if (!paymentOrder || !paymentMode || requestingPayment) return;

    setRequestingPayment(true);
    setPaymentMessage(null);

    try {
      const billQuery = encodeURIComponent(bill.id);
      const successUrl = `${window.location.origin}/tenant/payment/success?billId=${billQuery}`;
      const failUrl = `${window.location.origin}/tenant/payment/fail?billId=${billQuery}`;

      if (paymentMode === "payment-window") {
        const tossPayments = window.TossPayments;

        if (!paymentOrder.clientKey || !tossPayments) {
          setPaymentMessage("Toss 결제 SDK를 불러오지 못했습니다.");
          setRequestingPayment(false);
          return;
        }

        await tossPayments(paymentOrder.clientKey).payment({
          customerKey: paymentOrder.customerKey,
        }).requestPayment({
          method: "CARD",
          amount: { currency: "KRW", value: paymentOrder.amount },
          orderId: paymentOrder.orderId,
          orderName: paymentOrder.orderName,
          successUrl,
          failUrl,
          customerName: "집우집주 임차인",
          card: { flowMode: "DEFAULT" },
        });
        return;
      }

      if (!widgetsRef.current) {
        setPaymentMessage("결제위젯을 먼저 불러와 주세요.");
        setRequestingPayment(false);
        return;
      }

      await widgetsRef.current.requestPayment({
        orderId: paymentOrder.orderId,
        orderName: paymentOrder.orderName,
        successUrl,
        failUrl,
        customerName: "집우집주 임차인",
      });
    } catch (error) {
      setPaymentMessage(messageFromError(error, "결제 요청이 취소되었거나 실패했습니다."));
      setRequestingPayment(false);
    }
  };

  // 신고 후 인-스크린: 접수·확인 중·ETA → 홈으로.
  if (submitted) {
    return (
      <>
        <header className={styles.pageHeader}>
          <span className={styles.headerSpacer} aria-hidden="true" />
          <h1 className={styles.pageTitle}>납부 신고 접수</h1>
          <span className={styles.headerSpacer} aria-hidden="true" />
        </header>
        <main className={`${styles.pageBody} ${styles.resultBody}`}>
          <div className={styles.resultIcon}>✓</div>
          <h2 className={styles.resultTitle}>납부 신고가 접수됐어요</h2>
          <p className={styles.resultMessage}>
            신고 금액 <b>{won(Number(amount) || 0)}</b> · 확인 중
            <br />
            관리자가 입금을 확인하면 상태가 <b>완료</b>로 바뀌어요.
            <br />
            보통 <b>{etaHours}시간 이내</b>에 반영돼요.
          </p>
          <Card className={styles.resultNotice}>
            확인 전까지는 수금 집계·미납 판정에서 제외돼요. 낸 사람이 독촉받지 않도록 보호해요.
          </Card>
        </main>
        <footer className={styles.pageFooter}>
          <Link className={styles.primaryAction} href={PAYMENT_ROUTES["T-PAY-00"]}>
            홈으로
          </Link>
        </footer>
      </>
    );
  }

  return (
    <>
      <Script
        src="https://js.tosspayments.com/v2/standard"
        strategy="afterInteractive"
        onLoad={() => setSdkReady(true)}
        onError={() => setPaymentMessage("Toss 결제위젯 SDK를 불러오지 못했습니다.")}
      />
      <header className={styles.pageHeader}>
        <Link className={styles.backLink} href={withBillId(PAYMENT_ROUTES["T-PAY-01"], bill.id)}>
          ‹ 뒤로
        </Link>
        <h1 className={styles.pageTitle}>납부하기 · {bill.billingMonth}</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </header>

      <main className={styles.checkoutBody}>
        <div className={styles.checkoutGrid}>
          <div className={styles.checkoutMain}>
            <section aria-label="결제 항목">
              <h2 className={styles.sectionLabel}>결제 항목</h2>
              <Card className={styles.checkoutCard}>
                <div className={styles.paymentItemList}>
                  {paymentItems.map((item) => {
                    const unpaidAmount = Math.max(0, item.amount - item.paidAmount);
                    const selected = selectedKinds.includes(item.kind);

                    return (
                      <button
                        className={styles.paymentItem}
                        key={item.kind}
                        type="button"
                        aria-pressed={selected}
                        disabled={
                          unpaidAmount <= 0 ||
                          preparingPayment ||
                          renderingWidget ||
                          requestingPayment
                        }
                        onClick={() => togglePaymentKind(item.kind)}
                      >
                        <span className={styles.paymentItemCopy}>
                          <strong>{itemKindLabel[item.kind]}</strong>
                          <span>
                            {won(item.paidAmount)} / {won(item.amount)} 수납
                          </span>
                        </span>
                        <span className={styles.paymentItemAmount}>
                          <strong>{won(unpaidAmount)}</strong>
                          <Badge emphasis>{itemStatusLabel[item.status]}</Badge>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className={styles.selectionSummary}>
                  <span>선택 금액</span>
                  <strong>{won(selectedAmount)}</strong>
                </div>
              </Card>
            </section>

            <section aria-label="Toss 테스트 결제">
              <h2 className={styles.sectionLabel}>Toss 테스트 결제</h2>
              <Card className={styles.checkoutCard}>
                {paymentOrder && paymentMode === "widget" ? (
                  <>
                    <div className={styles.widgetRegion} id="roomlog-toss-payment-method" />
                    <div className={styles.widgetRegion} id="roomlog-toss-agreement" />
                  </>
                ) : null}
                {!paymentOrder ? (
                  <p className={styles.fieldHint}>
                    결제 요약에서 Toss 결제를 준비하면 결제수단과 약관이 여기에 표시돼요.
                  </p>
                ) : null}
                {paymentMessage ? <p className={styles.paymentMessage}>{paymentMessage}</p> : null}
              </Card>
            </section>

          </div>

          <aside className={styles.checkoutSummary} aria-label="결제 요약">
            <Card className={styles.checkoutSummaryCard}>
              <h2 className={styles.checkoutSummaryTitle}>결제 요약</h2>
              <strong className={styles.checkoutSummaryAmount}>{won(selectedAmount)}</strong>
              <dl className={styles.checkoutSummaryDetails}>
                <dt>청구월</dt>
                <dd>{bill.billingMonth}</dd>
                <dt>선택 항목</dt>
                <dd>
                  {selectedKinds.length > 0
                    ? selectedKinds.map((kind) => itemKindLabel[kind]).join(", ")
                    : "선택 없음"}
                </dd>
                <dt>납부 기한</dt>
                <dd>{bill.dueDate.slice(0, 10)}</dd>
                <dt>입금 계좌</dt>
                <dd>{account.bankName} {account.accountNumber}</dd>
              </dl>
              {paymentOrder ? (
                <Button
                  type="button"
                  fullWidth
                  onClick={requestTossPayment}
                  disabled={!widgetReady || requestingPayment}
                >
                  {requestingPayment ? "Toss 결제 진행 중" : `${won(paymentOrder.amount)} 결제하기`}
                </Button>
              ) : (
                <Button
                  type="button"
                  fullWidth
                  onClick={preparePaymentWidget}
                  disabled={
                    selectedAmount <= 0 || preparingPayment || renderingWidget || requestingPayment
                  }
                >
                  {preparingPayment || renderingWidget ? "Toss 결제 준비 중" : "Toss 결제 준비하기"}
                </Button>
              )}
            </Card>
          </aside>

          <section className={styles.checkoutManual} aria-label="직접 이체 후 납부 신고">
            <h2 className={styles.sectionLabel}>직접 이체 후 납부 신고</h2>
            <Card className={styles.checkoutCard}>
              <div className={styles.manualFields}>
                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>납부 금액</span>
                  <Input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="납부 금액 입력"
                  />
                  <span className={styles.fieldHint}>
                    일부 납부도 신고할 수 있어요. 전액: {won(bill.totalAmount)}
                  </span>
                </label>

                <div className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>입금 계좌</span>
                  <div className={styles.accountDetails}>
                    <div className={styles.accountRow}>
                      <span>{account.bankName}</span>
                      <strong>{account.accountNumber}</strong>
                    </div>
                    <div className={styles.accountRow}>
                      <span>예금주</span>
                      <strong>{account.accountHolder}</strong>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" fullWidth onClick={copyAccount}>
                    {copied ? "복사됐어요 ✓" : "계좌번호 복사"}
                  </Button>
                  <p className={styles.fieldHint}>
                    위 계좌로 직접 이체한 뒤 아래 <b>납부 신고</b>를 눌러 주세요. 자동 계좌연동은
                    준비 중이에요.
                  </p>
                </div>

                <label className={styles.fieldGroup}>
                  <span className={styles.fieldLabel}>입금자명 (선택)</span>
                  <Input
                    value={depositorName}
                    onChange={(event) => setDepositorName(event.target.value)}
                    placeholder="본인 명의와 다르면 입금자명 입력"
                  />
                  <span className={styles.fieldHint}>
                    부모님 등 다른 명의로 이체했다면 입금자명을 알려 주세요. 매칭이 빨라져요.
                  </span>
                </label>

                <Button type="button" fullWidth onClick={submitReport} disabled={submitting}>
                  {submitting ? "신고 접수 중" : "납부 신고"}
                </Button>
              </div>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
