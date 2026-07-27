import { deflateSync, inflateSync } from "node:zlib";

type Rgba = [number, number, number, number];

function color(value: string): Rgba {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [0, 0, 0, 255];
  const hex = match[1];
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    255,
  ];
}

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(
    crc32(output.subarray(4, 8 + data.length)),
    8 + data.length,
  );
  return output;
}

export function encodePng(
  width: number,
  height: number,
  pixels: Uint8Array,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    Buffer.from(pixels.subarray(y * width * 4, (y + 1) * width * 4)).copy(
      scanlines,
      row + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

export function decodePng(png: Buffer): {
  width: number;
  height: number;
  pixels: Uint8Array;
} {
  if (
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw new Error("Reference is not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const compressed: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6)
        throw new Error("Reference must be an 8-bit RGBA PNG.");
    }
    if (type === "IDAT") compressed.push(data);
    if (type === "IEND") break;
    offset += length + 12;
  }

  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  const previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    const filter = scanlines[rowOffset];
    const row = scanlines.subarray(rowOffset + 1, rowOffset + 1 + stride);
    const decoded = pixels.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? decoded[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      const value = row[x];
      if (filter === 0) decoded[x] = value;
      else if (filter === 1) decoded[x] = (value + left) & 0xff;
      else if (filter === 2) decoded[x] = (value + up) & 0xff;
      else if (filter === 3)
        decoded[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const upDistance = Math.abs(estimate - up);
        const diagonalDistance = Math.abs(estimate - upperLeft);
        const predictor =
          leftDistance <= upDistance && leftDistance <= diagonalDistance
            ? left
            : upDistance <= diagonalDistance
              ? up
              : upperLeft;
        decoded[x] = (value + predictor) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filter}.`);
      }
    }
    previous.set(decoded);
  }

  return { width, height, pixels };
}

interface DrawState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

export class RasterContext {
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly texts: string[] = [];
  private readonly stack: DrawState[] = [];
  private readonly canvas: RasterCanvas;

  constructor(canvas: RasterCanvas) {
    this.canvas = canvas;
  }

  private paint(
    x: number,
    y: number,
    width: number,
    height: number,
    rgba: Rgba,
  ): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.ceil(x + width));
    const y1 = Math.min(this.canvas.height, Math.ceil(y + height));
    for (let row = y0; row < y1; row += 1) {
      for (let column = x0; column < x1; column += 1) {
        const offset = (row * this.canvas.width + column) * 4;
        this.canvas.pixels.set(rgba, offset);
      }
    }
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.paint(x, y, width, height, color(String(this.fillStyle)));
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    const line = Math.max(1, Math.round(this.lineWidth));
    const rgba = color(String(this.strokeStyle));
    this.paint(x, y, width, line, rgba);
    this.paint(x, y + height - line, width, line, rgba);
    this.paint(x, y, line, height, rgba);
    this.paint(x + width - line, y, line, height, rgba);
  }

  measureText(value: string): TextMetrics {
    const size = Number.parseFloat(
      /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? "10",
    );
    return { width: value.length * size * 0.53 } as TextMetrics;
  }

  fillText(value: string, x: number, y: number): void {
    this.texts.push(value);
    const size = Number.parseFloat(
      /(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? "10",
    );
    const scale = Math.max(1, Math.round(size / 9));
    const advance = size * 0.53;
    const measuredWidth = this.measureText(value).width;
    let cursor = this.textAlign === "center" ? x - measuredWidth / 2 : x;
    const top = y - size * 0.78;
    const rgba = color(String(this.fillStyle));

    for (const character of value) {
      if (character !== " ") {
        const code = character.codePointAt(0) ?? 0;
        for (let row = 0; row < 7; row += 1) {
          for (let column = 0; column < 4; column += 1) {
            const edge = row === 0 || row === 6 || column === 0 || column === 3;
            const bit = (code >>> (row * 4 + column) % 13) & 1;
            if (edge !== Boolean(bit))
              this.paint(
                cursor + column * scale,
                top + row * scale,
                scale,
                scale,
                rgba,
              );
          }
        }
      }
      cursor += advance;
    }
  }

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
    });
  }

  restore(): void {
    const state = this.stack.pop();
    if (state) Object.assign(this, state);
  }
}

export class RasterCanvas {
  width = 300;
  height = 150;
  pixels = new Uint8Array(this.width * this.height * 4);
  readonly attributes = new Map<string, string>();
  private context?: RasterContext;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getContext(kind: string): RasterContext | null {
    if (kind !== "2d") return null;
    if (this.pixels.length !== this.width * this.height * 4) {
      this.pixels = new Uint8Array(this.width * this.height * 4);
    }
    this.context ??= new RasterContext(this);
    return this.context;
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.pixels);
  }
}
