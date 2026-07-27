import { AddressSearch } from "@/components/AddressSearch";
import { DemoRedirect } from "@/components/DemoRedirect";
import { boroughNumber } from "@/lib/borough";
import { getCityStats } from "@/lib/publishedData";
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

      <nav className="landing-footer" aria-label="Site sections">
        <a href="/top">
          <strong>CITY REGISTER</strong>
          <span>Every block, ranked as filed.</span>
        </a>
        <a href="/map">
          <strong>CITY MAP</strong>
          <span>The city drawn from its own roll.</span>
        </a>
        <a href="/game">
          <strong>THE ASSESSOR&apos;S GAME</strong>
          <span>Two blocks. Select the higher filing.</span>
        </a>
        <a href="/sources">
          <strong>SOURCES &amp; VERIFICATION</strong>
          <span>Every figure, defined and sourced.</span>
        </a>
      </nav>
    </main>
  );
}
