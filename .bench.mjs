import fs from "fs";
globalThis.window = globalThis;
eval(fs.readFileSync("js/words.js", "utf8"));
const guesses = globalThis.WORDLE_WORDS.guesses, G = guesses.length;

const toCode = (w) => { const a = new Uint8Array(5); for (let i = 0; i < 5; i++) a[i] = w.charCodeAt(i) - 97; return a; };
const countsOf = (w) => { const c = new Int8Array(26); for (let i = 0; i < 5; i++) c[w.charCodeAt(i) - 97]++; return c; };
const code = new Array(G), count = new Array(G);
for (let i = 0; i < G; i++) { code[i] = toCode(guesses[i]); count[i] = countsOf(guesses[i]); }

const rem = new Int8Array(26);
function signature(gC, aC, aCnt) {
  rem.set(aCnt);
  let p0 = 0, p1 = 0, p2 = 0, p3 = 0, p4 = 0;
  if (gC[0] === aC[0]) { p0 = 2; rem[gC[0]]--; }
  if (gC[1] === aC[1]) { p1 = 2; rem[gC[1]]--; }
  if (gC[2] === aC[2]) { p2 = 2; rem[gC[2]]--; }
  if (gC[3] === aC[3]) { p3 = 2; rem[gC[3]]--; }
  if (gC[4] === aC[4]) { p4 = 2; rem[gC[4]]--; }
  if (p0 === 0) { const c = gC[0]; if (rem[c] > 0) { rem[c]--; p0 = 1; } }
  if (p1 === 0) { const c = gC[1]; if (rem[c] > 0) { rem[c]--; p1 = 1; } }
  if (p2 === 0) { const c = gC[2]; if (rem[c] > 0) { rem[c]--; p2 = 1; } }
  if (p3 === 0) { const c = gC[3]; if (rem[c] > 0) { rem[c]--; p3 = 1; } }
  if (p4 === 0) { const c = gC[4]; if (rem[c] > 0) { rem[c]--; p4 = 1; } }
  return p0 + p1 * 3 + p2 * 9 + p3 * 27 + p4 * 81;
}

console.time("build GxG");
const mat = new Uint8Array(G * G);
for (let si = 0; si < G; si++) {
  const sc = code[si]; let o = si * G;
  for (let ci = 0; ci < G; ci++) mat[o + ci] = signature(sc, code[ci], count[ci]);
}
console.timeEnd("build GxG");
console.log("table:", mat.length, "bytes ~", (mat.length / 1e6).toFixed(1), "MB");

const idxMap = new Map(); guesses.forEach((w, i) => idxMap.set(w, i));
function computeBest(cand) {
  const n = cand.length, hist = new Int32Array(243), results = [];
  for (let si = 0; si < G; si++) {
    const base = si * G; hist.fill(0);
    for (let j = 0; j < n; j++) hist[mat[base + cand[j]]]++;
    let H = 0; for (let b = 0; b < 243; b++) { const c = hist[b]; if (c) { const pr = c / n; H -= pr * Math.log2(pr); } }
    results.push([guesses[si], H]);
  }
  results.sort((a, b) => b[1] - a[1]);
  return results;
}

// timing of one turn-1 computeBest (full candidate set)
const all = Array.from({ length: G }, (_, i) => i);
console.time("computeBest turn1");
const t1 = computeBest(all)[0][0];
console.timeEnd("computeBest turn1");
console.log("turn-1 best guess:", t1);

function simulate(secIdx) {
  let cand = all, tries = 0;
  while (cand.length > 1 && tries < 6) {
    const best = computeBest(cand)[0][0];
    const bIdx = idxMap.get(best); tries++;
    if (best === guesses[secIdx]) return tries;
    const fb = mat[bIdx * G + secIdx];
    cand = cand.filter((ci) => mat[bIdx * G + ci] === fb);
  }
  return cand.length === 1 ? tries + 1 : 99;
}

// realistic secrets: a spread of real answers + obscure never-used words (the future-proof case)
const answers = globalThis.WORDLE_WORDS.answers;
const samples = [];
for (let i = 0; i < answers.length; i += Math.floor(answers.length / 40)) samples.push(idxMap.get(answers[i]));
for (let i = 0; i < G; i += Math.floor(G / 30)) samples.push(i); // 30 random obscure words
console.log("simulating", samples.length, "secrets (real + obscure)");
console.time("simulate");
let total = 0; const dist = {};
for (const s of samples) { const g = simulate(s); total += g; dist[g] = (dist[g] || 0) + 1; }
console.timeEnd("simulate");
console.log("avg guesses:", (total / samples.length).toFixed(3), "dist:", JSON.stringify(dist));
