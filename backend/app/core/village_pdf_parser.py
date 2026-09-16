"""
Parses a user-supplied PDF of village/population data into rows the
test-data pipeline can ingest. Deliberately tolerant of format variation
(pipe/comma/tab/wide-space-separated rows, or labeled "Village: X" blocks)
since this reads whatever a real person typed into a PDF, not a fixed
export format — but every line that can't be confidently parsed is
reported back with a reason rather than silently dropped or guessed at.

Expected row shape (the sample template follows this exactly):
    Village Name | Population | Latitude | Longitude | Block
Latitude/Longitude/Block are optional — omitted ones are inferred by the
caller (placed within the chosen district's real geography).
"""

import io
import re
from typing import Optional

from pypdf import PdfReader

NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")
LABEL_RE = re.compile(r"^(village|name)\s*[:\-]\s*(.+)$", re.I)
FIELD_RE = re.compile(r"^(population|pop|latitude|lat|longitude|lon|lng|block)\s*[:\-]\s*(.+)$", re.I)

MAX_ROWS = 300


def extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages_text = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages_text)


def _try_float(s: str) -> Optional[float]:
    s = s.strip()
    try:
        return float(s)
    except ValueError:
        return None


def _split_row(line: str) -> list[str]:
    for sep in ("|", "\t"):
        if sep in line:
            return [p.strip() for p in line.split(sep) if p.strip() != ""]
    if "," in line:
        return [p.strip() for p in line.split(",") if p.strip() != ""]
    parts = re.split(r"\s{2,}", line.strip())
    if len(parts) >= 2:
        return [p.strip() for p in parts if p.strip() != ""]
    return [line.strip()]


def _parse_delimited_row(line: str) -> tuple[Optional[dict], Optional[str]]:
    tokens = _split_row(line)
    if len(tokens) < 2:
        return None, "could not split into fields (need at least name + population)"

    name = tokens[0]
    if NUM_RE.match(name):
        return None, "first field doesn't look like a name"

    rest = tokens[1:]
    population = None
    used = set()
    for i, t in enumerate(rest):
        v = _try_float(t)
        if v is not None and float(v).is_integer() and 1 <= v <= 200_000:
            population = int(v)
            used.add(i)
            break
    if population is None:
        return None, "no plausible population number (1-200000) found"

    remaining_floats = [(i, _try_float(t)) for i, t in enumerate(rest) if i not in used]
    remaining_floats = [(i, v) for i, v in remaining_floats if v is not None]

    lat = lon = None
    if len(remaining_floats) >= 2:
        (i1, v1), (i2, v2) = remaining_floats[0], remaining_floats[1]
        if -90 <= v1 <= 90 and -180 <= v2 <= 180:
            lat, lon = v1, v2
            used.update({i1, i2})

    block = None
    for i, t in enumerate(rest):
        if i in used:
            continue
        if t and not NUM_RE.match(t):
            block = t
            break

    return {"name": name, "population": population, "lat": lat, "lon": lon, "block": block, "raw_line": line}, None


def _parse_labeled_blocks(lines: list[str]) -> tuple[list[dict], list[dict]]:
    parsed, skipped = [], []
    current: dict = {}
    current_raw: list[str] = []

    def flush():
        if not current:
            return
        raw = " / ".join(current_raw)
        name = current.get("name")
        pop_raw = current.get("population") or current.get("pop")
        population = None
        if pop_raw is not None:
            v = _try_float(pop_raw)
            if v is not None and float(v).is_integer() and 1 <= v <= 200_000:
                population = int(v)
        if not name:
            skipped.append({"raw_line": raw, "reason": "block has no Village/Name label"})
        elif population is None:
            skipped.append({"raw_line": raw, "reason": "block has no valid Population (1-200000)"})
        else:
            lat = _try_float(current["latitude"]) if "latitude" in current else (_try_float(current["lat"]) if "lat" in current else None)
            lon = _try_float(current["longitude"]) if "longitude" in current else (_try_float(current.get("lon", current.get("lng", ""))) if ("lon" in current or "lng" in current) else None)
            parsed.append({
                "name": name, "population": population,
                "lat": lat if lat is not None and -90 <= lat <= 90 else None,
                "lon": lon if lon is not None and -180 <= lon <= 180 else None,
                "block": current.get("block"),
                "raw_line": raw,
            })

    for line in lines:
        line = line.strip()
        if not line:
            continue
        m = LABEL_RE.match(line)
        if m:
            flush()
            current = {"name": m.group(2).strip()}
            current_raw = [line]
            continue
        m = FIELD_RE.match(line)
        if m and current:
            key = m.group(1).lower()
            current[key] = m.group(2).strip()
            current_raw.append(line)
    flush()
    return parsed, skipped


def parse_pdf_text(text: str, max_rows: int = MAX_ROWS) -> tuple[list[dict], list[dict]]:
    """Returns (parsed_rows, skipped_rows). Each parsed row has
    name/population/lat/lon/block/raw_line (lat/lon/block may be None)."""
    lines = [l.strip() for l in text.splitlines()]

    if any(LABEL_RE.match(l) for l in lines):
        parsed, skipped = _parse_labeled_blocks(lines)
        if parsed:
            return parsed[:max_rows], skipped

    parsed, skipped = [], []
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        if len(parsed) >= max_rows:
            skipped.append({"raw_line": line, "reason": f"max row limit ({max_rows}) reached"})
            continue
        row, reason = _parse_delimited_row(line)
        if row:
            parsed.append(row)
        else:
            skipped.append({"raw_line": line, "reason": reason})
    return parsed, skipped
