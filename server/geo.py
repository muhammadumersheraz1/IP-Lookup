import csv
import ipaddress
import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
SQLITE_PATH = DATA_DIR / "geo.sqlite"
FULL_CSV = DATA_DIR / "IP2LOCATION-LITE-DB3.CSV"
SAMPLE_CSV = DATA_DIR / "sample-db3.csv"

PRIVATE_NETS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)


def ip_to_int(ip: str) -> int:
    packed = ipaddress.ip_address(ip)
    if packed.version != 4:
        raise ValueError("Only IPv4 is supported in this LITE build")
    return int(packed)


def is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not any(addr in net for net in PRIVATE_NETS)


def clean(value: str) -> str:
    value = (value or "").strip()
    if value in {"", "-", "This is not a city"}:
        return ""
    return value


def csv_path() -> Path:
    if FULL_CSV.exists() and FULL_CSV.stat().st_size > 1024 * 1024:
        return FULL_CSV
    return SAMPLE_CSV


def using_sample() -> bool:
    return csv_path() == SAMPLE_CSV


def import_csv(conn: sqlite3.Connection, source: Path) -> None:
    print(f"Importing {source.name} into SQLite…")
    conn.execute("DROP TABLE IF EXISTS ranges")
    conn.execute(
        """
        CREATE TABLE ranges (
            ip_from INTEGER NOT NULL,
            ip_to INTEGER NOT NULL,
            country_code TEXT,
            country TEXT,
            region TEXT,
            city TEXT
        )
        """
    )
    rows = []
    with source.open(newline="", encoding="utf-8", errors="replace") as handle:
        for parts in csv.reader(handle):
            if len(parts) < 6 or not parts[0].isdigit():
                continue
            rows.append(
                (
                    int(parts[0]),
                    int(parts[1]),
                    parts[2],
                    parts[3],
                    parts[4],
                    parts[5],
                )
            )
            if len(rows) >= 20_000:
                conn.executemany("INSERT INTO ranges VALUES (?, ?, ?, ?, ?, ?)", rows)
                rows.clear()
    if rows:
        conn.executemany("INSERT INTO ranges VALUES (?, ?, ?, ?, ?, ?)", rows)
    conn.execute("CREATE INDEX idx_ranges_ip_to ON ranges(ip_to)")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES ('source', ?)",
        (source.name,),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta(key, value) VALUES ('mtime', ?)",
        (str(source.stat().st_mtime),),
    )
    conn.commit()
    count = conn.execute("SELECT COUNT(*) FROM ranges").fetchone()[0]
    print(f"Imported {count:,} IP ranges")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    source = csv_path()
    if not source.exists():
        raise FileNotFoundError(f"Missing IP2Location file: {source}")

    need_import = False
    try:
        meta = {
            row["key"]: row["value"]
            for row in conn.execute("SELECT key, value FROM meta")
        }
        if meta.get("source") != source.name or meta.get("mtime") != str(source.stat().st_mtime):
            need_import = True
        conn.execute("SELECT 1 FROM ranges LIMIT 1").fetchone()
    except sqlite3.Error:
        need_import = True

    if need_import:
        import_csv(conn, source)
    return conn


def lookup(conn: sqlite3.Connection, ip: str) -> dict:
    number = ip_to_int(ip)
    row = conn.execute(
        """
        SELECT ip_from, ip_to, country_code, country, region, city
        FROM ranges
        WHERE ip_to >= ?
        ORDER BY ip_to ASC
        LIMIT 1
        """,
        (number,),
    ).fetchone()

    if not row or number < row["ip_from"]:
        return {
            "ip": ip,
            "city": "",
            "region": "",
            "country": "",
            "country_code": "",
            "found": False,
            "source": "IP2Location LITE",
            "sample": using_sample(),
        }

    city = clean(row["city"])
    return {
        "ip": ip,
        "city": city,
        "region": clean(row["region"]),
        "country": clean(row["country"]),
        "country_code": clean(row["country_code"]),
        "found": bool(city),
        "source": "IP2Location LITE",
        "sample": using_sample(),
    }
