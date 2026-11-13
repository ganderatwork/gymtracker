// Free-text notes per exercise, e.g. "Smith bench: notch 3" or "kg without the bar".
// Shown at the bottom of each exercise card; tap to edit.
// Uses `state`, escapeHtml, findExercise and backgroundSync from app.js, programTargetFor from
// targets.js and isProgramSourced from extras.js. They are only used inside functions,
// which run after every file has loaded.
//
// Who has which note:
//   - Program exercises and custom extras have their own note, stored under their id.
//   - Extras picked from the program show the program slot's note read-only.

const NOTE_MAX_LENGTH = 500;

// Pencil icon (from the MIT-licensed Feather icon set).
const PENCIL_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>' +
  "</svg>";

// The note text for an exercise id, or "" if it has none.
function noteText(exerciseId) {
  const note = state.notes[exerciseId];
  return note ? note.text : "";
}

// For a program-sourced extra: the note of the slot its program target comes from.
// If that slot has no note (or there is no target), the first linked slot with a note.
function programNoteFor(exercise) {
  const target = programTargetFor(exercise);
  const ids = target ? [target.id].concat(exercise.sourceProgramIds) : exercise.sourceProgramIds;
  for (const id of ids) {
    if (noteText(id)) return noteText(id);
  }
  return "";
}

// Saves a note (an empty text deletes it) and sends it to the Sheet at the next sync.
function setNote(exerciseId, text) {
  state.notes[exerciseId] = { text: text, changedAt: new Date().toISOString() };
  saveNotes(state.notes);
  markNotesChanged();
  backgroundSync();
}

// ---------- Card UI ----------
// state.noteEdit is null, or { exerciseId, text } while the text box is open.

function renderNoteArea(exercise) {
  const id = escapeHtml(exercise.id);
  const name = escapeHtml(exercise.name);

  if (isProgramSourced(exercise)) {
    const text = programNoteFor(exercise);
    if (!text) return "";
    return `<p class="note-text note-readonly"><span class="note-label">Program note</span> ${escapeHtml(text)}</p>`;
  }

  if (state.noteEdit && state.noteEdit.exerciseId === exercise.id) {
    return `<textarea class="note-input" data-note-input="${id}" rows="3" maxlength="${NOTE_MAX_LENGTH}"
      aria-label="${name}, note">${escapeHtml(state.noteEdit.text)}</textarea>`;
  }

  const text = noteText(exercise.id);
  if (text) {
    return `<button class="note-btn" type="button" data-note-edit="${id}"
      aria-label="Note for ${name}: ${escapeHtml(text)}. Tap to edit"><span class="note-text">${escapeHtml(text)}</span></button>`;
  }
  return `<button class="note-btn note-empty" type="button" data-note-edit="${id}"
    aria-label="Add note for ${name}">${PENCIL_ICON}<span>Add note</span></button>`;
}

// Redraws only the note area of one card.
function refreshNoteArea(exerciseId) {
  const card = document.querySelector(`.card[data-card="${CSS.escape(exerciseId)}"]`);
  const exercise = findExercise(exerciseId);
  if (!card || !exercise) return;
  card.querySelector(".card-note").innerHTML = renderNoteArea(exercise);
}

function openNoteEdit(exerciseId) {
  state.noteEdit = { exerciseId: exerciseId, text: noteText(exerciseId) };
  refreshNoteArea(exerciseId);
  const box = document.querySelector(`[data-note-input="${CSS.escape(exerciseId)}"]`);
  if (box) {
    box.focus();
    // Put the cursor at the end, so you can add to what's there.
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

// Closes the text box and saves it if the text changed. Clearing all the text deletes the note.
function commitNoteEdit() {
  const edit = state.noteEdit;
  if (!edit) return;
  state.noteEdit = null;
  const text = edit.text.trim().slice(0, NOTE_MAX_LENGTH);
  if (text !== noteText(edit.exerciseId)) setNote(edit.exerciseId, text);
  refreshNoteArea(edit.exerciseId);
}

// ---------- Card events ----------

const noteContent = document.getElementById("content");

noteContent.addEventListener("click", (event) => {
  const button = event.target.closest("[data-note-edit]");
  if (button) openNoteEdit(button.dataset.noteEdit);
});

// Remember what is typed, so a redraw doesn't lose it.
noteContent.addEventListener("input", (event) => {
  if (event.target.dataset.noteInput && state.noteEdit) state.noteEdit.text = event.target.value;
});

// Tapping anywhere outside the text box saves it. (Enter just adds a new line.)
noteContent.addEventListener("focusout", (event) => {
  if (event.target.dataset.noteInput) commitNoteEdit();
});
