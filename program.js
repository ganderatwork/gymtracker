// The training program as data. This is the only place to edit exercises.
//
// Two workouts, A and B, done in turn (A B A, then B A B, ...).
// Each exercise has a stable `id`. History is looked up by this id, so never
// reuse an id for a different exercise.
// `repMin`/`repMax` is the rep range.
// `previousIds` (optional) lists old ids this exercise came from. Their logged sets count as
// this exercise's history, so "last time" keeps working after an exercise moved or was renamed.

const PROGRAM = {
  A: {
    name: "Incline Inferno",
    subtitle: "Incline press, leg press, vertical pull",
    blocks: [
      {
        letter: "A",
        exercises: [
          { id: "A-incline-db", slot: "A1", name: "Incline DB press (30°)", sets: 3, repMin: 8, repMax: 12, previousIds: ["B-incline-db", "C-incline-db"] },
          { id: "A-cs-row", slot: "A2", name: "Chest-supported row", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        letter: "B",
        exercises: [
          { id: "A-leg-press", slot: "B1", name: "Leg press (feet high and wide)", sets: 3, repMin: 10, repMax: 15, previousIds: ["B-leg-press"] },
          { id: "A-pulldown", slot: "B2", name: "Lat pulldown (neutral grip)", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        letter: "C",
        exercises: [
          { id: "A-leg-curl", slot: "C1", name: "Seated leg curl", sets: 3, repMin: 10, repMax: 15, previousIds: ["B-leg-curl"] },
          { id: "A-cable-lateral", slot: "C2", name: "Cable lateral raise", sets: 3, repMin: 12, repMax: 20, previousIds: ["C-cable-lateral"] },
        ],
      },
      {
        letter: "D",
        exercises: [
          { id: "A-machine-press", slot: "D1", name: "Machine shoulder press (neutral grip if available)", sets: 3, repMin: 8, repMax: 12, previousIds: ["A-ohp"] },
          { id: "A-face-pull", slot: "D2", name: "Face pull", sets: 3, repMin: 15, repMax: 20, previousIds: ["B-face-pull"] },
        ],
      },
      {
        letter: "E",
        exercises: [
          { id: "A-ez-curl", slot: "E1", name: "EZ-bar curl", sets: 3, repMin: 8, repMax: 12 },
          { id: "A-oh-triceps", slot: "E2", name: "Overhead cable triceps extension", sets: 3, repMin: 10, repMax: 15 },
        ],
      },
    ],
  },

  B: {
    name: "Bench Boss",
    subtitle: "Flat press, hinge, wide pull",
    blocks: [
      {
        letter: "A",
        exercises: [
          { id: "B-bench", slot: "A1", name: "Barbell bench press", sets: 3, repMin: 6, repMax: 10, previousIds: ["A-bench"] },
          { id: "B-wide-pulldown", slot: "A2", name: "Lat pulldown (overhand, just outside shoulder width)", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        letter: "B",
        exercises: [
          { id: "B-cable-row", slot: "B1", name: "Single-arm cable row", sets: 3, repMin: 8, repMax: 12, previousIds: ["C-cable-row"] },
          { id: "B-pec-deck", slot: "B2", name: "Pec deck", sets: 3, repMin: 12, repMax: 15, previousIds: ["C-pec-deck"] },
        ],
      },
      {
        letter: "C",
        exercises: [
          { id: "B-rdl", slot: "C1", name: "Romanian deadlift", sets: 3, repMin: 8, repMax: 10, previousIds: ["A-rdl"] },
          { id: "B-rev-pec-deck", slot: "C2", name: "Reverse pec deck", sets: 3, repMin: 12, repMax: 20, previousIds: ["C-rev-pec-deck"] },
        ],
      },
      {
        letter: "D",
        exercises: [
          { id: "B-reverse-lunge", slot: "D1", name: "DB reverse lunge", sets: 3, repMin: 8, repMax: 12 },
          { id: "B-db-lateral", slot: "D2", name: "DB lateral raise", sets: 3, repMin: 12, repMax: 20 },
        ],
      },
      {
        letter: "E",
        exercises: [
          { id: "B-incline-curl", slot: "E1", name: "Incline DB curl", sets: 3, repMin: 10, repMax: 15, previousIds: ["C-incline-curl"] },
          { id: "B-pushdown", slot: "E2", name: "Triceps pushdown", sets: 3, repMin: 10, repMax: 15, previousIds: ["C-pushdown"] },
        ],
      },
    ],
  },
};

// Exercise slots that were removed from the program. Their old workouts, targets and notes stay
// stored under these ids (never reuse them), so the names are kept here for the Google Sheet.
const RETIRED_EXERCISES = {
  // November 2026: Smith press dropped, bench and incline DB swapped days.
  "A-bench": "Barbell bench press",
  "B-incline-db": "Incline DB press (30°)",
  "C-smith-incline": "Low-incline Smith press",
  // November 2026: Monday/Wednesday/Friday became the two alternating workouts A and B.
  "A-rdl": "Romanian deadlift",
  "A-ohp": "Standing barbell press",
  "B-leg-press": "Leg press (feet high and wide)",
  "B-face-pull": "Face pull",
  "B-cable-fly": "Cable fly (mid height)",
  "B-leg-curl": "Seated leg curl",
  "B-hammer-curl": "Hammer curl",
  "C-incline-db": "Incline DB press (30°)",
  "C-cable-row": "Single-arm cable row",
  "C-leg-ext": "Leg extension",
  "C-rev-pec-deck": "Reverse pec deck",
  "C-pec-deck": "Pec deck",
  "C-cable-lateral": "Cable lateral raise",
  "C-incline-curl": "Incline DB curl",
  "C-pushdown": "Triceps pushdown",
};

// Workout letters that are no longer in the program. Finished workouts with these letters stay
// as history (their sets still count via `previousIds`); an unfinished one can't be resumed.
// "C" was Friday in the old Monday/Wednesday/Friday program.
const RETIRED_DAYS = ["C"];

// True if a stored session's `day` is usable: a current workout, or a finished old one.
function isKnownSessionDay(day, finished) {
  return Boolean(PROGRAM[day]) || (RETIRED_DAYS.includes(day) && Boolean(finished));
}

// Every program exercise in one list (both workouts).
function allProgramExercises() {
  const list = [];
  for (const day of Object.values(PROGRAM)) {
    for (const block of day.blocks) list.push(...block.exercises);
  }
  return list;
}

// The ids whose logged sets count as this exercise's history: its own id plus `previousIds`.
function historyIds(exercise) {
  return [exercise.id].concat(exercise.previousIds || []);
}

// The current program exercise that an id belongs to (its own id or one of its previousIds), or null.
function programExerciseFor(id) {
  return allProgramExercises().find((ex) => historyIds(ex).includes(id)) || null;
}