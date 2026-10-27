// TEMPORARY test helper. Delete this file and its <script> tag when done.
// It only shows up when the address ends with ?debug (e.g. http://localhost:8000/?debug).

(function () {
  if (!new URLSearchParams(location.search).has("debug")) return;

  const DAY_MS = 24 * 60 * 60 * 1000;

  // Builds one finished fake session. Exercises cycle through three patterns:
  //   0: every set at the top of the range  → ADD WEIGHT badge, green "✓"
  //   1: bottom of range, last set below it → amber last-time value
  //   2: only set 1 logged                  → later sets prefill from set 1
  function fakeSession(day, daysAgo) {
    const finished = new Date(Date.now() - daysAgo * DAY_MS);
    const started = new Date(finished.getTime() - 60 * 60 * 1000);
    const sets = [];
    let index = 0;

    for (const block of PROGRAM[day].blocks) {
      for (const exercise of block.exercises) {
        const pattern = index % 3;
        const weight = 20 + index * 5;
        index++;

        for (let setNumber = 1; setNumber <= exercise.sets; setNumber++) {
          if (pattern === 2 && setNumber > 1) continue;
          let reps = exercise.repMax;
          if (pattern === 1) reps = setNumber === exercise.sets ? exercise.repMin - 1 : exercise.repMin;
          if (pattern === 2) reps = exercise.repMin + 1;
          sets.push({ exerciseId: exercise.id, setNumber, weight, reps, loggedAt: finished.toISOString() });
        }
      }
    }

    return {
      id: "debug-" + started.toISOString() + "-" + day,
      day: day,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      synced: true, // never send fake data to the Sheet later
      sets: sets,
    };
  }

  function fillFakeHistory() {
    const sessions = loadSessions().filter((s) => !s.id.startsWith("debug-"));
    // A a week ago, B 5 days ago, C 3 days ago → the rotation suggests A next.
    const a = fakeSession("A", 7);
    const b = fakeSession("B", 5);
    const c = fakeSession("C", 3);
    // An older Monday, only there to hold an extra that is more than 30 days old.
    const oldA = fakeSession("A", 40);

    // Extras. Library entries with these names are reused if they already exist.
    const library = loadExercises();
    const crunch = ensureEntry(library, "Cable crunch", 3, 12, 15, 2.5, []);
    const pecDeck = ensureEntry(library, "Pec deck", 2, 12, 15, 2.5, ["C-pec-deck"]);
    const facePull = ensureEntry(library, "Face pull", 3, 12, 15, 2.5, ["B-face-pull"]);
    const triceps = ensureEntry(library, "Overhead cable triceps extension", 2, 10, 12, 2.5, ["A-oh-triceps"]);
    saveExercises(library);

    // Recent extra (7 days): Pec deck on Monday uses its own history, no PROGRAM tag.
    addExtra(a, "E", pecDeck, 30, [15, 13]);
    // Custom extra at the top of its range: Cable crunch shows ADD WEIGHT.
    addExtra(c, "E", crunch, 40, [15, 15, 15]);
    // Beats Monday's triceps (55 kg × 12 is the program's weight and top reps):
    // Monday's D2 card shows "Top reps as an extra. Now 57.5 kg."
    addExtra(c, "F", triceps, 55, [12]);
    // Old extra (40 days): Face pull falls back to the program's numbers and shows the PROGRAM tag.
    addExtra(oldA, "E", facePull, 25, [12, 12, 12]);

    sessions.push(oldA, a, b, c);
    saveSessions(sessions);
    location.reload();
  }

  function ensureEntry(library, name, sets, lo, hi, inc, sourceProgramIds) {
    const existing = library.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const entry = {
      id: makeExerciseId(name, library),
      name: name,
      sets: sets,
      lo: lo,
      hi: hi,
      inc: inc,
      sourceProgramIds: sourceProgramIds,
      createdAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
    };
    library.push(entry);
    return entry;
  }

  // Adds an extra block with one exercise and its logged sets to a fake session.
  function addExtra(session, letter, entry, weight, repsPerSet) {
    session.extras = session.extras || [];
    session.extras.push({ block: letter, exerciseIds: [entry.id] });
    repsPerSet.forEach((reps, i) => {
      session.sets.push({
        exerciseId: entry.id,
        setNumber: i + 1,
        weight: weight,
        reps: reps,
        loggedAt: session.finishedAt,
      });
    });
  }

  function clearAllData() {
    if (!confirm("Delete ALL saved workouts and extra exercises on this device?")) return;
    try {
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(EXERCISES_KEY);
    } catch (error) {
      // ignore
    }
    location.reload();
  }

  const panel = document.createElement("div");
  panel.className = "debug-panel";
  panel.innerHTML = `
    <button type="button" data-action="fill">Debug: fake history</button>
    <button type="button" data-action="clear">Debug: clear all</button>`;
  panel.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (action === "fill") fillFakeHistory();
    if (action === "clear") clearAllData();
  });
  document.body.appendChild(panel);
  // Room so the panel doesn't cover the Finish button.
  document.getElementById("content").style.paddingBottom = "80px";
})();
