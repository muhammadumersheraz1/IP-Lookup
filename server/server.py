#!/usr/bin/env python3
"""IP2Location LITE city lookup on this machine. No Jina.

  python3 server/server.py

Then open http://127.0.0.1:8080/

On page load the browser calls /api/geo. This server reads the visitor IP
and looks up city in the local LITE database. /api/visits stores the result.
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from download_db import CSV_PATH
from geo import DATA_DIR, connect, is_public_ip, lookup, using_sample

ROOT = Path(__file__).resolve().parent.parent
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
IPV4 = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)

geo_conn = connect()
visits_conn = sqlite3.connect(DATA_DIR / "visits.sqlite", check_same_thread=False)
visits_conn.execute(
    """
    CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        created_at TEXT
    )
    """
)
visits_conn.commit()


def json_bytes(payload: dict, status: int = 200):
    body = json.dumps(payload).encode("utf-8")
    return status, body


def client_ip(handler) -> str:
    forwarded = handler.headers.get("CF-Connecting-IP") or handler.headers.get("X-Real-IP")
    if forwarded and IPV4.match(forwarded.strip()):
        return forwarded.strip()
    xff = handler.headers.get("X-Forwarded-For", "")
    if xff:
        first = xff.split(",")[0].strip()
        if IPV4.match(first):
            return first
    host = handler.client_address[0]
    if host.startswith("::ffff:"):
        host = host.split(":")[-1]
    return host


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send(self, status: int, body: bytes, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/geo":
            self.handle_geo(parsed)
            return
        if parsed.path == "/api/visits":
            self.handle_visits_list()
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/visits":
            self.handle_visits_save()
            return
        self._send(*json_bytes({"error": "Not found"}, 404))

    def handle_geo(self, parsed):
        query = parse_qs(parsed.query)
        requested = (query.get("ip") or [""])[0].strip()
        visitor_ip = client_ip(self)
        ip = requested or visitor_ip

        if not IPV4.match(ip):
            status, body = json_bytes({"error": "Enter a valid IPv4 address", "ip": ip}, 400)
            self._send(status, body)
            return

        result = lookup(geo_conn, ip)
        result["visitor_ip"] = visitor_ip
        result["local"] = not is_public_ip(ip)
        if result["local"] and not requested:
            result["note"] = (
                "This request came from a private IP (localhost). "
                "On a public website the visitor IP is looked up automatically."
            )
        status, body = json_bytes(result)
        self._send(status, body)

    def handle_visits_save(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send(*json_bytes({"error": "Invalid JSON"}, 400))
            return

        ip = str(payload.get("ip") or client_ip(self)).strip()
        city = str(payload.get("city") or "").strip()
        region = str(payload.get("region") or "").strip()
        country = str(payload.get("country") or "").strip()
        if not city:
            lookup_ip = ip if IPV4.match(ip) else client_ip(self)
            if IPV4.match(lookup_ip):
                found = lookup(geo_conn, lookup_ip)
                ip, city, region, country = (
                    found["ip"],
                    found["city"],
                    found["region"],
                    found["country"],
                )

        visits_conn.execute(
            "INSERT INTO visits(ip, city, region, country, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                ip,
                city,
                region,
                country,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        visits_conn.commit()
        self._send(*json_bytes({"ok": True, "ip": ip, "city": city, "region": region, "country": country}))

    def handle_visits_list(self):
        rows = visits_conn.execute(
            "SELECT id, ip, city, region, country, created_at FROM visits ORDER BY id DESC LIMIT 50"
        ).fetchall()
        visits = [
            {
                "id": row[0],
                "ip": row[1],
                "city": row[2],
                "region": row[3],
                "country": row[4],
                "created_at": row[5],
            }
            for row in rows
        ]
        self._send(*json_bytes({"visits": visits}))


def main():
    sys.stdout.reconfigure(line_buffering=True)
    print(f"IP2Location LITE server  http://{HOST}:{PORT}/")
    if using_sample():
        print("Using SAMPLE ranges only (Lahore demo IP 119.73.7.124).")
        print("For production city data:")
        print("  1. Free signup: https://lite.ip2location.com/")
        print("  2. python3 server/download_db.py YOUR_TOKEN")
        print("  3. Restart this server")
        if not CSV_PATH.exists():
            print(f"Full DB not found at {CSV_PATH}")
    else:
        print(f"Database: {CSV_PATH}")
    print("This product includes IP2Location LITE data available from https://lite.ip2location.com")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
