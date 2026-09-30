/* app.js — tab switching between the Solver and Play views. */
(function () {
  "use strict";

  const tabs = document.querySelectorAll(".tab");
  const views = {
    solver: document.getElementById("view-solver"),
    game: document.getElementById("view-game"),
  };

  function activate(name) {
    tabs.forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    for (const key of Object.keys(views)) views[key].hidden = key !== name;
  }

  tabs.forEach((t) =>
    t.addEventListener("click", () => activate(t.dataset.view)),
  );

  // Support ?tab=game / #game deep links.
  const initial = (location.hash || location.search || "solver")
    .replace(/^[#?&=]+/, "")
    .split(/[&=]/)
    .pop();
  activate(views[initial] ? initial : "solver");
})();
