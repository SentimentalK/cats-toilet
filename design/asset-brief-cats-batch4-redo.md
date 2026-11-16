# Redo — golden-shaded and silver-shaded (your batch 4 report was right)

Two of your four cats missed, exactly as you reported: `golden-shaded` came
out as an orange tabby (the game already has one — the two are
indistinguishable), and `silver-shaded` is a grey-and-white patched cat whose
run sheet turned solid grey. `silver-tipped` and `golden-tipped` are fine;
leave them alone.

Redo these two cats, all three sheets each, and OVERWRITE the six existing
files (`assets/raw/cats/golden-shaded/{sheet-a,sheet-b,run}.png` and
`assets/raw/cats/silver-shaded/{sheet-a,sheet-b,run}.png`). Everything else in
your original brief still holds (same poses and cells as the orange
references, flat chroma green, no green on the cat including the eyes, no
text, real image generation only).

The one thing to get right this time: these are SHADED coats, not tabbies and
not bicolours. The rule for both: **NO stripes, NO bars, NO rings, NO spots,
NO hard-edged patches anywhere — not on the body, legs, tail or forehead.**
The colour changes only as a soft airbrushed gradient from a darker back to a
pale belly. Say "no stripes, solid shaded coat, smooth gradient" in the
prompt, and do not pass the orange tabby's striped body as the look to copy —
copy its POSES only.

- `golden-shaded` (British Shorthair golden shaded, 金渐层): a rich warm
  golden-honey coat, clearly more golden-brown and less orange than the
  orange tabby. Darkest along the spine, the top of the head and the upper
  tail (a soft dark-brown haze, as if each hair has a dark tip), melting
  smoothly into pale warm cream on the chest, belly, chin and inner legs.
  Dark brown tail tip. Very round face, chubby cheeks, small rounded ears,
  brick-red nose with a thin dark outline, dark eyeliner. Amber-gold eyes.
  Plush and dense like the British Blue in
  `assets/raw/cats/british-blue/sheet-a.png` (pass it as a build reference).
- `silver-shaded` (British Shorthair silver shaded, 银渐层): the same cat as
  the golden-shaded but in silver: a white undercoat with a soft pale-silver
  to mid-grey haze over the spine, top of the head and upper tail, melting
  smoothly into pure white on the cheeks, chest, belly and legs. The whole
  face is pale — no grey cap or mask with an edge. Brick-red nose with a
  thin dark outline, dark eyeliner. Amber-gold eyes.

Generate `golden-shaded/sheet-a.png` first; when it is right, pass it as a
reference for its other two sheets and for the silver-shaded sheets, so the
two cats share one face and build and each cat looks the same on all three
of its sheets (the run sheet must keep the pale belly and the shaded back —
last time it went solid grey).

Check before you report: put each sheet next to `assets/raw/cat-sheet.png`.
If the golden cat could be mistaken for the orange tabby, or you can count
stripes on either cat, it is a miss — regenerate (up to 4 attempts per
sheet). Report per sheet what you got, and plainly say so if a cat still
shows stripes.
