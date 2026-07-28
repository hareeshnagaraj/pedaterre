"use client";

import { createRef, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface DemoLink {
  href: string;
  label: string;
}

export interface BlockMissingStateProps {
  blockLabel: string;
  rollYear: string;
  newSearchHref?: string;
  demoLinks: DemoLink[];
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function BlockMissingState({
  blockLabel,
  rollYear,
  newSearchHref = "/",
  demoLinks,
  focusTargetRef = focusRef,
}: BlockMissingStateProps) {
  return (
    <StateFrame
      focusRef={focusTargetRef}
      title={`NO PARCEL ON FILE — this block is not in the ${rollYear} roll`}
      role="alert"
      live="assertive"
    >
      <p className={styles.context}>
        <span className={styles.contextLabel}>BLOCK REQUESTED</span>
        {blockLabel}
      </p>
      <div className={styles.actions}>
        <a className={`${styles.link} ${styles.primary}`} href={newSearchHref}>
          NEW SEARCH
        </a>
        {demoLinks.map((link) => (
          <a className={styles.link} href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </div>
    </StateFrame>
  );
}
