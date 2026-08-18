import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clientIp, isValidIPv4, lookup } from "../lib/geo.js";

const VISITS_PATH = path.join(os.tmpdir(), "ip-lookup-visits.json");

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function loadVisits() {
  try {
    return JSON.parse(fs.readFileSync(VISITS_PATH, "utf8"));
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      send(res, 200, { visits: loadVisits().slice(-50).reverse() });
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    let payload = {};
    const raw = await readBody(req);
    if (raw) payload = JSON.parse(raw);

    let ip = String(payload.ip || clientIp(req)).trim();
    let city = String(payload.city || "").trim();
    let region = String(payload.region || "").trim();
    let country = String(payload.country || "").trim();

    if (!city && isValidIPv4(ip)) {
      const found = await lookup(ip);
      ip = found.ip;
      city = found.city;
      region = found.region;
      country = found.country;
    }

    const visits = loadVisits();
    const row = {
      id: visits.length + 1,
      ip,
      city,
      region,
      country,
      created_at: new Date().toISOString(),
    };
    visits.push(row);
    fs.writeFileSync(VISITS_PATH, JSON.stringify(visits.slice(-500)));
    send(res, 200, { ok: true, ...row });
  } catch (error) {
    send(res, 500, { error: error.message || "Could not save visit" });
  }
}
