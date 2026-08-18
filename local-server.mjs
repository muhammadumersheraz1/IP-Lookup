import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import geo from "./api/geo.js";
import ip from "./api/ip.js";
import visits from "./api/visits.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const full = path.normalize(path.join(PUBLIC, filePath));
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/geo") return geo(req, res);
  if (url.pathname === "/api/ip") return ip(req, res);
  if (url.pathname === "/api/visits") return visits(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`IP2Location LITE  http://127.0.0.1:${PORT}/`);
});
