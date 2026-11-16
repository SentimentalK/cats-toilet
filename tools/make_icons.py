#!/usr/bin/env python3
"""Build the PWA / home-screen icons from the sitting-cat sprite.

    python3 -I tools/make_icons.py

Reads assets/cats/domestic-orange/sit.png and writes assets/icons/:
  icon-192.png, icon-512.png    purpose "any"      (cat fills ~84% of the height)
  icon-maskable-512.png         purpose "maskable" (cat inside the central
                                 safe circle, radius 40% of the icon)
  apple-touch-icon.png          180x180, opaque (iOS adds its own rounding)

All icons are opaque: the cat centred on a flat #bcd8ea background.
Pillow only, no numpy.
"""
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "cats", "domestic-orange", "sit.png")
OUT = os.path.join(ROOT, "assets", "icons")
BG = (0xBC, 0xD8, 0xEA, 255)


def load_cat():
    cat = Image.open(SRC).convert("RGBA")
    # trim fully/near-transparent margins so sizing is based on the visible art
    box = cat.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    return cat.crop(box) if box else cat


def render(cat, size, fit):
    """Centre `cat` on a size x size background.

    fit="any":      height ~84% of the icon, width at most 84%.
    fit="maskable": the art's bounding box fits inside the safe circle
                    (diameter 80% of the icon), with a little extra margin.
    """
    w, h = cat.size
    if fit == "maskable":
        diag = math.hypot(w, h)
        scale = (size * 0.80 * 0.96) / diag
    else:
        scale = min(size * 0.84 / h, size * 0.84 / w)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    sprite = cat.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.alpha_composite(sprite, ((size - nw) // 2, (size - nh) // 2))
    return canvas.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    cat = load_cat()
    jobs = [
        ("icon-192.png", 192, "any"),
        ("icon-512.png", 512, "any"),
        ("icon-maskable-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "any"),
    ]
    for name, size, fit in jobs:
        path = os.path.join(OUT, name)
        render(cat, size, fit).save(path, optimize=True)
        print("wrote", os.path.relpath(path, ROOT), f"{size}x{size}", fit)


if __name__ == "__main__":
    main()
