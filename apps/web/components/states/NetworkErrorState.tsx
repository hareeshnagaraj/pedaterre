"use client";

import { createRef, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface NetworkErrorStateProps {
  context: string;
  onRetry?: () => void;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function NetworkErrorState({
  context,
  onRetry,
  focusTargetRef = focusRef,
}: NetworkErrorStateProps) {
  return (
    <StateFrame
      focusRef={focusTargetRef}
      eyebrow="CONNECTION NOTICE"
      title="ROLL REQUEST INTERRUPTED"
      role="alert"
      live="assertive"
    >
      <p className={styles.context}>
        <span className={styles.contextLabel}>REQUEST KEPT</span>
        {context}
      </p>
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          type="button"
          onClick={onRetry}
        >
          RETRY
        </button>
      </div>
    </StateFrame>
  );
}
