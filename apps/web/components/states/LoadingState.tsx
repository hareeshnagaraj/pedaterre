"use client";

import { createRef, useEffect, useState, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface LoadingNumericFallback {
  totalMv: number;
  rankLabel: string;
}

export interface LoadingStateProps {
  submittedAddress: string;
  numericFallback?: LoadingNumericFallback;
  slowAfterMs?: number;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function LoadingState({
  submittedAddress,
  numericFallback,
  slowAfterMs = 4_000,
  focusTargetRef = focusRef,
}: LoadingStateProps) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), slowAfterMs);
    return () => window.clearTimeout(timer);
  }, [slowAfterMs]);

  return (
    <StateFrame
      focusRef={focusTargetRef}
      title="PULLING THE ROLL…"
      busy
    >
      <header className={styles.requestHeader}>
        <p className={styles.query}>
          <span className={styles.queryLabel}>ADDRESS ON FILE</span>
          {submittedAddress}
        </p>
      </header>
      {slow ? (
        <>
          <p className={styles.body}>
            ROLL STILL OPEN — posting the figures before the skyline.
          </p>
          {numericFallback ? (
            <div className={styles.numericCard}>
              <p className={styles.numericLabel}>
                PRELIMINARY ASSESSED MARKET VALUE
              </p>
              <p className={styles.numericValue}>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(numericFallback.totalMv)}
              </p>
              <p className={styles.numericRank}>{numericFallback.rankLabel}</p>
            </div>
          ) : null}
        </>
      ) : null}
      <div className={styles.actions}>
        <button className={styles.button} type="button" disabled>
          SEARCH SUBMITTED
        </button>
      </div>
    </StateFrame>
  );
}
