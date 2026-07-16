/* ============================================================
   HiveBooks — storage adapter
   Default backend: browser localStorage (works on file open).
   Optional backend: GitHub repo (enabled later via config.js).

   NOTE: browser-only auth can't truly hide secrets. This is for
   a personal/demo project only — don't reuse real passwords.
   ============================================================ */

const HiveStorage = (() => {
  const KEY = "hivebooks_accounts_v1";

  /**
   * Read the accounts object:
   *   { username: { passHash, finished: [], ratings: {}, nectar: 0 } }.
   * Currently localStorage-backed. A GitHub backend can be swapped in
   * here later (read contents API) without touching auth/app code.
   */
  function getAccounts() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  }

  /** Persist the full accounts object. */
  function saveAccounts(accounts) {
    localStorage.setItem(KEY, JSON.stringify(accounts));
  }

  return { getAccounts, saveAccounts };
})();
