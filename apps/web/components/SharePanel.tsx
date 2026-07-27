"use client";

import { useState } from "react";
import type { BlockPayload, Lot } from "@/lib/schema";
import {
  buildShareCardModel,
  type AddressedLot,
  type ShareCardPayload,
  stampFor,
} from "@/lib/share/cardModel";
import { composeCard } from "@/lib/share/composeCard";
import { copyLink, shareCard } from "@/lib/share/shareActions";
import { drawSkylineThumb } from "@/lib/share/thumbAdapter";

interface SharePanelProps {
  payload: BlockPayload;
  requestedLot: number | null;
  addressedGroup: Lot | null;
}

function sharePayload({
  payload,
  requestedLot,
  addressedGroup,
}: SharePanelProps): ShareCardPayload {
  let addressedLot: AddressedLot | null = null;
  if (requestedLot != null && addressedGroup) {
    addressedLot = {
      lot: requestedLot,
      valueM: addressedGroup.v,
      label:
        addressedGroup.nLots > 1
          ? `PROPERTY GROUP · ${addressedGroup.nLots} LOTS`
          : `LOT ${requestedLot}`,
    };
  }
  return { ...payload, addressedLot };
}

export function SharePanel(props: SharePanelProps) {
  const cardPayload = sharePayload(props);
  const model = buildShareCardModel(cardPayload);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");

  async function exportCard() {
    setWorking(true);
    setNotice("");
    try {
      const canvas = await composeCard(cardPayload, drawSkylineThumb);
      const result = await shareCard({
        png: canvas,
        stamp: stampFor(cardPayload),
      });
      setNotice(
        result.message ??
          (result.method === "download" ? "Image downloaded." : "Card shared."),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("IMAGE DESK UNAVAILABLE — try again.");
    } finally {
      setWorking(false);
    }
  }

  async function copyCurrentLink() {
    setNotice("");
    try {
      const result = await copyLink(window.location.href);
      setNotice(result.message ?? "Link copied.");
    } catch {
      setNotice("LINK DESK UNAVAILABLE — copy the address bar.");
    }
  }

  return (
    <section className="share-panel" aria-labelledby="share-title">
      <div className="share-receipt">
        <p className="share-wordmark">pedaterre</p>
        <p className="share-where">{model.where}</p>
        <p className="share-subline">{model.subline}</p>
        <p className="share-dollars">{model.dollars}</p>
        <p className="share-rank">{model.rank}</p>
        <p className="share-quip">{model.quip}</p>
        {model.addressedLot ? (
          <div className="share-addressed">
            <span>ADDRESSED LOT</span>
            <strong>{model.addressedLot}</strong>
          </div>
        ) : null}
        <p className="share-stamp">{model.stamp}</p>
        <p className="share-source">{model.source}</p>
      </div>
      <div className="share-actions">
        <div>
          <p className="eyebrow">SHARE CARD</p>
          <h2 id="share-title">Send the filed version.</h2>
        </div>
        <button type="button" disabled={working} onClick={() => void exportCard()}>
          {working ? "DRAWING CARD…" : "SHARE CARD IMAGE"}
        </button>
        <button type="button" onClick={() => void copyCurrentLink()}>
          COPY LINK
        </button>
      </div>
      <p className="share-notice" role="status" aria-live="polite">
        {notice}
      </p>
    </section>
  );
}
