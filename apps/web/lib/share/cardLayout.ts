export const CARD_LAYOUT = Object.freeze({
  width: 1200,
  height: 630,
  skylineWidth: 660,
  receipt: Object.freeze({
    insetLeft: 42,
    insetRight: 38,
    wordmarkY: 55,
    accentY: 68,
    accentWidth: 56,
    accentHeight: 4,
    whereY: 113,
    sublineY: 143,
    dollarsY: 239,
    rankY: 285,
    firstRuleY: 312,
    quipY: 350,
    quipLineHeight: 29,
    addressedRuleY: 418,
    addressedLabelY: 444,
    addressedValueY: 472,
    stampY: 470,
    addressedStampY: 502,
    stampWidth: 294,
    stampHeight: 45,
    sourceRuleY: 578,
    sourceY: 607,
  }),
});

export const CARD_COPY = Object.freeze({
  wordmark: "pedaterre",
  addressedLot: "ADDRESSED LOT",
  source: "DOF assessed market value · not sale price · nyc.gov/finance",
});

export const CARD_TEXT_LIMITS = Object.freeze({
  where: 62,
  subline: 68,
  rank: 54,
  quip: 150,
  addressedLot: 52,
});

export function receiptGeometry(hasAddressedLot: boolean) {
  const x = CARD_LAYOUT.skylineWidth + CARD_LAYOUT.receipt.insetLeft;
  return {
    x,
    width: CARD_LAYOUT.width - x - CARD_LAYOUT.receipt.insetRight,
    stampY: hasAddressedLot
      ? CARD_LAYOUT.receipt.addressedStampY
      : CARD_LAYOUT.receipt.stampY,
  };
}

export function truncateText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
