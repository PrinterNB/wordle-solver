/* solver.js — the "solve my game" tab.
 *
 * Flow: we show the best next guess (max information gain). You play that
 * word in the real game, then report back which letters landed where by
 * clicking the report tiles (gray -> yellow -> green). We narrow the
 * candidate set and compute the next best guess. Repeat.
 */
(function () {
  "use strict";

  const W = window.WORDLE;
  const $ = (id) => document.getElementById(id);

  const bestTiles = $("solver-best-tiles");
  const bestAlts = $("solver-alts");
  const computing = $("solver-computing");
  const reportTiles = $("solver-report-tiles");
  const wordInput = $("solver-word");
  const commitBtn = $("solver-commit");
  const resetBtn = $("solver-reset");
  const msgEl = $("solver-msg");
  const historyEl = $("solver-history");
  const countEl = $("solver-count");

  const UNSET = -1;
  const FRESH = () => [UNSET, UNSET, UNSET, UNSET, UNSET];

  let candidates = W.allCandidates();
  let recommended = null;
  let reportColors = FRESH();
  let history = [];
  let solvedWord = null;

  // ---------- rendering ----------
  function addTile(row, letter, color, cls) {
    const t = document.createElement("div");
    t.className = ("tile " + cls + (color >= 0 ? " c" + color : "")).trim();
    t.textContent = letter || "·";
    row.appendChild(t);
    return t;
  }

  function renderBest() {
    bestTiles.innerHTML = "";
    if (!recommended) return;
    for (const ch of recommended) addTile(bestTiles, ch.toUpperCase(), -1, "big");
  }

  function renderAlts(alts) {
    bestAlts.innerHTML = "";
    for (const a of (alts || []).slice(0, 4)) {
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = a.word.toUpperCase();
      bestAlts.appendChild(s);
    }
  }

  function renderReport() {
    reportTiles.innerHTML = "";
    const word = (wordInput.value || "").toLowerCase();
    for (let i = 0; i < 5; i++) {
      const c = reportColors[i];
      const t = addTile(reportTiles, word[i] ? word[i].toUpperCase() : "_", c === UNSET ? -1 : c, "report");
      t.title = "Click to cycle: gray → yellow → green";
      t.addEventListener("click", () => {
        if (solvedWord) return;
        const cur = reportColors[i];
        reportColors[i] = cur === UNSET ? 0 : cur === 0 ? 1 : cur === 1 ? 2 : UNSET;
        renderReport();
      });
    }
  }

  function renderCount() {
    countEl.textContent = candidates.length.toLocaleString();
  }

  function renderHistory() {
    historyEl.innerHTML = history.length ? "<div class='card-label'>Your guesses</div>" : "";
    for (const h of history) {
      const row = document.createElement("div");
      row.className = "tile-row small";
      for (let i = 0; i < 5; i++) addTile(row, h.word[i].toUpperCase(), h.colors[i], "mini");
      historyEl.appendChild(row);
    }
    historyEl.classList.toggle("hidden", !history.length);
  }

  function flash(msg, isErr) {
    msgEl.textContent = msg;
    msgEl.className = "solver-msg " + (isErr ? "err" : "");
  }
  const clearFlash = () => flash("", false);

  // ---------- computing the recommendation ----------
  function computeNextBest() {
    if (solvedWord) return;
    computing.classList.remove("hidden");
    commitBtn.disabled = true;
    // Let the spinner paint before the (first) ~600 ms sweep.
    // Always draw from the official 2,315-word answer list — every one of
    // those words is accepted by the live NYT game, unlike some of the
    // obscure extras in the full 14,855-word guess dictionary.
    W.computeBestAsync(
      candidates,
      { commonOnly: true, top: 5 },
      (alts) => {
        computing.classList.add("hidden");
        commitBtn.disabled = false;
        if (!alts.length) return;
        recommended = alts[0].word;
        renderBest();
        renderAlts(alts);
        // Pre-fill the report with the suggestion unless the user already typed something.
        if (wordInput.value.toLowerCase() === "" || wordInput.dataset.mirror === recommended) {
          wordInput.value = recommended;
          wordInput.dataset.mirror = recommended;
          reportColors = FRESH();
          renderReport();
        }
      },
    );
  }

  function newRound() {
    candidates = W.allCandidates();
    history = [];
    solvedWord = null;
    recommended = null;
    reportColors = FRESH();
    wordInput.value = "";
    wordInput.dataset.mirror = "";
    clearFlash();
    renderBest();
    renderAlts([]);
    renderCount();
    renderHistory();
    renderReport();
    computeNextBest();
  }

  function commitGuess() {
    if (solvedWord) return;
    const played = (wordInput.value || "").toLowerCase();
    if (!W.isValidWordLike(played)) {
      flash("Type the 5-letter word you played first.", true);
      wordInput.focus();
      return;
    }
    if (reportColors.some((c) => c === UNSET)) {
      flash("Set a color on all 5 letters — click each tile to cycle.", true);
      return;
    }
    const next = W.filter(candidates, played, reportColors);
    if (next.length === 0) {
      flash("No word matches those colors — double-check them.", true);
      reportTiles.classList.add("shake");
      setTimeout(() => reportTiles.classList.remove("shake"), 500);
      return;
    }
    candidates = next;
    history.push({ word: played, colors: reportColors.slice() });
    renderCount();
    renderHistory();
    clearFlash();

    if (candidates.length === 1) {
      solvedWord = W.answerWord(candidates[0]);
      recommended = solvedWord;
      renderBest();
      renderAlts([]);
      flash("It's " + solvedWord.toUpperCase() + " — play it to win (guess #" + (history.length + 1) + "). 🎉", false);
      return;
    }
    reportColors = FRESH();
    wordInput.value = "";
    wordInput.dataset.mirror = "";
    renderReport();
    computeNextBest();
  }

  // ---------- wiring ----------
  wordInput.addEventListener("input", () => {
    const v = wordInput.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
    if (v !== wordInput.value) wordInput.value = v;
    reportColors = FRESH();
    renderReport();
  });
  wordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitGuess();
  });
  commitBtn.addEventListener("click", commitGuess);
  resetBtn.addEventListener("click", newRound);

  newRound();
})();
