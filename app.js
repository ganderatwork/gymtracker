// Screen logic and rendering.

const state = {
  // Every workout, loaded from the phone (see storage.js).
  sessions: loadSessions(),
  day: "A",
  // The day the app picked by itself at start. Any other choice shows the MANUAL tag.
  suggested: "A",
  openBlockIndex: 0,
  pickerOpen: false,
  // Typed-but-not-logged text per day, so it survives re-drawing: { weight: "62,5", reps: "8" }
  drafts: { A: {}, B: {}, C: {} },
  // Shown in place of the Finish button right after finishing.
  finishedMessage: null,
  // "workout" or "settings": which screen is showing.
  view: "workout",
  // Result of the last export/import, shown on the settings screen: { text, isError }.
  settingsMessage: null,
};

// ---------- Sessions and history ----------

// The workout in progress for a day, or null.
function unfinishedSession(day) {
  return state.sessions.find((s) => s.day === day && !s.finishedAt) || null;
}

// The most recently finished workout, for one day or (with day = null) for any day.
function lastFinishedSession(day) {
  let latest = null;
  for (const session of state.sessions) {
    if (!session.finishedAt) continue;
    if (day !== null && session.day !== day) continue;
    // ISO dates compare correctly as text.
    if (!latest || session.finishedAt > latest.finishedAt) latest = session;
  }
  return latest;
}

// Next day in the rotation (A → B → C → A). With no history: Mon → A, Wed → B, Fri → C, else A.
function suggestedDay() {
  const last = lastFinishedSession(null);
  if (last) return { A: "B", B: "C", C: "A" }[last.day];

  const weekday = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  if (weekday === 3) return "B";
  if (weekday === 5) return "C";
  return "A";
}

// A set logged today (in the current day's unfinished session), or null.
function findLoggedSet(exerciseId, setNumber) {
  const session = unfinishedSession(state.day);
  if (!session) return null;
  return session.sets.find((s) => s.exerciseId === exerciseId && s.setNumber === setNumber) || null;
}

// "Last time" = the sets for this exercise in the latest finished session of the same day.
function lastTimeSets(exerciseId) {
  const session = lastFinishedSession(state.day);
  return session ? session.sets.filter((s) => s.exerciseId === exerciseId) : [];
}

function lastTimeSet(exerciseId, setNumber) {
  return lastTimeSets(exerciseId).find((s) => s.setNumber === setNumber) || null;
}

function allAtTop(sets, exercise) {
  return sets.length > 0 && sets.every((s) => s.reps >= exercise.repMax);
}

function earnedLastTime(exercise) {
  return allAtTop(lastTimeSets(exercise.id), exercise);
}

function earnedToday(exercise) {
  const session = unfinishedSession(state.day);
  const sets = session ? session.sets.filter((s) => s.exerciseId === exercise.id) : [];
  return allAtTop(sets, exercise);
}

// Weight to pre-fill: same set last time (or last time's first set), plus `inc` if earned.
// Returns null when there is no history.
function prefillWeight(exercise, setNumber) {
  const sets = lastTimeSets(exercise.id);
  if (sets.length === 0) return null;
  const sameSet = sets.find((s) => s.setNumber === setNumber);
  const firstSet = sets.reduce((a, b) => (b.setNumber < a.setNumber ? b : a));
  const base = (sameSet || firstSet).weight;
  if (!earnedLastTime(exercise)) return base;
  // Rounding avoids results like 63.750000001.
  return Math.round((base + exercise.inc) * 100) / 100;
}

// One text key per set, e.g. "A-bench#2".
function setKey(exerciseId, setNumber) {
  return exerciseId + "#" + setNumber;
}

// Makes typed text safe to put back into the page's HTML.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "62,5" or "62.5" → 62.5. Returns null for empty or invalid text.
function parseWeight(text) {
  const cleaned = String(text).trim().replace(",", ".");
  if (cleaned === "") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

// Whole numbers above zero only. Returns null otherwise.
function parseReps(text) {
  const cleaned = String(text).trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const number = Number(cleaned);
  return number > 0 ? number : null;
}

// CSS class for a reps value: amber below the range, green at or above the top.
function repsClass(reps, exercise) {
  if (reps === null) return "";
  if (reps < exercise.repMin) return "reps-low";
  if (reps >= exercise.repMax) return "reps-top";
  return "";
}

function findExercise(exerciseId) {
  for (const block of PROGRAM[state.day].blocks) {
    const found = block.exercises.find((ex) => ex.id === exerciseId);
    if (found) return found;
  }
  return null;
}

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

// Turns 6 and 8 into "6–8" (with an en dash, as in the spec).
function repRange(exercise) {
  return exercise.repMin + "–" + exercise.repMax;
}

// The order sets are done in a block: A1 set 1, A2 set 1, A1 set 2, ...
// When one exercise has more sets, its extra sets come last.
function blockSetOrder(block) {
  const order = [];
  const mostSets = Math.max(...block.exercises.map((ex) => ex.sets));
  for (let setNumber = 1; setNumber <= mostSets; setNumber++) {
    for (const exercise of block.exercises) {
      if (setNumber <= exercise.sets) {
        order.push({ exerciseId: exercise.id, setNumber: setNumber });
      }
    }
  }
  return order;
}

function countSets(block) {
  return block.exercises.reduce((sum, ex) => sum + ex.sets, 0);
}

function countLogged(block) {
  return blockSetOrder(block).filter((s) => findLoggedSet(s.exerciseId, s.setNumber)).length;
}

// The first unlogged set in the block's alternating order, or null when all are logged.
function findActiveSet(block) {
  return blockSetOrder(block).find((s) => !findLoggedSet(s.exerciseId, s.setNumber)) || null;
}

// The next block (after `fromIndex`, wrapping around) that still has unlogged sets.
// Returns -1 when every block is done.
function nextUnfinishedBlock(fromIndex) {
  const blocks = PROGRAM[state.day].blocks;
  for (let step = 1; step <= blocks.length; step++) {
    const index = (fromIndex + step) % blocks.length;
    if (countLogged(blocks[index]) < countSets(blocks[index])) return index;
  }
  return -1;
}

const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

const BACK_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

// Gear icon (from the MIT-licensed Feather icon set).
const GEAR_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3"/>' +
  '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
  "</svg>";

function renderHeader() {
  if (state.view === "settings") {
    document.getElementById("header").innerHTML = `
      <div class="header-row">
        <button class="icon-btn back-btn" type="button" aria-label="Back to workout">${BACK_ICON}</button>
        <h1 class="settings-title">Settings</h1>
      </div>`;
    return;
  }

  const day = PROGRAM[state.day];
  const total = day.blocks.reduce((sum, block) => sum + countSets(block), 0);
  const logged = day.blocks.reduce((sum, block) => sum + countLogged(block), 0);
  const isManual = state.day !== state.suggested;

  // The day list only exists in the page while the picker is open.
  let pickerHtml = "";
  if (state.pickerOpen) {
    const options = Object.keys(PROGRAM)
      .map((key) => {
        const selected = key === state.day;
        return `
          <button class="day-option" type="button" data-day="${key}" aria-pressed="${selected}">
            <span class="day-option-weekday">${PROGRAM[key].weekday}</span>
            <span class="day-option-subtitle">${PROGRAM[key].subtitle}</span>
          </button>`;
      })
      .join("");
    pickerHtml = `<div class="day-picker">${options}</div>`;
  }

  document.getElementById("header").innerHTML = `
    <div class="header-row">
      <button class="day-toggle" type="button" aria-expanded="${state.pickerOpen}"
        aria-label="${day.weekday}, ${day.subtitle}. Change day">
        <span class="day-title">${day.weekday}</span>
        <span class="day-subtitle">– ${day.subtitle}</span>
        ${isManual ? '<span class="manual-tag">Manual</span>' : ""}
        <span class="day-chevron">${CHEVRON_ICON}</span>
      </button>
      <button class="icon-btn settings-btn" type="button" aria-label="Settings">${GEAR_ICON}</button>
    </div>
    <div class="progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(logged / total) * 100}%"></div>
      </div>
      <span class="progress-text">${logged} / ${total} sets</span>
    </div>
    ${pickerHtml}`;
}

function renderSetRow(exercise, setNumber, isActive) {
  const label = exercise.name + ", set " + setNumber;
  const key = setKey(exercise.id, setNumber);
  const loggedSet = findLoggedSet(exercise.id, setNumber);
  const draft = state.drafts[state.day][key] || {};
  const prefill = prefillWeight(exercise, setNumber);

  // Logged set: its saved numbers (read-only). Otherwise: what was typed, or the prefill.
  let weightText = prefill === null ? "" : String(prefill);
  if (draft.weight !== undefined) weightText = draft.weight;
  if (loggedSet) weightText = String(loggedSet.weight);
  const repsText = loggedSet ? String(loggedSet.reps) : draft.reps || "";
  const colorClass = repsClass(parseReps(repsText), exercise);
  const readonly = loggedSet ? "readonly" : "";

  const last = lastTimeSet(exercise.id, setNumber);
  let lastText = "—";
  let lastClass = "set-last empty";
  if (last) {
    lastText = last.weight + " × " + last.reps + (last.reps >= exercise.repMax ? " ✓" : "");
    lastClass = "set-last " + repsClass(last.reps, exercise);
  }

  let rowClass = "set-row set-grid";
  if (isActive) rowClass += " active";
  if (loggedSet) rowClass += " logged";

  return `
    <div class="${rowClass}">
      <span class="set-num">${setNumber}</span>
      <span class="${lastClass}">${lastText}</span>
      <input class="set-input" type="text" inputmode="decimal" autocomplete="off" ${readonly}
        data-key="${key}" data-field="weight" value="${escapeHtml(weightText)}"
        aria-label="${label}, weight in kg" />
      <input class="set-input ${colorClass}" type="text" inputmode="numeric" autocomplete="off" ${readonly}
        data-key="${key}" data-field="reps" value="${escapeHtml(repsText)}"
        placeholder="–" aria-label="${label}, reps" />
      <button class="log-btn" type="button" data-exercise="${exercise.id}" data-set="${setNumber}"
        aria-pressed="${Boolean(loggedSet)}"
        aria-label="${loggedSet ? "Undo" : "Log"} ${label}">${CHECK_ICON}</button>
    </div>`;
}

// The ADD WEIGHT badge. "Earned today" wins when both apply.
function renderBadge(exercise) {
  let text;
  if (earnedToday(exercise)) {
    text = "All sets at top today. Go heavier next time.";
  } else if (earnedLastTime(exercise)) {
    text = "Top reps last time. Now " + prefillWeight(exercise, 1) + " kg.";
  } else {
    return "";
  }
  return `<p class="badge"><span class="badge-label">Add weight</span> ${text}</p>`;
}

function renderExerciseCard(exercise, activeSet) {
  let rowsHtml = "";
  for (let setNumber = 1; setNumber <= exercise.sets; setNumber++) {
    const isActive =
      activeSet !== null &&
      activeSet.exerciseId === exercise.id &&
      activeSet.setNumber === setNumber;
    rowsHtml += renderSetRow(exercise, setNumber, isActive);
  }

  return `
    <section class="card">
      <div class="card-slot">${exercise.slot}</div>
      <h2 class="card-name">${exercise.name}</h2>
      <div class="card-meta">${exercise.sets} × ${repRange(exercise)}</div>
      ${renderBadge(exercise)}
      <div class="col-heads set-grid">
        <span>Set</span>
        <span>Last time</span>
        <span>Kg</span>
        <span>Reps</span>
        <span></span>
      </div>
      ${rowsHtml}
    </section>`;
}

function renderOpenBlock(block) {
  const activeSet = findActiveSet(block);
  const cardsHtml = block.exercises.map((ex) => renderExerciseCard(ex, activeSet)).join("");

  return `
    <div class="block-open">
      <div class="block-head">
        <span class="block-label">Block ${block.letter}</span>
        <span class="block-mode">Alternate</span>
      </div>
      ${cardsHtml}
    </div>`;
}

function renderCollapsedBlock(block, index) {
  const names = block.exercises.map((ex) => ex.name).join(" / ");
  const done = countLogged(block) === countSets(block);
  return `
    <button class="block-collapsed${done ? " done" : ""}" type="button" data-block="${index}"
      aria-label="Open block ${block.letter}: ${names}">
      <span class="block-collapsed-letter">${block.letter}</span>
      <span class="block-collapsed-names">${names}</span>
      <span class="block-collapsed-count">${countLogged(block)}/${countSets(block)}</span>
    </button>`;
}

function renderContent() {
  if (state.view === "settings") {
    renderSettings();
    return;
  }

  const day = PROGRAM[state.day];
  const blocksHtml = day.blocks
    .map((block, index) =>
      index === state.openBlockIndex ? renderOpenBlock(block) : renderCollapsedBlock(block, index)
    )
    .join("");

  const session = unfinishedSession(state.day);
  let finishHtml;
  if (state.finishedMessage && !session) {
    finishHtml = `<p class="finish-done" role="status">${state.finishedMessage}</p>`;
  } else {
    // A session with zero logged sets cannot be finished.
    const canFinish = session && session.sets.length > 0;
    finishHtml = `<button class="finish-btn" type="button" ${canFinish ? "" : "disabled"}>Finish workout</button>`;
  }

  const warningHtml = renderWarning();

  document.getElementById("content").innerHTML = `
    ${warningHtml}
    ${blocksHtml}
    ${finishHtml}`;
}

function renderWarning() {
  return storageWarning ? `<p class="warning" role="alert">${escapeHtml(storageWarning)}</p>` : "";
}

function renderSettingsMessage(section) {
  const message = state.settingsMessage;
  if (!message || message.section !== section) return "";
  return `<p class="settings-message${message.isError ? " error" : ""}" role="status">${escapeHtml(message.text)}</p>`;
}

function renderSyncStatus() {
  const settings = loadSettings();
  const lastSync = settings.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "never";
  const unsynced = state.sessions.filter((s) => s.finishedAt && !s.synced).length;
  return `Last sync: ${lastSync}<br />Unsynced workouts: ${unsynced}`;
}

// Updates only the status text, so a field being typed in isn't redrawn.
function updateSyncStatus() {
  const status = document.getElementById("sync-status");
  if (status) status.innerHTML = renderSyncStatus();
}

function renderSettings() {
  const count = state.sessions.filter((s) => s.finishedAt).length;
  const settings = loadSettings();

  // The file picker is hidden; the "Import backup" button opens it.
  document.getElementById("content").innerHTML = `
    ${renderWarning()}
    <section class="card">
      <h2 class="section-title">Google Sheet sync</h2>
      <label class="field-label" for="script-url">Apps Script URL</label>
      <input id="script-url" class="text-input" type="url" inputmode="url" autocomplete="off"
        spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec"
        value="${escapeHtml(settings.scriptUrl)}" />
      <label class="field-label" for="secret-key">Secret key</label>
      <input id="secret-key" class="text-input" type="password" autocomplete="off"
        spellcheck="false" value="${escapeHtml(settings.secretKey)}" />
      <button class="action-btn" type="button" data-action="test">Test connection</button>
      <p id="sync-status" class="settings-text">${renderSyncStatus()}</p>
      <button class="action-btn" type="button" data-action="restore">Restore from Sheet</button>
      ${renderSettingsMessage("sync")}
    </section>
    <section class="card">
      <h2 class="section-title">Backup</h2>
      <p class="settings-text">${count} finished workout${count === 1 ? "" : "s"} saved on this phone.</p>
      <button class="action-btn" type="button" data-action="export">Export backup</button>
      <button class="action-btn" type="button" data-action="import">Import backup</button>
      <input id="import-file" type="file" accept=".json,application/json" hidden
        aria-label="Backup file to import" />
      ${renderSettingsMessage("backup")}
    </section>`;
}

function render() {
  renderHeader();
  renderContent();
  updateWakeLock();
}

// ---------- Keep the screen on while a workout is in progress ----------

let wakeLock = null;

async function updateWakeLock() {
  const wanted = Boolean(unfinishedSession(state.day)) && document.visibilityState === "visible";
  try {
    if (wanted && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      // The phone drops the lock by itself when the app is hidden.
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } else if (!wanted && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (error) {
    // Not supported or refused; fail silently.
  }
}

document.addEventListener("visibilitychange", updateWakeLock);

function scrollOpenBlockIntoView() {
  const openBlock = document.querySelector(".block-open");
  if (openBlock) openBlock.scrollIntoView({ block: "start" });
}

function vibrate() {
  try {
    navigator.vibrate(30);
  } catch (error) {
    // Not supported on this device; ignore.
  }
}

// Highlights an input that has a missing or invalid value and puts the cursor in it.
function flagInput(key, field) {
  const input = document.querySelector(`.set-input[data-key="${key}"][data-field="${field}"]`);
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  input.focus();
}

// Logs a set, or undoes it if it was already logged. Saves right away.
function toggleLog(exerciseId, setNumber) {
  const key = setKey(exerciseId, setNumber);
  const exercise = findExercise(exerciseId);
  const drafts = state.drafts[state.day];
  const loggedSet = findLoggedSet(exerciseId, setNumber);
  let session = unfinishedSession(state.day);

  if (loggedSet) {
    // Undo: put the numbers back in the inputs so they can be corrected.
    drafts[key] = { weight: String(loggedSet.weight), reps: String(loggedSet.reps) };
    session.sets = session.sets.filter((s) => s !== loggedSet);
    // An empty session is removed, so it isn't resumed later.
    if (session.sets.length === 0) {
      state.sessions = state.sessions.filter((s) => s !== session);
    }
    saveSessions(state.sessions);
    render();
    return;
  }

  // Empty weight → the prefill. Empty reps → last time's reps for this set.
  const draft = drafts[key] || {};
  let weightText = draft.weight === undefined ? "" : draft.weight;
  if (weightText.trim() === "") {
    const prefill = prefillWeight(exercise, setNumber);
    weightText = prefill === null ? "" : String(prefill);
  }
  let repsText = draft.reps || "";
  if (repsText.trim() === "") {
    const last = lastTimeSet(exerciseId, setNumber);
    repsText = last ? String(last.reps) : "";
  }

  const weight = parseWeight(weightText);
  const reps = parseReps(repsText);
  if (weight === null) return flagInput(key, "weight");
  if (reps === null) return flagInput(key, "reps");

  if (!session) {
    const now = new Date().toISOString();
    session = {
      id: now + "-" + state.day,
      day: state.day,
      startedAt: now,
      finishedAt: null,
      synced: false,
      sets: [],
    };
    state.sessions.push(session);
  }
  session.sets.push({
    exerciseId: exerciseId,
    setNumber: setNumber,
    weight: weight,
    reps: reps,
    loggedAt: new Date().toISOString(),
  });
  saveSessions(state.sessions);
  delete drafts[key];
  vibrate();

  // When the open block is complete, open the next unfinished one.
  const openBlock = PROGRAM[state.day].blocks[state.openBlockIndex];
  let movedToNextBlock = false;
  if (countLogged(openBlock) === countSets(openBlock)) {
    const next = nextUnfinishedBlock(state.openBlockIndex);
    if (next !== -1) {
      state.openBlockIndex = next;
      movedToNextBlock = true;
    }
  }

  render();
  if (movedToNextBlock) scrollOpenBlockIntoView();
}

async function finishWorkout() {
  const session = unfinishedSession(state.day);
  if (!session || session.sets.length === 0) return;

  session.finishedAt = new Date().toISOString();
  const saved = saveSessions(state.sessions);
  state.finishedMessage = saved ? "Saved · syncing…" : null;
  state.drafts[state.day] = {};
  state.openBlockIndex = 0;
  render();

  const message = document.querySelector(".finish-done");
  if (message) message.scrollIntoView({ block: "end" });
  if (!saved) return;

  const result = await syncUnsynced();
  if (result.ok) state.finishedMessage = "Saved · synced to Sheet";
  else if (result.notConfigured) state.finishedMessage = "Saved · Sheet sync not set up";
  else state.finishedMessage = "Saved · will sync when online";

  // Only redraw if the message is still showing (no new workout started meanwhile).
  if (state.view === "workout" && !unfinishedSession(state.day)) renderContent();
}

// Sync quietly in the background (on start and when the phone comes back online).
function backgroundSync() {
  syncUnsynced().then(updateSyncStatus);
}

// ---------- Settings: backup ----------

function showView(view) {
  state.view = view;
  state.pickerOpen = false;
  state.settingsMessage = null;
  render();
  content.scrollTop = 0;
}

function showSettingsMessage(text, isError, section) {
  state.settingsMessage = { text: text, isError: isError, section: section || "backup" };
  // A slow test/restore may finish after the user went back to the workout.
  if (state.view === "settings") renderSettings();
}

// After import or restore: if nothing is in progress, jump to the day the rotation now suggests.
function refreshAfterDataChange() {
  state.suggested = suggestedDay();
  if (!state.sessions.some((s) => !s.finishedAt)) {
    state.day = state.suggested;
    state.openBlockIndex = Math.max(0, nextUnfinishedBlock(-1));
  }
}

// ---------- Settings: Google Sheet ----------

function saveSyncFields() {
  const settings = loadSettings();
  settings.scriptUrl = document.getElementById("script-url").value.trim();
  settings.secretKey = document.getElementById("secret-key").value.trim();
  saveSettings(settings);
}

async function testConnection() {
  saveSyncFields();
  const settings = loadSettings();
  if (!isValidScriptUrl(settings.scriptUrl)) {
    showSettingsMessage("The URL should look like https://script.google.com/macros/s/…/exec", true, "sync");
    return;
  }
  showSettingsMessage("Testing…", false, "sync");
  try {
    await callScript(settings, { action: "ping" });
  } catch (error) {
    showSettingsMessage(error.message, true, "sync");
    return;
  }
  showSettingsMessage("Connected to the Sheet.", false, "sync");
  // Good moment to send anything that is waiting.
  backgroundSync();
}

async function restoreFromSheet() {
  saveSyncFields();
  const ok = confirm(
    "Restore workouts from the Google Sheet?\n\n" +
      "Workouts on this phone that are not synced yet are kept as they are."
  );
  if (!ok) return;

  showSettingsMessage("Restoring…", false, "sync");
  let remote;
  try {
    remote = await fetchSheetSessions();
  } catch (error) {
    showSettingsMessage(error.message, true, "sync");
    return;
  }

  const result = mergeFromSheet(state.sessions, remote);
  state.sessions = result.sessions;
  refreshAfterDataChange();
  if (saveSessions(state.sessions)) {
    showSettingsMessage(
      "Restored " + remote.length + " workouts from the Sheet (" + result.addedCount + " new on this phone).",
      false,
      "sync"
    );
  } else {
    showSettingsMessage("Restore failed: could not save on this phone.", true, "sync");
  }
}

function exportBackup() {
  downloadBackup(state.sessions);
  showSettingsMessage("Backup downloaded. Keep it somewhere safe, like Google Drive.", false);
}

async function importBackup(file) {
  let text;
  try {
    text = await file.text();
  } catch (error) {
    showSettingsMessage("Could not read that file.", true);
    return;
  }

  const imported = parseBackup(text);
  if (imported === null) {
    showSettingsMessage("That file is not a gymtracker backup.", true);
    return;
  }

  const merged = mergeSessions(state.sessions, imported);
  const newCount = merged.length - state.sessions.length;
  if (newCount === 0) {
    showSettingsMessage("Nothing new in that file. Everything in it is already on this phone.", false);
    return;
  }

  const ok = confirm(
    "Add " + newCount + " workout" + (newCount === 1 ? "" : "s") + " from this file?\n\n" +
      "Workouts already on this phone are kept as they are."
  );
  if (!ok) return;

  state.sessions = merged;
  refreshAfterDataChange();
  if (saveSessions(state.sessions)) {
    showSettingsMessage("Imported " + newCount + " workout" + (newCount === 1 ? "" : "s") + ".", false);
  } else {
    showSettingsMessage("Import failed: could not save on this phone.", true);
  }
}

// One listener on the header handles all its buttons, even after re-rendering.
document.getElementById("header").addEventListener("click", (event) => {
  if (event.target.closest(".settings-btn")) {
    showView("settings");
    return;
  }
  if (event.target.closest(".back-btn")) {
    showView("workout");
    return;
  }
  const option = event.target.closest(".day-option");
  if (option) {
    state.day = option.dataset.day;
    // Open the first block with sets left (or block A if all are done).
    state.openBlockIndex = Math.max(0, nextUnfinishedBlock(-1));
    state.pickerOpen = false;
    state.finishedMessage = null;
    render();
    return;
  }
  if (event.target.closest(".day-toggle")) {
    state.pickerOpen = !state.pickerOpen;
    renderHeader();
  }
});

const content = document.getElementById("content");

content.addEventListener("click", (event) => {
  const actionButton = event.target.closest(".action-btn");
  if (actionButton) {
    const action = actionButton.dataset.action;
    if (action === "export") exportBackup();
    if (action === "import") document.getElementById("import-file").click();
    if (action === "test") testConnection();
    if (action === "restore") restoreFromSheet();
    return;
  }
  const logButton = event.target.closest(".log-btn");
  if (logButton) {
    toggleLog(logButton.dataset.exercise, Number(logButton.dataset.set));
    return;
  }
  if (event.target.closest(".finish-btn")) {
    finishWorkout();
    return;
  }
  const collapsed = event.target.closest(".block-collapsed");
  if (collapsed) {
    state.openBlockIndex = Number(collapsed.dataset.block);
    renderContent();
    scrollOpenBlockIntoView();
  }
});

// Remember typed text, and recolor the reps input while typing.
content.addEventListener("input", (event) => {
  const input = event.target;
  if (input.id === "script-url" || input.id === "secret-key") {
    saveSyncFields();
    return;
  }
  if (!input.classList.contains("set-input")) return;

  const drafts = state.drafts[state.day];
  const key = input.dataset.key;
  if (!drafts[key]) drafts[key] = {};
  drafts[key][input.dataset.field] = input.value;
  input.removeAttribute("aria-invalid");

  if (input.dataset.field === "reps") {
    const exercise = findExercise(key.split("#")[0]);
    input.classList.remove("reps-low", "reps-top");
    const colorClass = repsClass(parseReps(input.value), exercise);
    if (colorClass) input.classList.add(colorClass);
  }
});

// The hidden file picker for "Import backup".
content.addEventListener("change", (event) => {
  if (event.target.id !== "import-file") return;
  const file = event.target.files[0];
  if (file) importBackup(file);
});

// ---------- Offline support and updates (service worker) ----------

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const banner = document.getElementById("update-banner");
  let updateAccepted = false;

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      const showBanner = () => {
        banner.hidden = false;
      };
      // A new version may already be downloaded and waiting.
      if (registration.waiting && navigator.serviceWorker.controller) showBanner();
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker.addEventListener("statechange", () => {
          // With no controller yet this is the very first install, not an update.
          if (worker.state === "installed" && navigator.serviceWorker.controller) showBanner();
        });
      });
      banner.addEventListener("click", () => {
        if (!registration.waiting) return;
        updateAccepted = true;
        registration.waiting.postMessage("skipWaiting");
      });
      // Look for a new version whenever the app comes back to the front.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    })
    .catch(() => {
      // Not available (e.g. opened as a file); the app still works online.
    });

  // The new version has taken over: reload once to use it.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateAccepted) location.reload();
  });
}

// ---------- Start ----------

requestPersistentStorage();
state.suggested = suggestedDay();

// Resume an unfinished workout if there is one (the most recently started).
const inProgress = state.sessions
  .filter((s) => !s.finishedAt)
  .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
state.day = inProgress ? inProgress.day : state.suggested;
state.openBlockIndex = Math.max(0, nextUnfinishedBlock(-1));

render();
registerServiceWorker();
backgroundSync();
window.addEventListener("online", backgroundSync);
