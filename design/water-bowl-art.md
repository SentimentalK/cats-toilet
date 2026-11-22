# Water bowl art — full and half water

Provenance for `assets/water-bowl-full.png` and `assets/water-bowl-half.png`
(CAT-004-A). Empty water keeps using `assets/bowl-empty.png`; no new empty
sprite was added.

- Generated: 2026-11-22
- Model: Cursor agent `grok-4.7-medium` (Cursor Plus), image tool `GenerateImage`
- Reference images passed to the model: `assets/bowl-empty.png`,
  `assets/bowl-full.png`
- Raw output: `/home/sentimentalk/codes/temp/cat-004/water-bowl-sheet-r3.jpg`
  (1024×1024 JPEG, flat chroma green — the prompt asked for exact RGB 0,255,0, the
  JPEG measures about (42,221,31) at the corners from compression — 2×2 sheet)
- Cutout: `assets/water-bowl-full.png` = top-left cell (water at the inner rim),
  `assets/water-bowl-half.png` = top-right cell (low water below a wide band of
  inner wall). Bottom-left (empty) and bottom-right (second half) cells were
  spare variants and were not used.

## Prompt (verbatim as recorded)

```
A 2x2 sprite sheet on a pure flat chroma-key green background RGB 0,255,0, no text, no numbers, no labels, no shadows, no floor. Four equal-sized copies of the same light-blue plastic pet bowl, three-quarter view, thick rim, cream paw print centered on the front, warm dark-brown outline, warm light from the upper left, generous green gaps between bowls. Top-left bowl: filled with pale aqua water all the way up to the inner rim, bright highlight ring on the water. Top-right bowl: the same bowl with only a small low puddle; the water oval does not touch the rim and is about half the width of the opening, with a thick empty darker-blue inner wall all around it. Bottom-left bowl: completely empty, dark blue interior, no water. Bottom-right bowl: same small low puddle as the top-right. No food, no cat.
```

Earlier single-bowl attempts are kept for the record in
`/home/sentimentalk/codes/temp/cat-004/` (`water-bowl-full-raw.jpg`,
`water-bowl-half-raw-r3.jpg` and their cutouts). Their prompts were the same
style, one sprite per image; they were rejected because their green-key edges
kept a slight green fringe after keying, while the sheet cells keyed cleanly.

## Reproduce

```sh
python3 tools/cutout.py sheet <raw-sheet.jpg> \
  water-bowl-full.png water-bowl-half.png empty.png extra-half.png
```

`cutout.py sheet` keys out the green, splits by object centre, trims, and writes
RGBA PNGs. The two committed files are the verbatim output of that command on
`water-bowl-sheet-r3.jpg` (no resampling, no manual pixel edits).

## Checks

| File | Size | Pixels | Bytes | Corners alpha | Max alpha | Green-fringed edge px |
| --- | --- | --- | --- | --- | --- | --- |
| `assets/water-bowl-full.png` | 448×299 | RGBA 8-bit | 148533 | 0 | 255 | 0 |
| `assets/water-bowl-half.png` | 446×299 | RGBA 8-bit | 139193 | 0 | 255 | 0 |

- Subject width difference: 448 vs 446 px (0.45%), measured on the alpha bounding
  box, which equals the canvas because `cutout.py` trims tight; both are the same
  three-quarter view with the same paw emblem and rim.
- "Green-fringed edge px" counts pixels with 8 < alpha < 240 where G > R+12 and
  G > B+12.

## Preview

`/home/sentimentalk/codes/temp/cat-004/water-preview-final.png` puts
`bowl-empty.png`, `bowl-full.png`, `water-bowl-full.png` and
`water-bowl-half.png` side by side at ~78 px and ~260 px widths on a warm
background.

- Full: pale aqua water fills the opening up to the inner rim, wide bright
  highlight band along the back of the surface.
- Half: water sits clearly lower; a broad band of darker blue inner wall is
  visible above it, highlight is a small arc near the front. Distinguishable at
  78 px, obvious at 260 px.

## Game wiring

`js/game.js` picks the sprite from the simulated water level on every render:

| `state.water` | Sprite |
| --- | --- |
| `<= 0` | `assets/bowl-empty.png` |
| `> 0` and `< 0.5` | `assets/water-bowl-half.png` |
| `>= 0.5` | `assets/water-bowl-full.png` |

The old `#water-bowl` CSS `hue-rotate` filters are removed; the shop card for
`waterPro` shows `assets/water-bowl-full.png`. The images are precached in
`sw.js` (`VERSION = 'v7'`).
