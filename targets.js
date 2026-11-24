// Per-exercise targets: what you aim for next time (weight × reps), suggestions to raise it,
// and the target line on each exercise card.
// Uses `state`, escapeHtml, parseWeight, parseReps, unfinishedSession and other helpers from app.js,
// and latestFinishedWith/libraryEntryById from extras.js. They are only used inside functions,
// which run after every file has loaded.
//
// Who has which target:
//   - Program exercises and custom extras have their own target, stored under their id.
//   - Extras picked from the program ("program-sourced", non-empty sourceProgramIds) never have one.
//     They show the program's target read-only (see programTargetFor()).

// ---------- Reading targets ----------

// True if this card keeps its own target (program exercise or custom extra).
function ownsTarget(exercise) {
  return !isProgramSourced(exercise);
}

// The saved target { weight, reps } for an exercise id, or null if it has none (yet).
function ownTarget(exerciseId) {
  const entry = state.targets[exerciseId];
  return entry && entry.weight !== null ? { weight: entry.weight, reps: entry.reps } : null;
}

// For a program-sourced extra: the linked program slot whose target has the lowest weight
// (on a tie, the fewest reps). Slots without a target are ignored. Returns { weight, reps, id }
// (`id` = which slot it came from), or null if none has one.
function programTargetFor(exercise) {
  let best = null;
  for (const id of exercise.sourceProgramIds) {
    const t = ownTarget(id);
    if (!t) continue;
    if (!best || t.weight < best.weight || (t.weight === best.weight && t.reps < best.reps)) {
      best = { weight: t.weight, reps: t.reps, id: id };
    }
  }
  return best;
}

// The target as it is right now (what the target line shows), or null.
function currentTargetFor(exercise) {
  return ownsTarget(exercise) ? ownTarget(exercise.id) : programTargetFor(exercise);
}

// The target that drives this card's weight prefill, rep colors and suggestions, or null.
// Once an exercise has a logged set today, it keeps the target it had at that moment
// (saved in the session's `targetsUsed`). So raising the target after hitting it doesn't
// take the green away from today's sets; the new target counts from the next workout.
function targetFor(exercise) {
  const session = unfinishedSession(state.day);
  if (session && session.targetsUsed && exercise.id in session.targetsUsed) {
    return session.targetsUsed[exercise.id];
  }
  return currentTargetFor(exercise);
}

// Called when an exercise gets its first logged set today: remembers its target for the rest of the workout.
function freezeTarget(session, exercise) {
  if (!session.targetsUsed) session.targetsUsed = {};
  const t = currentTargetFor(exercise);
  session.targetsUsed[exercise.id] = t ? { weight: t.weight, reps: t.reps } : null;
}

// Called when an exercise has no logged sets left today: it follows the current target again.
function unfreezeTarget(session, exerciseId) {
  if (session.targetsUsed) delete session.targetsUsed[exerciseId];
}

// "3 × 11 · 22.5 kg"
function formatTarget(sets, weight, reps) {
  return sets + " × " + reps + " · " + weight + " kg";
}

// ---------- Saving ----------

// Saves targets on the phone. `targetChanged` = a real target changed, so it must also go to the Sheet.
function persistTargets(targetChanged) {
  saveTargets(state.targets);
  if (targetChanged) {
    markTargetsChanged();
    backgroundSync();
  }
}

function emptyTargetEntry() {
  return { weight: null, reps: null, changedAt: null, pending: null, dismissedFrom: null };
}

// Sets a target by hand (or by Accept). Any waiting suggestion is cleared.
function setTarget(exerciseId, weight, reps) {
  const entry = state.targets[exerciseId] || emptyTargetEntry();
  entry.weight = weight;
  entry.reps = reps;
  entry.changedAt = new Date().toISOString();
  entry.pending = null;
  state.targets[exerciseId] = entry;
  persistTargets(true);
}

// Removes an entry that holds nothing any more (no target, no suggestion, no dismissal).
function tidyTargetEntry(exerciseId) {
  const entry = state.targets[exerciseId];
  if (entry && entry.weight === null && !entry.pending && !entry.dismissedFrom) delete state.targets[exerciseId];
}

// ---------- One-time setup from history ----------

// Runs once, the first time there are finished workouts: every program slot and custom extra
// with history gets a target from the last finished session it was logged in:
//   weight = the heaviest logged weight, reps = the average reps of all its sets, rounded up.
// A program slot's history includes its old ids (`previousIds` in program.js).
// Existing targets (e.g. restored from the Sheet) are never overwritten.
function initTargets() {
  if (targetsInitialized()) return;
  if (!state.sessions.some((s) => s.finishedAt)) return; // nothing to learn from yet

  // [id, ids whose sets count as its history]
  const list = allProgramExercises().map((ex) => [ex.id, historyIds(ex)]);
  for (const entry of state.library) {
    if (entry.sourceProgramIds.length === 0) list.push([entry.id, [entry.id]]);
  }

  let created = 0;
  for (const [id, ids] of list) {
    if (ownTarget(id)) continue;
    const session = latestFinishedWith(ids);
    if (!session) continue;
    const sets = session.sets.filter((s) => ids.includes(s.exerciseId));
    const weight = Math.max(...sets.map((s) => s.weight));
    const averageReps = sets.reduce((sum, s) => sum + s.reps, 0) / sets.length;
    const entry = state.targets[id] || emptyTargetEntry();
    entry.weight = weight;
    entry.reps = Math.ceil(averageReps);
    entry.changedAt = session.finishedAt;
    state.targets[id] = entry;
    created++;
  }

  saveTargets(state.targets);
  if (created > 0) markTargetsChanged();
  markTargetsInitialized();
}

// ---------- Suggestions ----------

// What to suggest for this exercise from the current session, or null.
// Only once every set is complete. Priority: R1, then R2, then R3.
function computeSuggestion(exercise, session) {
  const sets = [];
  for (let setNumber = 1; setNumber <= exercise.sets; setNumber++) {
    const set = session.sets.find((s) => s.exerciseId === exercise.id && s.setNumber === setNumber);
    if (!set) return null;
    sets.push(set);
  }
  // The target this workout started the exercise with (see targetFor()).
  const target = targetFor(exercise);
  const suggestion = ruleSuggestion(exercise, sets, target);
  // Only suggest something above the target as it is now. Without this, raising the target
  // (e.g. with Accept) would bring the same suggestion straight back.
  const now = ownTarget(exercise.id);
  if (suggestion && now && !isHigher(suggestion, now)) return null;
  return suggestion;
}

// More weight, or the same weight with more reps.
function isHigher(a, b) {
  return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
}

// R1, R2 or R3 for these complete sets against `target` (which may be null).
function ruleSuggestion(exercise, sets, target) {
  const first = sets[0];

  // R3 – no target yet: suggest the first set.
  if (!target) return { weight: first.weight, reps: first.reps };
  // R1 – new weight: the first set used more than the target weight.
  if (first.weight > target.weight) return { weight: first.weight, reps: first.reps };
  // R2 – one more rep: every set at the target weight with at least the target reps,
  // and the target is still below the top of the range.
  const allAtTarget = sets.every((s) => s.weight === target.weight && s.reps >= target.reps);
  if (allAtTarget && target.reps < exercise.repMax) return { weight: target.weight, reps: target.reps + 1 };
  // Lower weights never give a suggestion; lowering a target is done by hand.
  return null;
}

// Called after every set change on a card. Creates, replaces or removes the suggestion
// that belongs to the current session. Suggestions from earlier sessions stay until resolved
// (unless today gives a new one, which replaces them).
function evaluateSuggestion(exercise) {
  if (!ownsTarget(exercise)) return;
  const session = unfinishedSession(state.day);
  const sessionId = session ? session.id : null;
  const suggestion = session ? computeSuggestion(exercise, session) : null;
  let entry = state.targets[exercise.id];

  if (suggestion && !(entry && entry.dismissedFrom === sessionId)) {
    if (!entry) entry = state.targets[exercise.id] = emptyTargetEntry();
    const p = entry.pending;
    const same = p && p.fromSessionId === sessionId && p.weight === suggestion.weight && p.reps === suggestion.reps;
    if (same) return;
    entry.pending = { weight: suggestion.weight, reps: suggestion.reps, fromSessionId: sessionId };
    persistTargets(false);
    return;
  }

  // No suggestion now: drop one that came from this session (its rule no longer holds),
  // or from a workout that no longer exists (e.g. every set of it was cleared).
  if (entry && entry.pending) {
    const from = entry.pending.fromSessionId;
    if (from === sessionId || !state.sessions.some((s) => s.id === from)) {
      entry.pending = null;
      tidyTargetEntry(exercise.id);
      persistTargets(false);
    }
  }
}

function acceptSuggestion(exerciseId) {
  const entry = state.targets[exerciseId];
  if (!entry || !entry.pending) return;
  setTarget(exerciseId, entry.pending.weight, entry.pending.reps);
}

// ×: forget the suggestion. The same workout won't suggest again for this exercise.
function dismissSuggestion(exerciseId) {
  const entry = state.targets[exerciseId];
  if (!entry || !entry.pending) return;
  entry.dismissedFrom = entry.pending.fromSessionId;
  entry.pending = null;
  tidyTargetEntry(exerciseId);
  persistTargets(false);
}

// ---------- Card UI ----------
// state.targetEdit is null, or { exerciseId, weight, reps } (the text in the edit row).

function renderTargetArea(exercise) {
  const editing = state.targetEdit && state.targetEdit.exerciseId === exercise.id;
  if (editing) return renderTargetEditRow(exercise);

  const id = escapeHtml(exercise.id);
  const name = escapeHtml(exercise.name);

  // Program-sourced extra: the program's target, read-only. No suggestions.
  if (!ownsTarget(exercise)) {
    const t = programTargetFor(exercise);
    return t ? `<p class="target-line">Program target ${formatTarget(exercise.sets, t.weight, t.reps)}</p>` : "";
  }

  const t = ownTarget(exercise.id);
  const text = t ? "Target " + formatTarget(exercise.sets, t.weight, t.reps) : "No target yet";
  let html = `<button class="target-btn" type="button" data-target-edit="${id}"
    aria-label="${escapeHtml(text)}. Edit target for ${name}">${text}</button>`;

  const entry = state.targets[exercise.id];
  if (entry && entry.pending) {
    const p = entry.pending;
    html += `
      <div class="suggestion" role="status">
        <span class="suggestion-text">Next target: ${formatTarget(exercise.sets, p.weight, p.reps)}</span>
        <button class="suggestion-btn accept" type="button" data-target-accept="${id}"
          aria-label="Accept next target for ${name}">Accept</button>
        <button class="suggestion-btn" type="button" data-target-edit-pending="${id}"
          aria-label="Edit next target for ${name}">Edit</button>
        <button class="suggestion-btn dismiss" type="button" data-target-dismiss="${id}"
          aria-label="Dismiss next target for ${name}">${CLOSE_ICON}</button>
      </div>`;
  }
  return html;
}

function renderTargetEditRow(exercise) {
  const edit = state.targetEdit;
  const name = escapeHtml(exercise.name);
  return `
    <div class="target-edit" data-target-row="${escapeHtml(exercise.id)}">
      <span class="target-edit-label">Target ${exercise.sets} ×</span>
      <input class="target-input" type="text" inputmode="numeric" autocomplete="off" data-target-field="reps"
        value="${escapeHtml(edit.reps)}" placeholder="reps" aria-label="${name}, target reps" />
      <span class="target-edit-label">·</span>
      <input class="target-input" type="text" inputmode="decimal" autocomplete="off" data-target-field="weight"
        value="${escapeHtml(edit.weight)}" placeholder="kg" aria-label="${name}, target weight in kg" />
      <span class="target-edit-label">kg</span>
    </div>`;
}

// Opens the edit row, prefilled with the current target (or the suggestion, for "Edit").
function openTargetEdit(exerciseId, fromSuggestion) {
  const entry = state.targets[exerciseId];
  const source = fromSuggestion && entry && entry.pending ? entry.pending : ownTarget(exerciseId);
  state.targetEdit = {
    exerciseId: exerciseId,
    weight: source ? String(source.weight) : "",
    reps: source ? String(source.reps) : "",
  };
  refreshTargetArea(exerciseId);
  const input = document.querySelector(`[data-target-row="${CSS.escape(exerciseId)}"] [data-target-field="reps"]`);
  if (input) input.focus();
}

// Closes the edit row. With two valid numbers the target is saved; otherwise nothing changes.
function commitTargetEdit() {
  const edit = state.targetEdit;
  if (!edit) return;
  state.targetEdit = null;
  const weight = parseWeight(edit.weight);
  const reps = parseReps(edit.reps);
  if (weight !== null && reps !== null) setTarget(edit.exerciseId, weight, reps);
  refreshTargetArea(edit.exerciseId);
  refreshCardPrefills(edit.exerciseId);
}

// Redraws only the target area of one card, so nothing else on the screen moves.
function refreshTargetArea(exerciseId) {
  const card = document.querySelector(`.card[data-card="${CSS.escape(exerciseId)}"]`);
  const exercise = findExercise(exerciseId);
  if (!card || !exercise) return;
  card.querySelector(".card-target").innerHTML = renderTargetArea(exercise);
}

// After a target change, untouched weight fields (nothing typed, not logged) show the new prefill,
// and the reps colors follow the new target reps. Exercises already started today keep their
// old target for both (see targetFor()), so nothing changes on those.
function refreshCardPrefills(exerciseId) {
  const card = document.querySelector(`.card[data-card="${CSS.escape(exerciseId)}"]`);
  const exercise = findExercise(exerciseId);
  if (!card || !exercise) return;
  const drafts = state.drafts[state.day];
  for (let setNumber = 1; setNumber <= exercise.sets; setNumber++) {
    const key = setKey(exercise.id, setNumber);
    const row = card.querySelector(`[data-row="${key}"]`);
    const weightInput = row.querySelector('[data-field="weight"]');
    const untouched = !findLoggedSet(exercise.id, setNumber) && !(drafts[key] && drafts[key].weight !== undefined);
    if (untouched && document.activeElement !== weightInput) {
      const prefill = prefillWeight(exercise, setNumber);
      weightInput.value = prefill === null ? "" : String(prefill);
    }
    const repsInput = row.querySelector('[data-field="reps"]');
    repsInput.classList.remove("reps-low", "reps-top");
    const colorClass = inputRepsClass(parseReps(repsInput.value), exercise);
    if (colorClass) repsInput.classList.add(colorClass);
  }
}

// ---------- Card events ----------

const targetContent = document.getElementById("content");

targetContent.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-target-edit]");
  if (editButton) {
    openTargetEdit(editButton.dataset.targetEdit, false);
    return;
  }
  const editPending = event.target.closest("[data-target-edit-pending]");
  if (editPending) {
    openTargetEdit(editPending.dataset.targetEditPending, true);
    return;
  }
  const accept = event.target.closest("[data-target-accept]");
  if (accept) {
    acceptSuggestion(accept.dataset.targetAccept);
    refreshTargetArea(accept.dataset.targetAccept);
    refreshCardPrefills(accept.dataset.targetAccept);
    return;
  }
  const dismiss = event.target.closest("[data-target-dismiss]");
  if (dismiss) {
    dismissSuggestion(dismiss.dataset.targetDismiss);
    refreshTargetArea(dismiss.dataset.targetDismiss);
  }
});

// Remember what is typed, so a redraw doesn't lose it.
targetContent.addEventListener("input", (event) => {
  const field = event.target.dataset.targetField;
  if (field && state.targetEdit) state.targetEdit[field] = event.target.value;
});

targetContent.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.dataset.targetField) {
    event.preventDefault();
    commitTargetEdit();
  }
});

// Tapping anywhere outside the edit row commits it. Moving between its two fields does not.
targetContent.addEventListener("focusout", (event) => {
  const row = event.target.closest("[data-target-row]");
  if (!row || !state.targetEdit) return;
  if (event.relatedTarget && row.contains(event.relatedTarget)) return;
  commitTargetEdit();
});
