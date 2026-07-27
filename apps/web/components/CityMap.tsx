"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { blockRankRowsSchema } from "@/lib/blockRanks";
import { BOROUGHS } from "@/lib/borough";
import {
  buildSpatialHash,
  cityBlockKey,
  decodeBlockMap,
  fitMapCamera,
  mapBlockQuantiles,
  mapBoroughCode,
  mapMetricPercentiles,
  parseMapView,
  rankMapBlocks,
  setMapViewSearch,
  spatialCandidates,
  type CityBlock,
  type MapBoroughFilter,
  type MapMetric,
} from "@/lib/cityMap";
import { MAP_PINS } from "@/lib/mapPins";
import { formatAssessedValue } from "@/lib/share/cardModel";
import { thermalRampRGB } from "@/lib/viz/color";

const BOROUGH_FILTERS: Array<{
  label: string;
  value: MapBoroughFilter;
}> = [
  { label: "ALL", value: "ALL" },
  { label: "MN", value: 1 },
  { label: "BX", value: 2 },
  { label: "BK", value: 3 },
  { label: "QN", value: 4 },
  { label: "SI", value: 5 },
];

type MapLoad =
  | { state: "loading" }
  | { state: "error" }
  | {
      state: "ready";
      blocks: CityBlock[];
      addresses: Map<string, string>;
    };

interface CityMapProps {
  registerCount: number;
}

interface TooltipState {
  block: CityBlock;
  address?: string;
  x: number;
  y: number;
}

interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(left: CanvasRect, right: CanvasRect, pad: number) {
  return !(
    left.x + left.w + pad < right.x ||
    right.x + right.w + pad < left.x ||
    left.y + left.h + pad < right.y ||
    right.y + right.h + pad < left.y
  );
}

function formatDensity(value: number | null): string {
  return value == null
    ? "LAND AREA NOT FILED"
    : `$${value.toLocaleString("en-US", {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
      })} / SQ FT`;
}

function metricLabel(block: CityBlock, metric: MapMetric): string {
  return metric === "total"
    ? formatAssessedValue(block.totalM * 1_000_000)
    : formatDensity(block.density);
}

function legendValue(value: number, metric: MapMetric): string {
  return metric === "total"
    ? formatAssessedValue(value * 1_000_000)
    : `$${value.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })} / SQ FT`;
}

export function CityMap({ registerCount }: CityMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [load, setLoad] = useState<MapLoad>({ state: "loading" });
  const [metric, setMetric] = useState<MapMetric>("total");
  const [borough, setBorough] = useState<MapBoroughFilter>("ALL");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const metricRef = useRef(metric);
  const boroughRef = useRef(borough);
  metricRef.current = metric;
  boroughRef.current = borough;

  useEffect(() => {
    const readView = () => {
      const view = parseMapView(window.location.search);
      setMetric(view.metric);
      setBorough(view.borough);
    };
    readView();
    window.addEventListener("popstate", readView);
    return () => window.removeEventListener("popstate", readView);
  }, []);

  const updateMapView = (
    nextMetric: MapMetric,
    nextBorough: MapBoroughFilter,
  ) => {
    setMetric(nextMetric);
    setBorough(nextBorough);
    const search = setMapViewSearch(
      new URLSearchParams(window.location.search),
      { metric: nextMetric, borough: nextBorough },
    ).toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/data/block-map.json", {
        cache: "force-cache",
        signal: controller.signal,
      }),
      fetch("/data/block-ranks.json", {
        cache: "force-cache",
        signal: controller.signal,
      }),
    ])
      .then(async ([mapResponse, rankResponse]) => {
        if (!mapResponse.ok || !rankResponse.ok) {
          throw new Error("The city map register could not be opened.");
        }
        const blocks = decodeBlockMap(await mapResponse.json());
        const ranks = blockRankRowsSchema.parse(await rankResponse.json());
        const addresses = new Map(
          ranks
            .filter((row) => row.a)
            .map((row) => [cityBlockKey(row.b, row.k), row.a!]),
        );
        setLoad({ state: "ready", blocks, addresses });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (load.state !== "ready") return;
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const canvasElement = canvas;
    const frameElement = frame;
    const { blocks, addresses } = load;
    const ctx = context;
    const blockByKey = new Map(
      blocks.map((block) => [cityBlockKey(block.boro, block.block), block]),
    );
    const search = new URLSearchParams(window.location.search);
    const focus =
      /^[1-5]$/.test(search.get("b") ?? "") &&
      /^\d{1,5}$/.test(search.get("k") ?? "")
        ? blockByKey.get(cityBlockKey(search.get("b")!, search.get("k")!))
        : undefined;
    const spatialHash = buildSpatialHash(blocks);
    let quantileKey = "";
    let quantiles = new Map<CityBlock, number>();
    const controller = new AbortController();
    const { signal } = controller;
    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      camera: fitMapCamera(blocks, 1, 1),
      cityCamera: fitMapCamera(blocks, 1, 1),
      initialized: false,
      pointers: new Map<number, { x: number; y: number }>(),
      lastX: 0,
      lastY: 0,
      downX: 0,
      downY: 0,
      moved: false,
      pinchDistance: 0,
      pinchScale: 1,
      pinchWorldX: 0,
      pinchWorldY: 0,
    };

    const toScreen = (block: CityBlock) => ({
      x:
        (block.worldX - state.camera.centerX) * state.camera.scale +
        state.width / 2,
      y:
        (block.worldY - state.camera.centerY) * state.camera.scale +
        state.height / 2,
    });

    const toWorld = (x: number, y: number) => ({
      x:
        state.camera.centerX +
        (x - state.width / 2) / state.camera.scale,
      y:
        state.camera.centerY +
        (y - state.height / 2) / state.camera.scale,
    });

    const eventPoint = (event: PointerEvent | WheelEvent) => {
      const rect = canvasElement.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    function active(block: CityBlock): boolean {
      return (
        boroughRef.current === "ALL" ||
        block.boro === boroughRef.current
      );
    }

    function activeQuantiles(currentMetric: MapMetric) {
      const key = `${currentMetric}:${boroughRef.current}`;
      if (key !== quantileKey) {
        quantiles = mapBlockQuantiles(
          blocks,
          currentMetric,
          boroughRef.current,
        );
        quantileKey = key;
      }
      return quantiles;
    }

    function drawPins() {
      if (state.camera.scale > state.cityCamera.scale * 2.25) return;
      ctx.save();
      ctx.font = "700 9px Libre Franklin, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.lineWidth = 0.75;
      const placed: CanvasRect[] = [];
      for (const pin of MAP_PINS) {
        const block = blockByKey.get(cityBlockKey(pin.boro, pin.block));
        if (!block || !active(block)) continue;
        const point = toScreen(block);
        if (
          point.x < 0 ||
          point.x > state.width ||
          point.y < 0 ||
          point.y > state.height
        ) {
          continue;
        }

        const boxWidth = ctx.measureText(pin.label).width + 14;
        const boxHeight = 20;
        if (
          boxWidth > state.width - 12 ||
          boxHeight > state.height - 12
        ) {
          continue;
        }
        const direction = pin.dx < 0 ? -1 : 1;
        const baseX =
          point.x + pin.dx + (direction < 0 ? -boxWidth : 0);
        const baseY = point.y + pin.dy - boxHeight / 2;
        const offsets = [
          { x: 0, y: 0 },
          { x: 0, y: -24 },
          { x: 0, y: 24 },
          { x: direction * 18, y: -12 },
          { x: direction * 18, y: 12 },
        ];
        let box: CanvasRect | null = null;
        for (const offset of offsets) {
          const candidate = {
            x: Math.max(
              6,
              Math.min(state.width - boxWidth - 6, baseX + offset.x),
            ),
            y: Math.max(
              6,
              Math.min(state.height - boxHeight - 6, baseY + offset.y),
            ),
            w: boxWidth,
            h: boxHeight,
          };
          if (!placed.some((other) => rectsOverlap(other, candidate, 5))) {
            box = candidate;
            break;
          }
        }
        if (!box) continue;
        placed.push(box);

        const leaderX = Math.max(box.x, Math.min(box.x + box.w, point.x));
        const leaderY = Math.max(box.y, Math.min(box.y + box.h, point.y));
        ctx.strokeStyle = "rgba(239,233,221,0.34)";
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(leaderX, leaderY);
        ctx.stroke();
        ctx.fillStyle = "rgba(8,7,6,0.68)";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeStyle = "rgba(239,233,221,0.2)";
        ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
        ctx.fillStyle = "rgba(239,233,221,0.92)";
        ctx.fillText(pin.label, box.x + 7, box.y + box.h / 2);
      }
      ctx.restore();
    }

    function draw() {
      const currentMetric = metricRef.current;
      const currentQuantiles = activeQuantiles(currentMetric);

      ctx.clearRect(0, 0, state.width, state.height);
      ctx.fillStyle = "#080706";
      ctx.fillRect(0, 0, state.width, state.height);
      for (const block of blocks) {
        if (!active(block)) continue;
        const point = toScreen(block);
        const side = Math.max(2, block.sideWorld * state.camera.scale);
        if (
          point.x + side / 2 < 0 ||
          point.x - side / 2 > state.width ||
          point.y + side / 2 < 0 ||
          point.y - side / 2 > state.height
        ) {
          continue;
        }
        ctx.fillStyle =
          currentMetric === "density" && block.density === null
            ? "rgba(239,233,221,0.12)"
            : thermalRampRGB(currentQuantiles.get(block) ?? 0).fill;
        ctx.fillRect(
          Math.round(point.x - side / 2),
          Math.round(point.y - side / 2),
          Math.max(2, Math.round(side)),
          Math.max(2, Math.round(side)),
        );
      }
      drawPins();
      canvasElement.dataset.rendered = "true";
      canvasElement.dataset.metric = currentMetric;
      canvasElement.dataset.borough = mapBoroughCode(boroughRef.current);
      canvasElement.dataset.colorScale = "quantile";
      canvasElement.dataset.quantileCount = String(currentQuantiles.size);
    }

    function resize() {
      const rect = frameElement.getBoundingClientRect();
      state.width = Math.max(1, Math.round(rect.width));
      state.height = Math.max(1, Math.round(rect.height));
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.round(state.width * state.dpr);
      canvasElement.height = Math.round(state.height * state.dpr);
      canvasElement.style.width = `${state.width}px`;
      canvasElement.style.height = `${state.height}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      state.cityCamera = fitMapCamera(blocks, state.width, state.height);
      if (!state.initialized) {
        state.camera = { ...state.cityCamera };
        if (focus) {
          state.camera.centerX = focus.worldX;
          state.camera.centerY = focus.worldY;
          state.camera.scale = state.cityCamera.scale * 12;
        }
        state.initialized = true;
      }
      draw();
    }

    function reset() {
      state.camera = { ...state.cityCamera };
      setTooltip(null);
      draw();
    }

    function hitAt(x: number, y: number): CityBlock | null {
      const world = toWorld(x, y);
      const candidates = spatialCandidates(spatialHash, world.x, world.y);
      let found: CityBlock | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const block of candidates) {
        if (!active(block)) continue;
        const point = toScreen(block);
        const half = Math.max(4, (block.sideWorld * state.camera.scale) / 2);
        if (
          Math.abs(x - point.x) <= half &&
          Math.abs(y - point.y) <= half
        ) {
          const distance = Math.hypot(x - point.x, y - point.y);
          if (distance < bestDistance) {
            found = block;
            bestDistance = distance;
          }
        }
      }
      return found;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const point = eventPoint(event);
      canvasElement.setPointerCapture(event.pointerId);
      state.pointers.set(event.pointerId, point);
      state.lastX = point.x;
      state.lastY = point.y;
      state.downX = point.x;
      state.downY = point.y;
      state.moved = false;
      if (state.pointers.size === 2) {
        const pointers = [...state.pointers.values()];
        state.pinchDistance = Math.hypot(
          pointers[0].x - pointers[1].x,
          pointers[0].y - pointers[1].y,
        );
        state.pinchScale = state.camera.scale;
        const midpoint = {
          x: (pointers[0].x + pointers[1].x) / 2,
          y: (pointers[0].y + pointers[1].y) / 2,
        };
        const anchor = toWorld(midpoint.x, midpoint.y);
        state.pinchWorldX = anchor.x;
        state.pinchWorldY = anchor.y;
      }
      setTooltip(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const point = eventPoint(event);
      if (state.pointers.has(event.pointerId)) {
        state.pointers.set(event.pointerId, point);
        if (state.pointers.size >= 2) {
          const pointers = [...state.pointers.values()];
          const distance = Math.hypot(
            pointers[0].x - pointers[1].x,
            pointers[0].y - pointers[1].y,
          );
          const midpoint = {
            x: (pointers[0].x + pointers[1].x) / 2,
            y: (pointers[0].y + pointers[1].y) / 2,
          };
          state.camera.scale = Math.max(
            state.cityCamera.scale * 0.65,
            Math.min(
              state.cityCamera.scale * 80,
              state.pinchScale *
                (distance / Math.max(1, state.pinchDistance)),
            ),
          );
          state.camera.centerX =
            state.pinchWorldX -
            (midpoint.x - state.width / 2) / state.camera.scale;
          state.camera.centerY =
            state.pinchWorldY -
            (midpoint.y - state.height / 2) / state.camera.scale;
          state.moved = true;
          draw();
          return;
        }
        const dx = point.x - state.lastX;
        const dy = point.y - state.lastY;
        if (
          state.moved ||
          Math.hypot(point.x - state.downX, point.y - state.downY) > 3
        ) {
          state.moved = true;
          state.camera.centerX -= dx / state.camera.scale;
          state.camera.centerY -= dy / state.camera.scale;
          draw();
        }
        state.lastX = point.x;
        state.lastY = point.y;
        return;
      }

      if (event.pointerType === "touch") return;
      const block = hitAt(point.x, point.y);
      canvasElement.style.cursor = block ? "pointer" : "grab";
      setTooltip(
        block
          ? {
              block,
              address: addresses.get(cityBlockKey(block.boro, block.block)),
              x: point.x,
              y: point.y,
            }
          : null,
      );
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const point = eventPoint(event);
      const shouldOpen =
        !state.moved &&
        Math.hypot(point.x - state.downX, point.y - state.downY) <= 5 &&
        state.pointers.size === 1;
      state.pointers.delete(event.pointerId);
      state.pinchDistance = 0;
      if (shouldOpen) {
        const block = hitAt(point.x, point.y);
        if (block) {
          window.location.assign(`/b/${block.boro}/${block.block}`);
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = eventPoint(event);
      const anchor = toWorld(point.x, point.y);
      const factor = Math.exp(-event.deltaY * 0.0012);
      state.camera.scale = Math.max(
        state.cityCamera.scale * 0.65,
        Math.min(state.cityCamera.scale * 80, state.camera.scale * factor),
      );
      state.camera.centerX =
        anchor.x - (point.x - state.width / 2) / state.camera.scale;
      state.camera.centerY =
        anchor.y - (point.y - state.height / 2) / state.camera.scale;
      setTooltip(null);
      draw();
    };

    canvasElement.addEventListener("pointerdown", handlePointerDown, { signal });
    canvasElement.addEventListener("pointermove", handlePointerMove, { signal });
    canvasElement.addEventListener("pointerup", handlePointerEnd, { signal });
    canvasElement.addEventListener("pointercancel", handlePointerEnd, { signal });
    canvasElement.addEventListener("pointerleave", () => setTooltip(null), {
      signal,
    });
    canvasElement.addEventListener("wheel", handleWheel, {
      signal,
      passive: false,
    });
    const observer = new ResizeObserver(resize);
    observer.observe(frameElement);
    drawRef.current = draw;
    resetRef.current = reset;
    resize();

    return () => {
      controller.abort();
      observer.disconnect();
      drawRef.current = null;
      resetRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    setTooltip(null);
    drawRef.current?.();
  }, [borough, metric]);

  const topBlocks = useMemo(
    () =>
      load.state === "ready"
        ? rankMapBlocks(load.blocks, metric, borough)
        : [],
    [borough, load, metric],
  );
  const legendAnchors = useMemo(
    () =>
      load.state === "ready"
        ? mapMetricPercentiles(load.blocks, metric, borough)
        : [],
    [borough, load, metric],
  );

  return (
    <>
      <section className="map-register" aria-labelledby="map-register-title">
        <div className="map-toolbar">
          <div className="map-toolbar-title">
            <h2 id="map-register-title">CITY MAP</h2>
            <p>
              {load.state === "ready"
                ? `${load.blocks.length.toLocaleString("en-US")} located · ${(registerCount - load.blocks.length).toLocaleString("en-US")} without coordinates`
                : `${registerCount.toLocaleString("en-US")} blocks on register`}
            </p>
          </div>
          <div
            className="map-metric-switch"
            role="group"
            aria-label="Map value measure"
          >
            <button
              aria-pressed={metric === "total"}
              onClick={() => updateMapView("total", borough)}
              type="button"
            >
              TOTAL VALUE
            </button>
            <button
              aria-pressed={metric === "density"}
              onClick={() => updateMapView("density", borough)}
              type="button"
            >
              PER SQUARE FOOT
            </button>
          </div>
          <div
            aria-label="Filter map by borough"
            className="borough-filters"
            role="group"
          >
            {BOROUGH_FILTERS.map((filter) => (
              <button
                aria-pressed={borough === filter.value}
                disabled={load.state !== "ready"}
                key={filter.label}
                onClick={() => updateMapView(metric, filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <button
            className="map-reset"
            disabled={load.state !== "ready"}
            onClick={() => resetRef.current?.()}
            type="button"
          >
            CITY VIEW
          </button>
        </div>

        <div className="city-map-frame" ref={frameRef}>
          {load.state === "loading" ? (
            <p className="map-notice" aria-live="polite">
              PLOTTING THE TAX MAP…
            </p>
          ) : null}
          {load.state === "error" ? (
            <p className="map-notice" role="alert">
              THE TAX MAP COULD NOT BE OPENED.
            </p>
          ) : null}
          <canvas
            aria-label="Interactive map of New York City tax blocks. Use the ranked links below for a keyboard-accessible register."
            className="city-map-canvas"
            data-borough={mapBoroughCode(borough)}
            data-color-scale="quantile"
            data-metric={metric}
            data-quantile-count="0"
            data-rendered="false"
            ref={canvasRef}
          />
          {tooltip ? (
            <div
              className="map-tooltip"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              <strong>
                {BOROUGHS[String(tooltip.block.boro) as keyof typeof BOROUGHS]
                  .code}{" "}
                · BLOCK {tooltip.block.block}
              </strong>
              <span>{tooltip.address || "ADDRESS NOT FILED"}</span>
              <span>
                {formatAssessedValue(tooltip.block.totalM * 1_000_000)}
              </span>
              <span>{formatDensity(tooltip.block.density)}</span>
            </div>
          ) : null}
        </div>
        <div className="map-legend" aria-label="Map legend">
          <div className="map-legend-scale">
            <span>PERCENTILE RANK</span>
            <i aria-hidden="true" />
            <div className="map-legend-anchors">
              {legendAnchors.map((anchor) => (
                <span key={anchor.percentile}>
                  {anchor.percentile === 0.5
                    ? "MEDIAN"
                    : `P${Math.round(anchor.percentile * 100)}`}{" "}
                  {legendValue(anchor.value, metric)}
                </span>
              ))}
            </div>
          </div>
          <span className="map-legend-hint">
            DRAG TO PAN · SCROLL OR PINCH TO ZOOM
          </span>
        </div>
      </section>

      <section className="map-access-list" aria-labelledby="map-list-title">
        <div>
          <p className="eyebrow">KEYBOARD REGISTER</p>
          <h2 id="map-list-title">
            TOP 50 ·{" "}
            {metric === "total" ? "TOTAL VALUE" : "PER SQUARE FOOT"}
          </h2>
        </div>
        {load.state === "ready" ? (
          <ol>
            {topBlocks.map((block) => (
              <li key={cityBlockKey(block.boro, block.block)}>
                <a href={`/b/${block.boro}/${block.block}`}>
                  <span>
                    {
                      BOROUGHS[
                        String(block.boro) as keyof typeof BOROUGHS
                      ].code
                    }{" "}
                    · BLOCK {block.block}
                  </span>
                  <strong>{metricLabel(block, metric)}</strong>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rank-notice">THE REGISTER OPENS WITH THE MAP.</p>
        )}
      </section>
    </>
  );
}
