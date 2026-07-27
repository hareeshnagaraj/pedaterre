import { access } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

async function installStaticBuildRoute(page: import("@playwright/test").Page) {
  await page.route("http://127.0.0.1:3000/**", async (route) => {
    const url = new URL(route.request().url());
    let filePath: string;
    if (url.pathname.startsWith("/_next/static/")) {
      filePath = path.join(process.cwd(), ".next", url.pathname.slice(7));
    } else if (url.pathname.startsWith("/data/")) {
      filePath = path.join(process.cwd(), "public", url.pathname);
    } else {
      const relative =
        url.pathname === "/" ? "index.html" : `${url.pathname.slice(1)}.html`;
      filePath = path.join(process.cwd(), ".next/server/app", relative);
    }
    try {
      await access(filePath);
      await route.fulfill({ path: filePath, contentType: contentType(filePath) });
    } catch {
      await route.continue();
    }
  });
}

test("the city map switches measures and opens a known block", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.goto("/map", { waitUntil: "networkidle" });
  const canvas = page.locator(".city-map-canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await expect(canvas).toHaveAttribute("data-metric", "total");

  const totalImage = await canvas.evaluate(
    (element: HTMLCanvasElement) => element.toDataURL(),
  );
  await page
    .getByRole("button", { name: "PER SQUARE FOOT", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-metric", "density");
  const densityImage = await canvas.evaluate(
    (element: HTMLCanvasElement) => element.toDataURL(),
  );
  expect(densityImage).not.toBe(totalImage);

  await page.getByRole("button", { name: "TOTAL VALUE", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-metric", "total");

  const target = await page.evaluate(async () => {
    const columns = await fetch("/data/block-map.json").then((response) =>
      response.json(),
    );
    const canvasElement =
      document.querySelector<HTMLCanvasElement>(".city-map-canvas")!;
    const rect = canvasElement.getBoundingClientRect();
    const cosine = Math.cos((40.73 * Math.PI) / 180);
    const worldX = columns.x.map((value: number) => (value / 100_000) * cosine);
    const worldY = columns.y.map((value: number) => -(value / 100_000));
    const scale = Math.min(
      (rect.width - 60) / (Math.max(...worldX) - Math.min(...worldX)),
      (rect.height - 60) / (Math.max(...worldY) - Math.min(...worldY)),
    );
    const centerX = (Math.min(...worldX) + Math.max(...worldX)) / 2;
    const centerY = (Math.min(...worldY) + Math.max(...worldY)) / 2;
    const index = columns.b.findIndex(
      (boro: number, row: number) =>
        boro === 1 && columns.k[row] === 1171,
    );
    return {
      x: rect.left + (worldX[index] - centerX) * scale + rect.width / 2,
      y: rect.top + (worldY[index] - centerY) * scale + rect.height / 2,
    };
  });
  await page.mouse.click(target.x, target.y);
  await expect(page).toHaveURL(/\/b\/1\/1171$/);
});

test("the block locator renders and returns to its centered city map", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.goto("/b/1/1171", { waitUntil: "networkidle" });
  const locator = page.locator(".block-locator canvas");
  await expect(locator).toHaveAttribute("data-rendered", "true");
  await expect(
    page.getByRole("link", {
      name: "Open the city map centered on borough 1, block 1171",
    }),
  ).toHaveAttribute("href", "/map?b=1&k=1171");
});

test("metric and borough state load from and update the URL", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installStaticBuildRoute(page);
  await page.goto("/map?metric=density&boro=MN", {
    waitUntil: "networkidle",
  });

  const canvas = page.locator(".city-map-canvas");
  await expect(canvas).toHaveAttribute("data-rendered", "true");
  await expect(canvas).toHaveAttribute("data-color-scale", "quantile");
  await expect(canvas).toHaveAttribute("data-metric", "density");
  await expect(canvas).toHaveAttribute("data-borough", "MN");
  await expect(
    page.getByRole("button", { name: "PER SQUARE FOOT", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "MN", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(420);

  await page.getByRole("button", { name: "QN", exact: true }).click();
  await expect(page).toHaveURL(/\/map\?metric=density&boro=QN$/);
  await expect(canvas).toHaveAttribute("data-borough", "QN");

  await page.getByRole("button", { name: "TOTAL VALUE", exact: true }).click();
  await expect(page).toHaveURL(/\/map\?boro=QN$/);
  await expect(canvas).toHaveAttribute("data-metric", "total");
});
