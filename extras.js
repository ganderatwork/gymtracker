// Extra exercises: the exercise library, the "Add exercises" bottom sheet, extra blocks,
// history for extras, and the rule where extras push a program exercise.
// Uses `state`, CHECK_ICON, escapeHtml, parseReps, parseWeight and other helpers from app.js.
// Those are only used inside functions, which run after every file has loaded.

// A program-linked extra only uses its own history if it is at most this old.
const EXTRA_HISTORY_MAX_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  "</svg>";

// ---------- Library helpers ----------

function sameName(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Every program exercise once per name: { name, sets, lo, hi, inc, ids }.
// When a name is on two days (e.g. Cable lateral raise), the first one found gives the numbers.
function programExercisesByName() {
  const byName = new Map();
  for (const day of Object.values(PROGRAM)) {
    for (const block of day.blocks) {
      for (const ex of block.exercises) {
        const key = ex.name.toLowerCase();
        if (!byName.has(key)) {
          byName.set(key, { name: ex.name, sets: ex.sets, lo: ex.repMin, hi: ex.repMax, inc: ex.inc, ids: [] });
        }
        byName.get(key).ids.push(ex.id);
      }
    }
  }
  return byName;
}

function findLibraryByName(name) {
  return state.library.find((e) => sameName(e.name, name)) || null;
}

// Saves a new library entry. A name that matches a program exercise is linked to it.
function addToLibrary(fields) {
  const name = fields.name.trim();
  const programMatch = programExercisesByName().get(name.toLowerCase());
  const entry = {
    id: makeExerciseId(name, state.library),
    name: name,
    sets: fields.sets,
    lo: fields.lo,
    hi: fields.hi,
    inc: fields.inc,
    sourceProgramIds: programMatch ? programMatch.ids.slice() : [],
    createdAt: new Date().toISOString(),
  };
  state.library.push(entry);
  saveExercises(state.library);
  markLibraryChanged();
  return entry;
}

// The library entry for a program exercise: the existing one, or a new one with the program's numbers.
function libraryEntryForProgram(lowerName) {
  const p = programExercisesByName().get(lowerName);
  return findLibraryByName(p.name) || addToLibrary({ name: p.name, sets: p.sets, lo: p.lo, hi: p.hi, inc: p.inc });
}

// When this exercise was last logged (or created, if never). Sorts "Your exercises".
function lastUsedAt(entry) {
  let latest = entry.createdAt || "";
  for (const session of state.sessions) {
    for (const set of session.sets) {
      if (set.exerciseId === entry.id && set.loggedAt > latest) latest = set.loggedAt;
    }
  }
  return latest;
}

// Lower-case names already in today's workout (program and extras). The sheet hides these.
function namesInTodaysWorkout() {
  const names = new Set();
  for (const block of allBlocks()) {
    for (const ex of block.exercises) names.add(ex.name.toLowerCase());
  }
  return names;
}

function libraryEntryById(id) {
  return state.library.find((e) => e.id === id) || null;
}

// ---------- Extra blocks ----------

// A library entry in the same shape as a program exercise, so app.js can treat both alike.
function extraExercise(id, slot) {
  // If the entry is somehow missing, show the id with default numbers instead of crashing.
  const entry = libraryEntryById(id) || { name: id, sets: 3, lo: 10, hi: 12, inc: 2.5, sourceProgramIds: [] };
  return {
    id: id,
    slot: slot,
    name: entry.name,
    sets: entry.sets,
    repMin: entry.lo,
    repMax: entry.hi,
    inc: entry.inc,
    sourceProgramIds: entry.sourceProgramIds,
    isExtra: true,
  };
}

// The extra blocks of a session, e.g. [{ letter: "E", isExtra: true, exercises: [E1, E2] }].
// Old sessions without `extras` simply have none.
function extraBlocks(session) {
  if (!session || !Array.isArray(session.extras)) return [];
  return session.extras
    .filter((extra) => Array.isArray(extra.exerciseIds) && extra.exerciseIds.length > 0)
    .map((extra) => ({
      letter: extra.block,
      isExtra: true,
      exercises: extra.exerciseIds.map((id, i) => extraExercise(id, extra.block + (i + 1))),
    }));
}

// Keeps the letters in order (E, F, G, …) after a block is added or removed.
function relabelExtras(session) {
  session.extras.forEach((extra, i) => {
    extra.block = String.fromCharCode("E".charCodeAt(0) + i);
  });
}

// Adds the selected exercises: a new block, or the second slot of a single block ("Pair with…").
function addExtras(entries, pairIndex) {
  const session = getOrStartSession();
  if (!Array.isArray(session.extras)) session.extras = [];
  const programCount = PROGRAM[state.day].blocks.length;

  if (pairIndex !== null) {
    session.extras[pairIndex].exerciseIds.push(entries[0].id);
    state.openBlockIndex = programCount + pairIndex;
  } else {
    session.extras.push({ block: "", exerciseIds: entries.map((e) => e.id) });
    relabelExtras(session);
    state.openBlockIndex = programCount + session.extras.length - 1;
  }
  saveSessions(state.sessions);
  state.finishedMessage = null;
  render();
  scrollOpenBlockIntoView();
}

// Takes an extra exercise out of today's workout, including its logged sets (after asking).
function removeExtraExercise(exerciseId) {
  const session = unfinishedSession(state.day);
  if (!session || !Array.isArray(session.extras)) return;

  const loggedCount = session.sets.filter((s) => s.exerciseId === exerciseId).length;
  if (loggedCount > 0) {
    const name = extraExercise(exerciseId, "").name;
    const ok = confirm(
      "Remove " + name + "?\n\nIts " + loggedCount + " logged set" + (loggedCount === 1 ? "" : "s") +
        " from today will be deleted."
    );
    if (!ok) return;
  }

  session.sets = session.sets.filter((s) => s.exerciseId !== exerciseId);
  // A pair that loses one exercise becomes a single; an empty block disappears.
  session.extras = session.extras
    .map((extra) => ({ block: extra.block, exerciseIds: extra.exerciseIds.filter((id) => id !== exerciseId) }))
    .filter((extra) => extra.exerciseIds.length > 0);
  relabelExtras(session);

  const drafts = state.drafts[state.day];
  for (const key of Object.keys(drafts)) {
    if (key.startsWith(exerciseId + "#")) delete drafts[key];
  }
  if (session.sets.length === 0 && session.extras.length === 0) {
    state.sessions = state.sessions.filter((s) => s !== session);
  }
  saveSessions(state.sessions);

  if (state.openBlockIndex >= allBlocks().length) {
    state.openBlockIndex = Math.max(0, nextUnfinishedBlock(-1));
  }
  render();
}

// ---------- History for extras ----------

// The most recent finished session with a logged set for any of these exercise ids.
function latestFinishedWith(ids) {
  let latest = null;
  for (const session of state.sessions) {
    if (!session.finishedAt) continue;
    if (!session.sets.some((s) => ids.includes(s.exerciseId))) continue;
    if (!latest || session.finishedAt > latest.finishedAt) latest = session;
  }
  return latest;
}

// Where an extra's "last time" comes from. Returns { source: "extra" | "program" | null, sets }.
function extraHistory(exercise) {
  const isCustom = exercise.sourceProgramIds.length === 0;

  // 1. Its own history as an extra (program-linked ones only if recent enough).
  const own = latestFinishedWith([exercise.id]);
  if (own) {
    const ageMs = Date.now() - Date.parse(own.finishedAt);
    if (isCustom || ageMs <= EXTRA_HISTORY_MAX_DAYS * ONE_DAY_MS) {
      return { source: "extra", sets: own.sets.filter((s) => s.exerciseId === exercise.id) };
    }
  }

  // 2. A ballpark from the program: the latest session with any of the linked program slots.
  if (!isCustom) {
    const program = latestFinishedWith(exercise.sourceProgramIds);
    if (program) {
      return { source: "program", sets: program.sets.filter((s) => exercise.sourceProgramIds.includes(s.exerciseId)) };
    }
  }

  // 3. Nothing.
  return { source: null, sets: [] };
}

// "Extra sets that push the program": true when, since this program slot's last session,
// an extra linked to it reached the slot's working weight and the top of the slot's range.
function pushedByExtra(exercise) {
  if (exercise.isExtra) return false;

  const lastProgram = lastFinishedSession(state.day);
  if (!lastProgram) return false;
  const programSets = lastProgram.sets.filter((s) => s.exerciseId === exercise.id);
  if (programSets.length === 0) return false;
  const workingWeight = Math.max(...programSets.map((s) => s.weight));

  const linkedIds = state.library.filter((e) => e.sourceProgramIds.includes(exercise.id)).map((e) => e.id);
  if (linkedIds.length === 0) return false;
  const extraSession = latestFinishedWith(linkedIds);
  if (!extraSession || extraSession.finishedAt < lastProgram.finishedAt) return false;

  return extraSession.sets.some(
    (s) => linkedIds.includes(s.exerciseId) && s.weight >= workingWeight && s.reps >= exercise.repMax
  );
}

// ---------- The extras section on the workout screen ----------

function renderExtrasSection(extraBlocksHtml) {
  return `
    <div class="extras-label">Extras</div>
    ${extraBlocksHtml}
    <button class="add-extras-btn" type="button">+ Add exercises</button>`;
}

// ---------- Bottom sheet ----------
// state.sheet is null while closed, otherwise:
// { maxSelect: 1 or 2, pairIndex: null or the extra block to pair with,
//   selected: ["lib:x-…" or "prog:<lower-case name>"], query, formOpen }

function openSheet(maxSelect, pairIndex) {
  state.sheet = {
    maxSelect: maxSelect,
    pairIndex: pairIndex === undefined ? null : pairIndex,
    selected: [],
    query: "",
    formOpen: false,
  };
  // An extra history step, so Android's back button closes the sheet instead of leaving the app.
  history.pushState({ sheet: true }, "");
  renderSheet();
  document.querySelector(".sheet-close").focus();
}

function closeSheet() {
  // Going back fires "popstate", which hides the sheet (see the listener at the bottom).
  if (history.state && history.state.sheet) history.back();
  else hideSheet();
}

function hideSheet() {
  state.sheet = null;
  document.getElementById("sheet-root").innerHTML = "";
}

function renderSheet() {
  const title = state.sheet.maxSelect === 1 ? "Pair with…" : "Add exercises";
  document.getElementById("sheet-root").innerHTML = `
    <div class="sheet-backdrop" data-sheet-action="close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <h2 id="sheet-title" class="sheet-title">${title}</h2>
        <button class="icon-btn sheet-close" type="button" data-sheet-action="close" aria-label="Close">${CLOSE_ICON}</button>
      </div>
      <div class="sheet-body">
        <input id="sheet-search" class="text-input" type="search" autocomplete="off" placeholder="Search"
          aria-label="Search exercises" value="${escapeHtml(state.sheet.query)}" />
        <div id="sheet-lists">${renderSheetLists()}</div>
        <div id="sheet-form">${renderSheetForm()}</div>
      </div>
      <div id="sheet-foot" class="sheet-foot">${renderSheetFoot()}</div>
    </div>`;
}

// Redraws only the lists and the button, so the search field keeps its cursor.
function refreshSheet() {
  document.getElementById("sheet-lists").innerHTML = renderSheetLists();
  document.getElementById("sheet-foot").innerHTML = renderSheetFoot();
}

function renderSheetRow(key, name, sets, lo, hi) {
  const selected = state.sheet.selected.includes(key);
  const full = state.sheet.selected.length >= state.sheet.maxSelect;
  return `
    <button class="sheet-row" type="button" data-sheet-key="${escapeHtml(key)}" aria-pressed="${selected}"
      ${!selected && full ? "disabled" : ""}>
      <span class="sheet-row-text">
        <span class="sheet-row-name">${escapeHtml(name)}</span>
        <span class="sheet-row-meta">${sets} × ${lo}–${hi}</span>
      </span>
      <span class="sheet-check" aria-hidden="true">${selected ? CHECK_ICON : ""}</span>
    </button>`;
}

function renderSheetLists() {
  const query = state.sheet.query.trim().toLowerCase();
  const hidden = namesInTodaysWorkout();
  const shown = (name) => name.toLowerCase().includes(query) && !hidden.has(name.toLowerCase());

  const library = state.library
    .filter((e) => shown(e.name))
    .sort((a, b) => lastUsedAt(b).localeCompare(lastUsedAt(a)));
  const libraryNames = new Set(state.library.map((e) => e.name.toLowerCase()));
  const program = Array.from(programExercisesByName().values()).filter(
    (p) => shown(p.name) && !libraryNames.has(p.name.toLowerCase())
  );

  const emptyText = (text) => `<p class="sheet-empty">${query ? "No matches." : text}</p>`;
  const libraryHtml = library.length
    ? library.map((e) => renderSheetRow("lib:" + e.id, e.name, e.sets, e.lo, e.hi)).join("")
    : emptyText("Exercises you add are saved here.");
  const programHtml = program.length
    ? program.map((p) => renderSheetRow("prog:" + p.name.toLowerCase(), p.name, p.sets, p.lo, p.hi)).join("")
    : emptyText("All program exercises are already in your list or today's workout.");

  return `
    <h3 class="sheet-section-title">Your exercises</h3>
    ${libraryHtml}
    <h3 class="sheet-section-title">From the program</h3>
    ${programHtml}`;
}

function renderSheetForm() {
  if (!state.sheet.formOpen) {
    return `<button class="sheet-new-btn" type="button" data-sheet-action="new">+ New exercise</button>`;
  }
  return `
    <div class="sheet-form">
      <h3 class="sheet-section-title">New exercise</h3>
      <label class="field-label" for="new-name">Name</label>
      <input id="new-name" class="text-input" type="text" autocomplete="off" maxlength="60" />
      <div class="sheet-form-grid">
        <label class="field-label">Sets
          <input id="new-sets" class="text-input" type="text" inputmode="numeric" value="3" />
        </label>
        <label class="field-label">Reps from
          <input id="new-lo" class="text-input" type="text" inputmode="numeric" value="10" />
        </label>
        <label class="field-label">Reps to
          <input id="new-hi" class="text-input" type="text" inputmode="numeric" value="12" />
        </label>
        <label class="field-label">Kg step
          <input id="new-inc" class="text-input" type="text" inputmode="decimal" value="2.5" />
        </label>
      </div>
      <p id="new-error" class="settings-message error" role="alert"></p>
      <button class="action-btn" type="button" data-sheet-action="save-new">Save</button>
    </div>`;
}

function renderSheetFoot() {
  const count = state.sheet.selected.length;
  const label = count === 2 ? "Add pair" : "Add 1 exercise";
  return `<button class="sheet-add-btn" type="button" data-sheet-action="add" ${count === 0 ? "disabled" : ""}>${label}</button>`;
}

function toggleSheetRow(key) {
  const selected = state.sheet.selected;
  if (selected.includes(key)) {
    state.sheet.selected = selected.filter((k) => k !== key);
  } else if (selected.length < state.sheet.maxSelect) {
    selected.push(key);
  }
  refreshSheet();
}

// Checks the "New exercise" form, saves it to the library and selects it.
function saveNewExercise() {
  const value = (id) => document.getElementById(id).value;
  const name = value("new-name").trim();
  const sets = parseReps(value("new-sets"));
  const lo = parseReps(value("new-lo"));
  const hi = parseReps(value("new-hi"));
  const inc = parseWeight(value("new-inc"));

  let error = null;
  if (name === "") error = "Give the exercise a name.";
  else if (findLibraryByName(name)) error = "You already have an exercise called \"" + name + "\".";
  else if (namesInTodaysWorkout().has(name.toLowerCase())) error = "\"" + name + "\" is already in today's workout.";
  else if (sets === null || sets > 6) error = "Sets must be a number from 1 to 6.";
  else if (lo === null || hi === null || hi < lo) error = "Reps: enter a range like 10 to 12.";
  else if (inc === null || inc === 0) error = "Kg step must be more than 0.";
  if (error) {
    document.getElementById("new-error").textContent = error;
    return;
  }

  const entry = addToLibrary({ name: name, sets: sets, lo: lo, hi: hi, inc: inc });
  state.sheet.formOpen = false;
  state.sheet.query = "";
  if (state.sheet.selected.length < state.sheet.maxSelect) state.sheet.selected.push("lib:" + entry.id);
  renderSheet();
}

// The selected rows as library entries (program picks get their own library entry here).
function selectedLibraryEntries() {
  return state.sheet.selected.map((key) =>
    key.startsWith("lib:")
      ? state.library.find((e) => e.id === key.slice(4))
      : libraryEntryForProgram(key.slice(5))
  );
}

function confirmSheet() {
  if (state.sheet.selected.length === 0) return;
  const entries = selectedLibraryEntries();
  const pairIndex = state.sheet.pairIndex;
  closeSheet();
  addExtras(entries, pairIndex);
}

// ---------- Sheet events ----------

const sheetRoot = document.getElementById("sheet-root");

sheetRoot.addEventListener("click", (event) => {
  const row = event.target.closest(".sheet-row");
  if (row) {
    toggleSheetRow(row.dataset.sheetKey);
    return;
  }
  const actionElement = event.target.closest("[data-sheet-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.sheetAction;
  if (action === "close") closeSheet();
  if (action === "add") confirmSheet();
  if (action === "save-new") saveNewExercise();
  if (action === "new") {
    state.sheet.formOpen = true;
    document.getElementById("sheet-form").innerHTML = renderSheetForm();
    document.getElementById("new-name").focus();
  }
});

sheetRoot.addEventListener("input", (event) => {
  if (event.target.id !== "sheet-search") return;
  state.sheet.query = event.target.value;
  refreshSheet();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.sheet) closeSheet();
});

// Android back button (or browser back) while the sheet is open.
window.addEventListener("popstate", () => {
  if (state.sheet) hideSheet();
});
