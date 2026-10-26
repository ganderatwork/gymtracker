// Screen logic and rendering.
// Milestone 1: draws Day A from PROGRAM. Nothing is interactive or saved yet.

const state = {
  day: "A",
  openBlockIndex: 0,
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

function formatToday() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function renderHeader() {
  const day = PROGRAM[state.day];
  const total = day.blocks.reduce((sum, block) => sum + countSets(block), 0);
  const logged = 0;

  const tabsHtml = Object.keys(PROGRAM)
    .map((key) => {
      const selected = key === state.day;
      return `
        <button class="tab" type="button" aria-pressed="${selected}">
          <span class="tab-weekday">${PROGRAM[key].weekday}</span>
          <span class="tab-day">${PROGRAM[key].title}</span>
        </button>`;
    })
    .join("");

  document.getElementById("header").innerHTML = `
    <div class="date-line">${formatToday()} · <span>next in rotation</span></div>
    <h1 class="day-title">${day.title}</h1>
    <p class="day-subtitle">${day.subtitle}</p>
    <div class="progress">
      <div class="progress-text">
        <span>Sets</span>
        <span>${logged} / ${total}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(logged / total) * 100}%"></div>
      </div>
    </div>
    <div class="tabs">${tabsHtml}</div>`;
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

render();
