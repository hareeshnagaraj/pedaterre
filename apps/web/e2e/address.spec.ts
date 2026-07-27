import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const fixture = JSON.parse(
  await readFile(
    path.resolve(process.cwd(), "../../data/fixtures/midtown-1398.json"),
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
      const clean = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
      const relative = clean ? `${clean.slice(1)}.html` : "index.html";
      filePath = path.join(process.cwd(), ".next/server/app", relative);
    }
    try {
      await access(filePath);
      await route.fulfill({ path: filePath, contentType: contentType(filePath) });
    } catch {
      // Not pre-rendered: long-tail blocks render on demand since the
      // curated-static-params change — let the live server answer.
      await route.continue();
    }
  });
}

test("a cold deep link exposes its identity before client JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await installStaticBuildRoute(page);
  await page.goto("/b/1/1398?lot=1010");
  await expect(page.getByRole("link", { name: "pedaterre" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Block 1398" })).toBeVisible();
  await expect(page.getByText("Manhattan", { exact: true })).toBeVisible();
  await context.close();
});

test("a billing-lot deep link marks its non-zero property group", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.route("**/data/buckets/1/139.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ "1398": fixture }),
    }),
  );
  await page.goto("/b/1/1398?lot=1010");
  await expect(page.locator(".viz-shell")).toHaveAttribute(
    "data-rendered",
    "true",
  );
  await expect(page.getByText(/YOUR PROPERTY GROUP · 196 LOTS/)).toBeVisible();
  await expect(page.getByText(/REQUESTED LOT IS NOT ON THIS ROLL/)).toHaveCount(
    0,
  );
});

test("bucket 404 and network failure reach their distinct states", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.route("**/data/buckets/1/139.json", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.goto("/b/1/1398");
  await expect(page.getByText(/NO PARCEL ON FILE/)).toBeVisible();

  await page.unroute("**/data/buckets/1/139.json");
  await page.route("**/data/buckets/1/139.json", (route) => route.abort());
  await page.reload();
  await expect(page.getByText("ROLL REQUEST INTERRUPTED")).toBeVisible();
  await expect(page.getByRole("button", { name: "RETRY" })).toBeVisible();
});

test("raw BBL input navigates without a GeoSearch request", async ({ page }) => {
  await installStaticBuildRoute(page);
  let geosearchRequests = 0;
  await page.route("https://geosearch.planninglabs.nyc/**", (route) => {
    geosearchRequests += 1;
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "NYC address or BBL" }).fill(
    "1-01398-1010",
  );
  await page.getByRole("button", { name: "LOOK UP THE BLOCK" }).click();
  await expect(page).toHaveURL(/\/b\/1\/1398\?lot=1010$/);
  expect(geosearchRequests).toBe(0);
});
