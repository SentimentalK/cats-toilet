#!/usr/bin/env python3
"""Turn raw generated art into game-ready files. Pillow only.

  cutout.py bg    <in> <out.jpg> [--width 1800]
      Save the background as a JPEG, downscaled if wider than --width.

  cutout.py sheet <in> <out-TL> <out-TR> <out-BL> <out-BR> [--max 768] [--frames]
      Key out the chroma-green background of a 2x2 sprite sheet, split it
      into its four sprites (by where each object's centre falls), trim, and
      save each as a transparent PNG. Use "-" for an output to skip a cell.
      --frames: the four are animation frames, so keep their relative scale
      and pad them to one shared canvas, aligned bottom-centre.

  cutout.py one   <in> <out.png> [--max 768]
      Same keying and trimming for an image holding a single sprite.
"""
import sys
from PIL import Image, ImageChops, ImageFilter

GRID = 160          # resolution of the mask used to find separate objects
MIN_SHARE = 0.0015  # blobs smaller than this share of the sheet are noise


def keyed(im):
    """RGBA copy of `im` with the green background made transparent."""
    if im.mode == 'RGBA':
        lo, hi = im.getchannel('A').getextrema()
        if lo < 16 and hi > 240:          # already has real transparency
            return im.copy()
    r, g, b = im.convert('RGB').split()
    max_rb = ImageChops.lighter(r, b)
    green = ImageChops.subtract(g, max_rb)             # how much greener than anything else
    lo, hi = 28, 96
    alpha = green.point([255 if v <= lo else 0 if v >= hi else round(255 * (hi - v) / (hi - lo)) for v in range(256)])
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    g = ImageChops.darker(g, max_rb)                   # despill: remove green cast on edges
    return Image.merge('RGBA', (r, g, b, alpha))


def blobs(alpha):
    """Connected opaque regions on a coarse grid -> list of sets of (x, y) cells."""
    small = alpha.resize((GRID, GRID), Image.BILINEAR)
    px = small.load()
    solid = [[px[x, y] > 60 for x in range(GRID)] for y in range(GRID)]
    seen = [[False] * GRID for _ in range(GRID)]
    out = []
    for y0 in range(GRID):
        for x0 in range(GRID):
            if not solid[y0][x0] or seen[y0][x0]:
                continue
            cells, stack = set(), [(x0, y0)]
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                cells.add((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < GRID and 0 <= ny < GRID and solid[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if len(cells) >= GRID * GRID * MIN_SHARE:
                out.append(cells)
    return out


def extract(rgba, cells, max_side):
    """Crop the sprite made of `cells`, hiding everything that is not part of it."""
    w, h = rgba.size
    mask = Image.new('L', (GRID, GRID), 0)
    mp = mask.load()
    for x, y in cells:
        mp[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.BILINEAR)
    mask = mask.point(lambda v: 255 if v > 40 else 0)
    alpha = ImageChops.multiply(rgba.getchannel('A'), mask)
    sprite = rgba.copy()
    sprite.putalpha(alpha)
    box = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    sprite = sprite.crop(box)
    if max_side and max(sprite.size) > max_side:
        k = max_side / max(sprite.size)
        sprite = sprite.resize((round(sprite.width * k), round(sprite.height * k)), Image.LANCZOS)
    return sprite


def opt(args, name, default):
    if name in args:
        i = args.index(name)
        value = int(args[i + 1])
        del args[i:i + 2]
        return value
    return default


def main(argv):
    args = list(argv[1:])
    if not args:
        sys.exit(__doc__)
    mode = args.pop(0)

    if mode == 'bg':
        width = opt(args, '--width', 1800)
        src, dst = args
        im = Image.open(src).convert('RGB')
        if im.width > width:
            im = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
        im.save(dst, quality=90, optimize=True, progressive=True)
        print(f'{dst}: {im.size[0]}x{im.size[1]}  aspect {im.size[0] / im.size[1]:.3f}')
        return

    max_side = opt(args, '--max', 768)
    frames = '--frames' in args
    if frames:
        args.remove('--frames')
    src = args.pop(0)
    rgba = keyed(Image.open(src))
    found = blobs(rgba.getchannel('A'))

    if mode == 'one':
        cells = set().union(*found) if found else set()
        sprite = extract(rgba, cells, max_side)
        sprite.save(args[0], optimize=True)
        print(f'{args[0]}: {sprite.size[0]}x{sprite.size[1]} from {len(found)} blob(s)')
        return

    if mode == 'sheet':
        if len(args) != 4:
            sys.exit('sheet needs four outputs: TL TR BL BR')
        groups = [set(), set(), set(), set()]
        for cells in found:
            cx = sum(x for x, _ in cells) / len(cells)
            cy = sum(y for _, y in cells) / len(cells)
            groups[(1 if cx >= GRID / 2 else 0) + (2 if cy >= GRID / 2 else 0)] |= cells
        if frames:
            if not all(groups):
                sys.exit('--frames needs a sprite in every cell')
            sprites = [extract(rgba, cells, None) for cells in groups]
            cw, ch = max(s.width for s in sprites), max(s.height for s in sprites)
            k = min(1, max_side / max(cw, ch))
            for dst, sprite in zip(args, sprites):
                canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
                canvas.paste(sprite, ((cw - sprite.width) // 2, ch - sprite.height))
                if k < 1:
                    canvas = canvas.resize((round(cw * k), round(ch * k)), Image.LANCZOS)
                canvas.save(dst, optimize=True)
                print(f'{dst}: {canvas.size[0]}x{canvas.size[1]}  aspect {canvas.size[0] / canvas.size[1]:.2f}  (frame was {sprite.size[0]}x{sprite.size[1]})')
            return
        for dst, cells, label in zip(args, groups, ('TL', 'TR', 'BL', 'BR')):
            if dst == '-':
                continue
            if not cells:
                print(f'{label}: nothing found, {dst} not written')
                continue
            sprite = extract(rgba, cells, max_side)
            sprite.save(dst, optimize=True)
            print(f'{dst}: {sprite.size[0]}x{sprite.size[1]}  aspect {sprite.size[0] / sprite.size[1]:.2f}')
        return

    sys.exit(__doc__)


if __name__ == '__main__':
    main(sys.argv)
