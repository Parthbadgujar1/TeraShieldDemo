"""
Minimal single-purpose PDF writer — plain left-aligned text lines, one
built-in Helvetica font, auto-paginated. No third-party dependency: this
generates the "sample template" PDF for the test-data upload feature, and
a hand-rolled writer keeps that from needing a new pip install just to
produce a few pages of text.

Not a general PDF library — no images, no tables, no custom fonts.
"""

PAGE_WIDTH = 612  # US Letter, points
PAGE_HEIGHT = 792
LEFT_MARGIN = 50
TOP_MARGIN = 742
LINE_HEIGHT = 15
FONT_SIZE = 10.5
LINES_PER_PAGE = int((TOP_MARGIN - 40) / LINE_HEIGHT)


# Round-tripping em-dashes/smart-quotes through PDF standard-font
# encoding tables (WinAnsi vs. what different PDF readers actually assume
# for a font with no embedded glyph data) is unreliable in practice, and
# this writer's whole point is a plain, robustly-printable document —
# normalize to plain ASCII rather than chase reader-specific encoding bugs.
_ASCII_NORMALIZE = {
    "—": " - ", "–": "-", "‘": "'", "’": "'",
    "“": '"', "”": '"', "…": "...", "≠": "!=",
    "→": "->", "×": "x",
}


def _escape(text: str) -> str:
    for src, dst in _ASCII_NORMALIZE.items():
        text = text.replace(src, dst)
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _page_content_stream(lines: list[str]) -> bytes:
    parts = [f"BT /F1 {FONT_SIZE} Tf {LINE_HEIGHT} TL {LEFT_MARGIN} {TOP_MARGIN} Td"]
    for i, line in enumerate(lines):
        prefix = "" if i == 0 else "T*\n"
        parts.append(f"{prefix}({_escape(line)}) Tj")
    parts.append("ET")
    # cp1252, not latin-1: the font resource declares /Encoding
    # /WinAnsiEncoding (== cp1252), which is where punctuation like an
    # em-dash actually lives (byte 0x97) — plain latin-1 doesn't have it
    # at all and would silently replace it with "?".
    stream = "\n".join(parts).encode("cp1252", errors="replace")
    return stream


def write_text_pdf(lines: list[str]) -> bytes:
    """Build a minimal multi-page PDF of left-aligned monospace-ish text."""
    pages = [lines[i:i + LINES_PER_PAGE] for i in range(0, len(lines), LINES_PER_PAGE)] or [[]]

    objects: list[bytes] = []
    # obj 1: catalog, obj 2: pages, obj 3: font. Page objects + content
    # streams follow, interleaved: (4,5), (6,7), ...
    page_obj_ids = [4 + 2 * i for i in range(len(pages))]
    kids = " ".join(f"{pid} 0 R" for pid in page_obj_ids)

    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode())
    # Explicit WinAnsiEncoding: without it, readers may assume the font's
    # built-in StandardEncoding, where byte 0x27 (ASCII apostrophe) maps to
    # a different glyph than plain "'" — garbling any apostrophe in the text.
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")

    # Build page + content-stream object pairs in order.
    body_objects: list[bytes] = []
    for idx, page_lines in enumerate(pages):
        content = _page_content_stream(page_lines)
        content_obj_id = page_obj_ids[idx] + 1
        page_dict = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_obj_id} 0 R >>"
        ).encode()
        body_objects.append(page_dict)
        body_objects.append(
            f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"\nendstream"
        )

    all_objects = objects + body_objects  # index 0 -> obj 1, ...

    out = bytearray()
    out += b"%PDF-1.4\n"
    offsets = [0]  # offsets[0] unused (obj 0 is free list head)
    for i, obj_body in enumerate(all_objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj_body + b"\nendobj\n"

    xref_offset = len(out)
    n = len(all_objects) + 1
    out += f"xref\n0 {n}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF"
    ).encode()

    return bytes(out)
