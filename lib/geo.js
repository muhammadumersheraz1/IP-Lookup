import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import unzipper from "./unzip-bin.mjs";
import { IP2LOCATION_TOKEN } from "./token.js";

const require = createRequire(import.meta.url);
const { IP2Location } = require("ip2location-nodejs");

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_BIN = path.join(ROOT, "data", "IP2LOCATION-LITE-DB3.BIN");
const TMP_BIN = path.join(os.tmpdir(), "IP2LOCATION-LITE-DB3.BIN");

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

const PRIVATE = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

let db;
let opening;

function clean(value) {
  const text = String(value || "").trim();
  if (!text || text === "-" || text === "INVALID IP ADDRESS") return "";
  return text;
}

export function isValidIPv4(ip) {
  return IPV4.test(ip);
}

export function isPublicIp(ip) {
  return isValidIPv4(ip) && !PRIVATE.some((re) => re.test(ip));
}

function headerValues(headers, key) {
  const raw = headers[key];
  if (!raw) return [];
  const value = Array.isArray(raw) ? raw.join(",") : String(raw);
  return value.split(",").map((part) => {
    let ip = part.trim();
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    return ip;
  });
}

export function clientIp(req) {
  const headers = req.headers || {};
  const candidates = [
    ...headerValues(headers, "x-vercel-forwarded-for"),
    ...headerValues(headers, "cf-connecting-ip"),
    ...headerValues(headers, "x-real-ip"),
    ...headerValues(headers, "x-forwarded-for"),
  ];
  let socketIp = req.socket?.remoteAddress || "";
  if (socketIp.startsWith("::ffff:")) socketIp = socketIp.slice(7);
  candidates.push(socketIp);

  return (
    candidates.find((ip) => isPublicIp(ip)) ||
    candidates.find((ip) => isValidIPv4(ip)) ||
    socketIp
  );
}

export async function visitorPublicIp(req) {
  const ip = clientIp(req);
  if (isPublicIp(ip)) {
    return { ip, source: "request" };
  }

  const response = await fetch("https://api.ipify.org?format=json", {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    return { ip, source: "request", local: true };
  }
  const data = await response.json();
  if (isValidIPv4(data.ip)) {
    return { ip: data.ip, source: "public-echo", local: true };
  }
  return { ip, source: "request", local: true };
}

async function downloadBin(dest) {
  const token = process.env.IP2LOCATION_TOKEN || IP2LOCATION_TOKEN;
  const url = process.env.IP2LOCATION_BIN_URL || "";
  if (!token && !url) {
    throw new Error("Missing IP2Location download token.");
  }

  const downloadUrl =
    url ||
    `https://www.ip2location.com/download?token=${encodeURIComponent(token)}&file=DB3LITEBIN`;

  const response = await fetch(downloadUrl, {
    headers: { "User-Agent": "IP-Lookup/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download IP2Location BIN (${response.status})`);
  }

  const tmpZip = `${dest}.zip`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpZip));
  const head = Buffer.alloc(4);
  const fd = fs.openSync(tmpZip, "r");
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);

  if (head.toString("utf8") === "PK\u0003\u0004" || head[0] === 0x50) {
    await unzipper(tmpZip, dest);
    fs.unlinkSync(tmpZip);
    return;
  }

  fs.renameSync(tmpZip, dest);
}

function existingBin(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 1_000_000
    ? filePath
    : "";
}

async function resolveBinPath() {
  const candidates = [
    LOCAL_BIN,
    path.join(process.cwd(), "data", "IP2LOCATION-LITE-DB3.BIN"),
    path.join("/var/task", "data", "IP2LOCATION-LITE-DB3.BIN"),
    TMP_BIN,
  ];
  for (const candidate of candidates) {
    const found = existingBin(candidate);
    if (found) return found;
  }
  fs.mkdirSync(path.dirname(TMP_BIN), { recursive: true });
  await downloadBin(TMP_BIN);
  return TMP_BIN;
}

export async function getDb() {
  if (db) return db;
  if (!opening) {
    opening = (async () => {
      const binPath = await resolveBinPath();
      const ip2location = new IP2Location();
      ip2location.open(binPath);
      db = ip2location;
      return db;
    })();
  }
  return opening;
}

export async function lookup(ip) {
  const database = await getDb();
  const all = database.getAll(ip);
  const city = clean(all.city);
  return {
    ip,
    city,
    region: clean(all.region),
    country: clean(all.countryLong || all.country),
    country_code: clean(all.countryShort),
    found: Boolean(city),
    source: "IP2Location LITE",
    sample: false,
  };
}
