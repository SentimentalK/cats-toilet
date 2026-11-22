#!/usr/bin/env python3
"""Build the Chinese UI font subset (WOFF2).

Scans index.html, js/*.js and css/*.css for every character the interface can
show, adds printable ASCII, common CJK punctuation and the first 3000 entries
of tools/common-hanzi.txt (现代汉语常用字表), then runs the same subsetter as
the pyftsubset CLI (fontTools.subset.main) with

    --flavor=woff2 --layout-features='*' --no-hinting

Characters missing from the source font (e.g. emoji) are reported and left to
the system fallback; they do not fail the build. The output must stay under
400 KB, otherwise the script exits non-zero so an accidental regression (e.g.
a glob that swallowed a data file) is caught.

Run from anywhere:  python3 tools/subset-font.py
"""
from __future__ import annotations

import glob
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "fonts", "ZCOOLKuaiLe-Regular.ttf")
OUT = os.path.join(ROOT, "assets", "fonts", "ZCOOLKuaiLe-Regular.woff2")
COMMON_FILE = os.path.join(ROOT, "tools", "common-hanzi.txt")
COMMON_LIMIT = 3000
LIMIT = 400 * 1024

# ASCII the UI uses for numbers, units and the Latin wordmark, plus the CJK
# punctuation that appears in sentences. Kept explicit so a font update cannot
# silently drop a glyph the UI types at runtime.
ALWAYS = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "，。！？、；：…—～·「」『』【】（）《》〈〉“”‘’"
    + "％＋－×÷°±→←↑↓★☆♥♡"
    + "０１２３４５６７８９"
)


def common_chars() -> str:
    rows: list[str] = []
    with open(COMMON_FILE, encoding="utf-8") as fh:
        for line in fh:
            if line.lstrip().startswith("#"):
                continue
            rows.extend(c for c in line if not c.isspace())
    return "".join(rows[:COMMON_LIMIT])


def gather_text(common: str) -> str:
    files = [os.path.join(ROOT, "index.html")]
    files += sorted(glob.glob(os.path.join(ROOT, "js", "*.js")))
    files += sorted(glob.glob(os.path.join(ROOT, "css", "*.css")))
    if not files:
        sys.exit("no input files found")
    chars: set[str] = set(ALWAYS) | set(common)
    for path in files:
        with open(path, encoding="utf-8") as fh:
            chars.update(fh.read())
    # Control characters never render; keep the arg clean.
    chars = {c for c in chars if c.isprintable() or c == " "}
    return "".join(sorted(chars))


def missing(text: str) -> list[str]:
    cmap = TTFont(SRC).getBestCmap()
    return sorted({c for c in text if ord(c) not in cmap})


def main() -> int:
    if not os.path.isfile(SRC):
        sys.exit(f"missing source font: {SRC}")
    common = common_chars()
    text = gather_text(common)
    args = [
        SRC,
        f"--text={text}",
        f"--output-file={OUT}",
        "--flavor=woff2",
        "--layout-features=*",
        "--no-hinting",
    ]
    print(f"subsetting {os.path.relpath(SRC, ROOT)} ({os.path.getsize(SRC):,} B) "
          f"with {len(text)} characters ({len(set(common))} common)")
    subset.main(args)

    size = os.path.getsize(OUT)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {size:,} B ({size / 1024:.1f} KB)")
    gaps = missing(text)
    if gaps:
        print(f"not in source font, system fallback will draw them: {''.join(gaps)}")
    out_cmap = TTFont(OUT).getBestCmap()
    common_gaps = [c for c in dict.fromkeys(common) if ord(c) not in out_cmap]
    if common_gaps:
        print(f"FAIL: common characters missing from {os.path.basename(OUT)}: {''.join(common_gaps)}",
              file=sys.stderr)
        return 1
    if size >= LIMIT:
        print(f"FAIL: {size:,} B is not below the {LIMIT:,} B budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
