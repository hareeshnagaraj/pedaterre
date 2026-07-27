import type { Metadata } from "next";
import { CityMap } from "@/components/CityMap";
import { getCityStats } from "@/lib/publishedData";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "NYC tax blocks, mapped · pedaterre",
  description:
    "Every located NYC tax block plotted from the filed assessment roll and PLUTO.",
};

export default async function MapPage() {
  const stats = await getCityStats();

  return (
    <main className="map-page">
      <header className="site-header">
        <a className="wordmark" href="/">
          pedaterre
        </a>
        <a className="header-cta" href="/top">
          OPEN THE REGISTER
        </a>
      </header>

      <section className="map-heading" aria-labelledby="map-title">
        <div>
          <p className="eyebrow">{stats.rollYear} FINAL ASSESSMENT ROLL</p>
          <h1 id="map-title">THE CITY, BY TAX BLOCK</h1>
          <p>
            No basemap. Each square is a filed tax block, placed at its PLUTO
            centroid and sized by land area.
          </p>
        </div>
        <dl>
          <div>
            <dt>blocks on register</dt>
            <dd>{stats.nBlocks.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt>register</dt>
            <dd>
              {stats.rollYear} · {stats.extractHash}
            </dd>
          </div>
        </dl>
      </section>

      <CityMap registerCount={stats.nBlocks} />
    </main>
  );
}
