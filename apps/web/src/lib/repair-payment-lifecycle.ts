import type { RepairPaymentCheckout } from "@roomlog/types";

export type RepairPaymentLifecycleResult<T = void> = {
  status: "COMPLETED" | "BLOCKED" | "CLEANED" | "FAILED";
  cleanupUncertain: boolean;
  value?: T;
  error?: unknown;
  cleanupError?: unknown;
};

export type RepairPaymentLifecycleSnapshot = {
  checkout: RepairPaymentCheckout | null;
  busy: boolean;
  sdkFailed: boolean;
  cleanupUncertain: boolean;
  canPay: boolean;
  generation: number;
};

type CancelOrder = (checkout: RepairPaymentCheckout) => Promise<void>;
type Listener = (snapshot: RepairPaymentLifecycleSnapshot) => void;

type CleanupAttempt =
  | { status: "NONE" }
  | { status: "CLEANED" }
  | { status: "FAILED"; error: unknown };

/**
 * Owns the synchronous safety boundary for one repair-payment checkout session.
 * UI state may mirror this controller, but it must never replace the operation lock.
 */
export class RepairPaymentLifecycle {
  private checkoutValue: RepairPaymentCheckout | null = null;
  private sdkFailureLatch = false;
  private cleanupUncertainValue = false;
  private cleanupRequested = false;
  private paymentRequested = false;
  private generation = 0;
  private operationSequence = 0;
  private activeOperation: Promise<RepairPaymentLifecycleResult<unknown>> | null = null;
  private lastCleanupError: unknown;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly cancelOrder: CancelOrder) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  beginSession(): boolean {
    if (this.activeOperation || this.checkoutValue) return false;
    this.generation += 1;
    this.cleanupRequested = false;
    this.cleanupUncertainValue = false;
    this.paymentRequested = false;
    this.lastCleanupError = undefined;
    this.emit();
    return true;
  }

  markSdkLoaded(): void {
    this.sdkFailureLatch = false;
    if (!this.checkoutValue && !this.cleanupUncertainValue) {
      this.cleanupRequested = false;
    }
    this.emit();
  }

  getSnapshot(): RepairPaymentLifecycleSnapshot {
    const busy = this.activeOperation !== null;
    const checkout = this.checkoutValue;
    const canPay = Boolean(
      checkout
      && checkout.order.status === "READY"
      && !busy
      && !this.sdkFailureLatch
      && !this.cleanupRequested
      && !this.cleanupUncertainValue
      && !this.paymentRequested,
    );

    return {
      checkout,
      busy,
      sdkFailed: this.sdkFailureLatch,
      cleanupUncertain: this.cleanupUncertainValue,
      canPay,
      generation: this.generation,
    };
  }

  async beginCheckout(
    create: () => Promise<RepairPaymentCheckout>,
  ): Promise<RepairPaymentLifecycleResult<RepairPaymentCheckout>> {
    if (
      this.activeOperation
      || this.checkoutValue
      || this.sdkFailureLatch
      || this.cleanupUncertainValue
    ) {
      return this.blocked();
    }

    const operationGeneration = this.generation;
    return this.runExclusive(async () => {
      const created = await create();
      this.checkoutValue = created;

      if (operationGeneration !== this.generation || this.sdkFailureLatch) {
        this.cleanupRequested = true;
      }
      return created;
    }, false, operationGeneration);
  }

  async markSdkFailed(): Promise<RepairPaymentLifecycleResult> {
    this.sdkFailureLatch = true;
    if (this.activeOperation || this.checkoutValue) this.cleanupRequested = true;
    this.emit();

    if (this.activeOperation) {
      await this.activeOperation;
      return this.resultAfterCleanupWait();
    }
    if (!this.checkoutValue) {
      return { status: "COMPLETED", cleanupUncertain: false };
    }
    return this.runExclusive(async () => undefined, false, this.generation);
  }

  async renderCheckout(
    render: () => Promise<void>,
  ): Promise<RepairPaymentLifecycleResult> {
    if (!this.getSnapshot().canPay) return this.blocked();
    return this.runExclusive(render, true, this.generation);
  }

  async requestPayment(
    request: () => Promise<void>,
  ): Promise<RepairPaymentLifecycleResult> {
    if (!this.getSnapshot().canPay) return this.blocked();
    return this.runExclusive(async () => {
      await request();
      this.paymentRequested = true;
      this.emit();
    }, true, this.generation);
  }

  async requestCleanup(): Promise<RepairPaymentLifecycleResult> {
    if (this.checkoutValue || this.activeOperation || this.cleanupUncertainValue) {
      this.cleanupRequested = true;
      this.emit();
    }

    if (this.activeOperation) {
      await this.activeOperation;
      return this.resultAfterCleanupWait();
    }
    if (!this.checkoutValue) {
      this.cleanupRequested = false;
      this.emit();
      return { status: "CLEANED", cleanupUncertain: false };
    }
    return this.runExclusive(async () => undefined, false, this.generation);
  }

  private runExclusive<T>(
    work: () => Promise<T>,
    cleanupOnFailure: boolean,
    operationGeneration: number,
  ): Promise<RepairPaymentLifecycleResult<T>> {
    if (this.activeOperation) return Promise.resolve(this.blocked());

    const operationId = ++this.operationSequence;
    let promise!: Promise<RepairPaymentLifecycleResult<T>>;
    promise = (async () => {
      let value: T | undefined;
      let operationError: unknown;
      let operationFailed = false;

      try {
        value = await work();
      } catch (error) {
        operationFailed = true;
        operationError = error;
        if (cleanupOnFailure && this.checkoutValue) this.cleanupRequested = true;
      }

      if (operationGeneration !== this.generation && this.checkoutValue) {
        this.cleanupRequested = true;
      }

      const cleanup = await this.performRequestedCleanup();
      if (operationFailed) {
        return {
          status: "FAILED",
          cleanupUncertain: cleanup.status === "FAILED",
          error: operationError,
          ...(cleanup.status === "FAILED" ? { cleanupError: cleanup.error } : {}),
        };
      }
      if (cleanup.status === "FAILED") {
        return {
          status: "FAILED",
          cleanupUncertain: true,
          error: cleanup.error,
          cleanupError: cleanup.error,
        };
      }
      if (cleanup.status === "CLEANED") {
        return { status: "CLEANED", cleanupUncertain: false, value };
      }
      return { status: "COMPLETED", cleanupUncertain: false, value };
    })();

    this.activeOperation = promise as Promise<RepairPaymentLifecycleResult<unknown>>;
    this.emit();

    return promise.finally(() => {
      if (operationId === this.operationSequence && this.activeOperation === promise) {
        this.activeOperation = null;
        this.emit();
      }
    });
  }

  private async performRequestedCleanup(): Promise<CleanupAttempt> {
    if (!this.cleanupRequested) return { status: "NONE" };
    const checkout = this.checkoutValue;
    if (!checkout) {
      this.cleanupRequested = false;
      this.cleanupUncertainValue = false;
      this.lastCleanupError = undefined;
      this.emit();
      return { status: "NONE" };
    }

    try {
      if (checkout.order.status === "READY") await this.cancelOrder(checkout);
    } catch (error) {
      this.cleanupRequested = false;
      this.cleanupUncertainValue = true;
      this.lastCleanupError = error;
      this.emit();
      return { status: "FAILED", error };
    }

    this.checkoutValue = null;
    this.cleanupRequested = false;
    this.cleanupUncertainValue = false;
    this.paymentRequested = false;
    this.lastCleanupError = undefined;
    this.emit();
    return { status: "CLEANED" };
  }

  private resultAfterCleanupWait(): RepairPaymentLifecycleResult {
    if (this.cleanupUncertainValue) {
      return {
        status: "FAILED",
        cleanupUncertain: true,
        error: this.lastCleanupError,
        cleanupError: this.lastCleanupError,
      };
    }
    if (!this.checkoutValue) return { status: "CLEANED", cleanupUncertain: false };
    return this.blocked();
  }

  private blocked<T>(): RepairPaymentLifecycleResult<T> {
    return {
      status: "BLOCKED",
      cleanupUncertain: this.cleanupUncertainValue,
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
