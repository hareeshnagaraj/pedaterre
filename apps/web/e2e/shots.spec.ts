import path from "node:path";
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

test("capture every fixture in both modes and both viewports", async ({ page }) => {
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const name of fixtureNames) {
      await page.goto(`/fixture/${name}`, {
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
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/fixture/midtown-1398", {
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
