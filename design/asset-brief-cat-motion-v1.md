# Asset brief — cat motion v1 (follow-up to the room-screen assets)

Same job as before: generate painted bitmaps with your image-generation tool
and save them under `assets/raw/`. Same hard rules: no code-drawn art, only
write inside `assets/raw/`, no text or UI in any image, and do not overwrite
the four files you already made. If image generation is unavailable, stop and
report that as a failure.

The game already uses the cat from `assets/raw/cat-sheet.png`. Open that file
first. Both new images must show THAT cat: same orange tabby colors, same
stripe pattern, same white muzzle, chest and paws, same chubby proportions,
same outline weight and painted texture. If your tool accepts a reference
image, pass `assets/raw/cat-sheet.png` as the reference and say so in the
report.

Background rule for both images, as before: one flat uniform chroma green,
no gradient, no floor, no cast shadows, no glow, no sparkles; objects must not
touch each other or the image border; no green on the cat.

## Image 1 — `assets/raw/cat-walk-sheet.png`: walk cycle, square, 2×2 grid

Four frames of the cat walking, used as a looping animation in this order:
top-left → top-right → bottom-left → bottom-right.

- Strict side view, the cat walking toward the LEFT, head on the left, tail
  on the right. Eyes open, calm happy face. Tail held up in a soft curve, the
  same in all four frames.
- The body, head and tail must be the same size, the same shape and at the
  same height in all four frames. ONLY the four legs change between frames.
- All four paws' lowest point sits on the same imaginary ground line in each
  frame (no jumping, no floating).
- Leg positions, so the loop reads as a walk:
  - Frame 1 (top-left): front leg nearest the viewer reaches forward, hind
    leg nearest the viewer stretched back.
  - Frame 2 (top-right): legs passing under the body, near front paw lifted
    slightly off the ground.
  - Frame 3 (bottom-left): the mirror of frame 1 — near front leg stretched
    back, near hind leg reaching forward.
  - Frame 4 (bottom-right): legs passing under the body again, near hind paw
    lifted slightly off the ground.

## Image 2 — `assets/raw/cat-squat-v2.png`: one cat, square image

Your earlier toilet pose came out as an arched stretch. This time draw the
posture a real cat uses in a litter box:

- Seen from the three-quarter front, the cat sits up on its haunches with all
  four paws planted close together under the body, hind legs tucked and
  spread slightly, rump lowered almost to the ground — a compact, upright,
  rounded "sitting hunched" silhouette, NOT standing on straight legs and NOT
  stretching forward.
- Back rounded, head pulled down a little between the shoulders, ears turned
  slightly back.
- Tail sticking out behind and up at an angle, stiff, tip quivering.
- Face: eyes squeezed shut, small strained mouth, pink blush on the cheeks —
  concentrating hard, comic and cute, not in pain.
- Just the cat: no litter box, no litter, no poop.

## Done means

Both files exist. Open each saved file and check it against this brief;
regenerate what misses, up to 3 attempts per image. For the walk sheet check
specifically that the four frames differ in leg positions and that the body
is about the same size in each. Final report, per file: pixel dimensions,
background type, whether a reference image could be passed to the tool, and
any way the image still falls short.
