/* core.js — shared Wordle engine.
 *
 * Reads window.WORDLE_WORDS = { answers, guesses } from js/words.js and
 * precomputes everything needed to (a) score a guess against an answer the
 * exact same way the real game does, and (b) find the next guess that
 * maximizes information gain (Shannon entropy over the candidate set).
 *
 * The "answers" list is the pool the secret is drawn from: every word NYT
 * has actually used as a puzzle (the classic 2,315 plus every new answer
 * since). The "guesses" list is every word the keyboard will accept; every
 * answer is also a valid guess, but a guess need not be an answer.
 */
(function (global) {
  "use strict";

  const src = global.WORDLE_WORDS;
  if (!src || !Array.isArray(src.answers) || !Array.isArray(src.guesses)) {
    throw new Error("js/words.js must load before core.js");
  }

  const answers = src.answers; // every word NYT has used as a puzzle
  const guesses = src.guesses; // every word the keyboard accepts
  const N = answers.length;
  const G = guesses.length;

  const guessSet = new Set(guesses);
  const answerSet = new Set(answers);

  // ---- precompute codes & letter counts -------------------------------
  const toCode = (w) => {
    const a = new Uint8Array(5);
    for (let i = 0; i < 5; i++) a[i] = w.charCodeAt(i) - 97;
    return a;
  };
  const countsOf = (w) => {
    const c = new Int8Array(26);
    for (let i = 0; i < 5; i++) c[w.charCodeAt(i) - 97]++;
    return c;
  };

  const ansCode = new Array(N); // Uint8Array(5)
  const ansCount = new Array(N); // Int8Array(26)
  for (let i = 0; i < N; i++) {
    ansCode[i] = toCode(answers[i]);
    ansCount[i] = countsOf(answers[i]);
  }
  const gusCode = new Array(G);
  const gusCount = new Array(G);
  for (let i = 0; i < G; i++) {
    gusCode[i] = toCode(guesses[i]);
    gusCount[i] = countsOf(guesses[i]);
  }

  // Indices of every guess, and of the guesses that are also answer words
  // (the solver's pool: every official answer, so the live game always
  // accepts a suggestion).
  const allGuessIndices = [];
  for (let i = 0; i < G; i++) allGuessIndices.push(i);
  const commonGuessIndices = [];
  for (let i = 0; i < G; i++) if (answerSet.has(guesses[i])) commonGuessIndices.push(i);

  // Map each answer index -> its index in the `guesses` array (every answer is
  // an accepted guess). Lets us treat real candidate words as guessable words.
  const guessIndexMap = new Map();
  for (let i = 0; i < G; i++) guessIndexMap.set(guesses[i], i);
  const ansGuessIdx = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const gi = guessIndexMap.get(answers[i]);
    ansGuessIdx[i] = gi === undefined ? -1 : gi; // guard: never alias to guesses[0]
  }

  // ---- scoring --------------------------------------------------------
  // Signature: the five 0/1/2 feedback cells packed into one int (base 3).
  // 0 = gray, 1 = yellow, 2 = green.
  // This two-pass routine (all greens first, then yellows left-to-right,
  // consuming a shared letter pool) is exactly how Wordle handles repeats.
  const rem = new Int8Array(26);
  function signature(gCode, aCode, aCount) {
    rem.set(aCount);
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    if (gCode[0] === aCode[0]) { p0 = 2; rem[gCode[0]]--; }
    if (gCode[1] === aCode[1]) { p1 = 2; rem[gCode[1]]--; }
    if (gCode[2] === aCode[2]) { p2 = 2; rem[gCode[2]]--; }
    if (gCode[3] === aCode[3]) { p3 = 2; rem[gCode[3]]--; }
    if (gCode[4] === aCode[4]) { p4 = 2; rem[gCode[4]]--; }
    if (p0 === 0) { const c = gCode[0]; if (rem[c] > 0) { rem[c]--; p0 = 1; } }
    if (p1 === 0) { const c = gCode[1]; if (rem[c] > 0) { rem[c]--; p1 = 1; } }
    if (p2 === 0) { const c = gCode[2]; if (rem[c] > 0) { rem[c]--; p2 = 1; } }
    if (p3 === 0) { const c = gCode[3]; if (rem[c] > 0) { rem[c]--; p3 = 1; } }
    if (p4 === 0) { const c = gCode[4]; if (rem[c] > 0) { rem[c]--; p4 = 1; } }
    return p0 + p1 * 3 + p2 * 9 + p3 * 27 + p4 * 81;
  }

  const sigToArr = (s) => {
    const a = [0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) { a[i] = s % 3; s = Math.floor(s / 3); }
    return a;
  };

  // Signature of `played` (any 5-letter word) against candidate answer idx.
  const sigOf = (gCode, aIdx) => signature(gCode, ansCode[aIdx], ansCount[aIdx]);

  // ---- public API -----------------------------------------------------
  const isValidGuess = (w) =>
    typeof w === "string" && w.length === 5 && guessSet.has(w);
  const isValidWordLike = (w) => /^[a-z]{5}$/.test(w || "");

  // Feedback array [0..2 x5] for a played word against candidate answer idx.
  const feedbackFor = (played, aIdx) => sigToArr(sigOf(toCode(played), aIdx));

  // Keep only candidates consistent with `played` -> `colors` ([0..2 x5]).
  function filter(candIdx, played, colors) {
    const gCode = toCode(played);
    const target =
      colors[0] + colors[1] * 3 + colors[2] * 9 + colors[3] * 27 + colors[4] * 81;
    const out = [];
    for (const idx of candIdx) if (sigOf(gCode, idx) === target) out.push(idx);
    return out;
  }

  // ---- fallback space: word indices into the *guess* vocabulary ------------
  // If the real answer is newer than our answer list, the candidates are no
  // longer answer words; we then filter and rank over the full list of words
  // the live game accepts (every real answer, past or future, is in it).
  const packColors = (colors) =>
    colors[0] + colors[1] * 3 + colors[2] * 9 + colors[3] * 27 + colors[4] * 81;

  function filterGuesses(candIdx, played, colors) {
    const gi = guessIndexMap.get(played);
    if (gi === undefined) return candIdx.slice(); // played word not in dictionary: no constraint
    const target = packColors(colors);
    const out = [];
    for (const idx of candIdx) if (signature(gusCode[gi], gusCode[idx], gusCount[idx]) === target) out.push(idx);
    return out;
  }

  // Precomputed signature table: sigMat[gi*N + ci] = feedback signature of
  // guess `gi` against answer `ci` (one byte, 0..242). Building it once costs
  // the full ~600ms sweep but makes every subsequent computeBest a cheap
  // batch of array reads. Built lazily on first need (behind the spinner).
  let sigMat = null;
  function ensureSigMat() {
    if (sigMat) return;
    const arr = new Uint8Array(G * N);
    for (let gi = 0; gi < G; gi++) {
      const gc = gusCode[gi];
      let o = gi * N;
      for (let ci = 0; ci < N; ci++) arr[o + ci] = signature(gc, ansCode[ci], ansCount[ci]);
    }
    sigMat = arr;
  }

  // Rank candidate guesses by expected information gain (Shannon entropy in
  // bits) of the feedback they would produce over `candIdx`. Returns the top
  // `top` as [{ word, entropy }] sorted best-first.
  function computeBest(candIdx, opts) {
    const o = opts || {};
    const n = candIdx.length;
    if (n === 0) return [];
    const top = o.top || 5;
    // Which words are allowed as the next guess:
    //  - candidatesOnly: only words still possible (guarantees a winning play
    //    once the set is small);
    //  - commonOnly: guesses that are also answer words;
    //  - otherwise: the full allowed-guess vocabulary.
    // Never re-suggest a word we already played: its feedback is known, so it
    // can only add information if it is a fresh probe. `exclude` is a Set or
    // array of words to skip.
    const ex = o.exclude instanceof Set ? o.exclude : o.exclude ? new Set(o.exclude) : null;
    let consider;
    if (o.candidatesOnly) {
      consider = [];
      for (let i = 0; i < n; i++) {
        const gi = ansGuessIdx[candIdx[i]];
        if (gi >= 0) consider.push(gi);
      }
    } else {
      consider = o.commonOnly ? commonGuessIndices : allGuessIndices;
    }
    ensureSigMat();
    const mat = sigMat;
    const hist = new Int32Array(243);
    const results = [];
    for (let k = 0; k < consider.length; k++) {
      const gi = consider[k];
      if (ex !== null && ex.has(guesses[gi])) continue;
      const base = gi * N;
      hist.fill(0);
      for (let j = 0; j < n; j++) hist[mat[base + candIdx[j]]]++;
      let H = 0;
      for (let b = 0; b < 243; b++) {
        const cnt = hist[b];
        if (cnt) { const pr = cnt / n; H -= pr * Math.log2(pr); }
      }
      results.push({ word: guesses[gi], entropy: H });
    }
    if (results.length === 0 && ex !== null)
      return computeBest(candIdx, { commonOnly: o.commonOnly, candidatesOnly: o.candidatesOnly, top });
    results.sort((a, b) => b.entropy - a.entropy);
    return results.slice(0, top);
  }

  // Same ranking, but over a pool of *guess*-vocabulary indices (fallback
  // mode: the true answer may not be a known NYT answer). The pool is small
  // by construction, so we score pairs on the fly and only ever suggest one
  // of the pool's own words — all of which the live game accepts.
  function computeBestFallback(candIdx, opts) {
    const o = opts || {};
    const n = candIdx.length;
    if (n === 0) return [];
    const ex = o.exclude instanceof Set ? o.exclude : o.exclude ? new Set(o.exclude) : null;
    const results = [];
    const hist = new Int32Array(243);
    for (const gi of candIdx) {
      if (ex !== null && ex.has(guesses[gi])) continue;
      hist.fill(0);
      for (const ci of candIdx) hist[signature(gusCode[gi], gusCode[ci], gusCount[ci])]++;
      let H = 0;
      for (let b = 0; b < 243; b++) {
        const cnt = hist[b];
        if (cnt) { const pr = cnt / n; H -= pr * Math.log2(pr); }
      }
      results.push({ word: guesses[gi], entropy: H });
    }
    if (results.length === 0 && ex !== null) return computeBestFallback(candIdx, null);
    results.sort((a, b) => b.entropy - a.entropy);
    return results.slice(0, 5);
  }

  // First call pays the one-time table build (~600ms), so defer it off the
  // paint tick; later calls are near-instant.
  function computeBestAsync(candIdx, opts, done) {
    setTimeout(() => done(computeBest(candIdx, opts)), 0);
  }
  function computeBestFallbackAsync(candIdx, opts, done) {
    setTimeout(() => done(computeBestFallback(candIdx, opts)), 0);
  }

  // Score any two raw 5-letter words (no table lookup) — used when the
  // secret is a custom word outside the answer pool.
  function feedbackWord(played, word) {
    if (!/^[a-z]{5}$/.test(played || "") || !/^[a-z]{5}$/.test(word || ""))
      throw new Error("feedbackWord needs two 5-letter words");
    return sigToArr(signature(toCode(played), toCode(word), countsOf(word)));
  }

  global.WORDLE = {
    answers,
    guesses,
    N,
    G,
    guessSet,
    answerSet,
    isValidGuess,
    isValidWordLike,
    allCandidates: () => Array.from({ length: N }, (_, i) => i),
    allGuesses: () => allGuessIndices.slice(),
    answerWord: (idx) => answers[idx],
    guessWord: (idx) => guesses[idx],
    feedbackFor,
    feedbackWord,
    filter,
    filterGuesses,
    computeBest,
    computeBestAsync,
    computeBestFallback,
    computeBestFallbackAsync,
    // helpers for the UI
    COLOR: { gray: 0, yellow: 1, green: 2 },
  };
})(window);
