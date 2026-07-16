/* ============================================================
   HiveBooks — configuration

   Paste your Google Apps Script Web App URL below to turn on
   shared storage (accounts and HiveScores shared by everyone).

   Leave it empty ("") and HiveBooks runs in local mode instead:
   everything is saved in your own browser only. The site works
   either way.

   Setup steps are in README.md.
   ============================================================ */

window.HIVE_CONFIG = {
  // Empty = local mode: accounts and ratings save in this browser only.
  // The old Apps Script backend is gone — its Google Sheet was deleted,
  // and a sheet-bound script dies with its sheet. A replacement that
  // shares ratings is still to be chosen.
  apiUrl: "",
};
