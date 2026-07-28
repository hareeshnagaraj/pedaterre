import { AddressSearch } from "@/components/AddressSearch";
import { DemoRedirect } from "@/components/DemoRedirect";
import { boroughNumber } from "@/lib/borough";
import { getCityStats } from "@/lib/publishedData";
import { formatAssessedValue } from "@/lib/share/cardModel";
import { SiteNav } from "@/components/SiteNav";

export const dynamic = "force-static";

export default async function Home() {
  const stats = await getCityStats();
  const featuredBlocks = stats.top25Taxable.slice(0, 2).map((pick) => ({
    ...pick,
    boro: boroughNumber(pick.borough)!,
  }));

  return (
    <main className="landing-page">
      <DemoRedirect />
      <SiteNav />

      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="eyebrow">NYC {stats.rollYear} FINAL ASSESSMENT ROLL</p>
        <h1 id="landing-title">See the money on your block.</h1>
        <p className="landing-deck">
          Look up a New York City address. We will pull its tax block, total
          the Department of Finance assessed market value, and draw the roll.
        </p>
        <AddressSearch />
        <p className="honesty-line">
          Assessed market value. Not a sale price, appraisal, or a market
          estimate.
        </p>
      </section>

      <section className="city-strip" aria-label="Citywide assessment summary">
        <div className="city-total">
          <span>Citywide assessed value</span>
          <strong>{formatAssessedValue(stats.totalMv)}</strong>
        </div>
        <div>
          <span>NYC tax lots on file</span>
          <strong>{stats.nLots.toLocaleString("en-US")}</strong>
        </div>
        <div>
          <span>Lots above $50M</span>
          <strong>{stats.clubLots.toLocaleString("en-US")}</strong>
        </div>
        <div>
          <span>Share of city assessed value</span>
          <strong>{(stats.clubShareOfMv * 100).toFixed(1)}%</strong>
        </div>
        <p>
          {stats.rollYear} · extract {stats.extractHash}
        </p>
      </section>

      <section className="featured-blocks" aria-labelledby="featured-title">
        <div>
          <h2 id="featured-title">Open a block with paperwork.</h2>
        </div>
        <div className="featured-links">
          {featuredBlocks.map((pick) => (
            <a
              href={`/b/${pick.boro}/${pick.block}`}
              key={`${pick.borough}-${pick.block}`}
            >
              <strong>{formatAssessedValue(pick.totalM * 1_000_000)}</strong>
              <span>
                {pick.addressHint || `${pick.borough} Block ${pick.block}`}
              </span>
              <span className="featured-owner">
                {pick.owner || "OWNER NOT LISTED"}
              </span>
              <small>
                {pick.borough} · BLOCK {pick.block}
              </small>
            </a>
          ))}
        </div>
      </section>

      <section className="sources-section" id="sources">
        <h2>Every number here is a sum of filed values.</h2>
        <p>
          Block totals are sums of lot-level assessed market value on the NYC
          Department of Finance final roll. Condo unit lots sharing a filed
          address are combined into property groups for the drawings; totals
          remain lot-exact. Placement is schematic and ordered by lot number.
        </p>
        <dl>
          <div>
            <dt>Block total</dt>
            <dd>Sum of assessed market value for tax lots on the block</dd>
          </div>
          <div>
            <dt>Largest group share</dt>
            <dd>Largest rendered property group divided by block total</dd>
          </div>
          <div>
            <dt>$50M club</dt>
            <dd>Raw tax lots above $50M, before condo grouping</dd>
          </div>
        </dl>
        <a
          className="source-link"
          href="https://www.nyc.gov/site/finance/property/property-assessments.page"
        >
          NYC Department of Finance property assessments
        </a>
      </section>

      <nav className="landing-register-links" aria-label="Site sections">
        <ul>
          <li>
            <a href="/top">
              Register
              <span>· {stats.nBlocks.toLocaleString("en-US")} blocks</span>
            </a>
          </li>
          <li>
            <a href="/map">
              Map
              <span>
                · {stats.nLocatedBlocks.toLocaleString("en-US")} located
              </span>
            </a>
          </li>
          <li>
            <a href="/game">
              Game
              <span>
                · {stats.nBlocks.toLocaleString("en-US")} blocks on roll
              </span>
            </a>
          </li>
          <li>
            <a href="/sources">
              Sources
              <span>· {stats.nLots.toLocaleString("en-US")} tax lots</span>
            </a>
          </li>
        </ul>
      </nav>
    </main>
  );
}
