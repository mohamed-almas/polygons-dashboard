import json

def coords_to_wkt(coord_str: str) -> str:
    """Convert a CSV coordinates cell '[[lon, lat], ...]' into a WKT POLYGON string."""
    points = json.loads(coord_str)
    pairs = ", ".join(f"{lon} {lat}" for lon, lat in points)
    return f"POLYGON(({pairs}))"
