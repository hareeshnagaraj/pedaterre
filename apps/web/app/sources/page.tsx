import type { Metadata } from "next";
import { getCityStats } from "@/lib/publishedData";
import styles from "./sources.module.css";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "pedaterre · sources & verification",
  description:
    "Every figure on pedaterre, its definition, and the filed record it comes from.",
};

interface Claim {
  claim: string;
  definition: string;
  source: string;
}

const CLAIMS: Claim[] = [
  {
    claim: "Block total",
    definition:
      "Sum of assessed market value for every tax lot on the block, final roll.",
    source: "DOF roll",
  },
  {
    claim: "Property group",
    definition:
      "Condo-range lots (1001 and above) that share a filed house number and street are drawn as one group. Fee lots stand alone. Grouping changes the drawing, never the total.",
    source: "derived",
  },
  {
    claim: "Largest group share",
    definition: "Largest rendered property group divided by the block total.",
    source: "derived",
  },
  {
    claim: "$50M club",
    definition:
      "Raw tax lots assessed above $50M, counted before condo grouping. A group is marked gold only when it contains such a lot, never for its combined value.",
    source: "DOF roll",
  },
  {
    claim: "City rank",
    definition:
      "Dense rank of block totals, descending, across every block on the roll.",
    source: "derived",
  },
  {
    claim: "PUBLIC tag",
    definition:
      "Blocks where exempt value is at least half of assessed value. Marked on the register and held out of the taxable ranking, so airports and parkland do not crowd out privately held blocks.",
    source: "DOF exempt value",
  },
  {
    claim: "Owner",
    definition:
      "The exact string as filed, with one mechanical repair: the roll stores owner in two 40-character fields, so a name split mid-word at position 40 is rejoined. The raw string is kept alongside. No entity resolution, no matching of one company to another.",
    source: "DOF roll",
  },
  {
    claim: "Block position",
    definition:
      "Mean latitude and longitude of the block's lots. The block's location is real; its outline is not drawn, and placement of buildings within a block is schematic, ordered by lot number.",
    source: "PLUTO",
  },
  {
    claim: "Land area",
    definition: "Sum of lot area for the block's lots.",
    source: "PLUTO",
  },
  {
    claim: "Value per square foot",
    definition: "Block total divided by block land area.",
    source: "derived",
  },
  {
    claim: "Unbuilt capacity",
    definition:
      "Floor area a lot is permitted as of right but has not built: the greater of its residential, commercial, and community-facility floor-area ratios, less what is built, multiplied by lot area. Reported in square feet only.",
    source: "PLUTO",
  },
];

const SOURCES = [
  {
    name: "NYC Department of Finance — Property Valuation and Assessment Data, Tax Classes 1–4",
    note: "The roll. Every value on this site begins here.",
    href: "https://data.cityofnewyork.us/City-Government/Property-Valuation-and-Assessment-Data-Tax-Classes/8y4t-faws",
  },
  {
    name: "NYC Department of City Planning — PLUTO",
    note: "Lot coordinates, lot area, and zoning capacity. Used for placement, density, and unbuilt capacity.",
    href: "https://data.cityofnewyork.us/City-Government/Primary-Land-Use-Tax-Lot-Output-PLUTO/64uk-42ks",
  },
  {
    name: "NYC Planning Labs — GeoSearch",
    note: "Turns a typed address into a borough, block, and lot.",
    href: "https://geosearch.planninglabs.nyc/",
  },
  {
    name: "NYC Property Information Portal",
    note: "The city's own record for any parcel. Every lot here links back to it.",
    href: "https://propertyinformationportal.nyc.gov/",
  },
];

const CAVEATS = [
  "Assessed market value is the Department of Finance's figure for taxation. It is not a sale price, an appraisal, or an estimate of what a property would fetch. For many properties it is well below what the market would pay.",
  "Unbuilt capacity is an as-of-right envelope and nothing more. It ignores overlays, special districts, landmark status, transferred air rights, and lot mergers. A lot showing capacity may have no legal way to use it. We do not convert that square footage into dollars, because the price per buildable foot is a modelling assumption and not a figure on the roll.",
  "Condo billing lots that carry no value are pointer records in the roll. They are excluded from totals so that units are not counted twice, and kept only to resolve a searched address to its building.",
  "Lots assessed at zero exist, and so do blocks that total zero. They are drawn as such rather than hidden.",
  "Assessments are appealed, corrected, and revised; what you see is what was filed for the year named below.",
];

export default async function SourcesPage() {
  const stats = await getCityStats();

  return (
    <main className={`sources-section ${styles.page}`}>
      <SiteNav current="/sources" />
      <section>
        <h2>Every number here is a sum of filed values.</h2>
        <p>
          Every number on this site is a sum, a rank, or a ratio of figures
          filed on the New York City assessment roll.
        </p>

        <h3>What each figure means</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Definition</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {CLAIMS.map((row) => (
              <tr key={row.claim}>
                <th scope="row">{row.claim}</th>
                <td>{row.definition}</td>
                <td className={styles.source}>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>Where the data comes from</h3>
        <dl>
          {SOURCES.map((source) => (
            <div key={source.href}>
              <dt>
                <a
                  className="source-link"
                  href={source.href}
                  rel="noopener noreferrer"
                >
                  {source.name}
                </a>
              </dt>
              <dd>{source.note}</dd>
            </div>
          ))}
        </dl>

        <h3>What this is not</h3>
        <ul className={styles.caveats}>
          {CAVEATS.map((caveat) => (
            <li key={caveat.slice(0, 32)}>{caveat}</li>
          ))}
        </ul>

        <h3>This build</h3>
        <p className={styles.build}>
          {stats.rollYear} final roll · extract {stats.extractHash} ·{" "}
          {stats.nLots.toLocaleString("en-US")} tax lots ·{" "}
          {stats.nBlocks.toLocaleString("en-US")} blocks
        </p>
      </section>
    </main>
  );
}
