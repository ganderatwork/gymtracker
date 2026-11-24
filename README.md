# gymtracker

A personal workout-logging app for an Android phone. It runs two fixed workouts, A and B, done in turn (A B A, B A B, …), shows last time's numbers next to today's inputs, and tells you when to add weight. Workouts are saved on the phone first and backed up to a Google Sheet.

Plain HTML, CSS and JavaScript. No build step: the files in this repo are the app.

---

## 1. Put the app online (GitHub Pages)

1. Push this repo to GitHub (`main` branch).
2. On github.com, open the repo → **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, and click **Save**.
4. After a minute or two the app is live at `https://<your-user>.github.io/<repo>/`
   (for this repo: `https://ganderatwork.github.io/gymtracker/`).

## 2. Install it on the phone

1. Open the address above in **Chrome** on the phone.
2. Tap **⋮** → **Add to Home screen** (or **Install app**) → **Install**.
3. Open it from the home screen icon. It runs full screen, like a normal app.
4. **Test offline:** open the app once with internet, close it, switch on airplane mode, and open it again. It should load and let you log sets.

## 3. Publishing changes (important)

The phone keeps its own copy of the app so it can work offline. To make it pick up changes:

1. Open `sw.js` and bump `CACHE_VERSION` (`"v1"` → `"v2"`, and so on).
2. Commit and push.
3. Open the app on the phone. After a few seconds a banner says **"Update available – tap to reload"**. Tap it.

If you add, rename or delete an app file, also update the `APP_FILES` list in `sw.js`.

## 4. Back up to a Google Sheet

### 4.1 Create the Sheet and the script

1. Create a new Google Sheet (e.g. "Training log").
2. In the Sheet: **Extensions** → **Apps Script**.
3. Delete the example code, paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs), and click **Save** (disk icon).

### 4.2 Set the secret key

The key stops strangers from writing to your Sheet. It lives only in the script's settings and on your phone, **never in this repo**.

1. Make up a long random key. For example, run this in PowerShell and copy the result:
   ```powershell
   [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
   ```
2. In the Apps Script editor: **Project Settings** (gear icon, left) → **Script Properties** → **Add script property**.
3. Property: `SECRET_KEY`, Value: your key → **Save script properties**.

### 4.3 Deploy the script as a web app

1. Click **Deploy** → **New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy**. Google asks for permission: **Authorize access** → choose your account → **Advanced** → **Go to … (unsafe)** → **Allow**. (It says "unsafe" only because you wrote the script yourself and Google hasn't reviewed it.)
5. Copy the **Web app URL**. It ends in `/exec`.
   - It's shown in the "New deployment" dialog right after you click **Deploy**, with a **Copy** button.
   - To find it later: **Deploy** → **Manage deployments** → select the deployment.
   - Don't use the URL from **Test deployments** (it ends in `/dev`); the app won't accept it.
6. **Check it:** open the URL in a browser tab.
   - "Script function not found: doGet" means all is well. The script only answers the app.
   - A "needs your permission" box means the script isn't authorized yet. Tap **Review permissions** → your account → **Advanced** → **Go to gymtracker (unsafe)** → **Allow**. Until this is done, the app shows "Could not reach the Sheet script".

"Anyone" means anyone with the URL can *reach* the script, but it rejects every request without the right key.

### 4.4 Connect the app

1. In the app, tap the **gear** (top right).
2. Paste the **Apps Script URL** and the **secret key**. They are saved on the phone straight away.
3. Tap **Test connection**. You should see "Connected to the Sheet."
4. Finish a workout. The button should say **"Saved · synced to Sheet"**, and the Sheet gets a `sets` tab with one row per set.

If you're offline when finishing, it says "Saved · will sync when online". It is sent automatically the next time the app opens or the phone comes back online.

### 4.5 Updating the script (keeps the same URL)

Whenever `Code.gs` changes in this repo (for example when targets were added), update the deployed script:

1. Open the Sheet → **Extensions** → **Apps Script**.
2. Select all the old code, paste in the new [`apps-script/Code.gs`](apps-script/Code.gs), and click **Save**.
3. Click **Deploy** → **Manage deployments** → select the deployment → pencil icon (edit).
4. Under **Version**, choose **New version** → **Deploy**.

The URL stays the same, so nothing changes in the app. If you skip steps 3–4, the old code keeps running. With an old script, syncing fails with "Unknown action." (workouts are still sent first; the rest is retried at the next sync).

The script creates its tabs by itself: `exercises` for extra exercises, `targets` for your targets (`exerciseId, weight, reps, changedAt`) and `notes` for your exercise notes (`exerciseId, text, changedAt`).

**Old `inc` column:** Sheets made by older versions have an unused `inc` column in the `exercises` tab. The new script deletes it by itself the first time it touches that tab (on the next sync or restore). If you'd rather do it by hand: open the `exercises` tab, right-click the header of the `inc` column (column F) → **Delete column**. Do this only after the new script is deployed.

## 5. Restore

- **From the Sheet:** Settings → **Restore from Sheet**. Extra exercises, targets, notes and workouts from the Sheet are added to the phone. Workouts on the phone that aren't synced yet are never overwritten. For targets and notes, the most recently changed one wins.
- **From a backup file:** Settings → **Export backup** saves a `training-backup-YYYY-MM-DD.json` file with all workouts, extra exercises, targets and notes. **Import backup** adds what's missing from such a file (older backup files still work). Everything already on the phone is kept, except targets and notes that are older than the ones in the file.

To test restoring: Chrome → **⋮** → **Settings** → **Site settings** → **All sites** → your github.io address → **Delete data**. Open the app, enter the URL and key again, and tap **Restore from Sheet**.

## 6. Testing helper (temporary)

Add `?debug` to the address (e.g. `https://ganderatwork.github.io/gymtracker/?debug`) to show two buttons:

- **Debug: fake history** adds fake finished workouts (an old 3-day-program Friday 10 days ago, A a week ago, B 3 days ago) and **replaces all targets on that device** with ones made from them by the real one-time setup. Use it on a test device or a local copy (`python -m http.server`), not on your real phone data. The app then suggests A:
  - **Initialization:** most cards show "Target …". Chest-supported row logged 8, 8, 7 reps, so its target is 3 × 8 · 25 kg (average rounded up).
  - **R1:** Chest-supported row: set 1 at 27.5 kg, all three sets 8 reps → "Next target: 3 × 8 · 27.5 kg".
  - **R2:** Seated leg curl (target 3 × 10 · 40 kg): all three sets 10 reps → "Next target: 3 × 11 · 40 kg".
  - **Target freeze:** Seated leg curl: log 11 reps on all three sets (green, above the target), then accept "3 × 12". The sets stay green, because today still compares against the target they started with.
  - **R3:** Overhead cable triceps extension has no history ("No target yet"). Log all three sets → it suggests your set 1.
  - **Dismiss:** switch to B: Barbell bench press already has a suggestion waiting from the last B workout. Try Accept, Edit and ×.
  - **ADD WEIGHT:** Incline DB press on A and bench press on B (and Cable crunch) logged every set at the top of the range, so the weight fields start empty.
  - **History from the old program:** on B, Pec deck was skipped in the fake B workout. Its "last time" (35 × 15 ✓) and its target come from the old Friday workout, through `previousIds` in `program.js`.
  - **Program target for an extra:** on A, add "Pec deck" as an extra: "Program target 3 × 15 · 35 kg" from B's slot. On B, add "Cable lateral raise": "Program target 3 × 13 · 45 kg" from A's slot, prefilled with 45. Extra blocks start at F.
  - **Custom extra:** add "Cable crunch": its own target 3 × 15 · 40 kg, tappable, with suggestions.
  - **Notes:** B's bench press has a sample note at the bottom of its card (tap to edit; clear it to delete it). Cards without a note show a pencil with "Add note". The Cable lateral raise extra on B shows A's note as "Program note" (read-only).
  The fake workouts and targets are never sent to the Sheet, unless you change a target afterwards: then all targets on that device are sent. The fake extra exercises are added to your library.
- **Debug: clear all** deletes every workout, extra exercise, target and note on that device.

To remove the helper: delete `debug.js`, its `<script>` line in `index.html`, its line in `APP_FILES` in `sw.js`, and the "debug panel" styles at the end of `styles.css`. Then bump `CACHE_VERSION`.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell and markup |
| `styles.css` | All styling; colors are CSS variables at the top |
| `program.js` | The training program (the only place to edit exercises) |
| `storage.js` | Saving workouts, extra exercises, targets and settings on the phone, backup files |
| `sync.js` | Sending workouts, extra exercises and targets to the Google Sheet and restoring from it |
| `extras.js` | Extra exercises: library, "Add exercises" sheet, extra blocks and their history |
| `targets.js` | Targets: one-time setup, "Next target" suggestions, the target line and its edit row |
| `notes.js` | Notes per exercise: shown at the bottom of each card, tap to edit |
| `app.js` | Screens, logging rules, settings |
| `manifest.webmanifest` | App name, colors and icons for installing |
| `sw.js` | Service worker: offline copy and updates |
| `icons/` | App icons |
| `apps-script/Code.gs` | The Google Apps Script backend (pasted into the Sheet by hand) |
| `debug.js` | Temporary test helper (see above) |
