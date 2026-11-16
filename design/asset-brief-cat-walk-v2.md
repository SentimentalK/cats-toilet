# Asset brief — cat walk cycle v2 (fix: the hind legs do not move)

Same job and hard rules as your earlier tasks in this repo: generate painted
bitmaps with your image-generation tool, save only under `assets/raw/`, no
code-drawn art, no text / UI in the image, do not overwrite existing files.
If image generation is unavailable, stop and report that as a failure.

## What is wrong with the current walk

Open `assets/raw/cat-walk-sheet.png` (your earlier walk sheet). The cat, the
style and the side view are right and must stay exactly as they are. But in
all four frames the two HIND legs are drawn in the same position (near hind
leg stretched back, far hind leg under the belly). Only the front legs
change, so in the game the cat's back half slides along without stepping.

## What to make — `assets/raw/cat-walk-sheet-v2.png`, square, 2×2 grid

The same cat, same size, same strict side view walking toward the LEFT, same
flat chroma-green background with wide gaps and no shadows, no green on the
cat. Pass `assets/raw/cat-walk-sheet.png` (and `assets/raw/cat-sheet.png`) as
reference images, as before.

Four frames, played in this order: top-left → top-right → bottom-left →
bottom-right. Head, body and tail identical in all four; all lowest paws on
the same ground line. "Near" = the side of the cat facing the viewer.

- Frame 1 (top-left) — WIDE stride: near FRONT leg reaching far forward
  (toward the left); near HIND leg stretched far back (toward the right),
  paw well behind the rump. The far front leg points back, the far hind leg
  points forward. The four legs make a wide open stance.
- Frame 2 (top-right) — passing: near front leg vertical under the chest;
  near HIND leg vertical under the hips, its paw lifted a little off the
  ground with the knee bent.
- Frame 3 (bottom-left) — OPPOSITE wide stride: near FRONT leg stretched far
  back under the belly; near HIND leg swung far FORWARD under the belly, its
  paw close to the front paws. The far front leg reaches forward, the far
  hind leg stretches back. This must be clearly the opposite of frame 1:
  where frame 1 has the near hind paw far behind the rump, frame 3 has it
  forward under the middle of the body.
- Frame 4 (bottom-right) — passing again: near hind leg vertical under the
  hips and planted on the ground; near front leg vertical with its paw
  lifted and bent.

## Check before you report

Compare the HIND legs across your four frames, not just the front legs. The
near hind paw must be in a visibly different place in frame 1 (far back),
frames 2 and 4 (under the hips) and frame 3 (far forward). If the hind legs
look the same in every frame, it is a miss — regenerate (up to 4 attempts).
If a single 2×2 sheet keeps failing, you may instead generate the frames as
separate images named `assets/raw/cat-walk-v2-1.png` … `-4.png`, as long as
it is recognisably the same cat at the same size in each.

Final report: which file(s) you saved, pixel dimensions, and for each frame a
one-line description of where the near hind paw actually is.
