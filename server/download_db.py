#!/usr/bin/env python3
"""Download IP2Location LITE DB3 (country, region, city).

Get a free token: https://lite.ip2location.com/
Then:

  export IP2LOCATION_TOKEN=your_token
  python3 server/download_db.py
"""

import os
import sys
import zipfile
from pathlib import Path
from urllib.request import Request, urlopen

DATA_DIR = Path(__file__).resolve().parent / "data"
CSV_PATH = DATA_DIR / "IP2LOCATION-LITE-DB3.CSV"
ZIP_PATH = DATA_DIR / "IP2LOCATION-LITE-DB3.CSV.ZIP"
DOWNLOAD_URL = "https://www.ip2location.com/download/"


def download(token: str) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = f"{DOWNLOAD_URL}?token={token}&file=DB3LITECSV"
    print("Downloading IP2Location LITE DB3 CSV…")
    request = Request(url, headers={"User-Agent": "IP-Lookup/1.0"})
    with urlopen(request, timeout=300) as response:
        content_type = response.headers.get("Content-Type", "")
        total = 0
        with ZIP_PATH.open("wb") as dest:
            while True:
                chunk = response.read(1024 * 256)
                if not chunk:
                    break
                dest.write(chunk)
                total += len(chunk)

    with ZIP_PATH.open("rb") as handle:
        payload_head = handle.read(200)
    if total < 50_000 or b"<html" in payload_head.lower():
        ZIP_PATH.unlink(missing_ok=True)
        raise SystemExit(
            "Download failed. Check IP2LOCATION_TOKEN at https://lite.ip2location.com/"
        )

    print(f"Saved {ZIP_PATH.name} ({total:,} bytes, {content_type})")

    with zipfile.ZipFile(ZIP_PATH) as archive:
        member = next(
            (name for name in archive.namelist() if name.upper().endswith(".CSV")),
            None,
        )
        if not member:
            raise SystemExit(f"No CSV in zip: {archive.namelist()}")
        target = DATA_DIR / Path(member).name
        with archive.open(member) as src, target.open("wb") as dest:
            dest.write(src.read())

    if target.resolve() != CSV_PATH.resolve():
        target.replace(CSV_PATH)
    ZIP_PATH.unlink(missing_ok=True)
    print(f"Ready: {CSV_PATH} ({CSV_PATH.stat().st_size:,} bytes)")
    sqlite_path = DATA_DIR / "geo.sqlite"
    sqlite_path.unlink(missing_ok=True)
    print("Removed old geo.sqlite so the server will re-import on next start.")


if __name__ == "__main__":
    token = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get("IP2LOCATION_TOKEN", "")).strip()
    if not token:
        raise SystemExit(
            "Missing token. Sign up free at https://lite.ip2location.com/\n"
            "Then run: python3 server/download_db.py YOUR_TOKEN"
        )
    download(token)
