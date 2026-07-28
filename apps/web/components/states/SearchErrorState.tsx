"use client";

import { createRef, type FormEvent, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface SearchErrorStateProps {
  query: string;
  onRetry?: () => void;
  onSearch?: (query: string) => void;
  bblEntryHref?: string;
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

export function SearchErrorState({
  query,
  onRetry,
  onSearch,
  bblEntryHref = "/?mode=bbl",
  focusTargetRef = focusRef,
}: SearchErrorStateProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSearch?.(String(data.get("address") ?? ""));
  }

  return (
    <StateFrame
      focusRef={focusTargetRef}
      title="SEARCH UNAVAILABLE"
      role="alert"
      live="assertive"
    >
      <p className={styles.body}>
        The address desk did not return a record. The search remains open.
      </p>
      <form className={styles.searchForm} onSubmit={submit}>
        <input
          className={styles.searchInput}
          name="address"
          aria-label="NYC address"
          defaultValue={query}
          autoComplete="street-address"
        />
        <button className={`${styles.button} ${styles.primary}`} type="submit">
          SEARCH
        </button>
      </form>
      <div className={styles.actions}>
        <button className={styles.button} type="button" onClick={onRetry}>
          RETRY
        </button>
        <a className={styles.link} href={bblEntryHref}>
          ENTER A BBL
        </a>
      </div>
    </StateFrame>
  );
}
