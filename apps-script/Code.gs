// gymtracker – Google Apps Script backend.
//
// This file is NOT run from the repo. Paste it into the Sheet's Apps Script editor
// (Extensions → Apps Script). See README.md for the full steps.
//
// The secret key lives in Script Properties as SECRET_KEY, never in this code.

const SHEET_NAME = "sets";
const COLUMNS = [
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
    if (body.action === "list") return reply({ ok: true, rows: listRows() });
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

// Returns the "sets" tab, creating it (with a header row) if needed.
function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    // Keep ids and timestamps as plain text, so Sheets doesn't turn them into dates.
    sheet.getRange("A:A").setNumberFormat("@");
    sheet.getRange("I:I").setNumberFormat("@");
  }
  return sheet;
}

// Replaces all rows of one session: delete the old ones, then append the new ones.
// Sending the same session twice therefore never creates duplicates.
function saveSession(body) {
  if (typeof body.sessionId !== "string" || !Array.isArray(body.rows)) {
    return { ok: false, error: "Missing sessionId or rows." };
  }
  const sheet = getSheet();

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    // Delete from the bottom up, so row numbers above don't shift.
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === body.sessionId) sheet.deleteRow(i + 2);
    }
  }

  if (body.rows.length > 0) {
    const values = body.rows.map((row) =>
      COLUMNS.map((column) => (row[column] === undefined || row[column] === null ? "" : row[column]))
    );
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, COLUMNS.length).setValues(values);
  }
  return { ok: true, saved: body.rows.length };
}

// All rows as objects keyed by column name, for "Restore from Sheet".
function listRows() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  return values.map((cells) => {
    const row = {};
    COLUMNS.forEach((column, i) => {
      const value = cells[i];
      row[column] = value instanceof Date ? value.toISOString() : value;
    });
    return row;
  });
}
