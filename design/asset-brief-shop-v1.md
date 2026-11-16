# Asset brief — shop items and extra cat poses v1

Same job and same hard rules as your previous two tasks in this repo:
generate painted bitmaps with your image-generation tool, save them under
`assets/raw/`, no code-drawn art, write nowhere else, no text / letters / UI
in any image, do not overwrite existing files. If image generation is
unavailable, stop and report that as a failure.

Style, camera and background are unchanged — match your own earlier output:

- Style reference: `assets/raw/litterbox-sheet.png` and
  `assets/raw/props-sheet.png` (your earlier sheets) and
  `design/reference/ref-1-room-level0.jpg`. Soft hand-painted look, thin
  warm-brown outlines, cream / warm wood / pale blue palette.
- Camera: slightly elevated front view looking a little downward, the same
  angle as the litter boxes in `assets/raw/litterbox-sheet.png`.
- Background: one flat uniform chroma green, no gradient, no floor, no cast
  shadows, no glow or light rays, no sparkles. Objects must not touch each
  other or the image border — leave a wide green gap.
- IMPORTANT: no green anywhere on the objects (no plants, no leaves, no green
  fabric, no green decorations) — green gets cut out as background.

Each image is a square 2×2 grid of four separate objects.

## Image 1 — `assets/raw/furniture-sheet.png`

- Top-left: a cat tree / scratching tower, about three times as tall as it is
  wide: a square cream base, two posts wrapped in beige sisal rope, a small
  cubby house in the middle, and a flat padded cream platform on the very top
  with a low rim (a cat will be placed sitting on that top platform, so keep
  the top platform clear and clearly visible). One small pom-pom toy hanging
  from the side. No cat.
- Top-right: an empty round cat bed, cream felt with a pale-blue cushion
  inside and one brown paw-print mark on the front, like the bed in
  `design/reference/ref-1-room-level0.jpg` but with NO blanket and NO cat.
  The front rim must be clearly lower than the back rim.
- Bottom-left: a pale-blue ceramic cat food bowl with one white paw print on
  the front, FULL of brown kibble heaped above the rim.
- Bottom-right: the SAME bowl, same size, same angle, same paw print, but
  completely EMPTY and clean.

## Image 2 — `assets/raw/decor-sheet.png`

- Top-left: an oval braided rug lying flat on the floor, seen from the room
  camera angle (so it looks like a wide flattened ellipse), dusty blue with a
  cream border and a ring of small cream paw prints.
- Top-right: a small mushroom-shaped night lamp, cream stem and a rounded
  warm-yellow cap that looks softly lit from inside (but no glow or rays
  drawn outside the lamp itself).
- Bottom-left: a wooden picture frame, seen straight-on (it hangs flat on a
  wall), containing a simple cute portrait of a cream-colored cat face on a
  pale peach background.
- Bottom-right: a cute little air-freshener / deodorizer gadget for a cat
  toilet: a rounded white-and-pale-blue device with a small vent on top and a
  tiny pink heart indicator on the front.

## Image 3 — `assets/raw/cat-sheet-2.png`: the same cat, four more poses

Open `assets/raw/cat-sheet.png` first and pass it as the reference image, as
you did for the walk cycle. It must be THAT cat: same orange tabby colors,
stripes, white muzzle / chest / paws, same proportions, outline and texture.
Whole body visible in every pose.

- Top-left: eating — seen from the three-quarter front, crouched low on all
  fours with the head lowered toward the ground in front of it, eyes closed
  happily, cheeks puffed as if chewing. NO bowl and NO food in the image.
- Top-right: loaf — lying down facing the viewer with all four paws tucked
  under the body like a loaf of bread, eyes open, relaxed little smile, tail
  wrapped along the side.
- Bottom-left: grooming — sitting, one front paw raised to its mouth, tongue
  out licking the paw, eyes closed.
- Bottom-right: big yawn — sitting upright, mouth wide open in a yawn showing
  a pink tongue, eyes squeezed shut.

## Done means

All three files exist. Open each saved file and check it against this brief
(four separate objects, right content, flat green background, nothing
cropped, nothing green on the objects, no text); regenerate what misses, up
to 3 attempts per image. Final report, per file: pixel dimensions, background
type, and any way the image still falls short of the brief.
