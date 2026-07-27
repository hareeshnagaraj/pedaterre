import type { CSSProperties } from "react";

export const STATE_TOKENS = Object.freeze({
  void: "#080706",
  ink: "#efe9dd",
  inkDim: "#8f877c",
  paper: "#f4efe4",
  paperInk: "#141210",
  stamp: "#e23d2d",
  gold: "#e0b04a",
  you: "#6ed4ff",
  font: '"Libre Franklin", system-ui, sans-serif',
  num: '"Barlow Condensed", "Arial Narrow", sans-serif',
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const);

export const stateTokenStyle = {
  "--void": STATE_TOKENS.void,
  "--ink": STATE_TOKENS.ink,
  "--ink-dim": STATE_TOKENS.inkDim,
  "--paper": STATE_TOKENS.paper,
  "--paper-ink": STATE_TOKENS.paperInk,
  "--stamp": STATE_TOKENS.stamp,
  "--gold": STATE_TOKENS.gold,
  "--you": STATE_TOKENS.you,
  "--font": STATE_TOKENS.font,
  "--num": STATE_TOKENS.num,
  "--ease": STATE_TOKENS.ease,
} as CSSProperties;
