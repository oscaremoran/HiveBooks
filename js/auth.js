/* ============================================================
   HiveBooks — authentication (signup / login)
   Passwords are SHA-256 hashed before storage. This is better
   than plaintext but NOT a substitute for a real backend.
   ============================================================ */

const HiveAuth = (() => {
  const SESSION_KEY = "hivebooks_session_v1";

  /** Hash a password string with SHA-256 → hex. */
  async function hash(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /** Create an account. Returns {ok, msg}. */
  async function createAccount(username, password) {
    username = username.trim();
    if (!username || !password) return { ok: false, msg: "Enter a username and password." };

    const accounts = HiveStorage.getAccounts();
    if (accounts[username]) return { ok: false, msg: "That username is already in the hive." };

    accounts[username] = { passHash: await hash(password), finished: [], wantToRead: [], ratings: {}, nectar: 0 };
    HiveStorage.saveAccounts(accounts);
    setSession(username);
    return { ok: true, msg: "Welcome to the hive!" };
  }

  /** Log in. Returns {ok, msg}. */
  async function login(username, password) {
    username = username.trim();
    if (!username || !password) return { ok: false, msg: "Enter a username and password." };

    const accounts = HiveStorage.getAccounts();
    const user = accounts[username];
    if (!user) return { ok: false, msg: "No such bee. Try creating an account." };
    if (user.passHash !== (await hash(password))) return { ok: false, msg: "Wrong password." };

    setSession(username);
    return { ok: true, msg: "Welcome back!" };
  }

  /** Change the logged-in user's username. Requires the current password. */
  async function changeUsername(newName, currentPassword) {
    newName = newName.trim();
    const u = currentUser();
    if (!u) return { ok: false, msg: "You are not logged in." };
    if (!newName) return { ok: false, msg: "Enter a new username." };
    if (newName === u) return { ok: false, msg: "That's already your username." };

    const accounts = HiveStorage.getAccounts();
    if (accounts[newName]) return { ok: false, msg: "That username is already in the hive." };
    if (accounts[u].passHash !== (await hash(currentPassword)))
      return { ok: false, msg: "Current password is incorrect." };

    accounts[newName] = accounts[u];
    delete accounts[u];
    HiveStorage.saveAccounts(accounts);
    setSession(newName);
    return { ok: true, msg: "Username updated!" };
  }

  /** Change the logged-in user's password. Requires the current password. */
  async function changePassword(newPassword, currentPassword) {
    const u = currentUser();
    if (!u) return { ok: false, msg: "You are not logged in." };
    if (!newPassword) return { ok: false, msg: "Enter a new password." };

    const accounts = HiveStorage.getAccounts();
    if (accounts[u].passHash !== (await hash(currentPassword)))
      return { ok: false, msg: "Current password is incorrect." };

    accounts[u].passHash = await hash(newPassword);
    HiveStorage.saveAccounts(accounts);
    return { ok: true, msg: "Password updated!" };
  }

  /** Permanently delete the logged-in account. Requires the current password. */
  async function deleteAccount(currentPassword) {
    const u = currentUser();
    if (!u) return { ok: false, msg: "You are not logged in." };

    const accounts = HiveStorage.getAccounts();
    if (accounts[u].passHash !== (await hash(currentPassword)))
      return { ok: false, msg: "Current password is incorrect." };

    delete accounts[u];
    HiveStorage.saveAccounts(accounts);
    logout();
    return { ok: true, msg: "Account deleted." };
  }

  function setSession(username) { sessionStorage.setItem(SESSION_KEY, username); }
  function currentUser() { return sessionStorage.getItem(SESSION_KEY); }
  function logout() { sessionStorage.removeItem(SESSION_KEY); }

  // ---- Reading progress: finished books, ratings, and Nectar ----

  /** Internal: get {accounts, rec} for the logged-in user, or null. */
  function _rec() {
    const u = currentUser();
    if (!u) return null;
    const accounts = HiveStorage.getAccounts();
    const rec = accounts[u];
    if (!rec) return null;
    rec.finished = rec.finished || [];
    rec.wantToRead = rec.wantToRead || [];
    rec.ratings = rec.ratings || {};
    rec.nectar = rec.nectar || 0;
    return { accounts, rec };
  }

  function isWanted(bookId) {
    const c = _rec();
    return c ? c.rec.wantToRead.includes(bookId) : false;
  }

  /** Add/remove a book from the Want to Read list. Returns the new state. */
  function toggleWantToRead(bookId) {
    const c = _rec();
    if (!c) return false;
    const idx = c.rec.wantToRead.indexOf(bookId);
    if (idx >= 0) c.rec.wantToRead.splice(idx, 1);
    else c.rec.wantToRead.push(bookId);
    HiveStorage.saveAccounts(c.accounts);
    return c.rec.wantToRead.includes(bookId);
  }

  function getWantToReadCount() {
    const c = _rec();
    return c ? c.rec.wantToRead.length : 0;
  }

  function isFinished(bookId) {
    const c = _rec();
    return c ? c.rec.finished.includes(bookId) : false;
  }

  /** Mark a book finished, awarding Nectar once. Also drops it from the
      Want to Read list — you've read it now. Returns the new total. */
  function markFinished(bookId, nectarAmount) {
    const c = _rec();
    if (!c) return { nectar: 0, already: true };
    if (c.rec.finished.includes(bookId)) return { nectar: c.rec.nectar, already: true };
    c.rec.finished.push(bookId);
    c.rec.nectar += nectarAmount;
    const w = c.rec.wantToRead.indexOf(bookId);
    if (w >= 0) c.rec.wantToRead.splice(w, 1);
    HiveStorage.saveAccounts(c.accounts);
    return { nectar: c.rec.nectar, already: false };
  }

  /** Undo a finished mark: removes the Nectar it awarded and drops any
      rating, since only finished books can be rated. */
  function unmarkFinished(bookId, nectarAmount) {
    const c = _rec();
    if (!c) return { nectar: 0 };
    const idx = c.rec.finished.indexOf(bookId);
    if (idx >= 0) {
      c.rec.finished.splice(idx, 1);
      c.rec.nectar = Math.max(0, c.rec.nectar - nectarAmount);
    }
    delete c.rec.ratings[bookId];
    HiveStorage.saveAccounts(c.accounts);
    return { nectar: c.rec.nectar };
  }

  function getUserRating(bookId) {
    const c = _rec();
    return c ? (c.rec.ratings[bookId] ?? null) : null;
  }

  function rateBook(bookId, score) {
    const c = _rec();
    if (!c) return;
    c.rec.ratings[bookId] = score;
    HiveStorage.saveAccounts(c.accounts);
  }

  function getNectar() {
    const c = _rec();
    return c ? c.rec.nectar : 0;
  }

  function getFinishedCount() {
    const c = _rec();
    return c ? c.rec.finished.length : 0;
  }

  return { createAccount, login, logout, currentUser, changeUsername, changePassword, deleteAccount,
           isFinished, markFinished, unmarkFinished, getUserRating, rateBook, getNectar, getFinishedCount,
           isWanted, toggleWantToRead, getWantToReadCount };
})();
