import Link from "next/link";
import type { BlockPayload } from "@/lib/schema";
import { BlockViz } from "./BlockViz";

const boroughNames: Record<string, string> = {
  MN: "Manhattan",
  BX: "Bronx",
  BK: "Brooklyn",
  QN: "Queens",
  SI: "Staten Island",
};

function money(value: number) {
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}B`;
  }
  if (value >= 100) return `$${Math.round(value)}M`;
  return `$${value.toFixed(value >= 10 ? 1 : 2)}M`;
}

export function FixtureView({ payload }: { payload: BlockPayload }) {
  const grouped = payload.nLots > payload.nGroups;
  const headerLine = grouped
    ? `${payload.nLots.toLocaleString()} tax lots · ${payload.nGroups.toLocaleString()} groups · condo lots combined`
    : `${payload.nLots.toLocaleString()} ${payload.nLots === 1 ? "tax lot" : "tax lots"} · ${payload.nGroups.toLocaleString()} ${payload.nGroups === 1 ? "group" : "groups"}`;

  return (
    <main className="result-page">
      <header className="site-header">
        <Link className="wordmark" href="/?demo=midtown-1398">
          pedaterre
        </Link>
        <span className="demo-badge">fixture · {payload.character}</span>
      </header>

      <section className="block-heading" aria-labelledby="block-title">
        <div>
          <p className="eyebrow">{boroughNames[payload.borough] ?? payload.borough}</p>
          <h1 id="block-title">Block {payload.block}</h1>
          <p className="group-summary">{headerLine}</p>
        </div>
        <dl className="headline-stats">
          <div>
            <dt>assessed market value</dt>
            <dd>{money(payload.totalM)}</dd>
          </div>
          <div>
            <dt>largest group share</dt>
            <dd>
              {payload.largestGroupShare == null
                ? "not applicable"
                : `${Math.round(payload.largestGroupShare * 100)}%`}
            </dd>
          </div>
        </dl>
      </section>

      <BlockViz payload={payload} />

      <footer className="result-footer">
        <p>
          Schematic placement, ordered by lot number, not a cadastral map.
          Heights and areas use DOF assessed market value, not a sale price.
        </p>
        <p>
          {payload.rollYear} final roll · extract {payload.extractHash} ·{" "}
          <Link href="/?demo=midtown-1398">open another fixture</Link>
        </p>
      </footer>
    </main>
  );
}
