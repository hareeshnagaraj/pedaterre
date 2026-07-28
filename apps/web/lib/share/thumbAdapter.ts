import type { Lot } from "../schema";
import { hScale, project, recomputeFit } from "../viz/projection";
import type { DrawSkylineThumb } from "./composeCard";
import type { ShareCardPayload, ShareLot } from "./cardModel";
import { CARD_TOKENS, RECEIPT_TOKENS } from "./cardTokens";

const ANGLE = -0.72;
const TILT = 0.58;
const ZOOM = 0.9;

function positionedLots(payload: ShareCardPayload): Lot[] {
  const source = payload.lots ?? [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(source.length)));
  return source.map((lot: ShareLot, index) => ({
    bbl: `${payload.borough}-${payload.block}-${lot.lot}`,
    lot: lot.lot,
    c: Number.isInteger(lot.c) ? lot.c! : index % columns,
    r: Number.isInteger(lot.r) ? lot.r! : Math.floor(index / columns),
    v: Number.isFinite(lot.v) ? Math.max(0, lot.v) : 0,
    nLots: Math.max(1, Math.trunc(lot.nLots ?? 1)),
    club: lot.club,
    you: lot.you,
  }));
}

function polygon(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  fill: string,
  stroke: string = CARD_TOKENS.inkDim,
) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function outline(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  stroke: string,
) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

export const drawSkylineThumb: DrawSkylineThumb = (
  ctx,
  payload,
  width,
  height,
) => {
  ctx.fillStyle = RECEIPT_TOKENS.skylineGround;
  ctx.fillRect(0, 0, width, height);
  const lots = positionedLots(payload);
  if (!lots.length) return;

  const fit = recomputeFit(lots, width, height, ANGLE, TILT, ZOOM);
  const projection = {
    ...fit,
    angle: ANGLE,
    tilt: TILT,
    userZoom: ZOOM,
    canvasWidth: width,
    canvasHeight: height,
  };
  const point = (x: number, y: number, z: number) =>
    project(x, y, z, projection);

  const minC = Math.min(...lots.map((lot) => lot.c)) - 0.8;
  const maxC = Math.max(...lots.map((lot) => lot.c)) + 1.6;
  const minR = Math.min(...lots.map((lot) => lot.r)) - 0.8;
  const maxR = Math.max(...lots.map((lot) => lot.r)) + 1.6;
  polygon(
    ctx,
    [
      point(minC, minR, 0),
      point(maxC, minR, 0),
      point(maxC, maxR, 0),
      point(minC, maxR, 0),
    ],
    "#211d19",
    "#4b443d",
  );

  const sorted = [...lots].sort(
    (a, b) => point(a.c, a.r, 0).depth - point(b.c, b.r, 0).depth,
  );
  for (const lot of sorted) {
    const base = 0.62;
    const heightPx = lot.v <= 0 ? 0 : hScale(lot.v);
    const corners = [
      point(lot.c, lot.r, 0),
      point(lot.c + base, lot.r, 0),
      point(lot.c + base, lot.r + base, 0),
      point(lot.c, lot.r + base, 0),
      point(lot.c, lot.r, heightPx),
      point(lot.c + base, lot.r, heightPx),
      point(lot.c + base, lot.r + base, heightPx),
      point(lot.c, lot.r + base, heightPx),
    ];
    if (heightPx === 0) {
      outline(
        ctx,
        [corners[0], corners[1], corners[2], corners[3]],
        lot.you ? CARD_TOKENS.you : "#777066",
      );
      continue;
    }
    const top = lot.you
      ? CARD_TOKENS.you
      : lot.club
        ? CARD_TOKENS.gold
        : "#777066";
    const left = lot.you ? "#3a91b0" : lot.club ? "#9b742f" : "#4b4640";
    const right = lot.you ? "#276f8b" : lot.club ? "#75541f" : "#36322e";
    polygon(ctx, [corners[0], corners[1], corners[5], corners[4]], left);
    polygon(ctx, [corners[1], corners[2], corners[6], corners[5]], right);
    polygon(ctx, [corners[4], corners[5], corners[6], corners[7]], top);
  }
};
