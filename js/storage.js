/* ============================================================
   HiveBooks — storage

   Two modes, chosen by whether js/config.js has an apiUrl:
     • sheet mode — accounts and ratings live in a Google Sheet,
       reached through an Apps Script Web App. Shared by everyone.
     • local mode — everything lives in this browser only.

   Reads are served from an in-memory cache so the rest of the app
   can stay synchronous; writes are sent to the Sheet in the
   background and the cache updates immediately.

   NOTE: a browser-only app can't keep real secrets. Passwords are
   hashed before they leave the page, but the hash is all anyone
   needs to sign in, and the API URL is visible in the page source.
   Fine for a personal project — don't reuse a real password.
   ============================================================ */

const HiveStorage = (() => {
  const KEY = "hivebooks_accounts_v1";   // local mode store

  let session = null;   // { username, passHash, data }
  let scores = {};      // { bookId: { sum, count } } — everyone's ratings

  const apiUrl = () => (window.HIVE_CONFIG && window.HIVE_CONFIG.apiUrl) || "";
  const usingSheet = () => apiUrl().length > 0;

  const blankData = () => ({ nectar: 0, finished: [], wantToRead: [], ratings: {} });

  /** POST to the Apps Script Web App. */
  async function call(action, payload = {}) {
    const res = await fetch(apiUrl(), {
      method: "POST",
      // text/plain keeps this a "simple" request, so the browser skips the
      // CORS preflight that Apps Script web apps can't answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...payload }),
      redirect: "follow",
    });
    if (!res.ok) throw new Error("Network error " + res.status);
    return res.json();
  }

  /** call(), but a dead/unreachable Sheet becomes a message the UI can show
      instead of an exception that silently kills the click handler. */
  async function safeCall(action, payload = {}) {
    try {
      return await call(action, payload);
    } catch (err) {
      console.warn("HiveBooks: Sheet unreachable —", err.message);
      return { ok: false, msg: "Can't reach the hive right now. Try again in a moment." };
    }
  }

  /* ---------------------- local mode ---------------------- */
  const localAccounts = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const saveLocalAccounts = (a) => localStorage.setItem(KEY, JSON.stringify(a));

  const pickData = (rec) => ({
    nectar: rec.nectar || 0,
    finished: rec.finished || [],
    wantToRead: rec.wantToRead || [],
    ratings: rec.ratings || {},
  });

  /** Recompute everyone's rating totals from local accounts. */
  function localScores() {
    const out = {};
    Object.values(localAccounts()).forEach((rec) => {
      Object.entries(rec.ratings || {}).forEach(([id, score]) => {
        if (!out[id]) out[id] = { sum: 0, count: 0 };
        out[id].sum += Number(score);
        out[id].count += 1;
      });
    });
    return out;
  }

  /* ---------------------- accounts ------------------------ */

  async function signup(username, passHash) {
    if (usingSheet()) {
      const r = await safeCall("signup", { username, passHash });
      if (r.ok) { session = { username, passHash, data: r.data }; await refreshScores(); }
      return r;
    }
    const accounts = localAccounts();
    if (accounts[username]) return { ok: false, msg: "That username is already in the hive." };
    accounts[username] = { passHash, ...blankData() };
    saveLocalAccounts(accounts);
    session = { username, passHash, data: pickData(accounts[username]) };
    scores = localScores();
    return { ok: true };
  }

  async function login(username, passHash) {
    if (usingSheet()) {
      const r = await safeCall("login", { username, passHash });
      if (r.ok) { session = { username, passHash, data: r.data }; await refreshScores(); }
      return r;
    }
    const accounts = localAccounts();
    const rec = accounts[username];
    if (!rec) return { ok: false, msg: "No such bee. Try creating an account." };
    if (rec.passHash !== passHash) return { ok: false, msg: "Wrong password." };
    session = { username, passHash, data: pickData(rec) };
    scores = localScores();
    return { ok: true };
  }

  async function rename(newUsername, passHash) {
    if (usingSheet()) {
      const r = await safeCall("rename", { username: session.username, passHash, newUsername });
      if (r.ok) session.username = newUsername;
      return r;
    }
    const accounts = localAccounts();
    if (accounts[newUsername]) return { ok: false, msg: "That username is already in the hive." };
    if (accounts[session.username].passHash !== passHash)
      return { ok: false, msg: "Current password is incorrect." };
    accounts[newUsername] = accounts[session.username];
    delete accounts[session.username];
    saveLocalAccounts(accounts);
    session.username = newUsername;
    return { ok: true };
  }

  async function changePass(passHash, newPassHash) {
    if (usingSheet()) {
      const r = await safeCall("changePass", { username: session.username, passHash, newPassHash });
      if (r.ok) session.passHash = newPassHash;
      return r;
    }
    const accounts = localAccounts();
    if (accounts[session.username].passHash !== passHash)
      return { ok: false, msg: "Current password is incorrect." };
    accounts[session.username].passHash = newPassHash;
    saveLocalAccounts(accounts);
    session.passHash = newPassHash;
    return { ok: true };
  }

  async function remove(passHash) {
    if (usingSheet()) {
      const r = await safeCall("remove", { username: session.username, passHash });
      if (r.ok) session = null;
      return r;
    }
    const accounts = localAccounts();
    if (accounts[session.username].passHash !== passHash)
      return { ok: false, msg: "Current password is incorrect." };
    delete accounts[session.username];
    saveLocalAccounts(accounts);
    session = null;
    scores = localScores();
    return { ok: true };
  }

  /* --------------------- progress data -------------------- */

  /** The logged-in user's data (sync — served from cache). */
  const getData = () => (session ? session.data : null);
  const getUsername = () => (session ? session.username : null);
  const getPassHash = () => (session ? session.passHash : null);

  /** Save the cached data back to wherever it lives. */
  async function persist() {
    if (!session) return;
    if (usingSheet()) {
      try {
        await call("save", {
          username: session.username, passHash: session.passHash, data: session.data,
        });
      } catch (err) {
        console.warn("HiveBooks: couldn't save to the Sheet —", err.message);
      }
      return;
    }
    const accounts = localAccounts();
    accounts[session.username] = { passHash: session.passHash, ...session.data };
    saveLocalAccounts(accounts);
    scores = localScores();
  }

  /* ------------------------ scores ------------------------ */

  const getScores = () => scores;

  async function refreshScores() {
    if (!usingSheet()) { scores = localScores(); return; }
    try {
      const r = await call("scores");
      if (r.ok) scores = r.scores || {};
    } catch (err) {
      console.warn("HiveBooks: couldn't load HiveScores —", err.message);
    }
  }

  /** Apply a rating change to the local score cache straight away. */
  function bumpScore(bookId, oldScore, newScore) {
    if (!scores[bookId]) scores[bookId] = { sum: 0, count: 0 };
    const s = scores[bookId];
    if (oldScore != null) { s.sum -= oldScore; s.count -= 1; }
    if (newScore != null) { s.sum += newScore; s.count += 1; }
    if (s.count <= 0) delete scores[bookId];
  }

  function clearSession() { session = null; }

  /* --------------------- migration ------------------------ */

  /** How many accounts are sitting in this browser's local storage. */
  const localAccountCount = () => Object.keys(localAccounts()).length;

  /** Copy this browser's local accounts into the Sheet. Existing usernames
      in the Sheet are left alone. Local copies are kept as a backup. */
  async function importLocalToSheet() {
    if (!usingSheet()) return { ok: false, msg: "No Sheet is connected yet." };

    const users = Object.entries(localAccounts()).map(([username, rec]) => ({
      username,
      passHash: rec.passHash,
      data: pickData(rec),
    }));
    if (!users.length) return { ok: false, msg: "This browser has no saved accounts." };

    try {
      const r = await call("import", { users });
      if (r.ok) await refreshScores();
      return r;
    } catch (err) {
      return { ok: false, msg: "Couldn't reach the Sheet: " + err.message };
    }
  }

  return { usingSheet, signup, login, rename, changePass, remove,
           getData, getUsername, getPassHash, persist,
           getScores, refreshScores, bumpScore, clearSession,
           localAccountCount, importLocalToSheet };
})();
