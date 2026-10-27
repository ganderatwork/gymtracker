// gymtracker – Google Apps Script backend.
//
// This file is NOT run from the repo. Paste it into the Sheet's Apps Script editor
// (Extensions → Apps Script). See README.md for the full steps.
//
// The secret key lives in Script Properties as SECRET_KEY, never in this code.

const SETS_SHEET = "sets";
const SETS_COLUMNS = [
  "sessionId",
  "date",
  "day",
  "exerciseId",
  "exerciseName",
  "setNumber",
  "weightKg",
  "reps",
  "loggedAt",
];

const EXERCISES_SHEET = "exercises";
const EXERCISE_COLUMNS = ["id", "name", "sets", "lo", "hi", "inc", "sourceProgramIds", "createdAt"];

// Every request from the app arrives here as a POST with a JSON body: { key, action, ... }.
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: "Request was not valid JSON." });
  }

  const secret = PropertiesService.getScriptProperties().getProperty("SECRET_KEY");
  if (!secret) return reply({ ok: false, error: "SECRET_KEY is not set in Script Properties." });
  if (body.key !== secret) return reply({ ok: false, error: "Wrong secret key." });

  // The lock stops two saves from editing the Sheet at the same time.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === "ping") return reply({ ok: true });
    if (body.action === "saveSession") return reply(saveSession(body));
    if (body.action === "saveExercises") return reply(saveExercises(body));
    if (body.action === "list") {
      return reply({
        ok: true,
        rows: readRows(getSetsSheet(), SETS_COLUMNS),
        exercises: readRows(getExercisesSheet(), EXERCISE_COLUMNS),
      });
    }
    return reply({ ok: false, error: "Unknown action." });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Returns a tab, creating it (with a header row) if needed.
// `textColumns` (e.g. "A:A") are kept as plain text, so Sheets doesn't turn ids and timestamps into dates.
function getSheet(name, columns, textColumns) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    sheet.setFrozenRows(1);
    textColumns.forEach((range) => sheet.getRange(range).setNumberFormat("@"));
  }
  return sheet;
}

function getSetsSheet() {
  return getSheet(SETS_SHEET, SETS_COLUMNS, ["A:A", "I:I"]);
}

function getExercisesSheet() {
  return getSheet(EXERCISES_SHEET, EXERCISE_COLUMNS, ["A:A", "G:G", "H:H"]);
}

// Turns row objects into a grid of cell values in the order of `columns`.
function toValues(rows, columns) {
  return rows.map((row) =>
    columns.map((column) => (row[column] === undefined || row[column] === null ? "" : row[column]))
  );
}

// Replaces all rows of one session: delete the old ones, then append the new ones.
// Sending the same session twice therefore never creates duplicates.
function saveSession(body) {
  if (typeof body.sessionId !== "string" || !Array.isArray(body.rows)) {
    return { ok: false, error: "Missing sessionId or rows." };
  }
  const sheet = getSetsSheet();

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    // Delete from the bottom up, so row numbers above don't shift.
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === body.sessionId) sheet.deleteRow(i + 2);
    }
  }

  if (body.rows.length > 0) {
    const values = toValues(body.rows, SETS_COLUMNS);
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, SETS_COLUMNS.length).setValues(values);
  }
  return { ok: true, saved: body.rows.length };
}

// Merges the app's library into the `exercises` tab by id: entries from the app replace rows with
// the same id, and rows the app doesn't know are kept. A phone with an incomplete library
// (e.g. before restoring) can therefore never wipe exercises from the Sheet.
function saveExercises(body) {
  if (!Array.isArray(body.exercises)) return { ok: false, error: "Missing exercises." };
  const sheet = getExercisesSheet();

  const byId = new Map();
  readRows(sheet, EXERCISE_COLUMNS).forEach((row) => byId.set(String(row.id), row));
  body.exercises.forEach((entry) => byId.set(String(entry.id), entry));
  const merged = Array.from(byId.values()).filter((row) => row.id !== "");

  // Clear instead of deleting rows: Sheets refuses to delete every non-frozen row.
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, EXERCISE_COLUMNS.length).clearContent();
  if (merged.length > 0) {
    const values = toValues(merged, EXERCISE_COLUMNS);
    sheet.getRange(2, 1, values.length, EXERCISE_COLUMNS.length).setValues(values);
  }
  return { ok: true, saved: merged.length };
}

// All rows of a tab as objects keyed by column name, for "Restore from Sheet".
function readRows(sheet, columns) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  return values
    .filter((cells) => cells[0] !== "") // skip blank rows
    .map((cells) => {
      const row = {};
      columns.forEach((column, i) => {
        const value = cells[i];
        row[column] = value instanceof Date ? value.toISOString() : value;
      });
      return row;
    });
}
