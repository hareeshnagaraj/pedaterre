import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

interface ClubLot {
  boro: number;
  block: number;
  lot: number;
  owner?: string;
}

const cityStats = JSON.parse(
  await readFile(
    path.join(process.cwd(), "public/data/city-stats.json"),
    "utf8",
  ),
);
const clubLots = JSON.parse(
  await readFile(
    path.join(process.cwd(), "public/data/club-lots.json"),
    "utf8",
  ),
) as ClubLot[];

const boroughCodes: Record<number, string> = {
  1: "MN",
  2: "BX",
  3: "BK",
  4: "QN",
  5: "SI",
};
const boroughCounts = new Map<number, number>();
const ownerCounts = new Map<string, number>();
for (const lot of clubLots) {
  boroughCounts.set(lot.boro, (boroughCounts.get(lot.boro) ?? 0) + 1);
  if (lot.owner) ownerCounts.set(lot.owner, (ownerCounts.get(lot.owner) ?? 0) + 1);
}
const filterBorough = [...boroughCounts].sort(
  (left, right) => right[1] - left[1],
)[0];
const knownOwner = clubLots.find(
  (lot) => lot.owner && ownerCounts.get(lot.owner) === 1,
);
if (!filterBorough || !knownOwner?.owner) {
  throw new Error("Club register fixture facts could not be selected.");
}

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

test("the club register filters lots and loads ranked chunks", async ({
  page,
}) => {
  await installStaticBuildRoute(page);
  await page.goto("/club");

  await expect(
    page.getByRole("heading", {
      name: `${cityStats.clubLots.toLocaleString("en-US")} LOTS CARRY ${(cityStats.clubShareOfMv * 100).toFixed(1)}% OF CITY VALUE`,
    }),
  ).toBeVisible();

  const rows = page.getByTestId("club-row");
  await expect(rows).toHaveCount(200);
  await expect(rows.first().locator(".rank-number")).toHaveText("1");
  await expect(rows.first().getByRole("link")).toHaveAttribute(
    "href",
    `/b/${clubLots[0].boro}/${clubLots[0].block}?lot=${clubLots[0].lot}`,
  );

  const [borough, boroughCount] = filterBorough;
  await page
    .getByRole("button", { name: boroughCodes[borough], exact: true })
    .click();
  await expect(page.locator(".rank-count")).toContainText(
    `${boroughCount.toLocaleString("en-US")} lots on register`,
  );
  await expect(rows).toHaveCount(Math.min(200, boroughCount));
  await expect(rows.first().getByRole("link")).toHaveAttribute(
    "href",
    new RegExp(`^/b/${borough}/\\d+\\?lot=\\d+$`),
  );

  await page.getByRole("button", { name: "ALL", exact: true }).click();
  await page.getByRole("searchbox", { name: "FILTER OWNER OR ADDRESS" }).fill(
    knownOwner.owner,
  );
  await expect(rows.first().locator(".club-owner")).toHaveText(knownOwner.owner);

  await page.getByRole("searchbox", { name: "FILTER OWNER OR ADDRESS" }).fill(
    "",
  );
  await expect(rows).toHaveCount(200);
  await page.getByTestId("club-sentinel").scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(400);
});
