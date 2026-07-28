import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { BlockRankRow } from "../lib/blockRanks";
import {
  createGameRandom,
  selectGamePair,
} from "../lib/game";

const fixture = JSON.parse(
  await readFile(
    path.resolve(process.cwd(), "../../data/fixtures/midtown-1398.json"),
    "utf8",
  ),
);

const rows: BlockRankRow[] = [
  { b: 1, k: 101, m: 300_000_000, t: true, c: "whale", rank: 1 },
  { b: 2, k: 202, m: 200_000_000, t: true, c: "flat", rank: 2 },
  { b: 3, k: 303, m: 150_000_000, t: true, c: "spread", rank: 3 },
  { b: 4, k: 404, m: 100_000_000, t: true, c: "whale", rank: 4 },
];

const borough = {
  1: "MN",
  2: "BX",
  3: "BK",
  4: "QN",
} as const;

function payload(row: BlockRankRow) {
  return {
    ...fixture,
    borough: borough[row.b as keyof typeof borough],
    block: row.k,
    bblPrefix: `${row.b}-${String(row.k).padStart(5, "0")}`,
    totalMv: row.m,
    totalM: row.m / 1_000_000,
  };
}

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

async function installGameData(page: import("@playwright/test").Page) {
  await page.route("**/data/block-ranks.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(rows),
    }),
  );
  for (const row of rows) {
    await page.route(
      `**/data/buckets/${row.b}/${Math.floor(row.k / 10)}.json`,
      (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ [row.k]: payload(row) }),
        }),
    );
  }
}

test("a seeded run stays blind, reveals, advances, and reproduces", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await installGameData(page);
  await page.goto("/game?seed=test");

  const choices = page.getByRole("button", { name: /^(Left|Right) block,/ });
  await expect(choices).toHaveCount(2);
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.locator('[data-blind="true"]')).toHaveCount(2);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator(".iso-hud:visible")).toHaveCount(0);
  await expect(
    page.locator('[data-blind="true"] .viz-toolbar-title'),
  ).toHaveText([
    /height = assessed value/i,
    /height = assessed value/i,
  ]);
  await expect(page.getByText("THIS ONE")).toHaveCount(2);
  const firstNames = await choices.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  const withheldText = await choices.evaluateAll((buttons) =>
    buttons.map((button) => (button as HTMLElement).innerText),
  );
  expect(withheldText.join(" ")).not.toMatch(/\$|BLOCK \d|#\d/);

  const firstPair = selectGamePair(rows, 0, new Set(), createGameRandom("test"));
  expect(firstPair).not.toBeNull();
  const correctSide =
    (firstPair?.left.m ?? 0) > (firstPair?.right.m ?? 0) ? "Left" : "Right";
  await page
    .getByRole("button", { name: new RegExp(`^${correctSide} block,`) })
    .click();

  await expect(page.getByText("THE ROLL SAYS")).toHaveCount(2);
  await expect(page.getByTestId("game-streak")).toHaveText("1");
  await expect(page.getByRole("button", { name: "NEXT PAIR" })).toBeVisible();

  await page.getByRole("button", { name: "NEXT PAIR" }).click();
  await expect(choices).toHaveCount(2);
  const secondNames = await choices.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("aria-label")),
  );
  expect(secondNames).not.toEqual(firstNames);

  await page.reload();
  await expect(choices).toHaveCount(2);
  expect(
    await choices.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    ),
  ).toEqual(firstNames);
});
