/**
 * js/scrollbar.js — floating scrollbar pill (all pages)
 *
 * A native scrollbar always paints a solid strip down the side, so on mouse
 * devices it's hidden (html.has-scrollbar) and this trackless pill is drawn
 * over the page instead (styles live in base.css):
 * - its size and position follow the page (--thumb-h / --thumb-y)
 * - it turns light over dark sections (.is-on-dark) and dark over light ones
 * - it appears while scrolling or when the pointer nears the right edge,
 *   and fades out after a moment of stillness
 * - it can be dragged, like a normal scrollbar
 * Loaded before the page's own script, because hiding the native scrollbar
 * makes the page a little wider. Touch devices keep their own scrollbar.
 */
"use strict";

(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  /** Elements whose background decides the pill's tone (closest one wins). */
  const SECTIONS = ".highlight, .projIntro, .foot, .detail-page, .nf-page";
  const HIDE_AFTER = 1200; // ms of stillness before the pill fades
  const EDGE = 24; // px from the right edge that wakes the pill

  const root = document.documentElement;
  root.classList.add("has-scrollbar");

  const thumb = document.createElement("div");
  thumb.className = "scrollbar__thumb";
  const bar = document.createElement("div");
  bar.className = "scrollbar";
  bar.setAttribute("aria-hidden", "true");
  bar.append(thumb);
  document.body.append(bar);

  let queued = false;
  let hideTimer = 0;
  let nearEdge = false;
  let drag = null;
  let onDark = null;

  const isDark = (color) => {
    const [r, g, b, a = 1] = (color.match(/[\d.]+/g) || []).map(Number);
    return a > 0 && 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
  };

  /** Is the section beside the pill (at mid-height) a dark one? */
  const sectionIsDark = () => {
    const node = document
      .elementsFromPoint(root.clientWidth - 6, window.innerHeight / 2)
      .find((n) => !bar.contains(n));
    const section = node?.closest(SECTIONS);
    if (!section) return false;
    const bg = section.classList.contains("highlight")
      ? getComputedStyle(section, "::before").backgroundColor
      : getComputedStyle(section).backgroundColor;
    return isDark(bg);
  };

  const metrics = () => {
    const view = window.innerHeight;
    const max = root.scrollHeight - view;
    const height = Math.max(36, (view * view) / root.scrollHeight);
    return { view, max, height, travel: view - height };
  };

  const update = () => {
    queued = false;
    const m = metrics();
    bar.hidden = m.max <= 0;
    const y = m.max > 0 ? (window.scrollY / m.max) * m.travel : 0;
    bar.style.setProperty("--thumb-h", `${m.height.toFixed(1)}px`);
    bar.style.setProperty("--thumb-y", `${y.toFixed(1)}px`);
    const dark = sectionIsDark();
    if (dark !== onDark) {
      onDark = dark;
      bar.classList.toggle("is-on-dark", dark);
    }
  };

  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  const show = () => {
    bar.classList.add("is-active");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!drag && !nearEdge) bar.classList.remove("is-active");
    }, HIDE_AFTER);
  };

  window.addEventListener(
    "scroll",
    () => {
      queue();
      show();
    },
    { passive: true }
  );
  window.addEventListener("resize", queue);
  new ResizeObserver(queue).observe(document.body); // page height changes (data loaded etc.)

  document.addEventListener("pointermove", (event) => {
    if (drag) {
      const m = metrics();
      const target = drag.scroll + (event.clientY - drag.y) * (m.max / Math.max(1, m.travel));
      const clamped = Math.max(0, Math.min(m.max, target));
      if (window.smoothScroll) window.smoothScroll.scrollTo(clamped, { immediate: true });
      else window.scrollTo(0, clamped);
      return;
    }
    const near = event.clientX >= root.clientWidth - EDGE;
    if (near !== nearEdge) {
      nearEdge = near;
      if (near) show();
    }
  });

  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { y: event.clientY, scroll: window.scrollY };
    thumb.setPointerCapture(event.pointerId);
    bar.classList.add("is-dragging");
    show();
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    bar.classList.remove("is-dragging");
    show();
  };
  thumb.addEventListener("pointerup", endDrag);
  thumb.addEventListener("pointercancel", endDrag);

  queue();
})();
