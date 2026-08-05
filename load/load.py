# load/load.py
"""Full-replace loader: reads source CSVs and writes them into Supabase
polygons_* tables, then recalculates berth geometry stats.

Talks to Supabase's PostgREST REST API directly over `urllib.request`
(stdlib only, plus `python-dotenv`) rather than via the `supabase` python
package. On this machine the `supabase` package's import chain
(supabase -> supabase_auth -> jwt -> cryptography) fails at import time
because the local Windows Application Control (WDAC) policy blocks the
`_cffi_backend` native DLL that `cryptography` depends on. That block is
system-wide (reproduced in a fresh venv outside this repo, and via a plain
`import _cffi_backend`), not path- or project-specific, so there is no
virtualenv workaround. Talking to PostgREST directly sidesteps the
dependency entirely and needs nothing beyond the standard library.

Usage:
    python load.py
"""
import csv
import glob
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

from geo import coords_to_wkt

load_dotenv()


def _safe_wkt(coord_str: str) -> str:
    """Wrap coords_to_wkt, auto-closing unclosed rings first.

    A small number of source rows (~1-2% of ports/berths, <0.01% of
    terminals) have a first point that doesn't match the last point.
    PostGIS rejects those as "non-closed rings". Since it's a handful of
    rows out of tens of thousands and the intent (closed polygon ring) is
    unambiguous, close the ring by repeating the first point rather than
    dropping the row.
    """
    points = json.loads(coord_str)
    if points and points[0] != points[-1]:
        points = points + [points[0]]
    return coords_to_wkt(json.dumps(points))


def _find_repo_data_root(start: Path) -> Path:
    """Walk upward from `start` looking for a directory that has sibling
    `Data/` and `References/` directories.

    A plain checkout has the repo directly under the folder containing
    `Data/` and `References/` (two levels above `load.py`). A git worktree
    checkout (e.g. `<repo>/.worktrees/<branch>/...`) adds extra nesting, so
    we search a wider range of ancestors instead of hard-coding a fixed
    number of `parents[]` hops.
    """
    for candidate in start.parents:
        if (candidate / "Data").is_dir() and (candidate / "References").is_dir():
            return candidate
    raise FileNotFoundError(
        f"Could not locate a 'Data' + 'References' sibling pair above {start}"
    )


_REPO_ROOT = _find_repo_data_root(Path(__file__).resolve())
DATA_DIR = _REPO_ROOT / "Data"
REFERENCES_DIR = _REPO_ROOT / "References"


class SupabaseREST:
    """Minimal PostgREST client: insert / delete-all / rpc, over urllib."""

    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, body=None, extra_headers=None):
        headers = dict(self.headers)
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {err_body}") from None

    def delete_all(self, table: str, id_col: str = "id"):
        self._request("DELETE", f"/{table}?{id_col}=neq.-1", extra_headers={"Prefer": "return=minimal"})

    def insert(self, table: str, rows: list):
        self._request("POST", f"/{table}", body=rows, extra_headers={"Prefer": "return=minimal"})

    def rpc(self, fn_name: str, params: dict = None):
        return self._request("POST", f"/rpc/{fn_name}", body=params or {})


def latest_file(pattern: str) -> Path:
    matches = sorted(glob.glob(str(DATA_DIR / pattern)))
    if not matches:
        raise FileNotFoundError(f"No file matching {pattern} in {DATA_DIR}")
    return Path(matches[-1])


def _load_table(client, table, id_col, path, row_fn, batch_size=500):
    rows = []
    errors = []
    with open(path, encoding="utf-8-sig") as f:
        for i, row in enumerate(csv.DictReader(f), start=2):
            try:
                rows.append(row_fn(row))
            except Exception as e:
                errors.append((i, row.get("id") or row.get("Port ID"), str(e)))
    client.delete_all(table, id_col)
    for i in range(0, len(rows), batch_size):
        client.insert(table, rows[i:i + batch_size])
    print(f"{table}: loaded {len(rows)} rows")
    if errors:
        print(f"  WARNING: {len(errors)} rows failed to parse and were skipped: {errors[:10]}")
    return len(rows), errors


def load_ports_master(client):
    path = REFERENCES_DIR / "polygons_ml_ports.csv"

    def row_fn(row):
        return {
            # "Port ID" is a string like "Marcura-4285"; the numeric suffix
            # is the actual port_code used to join against ports/terminals/
            # berths (verified: "Marcura-4285" <-> portCode 4285 for the
            # same physical port in port_polygons_*.csv).
            "port_id": int(row["Port ID"].rsplit("-", 1)[-1]),
            "port": row["Port"],
            "country": row["Country"],
            "iso2_code": row["iso2Code"],
            "iso3_code": row["iso3Code"],
            "coastal_region": row["Coastal Region"],
            "clarksons_region": row["Clarksons Region"],
            "region": row["Region"],
            "lat": float(row["portLat"]) if row["portLat"] else None,
            "lon": float(row["portLon"]) if row["portLon"] else None,
        }

    return _load_table(client, "polygons_ports_master", "port_id", path, row_fn)


def load_ports(client):
    path = latest_file("port_polygons_*.csv")

    def row_fn(row):
        return {
            "id": int(row["id"]),
            "port_code": int(row["portCode"]),
            "country": row["country"],
            "port": row["port"],
            "unlocode": row["unlocode"],
            "parent_port_code": int(row["parentPortCode"]) if row["parentPortCode"] else None,
            "parent_port": row["parentPort"],
            "polygon_name": row["polygonName"],
            "geom": _safe_wkt(row["coordinates"]),
            "area_sqm": float(row["area"]) if row["area"] else None,
        }

    return _load_table(client, "polygons_ports", "id", path, row_fn)


def load_terminals(client):
    path = latest_file("terminal_polygons_*.csv")

    def row_fn(row):
        return {
            "id": int(row["id"]),
            "port_code": int(row["portCode"]),
            "terminal_code": int(row["terminalCode"]) if row["terminalCode"] else None,
            "terminal_type": row["terminalType"],
            "polygon_name": row["polygonName"],
            "geom": _safe_wkt(row["coordinates"]),
            "area_sqm": float(row["area"]) if row["area"] else None,
        }

    return _load_table(client, "polygons_terminals", "id", path, row_fn)


def load_berths(client):
    path = latest_file("berth_polygons_*.csv")

    def row_fn(row):
        return {
            "id": int(row["id"]),
            "port_code": int(row["portCode"]),
            "terminal_code": int(row["terminalCode"]) if row["terminalCode"] else None,
            "berth_code": int(row["berthCode"]) if row["berthCode"] else None,
            "berth_type": row["berthType"],
            "polygon_name": row["polygonName"],
            "geom": _safe_wkt(row["coordinates"]),
            "area_sqm": float(row["area"]) if row["area"] else None,
        }

    return _load_table(client, "polygons_berths", "id", path, row_fn)


def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = SupabaseREST(url, key)

    load_ports_master(client)
    load_ports(client)
    load_terminals(client)
    load_berths(client)

    client.rpc("polygons_calc_berth_edges")
    print("Recalculated berth quay_length_m/perimeter_m/sides_count")

    try:
        client.rpc("exec_sql", {"sql": "refresh materialized view public.polygons_agg_country;"})
        client.rpc("exec_sql", {"sql": "refresh materialized view public.polygons_agg_region;"})
        print("Refreshed matviews polygons_agg_country / polygons_agg_region")
    except RuntimeError:
        print("No exec_sql RPC available - refresh matviews manually via Supabase SQL editor or MCP execute_sql:")
        print("  refresh materialized view public.polygons_agg_country;")
        print("  refresh materialized view public.polygons_agg_region;")


if __name__ == "__main__":
    main()
