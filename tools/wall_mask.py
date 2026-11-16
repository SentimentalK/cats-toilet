#!/usr/bin/env python3
"""Build the wall mask used to recolour the room wall.

  wall_mask.py <room-bg.jpg> <out.png>

White where the painted wall is, transparent elsewhere (window, furniture,
decals, baseboard, floor). The game lays a flat colour over the background
through this mask with a "color" blend, so the wall keeps its painted texture
and shading and only changes hue. Pillow only.
"""
import sys
from PIL import Image, ImageFilter

# The wall in the source art is a pale blue: these HSV bounds (0-255 scale)
# take the wall and leave the brighter, more saturated sky in the window.
# Its palest patches are nearly grey, where hue is noise, so those count as
# wall on brightness alone (GREY_S / GREY_V); clouds are brighter than that.
H_RANGE, S_RANGE, V_RANGE = (85, 165), (0, 64), (140, 236)
GREY_S, GREY_V = 9, (185, 236)
FLOOR_FROM = 0.70          # nothing below this share of the height is wall


def main(src, dst):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    hsv = im.convert('HSV').load()
    mask = Image.new('L', (w, h), 0)
    mp = mask.load()
    for y in range(int(h * FLOOR_FROM)):
        for x in range(w):
            hh, ss, vv = hsv[x, y]
            blue = H_RANGE[0] <= hh <= H_RANGE[1] and S_RANGE[0] <= ss <= S_RANGE[1] and V_RANGE[0] <= vv <= V_RANGE[1]
            grey = ss <= GREY_S and GREY_V[0] <= vv <= GREY_V[1]
            if blue or grey:
                mp[x, y] = 255
    # close pinholes left by paint texture, drop stray specks, soften the edge
    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(3))
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    mask = mask.resize((w // 2, h // 2), Image.LANCZOS)
    out = Image.new('RGBA', mask.size, (255, 255, 255, 0))
    out.putalpha(mask)
    out.save(dst, optimize=True)
    covered = sum(mask.histogram()[128:]) / (mask.width * mask.height)
    print(f'{dst}: {out.size[0]}x{out.size[1]}, wall covers {covered:.0%} of the image')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
