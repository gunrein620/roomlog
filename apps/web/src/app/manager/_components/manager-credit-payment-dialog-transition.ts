export function launchTossPaymentOutsideDialog(
  requestPayment: () => Promise<void>,
  closeDialog: () => void,
): Promise<void> {
  const pendingPayment = requestPayment();
  closeDialog();
  return pendingPayment;
}
