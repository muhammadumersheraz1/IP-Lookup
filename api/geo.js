import { clientIp, isPublicIp, isValidIPv4, lookup } from "../lib/geo.js";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }

    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    const requested = (url.searchParams.get("ip") || "").trim();
    const visitorIp = clientIp(req);
    const ip = requested || visitorIp;

    if (!isValidIPv4(ip)) {
      send(res, 400, { error: "Enter a valid IPv4 address", ip });
      return;
    }

    const result = await lookup(ip);
    result.visitor_ip = visitorIp;
    result.local = !isPublicIp(ip);
    if (result.local && !requested) {
      result.note =
        "This request came from a private IP (localhost). On Vercel the visitor IP is looked up automatically.";
    }
    send(res, 200, result);
  } catch (error) {
    send(res, 500, { error: error.message || "Lookup failed" });
  }
}
