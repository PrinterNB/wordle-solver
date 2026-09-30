# Wordle Solver & Play

A small, dependency-free website with two tabs:

- **🧠 Solver** — plays the *real* Wordle by proxy. It shows the best next guess,
  you play it in the actual game, then tap the tiles to report what each letter
  landed as (gray → yellow → green). It narrows the candidate set and hands you
  the next best guess. Repeat until solved. You can also type any word of your
  own instead of the suggestion.
- **🎮 Play** — a fully playable Wordle clone on the same word list, with a
  QWERTY keyboard, flip/shake animations, and keyboard state. Play a random
  secret or set your own answer word.

No build step and no libraries — just HTML/CSS/JS. Open `index.html` directly,
or serve the folder (e.g. `python -m http.server` / `npx serve`).

## The algorithm

The solver plays **maximum information gain** (Shannon entropy): on each turn it
scores every allowed guess by the entropy of the feedback it would produce over
the remaining possible answers, and picks the guess that maximizes that.

- **Vocabulary:** the full **14,855** words the NYT Wordle keyboard accepts — not
  just answer words — so it can play high-information obscure openers like
  `TARSE`, `SOARE`, `ROATE` that a restricted list can't.
- **Candidate pool:** the **2,315** words NYT has actually used as answers.
- **Feedback** uses the exact two-pass Wordle scoring (greens first, then
  yellows left-to-right against a shared letter pool), so duplicate letters are
  handled identically to the real game.
- Once only one candidate remains, it tells you to play that word to win.

### Measured performance

Swept over **all 2,315** possible answers, playing its own advice:

| Metric | Value |
| --- | --- |
| Average guesses to win | **4.12** |
| Wins within 5 guesses | ~96% |
| Wins within 6 (standard game) | **99.5%** |
| Worst case | 6 guesses |

The one-time cost of building the 14,855 × 2,315 signature table (~600 ms)
happens once behind the spinner; every guess after that is a fast array lookup
(~40 ms full pool, ~9 ms on a typical narrowed set).

## Word lists

- **Answers** (2,315): the standard NYT answer pool.
- **Guesses** (14,855): the union of that pool's "rest" list and the full
  allowed-guess list from [`tabatkins/wordle-list`](https://github.com/tabatkins/wordle-list),
  taken straight from the game's source. Every answer is a valid guess.

`js/words.js` is **generated** and checked in so the site works with zero setup.
To regenerate it after updating the sources, run:

```sh
node scripts/build-words.mjs
```

(That script reads the scratch inputs `.npmwordle/…` and `.full_words.txt`, both
git-ignored.)

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
```

## Notes

- This is an unofficial, non-interactive companion to the NYT game — not
  affiliated with The New York Times Company.
- The solver suggests the statistically best guess; it doesn't track your
  attempts against the 6-guess limit, so it's a "what should I play" oracle.
