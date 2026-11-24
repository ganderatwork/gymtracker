// TEMPORARY test helper. Delete this file and its <script> tag when done.
// It only shows up when the address ends with ?debug (e.g. http://localhost:8000/?debug).

(function () {
  if (!new URLSearchParams(location.search).has("debug")) return;

  const DAY_MS = 24 * 60 * 60 * 1000;

  // Builds one finished fake session. Exercises cycle through three patterns:
  //   0: every set at the top of the range  → ADD WEIGHT badge, green "✓"
  //   1: bottom of range, last set below it → amber last-time value
  //   2: only set 1 logged
  // Exercises listed in `skipIds` get no sets at all (so they have no history and no target).
  function fakeSession(day, daysAgo, skipIds) {
    const finished = new Date(Date.now() - daysAgo * DAY_MS);
    const started = new Date(finished.getTime() - 60 * 60 * 1000);
    const sets = [];
    let index = 0;

    for (const block of PROGRAM[day].blocks) {
      for (const exercise of block.exercises) {
        const pattern = index % 3;
        const weight = 20 + index * 5;
        index++;
        if (skipIds && skipIds.includes(exercise.id)) continue;

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

  // An old 3-day-program Friday ("C") workout, logged under the retired ids. Its sets show up as
  // "last time" for the slots that took over those ids (`previousIds` in program.js).
  function fakeOldFriday(daysAgo) {
    const finished = new Date(Date.now() - daysAgo * DAY_MS);
    const started = new Date(finished.getTime() - 60 * 60 * 1000);
    const sets = [];
    const add = (exerciseId, weight, repsPerSet) => {
      repsPerSet.forEach((reps, i) => {
        sets.push({ exerciseId, setNumber: i + 1, weight, reps, loggedAt: finished.toISOString() });
      });
    };
    add("C-pec-deck", 35, [15, 15, 15]); // top of Pec deck's 12–15 → ADD WEIGHT on B's Pec deck
    return {
      id: "debug-" + started.toISOString() + "-C",
      day: "C",
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      synced: true,
      sets: sets,
    };
  }

  function fillFakeHistory() {
    const ok = confirm(
      "Add fake workouts, and REPLACE all targets on this device with targets made from them?\n\n" +
        "Best used on a test device or a local copy, not on your real phone data."
    );
    if (!ok) return;

    const sessions = loadSessions().filter((s) => !s.id.startsWith("debug-"));
    // Old Friday 10 days ago, A a week ago, B 3 days ago → the app suggests A next.
    // A's overhead triceps (E2) is left out, so it has no target: test R3 there.
    // B's Pec deck is left out, so its "last time" and target come from the old Friday workout.
    const c = fakeOldFriday(10);
    const a = fakeSession("A", 7, ["A-oh-triceps"]);
    const b = fakeSession("B", 3, ["B-pec-deck"]);

    // Extras. Library entries with these names are reused if they already exist.
    const library = loadExercises();
    const crunch = ensureEntry(library, "Cable crunch", 3, 12, 15, []);
    const pecDeck = ensureEntry(library, "Pec deck", 3, 12, 15, ["B-pec-deck"]);
    ensureEntry(library, "Cable lateral raise", 3, 12, 20, ["A-cable-lateral"]);
    saveExercises(library);

    // Pec deck as an extra on A: last time from its own use, target from B's program slot.
    addExtra(a, "F", pecDeck, 30, [15, 13, 13]);
    // Custom extra at the top of its range: ADD WEIGHT, and its own target 3 × 15 · 40 kg.
    addExtra(b, "F", crunch, 40, [15, 15, 15]);

    sessions.push(c, a, b);
    saveSessions(sessions);

    // Targets: start over and run the real one-time setup on the fake history.
    // Bench press (B, A1) also gets a suggestion "from the last B workout", to try Accept / Edit / ×.
    state.sessions = sessions;
    state.library = library;
    state.targets = {
      "B-bench": {
        weight: null,
        reps: null,
        changedAt: null,
        pending: { weight: 22.5, reps: 6, fromSessionId: b.id },
        dismissedFrom: null,
      },
    };
    try {
      localStorage.removeItem(TARGETS_INIT_KEY);
    } catch (error) {
      // ignore
    }
    initTargets();
    // Sample notes (only where there is no note yet): one to edit on B's bench press, and one on
    // A's cable lateral raise that shows as "Program note" when you add it as an extra on B.
    const notes = loadNotes();
    const sampleNotes = {
      "B-bench": "Weight without the bar (20 kg).",
      "A-cable-lateral": "Cable at hip height.\nHandle, no cuff.",
    };
    for (const id of Object.keys(sampleNotes)) {
      if (!notes[id] || !notes[id].text) notes[id] = { text: sampleNotes[id], changedAt: new Date().toISOString() };
    }
    saveNotes(notes);
    // Never send these fake targets to the Sheet.
    const settings = loadSettings();
    settings.targetsSynced = true;
    saveSettings(settings);
    location.reload();
  }
  function ensureEntry(library, name, sets, lo, hi, sourceProgramIds) {
    const existing = library.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const entry = {
      id: makeExerciseId(name, library),
      name: name,
      sets: sets,
      lo: lo,
      hi: hi,
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
    if (!confirm("Delete ALL saved workouts, extra exercises, targets and notes on this device?")) return;
    try {
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(EXERCISES_KEY);
      localStorage.removeItem(TARGETS_KEY);
      localStorage.removeItem(TARGETS_INIT_KEY);
      localStorage.removeItem(NOTES_KEY);
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
