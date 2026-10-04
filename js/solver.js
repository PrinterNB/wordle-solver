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
  let pool = "answers"; // "answers" = every candidate is a real NYT answer; "fallback" = any valid word
  const playedWords = new Set(); // words already played: never worth suggesting again
  let recommended = null;
  let reportColors = FRESH();
  let history = [];
  let solvedWord = null;
  let won = false; // the announced word was played and confirmed — the game is over

  const NOTE_DEFAULT =
    "Every suggestion is a word NYT has actually used as a puzzle, so the game will always accept it.";
  const noteEl = document.getElementById("solver-note");
  function setNote(text) {
    if (noteEl) noteEl.textContent = text;
  }

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
    // alts[0] is the recommended word itself — it is already on the tiles, so
    // only the runners-up belong in the "Also strong" chips.
    for (const a of (alts || []).slice(1, 5)) {
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
        if (won) return;
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
  function showAdvice(alts) {
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
  }

  function computeNextBest() {
    if (solvedWord) return;
    computing.classList.remove("hidden");
    commitBtn.disabled = true;
    // Let the spinner paint before the (first) ~600 ms sweep.
    // While every candidate is still a real NYT answer, suggest from that
    // pool (the live game is guaranteed to accept it). In fallback mode the
    // pool itself is the set of possible words — rank inside it instead.
    if (pool === "answers")
      W.computeBestAsync(candidates, { commonOnly: true, top: 5, exclude: playedWords }, showAdvice);
    else
      W.computeBestFallbackAsync(candidates, { exclude: playedWords }, showAdvice);
  }

  function newRound() {
    candidates = W.allCandidates();
    pool = "answers";
    playedWords.clear();
    history = [];
    solvedWord = null;
    won = false;
    recommended = null;
    reportColors = FRESH();
    wordInput.value = "";
    wordInput.dataset.mirror = "";
    clearFlash();
    setNote(NOTE_DEFAULT);
    renderBest();
    renderAlts([]);
    renderCount();
    renderHistory();
    renderReport();
    computeNextBest();
  }

  function commitGuess() {
    if (won) return;
    const played = (wordInput.value || "").toLowerCase();
    if (!W.isValidWordLike(played)) {
      flash("Type the 5-letter word you played first.", true);
      wordInput.focus();
      return;
    }
    if (!W.isValidGuess(played)) {
      flash("That word isn't in Wordle's dictionary — check the spelling of what you played.", true);
      return;
    }
    if (reportColors.some((c) => c === UNSET)) {
      flash("Set a color on all 5 letters — click each tile to cycle.", true);
      return;
    }
    const playedReport = { word: played, colors: reportColors.slice() };
    playedWords.add(played); // it was typed because it was played in the real game

    // If the announced last candidate was just played and the game confirmed
    // it all-green, that is a win — report it instead of re-announcing.
    if (candidates.length === 1) {
      const announced = pool === "answers" ? W.answerWord(candidates[0]) : W.guessWord(candidates[0]);
      if (played === announced && reportColors.every((c) => c === 2)) {
        history.push(playedReport);
        renderHistory();
        won = true;
        flash("That's it — you win! 🎉", false);
        return;
      }
    }
    solvedWord = null; // any accepted report supersedes a pending announcement

    let next =
      pool === "answers"
        ? W.filter(candidates, played, reportColors)
        : W.filterGuesses(candidates, played, reportColors);

    if (next.length === 0 && pool === "answers") {
      // No known NYT answer could have produced these colors. Today's answer
      // may postdate our list — replay the whole reported history against the
      // full dictionary of words the live game accepts.
      let widened = W.allGuesses();
      for (const h of history.concat([playedReport])) {
        widened = W.filterGuesses(widened, h.word, h.colors);
        if (!widened.length) break;
      }
      if (widened.length) {
        pool = "fallback";
        next = widened;
        setNote(
          "No official NYT answer fits your colors, so I widened the search to all " +
            W.G.toLocaleString() +
            " words the game accepts. The real answer may be newer than my answer list."
        );
      } else {
        flash("Those colors can't happen in Wordle — double-check what the game showed.", true);
        reportTiles.classList.add("shake");
        setTimeout(() => reportTiles.classList.remove("shake"), 500);
        return;
      }
    } else if (next.length === 0) {
      flash("Those colors can't happen in Wordle — double-check what the game showed.", true);
      reportTiles.classList.add("shake");
      setTimeout(() => reportTiles.classList.remove("shake"), 500);
      return;
    }
    candidates = next;
    history.push(playedReport);
    renderCount();
    renderHistory();
    clearFlash();

    if (candidates.length === 1) {
      solvedWord = pool === "answers" ? W.answerWord(candidates[0]) : W.guessWord(candidates[0]);
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
