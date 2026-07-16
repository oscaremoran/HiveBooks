/* ============================================================
   HiveBooks — Google Sheets backend (Google Apps Script)

   Paste this into Extensions → Apps Script on your HiveBooks
   Google Sheet, then Deploy → New deployment → Web app:
     Execute as:      Me
     Who has access:  Anyone
   Copy the /exec URL it gives you into js/config.js.

   Creates a "Users" tab automatically. Columns:
     username | passHash | data(JSON)
   ============================================================ */

var SHEET_NAME = 'Users';

function doGet() {
  return json({ ok: true, msg: 'HiveBooks API is running.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);           // stop two writers clobbering each other
  try {
    var req = JSON.parse(e.postData.contents);
    return json(handle(req));
  } catch (err) {
    return json({ ok: false, msg: 'Error: ' + err });
  } finally {
    lock.releaseLock();
  }
}

function handle(req) {
  switch (req.action) {
    case 'signup':     return signup(req);
    case 'login':      return login(req);
    case 'save':       return save(req);
    case 'scores':     return scores();
    case 'import':     return importUsers(req);
    case 'rename':     return rename(req);
    case 'changePass': return changePass(req);
    case 'remove':     return remove(req);
    default:           return { ok: false, msg: 'Unknown action' };
  }
}

/* ------------------------- helpers ------------------------- */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['username', 'passHash', 'data']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function allRows() {
  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 3).getValues();
}

/** Find a user's row. Returns {rowNumber, username, passHash, data} or null. */
function findUser(username) {
  var rows = allRows();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(username)) {
      return {
        rowNumber: i + 2,
        username: String(rows[i][0]),
        passHash: String(rows[i][1]),
        data: parseData(rows[i][2])
      };
    }
  }
  return null;
}

function parseData(raw) {
  try {
    var d = JSON.parse(raw);
    return {
      nectar: d.nectar || 0,
      finished: d.finished || [],
      wantToRead: d.wantToRead || [],
      ratings: d.ratings || {}
    };
  } catch (err) {
    return { nectar: 0, finished: [], wantToRead: [], ratings: {} };
  }
}

function blankData() {
  return { nectar: 0, finished: [], wantToRead: [], ratings: {} };
}

/** Check credentials. Returns the user record, or null if they don't match. */
function auth(req) {
  var u = findUser(req.username);
  if (!u) return null;
  if (u.passHash !== String(req.passHash)) return null;
  return u;
}

/* ------------------------- actions ------------------------- */

function signup(req) {
  var name = String(req.username || '').trim();
  if (!name) return { ok: false, msg: 'Enter a username.' };
  if (findUser(name)) return { ok: false, msg: 'That username is already in the hive.' };

  var data = blankData();
  sheet().appendRow([name, String(req.passHash), JSON.stringify(data)]);
  return { ok: true, data: data };
}

function login(req) {
  var u = findUser(String(req.username || '').trim());
  if (!u) return { ok: false, msg: 'No such bee. Try creating an account.' };
  if (u.passHash !== String(req.passHash)) return { ok: false, msg: 'Wrong password.' };
  return { ok: true, data: u.data };
}

function save(req) {
  var u = auth(req);
  if (!u) return { ok: false, msg: 'Not allowed.' };
  sheet().getRange(u.rowNumber, 3).setValue(JSON.stringify(parseData(JSON.stringify(req.data))));
  return { ok: true };
}

function rename(req) {
  var u = auth(req);
  if (!u) return { ok: false, msg: 'Current password is incorrect.' };
  var newName = String(req.newUsername || '').trim();
  if (!newName) return { ok: false, msg: 'Enter a new username.' };
  if (findUser(newName)) return { ok: false, msg: 'That username is already in the hive.' };
  sheet().getRange(u.rowNumber, 1).setValue(newName);
  return { ok: true };
}

function changePass(req) {
  var u = auth(req);
  if (!u) return { ok: false, msg: 'Current password is incorrect.' };
  sheet().getRange(u.rowNumber, 2).setValue(String(req.newPassHash));
  return { ok: true };
}

function remove(req) {
  var u = auth(req);
  if (!u) return { ok: false, msg: 'Current password is incorrect.' };
  sheet().deleteRow(u.rowNumber);
  return { ok: true };
}

/** One-off migration: copy accounts saved in someone's browser into the
    Sheet. Existing usernames are skipped, never overwritten. */
function importUsers(req) {
  var users = req.users || [];
  var added = 0, skipped = 0;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    var name = String(u.username || '').trim();
    if (!name) { skipped++; continue; }
    if (findUser(name)) { skipped++; continue; }
    sheet().appendRow([name, String(u.passHash), JSON.stringify(parseData(JSON.stringify(u.data)))]);
    added++;
  }
  return { ok: true, added: added, skipped: skipped };
}

/** Everyone's ratings, totalled per book, for the HiveScore. */
function scores() {
  var rows = allRows();
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var ratings = parseData(rows[i][2]).ratings;
    for (var bookId in ratings) {
      var score = Number(ratings[bookId]);
      if (!score) continue;
      if (!out[bookId]) out[bookId] = { sum: 0, count: 0 };
      out[bookId].sum += score;
      out[bookId].count += 1;
    }
  }
  return { ok: true, scores: out };
}
