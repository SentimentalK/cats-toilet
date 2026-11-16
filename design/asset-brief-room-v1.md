# Asset brief — room screen v1

You are generating painted bitmap art for a 2D web game called "Cat's Toilet"
(a cozy idle game: a cat squats in its litter box, the player scoops the poop
for points). Your job is ONLY to generate images and save them as files.

## Hard rules

- Use a real image-generation tool/model. Do NOT draw assets with code
  (no SVG, canvas, PIL shapes, CSS). If you have no image-generation
  capability in this session, stop immediately and report that as a failure —
  that answer is useful, a code-drawn substitute is not.
- Only create files under `assets/raw/` in this repo. Do not edit, move or
  delete anything else. Do not run git commands that change state.
- No text, letters, numbers, logos, watermarks or UI elements inside any image.
- Generate at the highest resolution your tool offers.

## Style (must match the references)

Look at these files first — they are the target look, match them closely:

- `design/reference/ref-1-room-level0.jpg`  (room, litter box, cat, scoop)
- `design/reference/ref-2-room-poop.jpg`    (poop with faces, cat, tray)
- `design/reference/ref-5-plaza.jpg`        (cats sitting in low trays)

Style in words: cute Japanese anime / Studio-Ghibli-like hand-painted
illustration, soft gouache + watercolor texture, thin warm-brown outlines,
gentle soft shading, warm daylight from the upper left, pastel palette
(light sky blue, cream, warm wood, sage green). Rounded chubby shapes.
Calm, cozy, wholesome.

## Camera (same for every image)

Slightly elevated front view, camera looking a little downward — the same
angle as the litter box and cat in `ref-1-room-level0.jpg`. Every sprite must
be drawn from this same angle so they can be composited into one scene.

## Sprite sheets — background rule

Images 2, 3 and 4 are sprite sheets that will be cut out automatically:

- Background must be ONE flat, uniform, pure chroma green (#00FF00) with no
  gradient, no texture, no floor, no horizon.
- No cast shadows on the background, no glow, no sparkles, no particles.
- Objects must not touch or overlap each other or the image border; leave a
  wide green gap between them.
- Do not use green anywhere on the objects themselves.
- If your tool can output a true transparent PNG instead, that is even better;
  say which you did.

## Images to produce

### 1. `assets/raw/room-bg.png` — empty room background, landscape 3:2

An empty cozy room seen straight-on (back wall parallel to the picture plane).

- Back wall fills the top ~58% of the image: light sky-blue plaster with a
  subtle hand-painted texture and a few scattered cream paw-print decals.
- A wooden baseboard runs horizontally where wall meets floor.
- Floor fills the bottom ~42%: warm light-brown wooden planks.
- A wooden-framed window is centered horizontally in the upper part of the
  wall, showing blue sky, white clouds and green treetops; a small potted
  plant on the sill.
- The CENTER SQUARE of the image (middle third-to-two-thirds horizontally,
  full height) must contain only wall, window and bare floor: the floor there
  must be completely empty, because game objects are placed on it.
- Decoration goes only in the far left and far right strips: e.g. a wooden
  shelf with trailing plant, books and a wicker basket on the left; a tall
  potted plant and a small framed leaf picture on the right.
- NO cat, NO litter box, NO rug, NO scoop, NO text, NO UI.

### 2. `assets/raw/cat-sheet.png` — one cat, four poses, square image, 2×2 grid

The same chubby orange tabby cat in all four poses: orange fur with darker
orange stripes, white muzzle, white chest and white paws, pink ears and nose,
exactly like the cat in `ref-1-room-level0.jpg`. Identical colors, markings
and proportions in all four poses. Whole body visible in every pose.

- Top-left: sitting upright, facing the viewer, eyes open, gentle smile.
- Top-right: toilet squat — hunched forward with the back arched, tail raised
  straight up, eyes squeezed shut, cheeks blushing, concentrating hard.
  Facing the viewer (three-quarter front). No litter box, no poop in the image.
- Bottom-left: asleep, curled up as a round loaf, eyes closed, content.
- Bottom-right: sitting, eyes closed in a happy smile, one front paw raised
  in a little wave.

### 3. `assets/raw/litterbox-sheet.png` — four litter boxes, square image, 2×2 grid

Four litter boxes of increasing quality, all from the same camera angle, all
filled with clean pale-grey litter, all EMPTY (no cat, no poop):

- Top-left (level 0): the cheapest — a plain, low, open rectangular plastic
  tray in pale blue, slightly worn. Shaped like the trays in
  `ref-5-plaza.jpg`.
- Top-right (level 1): a nicer open tray in cream with a higher rounded rim
  and one brown paw-print mark on the front.
- Bottom-left (level 2): a cream semi-enclosed box with a tall back and side
  wall and a low front entrance, like the one in `ref-1-room-level0.jpg`
  (but with no text on it).
- Bottom-right (level 3): a deluxe hooded litter house in cream and warm
  wood with a rounded roof, an arched front opening and small paw and leaf
  decorations.

### 4. `assets/raw/props-sheet.png` — four props, square image, 2×2 grid

- Top-left: a cute brown swirl poop with a sleepy closed-eye face, like the
  ones in `ref-2-room-poop.jpg`.
- Top-right: a second cute brown swirl poop, slightly smaller, with a
  grumpy little face.
- Bottom-left: a litter scoop with a slotted grey metal head and a light
  wooden handle, lying diagonally, like the one in `ref-1-room-level0.jpg`.
- Bottom-right: a tied-up pale-blue garbage bag with a knot on top, plump
  and soft, standing upright.

## Done means

All four files exist in `assets/raw/`. For each one, open the saved file and
check it against this brief (right content, right poses, flat green
background, nothing cropped, no text). Regenerate anything that misses, up to
3 attempts per image. In your final report list, per file: pixel dimensions,
whether the background is chroma green or true alpha, the tool/model that
generated it, and any way it still falls short of the brief.
