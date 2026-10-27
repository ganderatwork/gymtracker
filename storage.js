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

// True if `e` looks like a library entry: { id, name, sets, lo, hi, inc, sourceProgramIds, createdAt }.
function isValidLibraryExercise(e) {
  return Boolean(
    e &&
      typeof e.id === "string" &&
      e.id.startsWith("x-") &&
      typeof e.name === "string" &&
      Number.isFinite(e.sets) &&
      Number.isFinite(e.lo) &&
      Number.isFinite(e.hi) &&
      Number.isFinite(e.inc) &&
      Array.isArray(e.sourceProgramIds)
  );
}

// Same safety rules as loadSessions(): never crash, keep a copy of unreadable data.
function loadExercises() {
  let raw = null;
  try {
    raw = localStorage.getItem(EXERCISES_KEY);
    if (raw === null) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error("Saved library is not a list");
    return list.filter(isValidLibraryExercise);
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

// Downloads everything as training-backup-YYYY-MM-DD.json: { version: 2, sessions, exercises }.
function downloadBackup(sessions, exercises) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

  const backup = { version: 2, sessions: sessions, exercises: exercises };
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

// Reads the text of a backup file. Returns { sessions, exercises }, or null if it isn't a backup.
// Old backups (before extras) are a plain list of sessions; those still work.
function parseBackup(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return { sessions: data.filter(isValidSession), exercises: [] };
    if (data && Array.isArray(data.sessions)) {
      return {
        sessions: data.sessions.filter(isValidSession),
        exercises: Array.isArray(data.exercises) ? data.exercises.filter(isValidLibraryExercise) : [],
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
