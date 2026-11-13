// Saving and reading workouts on the phone, using localStorage.
// Everything is wrapped in try/catch: broken or missing data must never crash the app.

const SESSIONS_KEY = "tt.sessions";

// Set when reading or writing fails. app.js shows it as a warning.
let storageWarning = null;

// True if `s` looks like a session this app can use.
function isValidSession(s) {
  return Boolean(s && typeof s.id === "string" && PROGRAM[s.day] && Array.isArray(s.sets));
}

// Returns the list of saved sessions, or an empty list if there is none (or it is unreadable).
function loadSessions() {
  let raw = null;
  try {
    raw = localStorage.getItem(SESSIONS_KEY);
    if (raw === null) return [];
    const sessions = JSON.parse(raw);
    if (!Array.isArray(sessions)) throw new Error("Saved data is not a list");
    // Skip any entry that doesn't look like a session, instead of crashing on it later.
    return sessions.filter(isValidSession);
  } catch (error) {
    // Keep a copy of the unreadable data, so the next save doesn't wipe it for good.
    try {
      if (raw !== null) localStorage.setItem(SESSIONS_KEY + ".corrupt", raw);
    } catch (copyError) {
      // Nothing more we can do.
    }
    storageWarning = "Saved workouts could not be read, so the app started empty.";
    return [];
  }
}

// Writes all sessions. Returns true on success, false if the phone refused.
function saveSessions(sessions) {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    return true;
  } catch (error) {
    storageWarning = "Could not save on this phone. Storage may be full or blocked.";
    return false;
  }
}

// Asks Chrome not to clear this site's data when the phone runs low on space.
function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  } catch (error) {
    // Not supported; ignore.
  }
}

// ---------- Exercise library (extras) ----------

const EXERCISES_KEY = "tt.exercises";

// True if `e` looks like a library entry: { id, name, sets, lo, hi, sourceProgramIds, createdAt }.
function isValidLibraryExercise(e) {
  return Boolean(
    e &&
      typeof e.id === "string" &&
      e.id.startsWith("x-") &&
      typeof e.name === "string" &&
      Number.isFinite(e.sets) &&
      Number.isFinite(e.lo) &&
      Number.isFinite(e.hi) &&
      Array.isArray(e.sourceProgramIds)
  );
}

// Keeps only the fields the app uses. Older entries had a weight step `inc`, which is dropped here.
function withoutOldFields(e) {
  return {
    id: e.id,
    name: e.name,
    sets: e.sets,
    lo: e.lo,
    hi: e.hi,
    sourceProgramIds: e.sourceProgramIds,
    createdAt: e.createdAt,
  };
}

// Same safety rules as loadSessions(): never crash, keep a copy of unreadable data.
function loadExercises() {
  let raw = null;
  try {
    raw = localStorage.getItem(EXERCISES_KEY);
    if (raw === null) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error("Saved library is not a list");
    return list.filter(isValidLibraryExercise).map(withoutOldFields);
  } catch (error) {
    try {
      if (raw !== null) localStorage.setItem(EXERCISES_KEY + ".corrupt", raw);
    } catch (copyError) {
      // Nothing more we can do.
    }
    storageWarning = "Saved exercises could not be read, so the library started empty.";
    return [];
  }
}

function saveExercises(list) {
  try {
    localStorage.setItem(EXERCISES_KEY, JSON.stringify(list));
    return true;
  } catch (error) {
    storageWarning = "Could not save exercises on this phone. Storage may be full or blocked.";
    return false;
  }
}

// "Cable Crunch (rope)" → "cable-crunch-rope"
function slugify(name) {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: é → e
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "exercise";
}

// A new, never-used id like "x-cable-crunch", or "x-cable-crunch-2" if that is taken.
function makeExerciseId(name, library) {
  const base = "x-" + slugify(name);
  let id = base;
  let n = 2;
  while (library.some((e) => e.id === id)) {
    id = base + "-" + n;
    n++;
  }
  return id;
}

// ---------- Targets ----------
// tt.targets is an object keyed by exercise id:
//   { weight, reps, changedAt, pending, dismissedFrom }
// weight/reps/changedAt are null while there is only a suggestion and no target yet.
// pending:       { weight, reps, fromSessionId } – a suggestion waiting for Accept / Edit / ×, or null.
// dismissedFrom: the session id whose suggestion was dismissed with ×, or null.

const TARGETS_KEY = "tt.targets";
// Set once the one-time "targets from history" setup has run (see initTargets() in targets.js).
const TARGETS_INIT_KEY = "tt.targetsInitialized";

// Valid target numbers: weight ≥ 0, reps a whole number ≥ 1 (the same rules as a complete set).
function isValidTargetNumbers(weight, reps) {
  return Number.isFinite(weight) && weight >= 0 && Number.isInteger(reps) && reps >= 1;
}

// Returns a clean copy of one saved target entry, or null if it is unusable.
function cleanTargetEntry(t) {
  if (!t || typeof t !== "object") return null;
  const hasTarget = isValidTargetNumbers(t.weight, t.reps);
  const p = t.pending;
  const pending =
    p && isValidTargetNumbers(p.weight, p.reps) && typeof p.fromSessionId === "string"
      ? { weight: p.weight, reps: p.reps, fromSessionId: p.fromSessionId }
      : null;
  const entry = {
    weight: hasTarget ? t.weight : null,
    reps: hasTarget ? t.reps : null,
    changedAt: hasTarget && typeof t.changedAt === "string" ? t.changedAt : null,
    pending: pending,
    dismissedFrom: typeof t.dismissedFrom === "string" ? t.dismissedFrom : null,
  };
  // An entry with nothing in it is not worth keeping.
  if (!hasTarget && !entry.pending && !entry.dismissedFrom) return null;
  return entry;
}

// Same safety rules as loadSessions(): never crash, keep a copy of unreadable data.
function loadTargets() {
  let raw = null;
  try {
    raw = localStorage.getItem(TARGETS_KEY);
    if (raw === null) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Saved targets are not an object");
    const targets = {};
    for (const id of Object.keys(data)) {
      const entry = cleanTargetEntry(data[id]);
      if (entry) targets[id] = entry;
    }
    return targets;
  } catch (error) {
    try {
      if (raw !== null) localStorage.setItem(TARGETS_KEY + ".corrupt", raw);
    } catch (copyError) {
      // Nothing more we can do.
    }
    storageWarning = "Saved targets could not be read, so the app started without targets.";
    return {};
  }
}

function saveTargets(targets) {
  try {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
    return true;
  } catch (error) {
    storageWarning = "Could not save targets on this phone. Storage may be full or blocked.";
    return false;
  }
}

function targetsInitialized() {
  try {
    return localStorage.getItem(TARGETS_INIT_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function markTargetsInitialized() {
  try {
    localStorage.setItem(TARGETS_INIT_KEY, "true");
  } catch (error) {
    // If this fails, the setup simply runs again next time. It never overwrites existing targets.
  }
}

// Only the parts of the targets that leave the phone (Sheet and backup files):
// { "A-bench": { weight, reps, changedAt } }. Suggestions and dismissals stay local.
function shareableTargets(targets) {
  const result = {};
  for (const id of Object.keys(targets)) {
    const t = targets[id];
    if (t.weight !== null) result[id] = { weight: t.weight, reps: t.reps, changedAt: t.changedAt };
  }
  return result;
}

// Merges incoming targets ({ id: { weight, reps, changedAt } }) into the local ones by exercise id.
// The newer `changedAt` wins. Local suggestions and dismissals are kept.
// Returns { targets, updatedCount, localNewer }. `localNewer` = the phone has targets the other
// side doesn't have (or has older), so they should be sent to the Sheet.
function mergeTargets(local, incoming) {
  const targets = {};
  for (const id of Object.keys(local)) targets[id] = Object.assign({}, local[id]);
  let updatedCount = 0;

  for (const id of Object.keys(incoming)) {
    const t = incoming[id];
    if (!t || !isValidTargetNumbers(t.weight, t.reps)) continue;
    const changedAt = typeof t.changedAt === "string" ? t.changedAt : "";
    const mine = targets[id];
    if (mine && mine.weight !== null && (mine.changedAt || "") >= changedAt) continue;
    targets[id] = {
      weight: t.weight,
      reps: t.reps,
      changedAt: changedAt || null,
      pending: mine ? mine.pending : null,
      dismissedFrom: mine ? mine.dismissedFrom : null,
    };
    updatedCount++;
  }

  const localNewer = Object.keys(targets).some((id) => {
    const t = targets[id];
    if (t.weight === null) return false;
    const other = incoming[id];
    return !other || other.weight !== t.weight || other.reps !== t.reps;
  });
  return { targets: targets, updatedCount: updatedCount, localNewer: localNewer };
}

// ---------- Notes ----------
// tt.notes is an object keyed by exercise id: { text, changedAt }.
// A deleted note stays as { text: "", changedAt }, so the deletion also reaches the Sheet
// (the newer `changedAt` wins when merging).

const NOTES_KEY = "tt.notes";

function isValidNote(n) {
  return Boolean(n && typeof n.text === "string" && typeof n.changedAt === "string");
}

// Same safety rules as loadSessions(): never crash, keep a copy of unreadable data.
function loadNotes() {
  let raw = null;
  try {
    raw = localStorage.getItem(NOTES_KEY);
    if (raw === null) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Saved notes are not an object");
    const notes = {};
    for (const id of Object.keys(data)) {
      if (isValidNote(data[id])) notes[id] = { text: data[id].text, changedAt: data[id].changedAt };
    }
    return notes;
  } catch (error) {
    try {
      if (raw !== null) localStorage.setItem(NOTES_KEY + ".corrupt", raw);
    } catch (copyError) {
      // Nothing more we can do.
    }
    storageWarning = "Saved notes could not be read, so the app started without notes.";
    return {};
  }
}

function saveNotes(notes) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    return true;
  } catch (error) {
    storageWarning = "Could not save notes on this phone. Storage may be full or blocked.";
    return false;
  }
}

// Merges incoming notes ({ id: { text, changedAt } }) into the local ones; the newer `changedAt` wins.
// Returns { notes, updatedCount, localNewer } (see mergeTargets()).
function mergeNotes(local, incoming) {
  const notes = Object.assign({}, local);
  let updatedCount = 0;
  for (const id of Object.keys(incoming)) {
    const n = incoming[id];
    if (!isValidNote(n)) continue;
    if (notes[id] && notes[id].changedAt >= n.changedAt) continue;
    notes[id] = { text: n.text, changedAt: n.changedAt };
    updatedCount++;
  }
  const localNewer = Object.keys(notes).some((id) => {
    const other = incoming[id];
    return !isValidNote(other) || other.text !== notes[id].text;
  });
  return { notes: notes, updatedCount: updatedCount, localNewer: localNewer };
}

// ---------- Settings ----------

const SETTINGS_KEY = "tt.settings";

// Always returns a complete settings object, even if nothing (or junk) is saved.
function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch (error) {
    // Broken settings: fall back to empty ones.
  }
  return {
    scriptUrl: typeof saved.scriptUrl === "string" ? saved.scriptUrl : "",
    secretKey: typeof saved.secretKey === "string" ? saved.secretKey : "",
    lastSyncAt: typeof saved.lastSyncAt === "string" ? saved.lastSyncAt : null,
    // false = the exercise library has changed and must be sent to the Sheet.
    exercisesSynced: saved.exercisesSynced !== false,
    // false = a target has changed and must be sent to the Sheet.
    targetsSynced: saved.targetsSynced !== false,
    // false = a note has changed and must be sent to the Sheet.
    notesSynced: saved.notesSynced !== false,
  };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    storageWarning = "Could not save settings on this phone.";
    return false;
  }
}

// ---------- Backup files ----------

// Downloads everything as training-backup-YYYY-MM-DD.json: { version: 4, sessions, exercises, targets, notes }.
// `targets` only holds { weight, reps, changedAt } per exercise (see shareableTargets()).
function downloadBackup(sessions, exercises, targets, notes) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

  const backup = {
    version: 4,
    sessions: sessions,
    exercises: exercises,
    targets: shareableTargets(targets),
    notes: notes,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  // A temporary hidden link with `download` makes the browser save the file.
  const link = document.createElement("a");
  link.href = url;
  link.download = "training-backup-" + date + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Reads the text of a backup file. Returns { sessions, exercises, targets, notes }, or null if it isn't a backup.
// Version 1 backups are a plain list of sessions, version 2 has no targets, version 3 no notes; all still work.
function parseBackup(text) {
  const isObject = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return { sessions: data.filter(isValidSession), exercises: [], targets: {}, notes: {} };
    if (data && Array.isArray(data.sessions)) {
      return {
        sessions: data.sessions.filter(isValidSession),
        exercises: Array.isArray(data.exercises) ? data.exercises.filter(isValidLibraryExercise).map(withoutOldFields) : [],
        targets: isObject(data.targets) ? data.targets : {},
        notes: isObject(data.notes) ? data.notes : {},
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Adds library entries that aren't on the phone yet, matched by id. Existing ones are kept as they are.
function mergeLibrary(local, incoming) {
  const localIds = new Set(local.map((e) => e.id));
  const added = incoming.filter((e) => !localIds.has(e.id));
  return { library: local.concat(added), addedCount: added.length };
}

// Adds imported sessions to the local ones, matched by id.
// Sessions already on the phone are kept as they are, so an import never overwrites anything.
function mergeSessions(local, imported) {
  const localIds = new Set(local.map((s) => s.id));
  // Only one workout per day can be in progress, so skip an imported one if the phone has one.
  const busyDays = new Set(local.filter((s) => !s.finishedAt).map((s) => s.day));
  const added = imported.filter(
    (s) => !localIds.has(s.id) && (s.finishedAt || !busyDays.has(s.day))
  );
  return local.concat(added);
}
