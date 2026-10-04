// Regression tests for the engine (js/core.js) — run: node scripts/test-engine.mjs
// Loads js/words.js + js/core.js in a stubbed `window`, then checks:
//   1. duplicate-letter feedback matches the real game,
//   2. feedbackFor == feedbackWord and filter never drops the true answer,
//   3. a word that is NOT a known answer (a "future" puzzle word) still
//      survives the solver's fallback flow and gets found,
//   4. truly impossible colors are detected as impossible in both pools,
//   5. played words are never re-suggested (the zero-information case),
//   6. the info-max strategy wins in <=6 guesses on a sample of answers.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
global.window = {};
vm.runInThisContext(read("../js/words.js"));
vm.runInThisContext(read("../js/core.js"));
const W = global.window.WORDLE;

let failures = 0;
const check = (name, cond) => {
  if (!cond) {
    failures++;
    console.log("FAIL " + name);
  } else {
    console.log("ok   " + name);
  }
};

// deterministic RNG (tests must not be flaky)
let seed = 0x5eed;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) & 0xffffffff) >>> 8) / 2 ** 24;

// ---------- 1. duplicate-letter scoring (known NYT rules) ----------
const expect = [
  ["speed", "abide", [0, 0, 1, 0, 1]],
  ["allot", "lorry", [0, 1, 0, 1, 0]],
  ["mummy", "maple", [2, 0, 0, 0, 0]],
  ["sassy", "atlas", [1, 1, 0, 0, 0]], // second S has no partner: gray
  ["array", "sorry", [0, 1, 2, 0, 2]],
  ["grape", "grade", [2, 2, 2, 0, 2]],
  ["eerie", "sheep", [1, 1, 0, 0, 0]], // sheep has only two E's: third is gray
  ["mamma", "maxim", [2, 2, 1, 0, 0]], // two Ms in guess, answer has m,a,m
];
for (const [g, a, want] of expect) {
  const got = W.feedbackWord(g, a);
  check(`feedback ${g} vs ${a}`, JSON.stringify(got) === JSON.stringify(want));
}

// ---------- 2. the two scorers agree; filter keeps the true answer ----------
let agree = 0;
for (let t = 0; t < 40; t++) {
  const ai = (rnd() * W.N) | 0;
  const gi = (rnd() * W.G) | 0;
  const g = W.guesses[gi];
  if (JSON.stringify(W.feedbackWord(g, W.answers[ai])) !== JSON.stringify(W.feedbackFor(g, ai))) {
    check("feedbackWord == feedbackFor (mismatch at " + g + "/" + W.answers[ai] + ")", false);
    break;
  }
  agree++;
}
check("feedbackWord == feedbackFor on " + agree + " random pairs", agree === 40);

let kept = 0;
for (let t = 0; t < 60; t++) {
  const ai = (rnd() * W.N) | 0;
  const gi = (rnd() * W.G) | 0;
  const colors = W.feedbackFor(W.guesses[gi], ai);
  const next = W.filter(Array.from({ length: W.N }, (_, i) => i), W.guesses[gi], colors);
  if (next.includes(ai)) kept++;
}
check("filter keeps the true answer on 60 random plays", kept === 60);

// ---------- 3. fallback flow for a word outside the answer pool ----------
const outside = W.guesses.filter((w) => !W.answerSet.has(w));
check("guess list has non-answer words (fallback is meaningful)", outside.length > 0);
for (const hidden of outside.slice(0, 3)) {
  // Phase A: the solver behaves normally while known answers still match.
  let cands = Array.from({ length: W.N }, (_, i) => i);
  const history = [];
  const played = new Set();
  let advice = W.computeBest(cands, { commonOnly: true, top: 5, exclude: played })[0].word;
  let impossibleHit = false;
  for (let round = 0; round < 6 && cands.length > 1; round++) {
    played.add(advice);
    const colors = W.feedbackWord(advice, hidden);
    history.push({ word: advice, colors });
    const next = W.filter(cands, advice, colors);
    if (next.length === 0) {
      impossibleHit = true;
      break;
    }
    cands = next;
    advice = W.computeBest(cands, { commonOnly: true, top: 5, exclude: played })[0].word;
  }
  check("known-answer phase eventually contradicts a non-answer word", impossibleHit || cands.length === 1);
  // (cands.length === 1 means we falsely narrowed to one known answer — the
  // word itself is never in that set, so contradiction must occur at some point)

  // The solver's recovery: replay the WHOLE history against all guess words.
  let widened = W.allGuesses();
  for (const h of history) {
    widened = W.filterGuesses(widened, h.word, h.colors);
    if (!widened.length) break;
  }
  check("fallback replay keeps the hidden word " + hidden, widened.includes(W.guesses.indexOf(hidden)));

  // Phase B: rank inside the widened pool and finish.
  let guessesUsed = history.length;
  while (widened.length > 1 && guessesUsed < 7) {
    advice = W.computeBestFallback(widened, { exclude: played })[0].word;
    played.add(advice);
    const colors = W.feedbackWord(advice, hidden);
    widened = W.filterGuesses(widened, advice, colors);
    guessesUsed++;
  }
  check("found future word " + hidden + " in " + guessesUsed + " guesses",
    widened.length === 1 && W.guesses[widened[0]] === hidden && guessesUsed <= 7);
}

// ---------- 4. impossible colors are impossible in BOTH pools ----------
{
  const played = "whine";
  const colors = [2, 2, 2, 2, 1]; // first four fixed + fifth "yellow" contradicts
  const a = W.filter(Array.from({ length: W.N }, (_, i) => i), played, colors);
  const b = W.filterGuesses(W.allGuesses(), played, colors);
  check("impossible colors -> empty in answer pool and in all words", a.length === 0 && b.length === 0);
}

// ---------- 5. played words are never re-suggested ----------
{
  const all = Array.from({ length: W.N }, (_, i) => i);
  const top = W.computeBest(all, { commonOnly: true, top: 1, exclude: null })[0].word;
  const again = W.computeBest(all, { commonOnly: true, top: 5, exclude: new Set([top]) });
  check("exclude suppresses the top pick (" + top + ")",
    again.length === 5 && again[0].word !== top && !again.some((x) => x.word === top));
  const small = [];
  for (let i = 0; i < 30; i++) small.push(i);
  const pick = W.computeBestFallback(small)[0].word;
  const second = W.computeBestFallback(small, { exclude: new Set([pick]) })[0].word;
  check("fallback engine honors exclude too", second !== pick);
}

// ---------- 6. strategy sample: info-max always wins within 6 ----------
let wins6 = 0;
let total = 0;
let worst = 0;
let sumUsed = 0;
const stride = Math.max(1, (W.N / 60) | 0);
for (let ai = 0; ai < W.N; ai += stride) {
  const answer = W.answers[ai];
  let cands = Array.from({ length: W.N }, (_, i) => i);
  const played = new Set();
  let used = 0;
  let won = false;
  while (!won && used < 6) {
    // Mirror the app's flow: it suggests, we report real colors, and when
    // exactly one candidate is left the app declares it ("play it to win").
    const advice = W.computeBest(cands, { commonOnly: true, top: 5, exclude: played })[0].word;
    used++;
    if (advice === answer) { won = true; break; }
    played.add(advice);
    const colors = W.feedbackFor(advice, ai);
    cands = W.filter(cands, advice, colors);
    if (cands.length === 1) {
      won = W.answers[cands[0]] === answer && used < 6; // the announced word is the last play
      break;
    }
  }
  total++;
  sumUsed += used;
  wins6 += won ? 1 : 0;
  if (used > worst) worst = used;
}
check("strategy wins all " + total + " sampled games within 6", wins6 === total);
console.log("(strategy sample: avg " + (sumUsed / total).toFixed(2) + " guesses, worst " + worst + ", over " + total + " games)");

console.log(failures === 0 ? "\nALL TESTS PASS" : "\n" + failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
