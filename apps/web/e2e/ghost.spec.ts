import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const ghostStats = JSON.parse(
  await readFile(
    path.join(process.cwd(), "public/data/ghost-stats.json"),
    "utf8",
  ),
);

function contentType(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".rsc")) return "text/x-component";
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

test("known capacity raises glass massing and reduced motion skips the tween", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/b/1/972", { waitUntil: "networkidle" });

  const shell = page.locator(".viz-shell");
  const canvas = shell.locator("canvas");
  await expect(shell).toHaveAttribute("data-rendered", "true");
  await expect(shell).toHaveAttribute("data-reduced-motion", "true");
  await expect(shell).toHaveAttribute("data-skyline", "built");
  await expect(shell).toHaveAttribute("data-ghost-rise", "0.000");
  await expect(page.getByText(ghostStats.caveat, { exact: true })).toBeVisible();

  const built = createHash("sha256")
    .update(
      await canvas.evaluate((element) =>
        (element as HTMLCanvasElement).toDataURL(),
      ),
    )
    .digest("hex");

  await page.getByRole("button", { name: "As permitted" }).click();
  await expect(shell).toHaveAttribute("data-skyline", "permitted");
  await expect(shell).toHaveAttribute("data-ghost-rise", "1.000");

  const permitted = createHash("sha256")
    .update(
      await canvas.evaluate((element) =>
        (element as HTMLCanvasElement).toDataURL(),
      ),
    )
    .digest("hex");
  expect(permitted).not.toBe(built);
});

test("the ranked page states citywide capacity from the published index", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.goto("/top");

  await expect(
    page.getByRole("heading", {
      name: `${ghostStats.citywide.capacitySqft.toLocaleString(
        "en-US",
      )} SQ FT UNBUILT`,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(ghostStats.caveat, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Blocks with the most unbuilt capacity",
    }),
  ).toBeVisible();
});
