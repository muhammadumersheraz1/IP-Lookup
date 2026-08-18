import { visitorPublicIp } from "../lib/geo.js";

export const config = {
  maxDuration: 10,
};

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
    const result = await visitorPublicIp(req);
    send(res, 200, result);
  } catch (error) {
    send(res, 500, { error: error.message || "Could not detect IP" });
  }
}
