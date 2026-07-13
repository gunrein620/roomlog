import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./tenant-payment-shell.module.css";

export function ResponsiveTenantPaymentShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.canvas}>
      <div className={styles.mobileBrand}>
        <Link href="/living">
          <span aria-hidden="true">←</span>
          집우집주 <b>WOOZU</b>
        </Link>
        <span>사는 집 · 관리비·납부</span>
      </div>
      <div className={styles.frame}>{children}</div>
    </div>
  );
}
