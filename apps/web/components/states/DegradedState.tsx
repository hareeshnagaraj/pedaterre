"use client";

import { createRef, type Ref } from "react";
import { StateFrame } from "./StateFrame";
import styles from "./states.module.css";

export const focusRef = createRef<HTMLHeadingElement>();

export interface DegradedGroup {
  lot: number | string;
  assessedValue: number;
  owner?: string;
  nLots?: number;
}

export interface DegradedStateProps {
  blockLabel: string;
  totalMv: number;
  rankLabel: string;
  groups: DegradedGroup[];
  focusTargetRef?: Ref<HTMLHeadingElement>;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function DegradedState({
  blockLabel,
  totalMv,
  rankLabel,
  groups,
  focusTargetRef = focusRef,
}: DegradedStateProps) {
  return (
    <StateFrame
      focusRef={focusTargetRef}
      title="CANVAS UNAVAILABLE — numeric roll shown"
    >
      <p className={styles.body}>
        The drawing surface did not initialize. The assessment figures remain
        available below.
      </p>
      <div className={styles.numericCard}>
        <p className={styles.numericLabel}>
          {blockLabel} · DOF ASSESSED MARKET VALUE
        </p>
        <p className={styles.numericValue}>{money(totalMv)}</p>
        <p className={styles.numericRank}>{rankLabel}</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>
            Property groups on {blockLabel}. Values are assessed market value,
            not sale price.
          </caption>
          <thead>
            <tr>
              <th scope="col">Lot or group</th>
              <th scope="col">Owner as filed</th>
              <th scope="col">Tax lots</th>
              <th scope="col">Assessed value</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={String(group.lot)}>
                <th scope="row">{group.lot}</th>
                <td>{group.owner || "Not listed"}</td>
                <td>{group.nLots ?? 1}</td>
                <td>{money(group.assessedValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StateFrame>
  );
}
