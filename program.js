// The training program as data. This is the only place to edit exercises.
//
// Each exercise has a stable `id`. History is looked up by this id, so never
// reuse an id for a different exercise.
// `repMin`/`repMax` is the rep range.

const PROGRAM = {
  A: {
    weekday: "Monday",
    subtitle: "Heavy press & hinge",
    blocks: [
      {
        letter: "A",
        exercises: [
          { id: "A-incline-db", slot: "A1", name: "Incline DB press (30°)", sets: 3, repMin: 8, repMax: 12 },
          { id: "A-cs-row", slot: "A2", name: "Chest-supported row", sets: 3, repMin: 8, repMax: 10 },
        ],
      },
      {
        letter: "B",
        exercises: [
          { id: "A-rdl", slot: "B1", name: "Romanian deadlift", sets: 3, repMin: 6, repMax: 8 },
          { id: "A-pulldown", slot: "B2", name: "Lat pulldown (neutral or medium grip)", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        letter: "C",
        exercises: [
          { id: "A-ohp", slot: "C1", name: "Standing barbell press", sets: 3, repMin: 6, repMax: 10 },
          { id: "A-ez-curl", slot: "C2", name: "EZ-bar curl", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
      {
        letter: "D",
        exercises: [
          { id: "A-cable-lateral", slot: "D1", name: "Cable lateral raise", sets: 3, repMin: 12, repMax: 15 },
          { id: "A-oh-triceps", slot: "D2", name: "Overhead cable triceps extension", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
    ],
  },

  B: {
    weekday: "Wednesday",
    subtitle: "Moderate reps",
    blocks: [
      {
        letter: "A",
        exercises: [
          { id: "B-bench", slot: "A1", name: "Barbell bench press", sets: 3, repMin: 6, repMax: 8 },
          { id: "B-wide-pulldown", slot: "A2", name: "Wide-grip lat pulldown", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
      {
        letter: "B",
        exercises: [
          { id: "B-leg-press", slot: "B1", name: "Leg press (feet high and wide)", sets: 3, repMin: 10, repMax: 12 },
          { id: "B-face-pull", slot: "B2", name: "Face pull", sets: 3, repMin: 12, repMax: 15 },
        ],
      },
      {
        letter: "C",
        exercises: [
          { id: "B-cable-fly", slot: "C1", name: "Cable fly (mid height)", sets: 3, repMin: 12, repMax: 15 },
          { id: "B-db-lateral", slot: "C2", name: "DB lateral raise", sets: 3, repMin: 12, repMax: 20 },
        ],
      },
      {
        letter: "D",
        exercises: [
          { id: "B-leg-curl", slot: "D1", name: "Seated leg curl", sets: 3, repMin: 10, repMax: 12 },
          { id: "B-hammer-curl", slot: "D2", name: "Hammer curl", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
    ],
  },

  C: {
    weekday: "Friday",
    subtitle: "Machines & higher reps",
    blocks: [
      {
        letter: "A",
        exercises: [
          { id: "C-incline-db", slot: "A1", name: "Incline DB press (30°)", sets: 3, repMin: 8, repMax: 12 },
          { id: "C-cable-row", slot: "A2", name: "Single-arm cable row", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
      {
        letter: "B",
        exercises: [
          { id: "C-leg-ext", slot: "B1", name: "Leg extension", sets: 3, repMin: 12, repMax: 15 },
          { id: "C-rev-pec-deck", slot: "B2", name: "Reverse pec deck", sets: 3, repMin: 12, repMax: 20 },
        ],
      },
      {
        letter: "C",
        exercises: [
          { id: "C-pec-deck", slot: "C1", name: "Pec deck", sets: 3, repMin: 12, repMax: 15 },
          { id: "C-cable-lateral", slot: "C2", name: "Cable lateral raise", sets: 4, repMin: 12, repMax: 20 },
        ],
      },
      {
        letter: "D",
        exercises: [
          { id: "C-incline-curl", slot: "D1", name: "Incline DB curl", sets: 3, repMin: 10, repMax: 12 },
          { id: "C-pushdown", slot: "D2", name: "Triceps pushdown", sets: 3, repMin: 10, repMax: 12 },
        ],
      },
    ],
  },
};

// Exercise slots that were removed from the program. Their old workouts, targets and notes stay
// stored under these ids (never reuse them), so the names are kept here for the Google Sheet.
const RETIRED_EXERCISES = {
  "A-bench": "Barbell bench press",
  "B-incline-db": "Incline DB press (30°)",
  "C-smith-incline": "Low-incline Smith press",
};
