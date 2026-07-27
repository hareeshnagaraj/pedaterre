import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BlockResultClient } from "@/components/BlockResultClient";
import {
  boroughCode,
  boroughName,
  boroughNumber,
  type BoroughNumber,
} from "@/lib/borough";
import {
  curatedBlockRouteParams,
  curatedResultLinks,
  getCityStats,
} from "@/lib/publishedData";

// Long tail renders on demand and is cached; only curated blocks pre-render
// (Vercel's 16k output-file cap forbids 28,798 static pages).
export const dynamicParams = true;

interface BlockPageProps {
  params: Promise<{ boro: string; block: string }>;
}

function validParams(boroValue: string, blockValue: string) {
  const boro = boroughNumber(boroValue);
  const block = Number(blockValue);
  if (
    !boro ||
    !/^\d{1,5}$/.test(blockValue) ||
    !Number.isSafeInteger(block) ||
    block < 0 ||
    block > 99_999
  ) {
    return null;
  }
  return { boro, block };
}

export async function generateStaticParams() {
  return curatedBlockRouteParams();
}

export async function generateMetadata({
  params,
}: BlockPageProps): Promise<Metadata> {
  const raw = await params;
  const parsed = validParams(raw.boro, raw.block);
  if (!parsed) return {};
  const name = boroughName(parsed.boro);
  const title = `pedaterre · ${name} block ${parsed.block} assessed value`;
  const description = `${name} tax block ${parsed.block}: NYC Department of Finance assessed market value, city rank, and property-group drawings.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/api/og/${parsed.boro}/${parsed.block}`],
    },
  };
}

export default async function BlockPage({ params }: BlockPageProps) {
  const raw = await params;
  const parsed = validParams(raw.boro, raw.block);
  if (!parsed) notFound();

  const code = boroughCode(parsed.boro)!;
  const [curatedLinks, stats] = await Promise.all([
    curatedResultLinks(code),
    getCityStats(),
  ]);
  const addressHint = stats.top25Taxable.find(
    (pick) => pick.borough === code && pick.block === parsed.block,
  )?.addressHint;

  return (
    <main className="result-page live-result-page">
      <header className="site-header">
        <a className="wordmark" href="/">
          pedaterre
        </a>
        <a className="header-cta" href="/#lookup">
          LOOK UP YOUR BLOCK
        </a>
      </header>

      <section className="block-heading live-block-heading" aria-labelledby="block-title">
        <div>
          <p className="eyebrow">{boroughName(parsed.boro)}</p>
          <h1 id="block-title" tabIndex={-1}>
            Block {parsed.block}
          </h1>
          {addressHint ? <p className="address-hint">{addressHint}</p> : null}
          <p className="group-summary">
            {code} · BBL {parsed.boro}-
            {String(parsed.block).padStart(5, "0")} · final assessment roll
          </p>
        </div>
        <span className="live-badge">LIVE · FY2027</span>
      </section>

      <Suspense
        fallback={
          <div className="client-shell-fallback" aria-busy="true">
            PULLING THE ROLL…
          </div>
        }
      >
        <BlockResultClient
          boro={parsed.boro as BoroughNumber}
          block={parsed.block}
          curatedLinks={curatedLinks}
        />
      </Suspense>
    </main>
  );
}
