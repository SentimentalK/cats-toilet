# Asset brief — cat scamper cycle v3 (replaces the walk: hind legs must move)

Thanks for the honest report on walk v2: the near hind paw never came forward.
Change of approach — draw a bouncy little RUN (gallop / scamper) instead of a
walk. In a gallop both hind legs move together, which is easier to draw
clearly and is exactly what the game needs: the back half of the cat must
visibly move.

Same job and hard rules as before: real image generation only, save only
under `assets/raw/`, no text / UI, do not overwrite existing files, flat
chroma-green background with wide gaps, no shadows, no green on the cat.

## `assets/raw/cat-run-sheet.png` — square, 2×2 grid, ONE generation

All four frames in a single image so the cat stays identical (your first walk
sheet, `assets/raw/cat-walk-sheet.png`, got this right — same cat, same
size, same strict side view facing LEFT, same face, same tail held up). Pass
`assets/raw/cat-walk-sheet.png` and `assets/raw/cat-sheet.png` as references.

The four frames are the four phases of a cartoon cat gallop. Read in order:
top-left → top-right → bottom-left → bottom-right.

1. Top-left — STRETCHED: both front legs reach far forward (to the left),
   both hind legs kick far backward (to the right). The body is one long
   horizontal line. A wide gap of empty space under the belly.
2. Top-right — FRONT LANDING: both front paws are on the ground under the
   chest; both hind legs are still trailing behind, off the ground.
3. Bottom-left — TUCKED: the opposite of frame 1. The back is arched upward
   like a hill; both HIND paws have swung far FORWARD under the belly and are
   planted on the ground right next to (even overlapping) the front paws. All
   four paws are bunched together under the middle of the body. No gap under
   the belly — the legs fill it.
4. Bottom-right — PUSH-OFF: both hind paws on the ground under the hips,
   hind legs bent and pushing; both front legs lifted off the ground and
   starting to reach forward.

Keep the head, the face and the tail the same in all four frames; the cat is
the same size in each.

## Check before you report

Frame 1 and frame 3 must have clearly opposite silhouettes: long and
stretched versus short and bunched up with the hind paws under the belly.
If the hind legs sit in about the same place in all four frames it is a miss;
regenerate (up to 4 attempts). Report the pixel size and, for each frame, one
line saying where the hind paws actually are.
