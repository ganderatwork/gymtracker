// Sending workouts to the Google Sheet, and restoring them from it.
// Uses `state.sessions` from app.js and the save/load helpers from storage.js.

// Requests give up after this long, so a bad gym connection doesn't hang forever.
const SYNC_TIMEOUT_MS = 20000;

// A real Apps Script web app address. Checking this stops the secret key being sent elsewhere by a typo.
function isValidScriptUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url.trim());
}

function isSyncConfigured(settings) {
  return isValidScriptUrl(settings.scriptUrl) && settings.secretKey.trim() !== "";
}

// Sends one request to the Apps Script. Returns its JSON answer, or throws an Error with a readable message.
async function callScript(settings, body) {
  if (!isSyncConfigured(settings)) {
    throw new Error("Add a valid Apps Script URL and secret key first.");
  }

  // `text/plain` avoids the extra CORS check (preflight) that Apps Script can't answer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(settings.scriptUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ key: settings.secretKey.trim() }, body)),
      signal: controller.signal,
    });
  } catch (error) {
    // Offline looks the same as an HTML error page from Google (the browser blocks reading it).
    throw new Error(
      "Could not reach the Sheet script. If you are online: check that the deployment has access " +
        "\"Anyone\", and that the code was saved before deploying (then deploy a new version)."
    );
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("Unexpected answer. Check the URL, and that the script is deployed with access for \"Anyone\".");
  }
  if (!data.ok) throw new Error(data.error || "The script reported an error.");
  return data;
}

function exerciseNameById(exerciseId) {
  const entry = state.library.find((e) => e.id === exerciseId);
  if (entry) return entry.name;
  for (const day of Object.values(PROGRAM)) {
    for (const block of day.blocks) {
      const exercise = block.exercises.find((ex) => ex.id === exerciseId);
      if (exercise) return exercise.name;
    }
  }
  return "";
}

// "2026-10-26" in the phone's own time zone.
function localDate(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// One Sheet row per logged set, with the column names used in Code.gs.
function sessionToRows(session) {
  return session.sets.map((set) => ({
    sessionId: session.id,
    date: localDate(session.startedAt),
    day: session.day,
    exerciseId: set.exerciseId,
    exerciseName: exerciseNameById(set.exerciseId),
    setNumber: set.setNumber,
    weightKg: set.weight,
    reps: set.reps,
    loggedAt: set.loggedAt,
  }));
}

// ---------- Sending ----------

// Call after any change to the library, so the next sync sends it.
function markLibraryChanged() {
  const settings = loadSettings();
  settings.exercisesSynced = false;
  saveSettings(settings);
}

// Call after any target change, so the next sync sends the targets.
function markTargetsChanged() {
  const settings = loadSettings();
  settings.targetsSynced = false;
  saveSettings(settings);
}

// Call after any note change, so the next sync sends the notes.
function markNotesChanged() {
  const settings = loadSettings();
  settings.notesSynced = false;
  saveSettings(settings);
}

// Rows for the Sheet's `notes` tab. Deleted notes are sent with empty text, so they are deleted there too.
function notesToRows(notes) {
  return Object.keys(notes).map((id) => ({ exerciseId: id, text: notes[id].text, changedAt: notes[id].changedAt }));
}

// Rows for the Sheet's `targets` tab: one per exercise that has a target.
function targetsToRows(targets) {
  const shared = shareableTargets(targets);
  return Object.keys(shared).map((id) => ({
    exerciseId: id,
    weight: shared[id].weight,
    reps: shared[id].reps,
    changedAt: shared[id].changedAt,
  }));
}

// One row of the Sheet's `exercises` tab.
function exerciseToRow(entry) {
  return {
    id: entry.id,
    name: entry.name,
    sets: entry.sets,
    lo: entry.lo,
    hi: entry.hi,
    sourceProgramIds: entry.sourceProgramIds.join(","),
    createdAt: entry.createdAt,
  };
}

let runningSync = null;

// Sends every finished, unsynced workout. If a sync is already running, waits for that one instead.
// Resolves to { ok: true, sent } or { ok: false, error, notConfigured }.
function syncUnsynced() {
  if (!runningSync) {
    runningSync = sendUnsynced().finally(() => {
      runningSync = null;
    });
  }
  return runningSync;
}

async function sendUnsynced() {
  const settings = loadSettings();
  if (!isSyncConfigured(settings)) {
    return { ok: false, notConfigured: true, error: "Sheet sync is not set up." };
  }

  let sent = 0;

  // The library goes first, so the Sheet knows the extra exercises' names.
  if (!settings.exercisesSynced) {
    const snapshot = JSON.stringify(state.library);
    try {
      await callScript(settings, { action: "saveExercises", exercises: state.library.map(exerciseToRow) });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    // Only mark it sent if nothing was added to the library while we were sending.
    if (JSON.stringify(state.library) === snapshot) {
      const latest = loadSettings();
      latest.exercisesSynced = true;
      saveSettings(latest);
    }
    sent++;
  }

  // Look again each round, so a workout finished during the sync is sent too.
  for (;;) {
    const next = state.sessions.find((s) => s.finishedAt && !s.synced);
    if (!next) break;
    try {
      await callScript(settings, {
        action: "saveSession",
        sessionId: next.id,
        rows: sessionToRows(next),
      });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    next.synced = true;
    saveSessions(state.sessions);
    sent++;
  }

  // Then the targets (only when one has changed). They come after the workouts, so workouts
  // still reach the Sheet if the script there is an older version without "saveTargets".
  if (!settings.targetsSynced) {
    const rows = targetsToRows(state.targets);
    const snapshot = JSON.stringify(rows);
    try {
      await callScript(settings, { action: "saveTargets", targets: rows });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    // Only mark them sent if no target changed while we were sending.
    if (JSON.stringify(targetsToRows(state.targets)) === snapshot) {
      const latest = loadSettings();
      latest.targetsSynced = true;
      saveSettings(latest);
    }
    sent++;
  }

  // Then the notes (only when one has changed), the same way.
  if (!settings.notesSynced) {
    const rows = notesToRows(state.notes);
    const snapshot = JSON.stringify(rows);
    try {
      await callScript(settings, { action: "saveNotes", notes: rows });
    } catch (error) {
      return { ok: false, error: error.message };
    }
    if (JSON.stringify(notesToRows(state.notes)) === snapshot) {
      const latest = loadSettings();
      latest.notesSynced = true;
      saveSettings(latest);
    }
    sent++;
  }

  if (sent > 0) {
    // Load again: other settings may have changed during the sync.
    const latest = loadSettings();
    latest.lastSyncAt = new Date().toISOString();
    saveSettings(latest);
  }
  return { ok: true, sent: sent };
}

// ---------- Restoring ----------

// Sheet rows → sessions. Rows that don't make sense are skipped.
function rowsToSessions(rows) {
  const byId = new Map();
  for (const row of rows) {
    const id = String(row.sessionId || "");
    const day = String(row.day || "");
    const set = {
      exerciseId: String(row.exerciseId || ""),
      setNumber: Number(row.setNumber),
      weight: Number(row.weightKg),
      reps: Number(row.reps),
      loggedAt: String(row.loggedAt || ""),
    };
    if (!id || !PROGRAM[day] || !set.exerciseId) continue;
    if (!Number.isFinite(set.setNumber) || !Number.isFinite(set.weight) || !Number.isFinite(set.reps)) continue;

    if (!byId.has(id)) {
      // Session ids are "<start time>-<day>", so the start time can be read back from the id.
      const fromId = id.slice(0, id.lastIndexOf("-"));
      byId.set(id, {
        id: id,
        day: day,
        startedAt: Number.isNaN(Date.parse(fromId)) ? set.loggedAt : fromId,
        finishedAt: null,
        synced: true,
        sets: [],
      });
    }
    byId.get(id).sets.push(set);
  }

  // Only finished workouts are ever synced; the last logged set marks the finish time.
  const sessions = Array.from(byId.values());
  for (const session of sessions) {
    session.finishedAt = session.sets.reduce((latest, s) => (s.loggedAt > latest ? s.loggedAt : latest), "");
  }
  return sessions;
}

// Sheet `exercises` rows → library entries. Rows that don't make sense are skipped.
function rowsToLibrary(rows) {
  return rows
    .map((row) => ({
      id: String(row.id || ""),
      name: String(row.name || ""),
      sets: Number(row.sets),
      lo: Number(row.lo),
      hi: Number(row.hi),
      sourceProgramIds: String(row.sourceProgramIds || "").split(",").filter(Boolean),
      createdAt: String(row.createdAt || ""),
    }))
    .filter((entry) => entry.name !== "" && isValidLibraryExercise(entry));
}

// Sheet `targets` rows → { exerciseId: { weight, reps, changedAt } }. Rows that don't make sense are skipped.
function rowsToTargets(rows) {
  const targets = {};
  for (const row of rows) {
    const id = String(row.exerciseId || "");
    const weight = Number(row.weight);
    const reps = Number(row.reps);
    if (!id || !isValidTargetNumbers(weight, reps)) continue;
    targets[id] = { weight: weight, reps: reps, changedAt: String(row.changedAt || "") };
  }
  return targets;
}

// Sheet `notes` rows → { exerciseId: { text, changedAt } }. Rows without an id or date are skipped.
function rowsToNotes(rows) {
  const notes = {};
  for (const row of rows) {
    const id = String(row.exerciseId || "");
    const changedAt = String(row.changedAt || "");
    if (!id || !changedAt) continue;
    notes[id] = { text: String(row.text || ""), changedAt: changedAt };
  }
  return notes;
}

// Fetches everything from the Sheet: { sessions, exercises, targets, notes }.
async function fetchSheetData() {
  const data = await callScript(loadSettings(), { action: "list" });
  return {
    sessions: rowsToSessions(Array.isArray(data.rows) ? data.rows : []),
    exercises: rowsToLibrary(Array.isArray(data.exercises) ? data.exercises : []),
    targets: rowsToTargets(Array.isArray(data.targets) ? data.targets : []),
    notes: rowsToNotes(Array.isArray(data.notes) ? data.notes : []),
  };
}

// Merges by session id. Local workouts not yet synced always win; otherwise the Sheet's version is used.
function mergeFromSheet(local, remote) {
  const remoteById = new Map(remote.map((s) => [s.id, s]));
  const localIds = new Set(local.map((s) => s.id));
  const merged = local.map((s) => (s.synced && remoteById.has(s.id) ? remoteById.get(s.id) : s));
  const added = remote.filter((s) => !localIds.has(s.id));
  return { sessions: merged.concat(added), addedCount: added.length };
}
