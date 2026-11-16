# Spec — game server v1 (accounts, cloud save, plaza presence, visits, gifts)

You are building the back end for a small web game, "俺家的猫厕所 Cat's Toilet",
in the repo `/home/sentimentalk/codes/cats-toilet`. The client already exists
as a static, no-build web app (`index.html`, `css/`, `js/`, `assets/`,
`manifest.webmanifest`, `sw.js`); read `js/game.js` once to see what a save
looks like (`fresh()` near the top: points, level, poops, owned, walls, wall…).
Other people are editing the client right now.

## Boundaries

- Create files ONLY under `server/`. Do not edit, move or delete anything
  outside it. No git commands that change state (no add / commit / stash).
- Zero npm dependencies: no `package.json`, no `node_modules`. Node 24 is
  installed; use built-ins only (`node:http`, `node:sqlite` — verified to work
  here without a flag —, `node:crypto`, `node:test`).
- Do not use or stop port 8765 (a preview server lives there). Use 8787 for
  manual runs and an ephemeral port in tests.
- Temp files go under
  `/tmp/claude-1000/-home-sentimentalk-codes-cats-toilet/01467c37-b451-413e-a308-1f5904bd7010/scratchpad/server/`.

## What to build

`node server/server.mjs` starts one process that serves BOTH the static game
and a JSON API. Options: `--port` / `PORT` (default 8787), `--db` / `DB_PATH`
(default `server/data/cats.db`; add `server/.gitignore` ignoring `data/`).

### Static files
Serve the game from the repo root: `/` → `index.html`, plus `css/`, `js/`,
`assets/`, `manifest.webmanifest`, `sw.js`, with correct content types
(`.webmanifest` → `application/manifest+json`, fonts, png, jpg). Never serve
`server/`, `design/`, `tools/`, `assets/raw/`, dotfiles, or anything reached
by path traversal — those return 404.

### API (all JSON; errors are `{ "error": { "code", "message" } }`, never a stack trace)
Auth is a bearer token: `Authorization: Bearer <token>`.

| Method & path | Body → result |
| --- | --- |
| POST `/api/register` | `{username, password}` → 201 `{token, user:{id, username}}`. Username 3–16 chars of letters, digits, `_` or CJK, unique ignoring case; password 6–72 chars. 400 `bad_username` / `bad_password`, 409 `username_taken`. |
| POST `/api/login` | `{username, password}` → 200 `{token, user}`; 401 `bad_credentials`. After 10 failures for the same username within 10 minutes → 429 `too_many_attempts`. |
| POST `/api/logout` | → 204, token revoked. |
| GET `/api/me` | → `{user, profile:{cat, allowVisits}, save:{data, rev} or null}` |
| PUT `/api/profile` | `{cat?:{breed, coat, name, gender}, allowVisits?}`. breed/coat: 1–32 chars of `a-z0-9-`; name 1–12 chars; gender `boy` or `girl`. → 200 profile. 400 `bad_profile`. |
| PUT `/api/save` | `{data, baseRev}`. `data` is an object, ≤ 64 KB as JSON. If `baseRev` is not the stored rev (0 when none) → 409 `rev_conflict` with the stored `save`. Else store, → 200 `{rev}`. |
| POST `/api/presence` | `{squatting: bool}` → 204. Clients call it every ~10 s and on change. A user is online if heard from in the last 30 s. |
| GET `/api/plaza` | → `{online, squatting, cats:[{userId, username, cat, squatting, squatSeconds, level, allowVisits, me}]}`: online users only, squatting ones first, at most 40. `level` comes from that user's stored save (`data.level`, 0 if none). |
| GET `/api/events?token=…` | Server-Sent Events (EventSource cannot set headers, hence the query token). Events: `plaza` `{online, squatting}` whenever either count changes (coalesce bursts to at most one per second); `visit_request` `{id, from:{userId, username, cat}}`; `visit_answer` `{id, accepted, by:{userId, username}}`; `gift` `{id, from:{userId, username}, kind, amount}`. Send a comment line every 20 s as keep-alive. |
| POST `/api/visits` | `{to: userId}` → 201 `{id}`. 404 unknown user, 403 `visits_off` if they disabled visits, 409 `offline` if not online, 409 `already_pending`. A request expires after 60 s. |
| POST `/api/visits/:id/answer` | `{accept: bool}`, only by the invited user → 200. Pushes `visit_answer` to the requester. |
| GET `/api/rooms/:userId` | → `{userId, username, cat, level, owned, wall}` taken from their save (missing fields → defaults). Allowed for yourself, or when you hold a visit they accepted within the last 30 minutes; otherwise 403 `no_visit`. |
| POST `/api/gifts` | `{to, kind:"points", amount: 1–500}`, needs the same accepted visit → 201. Stored in the recipient's inbox and pushed as a `gift` event if they are online. |
| GET `/api/inbox` | → `{items:[{id, kind, amount, from:{userId, username}, createdAt}]}` not yet acknowledged. |
| POST `/api/inbox/ack` | `{ids:[…]}` → 204. |

Known and accepted for this prototype — do NOT try to solve: the save blob is
client-authoritative (the server does not validate points), and a gift does
not debit the sender server-side. State both plainly in `server/API.md`.

### Requirements
- Passwords: `crypto.scrypt` with a random per-user salt, compared with
  `timingSafeEqual`. Tokens: 32 random bytes, stored hashed or raw (your call,
  say which). Request bodies capped at 100 KB; malformed JSON → 400 `bad_json`.
- Every route except register / login / static requires a valid token → 401
  `unauthorized` otherwise.
- Presence and SSE connections live in memory; everything else in SQLite.
- Clean shutdown on SIGINT/SIGTERM (close SSE streams and the database).
- Write `server/API.md`: the final API exactly as implemented (a table like
  the one above, plus the SSE event shapes and the two accepted limitations),
  short enough to read in two minutes. The client will be written from it.

## Evidence of done

1. `node --test server/` passes. Tests (using `node:test`, each starting the
   server on an ephemeral port with a temp DB) must cover at least: register
   validation + duplicate (case-insensitive) + login + bad password + rate
   limit; 401 without a token; save round-trip and `rev_conflict`; profile
   validation; presence → plaza counts and ordering; the full social flow
   (A requests a visit to B → B receives `visit_request` over SSE → B accepts
   → A receives `visit_answer` → A can GET B's room, a third user C gets 403
   → A sends a gift → B receives the `gift` event and sees it in the inbox →
   ack empties it); static serving of `/` and one asset, and 404 for
   `/server/server.mjs`, `/design/…`, `/assets/raw/…` and a `..` traversal.
2. A real run: start the server on 8787, and with `curl` register a user,
   log in, PUT then GET a save, and fetch `/` — paste the commands and
   responses. Stop the server afterwards.

A non-zero exit from the tests means the task is not done; fix and re-run.
In your final report give: the files created, the full `node --test` summary
line, the curl transcript, and anything you left unfinished or are unsure of.
