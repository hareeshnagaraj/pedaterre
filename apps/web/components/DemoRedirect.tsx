"use client";

import { useEffect } from "react";

const fixtures = new Set([
  "bpc-16",
  "centralpark-1111",
  "median-si-245",
  "midtown-1398",
  "tail-si-2450",
  "zero-mn-213",
]);

export function DemoRedirect() {
  useEffect(() => {
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo && demo !== "midtown-1398" && fixtures.has(demo)) {
      window.location.replace(`/fixture/${demo}`);
    }
  }, []);

  return null;
}
