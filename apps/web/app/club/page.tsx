import type { Metadata } from "next";
import { ClubLotList } from "@/components/ClubLotList";
import { SiteNav } from "@/components/SiteNav";
import { getCityStats } from "@/lib/publishedData";
import { formatAssessedValue } from "@/lib/share/cardModel";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "$50M club register · pedaterre",
  description:
    "New York City tax lots assessed above $50 million, ranked by filed assessed market value.",
};

export default async function ClubPage() {
  const stats = await getCityStats();
  const clubLotShare = (stats.clubLots / stats.nLots) * 100;
  const clubValueShare = stats.clubShareOfMv * 100;

  return (
    <main className="top-page">
      <SiteNav current="/club" />

      <section className="top-heading" aria-labelledby="club-title">
        <div>
          <h1 id="club-title">
            {stats.clubLots.toLocaleString("en-US")} LOTS CARRY{" "}
            {clubValueShare.toFixed(1)}% OF CITY VALUE
          </h1>
          <p>
            {clubLotShare.toFixed(2)}% of tax lots exceed $50M on the filed
            roll. Each line is an individual tax lot, before condo grouping.
            PUBLIC marks lots whose exempt value is at least half of assessed
            value.
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

      <ClubLotList expectedCount={stats.clubLots} />
    </main>
  );
}
