import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const run = spawnSync(process.execPath, ["scripts/brightdata-run.mjs"], {
  encoding: "utf8",
  env: process.env
});
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status ?? 1);

let rows;
try {
  rows = JSON.parse(readFileSync("artifacts/brightdata/latest.json", "utf8"));
} catch (error) {
  console.error(`Bright Data output was not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(rows) || rows.length === 0) {
  console.error("Expected a non-empty JSON array from Scraper Studio.");
  process.exit(1);
}

const required = ["title", "url", "points", "author", "comment_count"];
const populated = Object.fromEntries(required.map((field) => [field, 0]));
for (const row of rows) {
  for (const field of required) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") {
      populated[field] += 1;
    }
  }
}

const missingEverywhere = required.filter((field) => populated[field] === 0);
if (missingEverywhere.length) {
  console.error(`Fields missing from every record: ${missingEverywhere.join(", ")}`);
  process.exit(1);
}

console.log(`Bright Data smoke test passed with ${rows.length} records.`);
console.log(JSON.stringify({ populated }, null, 2));

