/**
 * js/smooth.js — smooth, eased scrolling for mouse wheels and trackpads
 *
 * Uses Lenis (loaded before this file), which eases the page's real scroll
 * position, so sticky layers (the curtain and footer) keep working as normal.
 * Touch scrolling stays native. Skipped entirely for reduced-motion users or
 * if Lenis failed to load, so the page always still scrolls.
 *
 * In-page links (#home, #projects, ...) glide to their target through Lenis.
 * window.smoothScroll is the Lenis instance (or null) for other scripts.
 */
"use strict";

(() => {
  window.smoothScroll = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || typeof window.Lenis !== "function") return;

  const lenis = new window.Lenis({
    lerp: 0.085,
    wheelMultiplier: 0.9,
    smoothWheel: true,
  });
  window.smoothScroll = lenis;

  const raf = (time) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const id = decodeURIComponent(link.getAttribute("href").slice(1));
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { duration: 1.4 });
    history.pushState(null, "", `#${id}`);
  });
})();
