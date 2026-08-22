import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const collectorId = process.env.SCRAPER_STUDIO_COLLECTOR_ID;
if (!process.env.BRIGHTDATA_API_KEY) {
  console.error("BRIGHTDATA_API_KEY is missing. Add it to .env.local.");
  process.exit(2);
}
if (!collectorId) {
  console.error("SCRAPER_STUDIO_COLLECTOR_ID is missing. Create a scraper and add its c_* ID to .env.local.");
  process.exit(2);
}

const executable = process.platform === "win32" ? "bdata.cmd" : "bdata";
const result = spawnSync(
  executable,
  ["scraper", "run", collectorId, "https://news.ycombinator.com", "--pretty"],
  { encoding: "utf8", env: process.env }
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync("artifacts/brightdata", { recursive: true });
writeFileSync("artifacts/brightdata/latest.json", result.stdout, "utf8");
process.stdout.write(result.stdout);

