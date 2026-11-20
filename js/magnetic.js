/**
 * js/magnetic.js — every link leans slightly towards a nearby pointer (all pages)
 *
 * When the pointer comes close, a link drifts a couple of pixels towards it
 * and springs back when it leaves (the easing lives in base.css). The pull is
 * written as --pull-x / --pull-y on each link. Links added later (e.g. the
 * project page's next/previous links) are picked up automatically.
 *
 * Left out on purpose: big link areas that would feel wobbly if they moved
 * (highlight titles, project rows, the cursor's "open" bubble).
 * Mouse devices only, and off for reduced motion.
 */
"use strict";

(() => {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) return;

  const LINKS = "a[href]:not(.cursor__open):not(.display-name):not(.project-row a):not([data-cursor-link])";
  const RANGE = 40; // px from a link's edge where the pull starts
  const STRENGTH = 0.05; // share of the distance to the pointer
  const MAX = 2; // px, largest lean

  let pointer = null;
  let queued = false;
  const pulled = new Set(); // links currently leaning, so they can be reset

  const pull = (link, x, y) => {
    link.style.setProperty("--pull-x", `${x.toFixed(1)}px`);
    link.style.setProperty("--pull-y", `${y.toFixed(1)}px`);
    if (x || y) pulled.add(link);
    else pulled.delete(link);
  };

  /** Mark a link as magnetic the first time it's seen. Inline links become
      inline-block (via .is-inline) so they can move. */
  const prepare = (link) => {
    if (link.hasAttribute("data-magnetic")) return;
    link.setAttribute("data-magnetic", "");
    if (getComputedStyle(link).display === "inline") link.classList.add("is-inline");
  };

  const clamp = (v) => Math.max(-MAX, Math.min(MAX, v * STRENGTH));

  const update = () => {
    queued = false;
    const near = new Set();
    if (pointer) {
      for (const link of document.querySelectorAll(LINKS)) {
        const box = link.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight || !box.width) continue;
        // Measure without the current lean, so the pull doesn't feed on itself.
        const cx = box.left + box.width / 2 - (parseFloat(link.style.getPropertyValue("--pull-x")) || 0);
        const cy = box.top + box.height / 2 - (parseFloat(link.style.getPropertyValue("--pull-y")) || 0);
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        if (Math.abs(dx) < box.width / 2 + RANGE && Math.abs(dy) < box.height / 2 + RANGE) {
          prepare(link);
          pull(link, clamp(dx), clamp(dy));
          near.add(link);
        }
      }
    }
    for (const link of [...pulled]) if (!near.has(link)) pull(link, 0, 0);
  };

  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    pointer = { x: event.clientX, y: event.clientY };
    queue();
  });
  window.addEventListener("scroll", queue, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => {
    pointer = null;
    queue();
  });
})();
