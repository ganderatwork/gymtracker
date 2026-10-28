# gymtracker – project spec

A personal workout-logging PWA for one user on an Android phone (Chrome). It runs a fixed 3-day full-body program, shows last time's numbers next to this time's inputs, and flags when to add weight. Data is saved on the phone first and backed up to a Google Sheet.

## How to work in this repo

- **The owner is a beginner JavaScript coder.** Explain every change in plain language: what each new file or function does, and why. Prefer readable code over clever code. Comment the non-obvious parts.
- **Plain HTML, CSS and JavaScript only.** No frameworks, no build step, no npm packages, no bundler. Files must work when served as-is by GitHub Pages.
- **Build in the milestone order below.** Finish one milestone, tell the owner how to test it, and wait for confirmation before starting the next.
- **Ask before adding features** that are not in this spec.
- **The repo is public.** Never commit the Apps Script URL, the secret key or any personal data. Those are entered on the phone in the settings screen.
- **Use relative paths everywhere** (`./app.js`, not `/app.js`). The site is served from a subpath: `https://<user>.github.io/<repo>/`.

## File structure

| File | Purpose |
|---|---|
| `index.html` | App shell and markup |
| `styles.css` | All styling, design tokens as CSS variables |
| `program.js` | The training program as data (the only place to edit exercises) |
| `storage.js` | Saving and reading sessions on the phone |
| `sync.js` | Sending sessions to the Google Sheet and restoring from it |
| `extras.js` | Extra exercises: the library, the "Add exercises" bottom sheet, extra blocks and their history rules |
| `app.js` | Screen logic and rendering |
| `manifest.webmanifest` | PWA name, colors, icons |
| `sw.js` | Service worker for offline use |
| `icons/` | 192×192 and 512×512 PNG icons, plus a maskable version |
| `apps-script/Code.gs` | The Google Apps Script backend (pasted into the Sheet by hand, not run from here) |
| `README.md` | Setup steps: GitHub Pages, Sheet and script, installing on the phone |

## The program (`program.js`)

Each day has 4 blocks. Each block has 2 exercises, done as alternating sets: A1 set 1, A2 set 1, A1 set 2, and so on. When one exercise has more sets than the other, its extra sets come last.

Give every exercise slot a stable `id` (e.g. `A-bench`). History is looked up by this id, so never reuse an id for a different exercise. The same movement on two days gets two ids (e.g. `A-cable-lateral` and `C-cable-lateral`).

`inc` is the weight step in kg used when the app suggests an increase.

The letters A/B/C are internal keys only (used in ids and the data model). The UI never shows "Day A/B/C"; it shows the weekday name (`weekday` in `program.js`, e.g. "Monday") and the subtitle.

### Day A (Monday): heavy press and hinge

| Slot | Exercise | Sets | Reps | inc |
|---|---|---|---|---|
| A1 | Barbell bench press | 3 | 6–8 | 2.5 |
| A2 | Chest-supported row | 3 | 8–10 | 2 |
| B1 | Romanian deadlift | 3 | 6–8 | 2.5 |
| B2 | Lat pulldown (neutral or medium grip) | 3 | 8–12 | 2.5 |
| C1 | Standing barbell press | 2 | 6–10 | 2.5 |
| C2 | Cable lateral raise | 3 | 12–15 | 1.25 |
| D1 | EZ-bar curl | 2 | 10–12 | 2.5 |
| D2 | Overhead cable triceps extension | 2 | 10–12 | 2.5 |

### Day B (Wednesday): moderate reps

| Slot | Exercise | Sets | Reps | inc |
|---|---|---|---|---|
| A1 | Incline DB press (30°) | 3 | 8–12 | 2 |
| A2 | Wide-grip lat pulldown | 3 | 8–12 | 2.5 |
| B1 | Leg press (feet high and wide) | 3 | 10–12 | 5 |
| B2 | Face pull | 3 | 12–15 | 2.5 |
| C1 | Cable fly (mid height) | 3 | 12–15 | 2.5 |
| C2 | DB lateral raise | 3 | 12–20 | 2 |
| D1 | Seated leg curl | 3 | 10–12 | 2.5 |
| D2 | Hammer curl | 2 | 10–12 | 2 |

### Day C (Friday): machines and higher reps

| Slot | Exercise | Sets | Reps | inc |
|---|---|---|---|---|
| A1 | Low-incline Smith press | 3 | 6–10 | 2.5 |
| A2 | Single-arm cable row | 3 | 10–12 | 2.5 |
| B1 | Leg extension | 3 | 12–15 | 2.5 |
| B2 | Reverse pec deck | 3 | 12–20 | 2.5 |
| C1 | Pec deck | 2 | 12–15 | 2.5 |
| C2 | Cable lateral raise | 4 | 12–20 | 1.25 |
| D1 | Incline DB curl | 2 | 10–12 | 2 |
| D2 | Triceps pushdown | 2 | 10–12 | 2.5 |

## Behavior

### Choosing the day

1. On open, the app selects **the next day in the rotation**: after the last finished session's day A comes B, after B comes C, after C comes A.
2. With no finished sessions, it picks by weekday: Monday → A, Wednesday → B, Friday → C. Any other weekday → A.
3. Tapping the header's top line opens a day picker: three rows (Monday / Wednesday / Friday, each with its subtitle). Tapping a row switches to that day and closes the picker.
4. When the user has picked a day other than the suggested one, the top line shows a small amber "MANUAL" tag. No date and no "next in rotation" text.
5. An unfinished session for a day survives switching days and closing the app; the app resumes it.

### "Last time"

"Last time" for an exercise means the sets logged for that exercise id in **the most recent finished session of the same day** (not the calendar week). No history → show "—".

### Workout screen

- **Header (compact, two lines):**
  - Top line: one button reading "Monday – Heavy press & hinge" (weekday bold, subtitle muted), optional MANUAL tag, and a chevron on the right. Tapping it opens/closes the day picker.
  - Second line: a thin progress bar with "logged / total sets" to its right.
  - The day picker only appears below these lines while open.
- **Blocks:**
  - Every block (program and extra) is always open, in order; the page simply scrolls. No collapsing and no auto-open.
  - Each block is a panel on `--bg` with a 1px `--border` border, 16px radius and 10px padding. 20px gap between blocks.
  - Inside: "BLOCK A" label in the accent color, "Alternate" on the right when it holds two exercises, then one card per exercise.
- **Exercise card:**
  - Slot code and name; "sets × rep range" with a "completed / total" counter (e.g. "1/3") on the right, in `--good` when all sets are complete, otherwise `--muted`.
  - Optional ADD WEIGHT badge.
  - Column headers: SET · LAST TIME · KG · REPS.
  - One row per set.
- **Set row:**
  - Set number, replaced by a ✓ in `--text` when the set is complete. The row's inputs then get `opacity: 0.75` but stay editable. (Not green: green means top of range.)
  - Last time as `weight × reps`; append ` ✓` when those reps reached the top of the range.
  - Weight input and reps input. No log button.
- No active-set highlight.

### Inputs and logging

- **Weight input prefill:** the weight logged for the same set number last time. If that set is missing, use last time's first set. If the exercise earned an increase last time, prefill last weight + `inc`. No history → empty. The prefill is a real value, so a set is usually complete as soon as reps are typed.
- **Reps input** starts empty, with placeholder "–".
- Both inputs use `type="text"` with `inputmode="decimal"` (weight) or `inputmode="numeric"` (reps), so Android opens the number keypad. Accept a comma or a dot as the decimal separator.
- **A set is complete** when both fields hold valid numbers: weight ≥ 0, reps a whole number ≥ 1.
- **Save on every input change:**
  - When a set becomes complete, add it to the session's `sets` (`loggedAt` = the first time it became complete).
  - If its values change, update it.
  - When it stops being complete, remove it. Clearing reps is the "undo".
- Typed text is kept in memory while the app is open; only complete sets are saved.
- No log button, no vibration, and no filling empty fields from last time.
- **Skipped sets** stay empty. They are not saved and do not count against the add-weight rule.

### Rep colors

| Reps | Color |
|---|---|
| Below range | Amber `#F5A524` |
| Within range | Normal text (for last-time values: `#C9CFD6`) |
| At or above top | Green `#4ADE80` |

Color is never the only signal: the ✓ and the badge text carry the same meaning.

### ADD WEIGHT badge

Shown on an exercise card when either condition holds:

1. **Earned last time:** every logged set last time reached the top of the range, and at least one set was logged. The text reads "Top reps last time. Now X kg.", where X is the raised prefill weight.
2. **Earned today:** every set logged today reached the top of the range. The text reads "All sets at top today. Go heavier next time." This takes priority if both are true.
3. **Pushed by an extra** (program exercises only): see "Extra sets that push the program" below. The text reads "Top reps as an extra. Now X kg.", and the weight prefill is raised by `inc` exactly like "Earned last time". "Earned today" still wins.

### Extra exercises

After the program's last block, the user can add extra blocks. Each holds one or two exercises, done as alternating sets exactly like program blocks.

- **Exercise library:** `tt.exercises` in localStorage, an array of `{ id, name, sets, lo, hi, inc, sourceProgramIds, createdAt }`.
  - Ids are `x-` plus a slug of the name (`x-cable-crunch`), with `-2`, `-3` if taken. Never reuse or change an id.
  - `sourceProgramIds` lists the program slot ids with the same name (e.g. `A-cable-lateral` and `C-cable-lateral`), or is empty for custom exercises. A new exercise typed with a program exercise's name is linked the same way.
  - Picking a program exercise creates (or reuses) a library entry with its own `x-` id and the program's sets, range and inc (the first day it appears on wins). Program ids and program history are never touched.
  - New exercise defaults: 3 sets, 10–12 reps, inc 2.5. Name required and unique (case-insensitive).
- **UI:**
  - After the last program block: an "EXTRAS" label, the extra blocks, then a dashed "+ Add exercises" button (52px).
  - Extra blocks look and behave like program blocks: always open, letters E, F, … with slots E1/E2, "Alternate" only for pairs. After adding a block (or pairing), the page scrolls to it.
  - "+ Add exercises" opens a bottom sheet (max 80% height, own scroll, `--surface`). Close button, tapping outside, Escape and Android back close it. Contents: search field, "Your exercises" (most recently used first), "From the program" (each name once, skipping names in the library), "+ New exercise" form. Rows are 48px with name and "sets × lo–hi"; max 2 selected; exercises already in today's workout are hidden. Sticky button: "Add 1 exercise" / "Add pair".
  - A single extra block has a "+ Pair with…" button (same sheet, one selection, becomes the second slot).
  - Each extra card has a "Remove" button. If sets are complete, confirm first. It deletes that exercise's sets from today only. An empty block disappears; a pair becomes a single.
  - Header progress includes extra sets.
- **History for extras** ("last time", prefill, badge). Use the first source that gives something:
  1. **Extra history:** this exercise id's sets in the most recent finished session that has them. Custom exercises always use it. Program-linked exercises only if that session finished at most `EXTRA_HISTORY_MAX_DAYS` (30) days ago.
  2. **Program ballpark** (program-linked only): the sets for any id in `sourceProgramIds` in the most recent finished session that has one of them. Show a small muted "PROGRAM" tag next to the rep range.
  3. **Nothing:** "—", no prefill.

  With source 1 or 2, prefill, filling empty fields on log, rep colors and both ADD WEIGHT rules work exactly as for program exercises, using the library entry's lo/hi/inc. The 30-day rule only affects what is displayed; never delete or hide stored data.
- **Extra sets that push the program:** for a program slot:
  - Its "last program session" is the most recent finished session of its day; its working weight is the heaviest set it logged there. No sets there → no push.
  - Take the most recent finished session where a library entry listing this slot in `sourceProgramIds` was logged. It must have finished at or after the slot's last program session.
  - If any of those extra sets has weight ≥ the working weight and reps ≥ the slot's top of range, the slot gets ADD WEIGHT condition 3. Each slot is checked against its own range and weight. After one more program session at the slot, older extras no longer count.
- Extras never affect finishing, the zero-sets rule, rotation or the wake lock.

### Finishing

- A "Finish workout" button sits at the end of the scrolling content. It marks the session finished, saves it, and triggers sync.
- After finishing, the button shows "Saved · synced to Sheet" in green, or "Saved · will sync when online" if the sync failed.
- A session with zero complete sets cannot be finished.

### Keep the screen on

While a session is in progress, hold a screen wake lock (`navigator.wakeLock.request('screen')`). Re-request it when the page becomes visible again. Fail silently if unsupported.

### No rest timer

The owner rests by feel. Do not add a timer.

## Data

### Model

```js
// One workout
{
  id: "2026-10-26T07:12:00.000Z-A",  // unique: start time + day
  day: "A",
  startedAt: "ISO date",
  finishedAt: "ISO date" | null,
  synced: false,
  sets: [
    { exerciseId: "A-bench", setNumber: 1, weight: 62.5, reps: 8, loggedAt: "ISO date" }
  ],
  // Extra blocks in the order added, so added-but-unlogged extras survive a reload.
  // Old sessions without `extras` are treated as having none.
  extras: [{ block: "E", exerciseIds: ["x-cable-crunch", "x-pec-deck"] }]
}
```

Logged extra sets go into the same `sets` array as program sets.

### Storage on the phone (`storage.js`)

- Store all sessions as one JSON array in `localStorage` under the key `tt.sessions`. Store the exercise library under `tt.exercises` and settings under `tt.settings`. The data stays small (about 150 sessions a year), so `localStorage` is enough.
- Save after every change to a set (completed, edited or cleared).
- On first start, call `navigator.storage.persist()` to ask Chrome not to clear the data.
- Wrap all reads and writes in try/catch. Corrupt or missing data must never crash the app; start empty instead and show a warning.

### Sync to Google Sheet (`sync.js` + `apps-script/Code.gs`)

- **Sheet layout:**
  - Tab `sets`, one row per logged set. Columns: `sessionId, date, day, exerciseId, exerciseName, setNumber, weightKg, reps, loggedAt`. Extra sets use the library name in `exerciseName`.
  - Tab `exercises`, the library. Columns: `id, name, sets, lo, hi, inc, sourceProgramIds, createdAt` (`sourceProgramIds` as a comma-separated string).
- **Apps Script:**
  - Deployed as a web app: "Execute as: me", "Who has access: anyone".
  - The script stores the secret key in Script Properties (`SECRET_KEY`), never in the code.
  - It rejects any request whose `key` doesn't match.
- **Requests:**
  - Always `POST` with `Content-Type: text/plain` and a JSON body. This avoids the CORS preflight that Apps Script cannot answer.
  - Body shape: `{ key, action, ... }`.
  - `action: "saveSession"`: replace all rows with that `sessionId` (delete, then append). Retries can then never create duplicates.
  - `action: "saveExercises"`: merge the full library into the `exercises` tab by id (the app's entries win; rows the app doesn't have are kept, so an incomplete phone library can't wipe the Sheet).
  - `action: "list"`: return all set rows and the library (`{ ok, rows, exercises }`), for restoring.
  - `action: "ping"`: return `{ ok: true }` to test the connection.
  - Responses are JSON: `{ ok: true, ... }` or `{ ok: false, error }`.
- **When to sync:** on finish, every finished session with `synced: false` is sent. The same check runs on app start and on the browser's `online` event. On success, set `synced: true`.
  - Any library change sets `exercisesSynced: false` in `tt.settings`. The next sync sends `saveExercises` first, then sessions, and sets it back to `true` on success.
- **Restore from Sheet:** merge the library by id first (local wins), then rebuild sessions from the rows and merge them with local data by `sessionId`. Local data wins for sessions not yet synced.

### Settings screen

Reached from a small gear icon button in the header. Contains:

- **Apps Script URL** and **secret key** inputs, saved to `tt.settings`.
- A **"Test connection"** button (sends `ping`).
- **Sync status:** last successful sync time, number of unsynced sessions, and whether the exercise library is synced.
- **"Restore from Sheet"**, with a confirmation dialog first.
- **"Export backup"**: downloads `{ version: 2, sessions, exercises }` as `training-backup-YYYY-MM-DD.json`.
- **"Import backup"**: loads that file and merges the library by id, then sessions by `sessionId`, with confirmation first. Old backups (a plain sessions array) still work.

## PWA

- **`manifest.webmanifest`:**
  - `name` and `short_name` "gymtracker".
  - `start_url` "./", `scope` "./", `display` "standalone".
  - `background_color` and `theme_color` `#0E1013`.
  - Icons 192 and 512, plus a maskable icon.
- **Service worker (`sw.js`):**
  - Caches the app files on install. Serves them cache-first, so the app opens instantly and works offline.
  - Never caches requests to the Apps Script URL.
  - Holds a `CACHE_VERSION` constant. Bump it on every deploy, so the phone picks up changes.
  - When a new version is ready, show a small "Update available – tap to reload" banner.
- **Linking:** `index.html` links the manifest and sets `<meta name="theme-color" content="#0E1013">`. It registers the service worker with a relative path.

## Design

Dark only. Match the approved mockup.

### Colors (CSS variables in `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0E1013` | Page background, input background |
| `--surface` | `#171A1F` | Cards, day picker rows |
| `--surface-2` | `#13161A` | Header and footer areas |
| `--border` | `#262B33` | Card borders |
| `--border-input` | `#2E343D` | Inputs and outline buttons |
| `--divider` | `#22262D` | Dividers, progress-bar track |
| `--text` | `#EEF0F3` | Primary text |
| `--muted` | `#9AA3AE` | Labels, last-time values |
| `--accent` | `#3DD6F5` | Block labels, selected day in picker, progress |
| `--good` | `#4ADE80` | Top of range, add weight, done |
| `--warn` | `#F5A524` | Below range, manual day choice |

### Typography

- Inter (Google Fonts, weights 400–700), falling back to `system-ui, sans-serif`.
- `font-variant-numeric: tabular-nums` on everything, so digits line up.
- Sizes:
  - Day title (weekday): 20px bold; subtitle next to it 15px.
  - Exercise name: 17px semibold.
  - Inputs: 17px bold.
  - Last-time values: 15px.
  - Labels: 11–13px, uppercase, letter-spacing 0.06–0.08em.
  - Nothing below 11px.

### Layout and touch

- Full-height column: header (not scrolling), then scrolling content.
- Content padding 16px. Cards have 16px corner radius and 12px inner padding.
- Set row grid columns: `22px minmax(0,1fr) 80px 64px`, gap 6px.
- Inputs 44px tall, radius 10px. Header top line at least 44px tall; day picker rows 48px tall.
- Every tap target is at least 44px.
- Respect the phone's safe areas: `viewport-fit=cover` plus `env(safe-area-inset-*)` padding.
- Transitions max 150ms. Nothing decorative.

### Accessibility

- Real `<button>` and `<input>` elements, with `aria-label` on icon-only buttons and on every input. Example label: "Barbell bench press, set 2, weight in kg".
- A completed set's ✓ carries hidden text for screen readers ("Set 2, complete").
- Visible focus outline in the accent color.

## Milestones

Each milestone ends with a short "how to test it" note for the owner.

1. **Static screen.** Write `program.js` and render Day A from it, matching the design. No saving yet. Test by opening `index.html` through VS Code's Live Server (or `python -m http.server`) and on the phone over the local network.
2. **Logging and rules.** Inputs, completing and undoing sets, rep colors, day picker.
3. **Saving and history.** `storage.js`, resume an unfinished session, "Finish workout", last-time values from real history, prefill, ADD WEIGHT badge, rotation logic, wake lock. Add a temporary debug option to fill in fake history, for testing the badge and the colors.
4. **Backup.** Settings screen with export and import.
5. **PWA and deploy.**
   - Write the manifest, icons and service worker.
   - Write the README steps for enabling GitHub Pages: the owner does this from the personal GitHub account, under Settings → Pages → deploy from the `main` branch, root folder.
   - Install the app on the phone and test it in airplane mode.
6. **Google Sheet sync.**
   - Write `Code.gs` and `sync.js`.
   - Write the README steps: create the Sheet, open Extensions → Apps Script, paste the code, set the `SECRET_KEY` script property, deploy as a web app, then paste the URL and key into the app's settings.
   - Test with "Test connection", then finish a session and check the rows in the Sheet.
7. **Restore from Sheet.** Test by clearing the app's site data in Chrome, then restoring.
8. **Extra exercises.** Built in four steps:
   1. Library storage and the bottom sheet (search, multi-select, create).
   2. Extra blocks: alternating order, logging, the three history sources, prefill, colors, badge, remove, pair-with, resume after reload, and the "extra sets that push the program" rule. The debug fake history includes extras older and newer than 30 days, and one that beats the program.
   3. Sync (`exercises` tab, `saveExercises`, `list` with library), backup v2 and restore. Update `Code.gs` and deploy a new version.
   4. This file and the README.

## Out of scope for now

Rest timer, progress charts (the Sheet covers this), editing the program inside the app, swapping exercises mid-workout, notes, bodyweight tracking, multiple users.
