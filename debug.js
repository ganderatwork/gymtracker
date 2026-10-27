// TEMPORARY test helper for milestone 3. Delete this file and its <script> tag when done.
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
    sessions.push(fakeSession("A", 7), fakeSession("B", 5), fakeSession("C", 3));
    saveSessions(sessions);
    location.reload();
  }

  function clearAllData() {
    if (!confirm("Delete ALL saved workouts on this device?")) return;
    try {
      localStorage.removeItem(SESSIONS_KEY);
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
