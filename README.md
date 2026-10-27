# Training Tracker

A personal workout-logging app for an Android phone. It runs a fixed 3-day program, shows last time's numbers next to today's inputs, and tells you when to add weight. Workouts are saved on the phone first and backed up to a Google Sheet.

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

"Anyone" means anyone with the URL can *reach* the script, but it rejects every request without the right key.

### 4.4 Connect the app

1. In the app, tap the **gear** (top right).
2. Paste the **Apps Script URL** and the **secret key**. They are saved on the phone straight away.
3. Tap **Test connection**. You should see "Connected to the Sheet."
4. Finish a workout. The button should say **"Saved · synced to Sheet"**, and the Sheet gets a `sets` tab with one row per set.

If you're offline when finishing, it says "Saved · will sync when online". It is sent automatically the next time the app opens or the phone comes back online.

### 4.5 Changing the script later

If you edit `Code.gs`, paste it in again, then **Deploy** → **Manage deployments** → pencil icon → **Version: New version** → **Deploy**. This keeps the same URL.

## 5. Restore

- **From the Sheet:** Settings → **Restore from Sheet**. Workouts from the Sheet are added to the phone. Workouts on the phone that aren't synced yet are never overwritten.
- **From a backup file:** Settings → **Export backup** saves a `training-backup-YYYY-MM-DD.json` file. **Import backup** adds the workouts from such a file. Workouts already on the phone are kept as they are.

To test restoring: Chrome → **⋮** → **Settings** → **Site settings** → **All sites** → your github.io address → **Delete data**. Open the app, enter the URL and key again, and tap **Restore from Sheet**.

## 6. Testing helper (temporary)

Add `?debug` to the address (e.g. `https://ganderatwork.github.io/gymtracker/?debug`) to show two buttons:

- **Debug: fake history** adds three fake finished workouts, to see the ADD WEIGHT badge and the rep colors. They are never sent to the Sheet.
- **Debug: clear all** deletes every workout on that device.

To remove the helper: delete `debug.js`, its `<script>` line in `index.html`, its line in `APP_FILES` in `sw.js`, and the "debug panel" styles at the end of `styles.css`. Then bump `CACHE_VERSION`.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell and markup |
| `styles.css` | All styling; colors are CSS variables at the top |
| `program.js` | The training program (the only place to edit exercises) |
| `storage.js` | Saving workouts and settings on the phone, backup files |
| `sync.js` | Sending workouts to the Google Sheet and restoring from it |
| `app.js` | Screens, logging rules, settings |
| `manifest.webmanifest` | App name, colors and icons for installing |
| `sw.js` | Service worker: offline copy and updates |
| `icons/` | App icons |
| `apps-script/Code.gs` | The Google Apps Script backend (pasted into the Sheet by hand) |
| `debug.js` | Temporary test helper (see above) |
