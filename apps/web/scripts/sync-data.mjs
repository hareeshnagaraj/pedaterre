import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "../..");
const repositoryData = path.join(repositoryRoot, "data/generated");
const checkoutName = path.basename(repositoryRoot).replace(/-ws\d+.*$/, "");
const siblingCheckoutData = path.join(
  path.dirname(repositoryRoot),
  checkoutName,
  "data/generated",
);
const localDataExists = await stat(repositoryData)
  .then((details) => details.isDirectory())
  .catch(() => false);
const requestedSource =
  process.argv[2] ??
  process.env.PEDATERRE_DATA_DIR ??
  (localDataExists ? repositoryData : siblingCheckoutData);
const sourceRoot = path.resolve(process.cwd(), requestedSource);
const sourceBuckets = path.join(sourceRoot, "buckets");
const sourceBlockRanks = path.join(sourceRoot, "index/block-ranks.json");
const sourceBlockMap = path.join(sourceRoot, "index/block-map.json");
const sourceCityStats = path.join(sourceRoot, "index/city-stats.json");
const sourceClubLots = path.join(sourceRoot, "index/club-lots.json");
const sourceGhostStats = path.join(sourceRoot, "index/ghost-stats.json");
const sourceMeta = path.join(sourceRoot, "meta.json");
const outputRoot = path.join(appRoot, "public/data");
const outputBuckets = path.join(outputRoot, "buckets");

async function requireFile(filePath, label) {
  try {
    const details = await stat(filePath);
    if (!details.isFile() || details.size === 0) throw new Error("empty");
  } catch {
    throw new Error(
      `sync-data: ${label} is missing at ${filePath}. ` +
        "Pass the generated data directory after -- or set PEDATERRE_DATA_DIR.",
    );
  }
}

async function requireBuckets() {
  let boroughs;
  try {
    boroughs = await readdir(sourceBuckets, { withFileTypes: true });
  } catch {
    boroughs = [];
  }

  const boroughDirectories = boroughs.filter(
    (entry) => entry.isDirectory() && /^[1-5]$/.test(entry.name),
  );
  if (boroughDirectories.length !== 5) {
    throw new Error(
      `sync-data: real bucket data is absent at ${sourceBuckets}; ` +
        `expected borough directories 1–5, found ${boroughDirectories.length}.`,
    );
  }

  let bucketCount = 0;
  for (const borough of boroughDirectories) {
    const files = await readdir(path.join(sourceBuckets, borough.name));
    bucketCount += files.filter((file) => file.endsWith(".json")).length;
  }
  if (bucketCount === 0) {
    throw new Error(`sync-data: no bucket JSON files found at ${sourceBuckets}.`);
  }
  return bucketCount;
}

async function deriveBoroughPicks() {
  const best = new Map();
  for (const boro of ["1", "2", "3", "4", "5"]) {
    const files = (await readdir(path.join(sourceBuckets, boro))).filter((file) =>
      file.endsWith(".json"),
    );
    for (const file of files) {
      const bucket = JSON.parse(
        await readFile(path.join(sourceBuckets, boro, file), "utf8"),
      );
      for (const payload of Object.values(bucket)) {
        if (
          !payload ||
          typeof payload !== "object" ||
          !Number.isFinite(payload.totalMv)
        ) {
          continue;
        }
        const current = best.get(payload.borough);
        if (!current || payload.totalM > current.totalM) {
          best.set(payload.borough, {
            borough: payload.borough,
            block: payload.block,
            totalM: payload.totalM,
            addressHint: payload.addressHint,
          });
        }
      }
    }
  }
  return Object.fromEntries(best);
}

const bucketCount = await requireBuckets();
await requireFile(sourceBlockRanks, "block-ranks.json");
await requireFile(sourceBlockMap, "block-map.json");
await requireFile(sourceCityStats, "city-stats.json");
await requireFile(sourceClubLots, "club-lots.json");
await requireFile(sourceGhostStats, "ghost-stats.json");
await requireFile(sourceMeta, "meta.json");
await mkdir(outputRoot, { recursive: true });
await mkdir(outputBuckets, { recursive: true });
try {
  await run("rsync", [
    "-a",
    "--delete",
    `${sourceBuckets}${path.sep}`,
    `${outputBuckets}${path.sep}`,
  ]);
} catch (error) {
  throw new Error("sync-data: rsync failed while publishing bucket data.", {
    cause: error,
  });
}
await cp(sourceCityStats, path.join(outputRoot, "city-stats.json"), {
  force: true,
});
await cp(sourceBlockRanks, path.join(outputRoot, "block-ranks.json"), {
  force: true,
});
await cp(sourceBlockMap, path.join(outputRoot, "block-map.json"), {
  force: true,
});
await cp(sourceClubLots, path.join(outputRoot, "club-lots.json"), {
  force: true,
});
await cp(sourceGhostStats, path.join(outputRoot, "ghost-stats.json"), {
  force: true,
});
await cp(sourceMeta, path.join(outputRoot, "meta.json"), { force: true });
await writeFile(
  path.join(outputRoot, "borough-picks.json"),
  JSON.stringify(await deriveBoroughPicks()),
);

process.stdout.write(
  `sync-data: published ${bucketCount.toLocaleString()} buckets from ${sourceRoot}\n`,
);
