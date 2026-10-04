/* game.js — a playable Wordle clone using the same word list.
 *
 * A random word from the current NYT answer pool is the secret (or you set
 * your own — any word the game accepts, so future puzzle words work too).
 * Submit guesses with the on-screen or physical keyboard; the keyboard
 * letters tint by their best observed result, and tiles flip green/yellow/gray
 * just like the real game. Six tries.
 */
(function () {
  "use strict";

  const W = window.WORDLE;
  const $ = (id) => document.getElementById(id);

  const MAX_ROWS = 6;
  const COLS = 5;

  const gameView = $("view-game");
  const grid = $("game-grid");
  const keyboard = $("game-keyboard");
  const msgEl = $("game-msg");
  const newGameBtn = $("game-new");
  const customAnswer = $("game-custom");
  const customApply = $("game-custom-apply");

  const gameVisible = () =>
    !gameView || (gameView.style.display !== "none" && !gameView.hasAttribute("hidden"));

  // Per-letter keyboard color rank, worst-first so later better results win.
  const RANK = { 0: 1, 1: 2, 2: 3 }; // gray, yellow, green
  const keyColor = Object.create(null); // 'a' -> 1|2|3
  const COLOR_CLASS = ["c-gray", "c-yellow", "c-green"];

  let answer = "";
  let answerIndex = 0;
  let row = 0, col = 0;
  let cells = []; // MAX_ROWS x COLS tile elements
  let current = "";
  let over = false;

  // ---------- board ----------
  function buildGrid() {
    grid.innerHTML = "";
    cells = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      const rr = [];
      for (let c = 0; c < COLS; c++) {
        const d = document.createElement("div");
        d.className = "tile";
        grid.appendChild(d);
        rr.push(d);
      }
      cells.push(rr);
    }
  }

  const cellAt = (r, c) => cells[r][c];

  function reveal(r, colors) {
    for (let c = 0; c < COLS; c++) {
      const el = cellAt(r, c);
      const cc = colors[c];
      setTimeout(() => {
        el.classList.add(COLOR_CLASS[cc], "flip");
        setTimeout(() => el.classList.remove("flip"), 650);
      }, 140 * c);
    }
    const guess = current;
    for (let c = 0; c < COLS; c++) {
      const letter = guess[c];
      const rank = RANK[colors[c]];
      if (rank > (keyColor[letter] || 0)) {
        keyColor[letter] = rank;
        paintKey(letter, rank);
      }
    }
  }

  function paintKey(letter, rank) {
    const btn = keyboard.querySelector('button[data-key="' + letter + '"]');
    if (!btn) return;
    btn.className = "key" + (rank === 3 ? " green" : rank === 2 ? " yellow" : rank === 1 ? " gray" : "");
  }

  // ---------- input ----------
  function addLetter(l) {
    if (over || col >= COLS) return;
    current = current.slice(0, col) + l + current.slice(col);
    const el = cellAt(row, col);
    el.textContent = l.toUpperCase();
    el.classList.add("filled", "pop");
    setTimeout(() => el.classList.remove("pop"), 120);
    col++;
  }

  function backspace() {
    if (over || col <= 0) return;
    col--;
    current = current.slice(0, col) + current.slice(col + 1);
    cellAt(row, col).textContent = "";
    cellAt(row, col).classList.remove("filled");
  }

  function commit() {
    if (over || current.length < COLS) return;
    const guess = current;

    if (!W.isValidGuess(guess)) {
      flash("Not in the word list", true);
      shakeRow(row);
      return;
    }

    // Fast path for pool answers (precomputed tables); generic path for
    // custom answers outside the answer pool (any word the game accepts).
    const colors =
      answerIndex >= 0 ? W.feedbackFor(guess, answerIndex) : W.feedbackWord(guess, answer);
    reveal(row, colors);

    if (guess === answer) {
      over = true;
      setTimeout(() => flash("You got it! 🎉 in " + ordinal(row + 1), false), 150 * COLS);
      return;
    }
    row++;
    col = 0;
    current = "";
    if (row >= MAX_ROWS) {
      over = true;
      setTimeout(() => flash("The answer was " + answer.toUpperCase() + ".", true), 150 * COLS);
    }
  }

  function shakeRow(r) {
    for (let c = 0; c < COLS; c++) {
      const el = cellAt(r, c);
      el.classList.add("shake");
      setTimeout(() => el.classList.remove("shake"), 500);
    }
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function flash(msg, isErr) {
    msgEl.textContent = msg;
    msgEl.className = "game-msg " + (isErr ? "err" : "");
  }

  // ---------- game lifecycle ----------
  function startGame(overrideAnswer) {
    // Accept any word the game accepts as a secret — including words that
    // are not (yet) known NYT answers, so future puzzle words work too.
    if (overrideAnswer && (W.answerSet.has(overrideAnswer) || W.guessSet.has(overrideAnswer)))
      answer = overrideAnswer;
    else answer = W.answers[(Math.random() * W.N) | 0];
    answerIndex = W.answers.indexOf(answer);
    row = 0; col = 0; current = ""; over = false;
    for (const k of Object.keys(keyColor)) delete keyColor[k];
    keyboard.querySelectorAll("button").forEach((b) => (b.className = "key"));
    buildGrid();
    flash("Answer set. Make your guesses!", false);
    if (document.activeElement === customAnswer) customAnswer.blur();
  }

  // ---------- physical keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (!gameVisible()) return;
    if (document.activeElement === customAnswer) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); commit(); return; }
    if (k === "Backspace") { e.preventDefault(); backspace(); return; }
    if (k === "Escape") { startGame(); return; }
    if (k.length === 1 && /^[a-z]$/i.test(k)) addLetter(k.toLowerCase());
  });

  // ---------- on-screen keyboard ----------
  const LAYOUT = [
    { keys: "qwertyuiop" },
    { keys: "asdfghjkl" },
    { enter: true, keys: "zxcvbnm", back: true }, // official placement: ENTER first, ⌫ last
  ];

  function buildKeyboard() {
    const frag = document.createDocumentFragment();
    for (const ln of LAYOUT) {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      if (ln.enter) rowEl.appendChild(keyBtn("ENTER", "enter", "wide"));
      for (const k of ln.keys) rowEl.appendChild(keyBtn(k.toUpperCase(), k, ""));
      if (ln.back) rowEl.appendChild(keyBtn("⌫", "back", "wide"));
      frag.appendChild(rowEl);
    }
    keyboard.appendChild(frag);
  }

  function keyBtn(label, k, extra) {
    const b = document.createElement("button");
    b.className = "key" + (extra ? " " + extra : "");
    b.textContent = label;
    b.dataset.key = k;
    b.addEventListener("click", () => {
      if (k === "back") backspace();
      else if (k === "enter") commit();
      else addLetter(k);
    });
    return b;
  }

  // ---------- wiring ----------
  newGameBtn.addEventListener("click", () => { customAnswer.value = ""; startGame(); });
  customApply.addEventListener("click", () => {
    const v = (customAnswer.value || "").toLowerCase();
    if (!W.answerSet.has(v) && !W.guessSet.has(v)) { flash("That's not a word the game accepts.", true); return; }
    startGame(v);
  });

  buildKeyboard();
  startGame();
})();
