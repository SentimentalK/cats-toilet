# Asset brief — new cats, batch 1: british-blue, ragdoll-seal, siamese-seal

You are generating painted bitmap art for a 2D web game called "Cat's Toilet".
The game already has ONE cat, an orange tabby, with a complete set of poses.
Your job: redraw that exact pose set for 3 other cats, so the game can swap
one cat for another without anything else changing. Think "the same drawings,
a different cat".

## Hard rules
- Use a real image-generation tool. Do NOT draw with code. If you have no
  image generation in this session, stop and report that as a failure.
- Create files ONLY under `assets/raw/cats/` (make the folders). Touch nothing
  else. No text, letters, logos or UI in any image.
- Background of every image: ONE flat uniform chroma green, no gradient, no
  floor, no cast shadows, no glow. Cats must not touch each other or the
  image border; leave a wide green gap between them.
- NO GREEN anywhere on a cat — and that includes the EYES. Never give a cat
  green eyes: green is cut out as background and would leave holes. Use the
  eye colour given below.

## The pose set to copy — open these four files first
Pass them to your tool as reference images for every generation.

- `assets/raw/cat-sheet.png` — 2×2: sitting (top-left), [ignore the
  top-right pose, it was replaced], sleeping curled (bottom-left), happy wave
  (bottom-right).
- `assets/raw/cat-squat-v2.png` — the litter-box squat: low hunched sit seen
  from the three-quarter front, eyes squeezed shut, blush, tail out behind.
- `assets/raw/cat-sheet-2.png` — 2×2: eating crouch, loaf, grooming a paw,
  big yawn.
- `assets/raw/cat-run-sheet.png` — 2×2 gallop, strict side view facing left:
  stretched, front paws landing, tucked with hind paws under the belly,
  pushing off.

Same style (soft hand-painted anime look, thin warm-brown outlines), same
chibi proportions (big head, chubby body), same camera angle, same position
and size of each pose inside its grid cell, same expressions. Only the cat
changes: coat, markings, eye colour and the breed's features.

## For EACH cat below, make three square 2×2 sheets
Save them as `assets/raw/cats/<id>/sheet-a.png`, `sheet-b.png`, `run.png`.

- `sheet-a.png` — top-left: sitting (as in cat-sheet.png). Top-right: the
  litter-box squat (as in cat-squat-v2.png). Bottom-left: sleeping curled.
  Bottom-right: happy wave.
- `sheet-b.png` — top-left: eating crouch. Top-right: loaf. Bottom-left:
  grooming. Bottom-right: yawn. (As in cat-sheet-2.png. No bowl, no food.)
- `run.png` — the four gallop phases in the same order as cat-run-sheet.png.
  The hind legs must clearly change between frames: far back in the
  stretched frame, forward under the belly in the tucked frame.

The same individual cat must be recognisable across its three sheets: same
markings in the same places, same eye colour. Generate sheet-a first, then
pass it as an extra reference for sheet-b and run.

## The cats
- `british-blue` — British Shorthair, solid blue-grey plush short coat all over (no white), very round face with chubby cheeks, small rounded ears set wide apart, big round copper-orange eyes, stocky body, thick tail.
- `ragdoll-seal` — Ragdoll, long fluffy cream-white coat; seal-brown ears, seal-brown mask around the eyes with a white inverted-V blaze down the nose, seal-brown fluffy tail and a pale brown saddle on the back; white muzzle, chest, belly and paws; fluffy neck ruff; big round bright-blue eyes.
- `siamese-seal` — Siamese, short sleek cream-beige body with dark seal-brown points: face mask, ears, lower legs and paws, and tail; larger pointed ears, a slightly slimmer body than the orange cat but still chubby-cute; bright-blue eyes.

## Done means
All 9 files exist. Open each saved file and check: four separate cats on
flat green, the right poses in the right cells, the right coat, no green on
the cat (check the eyes), nothing cropped, no text. Regenerate what misses,
up to 3 attempts per sheet. Final report, per cat and per sheet: pixel size,
and any way it falls short (wrong pose, markings that changed between sheets,
hind legs that do not move in the run).
