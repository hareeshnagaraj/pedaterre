import { buildShareCardModel, type ShareCardPayload } from "./cardModel";
import { CARD_TOKENS, RECEIPT_TOKENS } from "./cardTokens";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const SKYLINE_WIDTH = 660;

export type DrawSkylineThumb = (
  ctx: CanvasRenderingContext2D,
  payload: ShareCardPayload,
  width: number,
  height: number,
) => void | Promise<void>;

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
  const x = SKYLINE_WIDTH + 42;
  const width = CARD_WIDTH - x - 38;

  drawReceiptEdge(ctx);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `800 29px ${CARD_TOKENS.num}`;
  ctx.fillText("pedaterre", x, 55);

  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.fillRect(x, 68, 56, 4);

  ctx.fillStyle = CARD_TOKENS.paperInk;
  ctx.font = `600 22px ${CARD_TOKENS.font}`;
  ctx.fillText(ellipsizeToWidth(ctx, model.where, width), x, 113);

  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `500 16px ${CARD_TOKENS.font}`;
  ctx.fillText(ellipsizeToWidth(ctx, model.subline, width), x, 143);

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
  ctx.fillText(model.dollars, x, 239);

  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.font = `700 28px ${CARD_TOKENS.num}`;
  ctx.fillText(ellipsizeToWidth(ctx, model.rank, width), x, 285);

  drawRule(ctx, x, 312, width);

  ctx.fillStyle = RECEIPT_TOKENS.bodyInk;
  ctx.font = `500 20px ${CARD_TOKENS.font}`;
  drawTwoLineQuip(ctx, model.quip, x, 350, width, 29);

  let stampY = 470;
  if (model.addressedLot) {
    drawRule(ctx, x, 418, width);
    ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
    ctx.font = `700 13px ${CARD_TOKENS.num}`;
    ctx.fillText("ADDRESSED LOT", x, 444);
    ctx.fillStyle = CARD_TOKENS.paperInk;
    ctx.font = `700 23px ${CARD_TOKENS.num}`;
    ctx.fillText(ellipsizeToWidth(ctx, model.addressedLot, width), x, 472);
    stampY = 502;
  }

  const stampWidth = Math.min(width, 294);
  ctx.strokeStyle = CARD_TOKENS.stamp;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, stampY, stampWidth, 45);
  ctx.fillStyle = CARD_TOKENS.stamp;
  ctx.font = `700 18px ${CARD_TOKENS.num}`;
  ctx.textAlign = "center";
  ctx.fillText(model.stamp, x + stampWidth / 2, stampY + 29);

  drawRule(ctx, x, 578, width);
  ctx.fillStyle = RECEIPT_TOKENS.mutedInk;
  ctx.font = `500 12px ${CARD_TOKENS.font}`;
  ctx.textAlign = "left";
  ctx.fillText(ellipsizeToWidth(ctx, model.source, width), x, 607);
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
