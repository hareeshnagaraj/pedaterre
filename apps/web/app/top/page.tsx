import type { Metadata } from "next";
import { BlockRankList } from "@/components/BlockRankList";
import { getCityStats } from "@/lib/publishedData";
import { formatAssessedValue } from "@/lib/share/cardModel";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "All NYC tax blocks, ranked · pedaterre",
  description:
    "Every NYC tax block ranked by Department of Finance assessed market value.",
};

export default async function TopBlocksPage() {
  const stats = await getCityStats();

  return (
    <main className="top-page">
      <header className="site-header">
        <a className="wordmark" href="/">
          pedaterre
        </a>
        <a className="header-cta" href="/#lookup">
          LOOK UP YOUR BLOCK
        </a>
      </header>

      <section className="top-heading" aria-labelledby="top-title">
        <div>
          <p className="eyebrow">{stats.rollYear} FINAL ASSESSMENT ROLL</p>
          <h1 id="top-title">
            ALL {stats.nBlocks.toLocaleString("en-US")} BLOCKS, RANKED
          </h1>
          <p>
            Every block on the filed roll, ordered by total assessed market
            value. PUBLIC marks government and exempt-dominated blocks.
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
    </main>
  );
}
