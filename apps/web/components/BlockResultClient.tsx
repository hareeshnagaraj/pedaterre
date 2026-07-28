"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BlockMissingState,
  LoadingState,
  NetworkErrorState,
  PartialNotice,
} from "@/components/states";
import { boroughName, boroughNumber } from "@/lib/borough";
import {
  BlockDataError,
  fetchBlock,
  type BlockDataErrorCode,
} from "@/lib/data";
import type { BlockPayload } from "@/lib/schema";
import type { BlockPick } from "@/lib/publishedData";
import { selectAddressedGroup } from "@/lib/selection";
import { formatAssessedValue } from "@/lib/share/cardModel";
import {
  empireStateEquivalents,
  formatSquareFeet,
} from "@/lib/viz/ghost";
import { BlockViz } from "./BlockViz";
import { BlockLocator } from "./BlockLocator";
import { SharePanel } from "./SharePanel";

type LoadState =
  | { state: "loading" }
  | { state: "error"; code: BlockDataErrorCode }
  | { state: "success"; payload: BlockPayload };

interface BlockResultClientProps {
  boro: string;
  block: number;
  curatedLinks: BlockPick[];
  ghostCaveat: string;
  empireStateSqft: number;
  rollYear: string;
}

function requestedLotFrom(value: string | null): number | null {
  if (value == null) return null;
  if (!/^\d{1,4}$/.test(value)) return Number.NaN;
  return Number(value);
}

export function BlockResultClient({
  boro,
  block,
  curatedLinks,
  ghostCaveat,
  empireStateSqft,
  rollYear,
}: BlockResultClientProps) {
  const searchParams = useSearchParams();
  const lotValue = searchParams.get("lot");
  const requestedLot = requestedLotFrom(lotValue);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ state: "loading" });
  const focusRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchBlock(boro, block, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) setLoad({ state: "success", payload });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code =
          error instanceof BlockDataError ? error.code : ("NETWORK" as const);
        setLoad({ state: "error", code });
      });
    return () => controller.abort();
  }, [attempt, block, boro]);

  useEffect(() => {
    if (load.state === "loading") return;
    const target =
      load.state === "success"
        ? document.getElementById("block-title")
        : focusRef.current;
    target?.focus();
  }, [load.state]);

  const selection = useMemo(
    () =>
      load.state === "success"
        ? selectAddressedGroup(
            load.payload,
            requestedLot != null && Number.isFinite(requestedLot)
              ? requestedLot
              : lotValue == null
                ? null
                : Number.NaN,
          )
        : null,
    [load, lotValue, requestedLot],
  );

  const requestedLabel = `${boroughName(boro)} · Block ${block}`;
  if (load.state === "loading") {
    return <LoadingState submittedAddress={requestedLabel} />;
  }
  if (load.state === "error" && load.code === "BLOCK_MISSING") {
    return (
      <BlockMissingState
        blockLabel={requestedLabel}
        rollYear={rollYear}
        focusTargetRef={focusRef}
        demoLinks={curatedLinks.map((pick) => ({
          href: `/b/${boroughNumber(pick.borough)}/${pick.block}`,
          label: `${pick.borough} BLOCK ${pick.block}`,
        }))}
      />
    );
  }
  if (load.state === "error") {
    return (
      <NetworkErrorState
        context={requestedLabel}
        focusTargetRef={focusRef}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const { payload, addressedGroup, partial } = selection!;
  const groupLabel =
    addressedGroup == null
      ? null
      : addressedGroup.nLots > 1
        ? `YOUR PROPERTY GROUP · ${addressedGroup.nLots.toLocaleString("en-US")} LOTS · ${formatAssessedValue(addressedGroup.v * 1_000_000)} COMBINED`
        : "YOUR LOT";
  const grouped = payload.nLots > payload.nGroups;
  const empireStates =
    payload.capacitySqft == null
      ? 0
      : empireStateEquivalents(payload.capacitySqft, empireStateSqft);

  return (
    <>
      <section className="live-summary" aria-label="Block assessment summary">
        <dl className="headline-stats">
          <div>
            <dt>assessed market value</dt>
            <dd className="assessed-value">
              {formatAssessedValue(payload.totalMv)}
            </dd>
          </div>
          <div>
            <dt>largest group share</dt>
            <dd>
              {payload.largestGroupShare == null
                ? "not applicable"
                : `${Math.round(payload.largestGroupShare * 100)}%`}
            </dd>
          </div>
          <div>
            <dt>city rank</dt>
            <dd>#{payload.rank.toLocaleString("en-US")}</dd>
          </div>
          {payload.capacitySqft != null ? (
            <div className="capacity-stat">
              <dt>unbuilt capacity</dt>
              <dd>{formatSquareFeet(payload.capacitySqft)}</dd>
              {empireStates >= 1 ? (
                <small>
                  {empireStates.toLocaleString("en-US", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  Empire State {empireStates >= 1.05 ? "Buildings" : "Building"}
                </small>
              ) : null}
            </div>
          ) : null}
        </dl>
        <p>
          {payload.nLots.toLocaleString("en-US")} tax{" "}
          {payload.nLots === 1 ? "lot" : "lots"} ·{" "}
          {payload.nGroups.toLocaleString("en-US")}{" "}
          {payload.nGroups === 1 ? "group" : "groups"}
          {grouped ? " · condo lots combined" : ""}
        </p>
      </section>

      {partial ? <PartialNotice /> : null}
      {groupLabel ? (
        <p className="addressed-group" aria-live="polite">
          {groupLabel}
        </p>
      ) : null}
      <BlockViz payload={payload} ghostCaveat={ghostCaveat} />
      <SharePanel
        payload={payload}
        requestedLot={
          requestedLot != null && Number.isFinite(requestedLot)
            ? requestedLot
            : null
        }
        addressedGroup={addressedGroup}
      />

      <footer className="result-footer live-footer">
        <div>
          <p>
            Schematic placement, ordered by lot number, not a cadastral map.
            Heights and areas use DOF assessed market value, not a sale price.
          </p>
          <p>
            {payload.rollYear} final roll · extract {payload.extractHash}
          </p>
        </div>
        <BlockLocator boro={boro} block={block} />
        <nav aria-label="More blocks">
          <a className="footer-lookup" href="/#lookup">
            LOOK UP YOUR BLOCK
          </a>
          <a href="/map">City map</a>
          <a href="/top">Ranked list of every block</a>
          {payload.largestLotBbl ? (
            <a
              href={`https://propertyinformationportal.nyc.gov/parcels/parcel/${payload.largestLotBbl}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              NYC Property Information Portal
            </a>
          ) : null}
          {payload.latitude != null && payload.longitude != null ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${payload.latitude},${payload.longitude}`}
              rel="noopener noreferrer"
              target="_blank"
            >
              Street View
            </a>
          ) : null}
          {curatedLinks.map((pick) => (
            <a
              href={`/b/${boroughNumber(pick.borough)}/${pick.block}`}
              key={`${pick.borough}-${pick.block}`}
            >
              {pick.addressHint || `${pick.borough} Block ${pick.block}`}
            </a>
          ))}
        </nav>
      </footer>
    </>
  );
}
