"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOROUGHS } from "@/lib/borough";
import {
  BLOCK_RANK_CHUNK_SIZE,
  blockRankRowsSchema,
  chunkBlockRanks,
  filterBlockRanks,
  type BoroughRankFilter,
  type BlockRankRow,
} from "@/lib/blockRanks";
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

interface BlockRankListProps {
  expectedCount: number;
}

type LoadState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; rows: BlockRankRow[] };

export function BlockRankList({ expectedCount }: BlockRankListProps) {
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const [borough, setBorough] = useState<BoroughRankFilter>("ALL");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(BLOCK_RANK_CHUNK_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/block-ranks.json", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Block ranks returned HTTP ${response.status}.`);
        }
        return response.json();
      })
      .then((value: unknown) => {
        const rows = blockRankRowsSchema.parse(value);
        if (rows.length !== expectedCount) {
          throw new Error(
            `Block ranks has ${rows.length} rows; expected ${expectedCount}.`,
          );
        }
        setLoad({ state: "ready", rows });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [expectedCount]);

  const filteredRows = useMemo(
    () =>
      load.state === "ready"
        ? filterBlockRanks(load.rows, borough, query)
        : [],
    [borough, load, query],
  );
  const visibleRows = useMemo(
    () => chunkBlockRanks(filteredRows, visibleCount),
    [filteredRows, visibleCount],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) =>
          Math.min(current + BLOCK_RANK_CHUNK_SIZE, filteredRows.length),
        );
      },
      { rootMargin: "0px 0px 120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredRows.length]);

  return (
    <section className="rank-register" aria-labelledby="rank-register-title">
      <div className="rank-controls">
        <div>
          <h2 id="rank-register-title">CITY REGISTER</h2>
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
                onClick={() => {
                  setBorough(filter.value);
                  setVisibleCount(BLOCK_RANK_CHUNK_SIZE);
                }}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <label className="rank-search">
          <span>FILTER BLOCK OR ADDRESS</span>
          <input
            disabled={load.state !== "ready"}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(BLOCK_RANK_CHUNK_SIZE);
            }}
            placeholder="1171 or WEST 61ST"
            type="search"
            value={query}
          />
        </label>
      </div>

      {load.state === "loading" ? (
        <p className="rank-notice" aria-live="polite">
          OPENING THE CITY REGISTER…
        </p>
      ) : null}
      {load.state === "error" ? (
        <p className="rank-notice" role="alert">
          THE CITY REGISTER COULD NOT BE OPENED.
        </p>
      ) : null}
      {load.state === "ready" ? (
        <>
          <p className="rank-count" aria-live="polite">
            {filteredRows.length.toLocaleString("en-US")} blocks on register ·{" "}
            {visibleRows.length.toLocaleString("en-US")} shown
          </p>
          <div className="rank-table-wrap">
            <table className="rank-table">
              <caption>
                NYC tax blocks ranked by total assessed market value
              </caption>
              <colgroup>
                <col className="rank-column" />
                <col className="block-column" />
                <col className="address-column" />
                <col className="value-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">BOROUGH · BLOCK</th>
                  <th scope="col">ADDRESS ON FILE</th>
                  <th scope="col">ASSESSED VALUE</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const boroughNumber = String(
                    row.b,
                  ) as keyof typeof BOROUGHS;
                  const boroughCode = BOROUGHS[boroughNumber].code;
                  return (
                    <tr
                      data-character={row.c}
                      data-testid="rank-row"
                      key={`${row.b}-${row.k}`}
                    >
                      <td className="rank-number">{row.rank}</td>
                      <td>
                        <a href={`/b/${row.b}/${row.k}`}>
                          <span>{boroughCode}</span>
                          <strong>BLOCK {row.k}</strong>
                        </a>
                        {!row.t ? (
                          <span className="public-tag">PUBLIC</span>
                        ) : null}
                      </td>
                      <td className="rank-address">{row.a || "—"}</td>
                      <td className="rank-value">
                        {formatAssessedValue(row.m)}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="rank-empty" colSpan={4}>
                      NO BLOCKS MATCH THIS REGISTER.
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
              data-testid="rank-sentinel"
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
