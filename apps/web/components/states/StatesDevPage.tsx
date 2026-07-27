"use client";

import { BlockMissingState } from "./BlockMissingState";
import { DegradedState } from "./DegradedState";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { NetworkErrorState } from "./NetworkErrorState";
import { PartialNotice } from "./PartialNotice";
import { SearchErrorState } from "./SearchErrorState";
import styles from "./states.module.css";
import { stateTokenStyle } from "./stateTokens";

export default function StatesDevPage() {
  return (
    <main className={styles.devPage} style={stateTokenStyle}>
      <header className={styles.devPageHeader}>
        <h1>State system</h1>
        <p>Development inventory for all seven result-shell states.</p>
      </header>

      <LoadingState submittedAddress="200 E 66th St, New York, NY" />
      <EmptyState query="200 E 66 Stret" />
      <SearchErrorState query="200 E 66th St" />
      <BlockMissingState
        blockLabel="Queens · Block 99999"
        demoLinks={[
          { href: "/b/MN/1111", label: "CENTRAL PARK" },
          { href: "/b/SI/245", label: "STATEN ISLAND 245" },
        ]}
      />
      <NetworkErrorState context="Manhattan · Block 1398" />
      <PartialNotice />
      <DegradedState
        blockLabel="Manhattan · Block 1398"
        totalMv={593_156_996}
        rankLabel="Top 4% of NYC blocks"
        groups={[
          { lot: 1001, assessedValue: 105_809_000, nLots: 196 },
          { lot: 60, assessedValue: 43_170_000, owner: "136 E 64 ST CORP" },
          { lot: 1301, assessedValue: 39_072_000, nLots: 3 },
        ]}
      />
    </main>
  );
}
