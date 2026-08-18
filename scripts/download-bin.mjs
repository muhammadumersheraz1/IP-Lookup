import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import unzipBin from "../lib/unzip-bin.mjs";
import { IP2LOCATION_TOKEN } from "../lib/token.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const ZIP_PATH = path.join(DATA_DIR, "IP2LOCATION-LITE-DB3.BIN.ZIP");
const BIN_PATH = path.join(DATA_DIR, "IP2LOCATION-LITE-DB3.BIN");

if (fs.existsSync(BIN_PATH) && fs.statSync(BIN_PATH).size > 1_000_000) {
  console.log(`Using existing ${BIN_PATH}`);
  process.exit(0);
}

const token = process.env.IP2LOCATION_TOKEN || process.argv[2] || IP2LOCATION_TOKEN;

fs.mkdirSync(DATA_DIR, { recursive: true });
const url = `https://www.ip2location.com/download?token=${encodeURIComponent(token)}&file=DB3LITEBIN`;
console.log("Downloading IP2Location LITE DB3 BIN…");

const response = await fetch(url, { headers: { "User-Agent": "IP-Lookup/1.0" } });
if (!response.ok) {
  throw new Error(`Download failed (${response.status})`);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(ZIP_PATH));
const size = fs.statSync(ZIP_PATH).size;
if (size < 50_000) {
  const text = fs.readFileSync(ZIP_PATH, "utf8").slice(0, 200);
  fs.unlinkSync(ZIP_PATH);
  throw new Error(`Download failed: ${text}`);
}

unzipBin(ZIP_PATH, BIN_PATH);
fs.unlinkSync(ZIP_PATH);
console.log(`Ready: ${BIN_PATH} (${fs.statSync(BIN_PATH).size.toLocaleString()} bytes)`);
