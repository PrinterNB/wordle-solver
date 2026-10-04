# Wordle Solver & Play

A small, dependency-free website with two tabs:

- **🧠 Solver** — plays the *real* Wordle by proxy. It shows the best next guess,
  you play it in the actual game, then tap the tiles to report what each letter
  landed as (gray → yellow → green). It narrows the candidate set and hands you
  the next best guess. Repeat until solved. You can also type any word of your
  own instead of the suggestion.
- **🎮 Play** — a fully playable Wordle clone on the same word list, with a
  QWERTY keyboard, flip/shake animations, and keyboard state. Play a random
  secret or set your own answer word — any word the real game accepts, not
  just known past answers.

No build step and no libraries — just HTML/CSS/JS. Open `index.html` directly,
or serve the folder (e.g. `python -m http.server` / `npx serve`).

## The algorithm

The solver plays **maximum information gain** (Shannon entropy): on each turn it
scores every allowed guess by the entropy of the feedback it would produce over
the remaining possible answers, and picks the guess that maximizes that.

- **Vocabulary:** in normal mode the solver suggests only from the official answer
  list — every word NYT has actually used as a puzzle (**2,376** words) — which is
  guaranteed to be accepted by the live game. The wider **14,856**-word guess
  dictionary validates everything you type; it becomes the suggestion pool only in
  the widened fallback mode described below, where no known answer fits.
- **No replays:** a word you already played is never suggested again — it can add
  no new information.
- **Candidate pool:** the same **2,376** words NYT has actually used as answers,
  so the secret can't be something the solver has never heard of.
- **Future answers:** if your reported colors rule out *every* known answer
  (which happens when the live puzzle is newer than the answer list), the
  solver doesn't reject them — it replays your whole history against the full
  **14,856**-word dictionary the game accepts and keeps solving from there.
  Every real Wordle answer, past or future, is in that dictionary, so the
  current puzzle is always findable. The page says when it has switched to
  this widened mode.
- **Feedback** uses the exact two-pass Wordle scoring (greens first, then
  yellows left-to-right against a shared letter pool), so duplicate letters are
  handled identically to the real game.
- Once only one candidate remains, it tells you to play that word to win.

### Measured performance

Swept over **all 2,376** possible answers, playing its own advice:

| Metric | Value |
| --- | --- |
| Average guesses to win | **3.68** |
| Wins within 5 guesses | **99.9%** |
| Wins within 6 (standard game) | **100%** |
| Worst case | 6 guesses (`HOVER`) |

The one-time cost of building the 14,856 × 2,376 signature table (~600 ms)
happens once behind the spinner; every guess after that is a fast array lookup
(~30 ms over the full pool, single-digit ms on a typical narrowed set).

## Word lists

- **Answers** (2,376): every word NYT has actually used as a puzzle — the
  classic 2,315-word pool plus the new answers NYT has added since (the list
  is still being replenished as of 2026).
- **Guesses** (14,856): the full dictionary the live game's keyboard accepts,
  scraped directly from the game's own JavaScript bundle. Every answer is a
  valid guess.

`js/words.js` is **generated** and checked in so the site works with zero setup.
To regenerate it after updating the sources, run:

```sh
node scripts/build-words.mjs
```

(That script reads the scratch inputs `.npmwordle/…`, `.full_words.txt`,
`.live_dictionary.json`, and `.answer_history.txt`, all git-ignored.)

## Project layout

```
index.html          the page + both views
css/style.css       styling (Wordle colors, dark theme, animations)
js/words.js         (generated) window.WORDLE_WORDS = { answers, guesses }
js/core.js          shared engine: scoring, filtering, information gain
js/solver.js        the Solver tab
js/game.js          the Play Wordle tab
js/app.js           tab switching
scripts/build-words.mjs  regenerates js/words.js
scripts/test-engine.mjs  regression tests for the engine (run: node scripts/test-engine.mjs)
```

## Notes

- This is an unofficial, non-interactive companion to the NYT game — not
  affiliated with The New York Times Company.
- The solver suggests the statistically best guess; it doesn't track your
  attempts against the 6-guess limit, so it's a "what should I play" oracle.
