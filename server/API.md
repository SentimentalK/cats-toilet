# Cat's Toilet server API (v1)

`node server/server.mjs [--port 8787] [--db server/data/cats.db]` (or `PORT`, `DB_PATH`).
One process serves the static game at `/` and this JSON API under `/api`. Node 24, no dependencies.

**Conventions**
- Request and response bodies are JSON. A body must be an object, at most 100 KB (`413 body_too_large`). Bad JSON gives `400 bad_json`.
- Every error looks like `{ "error": { "code": "…", "message": "…" } }`, never a stack trace. An unknown route gives `404 not_found`, a wrong method `405 method_not_allowed`, and a server bug `500 internal`.
- Auth: send `Authorization: Bearer <token>`. Every route except register and login needs it, otherwise `401 unauthorized`.
- Tokens are 32 random bytes in base64url. The server stores only their SHA-256, and they don't expire: only logout revokes one. Passwords are hashed with scrypt and a random 16-byte salt per user.
- User ids are positive integers. Times are milliseconds since the epoch.
- Request fields not listed below are ignored.

| Method & path | Body → result | Errors |
| --- | --- | --- |
| POST `/api/register` | `{username, password}` → **201** `{token, user:{id, username}}` | 400 `bad_username` (3–16 chars: A–Z a–z 0–9 `_` or CJK: Han/kana/Hangul), 400 `bad_password` (6–72 chars), 409 `username_taken` (case-insensitive), 429 `too_many_registrations` (20 new accounts per client address per hour) |
| POST `/api/login` | `{username, password}` (username is case-insensitive) → **200** `{token, user}` | 401 `bad_credentials`; 429 `too_many_attempts` once a username has 10 failures in the last 10 min (even if the password is right; a success clears the count) |
| POST `/api/logout` | — → **204**; revokes this token and closes its event streams | |
| GET `/api/me` | → `{user:{id, username}, profile:{cat, allowVisits}, save:{data, rev} \| null}`; `cat` is `null` until set, `allowVisits` defaults to `true` | |
| PUT `/api/profile` | `{cat?:{breed, coat, name, gender}, allowVisits?}` → **200** `{cat, allowVisits}`. A `cat` you send replaces the whole cat. | 400 `bad_profile`: breed/coat 1–32 of `a-z0-9-`; name 1–12 chars after trimming; gender `boy`\|`girl`; allowVisits boolean |
| PUT `/api/save` | `{data, baseRev}` → **200** `{rev}` (the new rev, = baseRev+1) | 400 `bad_save` (data not an object, or baseRev not an integer ≥ 0); 413 `save_too_large` (data > 64 KB as JSON); **409 `rev_conflict`** if baseRev ≠ stored rev (0 if no save yet); the 409 body also has `"save": {data, rev}` (or `null`) |
| POST `/api/presence` | `{squatting: bool}` → **204**. Call it every ~10 s and whenever squatting changes. You count as online for 30 s after your last call. | 400 `bad_request` |
| GET `/api/plaza` | → `{online, squatting, cats:[{userId, username, cat, squatting, squatSeconds, level, allowVisits, me}]}`: online users only, at most 40, squatting first (longest squat first), then by userId. `online`/`squatting` count everyone, not just the 40. `level` = the user's `save.data.level` (0 if none). | |
| GET `/api/events?token=…` | Server-Sent Events (see below). The token goes in the query because EventSource can't set headers; a Bearer header also works. | 401 `unauthorized` |
| POST `/api/visits` | `{to: userId}` → **201** `{id}`; pushes `visit_request` to them. Expires after 60 s. | 404 `user_not_found`, 400 `self_visit`, 403 `visits_off`, 409 `offline`, 409 `already_pending` (you already have an unexpired pending request to them) |
| POST `/api/visits/:id/answer` | `{accept: bool}`, invited user only → **200** `{id, accepted}`; pushes `visit_answer` to the requester | 400 `bad_request`, 404 `visit_not_found`, 403 `not_invited`, 409 `visit_closed` (already answered or expired) |
| GET `/api/rooms/:userId` | → `{userId, username, cat, level, owned, wall}` from their save (defaults: `0`, `{}`, `"sky"`) | 404 `user_not_found`; 403 `no_visit` unless it is you, or they accepted your visit within the last 30 min (one-way: they don't get your room) |
| POST `/api/gifts` | `{to, kind:"points", amount}` (integer 1–500) → **201** `{id}`; stored in their inbox, pushed as `gift` if they have an event stream open | 400 `bad_gift`, 404 `user_not_found`, 403 `no_visit` (same 30-min accepted-visit rule; not to yourself) |
| GET `/api/inbox` | → `{items:[{id, kind, amount, from:{userId, username}, createdAt}]}`: items not yet acked, oldest first (up to 200) | |
| POST `/api/inbox/ack` | `{ids:[…]}` (up to 500) → **204**. Ids that aren't yours or are already acked are ignored. | 400 `bad_request` |

## Server-Sent Events (`/api/events`)

Each message is `event: <name>` plus `data: <json>`. The stream starts with `retry: 3000`, and then one `plaza` snapshot right away. A `: keep-alive` comment comes every 20 s. You can open several streams (one per tab or device), and each gets the events.

| Event | Data |
| --- | --- |
| `plaza` | `{online, squatting}`: sent to every stream when either count changes (also when someone times out). The first change goes out at once; changes in a burst are merged into at most one event per second, carrying the latest counts. |
| `visit_request` | `{id, from:{userId, username, cat}, expiresAt}` |
| `visit_answer` | `{id, accepted, by:{userId, username}}` |
| `gift` | `{id, from:{userId, username}, kind, amount}`. The gift is also in `/api/inbox` until acked, so a client that missed the event still gets it. |

Presence and streams live in memory, so a restart puts everyone offline. Clients should reconnect (EventSource does this by itself) and keep posting presence.

## Accepted limitations (prototype)

1. **The save is client-authoritative.** The server stores whatever `data` the client sends (any object ≤ 64 KB). It does not check points, level or items, so a modified client can give itself anything.
2. **Gifts don't debit the sender.** `POST /api/gifts` creates points for the recipient. The server doesn't subtract them from the sender's save. The client is expected to do that in its own save.

Also: `GET /healthz` answers `200 ok` for probes. No CORS headers (the API is same-origin with the game), no rate limit beyond the login and sign-up limits, no account deletion or password change.
