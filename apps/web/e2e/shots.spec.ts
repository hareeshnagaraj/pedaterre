import path from "node:path";
import { access } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const fixtureNames = [
  "bpc-16",
  "centralpark-1111",
  "median-si-245",
  "midtown-1398",
  "tail-si-2450",
  "zero-mn-213",
] as const;

const viewports = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

const outputDirectory = path.resolve(process.cwd(), "out");

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}

async function installStaticExportRoute(page: import("@playwright/test").Page) {
  await page.route("http://pedaterre.local/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = decodeURIComponent(url.pathname);
    const hasExtension = path.extname(pathname) !== "";
    const relativePath =
      pathname === "/"
        ? "index.html"
        : hasExtension
          ? pathname.slice(1)
          : `${pathname.slice(1)}.html`;
    const filePath = path.join(outputDirectory, relativePath);

    try {
      await access(filePath);
      await route.fulfill({ path: filePath, contentType: contentType(filePath) });
    } catch {
      await route.fulfill({
        status: 404,
        path: path.join(outputDirectory, "404.html"),
        contentType: "text/html",
      });
    }
  });
}

test("capture every fixture in both modes and both viewports", async ({ page }) => {
  test.setTimeout(180_000);
  await installStaticExportRoute(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const name of fixtureNames) {
      await page.goto(`http://pedaterre.local/fixture/${name}`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const shell = page.locator(".viz-shell");
      await expect(shell).toHaveAttribute("data-rendered", "true");

      if (name !== "zero-mn-213") {
        await page.waitForFunction(() => {
          const element = document.querySelector<HTMLElement>(".viz-shell");
          return Number(element?.dataset.rise ?? 0) >= 0.999;
        });
      }
      await page.screenshot({
        path: path.join(
          "shots",
          `${name}-skyline-${viewport.width}x${viewport.height}.png`,
        ),
      });

      await page.getByRole("tab", { name: "Thermal" }).click();
      await expect(shell).toHaveAttribute("data-mode", "thermal");
      if (name !== "zero-mn-213") {
        await page.waitForFunction(() => {
          const element = document.querySelector<HTMLElement>(".viz-shell");
          return Number(element?.dataset.thermalReveal ?? 0) >= 0.999;
        });
      }
      await page.screenshot({
        path: path.join(
          "shots",
          `${name}-thermal-${viewport.width}x${viewport.height}.png`,
        ),
      });
    }
  }
});

test("reduced motion has instant rise and no idle orbit", async ({ page }) => {
  await installStaticExportRoute(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://pedaterre.local/fixture/midtown-1398", {
    waitUntil: "networkidle",
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const shell = page.locator(".viz-shell");

  await expect(shell).toHaveAttribute("data-rendered", "true");
  await expect(shell).toHaveAttribute("data-reduced-motion", "true");
  await expect(shell).toHaveAttribute("data-rise", "1.000");
  await expect(shell).toHaveAttribute("data-idle-orbit", "false");
  await page.screenshot({
    path: path.join(
      "shots",
      "midtown-1398-skyline-reduced-motion-1280x900.png",
    ),
  });
});
