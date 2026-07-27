"use client";

import type { ReactNode, Ref } from "react";
import styles from "./states.module.css";
import { stateTokenStyle } from "./stateTokens";

interface StateFrameProps {
  focusRef: Ref<HTMLHeadingElement>;
  eyebrow: string;
  title: string;
  children?: ReactNode;
  role?: "status" | "alert";
  live?: "polite" | "assertive";
  busy?: boolean;
}

export function StateFrame({
  focusRef,
  eyebrow,
  title,
  children,
  role = "status",
  live = "polite",
  busy,
}: StateFrameProps) {
  return (
    <section
      className={styles.root}
      style={stateTokenStyle}
      role={role}
      aria-live={live}
      aria-atomic="true"
      aria-busy={busy}
    >
      <div className={styles.notice}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.title} ref={focusRef} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
