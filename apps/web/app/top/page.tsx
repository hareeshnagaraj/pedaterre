import type { Metadata } from "next";
import { BlockRankList } from "@/components/BlockRankList";
import { boroughName } from "@/lib/borough";
import { getCityStats, getGhostStats } from "@/lib/publishedData";
import { formatAssessedValue } from "@/lib/share/cardModel";
import {
  empireStateEquivalents,
  formatSquareFeet,
} from "@/lib/viz/ghost";
import { SiteNav } from "@/components/SiteNav";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "All NYC tax blocks, ranked · pedaterre",
  description:
    "Every NYC tax block ranked by Department of Finance assessed market value.",
};

export default async function TopBlocksPage() {
  const [stats, ghostStats] = await Promise.all([
    getCityStats(),
    getGhostStats(),
  ]);
  const cityEmpireStates = empireStateEquivalents(
    ghostStats.citywide.capacitySqft,
    ghostStats.empireStateSqft,
  );

  return (
    <main className="top-page">
      <SiteNav current="/top" />

      <section className="top-heading" aria-labelledby="top-title">
        <div>
          <p className="eyebrow">{stats.rollYear} FINAL ASSESSMENT ROLL</p>
          <h1 id="top-title">
            ALL {stats.nBlocks.toLocaleString("en-US")} BLOCKS, RANKED
          </h1>
          <p>
            Every block on the filed roll, ordered by total assessed market
            value. PUBLIC marks blocks whose exempt value is at least half of
            assessed value.
          </p>
        </div>
        <dl>
          <div>
            <dt>citywide assessed value</dt>
            <dd>{formatAssessedValue(stats.totalMv)}</dd>
          </div>
          <div>
            <dt>register</dt>
            <dd>
              {stats.rollYear} · {stats.extractHash}
            </dd>
          </div>
        </dl>
      </section>

      <BlockRankList expectedCount={stats.nBlocks} />

      <section className="ghost-citywide" aria-labelledby="ghost-citywide-title">
        <header>
          <h2 id="ghost-citywide-title">
            {formatSquareFeet(ghostStats.citywide.capacitySqft)} UNBUILT
          </h2>
          <p>
            Equivalent to{" "}
            {cityEmpireStates.toLocaleString("en-US", {
              maximumFractionDigits: 0,
            })}{" "}
            Empire State Buildings by floor area. Capacity is not a
            construction forecast.
          </p>
        </header>

        <dl className="ghost-citywide-stats">
          <div>
            <dt>citywide unbuilt capacity</dt>
            <dd>{formatSquareFeet(ghostStats.citywide.capacitySqft)}</dd>
          </div>
          <div>
            <dt>Empire State equivalent</dt>
            <dd>
              {cityEmpireStates.toLocaleString("en-US", {
                maximumFractionDigits: 1,
              })}
            </dd>
          </div>
          {ghostStats.manhattanResidentialCapacitySqft != null ? (
            <div>
              <dt>Manhattan · residential only</dt>
              <dd>
                {formatSquareFeet(
                  ghostStats.manhattanResidentialCapacitySqft,
                )}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="ghost-rank">
          <h3>Blocks with the most unbuilt capacity</h3>
          <ol>
            {ghostStats.top50.slice(0, 10).map((block) => (
              <li key={`${block.b}-${block.k}`}>
                <a href={`/b/${block.b}/${block.k}`}>
                  <span>
                    {boroughName(block.borough)} · Block {block.k}
                  </span>
                  <strong>{formatSquareFeet(block.capacitySqft)}</strong>
                </a>
              </li>
            ))}
          </ol>
        </div>

        <p className="ghost-caveat">{ghostStats.caveat}</p>
      </section>

    </main>
  );
}
