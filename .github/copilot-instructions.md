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
| `storage.js` | Saving and reading sessions, the library, targets and settings on the phone; backup files |
| `sync.js` | Sending sessions, the library and targets to the Google Sheet and restoring from it |
| `extras.js` | Extra exercises: the library, the "Add exercises" bottom sheet, extra blocks and their history |
| `targets.js` | Per-exercise targets: one-time setup, suggestions (R1–R3), the target line and edit row on cards |
| `notes.js` | Free-text notes per exercise: the note at the bottom of each card and its text box |
| `app.js` | Screen logic and rendering |
| `manifest.webmanifest` | PWA name, colors, icons |
| `sw.js` | Service worker for offline use |
| `icons/` | 192×192 and 512×512 PNG icons, plus a maskable version |
| `apps-script/Code.gs` | The Google Apps Script backend (pasted into the Sheet by hand, not run from here) |
| `README.md` | Setup steps: GitHub Pages, Sheet and script, installing on the phone |

## The program (`program.js`)

Each day has 4 blocks. Each block has 2 exercises, done as alternating sets: A1 set 1, A2 set 1, A1 set 2, and so on. When one exercise has more sets than the other, its extra sets come last.

Give every exercise slot a stable `id` (e.g. `B-bench`). History is looked up by this id, so never reuse an id for a different exercise. The same movement on two days gets two ids (e.g. `A-cable-lateral` and `C-cable-lateral`).

When a slot is removed or moved to another day, it gets a new id. The old id goes into `RETIRED_EXERCISES` in `program.js` (id → name, so old rows still get a name in the Sheet) and is never reused. Retired so far: `A-bench`, `B-incline-db`, `C-smith-incline` (November 2026: Smith press dropped, bench and incline DB swapped days). A one-time update (`runMigrations()` in `app.js`) copied their targets and notes to the new slots.

The app never raises a weight by itself: when the app says to add weight, the user picks the new weight. There are no weight steps anywhere.

The letters A/B/C are internal keys only (used in ids and the data model). The UI never shows "Day A/B/C"; it shows the weekday name (`weekday` in `program.js`, e.g. "Monday") and the subtitle.

### Day A (Monday): heavy press and hinge

| Slot | Exercise | Sets | Reps |
|---|---|---|---|
| A1 | Incline DB press (30°) | 3 | 8–12 |
| A2 | Chest-supported row | 3 | 8–10 |
| B1 | Romanian deadlift | 3 | 6–8 |
| B2 | Lat pulldown (neutral or medium grip) | 3 | 8–12 |
| C1 | Standing barbell press | 3 | 6–10 |
| C2 | EZ-bar curl | 3 | 10–12 |
| D1 | Cable lateral raise | 3 | 12–15 |
| D2 | Overhead cable triceps extension | 3 | 10–12 |

### Day B (Wednesday): moderate reps

| Slot | Exercise | Sets | Reps |
|---|---|---|---|
| A1 | Barbell bench press | 3 | 6–8 |
| A2 | Wide-grip lat pulldown | 3 | 8–12 |
| B1 | Leg press (feet high and wide) | 3 | 10–12 |
| B2 | Face pull | 3 | 12–15 |
| C1 | Cable fly (mid height) | 3 | 12–15 |
| C2 | DB lateral raise | 3 | 12–20 |
| D1 | Seated leg curl | 3 | 10–12 |
| D2 | Hammer curl | 3 | 10–12 |

### Day C (Friday): machines and higher reps

| Slot | Exercise | Sets | Reps |
|---|---|---|---|
| A1 | Incline DB press (30°) | 3 | 8–12 |
| A2 | Single-arm cable row | 3 | 10–12 |
| B1 | Leg extension | 3 | 12–15 |
| B2 | Reverse pec deck | 3 | 12–20 |
| C1 | Pec deck | 3 | 12–15 |
| C2 | Cable lateral raise | 4 | 12–20 |
| D1 | Incline DB curl | 3 | 10–12 |
| D2 | Triceps pushdown | 3 | 10–12 |

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
  - Slot code and name.
  - Right under the name: "sets × rep range" with a "completed / total" counter (e.g. "1/3") on the right, in `--good` when all sets are complete, otherwise `--muted`.
  - Below that: the target line, and a "Next target" suggestion when one is waiting (see "Targets").
  - Optional ADD WEIGHT badge.
  - Column headers: SET · LAST TIME · KG · REPS.
  - One row per set.
  - At the bottom: the note (see "Notes").
- **Set row:**
  - Set number, replaced by a ✓ in `--text` when the set is complete. The row's inputs then get `opacity: 0.75` but stay editable. (Not green: green means top of range.)
  - Last time as `weight × reps`; append ` ✓` when those reps reached the top of the range.
  - Weight input and reps input. No log button.
- No active-set highlight.

### Inputs and logging

- **Weight input prefill**, in this order:
  1. If the ADD WEIGHT badge shows "Top reps last time", leave the weight empty (the user chooses the new, heavier weight). This also applies when there is a target.
  2. Otherwise, with a target (for a program-sourced extra: its program target): the target weight, in every set.
  3. With no target: the weight logged for the same set number last time. If that set is missing, use last time's first set. No history → empty.

  The prefill is a real value, so a set is usually complete as soon as reps are typed.
- **Set 1's weight carries over:** when the user leaves set 1's weight box after changing it, the new weight is copied into the exercise's later sets whose weight is empty or still equals set 1's previous weight (so sets changed by hand keep theirs). Leaving set 1 empty copies nothing. Later weights stay editable.
- **Reps input** starts empty, with placeholder "–".
- Both inputs use `type="text"` with `inputmode="decimal"` (weight) or `inputmode="numeric"` (reps), so Android opens the number keypad. Accept a comma or a dot as the decimal separator.
- **A set is complete** when both fields hold valid numbers: weight ≥ 0, reps a whole number ≥ 1.
- **Save on every input change:**
  - When a set becomes complete, add it to the session's `sets` (`loggedAt` = the first time it became complete).
  - If its values change, update it.
  - When it stops being complete, remove it. Clearing reps is the "undo".
- Typed text is kept in memory while the app is open; only complete sets are saved.
- No log button, no vibration, and no filling empty fields from last time.
- **Skipped sets** stay empty. They are not saved, and an exercise with a skipped set doesn't earn ADD WEIGHT.

### Rep colors

**Reps inputs** compare against the target reps (for a program-sourced extra: its program target):

| Reps | Color |
|---|---|
| Below target | Amber `#F5A524` |
| At target | Normal text |
| Above target | Green `#4ADE80` |

With no target, reps inputs compare against the rep range, like the last-time column.

**Last-time values** always compare against the rep range:

| Reps | Color |
|---|---|
| Below range | Amber `#F5A524` |
| Within range | `#C9CFD6` |
| At or above top | Green `#4ADE80` |

Color is never the only signal: the ✓, the badge text and the target line carry the same meaning.

### ADD WEIGHT badge

It's the user's cue to choose a heavier weight; rule R1 (see "Targets") then turns that weight into the new target. Shown on an exercise card when either condition holds:

Both rules only count once **every** set of the exercise (set 1 to its set count) is logged; a skipped or not-yet-done set means not earned.

1. **Earned last time:** last time, every set was logged and reached the top of the range. The text reads "Top reps last time. Go heavier today." The weight fields start empty.
2. **Earned today:** today, every set is complete and reached the top of the range. The text reads "All sets at top today. Go heavier next time." This takes priority if both are true.

Extra sets never trigger ADD WEIGHT on a program slot.

### Targets (`targets.js`)

A target is what to aim for next time on an exercise: a weight and a rep count. Sets always come from the program (or the extra's library entry); a target stores only weight and reps.

- **Who has one:**
  - Program slots and custom extras each have their own target, under their exercise id.
  - Program-sourced extras (non-empty `sourceProgramIds`) never get their own target. See "Extra exercises".
- **Storage:** `tt.targets` in localStorage, an object keyed by exerciseId → `{ weight, reps, changedAt, pending, dismissedFrom }`. Same try/catch rules as the other keys.
  - `weight`, `reps`, `changedAt` are `null` while there is only a suggestion and no target yet.
  - `pending`: `{ weight, reps, fromSessionId }` (a suggestion waiting for a decision) or `null`.
  - `dismissedFrom`: the sessionId whose suggestion was dismissed, or `null`.
- **One-time initialization** (flag `tt.targetsInitialized`):
  - Runs the first time the app has at least one finished session: on start, after Restore from Sheet, or after Import.
  - Every program slot and custom extra with history gets a target from the last finished session it was logged in:
    - weight = the heaviest logged weight;
    - reps = the average reps of all its logged sets in that session, rounded up;
    - `changedAt` = that session's `finishedAt`.
  - Existing targets are never overwritten. Exercises without history get no target.
  - After initialization, missing targets are only created through suggestions (R3) or manual edits.
- **Target line** (below the "sets × rep range" line, small muted text button):
  - Shows "Target 3 × 11 · 22.5 kg" (sets × reps · weight), or "No target yet".
  - Tapping it turns the line into an edit row: a reps input and a kg input, styled like the set inputs.
  - The edit commits on tap outside or Enter when both values are valid (weight ≥ 0, reps a whole number ≥ 1). If either is empty or invalid, it cancels and keeps the old target. A target can never be removed.
  - Editing a target sets `changedAt` and clears `pending`.
- **Suggestions:** evaluated after every set change, once **all sets of the exercise are complete** in the current session. Only one at a time, by priority:
  - **R1 – New weight:** the first set (set 1) has weight > target weight → suggest that set's weight and reps.
  - **R2 – Rep progression:** every set has weight equal to the target weight and reps ≥ target reps, and target reps < the range top → suggest target weight with target reps + 1.
  - **R3 – No target yet:** suggest the first set's weight and reps.
  - Never suggest on lower weights. Lowering a target is a manual edit.
  - The suggestion is stored in `pending` (replacing an older waiting suggestion), unless `dismissedFrom` equals the current session.
  - When a set is un-completed or changed, re-evaluate. A pending suggestion from the current session is removed if its rule no longer holds. Suggestions from earlier sessions stay until resolved.
- **Showing a suggestion:** from the moment it appears until resolved (also in later sessions), the card shows "Next target: 3 × 11 · 22.5 kg" with three buttons:
  - **Accept:** becomes the target.
  - **Edit:** opens the edit row prefilled with the suggestion.
  - **×:** dismiss. Sets `dismissedFrom` to the suggestion's `fromSessionId` and clears `pending`.
- `pending` and `dismissedFrom` stay on the phone: they are never synced or put in backups.

### Notes (`notes.js`)

A free-text note per exercise, for things that are hard to remember (bench position on the Smith machine, whether the kg include the bar, …). It is permanent per exercise, not per workout.

- **Who has one:** program slots and custom extras each have their own note, under their exercise id (so Monday's and Friday's Cable lateral raise each have one). Program-sourced extras show the program's note read-only (see below).
- **Storage:** `tt.notes` in localStorage, an object keyed by exerciseId → `{ text, changedAt }`. Same try/catch rules as the other keys. A deleted note stays as `{ text: "", changedAt }`, so the deletion also reaches the Sheet.
- **On the card** (at the bottom, under the set rows):
  - With text: the note as muted read-only text (line breaks kept). Tapping it opens the text box.
  - Without text: a small pencil icon with muted "Add note". Tapping it opens the text box.
  - The text box is a multi-line `<textarea>` (max 500 characters). Enter adds a new line; tapping outside saves. Text is trimmed; clearing all of it deletes the note.
- **Program-sourced extras:** show "PROGRAM NOTE" plus the text, read-only, with no pencil. They use the note of the slot their program target comes from. If that slot has no note (or there is no target), they use the first slot in `sourceProgramIds` that has one. No note anywhere → nothing.

### Extra exercises

After the program's last block, the user can add extra blocks. Each holds one or two exercises, done as alternating sets exactly like program blocks.

- **Exercise library:** `tt.exercises` in localStorage, an array of `{ id, name, sets, lo, hi, sourceProgramIds, createdAt }`. Any other field (e.g. the removed `inc`) is dropped on load.
  - Ids are `x-` plus a slug of the name (`x-cable-crunch`), with `-2`, `-3` if taken. Never reuse or change an id.
  - `sourceProgramIds` lists the program slot ids with the same name (e.g. `A-cable-lateral` and `C-cable-lateral`), or is empty for custom exercises. A new exercise typed with a program exercise's name is linked the same way.
  - Picking a program exercise creates (or reuses) a library entry with its own `x-` id and the program's sets and range (the first day it appears on wins). Program ids and program history are never touched.
  - New exercise defaults: 3 sets, 10–12 reps. Name required and unique (case-insensitive).
- **UI:**
  - After the last program block: an "EXTRAS" label, the extra blocks, then a dashed "+ Add exercises" button (52px).
  - Extra blocks look and behave like program blocks: always open, letters E, F, … with slots E1/E2, "Alternate" only for pairs. After adding a block (or pairing), the page scrolls to it.
  - "+ Add exercises" opens a bottom sheet (max 80% height, own scroll, `--surface`). Close button, tapping outside, Escape and Android back close it. Contents: search field, "Your exercises" (most recently used first), "From the program" (each name once, skipping names in the library), "+ New exercise" form. Rows are 48px with name and "sets × lo–hi"; max 2 selected; exercises already in today's workout are hidden. Sticky button: "Add 1 exercise" / "Add pair".
  - A single extra block has a "+ Pair with…" button (same sheet, one selection, becomes the second slot).
  - Each extra card has a "Remove" button. If sets are complete, confirm first. It deletes that exercise's sets from today only. An empty block disappears; a pair becomes a single.
  - Header progress includes extra sets.
- **History for extras** ("last time", badge): this exercise id's own sets in the most recent finished session that has them, however old. Never used → "—". Rep colors in the last-time column and both ADD WEIGHT rules use the library entry's lo/hi.
- **Targets for extras:**
  - **Custom extras** (empty `sourceProgramIds`): their own target under their `x-` id, with the full target behavior (line, edit row, suggestions, prefill, colors).
  - **Program-sourced extras** (non-empty `sourceProgramIds`):
    - They show the program's target read-only: "Program target 3 × 11 · 22.5 kg" (sets from the extra's own library entry). It isn't tappable, and these cards get no suggestions. Extras never change program targets.
    - When several program slots match, use the slot whose target has the lowest weight; on a tie, the fewest reps. Ignore slots without a target. If none have one, show no target line.
    - Weight prefill and reps-input colors use that program target. Without one, they fall back to the extra's own last time and the rep range.
- Extras never affect program slots (no ADD WEIGHT, no targets), finishing, the zero-sets rule, rotation or the wake lock.

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
    { exerciseId: "B-bench", setNumber: 1, weight: 62.5, reps: 8, loggedAt: "ISO date" }
  ],
  // Extra blocks in the order added, so added-but-unlogged extras survive a reload.
  // Old sessions without `extras` are treated as having none.
  extras: [{ block: "E", exerciseIds: ["x-cable-crunch", "x-pec-deck"] }]
}
```

Logged extra sets go into the same `sets` array as program sets.

```js
// tt.targets: one entry per exercise id
{
  "B-bench": {
    weight: 62.5, reps: 8, changedAt: "ISO date",                  // null while there is no target yet
    pending: { weight: 65, reps: 6, fromSessionId: "…" } | null,   // local only
    dismissedFrom: "sessionId" | null                              // local only
  }
}

// tt.notes: one entry per exercise id
{
  "C-incline-db": { text: "Bench notch 3", changedAt: "ISO date" }  // text "" = deleted
}
```

### Storage on the phone (`storage.js`)

- Store all sessions as one JSON array in `localStorage` under the key `tt.sessions`. Store the exercise library under `tt.exercises`, targets under `tt.targets` (plus the flag `tt.targetsInitialized`), notes under `tt.notes`, settings under `tt.settings` and the names of one-time data updates that already ran under `tt.migrations`. The data stays small (about 150 sessions a year), so `localStorage` is enough.
- Save after every change to a set (completed, edited or cleared).
- On first start, call `navigator.storage.persist()` to ask Chrome not to clear the data.
- Wrap all reads and writes in try/catch. Corrupt or missing data must never crash the app; start empty instead and show a warning.

### Sync to Google Sheet (`sync.js` + `apps-script/Code.gs`)

- **Sheet layout:**
  - Tab `sets`, one row per logged set. Columns: `sessionId, date, day, exerciseId, exerciseName, setNumber, weightKg, reps, loggedAt`. Extra sets use the library name in `exerciseName`.
  - Tab `exercises`, the library. Columns: `id, name, sets, lo, hi, sourceProgramIds, createdAt` (`sourceProgramIds` as a comma-separated string). The script deletes the old `inc` column from Sheets made by earlier versions.
    - **TODO, the next `Code.gs` change after milestone 10:** the `inc` cleanup is temporary. It was kept on purpose in milestone 10, because it only runs when the script touches the `exercises` tab (on a restore or a library change). Once the owner confirms the `inc` column is gone from the Sheet, remove `removeOldIncColumn()` and its call in `getExercisesSheet()` in `Code.gs`. Also remove `withoutOldFields()` in `storage.js` (and its two uses), then remove this note.
  - Tab `targets`. Columns: `exerciseId, weight, reps, changedAt`. Only real targets; `pending` and `dismissedFrom` are never sent.
  - Tab `notes`. Columns: `exerciseId, text, changedAt`, all formatted as plain text (so a note starting with "=" is never a formula). Deleted notes have empty text.
- **Apps Script:**
  - Deployed as a web app: "Execute as: me", "Who has access: anyone".
  - The script stores the secret key in Script Properties (`SECRET_KEY`), never in the code.
  - It rejects any request whose `key` doesn't match.
- **Requests:**
  - Always `POST` with `Content-Type: text/plain` and a JSON body. This avoids the CORS preflight that Apps Script cannot answer.
  - Body shape: `{ key, action, ... }`.
  - `action: "saveSession"`: replace all rows with that `sessionId` (delete, then append). Retries can then never create duplicates.
  - `action: "saveExercises"`: merge the full library into the `exercises` tab by id (the app's entries win; rows the app doesn't have are kept, so an incomplete phone library can't wipe the Sheet).
  - `action: "saveTargets"`: send all current targets. The script merges them into the `targets` tab by exerciseId, keeping the newer `changedAt`; rows the app doesn't send are kept, so a phone that hasn't restored yet can't wipe or roll back the Sheet.
  - `action: "saveNotes"`: the same for all notes, into the `notes` tab.
  - `action: "list"`: return all set rows, the library, the targets and the notes (`{ ok, rows, exercises, targets, notes }`), for restoring.
  - `action: "ping"`: return `{ ok: true }` to test the connection.
  - Responses are JSON: `{ ok: true, ... }` or `{ ok: false, error }`.
- **When to sync:** on finish, every finished session with `synced: false` is sent. The same check runs on app start and on the browser's `online` event. On success, set `synced: true`.
  - Any library change sets `exercisesSynced: false` in `tt.settings`. Any target change (edit, Accept, initialization) sets `targetsSynced: false`, and any note change sets `notesSynced: false`; both also start a background sync.
  - Order of one sync: `saveExercises` (if needed), then sessions, then `saveTargets` and `saveNotes` (if needed). Each flag goes back to `true` on success. Targets and notes come last so workouts still sync if the deployed script is older.
- **Restore from Sheet:** merge the library by id first (local wins), then targets and notes by exerciseId (newer `changedAt` wins), then rebuild sessions from the rows and merge them with local data by `sessionId`. Local data wins for sessions not yet synced.

### Settings screen

Reached from a small gear icon button in the header. Contains:

- **Apps Script URL** and **secret key** inputs, saved to `tt.settings`.
- A **"Test connection"** button (sends `ping`).
- **Sync status:** last successful sync time, number of unsynced sessions, and whether the exercise library, the targets and the notes are synced.
- **"Restore from Sheet"**, with a confirmation dialog first.
- **"Export backup"**: downloads `{ version: 4, sessions, exercises, targets, notes }` as `training-backup-YYYY-MM-DD.json`. `targets` holds only `{ weight, reps, changedAt }` per exercise id.
- **"Import backup"**: loads that file and merges the library by id, then targets and notes by exerciseId (newer `changedAt` wins), then sessions by `sessionId`, with confirmation first. Versions 1 (a plain sessions array), 2 (no targets) and 3 (no notes) still work.

## PWA

- **`manifest.webmanifest`:**
  - `name` and `short_name` "gymtracker".
  - `start_url` "./", `scope` "./", `display` "standalone", `orientation` "portrait".
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
   2. Extra blocks: alternating order, logging, the three history sources, prefill, colors, badge, remove, pair-with, resume after reload, and the "extra sets that push the program" rule (all replaced in milestone 9). The debug fake history includes extras older and newer than 30 days, and one that beats the program.
   3. Sync (`exercises` tab, `saveExercises`, `list` with library), backup v2 and restore. Update `Code.gs` and deploy a new version.
   4. This file and the README.
9. **Targets and extras cleanup.**
   - `targets.js` and `tt.targets`: one-time initialization, the target line and edit row, suggestions R1–R3 with Accept / Edit / ×, and prefill and reps colors from the target.
   - Program-sourced extras show the lowest program target read-only.
   - Remove the 30-day rule, the PROGRAM ballpark tag and fallback, the extras-push-program rule and every leftover of the old weight step (`inc`).
   - Sync: the `targets` tab, `saveTargets`, and `list` with targets. Backup v3. Update `Code.gs` and deploy a new version.
   - The debug fake history covers initialization, R1, R2, R3, dismissing, and the lowest-target choice for Cable lateral raise.
   - This file and the README.
10. **Notes, and the target below the rep range.**
    - Card order: name, "sets × rep range", target line, suggestion, badge, set rows, note.
    - `notes.js` and `tt.notes`: read-only note at the bottom of the card, tap to edit, a pencil with "Add note" when empty. Program-sourced extras show the program note read-only.
    - Sync: the `notes` tab, `saveNotes`, and `list` with notes. Backup v4. Update `Code.gs` and deploy a new version.
    - The debug fake history adds sample notes (bench press, and Friday's cable lateral raise for the program note).

## Out of scope for now

Rest timer, progress charts (the Sheet covers this), editing the program inside the app, swapping exercises mid-workout, notes per workout (notes are per exercise), bodyweight tracking, multiple users.
