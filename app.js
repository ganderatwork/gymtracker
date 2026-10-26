// Screen logic and rendering.
// Milestone 1: draws Day A from PROGRAM. Nothing is interactive or saved yet.

// Mon → A, Wed → B, Fri → C, any other weekday → A.
// (Later, the rotation from finished sessions will take priority.)
function suggestedDay() {
  const weekday = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
  if (weekday === 3) return "B";
  if (weekday === 5) return "C";
  return "A";
}

const state = {
  day: suggestedDay(),
  openBlockIndex: 0,
  pickerOpen: false,
};

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

const CHEVRON_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
  '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  "</svg>";

function renderHeader() {
  const day = PROGRAM[state.day];
  const total = day.blocks.reduce((sum, block) => sum + countSets(block), 0);
  const logged = 0;
  const isManual = state.day !== suggestedDay();

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
    <button class="day-toggle" type="button" aria-expanded="${state.pickerOpen}"
      aria-label="${day.weekday}, ${day.subtitle}. Change day">
      <span class="day-title">${day.weekday}</span>
      <span class="day-subtitle">– ${day.subtitle}</span>
      ${isManual ? '<span class="manual-tag">Manual</span>' : ""}
      <span class="day-chevron">${CHEVRON_ICON}</span>
    </button>
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
  return `
    <div class="set-row set-grid${isActive ? " active" : ""}">
      <span class="set-num">${setNumber}</span>
      <span class="set-last">—</span>
      <input class="set-input" type="text" inputmode="decimal" autocomplete="off"
        aria-label="${label}, weight in kg" />
      <input class="set-input" type="text" inputmode="numeric" autocomplete="off"
        placeholder="–" aria-label="${label}, reps" />
      <button class="log-btn" type="button" aria-label="Log ${label}">${CHECK_ICON}</button>
    </div>`;
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
  // With nothing logged yet, the active set is simply the first one in order.
  const activeSet = blockSetOrder(block)[0] || null;
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

function renderCollapsedBlock(block) {
  const names = block.exercises.map((ex) => ex.name).join(" / ");
  return `
    <button class="block-collapsed" type="button" aria-label="Open block ${block.letter}: ${names}">
      <span class="block-collapsed-letter">${block.letter}</span>
      <span class="block-collapsed-names">${names}</span>
      <span class="block-collapsed-count">0/${countSets(block)}</span>
    </button>`;
}

function renderContent() {
  const day = PROGRAM[state.day];
  const blocksHtml = day.blocks
    .map((block, index) =>
      index === state.openBlockIndex ? renderOpenBlock(block) : renderCollapsedBlock(block)
    )
    .join("");

  // A session with zero logged sets cannot be finished, so the button starts disabled.
  document.getElementById("content").innerHTML = `
    ${blocksHtml}
    <button class="finish-btn" type="button" disabled>Finish workout</button>`;
}

function render() {
  renderHeader();
  renderContent();
}

// One listener on the header handles all its buttons, even after re-rendering.
document.getElementById("header").addEventListener("click", (event) => {
  const option = event.target.closest(".day-option");
  if (option) {
    state.day = option.dataset.day;
    state.openBlockIndex = 0;
    state.pickerOpen = false;
    render();
    return;
  }
  if (event.target.closest(".day-toggle")) {
    state.pickerOpen = !state.pickerOpen;
    renderHeader();
  }
});

render();
