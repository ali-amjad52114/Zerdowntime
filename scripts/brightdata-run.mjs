import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const collectorId = process.env.SCRAPER_STUDIO_COLLECTOR_ID;
const targetUrl = process.env.SCRAPER_STUDIO_TARGET_URL ?? "https://example.com";
if (!process.env.BRIGHTDATA_API_KEY) {
  console.error("BRIGHTDATA_API_KEY is missing. Add it to .env.local.");
  process.exit(2);
}
if (!collectorId) {
  console.error("SCRAPER_STUDIO_COLLECTOR_ID is missing. Create a scraper and add its c_* ID to .env.local.");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    "node_modules/@brightdata/cli/dist/index.js",
    "scraper",
    "run",
    collectorId,
    targetUrl,
    "--pretty"
  ],
  { encoding: "utf8", env: process.env }
);

if (result.error) {
  console.error(`Unable to start the Bright Data CLI: ${result.error.message}`);
  process.exit(1);
}
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync("artifacts/brightdata", { recursive: true });
writeFileSync("artifacts/brightdata/raw.json", result.stdout, "utf8");

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch (error) {
  console.error(`Bright Data CLI returned invalid JSON: ${error.message}`);
  process.exit(1);
}

const records = Array.isArray(payload)
  ? payload.flatMap((item) =>
      Array.isArray(item?.stories)
        ? item.stories.filter((story) => story && typeof story === "object")
        : [item]
    )
  : [];
const normalized = `${JSON.stringify(records, null, 2)}\n`;
writeFileSync("artifacts/brightdata/latest.json", normalized, "utf8");
process.stdout.write(normalized);
