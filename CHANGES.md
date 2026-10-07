# Changes on branch `improvements`

Small fixes for the real use case: two phones sharing lists on the home LAN,
reached from outside over Tailscale/WireGuard. No new dependencies, no schema
changes, no new CSS, no rewrites. Each change is its own commit, so any of them
can be reverted or skipped on its own.

**8 files, +103 / −68 lines.** The database is untouched; existing data works as is.

| # | Commit | Files | What you'd notice |
|---|--------|-------|-------------------|
| 1 | Remove CORS | server.js, package.json, lock | Nothing (closes a hole) |
| 2 | Docker: reproducible install, fast stop | Dockerfile, compose, README | Redeploys stop in <1s instead of 10s |
| 3 | Sync fixes | server.js, app.js | Phones stop showing different lists |
| 4 | Settings modal works | app.js | ⚙ can rename/delete lists |
| 5 | Confirm "Clear Done" | app.js | No accidental wipe in the store |
| 6 | Search on the device | app.js, index.html | Instant search; export/progress no longer affected by search |
| 7 | Export fixes | server.js | Restoring a backup no longer revives deleted lists |

---

## 1. Remove CORS (`0ae7fbc`)

**Why:** The page and the API come from the same server, so cross-origin access
was never needed. `app.use(cors())` meant any website open in a browser on the
home network could call `http://<server-ip>:7821/api/...` in the background and
read or delete the lists. No login is needed for a home LAN app, but there was
also no reason to leave this open.

**What:** Removed `cors` (require, middleware, dependency) and the
`Access-Control-Allow-Origin: *` header on `/api/events`.

## 2. Docker (`4262a00`)

**Why:**
- `npm install` without the lock file can pull different versions on each build.
- Node running as PID 1 ignores SIGTERM, so every `docker stop` or Portainer
  redeploy waited the full 10s timeout and was then force-killed.

**What:**
- Dockerfile build stage copies `package-lock.json` and runs `npm ci --omit=dev`.
- `init: true` added to `docker-compose.yml` and to the README's Portainer
  snippet. Docker then runs a tiny init process that forwards the stop signal.
  Measured: `docker stop` went from ~10s to 0.56s.

## 3. Sync (`1ac6e91`)

**Why:** This is the main user-facing one. Live updates use Server-Sent Events.
When a phone locks, or the VPN tunnel drops, the browser reconnects
automatically, but any events sent in the meantime are gone. Result: she adds
milk, his phone (which was asleep) never shows it until he pulls to refresh.

**What:**
- `public/app.js`: re-fetch the list when the event stream (re)connects and when
  the tab becomes visible again (`visibilitychange`).
- `server.js`: reordering now broadcasts `ITEMS_REORDERED`. The client also now
  listens for `LIST_UPDATED` / `LIST_DELETED`, which the server already sent but
  nobody handled.
- `server.js`: SSE client ids were `Date.now()`. Two phones connecting in the
  same millisecond got the same id, and when one disconnected both were dropped.
  Now a simple counter.
- `public/app.js`: new `refresh()` replaces the repeated
  `loadItems(...); loadLists(false);` pairs. Every action used to reload twice
  (once after the request, once from its own SSE echo). `refresh()` waits 150ms
  and collapses those into one reload.

## 4. Settings modal (`79a1190`)

**Why:** ⚙ opened an empty modal; `listManagerContainer` and the "+ New List"
button in it were never wired up. There was no way to rename or delete a list
from the UI, although the API (`PUT`/`DELETE /api/lists/:id`) already existed.

**What:** One row per list with ✎ (rename, via `prompt()`) and ✕ (delete, via
`confirm()`). Reuses the existing item-row styles. Refuses to delete the last
list. Delete still **archives** (`is_archived = 1`) as the server already did,
so the data stays in the DB. "+ New List" opens the existing Create List dialog.

## 5. Confirm "Clear Done" (`b50dfb9`)

**Why:** It permanently deletes all checked items and sits right next to
"Reset". One mis-tap in the store and the list is gone.

**What:** `confirm("Remove N checked item(s)?")`; does nothing if none are checked.

## 6. Search on the device (`45f958f`)

**Why:** Every keystroke sent a request to the server; responses could arrive
out of order and show results for an older query. Also, because the search
results *replaced* the item list in memory, three things quietly used only the
matching items: the progress bar, "Export → Current List", and "Download JSON".

**What:**
- `renderItems()` filters the already-loaded list; the server is no longer asked.
  (The server's `?search=` parameter is unchanged, just unused by the UI.)
- Progress, export and download now always cover the whole list.
- Drag handles are hidden while a search is active, since reordering a filtered
  view would only save positions for the visible items.
- Bug found on the way: "List is empty" never showed again after the list once
  had items. `renderItems()` overwrote the container's HTML, which destroyed the
  `#emptyState` element. The message is now rendered inline ("No matches" when
  searching) and the dead element is removed from `index.html`.

## 7. Export (`8d058c0`)

**Why:**
- The full backup included archived (deleted) lists, so restoring brought every
  deleted list back.
- Each item exported `category: i.category`, but the column is `category_id`, so
  this was always empty, and import never read it anyway.

**What:** Export only `is_archived = 0` lists; dropped the always-empty
`category` field. Categories aren't used anywhere in the UI, so nothing is lost.

---

## Deliberately not changed

- **Login/HTTPS:** not needed. Access is the LAN plus Tailscale, which already
  authenticates and encrypts.
- **Unused features in the schema** (categories, frequent items, priority,
  notes, actual price): left in place. Removing columns would need a migration.
- **Offline mode** (service worker to show the list when the store has no
  signal): about 30 more lines. Worth adding only if signal in the store is a
  real problem.
- **Input validation:** the API accepts anything (e.g. `quantity: "abc"`). The
  only client is the app's own form, which sends sane values.

## How this was tested

Built the Docker image from this branch and ran it on a fresh volume:

- No `Access-Control-*` headers on API responses.
- SSE stream received `ITEMS_REORDERED`, `LIST_CREATED`, `LIST_DELETED`.
- Export contained no archived list and no `category` field.
- `docker stop` with init: 0.56s.
- In a browser:
  - Search "ban" shows 1 item, with no drag handles; "zzz" shows "No matches";
    clearing the search brings the handles back.
  - ⚙ lists the lists; renaming updates both the modal and the dropdown;
    deleting the last list is refused.
  - "Clear Done": Cancel keeps the items, OK removes them.
  - An item added by "another device" (a direct API call) appears within 0.6s,
    with exactly one reload; the app's own add also triggers exactly one reload.
  - `visibilitychange` triggers a refresh.
