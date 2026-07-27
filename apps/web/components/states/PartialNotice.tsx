"use client";

import { createRef, type Ref } from "react";
import styles from "./states.module.css";
import { stateTokenStyle } from "./stateTokens";

export const focusRef = createRef<HTMLHeadingElement>();

export interface PartialNoticeProps {
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function PartialNotice({
  focusTargetRef = focusRef,
}: PartialNoticeProps) {
  return (
    <aside
      className={styles.partial}
      style={stateTokenStyle}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <h2 ref={focusTargetRef} tabIndex={-1}>
        THE REQUESTED LOT IS NOT ON THIS ROLL — showing the full block
      </h2>
    </aside>
  );
}
