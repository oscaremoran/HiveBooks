/* ============================================================
   HiveBooks — accounts and reading progress

   Passwords are SHA-256 hashed before they ever leave the page.
   That's better than plaintext, but it is NOT real security —
   see the note at the top of storage.js.

   Reads here are synchronous (served from the storage cache);
   writes are saved in the background.
   ============================================================ */

const HiveAuth = (() => {
  const SESSION_KEY = "hivebooks_session_v2";

  /** Hash a password with SHA-256 → hex. */
  async function hash(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Remember who's signed in so a page reload keeps the session. */
  function setSession(username, passHash) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username, passHash }));
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  async function createAccount(username, password) {
    username = username.trim();
    if (!username || !password) return { ok: false, msg: "Enter a username and password." };
    const passHash = await hash(password);
    const r = await HiveStorage.signup(username, passHash);
    if (r.ok) setSession(username, passHash);
    return { ok: r.ok, msg: r.ok ? "Welcome to the hive!" : r.msg };
  }

  async function login(username, password) {
    username = username.trim();
    if (!username || !password) return { ok: false, msg: "Enter a username and password." };
    const passHash = await hash(password);
    const r = await HiveStorage.login(username, passHash);
    if (r.ok) setSession(username, passHash);
    return { ok: r.ok, msg: r.ok ? "Welcome back!" : r.msg };
  }

  /** Restore a session after a page reload. Returns true if signed in. */
  async function restore() {
    const s = readSession();
    if (!s || !s.username) return false;
    const r = await HiveStorage.login(s.username, s.passHash);
    if (!r.ok) { logout(); return false; }
    return true;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    HiveStorage.clearSession();
  }

  const currentUser = () => HiveStorage.getUsername();

  async function changeUsername(newName, currentPassword) {
    newName = newName.trim();
    if (!currentUser()) return { ok: false, msg: "You are not logged in." };
    if (!newName) return { ok: false, msg: "Enter a new username." };
    if (newName === currentUser()) return { ok: false, msg: "That's already your username." };

    const r = await HiveStorage.rename(newName, await hash(currentPassword));
    if (r.ok) {
      setSession(newName, HiveStorage.getPassHash());
      return { ok: true, msg: "Username updated!" };
    }
    return r;
  }

  async function changePassword(newPassword, currentPassword) {
    if (!currentUser()) return { ok: false, msg: "You are not logged in." };
    if (!newPassword) return { ok: false, msg: "Enter a new password." };

    const newHash = await hash(newPassword);
    const r = await HiveStorage.changePass(await hash(currentPassword), newHash);
    if (r.ok) {
      setSession(currentUser(), newHash);
      return { ok: true, msg: "Password updated!" };
    }
    return r;
  }

  async function deleteAccount(currentPassword) {
    if (!currentUser()) return { ok: false, msg: "You are not logged in." };
    const r = await HiveStorage.remove(await hash(currentPassword));
    if (r.ok) {
      sessionStorage.removeItem(SESSION_KEY);
      return { ok: true, msg: "Account deleted." };
    }
    return r;
  }

  /* ------------- reading progress (sync reads) ------------- */

  const data = () => HiveStorage.getData();

  function isFinished(bookId) {
    const d = data();
    return d ? d.finished.includes(bookId) : false;
  }

  /** Mark finished, awarding Nectar once and clearing it from Want to Read. */
  function markFinished(bookId, nectarAmount) {
    const d = data();
    if (!d) return { nectar: 0, already: true };
    if (d.finished.includes(bookId)) return { nectar: d.nectar, already: true };
    d.finished.push(bookId);
    d.nectar += nectarAmount;
    const w = d.wantToRead.indexOf(bookId);
    if (w >= 0) d.wantToRead.splice(w, 1);
    HiveStorage.persist();
    return { nectar: d.nectar, already: false };
  }

  /** Undo a finish: removes the Nectar and drops any rating. */
  function unmarkFinished(bookId, nectarAmount) {
    const d = data();
    if (!d) return { nectar: 0 };
    const i = d.finished.indexOf(bookId);
    if (i >= 0) {
      d.finished.splice(i, 1);
      d.nectar = Math.max(0, d.nectar - nectarAmount);
    }
    if (d.ratings[bookId] != null) {
      HiveStorage.bumpScore(bookId, d.ratings[bookId], null);
      delete d.ratings[bookId];
    }
    HiveStorage.persist();
    return { nectar: d.nectar };
  }

  const isWanted = (bookId) => {
    const d = data();
    return d ? d.wantToRead.includes(bookId) : false;
  };

  function toggleWantToRead(bookId) {
    const d = data();
    if (!d) return false;
    const i = d.wantToRead.indexOf(bookId);
    if (i >= 0) d.wantToRead.splice(i, 1);
    else d.wantToRead.push(bookId);
    HiveStorage.persist();
    return d.wantToRead.includes(bookId);
  }

  const getUserRating = (bookId) => {
    const d = data();
    return d ? (d.ratings[bookId] ?? null) : null;
  };

  function rateBook(bookId, score) {
    const d = data();
    if (!d) return;
    HiveStorage.bumpScore(bookId, d.ratings[bookId] ?? null, score);
    d.ratings[bookId] = score;
    HiveStorage.persist();
  }

  const getNectar = () => (data() ? data().nectar : 0);
  const getFinishedCount = () => (data() ? data().finished.length : 0);
  const getWantToReadCount = () => (data() ? data().wantToRead.length : 0);

  return { createAccount, login, logout, restore, currentUser,
           changeUsername, changePassword, deleteAccount,
           isFinished, markFinished, unmarkFinished,
           isWanted, toggleWantToRead,
           getUserRating, rateBook, getNectar, getFinishedCount, getWantToReadCount };
})();
