"use client";

import { createRef, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface EmptyStateProps {
  query: string;
  bblEntryHref?: string;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function EmptyState({
  query,
  bblEntryHref = "/?mode=bbl",
  focusTargetRef = focusRef,
}: EmptyStateProps) {
  return (
    <StateFrame
      focusRef={focusTargetRef}
      eyebrow="SEARCH NOTICE"
      title="NO NYC ADDRESS MATCH"
    >
      <p className={styles.query}>
        <span className={styles.queryLabel}>QUERY ON FILE</span>
        {query}
      </p>
      <p className={styles.body}>
        No borough and block were assigned. Check the address or enter the BBL
        directly.
      </p>
      <div className={styles.actions}>
        <a className={`${styles.link} ${styles.primary}`} href={bblEntryHref}>
          ENTER A BBL
        </a>
      </div>
    </StateFrame>
  );
}
