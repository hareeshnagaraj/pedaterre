import { AddressSearch } from "@/components/AddressSearch";
import { DemoRedirect } from "@/components/DemoRedirect";
import { boroughNumber } from "@/lib/borough";
import { getCityStats } from "@/lib/publishedData";

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
      <header className="landing-header">
        <a className="wordmark" href="/">
          pedaterre
        </a>
        <a className="header-link" href="#sources">
          Sources &amp; verification
        </a>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <p className="eyebrow">NYC FY2027 FINAL ASSESSMENT ROLL</p>
        <h1 id="landing-title">See the money on your block.</h1>
        <p className="landing-deck">
          Look up a New York City address. We will pull its tax block, total
          the Department of Finance assessed market value, and draw the roll.
        </p>
        <AddressSearch />
        <p className="honesty-line">
          Assessed market value. Not a sale price, appraisal, or Zestimate.
        </p>
      </section>

      <section className="featured-blocks" aria-labelledby="featured-title">
        <div>
          <p className="eyebrow">FROM THE LIVE ROLL</p>
          <h2 id="featured-title">Open a block with paperwork.</h2>
        </div>
        <div className="featured-links">
          {featuredBlocks.map((pick) => (
            <a
              href={`/b/${pick.boro}/${pick.block}`}
              key={`${pick.borough}-${pick.block}`}
            >
              <span>{pick.addressHint || `${pick.borough} Block ${pick.block}`}</span>
              <strong>
                {pick.borough} · BLOCK {pick.block}
              </strong>
            </a>
          ))}
        </div>
      </section>

      <section className="city-strip" aria-label="Citywide assessment summary">
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

      <section className="sources-section" id="sources">
        <p className="eyebrow">SOURCES &amp; VERIFICATION</p>
        <h2>Filed values, named plainly.</h2>
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

      <footer className="landing-footer">
        <a href="/map">Map of every located block</a>
        <a href="/top">Ranked list of every block</a>
      </footer>
    </main>
  );
}
