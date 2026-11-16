# Asset brief — plaza background v1

You are generating painted bitmap art for a 2D web game called "Cat's Toilet".
Your job is ONLY to generate one image and save it.

## Hard rules
- Use a real image-generation tool. Do NOT draw with code (no SVG, canvas,
  PIL shapes). If you have no image generation in this session, stop and
  report that as a failure.
- Create only `assets/raw/plaza-bg.png`. Do not touch any other file.
- NO text, letters, numbers, logos or UI anywhere in the image.

## Style
Open these first and match them closely:
- `design/reference/ref-5-plaza.jpg` — THE target look and place (sunny
  playground with a paved circle and a big wooden sign).
- `assets/raw/room-bg.png` — an existing background from this game; match its
  painting style, line weight and colour warmth.

Cute Japanese anime / Ghibli-like hand-painted illustration: soft gouache and
watercolor texture, thin warm-brown outlines, sunny, cheerful, pastel.

## The image — `assets/raw/plaza-bg.png`, landscape 4:3, highest resolution available

A sunny public playground square seen from a slightly elevated front view
(same camera as `ref-5-plaza.jpg`):

- Top ~35%: bright blue sky with fluffy white clouds, round leafy trees along
  the horizon, a wooden fence.
- Centre-top: one LARGE wooden signboard on two posts, like the one in the
  reference — but its face must be completely BLANK plain wood planks (the
  game writes the title on it later). It should be wide: about 40% of the
  image width, and about 18% of the image height.
- To the RIGHT of the sign, clearly separate from it: a big outdoor display
  screen on a wooden post frame — a wide rectangular panel with a plain flat
  cream-white face and a wooden border, completely BLANK (the game shows
  numbers on it later). About 20% of the image width.
- Far left: a small wooden playground tower with a yellow slide and a swing.
- Bottom ~60%: a wide, flat, paved square of warm beige irregular cobble
  stones surrounded by grass and small flowers. The paved area must be large,
  open and completely EMPTY — the game places many cats and litter boxes on
  it. It should span almost the full width of the image.
- NO cats, NO animals, NO litter boxes, NO people, NO text.

## Done means
The file exists. Open it and check: the sign face is blank, the screen face
is blank, the paved area is big and empty, no animals, no text. Regenerate if
it misses, up to 3 attempts. Report: pixel dimensions, and roughly where the
sign face and the screen face sit in the image (as % from left / top, with
width and height), and anything that falls short.
