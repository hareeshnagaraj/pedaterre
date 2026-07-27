"use client";

import { useEffect, useRef } from "react";
import {
  cityBlockKey,
  decodeBlockMap,
  fitMapCamera,
  type CityBlock,
} from "@/lib/cityMap";
import { TOKENS } from "@/lib/tokens";

export function BlockLocator({
  boro,
  block,
}: {
  boro: number | string;
  block: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const canvasElement = canvas;
    const frameElement = frame;
    const ctx = context;
    const controller = new AbortController();
    let blocks: CityBlock[] = [];

    function draw() {
      if (blocks.length === 0) return;
      const rect = frameElement.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.round(width * dpr);
      canvasElement.height = Math.round(height * dpr);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const camera = fitMapCamera(blocks, width, height, 10);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#080706";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(239,233,221,0.17)";
      for (const item of blocks) {
        const x =
          (item.worldX - camera.centerX) * camera.scale + width / 2;
        const y =
          (item.worldY - camera.centerY) * camera.scale + height / 2;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }

      const selected = blocks.find(
        (item) =>
          cityBlockKey(item.boro, item.block) === cityBlockKey(boro, block),
      );
      if (selected) {
        const x =
          (selected.worldX - camera.centerX) * camera.scale + width / 2;
        const y =
          (selected.worldY - camera.centerY) * camera.scale + height / 2;
        ctx.fillStyle = TOKENS.you;
        ctx.fillRect(Math.round(x - 2), Math.round(y - 2), 5, 5);
        ctx.strokeStyle = "rgba(110,212,255,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + 0.5, y + 0.5, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      canvasElement.dataset.rendered = "true";
    }

    void fetch("/data/block-map.json", {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Block map unavailable.");
        return response.json();
      })
      .then((value: unknown) => {
        blocks = decodeBlockMap(value);
        draw();
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          canvasElement.dataset.rendered = "error";
        }
      });

    const observer = new ResizeObserver(draw);
    observer.observe(frameElement);
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [block, boro]);

  return (
    <figure className="block-locator">
      <a
        aria-label={`Open the city map centered on borough ${boro}, block ${block}`}
        href={`/map?b=${boro}&k=${block}`}
        ref={frameRef}
      >
        <canvas
          aria-hidden="true"
          data-rendered="false"
          height="160"
          ref={canvasRef}
          width="240"
        />
      </a>
      <figcaption>THIS BLOCK, IN THE CITY</figcaption>
    </figure>
  );
}
