"use client";

import { useEffect, useRef, useState } from "react";
import type { BlockPayload, Lot } from "@/lib/schema";
import { boroughName } from "@/lib/borough";
import { CANVAS_COLORS, TOKENS } from "@/lib/tokens";
import { thermalRGB } from "@/lib/viz/color";
import {
  builtHeight,
  ghostHeight,
  hasGhostMassing,
  permittedHeight,
} from "@/lib/viz/ghost";
import {
  computeOrigin,
  hScale,
  project as projectPoint,
  recomputeFit as computeFit,
} from "@/lib/viz/projection";
import { layoutTreemap } from "@/lib/viz/treemap";
import type {
  FitState,
  ProjectedPoint,
  ThermalDistrict,
  TreemapCell,
} from "@/lib/viz/types";

type VizMode = "iso" | "thermal";

type IsoLabelJob = {
  x: number;
  y: number;
  text: string;
  tag: string;
  color: string;
  priority: number;
  alpha: number;
  quiet: boolean;
};

type LabelLine = {
  text: string;
  font: string;
  color: string;
};

type LabelCandidate = {
  lines: LabelLine[];
  padX: number;
  padY: number;
  lineH: number;
  micro?: boolean;
};

const F = {
  labelPills: true,
  thermalFill: true,
  fogMaterials: true,
  idleOrbit: true,
  aabbFit: true,
  groundShadow: true,
  specular: true,
  windows: true,
  depthFog: true,
  thermalReveal: true,
} as const;

function EmptyBlockViz({
  blind = false,
  payload,
}: {
  blind?: boolean;
  payload?: BlockPayload;
}) {
  const [mode, setMode] = useState<VizMode>("iso");
  const thermal = mode === "thermal";

  if (blind) {
    return (
      <section
        className="viz-shell"
        data-blind="true"
        data-mode="iso"
        data-rendered="true"
        data-reduced-motion="true"
      >
        <div className="iso-panel">
          <canvas
            width="900"
            height="440"
            aria-label={`Schematic skyline of a ${
              boroughName(payload?.borough ?? "") ?? payload?.borough ?? "NYC"
            } tax block`}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className={`viz-shell${thermal ? " is-thermal" : ""}`}
      data-mode={mode}
      data-rendered="true"
      data-reduced-motion="true"
    >
      <div className="viz-toolbar">
        <div className="viz-toolbar-title">
          No assessed value on this roll
        </div>
        <div className="mode-switch" role="tablist" aria-label="Visualization mode">
          <button
            type="button"
            role="tab"
            aria-selected={!thermal}
            tabIndex={thermal ? -1 : 0}
            onClick={() => setMode("iso")}
          >
            Skyline
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={thermal}
            tabIndex={thermal ? 0 : -1}
            onClick={() => setMode("thermal")}
          >
            Thermal
          </button>
        </div>
      </div>
      <div className={`iso-panel${thermal ? " is-thermal" : ""}`} role="tabpanel">
        <div className="empty-character">
          <div>
            <h2>No assessed value on this roll</h2>
            <p>
              The tax lot is present in the final roll, but its filed assessed
              market value is zero. There is no value geometry to draw.
            </p>
          </div>
        </div>
      </div>
      <div className="thermal-footer">
        <div className="thermal-legend">
          <span>
            <i className="legend-zero" />
            no assessed value on this roll
          </span>
        </div>
        <div className="thermal-meta">1 group · every group shown</div>
      </div>
    </section>
  );
}

interface BlockVizProps {
  payload: BlockPayload;
  blind?: boolean;
  ghostCaveat?: string;
}

export function BlockViz({
  payload,
  blind = false,
  ghostCaveat,
}: BlockVizProps) {
  const ghostEnabled =
    !blind && Boolean(ghostCaveat) && hasGhostMassing(payload);
  if (payload.totalMv === 0 && !ghostEnabled) {
    return <EmptyBlockViz blind={blind} payload={payload} />;
  }
  return (
    <CanvasBlockViz
      payload={payload}
      blind={blind}
      ghostCaveat={ghostCaveat}
      ghostEnabled={ghostEnabled}
    />
  );
}

function CanvasBlockViz({
  payload,
  blind,
  ghostCaveat,
  ghostEnabled,
}: {
  payload: BlockPayload;
  blind: boolean;
  ghostCaveat?: string;
  ghostEnabled: boolean;
}) {
  const shellRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const emptyOverlayRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const isoButtonRef = useRef<HTMLButtonElement>(null);
  const thermalButtonRef = useRef<HTMLButtonElement>(null);
  const builtButtonRef = useRef<HTMLButtonElement>(null);
  const permittedButtonRef = useRef<HTMLButtonElement>(null);
  const hudHintRef = useRef<HTMLSpanElement>(null);
  const hudModeRef = useRef<HTMLSpanElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = shellRef.current!;
    const panel = panelRef.current!;
    const canvas = canvasRef.current!;
    const emptyOverlay = emptyOverlayRef.current;
    const title = titleRef.current!;
    const isoButton = isoButtonRef.current!;
    const thermalButton = thermalButtonRef.current!;
    const builtButton = builtButtonRef.current;
    const permittedButton = permittedButtonRef.current;
    const hudHint = hudHintRef.current!;
    const hudMode = hudModeRef.current!;
    const meta = metaRef.current!;
    if (
      !shell ||
      !panel ||
      !canvas ||
      !title ||
      !isoButton ||
      !thermalButton ||
      !hudHint ||
      !hudMode ||
      !meta
    ) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const controller = new AbortController();
    const { signal } = controller;
    const stateRef = {
      current: {
        mode: "iso" as VizMode,
        angle: -0.72,
        baseAngle: -0.72,
        baseTilt: 0.58,
        tilt: 0.58,
        userZoom: 1,
        fit: {
          origin: computeOrigin(payload.lots),
          fitScale: 1,
          fitPanX: 0,
          fitPanY: 0,
        } satisfies FitState,
        fitKey: "",
        drag: false,
        dragPointerType: "",
        lx: 0,
        ly: 0,
        pointerStartX: 0,
        pointerStartY: 0,
        rise: 1,
        thermalT: 1,
        ghostT: 0,
        ghostTarget: 0,
        idle: 0,
        raf: 0,
        cssH: 440,
        thermalCells: [] as TreemapCell[],
        thermalDistricts: [] as ThermalDistrict[],
        hoverCell: null as TreemapCell | null,
        pinnedLot: null as Lot | null,
        angVel: 0,
        reduceMotion: media.matches,
        visible: true,
        lastInteraction: performance.now(),
        activePointers: new Map<number, { x: number; y: number }>(),
        pinchDistance: 0,
        pinchZoom: 1,
        isoValueLabels: new Set<Lot>(),
        isoLabelJobs: [] as IsoLabelJob[],
        disposed: false,
      },
    };
    const state = stateRef.current;

    function resizeCanvas() {
      const rect = panel.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const cssHeight = Math.max(300, Math.min(440, rect.height || 440));
      state.cssH = cssHeight;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.height = cssHeight + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.fitKey = "";
    }

    function projectionState() {
      return {
        ...state.fit,
        angle: state.angle,
        tilt: state.tilt,
        userZoom: state.userZoom,
        canvasWidth: canvas.clientWidth,
        canvasHeight: state.cssH,
      };
    }

    function project(x: number, y: number, z: number): ProjectedPoint {
      return projectPoint(x, y, z, projectionState());
    }

    function recomputeFit() {
      const fitPermitted = ghostEnabled && state.ghostTarget === 1;
      const key = [
        payload.bblPrefix,
        payload.lots.length,
        canvas.clientWidth,
        state.cssH,
        state.userZoom.toFixed(4),
        fitPermitted ? "permitted" : "built",
      ].join(":");
      if (key === state.fitKey) return;
      state.fit = computeFit(
        payload.lots,
        canvas.clientWidth,
        state.cssH,
        state.angle,
        state.tilt,
        state.userZoom,
        fitPermitted ? permittedHeight : undefined,
      );
      state.fitKey = key;
    }

    function drawLabel(px: number, py: number, text: string, color: string) {
      ctx.font = "700 12px Barlow Condensed, sans-serif";
      ctx.textAlign = "center";
      const tw = ctx.measureText(text).width;
      if (F.labelPills) {
        const padX = 7;
        ctx.fillStyle = "rgba(8,7,6,0.58)";
        const rx = px - tw / 2 - padX;
        const ry = py - 11;
        const rw = tw + padX * 2;
        const rh = 16;
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(rx + r, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
        ctx.arcTo(rx, ry + rh, rx, ry, r);
        ctx.arcTo(rx, ry, rx + rw, ry, r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.fillText(text, px, py);
    }

    /** Staggered rise: specials & whales first, mids settle after (hierarchy in time). */
    function lotRise(v: number, flags: Lot, maxV: number) {
      if (state.reduceMotion || state.rise >= 0.999) return 1;
      // hierarchy in time: specials first, then by log-value; snappier settle
      let delay = 0.06 + (1 - Math.min(1, Math.log10(v + 1) / Math.log10(maxV + 1))) * 0.28;
      if (flags.you) delay = 0.0;
      else if (flags.club) delay = 0.025;
      const span = Math.max(0.18, 1 - delay * 0.9);
      const t = Math.max(0, (state.rise - delay) / span);
      return easeOutQuart(Math.min(1, t));
    }

    function drawBuilding(c: number, r: number, v: number, flags: Lot, maxV: number, bloomPass: boolean) {
      const base = 0.62;
      const localRise = lotRise(v, flags, maxV);
      if (localRise < 0.02 && !bloomPass) return;
      const H = hScale(v) * localRise;
      const x0 = c, y0 = r;
      // short plinth — refined city-block craft (not a gimmick)
      const ph = Math.min(H * 0.12, Math.max(1.6 * localRise, 2.2 * localRise));
      const pb = base + 0.06; // plinth slightly wider
      const px0 = x0 - 0.03, py0 = y0 - 0.03;
      const corners = [
        [x0, y0, ph], [x0 + base, y0, ph], [x0 + base, y0 + base, ph], [x0, y0 + base, ph],
        [x0, y0, H], [x0 + base, y0, H], [x0 + base, y0 + base, H], [x0, y0 + base, H],
      ].map(([x, y, z]) => project(x, y, z));
      const plinth = [
        [px0, py0, 0], [px0 + pb, py0, 0], [px0 + pb, py0 + pb, 0], [px0, py0 + pb, 0],
        [px0, py0, ph], [px0 + pb, py0, ph], [px0 + pb, py0 + pb, ph], [px0, py0 + pb, ph],
      ].map(([x, y, z]) => project(x, y, z));

      // soft ground contact — tight matte, not shadow blob
      if (F.groundShadow && !bloomPass) {
        const g0 = project(x0 + 0.31, y0 + 0.31, 0);
        const rad = 7 + H * 0.028;
        const sg = ctx.createRadialGradient(g0.x, g0.y, 0.4, g0.x + 1.5, g0.y + 2.5, rad);
        sg.addColorStop(0, "rgba(0,0,0,0.34)");
        sg.addColorStop(0.5, "rgba(0,0,0,0.1)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.ellipse(g0.x + 1.5, g0.y + 2.5, rad * 1.05, rad * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      function mixHex(hex: string, m: number) {
        // accepts #rrggbb or rgb()
        if (hex.startsWith("rgb")) {
          const m2 = hex.match(/[\d.]+/g);
          if (!m2) return hex;
          const r = Math.min(255, Math.round(+m2[0] * m));
          const g = Math.min(255, Math.round(+m2[1] * m));
          const b = Math.min(255, Math.round(+m2[2] * m));
          return `rgb(${r},${g},${b})`;
        }
        const n = parseInt(hex.slice(1), 16);
        const r = Math.min(255, Math.round(((n >> 16) & 255) * m));
        const g = Math.min(255, Math.round(((n >> 8) & 255) * m));
        const b = Math.min(255, Math.round((n & 255) * m));
        return `rgb(${r},${g},${b})`;
      }

      const face = (idxs: number[], fill: string, edgeA?: number, verticalShade?: boolean) => {
        ctx.beginPath();
        idxs.forEach((i, n) => {
          const p = corners[i];
          n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
        });
        ctx.closePath();
        if (verticalShade && F.fogMaterials && !bloomPass) {
          // refined isometric craft: lighter near roof, denser at plinth
          const ys = idxs.map((i) => corners[i].y);
          const yMin = Math.min(...ys), yMax = Math.max(...ys);
          const xs = idxs.map((i) => corners[i].x);
          const xMid = (Math.min(...xs) + Math.max(...xs)) / 2;
          const grad = ctx.createLinearGradient(xMid, yMin, xMid, yMax);
          grad.addColorStop(0, mixHex(fill, 1.08));
          grad.addColorStop(0.55, fill);
          grad.addColorStop(1, mixHex(fill, 0.78));
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = fill;
        }
        ctx.fill();
        if (F.fogMaterials && !bloomPass) {
          ctx.strokeStyle = `rgba(0,0,0,${edgeA == null ? 0.22 : edgeA})`;
          ctx.lineWidth = 0.65;
          ctx.stroke();
        }
      };

      // Directional key light from northwest — clearer massing as you orbit
      const light = 0.5 + 0.5 * Math.cos(state.angle + 0.9);
      const shadeL = 0.9 + light * 0.16;
      const shadeR = 0.72 + (1 - light) * 0.18;
      const shadeT = 1.06;

      function shadeHex(hex: string, m: number) {
        return mixHex(hex, m);
      }

      let top: string, left: string, right: string;
      if (flags.you) {
        // restrained cyan stone — identity without plastic sheen
        top = shadeHex(CANVAS_COLORS.youTop, shadeT);
        left = shadeHex(CANVAS_COLORS.youLeft, shadeL);
        right = shadeHex(CANVAS_COLORS.youRight, shadeR);
      } else if (flags.club) {
        top = shadeHex(CANVAS_COLORS.clubTop, shadeT);
        left = shadeHex(CANVAS_COLORS.clubLeft, shadeL);
        right = shadeHex(CANVAS_COLORS.clubRight, shadeR);
      } else {
        // limestone → warm ash by value (matte architecture; clearer L/R faces)
        const t = 0.2 + (Math.log10(v + 1) / Math.log10(maxV + 1)) * 0.52;
        const L = 92 + t * 82;
        top = `rgb(${Math.round(L * 0.97 * shadeT)},${Math.round(L * 0.92 * shadeT)},${Math.round(L * 0.84 * shadeT)})`;
        left = `rgb(${Math.round(L * 0.72 * shadeL)},${Math.round(L * 0.68 * shadeL)},${Math.round(L * 0.6 * shadeL)})`;
        right = `rgb(${Math.round(L * 0.46 * shadeR)},${Math.round(L * 0.43 * shadeR)},${Math.round(L * 0.38 * shadeR)})`;
      }

      if (bloomPass) {
        if (!(flags.you || flags.club)) return;
        ctx.globalCompositeOperation = "lighter";
        face([4, 5, 6, 7], flags.you ? "rgba(110,200,230,0.28)" : "rgba(230,190,90,0.22)");
        face([0, 1, 5, 4], flags.you ? "rgba(60,150,200,0.08)" : "rgba(200,140,50,0.06)");
        ctx.globalCompositeOperation = "source-over";
        return;
      }

      // plinth first — short stone base, miniature diorama craft
      {
        const saved = corners.slice();
        for (let i = 0; i < 8; i++) corners[i] = plinth[i];
        const pTop = mixHex(CANVAS_COLORS.plinthTop, 0.96);
        const pL = mixHex(CANVAS_COLORS.plinthLeft, shadeL * 0.92);
        const pR = mixHex(CANVAS_COLORS.plinthRight, shadeR * 0.92);
        face([0, 1, 5, 4], pL, 0.28, false);
        face([1, 2, 6, 5], pR, 0.34, false);
        face([4, 5, 6, 7], pTop, 0.2, false);
        // plinth top rim hairline
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(plinth[4].x, plinth[4].y);
        ctx.lineTo(plinth[5].x, plinth[5].y);
        ctx.lineTo(plinth[6].x, plinth[6].y);
        ctx.lineTo(plinth[7].x, plinth[7].y);
        ctx.closePath();
        ctx.stroke();
        for (let i = 0; i < 8; i++) corners[i] = saved[i];
      }

      face([0, 1, 5, 4], left, 0.2, true);
      face([1, 2, 6, 5], right, 0.28, true);
      face([4, 5, 6, 7], top, 0.12, false);

      // vertical massing seam — left/right face join (architecture, not FX)
      if (F.fogMaterials && H > 12 && !bloomPass) {
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[5].x, corners[5].y);
        ctx.stroke();
        // soft highlight on leading edge
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[4].x, corners[4].y);
        ctx.stroke();
      }

      // quiet roof ridge line — craft, not glow
      if (F.fogMaterials && H > 14) {
        const t0 = corners[4], t1 = corners[5];
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.stroke();
      }

      // massing setbacks — base / shaft / crown craft (not FX)
      if (H > 32 && !bloomPass) {
        const tall = H > 48;
        const inset = tall ? 0.14 : 0.1;
        const midZ = ph + (H - ph) * (tall ? 0.56 : 0.62);
        const ux0 = x0 + inset, uy0 = y0 + inset, ub = base - inset * 2;
        const upper = [
          [ux0, uy0, midZ], [ux0 + ub, uy0, midZ], [ux0 + ub, uy0 + ub, midZ], [ux0, uy0 + ub, midZ],
          [ux0, uy0, H], [ux0 + ub, uy0, H], [ux0 + ub, uy0 + ub, H], [ux0, uy0 + ub, H],
        ].map(([x, y, z]) => project(x, y, z));
        const saved = corners.slice();
        for (let i = 0; i < 8; i++) corners[i] = upper[i];
        face([0, 1, 5, 4], mixHex(left, 1.05), 0.18, true);
        face([1, 2, 6, 5], mixHex(right, 1.03), 0.24, true);
        face([4, 5, 6, 7], mixHex(top, 1.03), 0.1, false);
        // terrace ring at setback
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(upper[0].x, upper[0].y);
        ctx.lineTo(upper[1].x, upper[1].y);
        ctx.lineTo(upper[2].x, upper[2].y);
        ctx.lineTo(upper[3].x, upper[3].y);
        ctx.closePath();
        ctx.stroke();
        // quiet cornice on specials
        if (flags.you || flags.club) {
          ctx.strokeStyle = flags.you ? "rgba(180,220,235,0.2)" : "rgba(230,200,130,0.18)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        for (let i = 0; i < 8; i++) corners[i] = saved[i];
      }

      // façade craft — floor bands + regular window grid (matte, not sparkle)
      if (F.windows && H > 18 && !bloomPass) {
        const seed = (c * 17 + r * 31 + Math.floor(v)) % 97;
        const facePts = [corners[0], corners[1], corners[5], corners[4]];
        const cols = H > 40 ? 4 : 3;
        const maxV0 = H > 48 ? 0.48 : H > 32 ? 0.58 : 0.78;
        const floors = Math.min(9, Math.max(2, Math.floor(H / 11)));
        const winW = H > 40 ? 1.3 : 1.5;
        const winH = H > 40 ? 1.75 : 2.0;
        // horizontal floor lines — architectural structure without glow
        if (H > 24) {
          ctx.save();
          ctx.strokeStyle = flags.you
            ? "rgba(80,130,150,0.12)"
            : flags.club
              ? "rgba(90,70,30,0.14)"
              : "rgba(0,0,0,0.16)";
          ctx.lineWidth = 0.6;
          for (let fl = 1; fl < floors; fl++) {
            const vLine = 0.14 + fl * ((maxV0 - 0.14) / Math.max(1, floors));
            const a = {
              x: facePts[0].x * (1 - 0.12) * (1 - vLine) + facePts[1].x * 0.12 * (1 - vLine) + facePts[2].x * 0.12 * vLine + facePts[3].x * (1 - 0.12) * vLine,
              y: facePts[0].y * (1 - 0.12) * (1 - vLine) + facePts[1].y * 0.12 * (1 - vLine) + facePts[2].y * 0.12 * vLine + facePts[3].y * (1 - 0.12) * vLine,
            };
            const b = {
              x: facePts[0].x * (1 - 0.88) * (1 - vLine) + facePts[1].x * 0.88 * (1 - vLine) + facePts[2].x * 0.88 * vLine + facePts[3].x * (1 - 0.88) * vLine,
              y: facePts[0].y * (1 - 0.88) * (1 - vLine) + facePts[1].y * 0.88 * (1 - vLine) + facePts[2].y * 0.88 * vLine + facePts[3].y * (1 - 0.88) * vLine,
            };
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          // sparse vertical mullions
          ctx.strokeStyle = flags.you
            ? "rgba(60,110,130,0.1)"
            : "rgba(0,0,0,0.12)";
          for (let col = 1; col < cols; col++) {
            const u = 0.16 + col * (0.68 / Math.max(1, cols));
            const upperPoint = {
              x: facePts[0].x * (1 - u) * (1 - 0.12) + facePts[1].x * u * (1 - 0.12) + facePts[2].x * u * 0.12 + facePts[3].x * (1 - u) * 0.12,
              y: facePts[0].y * (1 - u) * (1 - 0.12) + facePts[1].y * u * (1 - 0.12) + facePts[2].y * u * 0.12 + facePts[3].y * (1 - u) * 0.12,
            };
            const bot = {
              x: facePts[0].x * (1 - u) * (1 - maxV0) + facePts[1].x * u * (1 - maxV0) + facePts[2].x * u * maxV0 + facePts[3].x * (1 - u) * maxV0,
              y: facePts[0].y * (1 - u) * (1 - maxV0) + facePts[1].y * u * (1 - maxV0) + facePts[2].y * u * maxV0 + facePts[3].y * (1 - u) * maxV0,
            };
            ctx.beginPath();
            ctx.moveTo(upperPoint.x, upperPoint.y);
            ctx.lineTo(bot.x, bot.y);
            ctx.stroke();
          }
          ctx.restore();
        }
        for (let row = 0; row < floors; row++) {
          for (let col = 0; col < cols; col++) {
            // rare empty pane — mostly regular grid
            if ((seed + row * 5 + col * 2) % 19 === 0) continue;
            const u = 0.16 + col * (0.68 / Math.max(1, cols - 1));
            const v0 = 0.14 + row * ((maxV0 - 0.14) / Math.max(1, floors - 1));
            const px =
              facePts[0].x * (1 - u) * (1 - v0) +
              facePts[1].x * u * (1 - v0) +
              facePts[2].x * u * v0 +
              facePts[3].x * (1 - u) * v0;
            const py =
              facePts[0].y * (1 - u) * (1 - v0) +
              facePts[1].y * u * (1 - v0) +
              facePts[2].y * u * v0 +
              facePts[3].y * (1 - u) * v0;
            // mostly unlit matte panes; very few soft lights
            const lit = (seed + row * 3 + col) % 9 === 0;
            ctx.fillStyle = flags.you
              ? lit
                ? "rgba(140,205,225,0.18)"
                : "rgba(28,56,72,0.24)"
              : flags.club
                ? lit
                  ? "rgba(255,230,180,0.1)"
                  : "rgba(28,20,10,0.22)"
                : lit
                  ? "rgba(255,240,210,0.08)"
                  : "rgba(16,14,12,0.2)";
            ctx.fillRect(px - winW / 2, py - winH / 2, winW, winH);
          }
        }
      }

      // restrained roof specular — matte stone sheen only (not glass sparkle)
      if (F.specular && H > 16) {
        const t0 = corners[4], t1 = corners[5], t2 = corners[6], t3 = corners[7];
        const mx = (t0.x + t1.x + t2.x + t3.x) / 4;
        const my = (t0.y + t1.y + t2.y + t3.y) / 4;
        const sp = ctx.createRadialGradient(mx - 1.5, my - 1.5, 0, mx, my, 8);
        const peak = flags.you || flags.club ? 0.1 : 0.06;
        sp.addColorStop(0, `rgba(255,255,255,${peak})`);
        sp.addColorStop(0.55, "rgba(255,255,255,0.02)");
        sp.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sp;
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.lineTo(t3.x, t3.y);
        ctx.closePath();
        ctx.fill();
      }

      // hairline crown edge for specials — identity without bloom
      if ((flags.you || flags.club) && F.fogMaterials && H > 10) {
        ctx.strokeStyle = flags.you ? "rgba(160,220,240,0.28)" : "rgba(230,200,120,0.26)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(corners[4].x, corners[4].y);
        ctx.lineTo(corners[5].x, corners[5].y);
        ctx.lineTo(corners[6].x, corners[6].y);
        ctx.lineTo(corners[7].x, corners[7].y);
        ctx.closePath();
        ctx.stroke();
      }

      if (state.isoValueLabels.has(flags) && localRise > 0.82) {
        const topY = Math.min(corners[4].y, corners[5].y, corners[6].y, corners[7].y);
        const cx = (corners[4].x + corners[6].x) / 2;
        const label = v >= 100 ? "$" + Math.round(v) + "M" : "$" + (v % 1 ? v.toFixed(1) : v) + "M";
        const tag = flags.you ? "YOU" : (flags.club ? "$50M" : "");
        state.isoLabelJobs.push({
          x: Math.min(canvas.clientWidth - 48, Math.max(48, cx)),
          y: Math.max(16, topY - 12),
          text: label,
          tag,
          color: flags.you ? CANVAS_COLORS.youLabel : flags.club ? CANVAS_COLORS.clubLabel : "rgba(236,228,214,0.88)",
          priority: flags.you ? 1e9 : v,
          alpha: Math.min(1, (localRise - 0.82) / 0.18) * (tag ? 1 : 0.92),
          quiet: !tag,
        });
      }
    }

    function drawGhost(lot: Lot, maxV: number) {
      if (!ghostEnabled || state.ghostT <= 0.001) return;
      const extraHeight = ghostHeight(lot.ghost) * state.ghostT;
      if (extraHeight <= 0.01) return;

      const base = 0.62;
      const localRise = lotRise(lot.v, lot, maxV);
      const z0 =
        payload.totalMv === 0 ? 0 : builtHeight(lot) * localRise;
      const z1 = z0 + extraHeight;
      const corners = [
        [lot.c, lot.r, z0],
        [lot.c + base, lot.r, z0],
        [lot.c + base, lot.r + base, z0],
        [lot.c, lot.r + base, z0],
        [lot.c, lot.r, z1],
        [lot.c + base, lot.r, z1],
        [lot.c + base, lot.r + base, z1],
        [lot.c, lot.r + base, z1],
      ].map(([x, y, z]) => project(x, y, z));

      const face = (indices: number[], fill: string) => {
        ctx.beginPath();
        indices.forEach((index, pointIndex) => {
          const point = corners[index];
          if (pointIndex === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };

      ctx.save();
      face([0, 1, 5, 4], "rgba(153,184,187,0.105)");
      face([1, 2, 6, 5], "rgba(116,151,157,0.075)");
      face([4, 5, 6, 7], "rgba(190,211,211,0.14)");

      ctx.strokeStyle = "rgba(216,229,226,0.3)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(corners[4].x, corners[4].y);
      ctx.lineTo(corners[5].x, corners[5].y);
      ctx.lineTo(corners[6].x, corners[6].y);
      ctx.lineTo(corners[7].x, corners[7].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    function flushIsoLabels() {
      if (!state.isoLabelJobs.length) return;
      state.isoLabelJobs.sort((a, b) => b.priority - a.priority);
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const W = canvas.clientWidth;
      ctx.font = "700 12px Barlow Condensed, sans-serif";
      state.isoLabelJobs.forEach((job) => {
        const isSpecial = job.tag === "YOU" || job.tag === "$50M";
        // measure actual plate footprint so collision uses real bounds
        let needW, needH;
        if (isSpecial) {
          ctx.font = "700 8px Libre Franklin, sans-serif";
          const tagW = ctx.measureText(job.tag).width;
          ctx.font = "700 12px Barlow Condensed, sans-serif";
          const valW = ctx.measureText(job.text).width;
          needW = Math.max(tagW, valW) + 16;
          needH = 28;
        } else if (job.quiet) {
          ctx.font = "600 11px Barlow Condensed, sans-serif";
          needW = ctx.measureText(job.text).width + 12;
          needH = 15;
        } else {
          ctx.font = "700 12px Barlow Condensed, sans-serif";
          needW = ctx.measureText(job.text).width + 14;
          needH = 18;
        }
        const baseX = job.x - needW / 2;
        const baseY = job.y - (isSpecial ? 18 : 12);
        let box: { x: number; y: number; w: number; h: number } | null = null;
        // cascade: up, side, down — specials get more tries
        const steps = isSpecial ? 9 : 6;
        const offsets: { dx: number; dy: number }[] = [];
        for (let n = 0; n < steps; n++) {
          offsets.push({ dx: 0, dy: -n * 16 });
          offsets.push({ dx: 14, dy: -n * 13 });
          offsets.push({ dx: -14, dy: -n * 13 });
          if (n > 0) {
            offsets.push({ dx: 22, dy: -n * 8 });
            offsets.push({ dx: -22, dy: -n * 8 });
          }
        }
        offsets.push({ dx: 0, dy: 18 }, { dx: 16, dy: 14 }, { dx: -16, dy: 14 });
        for (let i = 0; i < offsets.length; i++) {
          const test = {
            x: Math.max(4, Math.min(W - needW - 4, baseX + offsets[i].dx)),
            y: Math.max(4, Math.min(state.cssH - needH - 4, baseY + offsets[i].dy)),
            w: needW,
            h: needH,
          };
          if (!placed.some((p) => rectsOverlap(p, test, 4))) {
            box = test;
            break;
          }
        }
        if (!box) return;
        placed.push(box);
        ctx.save();
        ctx.globalAlpha = job.alpha == null ? 1 : job.alpha;
        const lx = box.x + box.w / 2;
        if (isSpecial) {
          const tag = job.tag;
          const bw = box.w;
          const bh = box.h;
          const bx = box.x;
          const by = box.y;
          ctx.fillStyle = "rgba(8,7,6,0.58)";
          const r = 4;
          ctx.beginPath();
          ctx.moveTo(bx + r, by);
          ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
          ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
          ctx.arcTo(bx, by + bh, bx, by, r);
          ctx.arcTo(bx, by, bx + bw, by, r);
          ctx.closePath();
          ctx.fill();
          ctx.textAlign = "center";
          ctx.font = "700 8px Libre Franklin, sans-serif";
          ctx.fillStyle = tag === "YOU" ? "rgba(184,228,244,0.85)" : "rgba(237,217,160,0.85)";
          ctx.fillText(tag, bx + bw / 2, by + 10);
          ctx.font = "700 12px Barlow Condensed, sans-serif";
          ctx.fillStyle = job.color;
          ctx.fillText(job.text, bx + bw / 2, by + 22);
        } else if (job.quiet) {
          const bw = box.w;
          const bh = box.h;
          const bx = box.x;
          const by = box.y;
          ctx.fillStyle = "rgba(8,7,6,0.42)";
          const r = 3;
          ctx.beginPath();
          ctx.moveTo(bx + r, by);
          ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
          ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
          ctx.arcTo(bx, by + bh, bx, by, r);
          ctx.arcTo(bx, by, bx + bw, by, r);
          ctx.closePath();
          ctx.fill();
          ctx.textAlign = "center";
          ctx.font = "600 11px Barlow Condensed, sans-serif";
          ctx.fillStyle = job.color;
          ctx.fillText(job.text, bx + bw / 2, by + 11);
        } else {
          drawLabel(lx, box.y + 13, job.text, job.color);
        }
        ctx.restore();
      });
      state.isoLabelJobs = [];
    }

    function drawIso() {
      const w = canvas.clientWidth;
      const h = state.cssH;
      state.isoLabelJobs = [];
      // value labels: specials always + top mid towers (restrained hierarchy)
      if (!blind) {
        const maxV0 = Math.max(...payload.lots.map((l) => l.v));
        const ranked = [...payload.lots].sort((a, b) => b.v - a.v);
        state.isoValueLabels = new Set();
        let midN = 0;
        ranked.forEach((l) => {
          if (l.you || l.club) state.isoValueLabels.add(l);
          else if (midN < 2 && l.v >= Math.max(5, maxV0 * 0.04)) {
            // only top mids — fewer collisions, clearer hierarchy
            state.isoValueLabels.add(l);
            midN++;
          }
        });
      }
      ctx.clearRect(0, 0, w, h);

      if (F.fogMaterials) {
        // atmosphere: cooler sky, warm plinth haze — print diorama, no god-rays
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, CANVAS_COLORS.isoSky);
        sky.addColorStop(0.4, CANVAS_COLORS.isoSkyMid);
        sky.addColorStop(0.68, CANVAS_COLORS.isoHorizon);
        sky.addColorStop(1, CANVAS_COLORS.isoGround);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        // soft horizon band — stages the model without glow
        const hz = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.88);
        hz.addColorStop(0, "rgba(18,16,14,0)");
        hz.addColorStop(0.45, "rgba(28,24,20,0.18)");
        hz.addColorStop(1, "rgba(8,6,5,0.42)");
        ctx.fillStyle = hz;
        ctx.fillRect(0, 0, w, h);
        const bg = ctx.createRadialGradient(w * 0.5, h * 0.62, 20, w * 0.5, h * 0.56, w * 0.52);
        bg.addColorStop(0, "rgba(28,24,20,0.36)");
        bg.addColorStop(0.55, "rgba(12,10,8,0.14)");
        bg.addColorStop(1, "rgba(5,4,3,0)");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = CANVAS_COLORS.isoFallback;
        ctx.fillRect(0, 0, w, h);
      }

      const maxV = Math.max(...payload.lots.map((l) => l.v)) || 1;
      const sorted = [...payload.lots].sort((a, b) => project(a.c, a.r, 0).depth - project(b.c, b.r, 0).depth);

      const minC = Math.min(...payload.lots.map((l) => l.c)) - 1;
      const maxC = Math.max(...payload.lots.map((l) => l.c)) + 2;
      const minR = Math.min(...payload.lots.map((l) => l.r)) - 1;
      const maxR = Math.max(...payload.lots.map((l) => l.r)) + 2;

      // ground plate — double-edge craft, soft contact shadow (architectural base)
      {
        const p00 = project(minC, minR, 0);
        const p10 = project(maxC, minR, 0);
        const p11 = project(maxC, maxR, 0);
        const p01 = project(minC, maxR, 0);
        // diorama contact shadow under model
        const cx = (p00.x + p10.x + p11.x + p01.x) / 4;
        const cy = (p00.y + p10.y + p11.y + p01.y) / 4 + 8;
        const drop = ctx.createRadialGradient(cx, cy, 6, cx, cy + 10, Math.max(w, h) * 0.32);
        drop.addColorStop(0, "rgba(0,0,0,0.38)");
        drop.addColorStop(0.45, "rgba(0,0,0,0.14)");
        drop.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = drop;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 5, Math.max(w, h) * 0.3, Math.max(w, h) * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        const gfill = ctx.createLinearGradient(p00.x, p00.y, p11.x, p11.y);
        gfill.addColorStop(0, "rgba(44,40,36,0.58)");
        gfill.addColorStop(0.45, "rgba(28,26,22,0.5)");
        gfill.addColorStop(1, "rgba(12,10,9,0.58)");
        ctx.fillStyle = gfill;
        ctx.fill();
        // outer hairline (engraved plate edge)
        ctx.strokeStyle = "rgba(255,255,255,0.09)";
        ctx.lineWidth = 1.15;
        ctx.stroke();
        // inner inset edge
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.clip();
        ctx.strokeStyle = "rgba(0,0,0,0.38)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
        // quiet second rim — miniature diorama craft
        ctx.strokeStyle = "rgba(255,255,255,0.035)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p00.x, p00.y);
        ctx.lineTo(p10.x, p10.y);
        ctx.lineTo(p11.x, p11.y);
        ctx.lineTo(p01.x, p01.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      // quieter ground grid — structure without noise
      ctx.strokeStyle = F.fogMaterials ? "rgba(255,255,255,0.022)" : "rgba(255,255,255,0.018)";
      ctx.lineWidth = 1;
      for (let g = minC; g <= maxC; g++) {
        const a = project(g, minR, 0), b = project(g, maxR, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (let g = minR; g <= maxR; g++) {
        const a = project(minC, g, 0), b = project(maxC, g, 0);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }

      // lot pads — footprint + micro street gutter (city-block craft)
      sorted.forEach((l) => {
        const base = 0.88; // leave 0.12 street band between lots
        const ox = 0.02, oy = 0.02;
        const pad = [
          project(l.c + ox, l.r + oy, 0),
          project(l.c + ox + base, l.r + oy, 0),
          project(l.c + ox + base, l.r + oy + base, 0),
          project(l.c + ox, l.r + oy + base, 0),
        ];
        ctx.beginPath();
        pad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        if (!blind && l.you) ctx.fillStyle = "rgba(110,200,230,0.09)";
        else if (!blind && l.club) ctx.fillStyle = "rgba(224,176,74,0.08)";
        else ctx.fillStyle = "rgba(255,255,255,0.028)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.lineWidth = 0.65;
        ctx.stroke();
        // hairline curb
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      sorted.forEach((l) => {
        if (F.depthFog) {
          const d = project(l.c, l.r, 0).depth;
          const t = Math.min(1, Math.max(0, (d + 4) / 14));
          // atmospheric recession — far street softens, specials stay clear
          let a = 0.74 + (1 - t) * 0.26;
          if (!blind && (l.you || l.club)) a = Math.min(1, a + 0.1);
          ctx.globalAlpha = a;
        }
        const renderLot =
          blind && (l.you || l.club)
            ? { ...l, you: undefined, club: undefined }
            : l;
        if (payload.totalMv > 0) {
          drawBuilding(l.c, l.r, l.v, renderLot, maxV, false);
        }
        drawGhost(renderLot, maxV);
        ctx.globalAlpha = 1;
      });

      flushIsoLabels();

      if (F.fogMaterials) {
        // soft edge falloff — print mat, not cinematic smoke
        const vg = ctx.createRadialGradient(w / 2, h * 0.48, h * 0.26, w / 2, h * 0.5, h * 0.9);
        vg.addColorStop(0, "rgba(0,0,0,0)");
        vg.addColorStop(0.7, "rgba(0,0,0,0.1)");
        vg.addColorStop(1, "rgba(0,0,0,0.32)");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);
      }
      shell.dataset.rendered = "true";
      shell.dataset.rise = state.rise.toFixed(3);
      shell.dataset.ghostRise = state.ghostT.toFixed(3);
    }

    function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w * 0.5, h * 0.5);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, rr);
        return;
      }
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function drawThermal() {
      const w = canvas.clientWidth;
      const h = state.cssH;
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createRadialGradient(w * 0.48, h * 0.38, 8, w * 0.5, h * 0.5, w * 0.72);
      bg.addColorStop(0, CANVAS_COLORS.thermalBackgroundFocus);
      bg.addColorStop(1, CANVAS_COLORS.thermalBackground);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const totalV = payload.lots.reduce((s, l) => s + l.v, 0);
      const maxV = totalV;
      const sorted = [...payload.lots].sort((a, b) => b.v - a.v);

      const inset = 16;
      const mapX = inset;
      const mapY = inset;
      const mapW = w - inset * 2;
      const mapH = h - inset * 2;

      if (totalV <= 0) {
        meta.textContent = "No assessed value · no value geometry to draw";
        shell.dataset.rendered = "true";
        shell.dataset.thermalReveal = "1.000";
        shell.dataset.rise = "1";
        return;
      }

      // recessed map well — print craft, soft negative space (not chrome)
      {
        // outer mat
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        roundRectPath(mapX - 6, mapY - 6, mapW + 12, mapH + 12, 8);
        ctx.fill();
        // well floor
        const wellBg = ctx.createLinearGradient(mapX, mapY, mapX, mapY + mapH);
        wellBg.addColorStop(0, "rgba(8,12,20,0.92)");
        wellBg.addColorStop(1, "rgba(4,6,10,0.96)");
        ctx.fillStyle = wellBg;
        roundRectPath(mapX - 2, mapY - 2, mapW + 4, mapH + 4, 5);
        ctx.fill();
        // double hairline frame
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        roundRectPath(mapX - 5.5, mapY - 5.5, mapW + 11, mapH + 11, 7);
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1;
        roundRectPath(mapX - 2.5, mapY - 2.5, mapW + 5, mapH + 5, 5);
        ctx.stroke();
        // soft inner vignette
        ctx.save();
        roundRectPath(mapX - 2, mapY - 2, mapW + 4, mapH + 4, 5);
        ctx.clip();
        const vig = ctx.createRadialGradient(
          mapX + mapW * 0.5, mapY + mapH * 0.45, Math.min(mapW, mapH) * 0.2,
          mapX + mapW * 0.5, mapY + mapH * 0.5, Math.max(mapW, mapH) * 0.62
        );
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = vig;
        ctx.fillRect(mapX - 2, mapY - 2, mapW + 4, mapH + 4);
        ctx.restore();
      }

      meta.textContent =
        sorted.length + " groups · $" +
        (totalV >= 100 ? totalV.toFixed(0) : totalV.toFixed(1)) +
        "M · area ∝ value · hover or tap a group";

      if (!F.thermalFill) {
        let x = mapX;
        sorted.forEach((l) => {
          const ww = Math.max(2, (l.v / totalV) * mapW);
          ctx.fillStyle = l.you ? TOKENS.you : thermalRGB(l.v, maxV).fill;
          ctx.fillRect(x, mapY + mapH * 0.2, ww - 1, mapH * 0.6);
          x += ww;
        });
        return;
      }

      const layout = layoutTreemap(sorted, mapX, mapY, mapW, mapH);
      const cells = layout.cells;
      state.thermalCells = cells;
      state.thermalDistricts = layout.districts;
      const reveal = F.thermalReveal && !state.reduceMotion ? easeOutCubic(state.thermalT) : 1;

      // rank by value for stagger (large lots settle first)
      const valueRank = new Map(sorted.map((l, i) => [l, i]));

      // focus target for cartographic hierarchy (dim others, not glow self)
      const focusLot =
        (state.hoverCell && state.hoverCell.lot) ||
        state.pinnedLot ||
        null;

      // street floor under treemap — gutters read as intentional map structure
      {
        ctx.save();
        roundRectPath(mapX, mapY, mapW, mapH, 4);
        ctx.clip();
        const street = ctx.createLinearGradient(mapX, mapY, mapX + mapW * 0.3, mapY + mapH);
        street.addColorStop(0, "rgba(10,14,22,0.98)");
        street.addColorStop(0.5, "rgba(8,10,16,0.98)");
        street.addColorStop(1, "rgba(6,8,12,0.98)");
        ctx.fillStyle = street;
        ctx.fillRect(mapX, mapY, mapW, mapH);
        ctx.restore();
      }

      // cells — cushion treemap craft (van Wijk): matte volume, no glow
      cells.forEach((cell) => {
        const l = cell.lot;
        const x = cell.x;
        const y = cell.y;
        const cw = Math.max(0, cell.w);
        const ch = Math.max(0, cell.h);
        if (cw < 0.5 || ch < 0.5) return;

        const idx = valueRank.get(l) || 0;
        const delay = Math.min(0.36, idx * 0.018);
        const localT = F.thermalReveal && !state.reduceMotion
          ? easeOutQuart(Math.max(0, (state.thermalT - delay) / Math.max(0.32, 1 - delay * 0.5)))
          : 1;
        if (localT <= 0.01) return;

        const isFocus = focusLot && focusLot === l;
        const dimOthers = focusLot && !isFocus;

        ctx.save();
        // hierarchy: slight de-emphasis only — keep map readable (was too muddy)
        let baseA = 0.22 + localT * 0.78;
        if (!l.you && !l.club) {
          const vt0 = thermalRGB(l.v, maxV).t;
          baseA *= 0.82 + vt0 * 0.18;
        }
        if (dimOthers) baseA *= 0.48;
        if (isFocus) baseA = Math.min(1, baseA * 1.06 + 0.06);
        ctx.globalAlpha = baseA;
        // purposeful settle: fade + micro-scale only (no bounce travel)
        const grow = 0.97 + localT * 0.03;
        const gx = x + cw * (1 - grow) * 0.5;
        const gy = y + ch * (1 - grow) * 0.5;
        const gw = cw * grow;
        const gh = ch * grow;

        let fill: string, light: string, dark: string;
        let baseR: number, baseG: number, baseB: number;
        if (l.you) {
          // calm cyan — identity without neon
          fill = CANVAS_COLORS.thermalYou;
          light = CANVAS_COLORS.thermalYouLight;
          dark = CANVAS_COLORS.thermalYouDark;
          baseR = 47; baseG = 138; baseB = 171;
        } else if (l.club) {
          // warm copper that sits on sequential high end
          fill = CANVAS_COLORS.thermalClub;
          light = CANVAS_COLORS.thermalClubLight;
          dark = CANVAS_COLORS.thermalClubDark;
          baseR = 184; baseG = 120; baseB = 40;
        } else {
          const c = thermalRGB(l.v, maxV);
          // light mute only on noise floor — mid band stays vivid for $8–40M separation
          const mute = Math.pow(1 - c.t, 2.1) * 0.14;
          const slate = { r: 20, g: 26, b: 40 };
          const m = c.fill.match(/\d+/g)!;
          baseR = Math.round(+m[0] * (1 - mute) + slate.r * mute);
          baseG = Math.round(+m[1] * (1 - mute) + slate.g * mute);
          baseB = Math.round(+m[2] * (1 - mute) + slate.b * mute);
          // slight mid lift so sequential hues don't sink into the street
          if (c.t > 0.25 && c.t < 0.85) {
            baseR = Math.min(255, baseR + 8);
            baseG = Math.min(255, baseG + 6);
            baseB = Math.min(255, baseB + 4);
          }
          fill = `rgb(${baseR},${baseG},${baseB})`;
          light = `rgb(${Math.min(255, baseR + 24)},${Math.min(255, baseG + 20)},${Math.min(255, baseB + 14)})`;
          dark = `rgb(${(baseR * 0.68)|0},${(baseG * 0.68)|0},${(baseB * 0.68)|0})`;
        }

        // tighter corners on small leaves; softer on whales (map craft)
        const cellR = Math.min(gw > 80 ? 4 : 2.8, gw * 0.08, gh * 0.08);
        const vt = l.you || l.club ? 1 : thermalRGB(l.v, maxV).t;

        // base matte fill
        ctx.fillStyle = fill;
        roundRectPath(gx, gy, gw, gh, cellR);
        ctx.fill();

        // cushion (van Wijk): matte volume, restrained lift — print not plastic
        if (gw > 5 && gh > 5) {
          ctx.save();
          roundRectPath(gx, gy, gw, gh, cellR);
          ctx.clip();
          const cx = gx + gw * 0.34;
          const cy = gy + gh * 0.3;
          const rad = Math.max(gw, gh) * (0.7 + vt * 0.16);
          const cush = ctx.createRadialGradient(cx, cy, Math.min(gw, gh) * 0.05, gx + gw * 0.5, gy + gh * 0.55, rad);
          const liftAmount = 0.07 + vt * 0.07; // quieter highlight
          cush.addColorStop(0, `rgba(255,255,255,${liftAmount})`);
          cush.addColorStop(0.4, `rgba(255,255,255,${liftAmount * 0.22})`);
          cush.addColorStop(0.65, "rgba(0,0,0,0)");
          cush.addColorStop(0.9, `rgba(0,0,0,${0.12 + vt * 0.07})`);
          cush.addColorStop(1, `rgba(0,0,0,${0.24 + vt * 0.1})`);
          ctx.fillStyle = cush;
          ctx.fillRect(gx, gy, gw, gh);

          // edge darken ring — seams between cells
          const seam = ctx.createLinearGradient(gx, gy, gx, gy + gh);
          seam.addColorStop(0, "rgba(0,0,0,0.1)");
          seam.addColorStop(0.07, "rgba(0,0,0,0)");
          seam.addColorStop(0.93, "rgba(0,0,0,0)");
          seam.addColorStop(1, "rgba(0,0,0,0.26)");
          ctx.fillStyle = seam;
          ctx.fillRect(gx, gy, gw, gh);

          // directional wash (top-left key) — soft only
          const wash = ctx.createLinearGradient(gx, gy, gx + gw * 0.9, gy + gh);
          wash.addColorStop(0, `rgba(${Math.min(255, baseR + 28)},${Math.min(255, baseG + 24)},${Math.min(255, baseB + 18)},0.12)`);
          wash.addColorStop(0.5, "rgba(0,0,0,0)");
          wash.addColorStop(1, `rgba(${(baseR * 0.35)|0},${(baseG * 0.35)|0},${(baseB * 0.35)|0},0.18)`);
          ctx.fillStyle = wash;
          ctx.fillRect(gx, gy, gw, gh);
          ctx.restore();
        }

        // hairline top edge
        if (gw > 12 && gh > 12) {
          ctx.save();
          roundRectPath(gx, gy, gw, gh, cellR);
          ctx.clip();
          ctx.strokeStyle = "rgba(255,255,255,0.11)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx + 2, gy + 1.25);
          ctx.lineTo(gx + gw - 2, gy + 1.25);
          ctx.stroke();
          ctx.restore();
        }

        // share tick — specials / editorial only (avoids mid-cell label collisions)
        if (
          localT > 0.88 &&
          (l.you || l.club || (vt > 0.72 && gw > 110 && gh > 70))
        ) {
          const share = l.v / totalV;
          const trackX = gx + 10;
          const trackY = gy + gh - 12;
          const trackW = Math.max(24, gw - 20);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(trackX, trackY, trackW, 2);
          ctx.fillStyle = l.you
            ? "rgba(200,235,250,0.5)"
            : l.club
              ? "rgba(240,210,140,0.48)"
              : "rgba(255,255,255,0.34)";
          // full-width encodes 100% of block; fill is this lot's share
          ctx.fillRect(trackX, trackY, trackW * Math.min(1, share), 2);
        }

        // value-weighted edge — dark seam against street floor (map craft)
        ctx.strokeStyle = `rgba(0,0,0,${0.28 + vt * 0.22})`;
        ctx.lineWidth = 0.85 + vt * 0.75;
        roundRectPath(gx + 0.5, gy + 0.5, Math.max(0, gw - 1), Math.max(0, gh - 1), cellR);
        ctx.stroke();
        if (vt > 0.4 && gw > 16 && gh > 16) {
          ctx.strokeStyle = `rgba(255,255,255,${0.04 + vt * 0.055})`;
          ctx.lineWidth = 1;
          roundRectPath(gx + 1.5, gy + 1.5, Math.max(0, gw - 3), Math.max(0, gh - 3), Math.max(1, cellR - 1));
          ctx.stroke();
        }

        // specials: thin identity ring + quiet left rail for YOU
        if (l.you || l.club) {
          const insetR = 2.5;
          if (gw > insetR * 2 + 8 && gh > insetR * 2 + 8) {
            ctx.strokeStyle = l.you
              ? "rgba(220,245,255,0.48)"
              : "rgba(255,230,180,0.38)";
            ctx.lineWidth = l.you ? 1.45 : 1.15;
            roundRectPath(
              gx + insetR, gy + insetR,
              gw - insetR * 2, gh - insetR * 2,
              Math.max(2, cellR - 1)
            );
            ctx.stroke();
          }
        }
        if (l.you && gw > 14 && gh > 14) {
          ctx.fillStyle = "rgba(255,255,255,0.52)";
          ctx.fillRect(gx + 3, gy + 4, 2.5, Math.max(8, gh - 8));
        }
        ctx.restore();
      });

      // hierarchical district frames + street channel (after cells, before labels)
      if (state.thermalDistricts.length && reveal >= 0.35) {
        const da = Math.min(1, (reveal - 0.35) / 0.4);
        // street channel in the gutter between lead and rest
        if (state.thermalDistricts.length === 2) {
          const a = state.thermalDistricts[0];
          const b = state.thermalDistricts[1];
          const left = a.x <= b.x ? a : b;
          const right = a.x <= b.x ? b : a;
          const top = a.y <= b.y ? a : b;
          const bot = a.y <= b.y ? b : a;
          const gapX = right.x - (left.x + left.w);
          const gapY = bot.y - (top.y + top.h);
          ctx.save();
          ctx.globalAlpha = da * 0.9;
          if (gapX > 1.2 && gapX < 32) {
            const sx = left.x + left.w;
            const sy = Math.min(a.y, b.y) + 2;
            const sh = Math.max(a.h, b.h) - 4;
            ctx.fillStyle = "rgba(0,0,0,0.36)";
            ctx.fillRect(sx, sy, gapX, sh);
            if (gapX >= 2.5) {
              ctx.strokeStyle = "rgba(255,255,255,0.045)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(sx + gapX * 0.5, sy + 6);
              ctx.lineTo(sx + gapX * 0.5, sy + sh - 6);
              ctx.stroke();
            }
          } else if (gapY > 1.2 && gapY < 32) {
            const sy = top.y + top.h;
            const sx = Math.min(a.x, b.x) + 2;
            const sw = Math.max(a.w, b.w) - 4;
            ctx.fillStyle = "rgba(0,0,0,0.36)";
            ctx.fillRect(sx, sy, sw, gapY);
            if (gapY >= 2.5) {
              ctx.strokeStyle = "rgba(255,255,255,0.045)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(sx + 6, sy + gapY * 0.5);
              ctx.lineTo(sx + sw - 6, sy + gapY * 0.5);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
        state.thermalDistricts.forEach((d) => {
          ctx.save();
          ctx.globalAlpha = da;
          if (d.kind === "rest") {
            // quiet well behind neighborhood pack
            ctx.fillStyle = "rgba(255,255,255,0.015)";
            roundRectPath(d.x, d.y, d.w, d.h, 5);
            ctx.fill();
          }
          // NNGroup: visually distinct borders for top-level groups
          if (d.kind === "lead") {
            ctx.strokeStyle = "rgba(0,0,0,0.45)";
            ctx.lineWidth = 2.5;
            roundRectPath(d.x - 0.5, d.y - 0.5, d.w + 1, d.h + 1, 6);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,0.14)";
            ctx.lineWidth = 1.15;
            roundRectPath(d.x, d.y, d.w, d.h, 5);
            ctx.stroke();
          } else {
            ctx.strokeStyle = "rgba(255,255,255,0.09)";
            ctx.lineWidth = 1;
            roundRectPath(d.x, d.y, d.w, d.h, 5);
            ctx.stroke();
            // dashed inner for neighborhood (softer hierarchy)
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = "rgba(255,255,255,0.05)";
            ctx.lineWidth = 1;
            roundRectPath(d.x + 2.5, d.y + 2.5, Math.max(0, d.w - 5), Math.max(0, d.h - 5), 3);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (d.label && d.w > 72 && d.h > 40) {
            ctx.font = "600 9px Libre Franklin, sans-serif";
            ctx.letterSpacing = "0.06em";
            ctx.fillStyle = "rgba(255,255,255,0.38)";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            const tag =
              d.label.toUpperCase() +
              "  ·  " +
              (d.share >= 0.1
                ? Math.round(d.share * 100) + "%"
                : (d.share * 100).toFixed(1) + "%");
            // small plate under district caption for contrast
            const tw = ctx.measureText(tag).width;
            ctx.fillStyle = "rgba(6,8,12,0.45)";
            ctx.fillRect(d.x + 5, d.y + 4, tw + 8, 14);
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillText(tag, d.x + 9, d.y + 6);
            ctx.letterSpacing = "0px";
          }
          ctx.restore();
        });
      }

      // labels only after most of reveal — avoids mid-anim collision churn
      if (reveal < 0.55) {
        shell.dataset.rendered = "true";
        return;
      }

      const labelJobs = cells
        .map((cell) => {
          const l = cell.lot;
          let priority = l.v;
          if (l.you) priority += 1e9;
          if (l.club) priority += 1e8;
          return { cell, l, pct: (l.v / totalV) * 100, priority };
        })
        .sort((a, b) => b.priority - a.priority);

      const placed: { x: number; y: number; w: number; h: number }[] = [];
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = Math.min(1, (reveal - 0.55) / 0.35);

      function measureLines(lines: LabelLine[], padX?: number, padY?: number, lineH?: number) {
        let maxTw = 0;
        lines.forEach((line) => {
          ctx.font = line.font;
          maxTw = Math.max(maxTw, ctx.measureText(line.text).width);
        });
        const lh = lineH || 13;
        const px = padX == null ? 16 : padX;
        const py = padY == null ? 12 : padY;
        return { maxTw, lineH: lh, boxW: maxTw + px, boxH: lines.length * lh + py };
      }

      labelJobs.forEach(({ cell, l, pct }, rank) => {
        const cw = cell.w;
        const ch = cell.h;
        const special = l.you || l.club;
        // when focusing a lot, suppress other micro type (clean hierarchy)
        if (focusLot && l !== focusLot && !special && rank > 4) return;
        // denser mid-lot labeling in neighborhood (compact tiers)
        if (cw < 28 || ch < 16) return;
        if (!special && rank > 14) return;
        if (!special && cw < 34 && ch < 22) return;

        // adaptive ink from cell luminance (cartography practice)
        const col = l.you
          ? { r: 58, g: 150, b: 184 }
          : l.club
            ? { r: 192, g: 126, b: 40 }
            : (() => {
                const c = thermalRGB(l.v, maxV).fill.match(/\d+/g)!;
                return { r: +c[0], g: +c[1], b: +c[2] };
              })();
        const lum = (0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b) / 255;
        // mid-band cells (teal/moss) need earlier dark ink for WCAG-ish contrast
        const lightCell = lum > 0.38;
        const ink = lightCell ? "rgba(14,12,10,0.94)" : CANVAS_COLORS.white;
        const inkDim = lightCell ? "rgba(14,12,10,0.58)" : "rgba(255,255,255,0.58)";
        const inkTag = l.you
          ? lightCell
            ? CANVAS_COLORS.thermalInkYouDark
            : CANVAS_COLORS.thermalInkYouLight
          : lightCell
            ? CANVAS_COLORS.thermalInkClubDark
            : CANVAS_COLORS.thermalInkClubLight;

        const candidates: LabelCandidate[] = [];
        const topN = rank <= 4; // always surface share on top lots at rest
        const pctStr = pct.toFixed(pct >= 10 ? 0 : 1) + "%";
        // full editorial stack for specials / top lots
        if ((special || topN) && cw >= 78 && ch >= 50) {
          const lines: LabelLine[] = [];
          if (special) {
            lines.push({
              text: l.you ? "YOU" : "$50M CLUB",
              font: "700 9px Libre Franklin, sans-serif",
              color: inkTag,
            });
          }
          lines.push({ text: fmtMoney(l.v), font: "700 15px Barlow Condensed, sans-serif", color: ink });
          lines.push({
            text: pctStr + " of block",
            font: "500 10px Libre Franklin, sans-serif",
            color: inkDim,
          });
          candidates.push({ lines, padX: 16, padY: 12, lineH: 13 });
        }
        // value + compact % (top lots always try this before bare value)
        if ((special || topN) && cw >= 48 && ch >= 36) {
          const lines: LabelLine[] = [];
          if (l.you) {
            lines.push({ text: "YOU", font: "700 9px Libre Franklin, sans-serif", color: inkTag });
          }
          lines.push({ text: fmtMoney(l.v), font: "700 13px Barlow Condensed, sans-serif", color: ink });
          lines.push({
            text: pctStr,
            font: "600 10px Libre Franklin, sans-serif",
            color: inkDim,
          });
          candidates.push({ lines, padX: 12, padY: 10, lineH: 12 });
        }
        if (cw >= 52 && ch >= 32) {
          const lines: LabelLine[] = [];
          if (l.you) lines.push({ text: "YOU", font: "700 9px Libre Franklin, sans-serif", color: inkTag });
          lines.push({ text: fmtMoney(l.v), font: "700 13px Barlow Condensed, sans-serif", color: ink });
          candidates.push({ lines, padX: 14, padY: 10, lineH: 13 });
        }
        if (cw >= 40 && ch >= 22) {
          candidates.push({
            lines: [{ text: fmtMoney(l.v), font: "700 11px Barlow Condensed, sans-serif", color: ink }],
            padX: 10,
            padY: 8,
            lineH: 12,
          });
        }
        // micro: value, or value·% for top lots when space is tight
        if (cw >= 28 && ch >= 16 && (special || rank <= 9)) {
          const short =
            l.v >= 10 ? "$" + Math.round(l.v) : "$" + l.v.toFixed(1);
          if (topN && cw >= 44 && ch >= 18) {
            candidates.push({
              lines: [{
                text: short + " · " + pctStr,
                font: "700 10px Barlow Condensed, sans-serif",
                color: ink,
              }],
              padX: 6,
              padY: 4,
              lineH: 11,
              micro: true,
            });
          }
          candidates.push({
            lines: [{ text: short, font: "700 10px Barlow Condensed, sans-serif", color: ink }],
            padX: 6,
            padY: 4,
            lineH: 11,
            micro: true,
          });
        }

        let chosen: LabelLine[] | null = null;
        let metrics: ReturnType<typeof measureLines> | null = null;
        let micro = false;
        for (const cand of candidates) {
          const m = measureLines(cand.lines, cand.padX, cand.padY, cand.lineH);
          if (m.boxW <= cw - 6 && m.boxH <= ch - 6) {
            chosen = cand.lines;
            metrics = m;
            micro = !!cand.micro;
            break;
          }
        }
        if (!chosen || !metrics) return;

        // large cells: editorial top-left labels (NYT-style); small: centered
        const editorial = !micro && cw >= 120 && ch >= 72;
        const hasShareTick =
          special || (thermalRGB(l.v, maxV).t > 0.72 && cw > 110 && ch > 70);
        const bottomReserve = hasShareTick ? 14 : 0;
        const topReserve =
          state.thermalDistricts.some(
            (d) =>
              d.kind === "rest" &&
              d.label &&
              cell.x + cw > d.x &&
              cell.x < d.x + d.w &&
              cell.y < d.y + 22 &&
              cell.y + 4 > d.y
          )
            ? 18
            : 0;
        const pad = micro ? 3 : 6;
        // position cascade: try primary, then corners — never drop specials lightly
        const anchors = editorial
          ? [
              { ax: 10, ay: 10 + topReserve },
              { ax: 10, ay: Math.max(2, ch - bottomReserve - metrics.boxH - 8) },
              { ax: Math.max(2, cw - metrics.boxW - 10), ay: 10 + topReserve },
              { ax: (cw - metrics.boxW) / 2, ay: (ch - bottomReserve - metrics.boxH) / 2 },
            ]
          : [
              { ax: (cw - metrics.boxW) / 2, ay: topReserve + (ch - topReserve - bottomReserve - metrics.boxH) / 2 },
              { ax: 4, ay: 4 + topReserve },
              { ax: Math.max(2, cw - metrics.boxW - 4), ay: 4 + topReserve },
              { ax: 4, ay: Math.max(2, ch - bottomReserve - metrics.boxH - 4) },
              { ax: Math.max(2, cw - metrics.boxW - 4), ay: Math.max(2, ch - bottomReserve - metrics.boxH - 4) },
            ];
        let box: { x: number; y: number; w: number; h: number } | null = null;
        for (let ai = 0; ai < anchors.length; ai++) {
          const trial = {
            x: cell.x + anchors[ai].ax,
            y: cell.y + anchors[ai].ay,
            w: metrics.boxW,
            h: metrics.boxH,
          };
          trial.x = Math.min(cell.x + cw - trial.w - 2, Math.max(cell.x + 2, trial.x));
          trial.y = Math.min(
            cell.y + ch - trial.h - 2 - bottomReserve,
            Math.max(cell.y + 2 + topReserve, trial.y)
          );
          if (!placed.some((p) => rectsOverlap(p, trial, pad))) {
            box = trial;
            break;
          }
        }
        // specials: last-resort shrink padding and accept near-overlap
        if (!box && special) {
          const ax = editorial ? 10 : (cw - metrics.boxW) / 2;
          const ay = editorial ? 10 + topReserve : topReserve + (ch - topReserve - bottomReserve - metrics.boxH) / 2;
          box = {
            x: Math.min(cell.x + cw - metrics.boxW - 2, Math.max(cell.x + 2, cell.x + ax)),
            y: Math.min(
              cell.y + ch - metrics.boxH - 2 - bottomReserve,
              Math.max(cell.y + 2 + topReserve, cell.y + ay)
            ),
            w: metrics.boxW,
            h: metrics.boxH,
          };
          if (placed.some((p) => rectsOverlap(p, box!, 1))) {
            // still blocked: skip rather than stack illegibly
            box = null;
          }
        }
        if (!box) return;
        placed.push(box);

        // plate: skip on editorial whales and pure micro ink
        const usePlate = !micro && (!editorial || cw < 200);
        if (usePlate) {
          ctx.fillStyle = lightCell ? "rgba(255,250,240,0.42)" : "rgba(6,8,12,0.48)";
          const rr = micro ? 2 : 4;
          ctx.beginPath();
          ctx.moveTo(box.x + rr, box.y);
          ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, rr);
          ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, rr);
          ctx.arcTo(box.x, box.y + box.h, box.x, box.y, rr);
          ctx.arcTo(box.x, box.y, box.x + box.w, box.y, rr);
          ctx.closePath();
          ctx.fill();
        }

        const textX = editorial ? box.x + 2 : box.x + box.w / 2;
        const textY0 = box.y + (micro ? 7 : 11);
        ctx.textAlign = editorial ? "left" : "center";
        chosen.forEach((line, i) => {
          ctx.font = line.font;
          // cartographic: slight tracking on large area labels
          if (editorial) {
            ctx.letterSpacing = i === 0 ? "0.08em" : "0.02em";
          }
          if (!usePlate) {
            ctx.lineWidth = micro ? 2.5 : 3;
            ctx.strokeStyle = lightCell ? "rgba(255,250,240,0.4)" : "rgba(0,0,0,0.4)";
            ctx.strokeText(line.text, textX, textY0 + i * metrics.lineH);
          }
          ctx.fillStyle = line.color;
          ctx.globalAlpha = micro
            ? Math.min(1, (reveal - 0.55) / 0.35) * 0.88
            : Math.min(1, (reveal - 0.55) / 0.35);
          ctx.fillText(line.text, textX, textY0 + i * metrics.lineH);
        });
        ctx.letterSpacing = "0px";
        ctx.textAlign = "center";
      });
      ctx.globalAlpha = 1;

      // hover or pinned: elegant focus card (no glow clutter)
      const focusCell =
        state.hoverCell ||
        (state.pinnedLot && state.thermalCells.find((c) => c.lot === state.pinnedLot)) ||
        null;
      if (focusCell && reveal >= 0.55) {
        const hc = focusCell;
        const l = hc.lot;
        const hx = hc.x, hy = hc.y, hw = hc.w, hh = hc.h;
        ctx.save();
        // distinctive selected state (NNGroup) — frame only, no glow fill
        ctx.strokeStyle = l.you
          ? "rgba(180,220,240,0.78)"
          : l.club
            ? "rgba(230,200,140,0.72)"
            : "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.75;
        roundRectPath(hx + 1, hy + 1, Math.max(0, hw - 2), Math.max(0, hh - 2), 3);
        ctx.stroke();
        // hairline inset
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 1;
        roundRectPath(hx + 3.5, hy + 3.5, Math.max(0, hw - 7), Math.max(0, hh - 7), 2);
        ctx.stroke();
        // corner ticks — editorial selection mark
        const tick = Math.min(10, Math.min(hw, hh) * 0.18);
        ctx.strokeStyle = l.you
          ? "rgba(180,220,240,0.55)"
          : l.club
            ? "rgba(230,200,140,0.5)"
            : "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.25;
        [
          [hx + 2, hy + 2 + tick, hx + 2, hy + 2, hx + 2 + tick, hy + 2],
          [hx + hw - 2 - tick, hy + 2, hx + hw - 2, hy + 2, hx + hw - 2, hy + 2 + tick],
          [hx + 2, hy + hh - 2 - tick, hx + 2, hy + hh - 2, hx + 2 + tick, hy + hh - 2],
          [hx + hw - 2 - tick, hy + hh - 2, hx + hw - 2, hy + hh - 2, hx + hw - 2, hy + hh - 2 - tick],
        ].forEach((seg) => {
          ctx.beginPath();
          ctx.moveTo(seg[0], seg[1]);
          ctx.lineTo(seg[2], seg[3]);
          ctx.lineTo(seg[4], seg[5]);
          ctx.stroke();
        });

        const pct = (l.v / totalV) * 100;
        const rank = sorted.findIndex((x) => x === l) + 1;
        const rows: { t: string; kind: "tag" | "val" | "meta" }[] = [];
        if (l.you) rows.push({ t: "YOU", kind: "tag" });
        else if (l.club) rows.push({ t: "$50M CLUB", kind: "tag" });
        rows.push({ t: fmtMoney(l.v), kind: "val" });
        rows.push({
          t: pct.toFixed(pct >= 10 ? 0 : 1) + "% of block",
          kind: "meta",
        });
        rows.push({
          t: "#" + rank + " of " + sorted.length + " groups",
          kind: "meta",
        });

        let maxTw = 0;
        rows.forEach((row) => {
          ctx.font =
            row.kind === "tag"
              ? "700 9px Libre Franklin, sans-serif"
              : row.kind === "val"
                ? "700 16px Barlow Condensed, sans-serif"
                : "500 10px Libre Franklin, sans-serif";
          maxTw = Math.max(maxTw, ctx.measureText(row.t).width);
        });
        const padX = 14;
        const padY = 11;
        const lineGap = 15;
        const bw = maxTw + padX * 2;
        const bh = rows.length * lineGap + padY * 2 - 4;
        // prefer above; flip below; then side
        let bx = hx + hw / 2 - bw / 2;
        let by = hy - bh - 10;
        let anchor = "above";
        if (by < mapY + 4) {
          by = hy + hh + 10;
          anchor = "below";
          if (by + bh > mapY + mapH - 4) {
            // side placement
            by = Math.max(mapY + 4, Math.min(mapY + mapH - bh - 4, hy + hh / 2 - bh / 2));
            bx = hx + hw + 10;
            if (bx + bw > mapX + mapW - 4) bx = hx - bw - 10;
            anchor = "side";
          }
        }
        bx = Math.max(mapX + 4, Math.min(mapX + mapW - bw - 4, bx));
        by = Math.max(mapY + 4, Math.min(mapY + mapH - bh - 4, by));

        // leader hairline from card to cell (cartography)
        {
          const cx = hx + hw / 2;
          const cy = hy + hh / 2;
          let ax = bx + bw / 2;
          let ay = anchor === "below" ? by : by + bh;
          if (anchor === "side") {
            ax = bx < hx ? bx + bw : bx;
            ay = by + bh / 2;
          }
          ctx.strokeStyle = "rgba(255,255,255,0.14)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }

        // card plate
        ctx.fillStyle = "rgba(10,12,16,0.92)";
        roundRectPath(bx, by, bw, bh, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        roundRectPath(bx, by, bw, bh, 6);
        ctx.stroke();
        // accent bar
        ctx.fillStyle = l.you
          ? "rgba(110,190,220,0.75)"
          : l.club
            ? "rgba(220,170,80,0.7)"
            : "rgba(255,255,255,0.22)";
        ctx.fillRect(bx + 1, by + 8, 2.5, bh - 16);

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        rows.forEach((row, i) => {
          const y = by + padY + 6 + i * lineGap;
          if (row.kind === "tag") {
            ctx.font = "700 9px Libre Franklin, sans-serif";
            ctx.letterSpacing = "0.08em";
            ctx.fillStyle = l.you ? CANVAS_COLORS.youLabel : CANVAS_COLORS.clubLabel;
          } else if (row.kind === "val") {
            ctx.font = "700 16px Barlow Condensed, sans-serif";
            ctx.letterSpacing = "0.02em";
            ctx.fillStyle = CANVAS_COLORS.thermalCardInk;
          } else {
            ctx.font = "500 10px Libre Franklin, sans-serif";
            ctx.letterSpacing = "0.02em";
            ctx.fillStyle = "rgba(255,255,255,0.48)";
          }
          ctx.fillText(row.t, bx + padX + 4, y);
        });
        ctx.letterSpacing = "0px";
        ctx.restore();
      }
      shell.dataset.rendered = "true";
      shell.dataset.thermalReveal = state.thermalT.toFixed(3);
      shell.dataset.rise = "1";
    }

    function thermalHit(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / rect.width;
      const scaleY = state.cssH / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      for (let i = state.thermalCells.length - 1; i >= 0; i--) {
        const c = state.thermalCells[i];
        if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
      }
      return null;
    }

    function frame() {
      state.raf = 0;
      if (state.disposed || !state.visible) return;
      const idleActive =
        !blind &&
        !state.reduceMotion &&
        F.idleOrbit &&
        performance.now() - state.lastInteraction < 20_000;
      if (state.mode === "iso") {
        if (!state.drag && !state.reduceMotion) {
          if (Math.abs(state.angVel) > 0.0004) {
            // orbit inertia after drag — decays cleanly
            state.angle += state.angVel;
            state.baseAngle = state.angle;
            state.angVel *= 0.92;
          } else if (idleActive) {
            state.angVel = 0;
            state.idle += 0.0014;
            // calm drift — classy model turntable, not a carousel
            state.angle = state.baseAngle + Math.sin(state.idle) * 0.028;
            state.tilt = state.baseTilt + Math.sin(state.idle * 0.45) * 0.008;
          }
        }
        drawIso();
      } else {
        drawThermal();
      }
      const keep =
        !state.reduceMotion &&
        ((state.mode === "thermal" && state.thermalT < 1) ||
          (idleActive && state.mode === "iso") ||
          Math.abs(state.angVel) > 0.0004 ||
          state.rise < 1 ||
          Math.abs(state.ghostTarget - state.ghostT) > 0.001);
      if (keep) {
        if (state.rise < 1) {
          // smooth ease-out settle — classy, not snappy bounce
          state.rise = Math.min(1, state.rise + (1 - state.rise) * 0.095 + 0.012);
        }
        if (state.mode === "thermal" && state.thermalT < 1) {
          // staggered cells settle slightly slower for print-like reveal
          state.thermalT = Math.min(1, state.thermalT + (1 - state.thermalT) * 0.078 + 0.014);
        }
        if (Math.abs(state.ghostTarget - state.ghostT) > 0.001) {
          const delta = state.ghostTarget - state.ghostT;
          state.ghostT += delta * 0.2;
          if (Math.abs(state.ghostTarget - state.ghostT) <= 0.001) {
            state.ghostT = state.ghostTarget;
          }
        }
        state.raf = requestAnimationFrame(frame);
      }
      shell.dataset.idleOrbit = String(idleActive && state.mode === "iso");
    }

    function requestDraw() {
      if (state.disposed || !state.visible) return;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = requestAnimationFrame(frame);
    }

    function kickDraw() {
      if (state.disposed || !state.visible) return;
      if (state.raf) cancelAnimationFrame(state.raf);
      resizeCanvas();
      state.userZoom = 1;
      state.rise = state.reduceMotion ? 1 : 0.06;
      state.thermalT = state.reduceMotion ? 1 : 0;
      state.idle = 0;
      recomputeFit();
      state.raf = requestAnimationFrame(frame);
    }

    function markInteraction() {
      state.lastInteraction = performance.now();
      state.idle = 0;
      requestDraw();
    }

    function updateSkylineChrome() {
      const permitted = state.ghostTarget === 1;
      title.innerHTML =
        payload.totalMv === 0 && !permitted
          ? "No assessed value on this roll"
          : permitted
            ? "Skyline · <strong>solid = assessed value · glass = unbuilt capacity</strong>"
            : "Skyline · <strong>height = assessed value</strong>";
      hudHint.textContent = "Drag to orbit · scroll to zoom";
      hudMode.textContent =
        ghostEnabled && permitted ? "As permitted" : "Isometric";
    }

    function syncEmptyOverlay() {
      if (!emptyOverlay) return;
      emptyOverlay.hidden =
        state.mode === "iso" && state.ghostTarget === 1;
    }

    function setPermitted(permitted: boolean) {
      if (!ghostEnabled || !builtButton || !permittedButton) return;
      state.ghostTarget = permitted ? 1 : 0;
      if (state.reduceMotion) state.ghostT = state.ghostTarget;
      state.fitKey = "";
      recomputeFit();
      builtButton.setAttribute("aria-pressed", String(!permitted));
      permittedButton.setAttribute("aria-pressed", String(permitted));
      shell.dataset.skyline = permitted ? "permitted" : "built";
      updateSkylineChrome();
      syncEmptyOverlay();
      state.lastInteraction = performance.now();
      requestDraw();
    }

    function setVizMode(next: VizMode) {
      state.mode = next;
      const isThermal = next === "thermal";
      shell.classList.toggle("is-thermal", isThermal);
      panel.classList.toggle("is-thermal", isThermal);
      isoButton.setAttribute("aria-selected", String(!isThermal));
      thermalButton.setAttribute("aria-selected", String(isThermal));
      isoButton.setAttribute("aria-pressed", String(!isThermal));
      thermalButton.setAttribute("aria-pressed", String(isThermal));
      isoButton.tabIndex = isThermal ? -1 : 0;
      thermalButton.tabIndex = isThermal ? 0 : -1;
      panel.setAttribute("aria-labelledby", isThermal ? "mode-thermal" : "mode-iso");
      if (isThermal) {
        title.innerHTML =
          payload.totalMv === 0
            ? "No assessed value on this roll"
            : "Thermal · <strong>area = share of block value</strong>";
      } else {
        updateSkylineChrome();
      }
      syncEmptyOverlay();
      state.hoverCell = null;
      state.pinnedLot = null;
      state.angVel = 0;
      shell.dataset.mode = next;
      if (isThermal) {
        state.thermalT = state.reduceMotion ? 1 : 0;
        canvas.style.cursor = "default";
      } else {
        state.rise = state.reduceMotion ? 1 : Math.min(state.rise, 0.15);
        canvas.style.cursor = blind ? "default" : "grab";
      }
      state.lastInteraction = performance.now();
      kickDraw();
    }

    const handlePointerDown = (e: PointerEvent) => {
      state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.mode === "thermal") {
        const found = thermalHit(e);
        // tap toggles pin (mobile has no hover); empty space clears
        const next = found ? found.lot : null;
        state.pinnedLot = state.pinnedLot === next ? null : next;
        state.hoverCell = found;
        drawThermal();
        return;
      }
      state.lx = e.clientX;
      state.ly = e.clientY;
      state.pointerStartX = e.clientX;
      state.pointerStartY = e.clientY;
      state.dragPointerType = e.pointerType;
      state.angVel = 0;
      if (e.pointerType !== "touch") {
        state.drag = true;
        canvas.setPointerCapture(e.pointerId);
      } else if (state.activePointers.size === 2) {
        const points = [...state.activePointers.values()];
        state.pinchDistance = Math.hypot(
          points[0].x - points[1].x,
          points[0].y - points[1].y,
        );
        state.pinchZoom = state.userZoom;
      }
      markInteraction();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (state.mode === "thermal") {
        if (e.pointerType === "touch") return;
        const found = thermalHit(e);
        const prev = state.hoverCell && state.hoverCell.lot;
        const next = found && found.lot;
        if (prev !== next) {
          state.hoverCell = found;
          drawThermal();
        }
        canvas.style.cursor = found ? "pointer" : "default";
        return;
      }

      if (e.pointerType === "touch") {
        if (!state.activePointers.has(e.pointerId)) return;
        state.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (state.activePointers.size >= 2) {
          const points = [...state.activePointers.values()];
          const distance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          if (state.pinchDistance > 0) {
            e.preventDefault();
            state.userZoom = Math.max(
              0.55,
              Math.min(2.2, state.pinchZoom * (distance / state.pinchDistance)),
            );
            recomputeFit();
            drawIso();
          }
          markInteraction();
          return;
        }
        const totalX = e.clientX - state.pointerStartX;
        const totalY = e.clientY - state.pointerStartY;
        if (!state.drag) {
          if (Math.abs(totalX) < 6) return;
          if (Math.abs(totalX) <= Math.abs(totalY)) return;
          state.drag = true;
          canvas.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
        const dx = e.clientX - state.lx;
        state.angVel = dx * 0.008;
        state.angle += state.angVel;
        state.baseAngle = state.angle;
        state.lx = e.clientX;
        state.ly = e.clientY;
        drawIso();
        markInteraction();
        return;
      }

      if (!state.drag) return;
      const dx = e.clientX - state.lx;
      const dy = e.clientY - state.ly;
      state.angVel = dx * 0.008;
      state.angle += state.angVel;
      state.baseAngle = state.angle;
      state.tilt = Math.max(0.28, Math.min(1.05, state.tilt - dy * 0.006));
      state.baseTilt = state.tilt;
      state.lx = e.clientX;
      state.ly = e.clientY;
      drawIso();
      markInteraction();
    };

    const handlePointerLeave = () => {
      if (state.mode === "thermal" && state.hoverCell) {
        state.hoverCell = null;
        drawThermal();
      }
    };

    const handlePointerEnd = (e: PointerEvent) => {
      state.activePointers.delete(e.pointerId);
      state.drag = false;
      state.pinchDistance = 0;
      state.baseAngle = state.angle;
      state.baseTilt = state.tilt;
      if (state.mode === "iso") drawIso();
      if (state.mode === "iso" && Math.abs(state.angVel) > 0.002 && !state.reduceMotion) {
        requestDraw();
      }
      markInteraction();
    };

    const handleWheel = (e: WheelEvent) => {
      if (state.mode !== "iso") return;
      e.preventDefault();
      state.userZoom = Math.max(
        0.55,
        Math.min(2.2, state.userZoom * (e.deltaY > 0 ? 0.94 : 1.06)),
      );
      recomputeFit();
      drawIso();
      markInteraction();
    };

    const handleTabKey = (e: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const next =
        e.key === "ArrowLeft" || e.key === "Home" ? "iso" : "thermal";
      setVizMode(next);
      (next === "iso" ? isoButton : thermalButton).focus();
    };

    const handleResize = () => {
      resizeCanvas();
      recomputeFit();
      if (state.mode === "iso") drawIso();
      else drawThermal();
      requestDraw();
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      state.reduceMotion = event.matches;
      shell.dataset.reducedMotion = String(event.matches);
      if (event.matches) {
        state.rise = 1;
        state.thermalT = 1;
        state.ghostT = state.ghostTarget;
        state.angVel = 0;
      } else {
        state.lastInteraction = performance.now();
      }
      requestDraw();
    };

    if (!blind) {
      canvas.addEventListener("pointerdown", handlePointerDown, { signal });
      canvas.addEventListener("pointermove", handlePointerMove, {
        signal,
        passive: false,
      });
      canvas.addEventListener("pointerleave", handlePointerLeave, { signal });
      canvas.addEventListener("pointerup", handlePointerEnd, { signal });
      canvas.addEventListener("pointercancel", handlePointerEnd, { signal });
      canvas.addEventListener("wheel", handleWheel, { signal, passive: false });
    } else {
      canvas.style.cursor = "default";
    }
    isoButton.addEventListener("click", () => setVizMode("iso"), { signal });
    thermalButton.addEventListener("click", () => setVizMode("thermal"), {
      signal,
    });
    builtButton?.addEventListener("click", () => setPermitted(false), {
      signal,
    });
    permittedButton?.addEventListener("click", () => setPermitted(true), {
      signal,
    });
    isoButton.addEventListener("keydown", handleTabKey, { signal });
    thermalButton.addEventListener("keydown", handleTabKey, { signal });
    media.addEventListener("change", handleMotionChange, { signal });
    window.addEventListener("orientationchange", handleResize, { signal });
    window.visualViewport?.addEventListener("resize", handleResize, { signal });

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(panel);
    const intersectionObserver = new IntersectionObserver((entries) => {
      state.visible = entries[0]?.isIntersecting ?? true;
      if (state.visible) requestDraw();
      else if (state.raf) {
        cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
    });
    intersectionObserver.observe(shell);

    shell.dataset.reducedMotion = String(state.reduceMotion);
    shell.dataset.skyline = "built";
    shell.dataset.ghostRise = "0.000";
    // Double-rAF is deliberate: the panel needs a real layout width before fitting.
    state.raf = requestAnimationFrame(() => {
      state.raf = requestAnimationFrame(() => {
        setVizMode("iso");
        void document.fonts.ready.then(requestDraw);
      });
    });

    return () => {
      state.disposed = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      controller.abort();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [blind, ghostEnabled, payload]);

  return (
    <section
      className="viz-shell"
      ref={shellRef}
      data-blind={String(blind)}
      data-rendered="false"
    >
      <div className="viz-toolbar">
        <div className="viz-toolbar-title" ref={titleRef}>
          Skyline · <strong>height = assessed value</strong>
        </div>
        <div className="viz-toolbar-controls">
          <div
            className="skyline-switch"
            role="group"
            aria-label="Skyline envelope"
            hidden={!ghostEnabled}
          >
            <button
              ref={builtButtonRef}
              type="button"
              aria-pressed="true"
            >
              As built
            </button>
            <button
              ref={permittedButtonRef}
              type="button"
              aria-pressed="false"
            >
              As permitted
            </button>
          </div>
          <div
            className="mode-switch"
            role="tablist"
            aria-label="Visualization mode"
            hidden={blind}
          >
            <button
              ref={isoButtonRef}
              type="button"
              id="mode-iso"
              role="tab"
              aria-controls="city-panel"
              aria-selected="true"
              aria-pressed="true"
            >
              Skyline
            </button>
            <button
              ref={thermalButtonRef}
              type="button"
              id="mode-thermal"
              role="tab"
              aria-controls="city-panel"
              aria-selected="false"
              aria-pressed="false"
              tabIndex={-1}
            >
              Thermal
            </button>
          </div>
        </div>
      </div>
      <div
        className="iso-panel"
        id="city-panel"
        ref={panelRef}
        role="tabpanel"
        aria-labelledby="mode-iso"
      >
        <canvas
          ref={canvasRef}
          width="900"
          height="440"
          aria-label={
            blind
              ? `Schematic skyline of a ${
                  boroughName(payload.borough) ?? payload.borough
                } tax block`
              : `Schematic value visualization of ${payload.borough} tax block ${payload.block}`
          }
        />
        {payload.totalMv === 0 ? (
          <div
            className="empty-character ghost-empty-overlay"
            ref={emptyOverlayRef}
          >
            <div>
              <h2>No assessed value on this roll</h2>
              <p>
                The tax lot is present in the final roll, but its filed
                assessed market value is zero. There is no value geometry to
                draw.
              </p>
            </div>
          </div>
        ) : null}
        <div className="iso-hud" hidden={blind || payload.totalMv === 0}>
          <span ref={hudHintRef}>Drag to orbit · scroll to zoom</span>
          <span ref={hudModeRef}>Isometric</span>
        </div>
      </div>
      <div className="thermal-footer" hidden={blind}>
        <div className="thermal-legend">
          <span>
            <i className="legend-you" />
            addressed group
          </span>
          <span>
            <i className="legend-club" />
            contains a $50M lot
          </span>
          <span className="thermal-ramp" title="Assessed value, cool to warm">
            <em>low</em>
            <span className="bar" aria-hidden="true" />
            <em>high</em>
          </span>
        </div>
        <div className="thermal-meta" ref={metaRef}>
          Area ∝ value · every group shown
        </div>
      </div>
      <div className="ghost-footer" hidden={!ghostEnabled}>
        <div className="ghost-legend">
          <i aria-hidden="true" />
          <span>Translucent glass massing = unbuilt as-of-right capacity</span>
        </div>
        <p>{ghostCaveat}</p>
      </div>
    </section>
  );
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
}

function easeOutQuart(t: number) {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u * u;
}

function fmtMoney(v: number) {
  if (v >= 100) return "$" + Math.round(v) + "M";
  if (v >= 10) return "$" + v.toFixed(0) + "M";
  return "$" + v.toFixed(1) + "M";
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  pad: number,
) {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}
