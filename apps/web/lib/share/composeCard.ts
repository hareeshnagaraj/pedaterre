import { buildShareCardModel, type ShareCardPayload } from "./cardModel";
import {
  CARD_COPY,
  CARD_LAYOUT,
  receiptGeometry,
} from "./cardLayout";
import { CARD_TOKENS, RECEIPT_TOKENS } from "./cardTokens";

export const CARD_WIDTH = CARD_LAYOUT.width;
export const CARD_HEIGHT = CARD_LAYOUT.height;
export const SKYLINE_WIDTH = CARD_LAYOUT.skylineWidth;

export type DrawSkylineThumb = (
  ctx: CanvasRenderingContext2D,
  payload: ShareCardPayload,
  width: number,
  height: number,
) => void | Promise<void>;

export interface GameCardPayload {
  left: ShareCardPayload;
  right: ShareCardPayload;
  seed: string;
  streak: number;
}

function drawRule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
): void {
  ctx.fillStyle = RECEIPT_TOKENS.rule;
  ctx.fillRect(x, y, width, 1);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  startingSize: number,
  minimumSize: number,
  weight: number,
  family: string,
): number {
  let size = startingSize;
  while (size > minimumSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

function ellipsizeToWidth(
  ctx: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let output = value;
  while (
    output.length &&
    ctx.measureText(`${output.trimEnd()}…`).width > maxWidth
  ) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}…`;
}

function drawTwoLineQuip(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === 2) break;
  }

  if (lines.length < 2 && line) lines.push(line);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    lines[lines.length - 1] = ellipsizeToWidth(
      ctx,
      `${lines.at(-1)} ${words.slice(consumed).join(" ")}`,
      maxWidth,
    );
  }

  lines
    .slice(0, 2)
    .forEach((text, index) => ctx.fillText(text, x, y + index * lineHeight));
}

function drawReceiptEdge(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = CARD_TOKENS.paper;
  ctx.fillRect(SKYLINE_WIDTH, 0, CARD_WIDTH - SKYLINE_WIDTH, CARD_HEIGHT);

  ctx.fillStyle = CARD_TOKENS.void;
  for (let y = 7; y < CARD_HEIGHT; y += 18) {
    ctx.fillRect(SKYLINE_WIDTH - 4, y, 8, 9);
  }
}

function drawReceipt(
  ctx: CanvasRenderingContext2D,
  payload: ShareCardPayload,
): void {
  const model = buildShareCardModel(payload);
  const geometry = receiptGeometry(Boolean(model.addressedLot));
  const { x, width } = geometry;
  const receipt = CARD_LAYOUT.receipt;

  drawReceiptEdge(ctx);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `800 29px ${CARD_TOKENS.num}`;
  ctx.fillText(CARD_COPY.wordmark, x, receipt.wordmarkY);

  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.fillRect(
    x,
    receipt.accentY,
    receipt.accentWidth,
    receipt.accentHeight,
  );

  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `600 22px ${CARD_TOKENS.font}`;
  ctx.fillText(ellipsizeToWidth(ctx, model.where, width), x, receipt.whereY);

  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `500 16px ${CARD_TOKENS.font}`;
  ctx.fillText(
    ellipsizeToWidth(ctx, model.subline, width),
    x,
    receipt.sublineY,
  );

  const dollarSize = fitText(
    ctx,
    model.dollars,
    width,
    86,
    54,
    800,
    CARD_TOKENS.num,
  );
  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `800 ${dollarSize}px ${CARD_TOKENS.num}`;
  ctx.fillText(model.dollars, x, receipt.dollarsY);

  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.font = `700 28px ${CARD_TOKENS.num}`;
  ctx.fillText(ellipsizeToWidth(ctx, model.rank, width), x, receipt.rankY);

  drawRule(ctx, x, receipt.firstRuleY, width);

  ctx.fillStyle = RECEIPT_TOKENS.bodyInk;
  ctx.font = `500 20px ${CARD_TOKENS.font}`;
  drawTwoLineQuip(
    ctx,
    model.quip,
    x,
    receipt.quipY,
    width,
    receipt.quipLineHeight,
  );

  if (model.addressedLot) {
    drawRule(ctx, x, receipt.addressedRuleY, width);
    ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
    ctx.font = `700 13px ${CARD_TOKENS.num}`;
    ctx.fillText(CARD_COPY.addressedLot, x, receipt.addressedLabelY);
    ctx.fillStyle = CARD_TOKENS.paperInk;
    ctx.font = `700 23px ${CARD_TOKENS.num}`;
    ctx.fillText(
      ellipsizeToWidth(ctx, model.addressedLot, width),
      x,
      receipt.addressedValueY,
    );
  }

  const stampWidth = Math.min(width, receipt.stampWidth);
  ctx.strokeStyle = CARD_TOKENS.stamp;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    x,
    geometry.stampY,
    stampWidth,
    receipt.stampHeight,
  );
  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.font = `700 18px ${CARD_TOKENS.num}`;
  ctx.textAlign = "center";
  ctx.fillText(model.stamp, x + stampWidth / 2, geometry.stampY + 29);

  drawRule(ctx, x, receipt.sourceRuleY, width);
  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `500 12px ${CARD_TOKENS.font}`;
  ctx.textAlign = "left";
  ctx.fillText(
    ellipsizeToWidth(ctx, model.source, width),
    x,
    receipt.sourceY,
  );
}

export async function composeCard(
  payload: ShareCardPayload,
  drawSkylineThumb: DrawSkylineThumb,
): Promise<HTMLCanvasElement> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  canvas.setAttribute(
    "aria-label",
    `pedaterre share card for ${payload.borough} block ${payload.block}`,
  );

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");

  ctx.fillStyle = CARD_TOKENS.void;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.save();
  await drawSkylineThumb(ctx, payload, SKYLINE_WIDTH, CARD_HEIGHT);
  ctx.restore();

  drawReceipt(ctx, payload);
  return canvas;
}

function blindSharePayload(payload: ShareCardPayload): ShareCardPayload {
  return {
    ...payload,
    lots: payload.lots?.map((lot) => ({
      ...lot,
      club: undefined,
      you: undefined,
    })),
  };
}

export function gameStamp(seed: string): string {
  return `PD-GAME-${seed}`;
}

export async function composeGameCard(
  payload: GameCardPayload,
  drawSkylineThumb: DrawSkylineThumb,
): Promise<HTMLCanvasElement> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  canvas.setAttribute(
    "aria-label",
    `The Assessor's Game share card for seed ${payload.seed}`,
  );

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable.");

  const registerWidth = 870;
  const skylineWidth = registerWidth / 2;
  const skylineTop = 72;
  const skylineHeight = 470;

  ctx.fillStyle = CARD_TOKENS.void;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  for (const [index, block] of [payload.left, payload.right].entries()) {
    const x = index * skylineWidth;
    ctx.save();
    ctx.translate(x, skylineTop);
    await drawSkylineThumb(
      ctx,
      blindSharePayload(block),
      skylineWidth,
      skylineHeight,
    );
    ctx.restore();

    ctx.fillStyle = CARD_TOKENS.inkDim;
    ctx.font = `700 16px ${CARD_TOKENS.font}`;
    ctx.textAlign = "left";
    ctx.fillText(block.borough.toUpperCase(), x + 24, 43);
  }

  ctx.fillStyle = CARD_TOKENS.inkDim;
  ctx.fillRect(skylineWidth, skylineTop, 1, skylineHeight);
  ctx.fillStyle = CARD_TOKENS.paper;
  ctx.fillRect(registerWidth, 0, CARD_WIDTH - registerWidth, CARD_HEIGHT);

  const receiptX = registerWidth + 34;
  const receiptWidth = CARD_WIDTH - receiptX - 30;
  ctx.textAlign = "left";
  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `800 26px ${CARD_TOKENS.num}`;
  ctx.fillText("pedaterre", receiptX, 50);

  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.fillRect(receiptX, 65, 52, 4);

  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `800 36px ${CARD_TOKENS.num}`;
  ctx.fillText("THE ASSESSOR'S", receiptX, 121);
  ctx.fillText("GAME", receiptX, 157);

  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `700 13px ${CARD_TOKENS.font}`;
  ctx.fillText("STREAK ON FILE", receiptX, 211);

  const score = Math.max(0, Math.trunc(payload.streak)).toLocaleString("en-US");
  const scoreSize = fitText(
    ctx,
    score,
    receiptWidth,
    190,
    104,
    800,
    CARD_TOKENS.num,
  );
  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `800 ${scoreSize}px ${CARD_TOKENS.num}`;
  ctx.fillText(score, receiptX, 363);

  drawRule(ctx, receiptX, 397, receiptWidth);
  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `700 12px ${CARD_TOKENS.font}`;
  ctx.fillText("RUN SEED", receiptX, 431);
  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `700 24px ${CARD_TOKENS.num}`;
  ctx.fillText(
    ellipsizeToWidth(ctx, payload.seed, receiptWidth),
    receiptX,
    461,
  );

  const stamp = gameStamp(payload.seed);
  ctx.strokeStyle = CARD_TOKENS.stamp;
  ctx.lineWidth = 2;
  ctx.strokeRect(receiptX, 493, receiptWidth, 44);
  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.font = `700 17px ${CARD_TOKENS.num}`;
  ctx.textAlign = "center";
  ctx.fillText(stamp, receiptX + receiptWidth / 2, 522);

  drawRule(ctx, receiptX, 574, receiptWidth);
  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `500 11px ${CARD_TOKENS.font}`;
  ctx.textAlign = "left";
  ctx.fillText("DOF FINAL ASSESSMENT ROLL", receiptX, 603);

  ctx.fillStyle = CARD_TOKENS.inkDim;
  ctx.font = `500 11px ${CARD_TOKENS.font}`;
  ctx.fillText("Two blocks. One filed value is higher.", 24, 594);

  return canvas;
}
