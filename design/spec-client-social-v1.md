# Spec — client: accounts, cat picker, cloud save, plaza, visits, gifts

You are extending a small web game, "俺家的猫厕所 Cat's Toilet", in the repo
`/home/sentimentalk/codes/cats-toilet`. It is a static, no-build app: plain
HTML/CSS/JS, no npm, no framework, no bundler — keep it that way. UI text is
Simplified Chinese; code comments are English.

## Read first
- `index.html`, `css/style.css`, `js/game.js` — the room screen (the whole
  game so far). Note the look: cream cards, dashed borders, the two local
  fonts, rounded buttons. Everything you add must look like it belongs.
- `js/cats.js` — the cat catalogue (`window.CATS`). A cat id is
  `${breed}-${coat}`; its art is `assets/cats/<id>/<pose>.png` (poses: sit,
  squat, sleep, happy, eat, loaf, groom, yawn, walk-1..4). Only cats with
  `ready: true` have art (today: `domestic-orange`).
- `server/API.md` — the server contract. The server is finished and tested;
  start it with `node server/server.mjs --port <port> --db <file>`. It serves
  the game and the API from one origin.

## How the room talks to you (already in `js/game.js`)
- `window.__game`: `state` (the save object), `save()`, `addPoints(n)`,
  `renderPanel()`, `say(text)`, `toast(text)`, `squatting`, `SAVE_KEY`,
  `CAT_ID`, and the layout tables `BOX_ART`, `POS`, `ITEMS`, `WALLS`, `LEVELS`.
- Window events it fires: `game:save` (detail = state, after every save),
  `game:squat` (detail `{squatting}`), `game:open-plaza` (cancelable; call
  `preventDefault()` to take it over, otherwise the room shows a
  "coming soon" toast).
- The save lives in `localStorage[__game.SAVE_KEY]`. The room reads it once at
  load, including `state.cat = { id, name, gender }` (null = not chosen, the
  room then shows the default cat). To apply a different save or cat, write
  localStorage and `location.reload()`.
- Cheats in the URL (`?coins=`, `?level=`, `?items=all`, `?reset=1`) are
  handled by the room; leave them working.

## Files
You may create: `js/api.js`, `js/account.js`, `js/plaza.js`, `css/social.css`.
You may edit: `index.html` (only to add `<link>`/`<script>` tags and container
markup for your screens), `sw.js` (add your files to the precache list and
bump `VERSION`). You may make small ADDITIVE changes to `js/game.js` only if
you truly need another hook (a new exported function or event) — list each
one in your report. Do not restyle or restructure the room. Do not touch
`server/`, `tools/`, `design/`, `assets/` (art is someone else's job) or
`js/cats.js`. No git commands that change state.

## What to build

### 1. Entry flow (`js/api.js`, `js/account.js`)
- On load, find out whether the API is there (`GET /api/me` with the stored
  token). Three cases:
  - No API (network error or a non-JSON 404 — e.g. the static preview server
    on port 8765, or `file://`): GUEST mode. No login. If no cat is chosen,
    show the cat picker; the choice is saved locally only. The plaza tab
    explains that the plaza needs the online version. No console errors.
  - API there, no valid token: a full-screen login / register screen
    (username + password, one form with a toggle between "登录" and "注册";
    show the server's error codes as friendly Chinese messages). It cannot be
    skipped.
  - API there, valid token: go on.
- After login/registration: if the server has a save, it wins — write it to
  localStorage and reload (once; do not loop). If it has none, upload the
  local one. Then if no cat is chosen, show the cat picker.
- Cat picker (full screen): choose a breed, then one of its coats, type a
  name (1–12 chars), choose 男孩 / 女孩, confirm. Breeds and coats come from
  `window.CATS`; coats that are not `ready` are shown but disabled and marked
  "即将开放". Show the big sitting portrait of the selected ready cat. On
  confirm: store `state.cat = {id, name, gender}` via the save, `PUT
  /api/profile` when online, reload so the room uses the new cat.
- Cloud save: on `game:save`, debounce ~2 s then `PUT /api/save` with the
  last known rev. On `409 rev_conflict` adopt the server copy (write
  localStorage, reload). Flush pending changes on `visibilitychange` /
  `pagehide`. Never send while a request is in flight; never lose the latest
  state.
- Presence: `POST /api/presence` every 10 s while the page is visible, and
  immediately on `game:squat`.
- Account sheet (reachable from the plaza header): shows the username and cat
  name, a switch "允许别人来串门" (`PUT /api/profile`), and "退出登录"
  (logout, clear token, reload).
- Gifts received: on the `gift` event, and for anything in `/api/inbox` at
  startup, add the points (`__game.addPoints`), save, toast
  "xxx 送了你 N 积分", then ack.

### 2. Plaza (`js/plaza.js`)
A full-screen screen opened by the room's 广场 tab (`game:open-plaza`) with a
"回家" button back to the room. The room keeps running underneath.
- Background `assets/plaza-bg.jpg` (4:3 painting). Use the same approach as
  the room: the painting is at least as wide as the screen, pinned to the
  bottom, scrolls sideways on narrow screens, and everything is positioned in
  % of it.
- The painting has a blank wooden sign and a blank cream screen. Draw on them
  with HTML, positioned in % of the painting:
  - sign face: left 34%, top 20.5%, width 31.5%, height 19% → the game title
    "俺家的猫厕所" with "Cat's Toilet" under it, in the KuaiLe / Fredoka
    fonts, dark brown, looking carved/painted on wood.
  - screen face: left 72%, top 24%, width 20.8%, height 17% → live numbers:
    "正在蹲坑 N 只" (big) and "在线 M 只", from `GET /api/plaza` and the SSE
    `plaza` event.
- Cats: the paved floor spans y 56%–95% of the painting, nearly full width.
  Lay the online cats out on it in staggered rows (further back = smaller and
  drawn first). Each cat sits in the same style of litter tray
  (`assets/box-0.png`; vary the tray colour with a CSS hue filter). A
  squatting cat shows its `squat` pose inside the tray with a little effort
  wiggle; an idle one shows `sit` beside or in it. Under each: the cat's name
  and the username. Mark your own cat. If a cat's art is not available, fall
  back to `domestic-orange`.
- Refresh from `GET /api/plaza` on open, on each `plaza` event and every 5 s
  while open.
- Tap another cat → a card: cat name, username, litter box level, and
  "去串门" (disabled with a reason if they turned visits off). It sends
  `POST /api/visits`, shows "等待对方同意…" and resolves on `visit_answer`
  (or a 60 s timeout).
- Being asked: on `visit_request` show a dialog over whatever screen is open:
  "xxx 想来参观你的厕所" with 同意 / 拒绝 → `POST /api/visits/:id/answer`.
- Visiting: after an accept, show their room read-only (`GET
  /api/rooms/:id`): the room background, their wall colour (same tint
  technique as the room: see `#wall-tint` in `css/style.css`), their litter
  box for their level, their owned items at the same positions the room uses
  (`__game.ITEMS[].pos`, `__game.POS`, `__game.BOX_ART`), their cat sitting.
  Nothing is interactive except "送礼物" (10 / 50 / 100 points: refuse if you
  have fewer; take them from your own points with `__game.addPoints(-n)` and
  save; `POST /api/gifts`) and "回广场".
- Test helper, URL only, not in the UI: `?bots=8` fills the plaza with that
  many fake local cats (clearly named 测试猫1…, some squatting, not
  visitable) so the layout can be checked without real users. They must NOT
  be added to the numbers on the screen.

## Evidence of done — verify in a real browser, do not report on inspection
Chrome is `/usr/bin/google-chrome`; Node 24 has global `fetch` and
`WebSocket`, so you can drive headless Chrome over the DevTools protocol with
no installs. A working example of that technique is
`/tmp/claude-1000/-home-sentimentalk-codes-cats-toilet/01467c37-b451-413e-a308-1f5904bd7010/scratchpad/shot.mjs`
(read it, do not modify it). Use remote-debugging port 9555 and a fresh
`--user-data-dir`; run your own server on port 8790 with a temp DB; put all
scripts, DBs and screenshots under
`/tmp/claude-1000/-home-sentimentalk-codes-cats-toilet/01467c37-b451-413e-a308-1f5904bd7010/scratchpad/social/`.
Do not use ports 8765, 8787 or 9333. Kill your Chrome and server when done.

Prove each of these with actual output and a screenshot you have looked at,
at phone size (390×844) and for 1, 4 and 7 also at 1440×900:
1. Fresh browser on the 8790 server → login screen → register → cat picker →
   pick → the room loads with that cat's name saved; `GET /api/me` shows the
   profile cat and, after scooping a poop, a save with rev ≥ 1.
2. Clear localStorage, log in again → the cloud save comes back (same points,
   level, cat) without the picker.
3. Wrong password, duplicate username, too-short password each show a
   readable Chinese message.
4. Two users in two separate browser contexts: both on the plaza see both
   cats; A starts squatting in the room → B's plaza shows A squatting and the
   screen's number goes up within a few seconds.
5. A asks to visit B → B gets the dialog → accepts → A sees B's room with B's
   wall colour, box level and items (give B some with the URL cheats first)
   → A gifts 50 → A's points drop by 50, B's rise by 50 and B sees the toast.
   A refused request and a turned-off-visits case each show the right message.
6. Guest mode: the static server `http://127.0.0.1:8765/index.html` (already
   running, no API) → no login screen, picker appears for a fresh save, room
   works, plaza tab explains itself, zero console errors and no failed
   requests other than the single API probe. Same for
   `file:///home/sentimentalk/codes/cats-toilet/index.html`.
7. `?bots=8` plaza layout: nothing overlaps unreadably, labels legible, cats
   stay on the paving.
Zero console errors in all of the above. `node --test server/` must still
pass (you did not change the server, this is a regression check).

## Report
Files created/changed; every hook added to `js/game.js`; for 1–7 what you ran
and the result with the key output lines and screenshot paths; anything that
does not work, is untested, or that you would not ship — stated plainly.
