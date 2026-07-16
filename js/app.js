/* ============================================================
   HiveBooks — app controller
   Spawns bees, gates on session, routes between views, renders
   the 8-hexagon honeycomb and each destination.
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  spawnBees();
  initAuthForm();
  buildHoneycomb();
  document.getElementById("backHome").addEventListener("click", () => showView("home"));
  window.addEventListener("resize", () => {
    if (!document.getElementById("skillTree")) return;
    if (recentreLevel) recentreLevel();
    drawConnections();
  });

  // If a session already exists (e.g. reload), skip straight to home.
  if (HiveAuth.currentUser()) enterApp();
  else showView("auth");
});

/* ----------------------------- Bees ----------------------------- */
function spawnBees() {
  const field = document.getElementById("beeField");
  const paths = ["p1", "p2", "p3", "p4"];
  const delays = ["", "d1", "d2", "d3"];
  for (let i = 0; i < 6; i++) {
    const bee = document.createElement("div");
    bee.className = `bee ${paths[i % paths.length]} ${delays[i % delays.length]}`;
    bee.innerHTML = `<div class="wing-holder"><img src="assets/bee.svg" alt="bee" /></div>`;
    field.appendChild(bee);
  }
}

/* --------------------------- View router ------------------------ */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("view-" + name).classList.add("active");
}

/* ---------------------------- Auth form ------------------------- */
function initAuthForm() {
  const tabs = document.querySelectorAll(".auth-tab");
  const submit = document.getElementById("authSubmit");
  const form = document.getElementById("authForm");
  const msg = document.getElementById("authMsg");
  let mode = "login";

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
      submit.textContent = mode === "login" ? "LOGIN" : "CREATE ACCOUNT";
      msg.textContent = "";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const result = mode === "login"
      ? await HiveAuth.login(username, password)
      : await HiveAuth.createAccount(username, password);

    msg.textContent = result.msg;
    msg.className = "form-msg " + (result.ok ? "ok" : "error");
    if (result.ok) {
      form.reset();
      enterApp();
    }
  });
}

function enterApp() {
  document.getElementById("welcomeUser").textContent = "🐝 " + HiveAuth.currentUser();
  showView("home");
}

/* --------------------------- Honeycomb -------------------------- */
// Exactly 8 hexagons, arranged 3 / 2 / 3 so their edges interlock.
const HEXAGONS = [
  { label: "HiveBooks Home",  emoji: "🏠", action: "home", static: true },
  { label: "To the Honeycomb", emoji: "🍯", action: "honeycomb" },
  { label: "To the Hive",      emoji: "🐝", action: "hive" },
  { label: "Profile",          emoji: "👤", action: "profile" },
  { label: "Settings",         emoji: "⚙️", action: "settings" },
  { label: "HELP",             emoji: "❓", action: "help" },
  { label: "About HiveBooks",  emoji: "ℹ️", action: "about" },
  { label: "Log Out",          emoji: "🚪", action: "logout", logout: true },
];

function buildHoneycomb() {
  const container = document.getElementById("honeycomb");
  const rows = [HEXAGONS.slice(0, 3), HEXAGONS.slice(3, 5), HEXAGONS.slice(5, 8)];
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "hex-row";
    row.forEach((h) => {
      const hex = document.createElement("button");
      hex.className = "hex" + (h.logout ? " logout" : "") + (h.static ? " static" : "");
      hex.innerHTML = `<span class="hex-inner"><span class="hex-emoji">${h.emoji}</span>${h.label}</span>`;
      if (h.static) {
        hex.disabled = true;                 // HiveBooks Home is a label, not a link
      } else {
        hex.addEventListener("click", () => handleHex(h.action));
      }
      rowEl.appendChild(hex);
    });
    container.appendChild(rowEl);
  });
}

function handleHex(action) {
  if (action === "logout") {
    HiveAuth.logout();
    showView("auth");
    return;
  }
  if (action === "home") { showView("home"); return; }
  renderContent(action);
  showView("content");
}

/* --------------------------- Content views ---------------------- */
function renderContent(action) {
  const body = document.getElementById("contentBody");
  body.innerHTML = "";
  const renderers = {
    honeycomb: renderHoneycombBooks,
    hive: renderHive,
    profile: renderProfile,
    settings: renderSettings,
    help: renderHelp,
    about: renderAbout,
  };
  (renderers[action] || renderAbout)(body);
}

function heading(body, title, lead) {
  const h = document.createElement("h2"); h.textContent = title; body.appendChild(h);
  if (lead) { const p = document.createElement("p"); p.className = "lead"; p.textContent = lead; body.appendChild(p); }
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Re-centres the current level column on resize; set by initLevelStepper. */
let recentreLevel = null;

function renderHoneycombBooks(body) {
  heading(body, "🍯 The Honeycomb",
    "Climb the hive! Each hexagon is a book. Levels run left to right, easiest to hardest; lines link a book to ones its fans will enjoy at the next level. Tap a book for details.");

  // Level stepper: arrows to move left/right one level at a time
  const nav = document.createElement("div");
  nav.className = "tree-nav";
  nav.innerHTML = `
    <button class="tree-arrow" id="lvlPrev" aria-label="Previous level">◀</button>
    <span class="tree-nav-label" id="lvlLabel"></span>
    <button class="tree-arrow" id="lvlNext" aria-label="Next level">▶</button>`;
  body.appendChild(nav);

  const scroll = document.createElement("div");
  scroll.className = "tree-scroll";
  scroll.id = "treeScroll";

  const tree = document.createElement("div");
  tree.className = "skill-tree";
  tree.id = "skillTree";
  scroll.appendChild(tree);

  // SVG layer for connecting lines (sits behind the hexagons)
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("id", "treeLines");
  svg.classList.add("tree-lines");
  tree.appendChild(svg);

  // Tooltip explaining a hovered book's connections
  const tip = document.createElement("div");
  tip.className = "tree-tip";
  tip.id = "treeTip";
  tree.appendChild(tip);

  // Levels run left to right: easiest (Level 1) to hardest, books stacked in each column.
  Object.keys(LEVEL_META).map(Number).sort((a, b) => a - b).forEach((level) => {
    const block = document.createElement("div");
    block.className = "tree-level";
    const meta = LEVEL_META[level];
    block.innerHTML = `<div class="tree-cap">${meta.name}<span>${meta.ages}</span></div>`;

    const row = document.createElement("div");
    row.className = "tree-col";
    SAMPLE_BOOKS.filter((b) => b.level === level).forEach((b) => {
      const hex = document.createElement("button");
      hex.className = "tree-hex";
      hex.dataset.book = b.id;
      if (HiveAuth.isFinished(b.id)) hex.classList.add("done");
      if (HiveAuth.isWanted(b.id)) hex.classList.add("want");
      hex.innerHTML = `<span class="th-inner"><span class="th-title">${b.shortTitle}</span></span>`;
      hex.addEventListener("click", () => openBookModal(b));
      hex.addEventListener("mouseenter", () => highlightConnections(b.id, true, hex));
      hex.addEventListener("mouseleave", () => highlightConnections(b.id, false, hex));
      hex.addEventListener("focus", () => highlightConnections(b.id, true, hex));
      hex.addEventListener("blur", () => highlightConnections(b.id, false, hex));
      row.appendChild(hex);
    });
    block.appendChild(row);
    tree.appendChild(block);
  });

  body.appendChild(scroll);
  initLevelStepper(tree);
  requestAnimationFrame(drawConnections);
}

/** Arrow buttons that step the tree one level left or right, centring
    the selected level column in the scroll window. */
function initLevelStepper(tree) {
  const levels = [...tree.querySelectorAll(".tree-level")];
  const scroll = document.getElementById("treeScroll");
  const prev = document.getElementById("lvlPrev");
  const next = document.getElementById("lvlNext");
  const label = document.getElementById("lvlLabel");
  let idx = 0;

  /** Side padding so even the first/last columns can reach the middle. */
  function updateEdgePadding() {
    const pad = Math.max(40, scroll.clientWidth / 2 - 60);
    tree.style.paddingLeft = pad + "px";
    tree.style.paddingRight = pad + "px";
  }

  /** Centre a level column by measuring it against the scroll window. */
  function centre(el, smooth) {
    const sRect = scroll.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = (eRect.left + eRect.width / 2) - (sRect.left + sRect.width / 2);
    scroll.scrollTo({ left: scroll.scrollLeft + delta, behavior: smooth ? "smooth" : "auto" });
  }

  function go(i, smooth = true) {
    idx = Math.max(0, Math.min(i, levels.length - 1));
    const meta = LEVEL_META[idx + 1];
    label.textContent = `${meta.name} · ${meta.ages}`;
    prev.disabled = idx === 0;
    next.disabled = idx === levels.length - 1;
    levels.forEach((el, n) => el.classList.toggle("current", n === idx));
    centre(levels[idx], smooth);
  }

  prev.addEventListener("click", () => go(idx - 1));
  next.addEventListener("click", () => go(idx + 1));

  updateEdgePadding();
  go(0, false);   // start centred on Level 1

  // Let the window resize handler re-centre and re-pad this tree.
  recentreLevel = () => { updateEdgePadding(); centre(levels[idx], false); };
}

/** Draw the similarity lines between connected book hexagons.
    `a` is the easier book (left column), `b` the harder one (right column),
    so we anchor at a's right edge and b's left edge to keep lines in the
    gaps between columns rather than crossing through hexagons. */
function drawConnections() {
  const tree = document.getElementById("skillTree");
  const svg = document.getElementById("treeLines");
  if (!tree || !svg) return;

  const rect = tree.getBoundingClientRect();
  svg.setAttribute("width", tree.scrollWidth);
  svg.setAttribute("height", tree.scrollHeight);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  CONNECTIONS.forEach(([a, b]) => {
    const ea = tree.querySelector(`[data-book="${a}"]`);
    const eb = tree.querySelector(`[data-book="${b}"]`);
    if (!ea || !eb) return;
    const ra = ea.getBoundingClientRect();
    const rb = eb.getBoundingClientRect();
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", ra.right - rect.left);                 // right edge of easier hex
    line.setAttribute("y1", ra.top + ra.height / 2 - rect.top);
    line.setAttribute("x2", rb.left - rect.left);                  // left edge of harder hex
    line.setAttribute("y2", rb.top + rb.height / 2 - rect.top);
    line.setAttribute("class", "tree-link");
    line.dataset.a = a;
    line.dataset.b = b;
    svg.appendChild(line);
  });
}

/** Build the tooltip markup explaining where a book leads next. */
function connectionTipHTML(id) {
  const book = findBook(id);
  const ups = connectedTo(id).filter((p) => p.dir === "up");

  let html = `<div class="tip-title">${book.shortTitle}</div>`;
  html += `<div class="tip-genre">${book.genres.join(" · ")}</div>`;
  if (book.warning) html += `<div class="tip-warn">⚠ Ask a parent — ${book.warning.level}/5</div>`;
  if (ups.length) {
    html += `<div class="tip-sec">↑ Read this next</div>`;
    html += ups.map((p) =>
      `<div class="tip-row"><strong>${findBook(p.id).shortTitle}</strong><span class="tip-why">${p.why}</span></div>`
    ).join("");
  } else {
    html += `<div class="tip-row tip-top">Top of the hive — nothing higher yet!</div>`;
  }
  return html;
}

/** Highlight a book's connected books (and their lines) on hover, and
    show a tooltip explaining each connection. */
function highlightConnections(id, on, hexEl) {
  const tree = document.getElementById("skillTree");
  if (!tree) return;
  tree.classList.toggle("hovering", on);

  const partners = connectedTo(id);
  const self = tree.querySelector(`.tree-hex[data-book="${id}"]`);
  if (self) self.classList.toggle("hovered", on);
  partners.forEach((p) => {
    const el = tree.querySelector(`.tree-hex[data-book="${p.id}"]`);
    if (el) el.classList.toggle("connected", on);
  });

  tree.querySelectorAll(".tree-link").forEach((line) => {
    const touches = line.dataset.a === id || line.dataset.b === id;
    line.classList.toggle("hl", on && touches);
  });

  const tip = document.getElementById("treeTip");
  if (!tip) return;
  if (!on) { tip.classList.remove("show"); return; }

  tip.innerHTML = connectionTipHTML(id);
  tip.classList.add("show");

  // Always sit below the hex so it never covers the books above it.
  const treeRect = tree.getBoundingClientRect();
  const hexRect = hexEl.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const centerX = hexRect.left + hexRect.width / 2 - treeRect.left;

  const half = tipRect.width / 2;
  tip.style.left = Math.max(half + 6, Math.min(centerX, tree.scrollWidth - half - 6)) + "px";
  tip.style.top = hexRect.bottom - treeRect.top + 10 + "px";
}

/** HiveScore from real reader ratings only (no seeded/fake scores). */
function hiveScore(book) {
  let total = 0, count = 0;
  Object.values(HiveStorage.getAccounts()).forEach((acc) => {
    const r = acc.ratings && acc.ratings[book.id];
    if (r != null) { total += r; count += 1; }
  });
  return { score: count ? total / count : null, count };
}

/** Text for a HiveScore result. */
function hiveScoreText(hs) {
  return hs.count ? `${hs.score.toFixed(1)} / 10` : "No ratings yet";
}
function hiveScoreCountText(hs) {
  return hs.count ? `based on ${hs.count} rating${hs.count === 1 ? "" : "s"}` : "be the first to rate it!";
}

/** Warning box for books with scary or mature content. Severity is x/5. */
function warningHTML(book) {
  if (!book.warning) return "";
  const { level, text } = book.warning;
  const dots = "●".repeat(level) + "○".repeat(5 - level);
  return `
    <div class="warn-box warn-${level}">
      <div class="warn-head">
        <span>⚠ Check with a parent or adult</span>
        <span class="warn-dots">${dots} ${level}/5</span>
      </div>
      <div class="warn-spoiler" id="warnSpoiler" tabindex="0" role="button"
           aria-label="Reveal content warning details. Contains small spoilers.">
        <p class="warn-text">${text}</p>
        <span class="spoiler-label">Right click to look, small spoilers</span>
      </div>
    </div>`;
}

/* ------------------------- Book detail modal -------------------- */
function openBookModal(book) {
  closeBookModal();
  const hs = hiveScore(book);
  const finished = HiveAuth.isFinished(book.id);
  const wanted = HiveAuth.isWanted(book.id);
  const myRating = HiveAuth.getUserRating(book.id);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "bookModal";
  overlay.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" id="modalClose">×</button>
      <h2 class="modal-title">${book.title}</h2>
      <p class="modal-author">by ${book.author}</p>
      <p class="modal-genre">${book.genres.map((g) => `<span class="genre-badge">${g}</span>`).join("")}</p>
      <p class="modal-blurb">${book.blurb}</p>
      ${warningHTML(book)}

      <div class="modal-stat"><span>Read on your own</span><strong>Ages ${book.ageAlone}+</strong></div>
      <div class="modal-stat"><span>With a parent or adult</span><strong>Ages ${book.ageAdult}+</strong></div>
      <div class="modal-stat"><span>HiveScore</span><strong id="hsVal">${hiveScoreText(hs)}</strong></div>
      <div class="modal-stat"><span id="hsCount" class="muted">${hiveScoreCountText(hs)}</span><span></span></div>
      <div class="modal-stat"><span>Nectar for finishing</span><strong>+${book.nectar}</strong></div>
      <div class="modal-stat"><span>Your Nectar</span><strong id="myNectar">${HiveAuth.getNectar()}</strong></div>

      <button class="btn-secondary ${wanted ? "want-on" : ""}" id="wantBtn">
        ${wanted ? "★ On your Want to Read list — tap to remove" : "Want to Read"}
      </button>

      <button class="btn-primary ${finished ? "done-btn" : ""}" id="finishBtn">
        ${finished ? "✓ Finished — tap to undo" : "Finished Reading"}
      </button>

      <div class="rate-box" id="rateBox">
        <p class="rate-label" id="rateLabel"></p>
        <div class="rate-btns" id="rateBtns"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Close handlers
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeBookModal(); });
  document.getElementById("modalClose").addEventListener("click", closeBookModal);

  // Warning details stay hidden until deliberately revealed (right-click,
  // or Enter/Space when focused so it works without a mouse).
  const spoiler = document.getElementById("warnSpoiler");
  if (spoiler) {
    const toggle = (e) => { e.preventDefault(); spoiler.classList.toggle("revealed"); };
    spoiler.addEventListener("contextmenu", toggle);
    spoiler.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") toggle(e);
    });
  }

  const rateBox = document.getElementById("rateBox");
  const rateLabel = document.getElementById("rateLabel");

  /** Recompute and redraw the HiveScore line from current ratings. */
  function refreshHiveScore() {
    const updated = hiveScore(book);
    document.getElementById("hsVal").textContent = hiveScoreText(updated);
    document.getElementById("hsCount").textContent = hiveScoreCountText(updated);
  }

  // You can only rate a book once you've marked it finished.
  function refreshRateState() {
    const done = HiveAuth.isFinished(book.id);
    const rated = HiveAuth.getUserRating(book.id);
    rateBox.classList.toggle("locked", !done);
    if (!done) rateLabel.textContent = "Finish the book to rate it.";
    else if (rated != null) rateLabel.textContent = `You rated this ${rated}/10 — tap to change:`;
    else rateLabel.textContent = "Rate It (out of 10):";
  }
  refreshRateState();

  // Want to Read → simple toggle
  const wantBtn = document.getElementById("wantBtn");
  function refreshWantBtn() {
    const on = HiveAuth.isWanted(book.id);
    wantBtn.classList.toggle("want-on", on);
    wantBtn.textContent = on ? "★ On your Want to Read list — tap to remove" : "Want to Read";
    const hex = document.querySelector(`.tree-hex[data-book="${book.id}"]`);
    if (hex) hex.classList.toggle("want", on);
  }
  wantBtn.addEventListener("click", () => {
    HiveAuth.toggleWantToRead(book.id);
    refreshWantBtn();
  });

  // Finished Reading → toggle: award Nectar, or undo (remove Nectar) if tapped again
  const finishBtn = document.getElementById("finishBtn");
  finishBtn.addEventListener("click", () => {
    const nowFinished = !HiveAuth.isFinished(book.id);
    const res = nowFinished
      ? HiveAuth.markFinished(book.id, book.nectar)
      : HiveAuth.unmarkFinished(book.id, book.nectar);
    document.getElementById("myNectar").textContent = res.nectar;
    finishBtn.classList.toggle("done-btn", nowFinished);
    finishBtn.textContent = nowFinished ? "✓ Finished — tap to undo" : "Finished Reading";
    const hex = document.querySelector(`.tree-hex[data-book="${book.id}"]`);
    if (hex) hex.classList.toggle("done", nowFinished);

    // Undoing a finish also drops the rating, so clear it from the UI.
    if (!nowFinished) {
      rateBtns.querySelectorAll(".rate-btn").forEach((x) => x.classList.remove("active"));
      refreshHiveScore();
    }
    refreshRateState();
    refreshWantBtn();   // finishing a book takes it off the Want to Read list
  });

  // Rate It → 1..10 buttons (only work when finished)
  const rateBtns = document.getElementById("rateBtns");
  for (let n = 1; n <= 10; n++) {
    const b = document.createElement("button");
    b.className = "rate-btn" + (myRating === n ? " active" : "");
    b.textContent = n;
    b.addEventListener("click", () => {
      if (!HiveAuth.isFinished(book.id)) return;   // locked until finished
      HiveAuth.rateBook(book.id, n);
      rateBtns.querySelectorAll(".rate-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      refreshHiveScore();
      rateLabel.textContent = `You rated this ${n}/10 — tap to change:`;
    });
    rateBtns.appendChild(b);
  }
}

function closeBookModal() {
  const m = document.getElementById("bookModal");
  if (m) m.remove();
}

// Updates from the developer. Add new entries to the top of this list.
const HIVE_UPDATES = [
  { date: "July 2026", title: "Welcome to the Hive! 🐝",
    text: "HiveBooks is just getting started. Check back here for news and updates from the developer." },
];

function renderHive(body) {
  heading(body, "🐝 To the Hive", "News and updates from the developer.");
  if (!HIVE_UPDATES.length) {
    const p = document.createElement("p"); p.className = "empty-note";
    p.textContent = "No updates yet — check back soon! 🐝"; body.appendChild(p); return;
  }
  HIVE_UPDATES.forEach((u) => {
    const card = document.createElement("div"); card.className = "info-card";
    card.innerHTML = `<h3>${u.title}</h3>
      <p style="color:#6b5b40;font-size:0.8rem;margin-bottom:8px;">${u.date}</p>
      <p>${u.text}</p>`;
    body.appendChild(card);
  });
}

function renderProfile(body) {
  heading(body, "👤 Profile", "Update your account details below.");

  // Reading progress
  const stats = document.createElement("div"); stats.className = "info-card";
  stats.innerHTML = `
    <p><strong>🍯 Your Nectar:</strong> ${HiveAuth.getNectar()}</p>
    <p><strong>📚 Books finished:</strong> ${HiveAuth.getFinishedCount()} of ${SAMPLE_BOOKS.length}</p>
    <p><strong>★ Want to Read:</strong> ${HiveAuth.getWantToReadCount()}</p>`;
  body.appendChild(stats);

  // Change username
  const nameCard = document.createElement("div"); nameCard.className = "info-card";
  nameCard.innerHTML = `
    <p style="margin-bottom:12px;"><strong>Current username:</strong> <span id="curName">${HiveAuth.currentUser()}</span></p>
    <label>New username<input type="text" id="newName" /></label>
    <label>Current password<input type="password" id="nameCurPass" /></label>
    <p class="form-msg" id="nameMsg"></p>
    <button class="btn-primary" id="saveName">Change Username</button>`;
  body.appendChild(nameCard);

  // Change password
  const passCard = document.createElement("div"); passCard.className = "info-card";
  passCard.innerHTML = `
    <label>New password<input type="password" id="newPass" /></label>
    <label>Current password<input type="password" id="passCurPass" /></label>
    <p class="form-msg" id="passMsg"></p>
    <button class="btn-primary" id="savePass">Change Password</button>`;
  body.appendChild(passCard);

  document.getElementById("saveName").addEventListener("click", async () => {
    const msg = document.getElementById("nameMsg");
    const r = await HiveAuth.changeUsername(
      document.getElementById("newName").value,
      document.getElementById("nameCurPass").value);
    msg.textContent = r.msg; msg.className = "form-msg " + (r.ok ? "ok" : "error");
    if (r.ok) {
      document.getElementById("curName").textContent = HiveAuth.currentUser();
      document.getElementById("welcomeUser").textContent = "🐝 " + HiveAuth.currentUser();
      document.getElementById("newName").value = "";
      document.getElementById("nameCurPass").value = "";
    }
  });

  // Delete account (permanent)
  const dangerCard = document.createElement("div"); dangerCard.className = "info-card danger-card";
  dangerCard.innerHTML = `
    <p class="danger-title">Delete Account</p>
    <p class="danger-note">This permanently erases your account, your Nectar, your finished
    books and your ratings. This cannot be undone.</p>
    <label>Current password<input type="password" id="delPass" /></label>
    <p class="form-msg" id="delMsg"></p>
    <button class="btn-danger" id="delBtn">Delete My Account</button>`;
  body.appendChild(dangerCard);

  document.getElementById("delBtn").addEventListener("click", async () => {
    const msg = document.getElementById("delMsg");
    const pass = document.getElementById("delPass").value;
    if (!pass) {
      msg.textContent = "Enter your password to confirm.";
      msg.className = "form-msg error";
      return;
    }
    if (!confirm("Delete your HiveBooks account forever? This cannot be undone.")) return;

    const r = await HiveAuth.deleteAccount(pass);
    if (r.ok) {
      showView("auth");
      const authMsg = document.getElementById("authMsg");
      authMsg.textContent = "Your account was deleted.";
      authMsg.className = "form-msg ok";
    } else {
      msg.textContent = r.msg;
      msg.className = "form-msg error";
    }
  });

  document.getElementById("savePass").addEventListener("click", async () => {
    const msg = document.getElementById("passMsg");
    const r = await HiveAuth.changePassword(
      document.getElementById("newPass").value,
      document.getElementById("passCurPass").value);
    msg.textContent = r.msg; msg.className = "form-msg " + (r.ok ? "ok" : "error");
    if (r.ok) {
      document.getElementById("newPass").value = "";
      document.getElementById("passCurPass").value = "";
    }
  });
}

function renderSettings(body) {
  heading(body, "⚙️ Settings", "Preferences will live here.");
  const card = document.createElement("div"); card.className = "info-card";
  card.innerHTML = `<p>Nothing to configure yet — coming soon. 🐝</p>`;
  body.appendChild(card);
}

function renderHelp(body) {
  heading(body, "❓ Help", "Getting around HiveBooks.");
  const card = document.createElement("div"); card.className = "info-card";
  card.innerHTML = `
    <p>• Each hexagon on the home screen takes you somewhere.</p>
    <p>• <strong>To the Honeycomb</strong> — browse all book recommendations.</p>
    <p>• <strong>To the Hive</strong> — the books you've saved.</p>
    <p>• <strong>Log Out</strong> — return to the login screen.</p>`;
  body.appendChild(card);
}

function renderAbout(body) {
  heading(body, "ℹ️ About HiveBooks", null);
  const card = document.createElement("div"); card.className = "info-card";
  card.innerHTML = `
    <p>Hi, I'm Oscar, a 10 year old boy living in California. I have always loved
    reading and started HiveBooks to help other readers find new favorite books.</p>
    <p style="margin-top:12px;">If you have any feedback, I'd like to know! You can contact me at
    <a href="mailto:oscar.e.moran20@gmail.com">oscar.e.moran20@gmail.com</a>.</p>`;
  body.appendChild(card);
}
