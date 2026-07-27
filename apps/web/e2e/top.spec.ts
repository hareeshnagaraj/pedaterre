import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const cityStats = JSON.parse(
  await readFile(
    path.join(process.cwd(), "public/data/city-stats.json"),
    "utf8",
  ),
);

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

test("the full-city register filters and loads ranked chunks", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.goto("/top");

  await expect(
    page.getByRole("heading", {
      name: `ALL ${cityStats.nBlocks.toLocaleString("en-US")} BLOCKS, RANKED`,
    }),
  ).toBeVisible();

  const rows = page.getByTestId("rank-row");
  await expect(rows).toHaveCount(200);
  await expect(rows.first().locator(".rank-number")).toHaveText("1");
  await expect(rows.first().getByRole("link")).toHaveAttribute(
    "href",
    /^\/b\/[1-5]\/\d+$/,
  );

  await page.getByRole("button", { name: "MN", exact: true }).click();
  await expect(rows.first().getByRole("link")).toHaveAttribute(
    "href",
    /^\/b\/1\/\d+$/,
  );
  await expect(rows).toHaveCount(200);

  await page.getByTestId("rank-sentinel").scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(400);
});
