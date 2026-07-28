"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOROUGHS } from "@/lib/borough";
import type { BoroughRankFilter } from "@/lib/blockRanks";
import {
  CLUB_LOT_CHUNK_SIZE,
  chunkClubLots,
  clubLotRowsSchema,
  filterClubLots,
  rankClubLots,
  type ClubBlockScope,
  type RankedClubLotRow,
} from "@/lib/clubLots";
import { formatAssessedValue } from "@/lib/share/cardModel";

const BOROUGH_FILTERS: Array<{
  label: string;
  value: BoroughRankFilter;
}> = [
  { label: "ALL", value: "ALL" },
  { label: "MN", value: 1 },
  { label: "BX", value: 2 },
  { label: "BK", value: 3 },
  { label: "QN", value: 4 },
  { label: "SI", value: 5 },
];

interface ClubLotListProps {
  expectedCount: number;
}

type LoadState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; rows: RankedClubLotRow[] };

export function ClubLotList({ expectedCount }: ClubLotListProps) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [borough, setBorough] = useState<BoroughRankFilter>("ALL");
  const [blockScope, setBlockScope] = useState<ClubBlockScope | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(CLUB_LOT_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const boroValue = parameters.get("boro") ?? "";
    const blockValue = parameters.get("block") ?? "";
    if (!/^[1-5]$/.test(boroValue) || !/^\d{1,5}$/.test(blockValue)) return;
    const scopedBorough = Number(boroValue) as ClubBlockScope["boro"];
    setBorough(scopedBorough);
    setBlockScope({ boro: scopedBorough, block: Number(blockValue) });
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/club-lots.json", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Club lots returned HTTP ${response.status}.`);
        }
        return response.json();
      })
      .then((value: unknown) => {
        const rows = clubLotRowsSchema.parse(value);
        if (rows.length !== expectedCount) {
          throw new Error(
            `Club lots has ${rows.length} rows; expected ${expectedCount}.`,
          );
        }
        setLoad({ state: "ready", rows: rankClubLots(rows) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [expectedCount]);

  const filteredRows = useMemo(
    () =>
      load.state === "ready"
        ? filterClubLots(load.rows, borough, debouncedQuery, blockScope)
        : [],
    [blockScope, borough, debouncedQuery, load],
  );
  const visibleRows = useMemo(
    () => chunkClubLots(filteredRows, visibleCount),
    [filteredRows, visibleCount],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + CLUB_LOT_CHUNK_SIZE, filteredRows.length),
        );
      },
      { rootMargin: "0px 0px 120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredRows.length]);

  const selectBorough = (value: BoroughRankFilter) => {
    setBorough(value);
    setBlockScope(null);
    setVisibleCount(CLUB_LOT_CHUNK_SIZE);
    const parameters = new URLSearchParams(window.location.search);
    parameters.delete("boro");
    parameters.delete("block");
    const search = parameters.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  };

  const scopedBoroughCode =
    blockScope == null
      ? null
      : BOROUGHS[String(blockScope.boro) as keyof typeof BOROUGHS].code;

  return (
    <section className="rank-register" aria-labelledby="club-register-title">
      <div className="rank-controls">
        <div>
          <h2 id="club-register-title">$50M CLUB REGISTER</h2>
          <div
            aria-label="Filter by borough"
            className="borough-filters"
            role="group"
          >
            {BOROUGH_FILTERS.map((filter) => (
              <button
                aria-pressed={borough === filter.value}
                disabled={load.state !== "ready"}
                key={filter.label}
                onClick={() => selectBorough(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <label className="rank-search">
          <span>FILTER OWNER OR ADDRESS</span>
          <input
            disabled={load.state !== "ready"}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(CLUB_LOT_CHUNK_SIZE);
            }}
            placeholder="MTA OR 1 CENTRE STREET"
            type="search"
            value={query}
          />
        </label>
      </div>

      {load.state === "loading" ? (
        <p className="rank-notice" aria-live="polite">
          OPENING THE CLUB REGISTER…
        </p>
      ) : null}
      {load.state === "error" ? (
        <p className="rank-notice" role="alert">
          THE CLUB REGISTER COULD NOT BE OPENED.
        </p>
      ) : null}
      {load.state === "ready" ? (
        <>
          <p className="rank-count" aria-live="polite">
            {blockScope
              ? `${scopedBoroughCode} · block ${blockScope.block.toLocaleString("en-US")} · `
              : null}
            {filteredRows.length.toLocaleString("en-US")} lots on register ·{" "}
            {visibleRows.length.toLocaleString("en-US")} shown
          </p>
          <div className="rank-table-wrap club-table-wrap">
            <table className="rank-table club-table">
              <caption>
                NYC tax lots above $50 million ranked by assessed market value
              </caption>
              <colgroup>
                <col className="rank-column" />
                <col className="club-lot-column" />
                <col className="club-address-column" />
                <col className="club-owner-column" />
                <col className="value-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">BOROUGH · BLOCK · LOT</th>
                  <th scope="col">ADDRESS ON FILE</th>
                  <th scope="col">OWNER AS FILED</th>
                  <th scope="col">ASSESSED VALUE</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const boroughNumber = String(
                    row.boro,
                  ) as keyof typeof BOROUGHS;
                  const boroughCode = BOROUGHS[boroughNumber].code;
                  return (
                    <tr data-testid="club-row" key={row.bbl}>
                      <td className="rank-number">{row.rank}</td>
                      <td>
                        <a
                          href={`/b/${row.boro}/${row.block}?lot=${row.lot}`}
                        >
                          <span>{boroughCode}</span>
                          <strong>
                            BLOCK {row.block} · LOT {row.lot}
                          </strong>
                        </a>
                        {!row.taxable ? (
                          <span className="public-tag">PUBLIC</span>
                        ) : null}
                      </td>
                      <td className="rank-address">{row.address || "—"}</td>
                      <td className="club-owner">{row.owner || "—"}</td>
                      <td className="rank-value">
                        {formatAssessedValue(row.mv)}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="rank-empty" colSpan={5}>
                      NO LOTS MATCH THIS REGISTER.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {visibleRows.length < filteredRows.length ? (
            <div
              aria-hidden="true"
              className="rank-sentinel"
              data-testid="club-sentinel"
              ref={sentinelRef}
            >
              NEXT REGISTER PAGE
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
