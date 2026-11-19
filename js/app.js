/**
 * js/app.js — main page logic
 *
 * - Splits [data-split] text into per-letter spans (no hand-written <span>s)
 * - Fetches highlights.json / projects.json and renders only `visible: true`
 * - Builds the curtain stack and computes its height + z-index order from n
 * - Drives the custom cursor and skills marquee
 *
 * No colours and no inline styles live here: anything that has to be computed
 * at runtime (stack height, z-index, cursor position, skill levels) is written
 * into a generated <style> sheet as numbers only. All colours are in styles.css.
 */
"use strict";

const DATA = {
  highlights: "data/highlights.json",
  projects: "data/projects.json",
};
const THEMES = ["black", "silver", "grey"];

/* ------------------------------------------------------------------ helpers */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const pad = (n) => String(n).padStart(2, "0");
const entryId = (entry) => entry.id ?? entry.slug;
const detailHref = (type, entry) => `detail.html?${new URLSearchParams({ type, id: entryId(entry) })}`;
const themeFor = (entry, index) => (THEMES.includes(entry.theme) ? entry.theme : THEMES[index % THEMES.length]);
/** Size class for big Six Caps titles, so long titles still fit (see base.css). */
const nameSize = (title) => (title.length <= 7 ? "name--s" : title.length <= 13 ? "name--m" : "name--l");

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children.filter(Boolean));
  return node;
}

/** Replace the contents of a generated <style id="..."> block. */
function writeStyles(id, cssText) {
  let style = document.getElementById(id);
  if (!style) {
    style = el("style", { attrs: { id } });
    document.head.append(style);
  }
  style.textContent = cssText;
  return style;
}

function isRenderable(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    entry.visible === true &&
    typeof entryId(entry) === "string" &&
    entryId(entry).trim() !== "" &&
    typeof entry.title === "string"
  );
}

async function fetchVisible(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${url} must contain a JSON array`);
  return data.filter(isRenderable);
}

function showStatus(selector, message) {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.hidden = false;
}

function loadErrorMessage(what) {
  return location.protocol === "file:"
    ? `Couldn't load ${what}: browsers block reading JSON files when a page is opened straight from disk (file://). Run it from a local server instead, e.g. "npx serve" or "python -m http.server" in this folder.`
    : `Couldn't load ${what} right now. Please refresh to try again.`;
}

/* --------------------------------------------------------------- split text */

/**
 * "change maker" -> <span class="split__word-start">c</span><span>h</span>…
 * data-split="words" groups the letters of each word in a .split__word span,
 * so long titles wrap between words instead of overflowing.
 */
function splitText(node) {
  const text = node.textContent.trim();
  node.textContent = "";
  node.classList.add("split");

  if (node.dataset.split === "words") {
    node.setAttribute("aria-label", text);
    for (const word of text.split(/\s+/)) {
      node.append(
        el("span", { className: "split__word", attrs: { "aria-hidden": "true" } }, [...word].map((char) => el("span", { text: char })))
      );
    }
    return;
  }

  let wordStart = true;
  for (const char of text) {
    if (char === " ") {
      node.append(el("span", { className: "split__space", text: "_" }));
      wordStart = true;
      continue;
    }
    node.append(el("span", { className: wordStart ? "split__word-start" : null, text: char }));
    wordStart = false;
  }
}

const splitAll = (root = document) => $$("[data-split]:not(.split)", root).forEach(splitText);

/* ------------------------------------------------------------------- media */

/** Preview image; the whole frame is hidden if the URL is missing or broken. */
function createPreview(entry) {
  const src = typeof entry.image === "string" ? entry.image.trim() : "";
  if (!src) return null;
  const frame = el("div", { className: "cont" });
  const img = el("img", {
    attrs: {
      alt: entry.alt?.trim() || `Preview of ${entry.title}`,
      loading: "lazy",
      decoding: "async",
      width: 800,
      height: 600,
    },
  });
  img.addEventListener("error", () => (frame.hidden = true), { once: true });
  img.src = src;
  frame.append(img);
  return frame;
}

/* ------------------------------------------------------- curtain + layout */

/**
 * Curtain math (V = one viewport height, n = visible highlights)
 *   Every layer is `position: sticky; bottom: 0`, so a lower layer waits,
 *   pinned, underneath the layer above until that one has scrolled away.
 *   Layer 1 (hero + intro) is at least 2V tall; each highlight is 1V.
 *     stack height  = 2V + n·V = (2 + n)·V
 *     z-index(k)    = (n + 1) − k   for layer k = 0..n  (upper layers on top)
 *   Anything after the stack (projects, about, footer) scrolls normally.
 */
function applyCurtainGeometry(highlightCount) {
  const layerTotal = highlightCount + 1;
  const rules = [`.curtain { min-height: calc(${2 + highlightCount} * var(--vh)); }`];
  for (let k = 0; k < layerTotal; k += 1) {
    rules.push(`.curtain > .curtain__layer:nth-child(${k + 1}) { z-index: ${layerTotal - k}; }`);
  }
  writeStyles("curtain-geometry", rules.join("\n"));
}

function buildHighlight(entry, index, total) {
  const href = detailHref("highlight", entry);
  const titleId = `highlight-${entryId(entry)}`;

  const name = el("a", {
    className: `name display-name ${nameSize(entry.title)}`,
    text: entry.title,
    attrs: { href, id: titleId, "data-split": "words" },
  });

  return el(
    "section",
    {
      className: `curtain__layer highlight theme-${themeFor(entry, index)}`,
      attrs: { "data-cursor-link": href, "aria-labelledby": titleId, "data-index": `${index + 1}/${total}` },
    },
    [
      el("div", { className: "det" }, [
        entry.info ? el("div", { className: "info" }, [el("span", { text: entry.info })]) : null,
        name,
      ]),
      el("div", { className: "preview" }, [
        el("div", { className: "count", attrs: { "aria-hidden": "true" } }, [el("span", { text: pad(index + 1) })]),
        createPreview(entry),
      ]),
    ]
  );
}

function renderHighlights(entries) {
  const curtain = $("[data-curtain]");
  if (!curtain) return;
  $$(".highlight", curtain).forEach((node) => node.remove());
  curtain.append(...entries.map((entry, i) => buildHighlight(entry, i, entries.length)));
  splitAll(curtain);
  applyCurtainGeometry(entries.length);
  applyNextColours(entries);
  initHighlightFit();
}

/**
 * Each highlight paints the next slide's colour behind its rounded corners
 * (see highlights.css); the last one uses the page colour of the projects
 * section that follows. Layer 1 is the hero, so highlight i is child i + 2.
 */
function applyNextColours(entries) {
  const rules = entries.map((entry, i) => {
    const next = i + 1 < entries.length ? `var(--theme-${themeFor(entries[i + 1], i + 1)})` : "var(--color-bg-light)";
    return `.curtain > .highlight:nth-child(${i + 2}) { --next-bg: ${next}; }`;
  });
  writeStyles("highlight-next", rules.join("\n"));
}

/**
 * A single long word can't wrap, so a big title could run past its column
 * into the preview image. Each title is measured at full size and, if its
 * widest word doesn't fit, shrunk (--fit, see base.css) until it does.
 * Re-measured on resize and once fonts load.
 */
function initHighlightFit() {
  const fit = () => {
    writeStyles("highlight-fit", "");
    const rules = [];
    for (const name of $$(".highlight .name")) {
      const space = name.parentElement.clientWidth;
      const widest = Math.max(0, ...$$(".split__word", name).map((word) => word.offsetWidth));
      if (space > 0 && widest > space) rules.push(`#${CSS.escape(name.id)} { --fit: ${(space / widest).toFixed(4)}; }`);
    }
    writeStyles("highlight-fit", rules.join("\n"));
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  };

  fit();
  document.fonts?.ready.then(fit);
  window.addEventListener("resize", queue);
}

/* --------------------------------------------------------------- projects */

function buildProjectRow(entry, index) {
  const href = detailHref("project", entry);
  return el("li", { className: `project-row theme-${themeFor(entry, index)}` }, [
    el("a", { attrs: { href, "data-cursor-link": href } }, [
      el("span", { className: "project-row__count", text: pad(index + 1), attrs: { "aria-hidden": "true" } }),
      el("span", { className: "project-row__main" }, [
        el("span", { className: "project-row__name", text: entry.title }),
        entry.info ? el("span", { className: "project-row__info", text: entry.info }) : null,
      ]),
      el("span", { className: "project-row__cta", text: "view →", attrs: { "aria-hidden": "true" } }),
    ]),
  ]);
}

function renderProjects(entries) {
  const list = $("[data-projects]");
  if (!list) return;
  list.replaceChildren(...entries.map(buildProjectRow));
  if (entries.length === 0) showStatus("[data-projects-status]", "new projects coming soon...");
}

/* ------------------------------------------------------------------ cursor */

/**
 * One page-wide cursor. It follows the pointer everywhere; when the pointer is
 * over anything with [data-cursor-link] (a highlight slide or a project row)
 * it turns into an "open" link to that item.
 *
 * Position is written as two custom properties (--cursor-x / --cursor-y) on
 * the cursor element only, so moving it restyles just the cursor and not the
 * whole page (writing them on :root made every frame recalc everything, which
 * made scrolling stutter). The target is re-checked on scroll too, so the
 * link stays correct while slides move under a still pointer.
 */
function initCursor() {
  const cursor = $("[data-cursor]");
  const open = $("[data-cursor-open]");
  // Mouse-driven devices only; phones/tablets never get a cursor.
  if (!cursor || !open || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    cursor?.remove();
    return;
  }

  let pointer = null;
  let target = null;
  let queued = false;

  /** Topmost page element under the pointer, ignoring the cursor itself. */
  const elementUnderPointer = () =>
    document.elementsFromPoint(pointer.x, pointer.y).find((node) => !cursor.contains(node)) ?? null;

  const setTarget = (next) => {
    if (next === target) return;
    target?.classList.remove("is-cursor-target");
    target = next;
    if (target) {
      target.classList.add("is-cursor-target");
      open.href = target.dataset.cursorLink;
    } else {
      open.removeAttribute("href");
    }
    cursor.classList.toggle("is-open", Boolean(target));
  };

  const update = () => {
    queued = false;
    if (!pointer) return;
    cursor.style.setProperty("--cursor-x", `${pointer.x}px`);
    cursor.style.setProperty("--cursor-y", `${pointer.y}px`);
    setTarget(elementUnderPointer()?.closest("[data-cursor-link]") ?? null);
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
    cursor.classList.add("is-visible");
    queue();
  });
  window.addEventListener("scroll", queue, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => {
    pointer = null;
    cursor.classList.remove("is-visible");
    setTarget(null);
  });
}

/* ------------------------------------------------------- magnetic socials */

/**
 * Footer social links lean towards the pointer when it comes near and spring
 * back when it moves away (the easing lives in footer.css). The pull is
 * written as --pull-x / --pull-y on each link. Mouse devices only, and off
 * for reduced motion.
 */
function initMagneticLinks() {
  const links = $$(".foot .socials .links a");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!links.length || !fine || reduce) return;

  const RANGE = 40; // px from a link's edge where the pull starts
  const STRENGTH = 0.05; // share of the distance to the pointer
  const MAX = 2; // px, largest lean
  const footer = $(".foot");
  let pointer = null;
  let queued = false;

  const pull = (link, x, y) => {
    link.style.setProperty("--pull-x", `${x.toFixed(1)}px`);
    link.style.setProperty("--pull-y", `${y.toFixed(1)}px`);
  };

  const update = () => {
    queued = false;
    const inView = pointer && footer.getBoundingClientRect().top < window.innerHeight;
    for (const link of links) {
      if (!inView) {
        pull(link, 0, 0);
        continue;
      }
      // Measure without the current lean, so the pull doesn't feed on itself.
      const box = link.getBoundingClientRect();
      const cx = box.left + box.width / 2 - (parseFloat(link.style.getPropertyValue("--pull-x")) || 0);
      const cy = box.top + box.height / 2 - (parseFloat(link.style.getPropertyValue("--pull-y")) || 0);
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const near = Math.abs(dx) < box.width / 2 + RANGE && Math.abs(dy) < box.height / 2 + RANGE;
      const clamp = (v) => Math.max(-MAX, Math.min(MAX, v * STRENGTH));
      pull(link, near ? clamp(dx) : 0, near ? clamp(dy) : 0);
    }
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
  document.documentElement.addEventListener("mouseleave", () => {
    pointer = null;
    queue();
  });
}

/* -------------------------------------------------------------- scrollbar */

/**
 * A floating scrollbar pill with no track (see base.css). The native
 * scrollbar is hidden on mouse devices, because it always paints a solid
 * strip, and this pill is drawn over the page instead:
 * - its size and position follow the page (--thumb-h / --thumb-y)
 * - it turns light over dark sections (.is-on-dark) and dark over light ones
 * - it appears while scrolling or when the pointer nears the right edge,
 *   and fades out after a moment of stillness
 * - it can be dragged, like a normal scrollbar
 * Must run before anything measures the page width, since hiding the native
 * scrollbar makes the page a little wider. Touch devices keep their own.
 */
function initScrollbar() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const root = document.documentElement;
  root.classList.add("has-scrollbar");
  const thumb = el("div", { className: "scrollbar__thumb" });
  const bar = el("div", { className: "scrollbar", attrs: { "aria-hidden": "true" } }, [thumb]);
  document.body.append(bar);

  const HIDE_AFTER = 1200; // ms of stillness before the pill fades
  const EDGE = 24; // px from the right edge that wakes the pill
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
    const section = node?.closest(".highlight, .projIntro, .foot");
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
}

/* --------------------------------------------------------------- greeting */

/**
 * The splash greets by the visitor's local time instead of always "welcome!".
 * Longer greetings get a smaller size (--greet-chars) so they still fit on
 * one line. Must run before splitAll() turns the text into letters.
 */
function setGreeting() {
  const node = $(".greet .cont");
  if (!node) return;
  const hour = new Date().getHours();
  const text =
    hour >= 5 && hour < 12 ? "good morning!" : hour >= 12 && hour < 17 ? "good afternoon!" : hour >= 17 && hour < 22 ? "good evening!" : "hey, night owl!";
  node.textContent = text;
  writeStyles("greeting", `.greet { --greet-chars: ${Math.max(8, text.length)}; }`);
}

/* ------------------------------------------------------------------ skills */

/**
 * Builds the skills marquee from the <li data-level> list:
 * wraps each label, clones the set for a seamless loop and writes each ring's
 * fill level, fill duration and start delay into a generated stylesheet.
 */
function initSkills() {
  const root = $("[data-skills]");
  const list = root && $(".inner", root);
  if (!list) return;

  const items = [...list.children];
  const count = items.length;

  for (const item of items) {
    const words = item.textContent.trim().split(/\s+/);
    item.textContent = "";
    item.classList.add("skill-ring");
    item.append(el("span", {}, words.map((word) => el("span", { text: word }))));
  }

  for (const item of items) {
    const clone = item.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    list.append(clone);
  }

  const rules = [`.skills { --skill-count: ${count}; }`];
  items.forEach((item, i) => {
    const level = Math.max(0, Math.min(100, Number(item.dataset.level) || 0));
    rules.push(
      `.skills.is-filled .inner > :nth-child(${i + 1}) { --progress: ${level}; --ring-duration: ${(level * 0.03).toFixed(2)}s; --ring-delay: ${i + 1}s; }`,
      `.skills.is-filled .inner > :nth-child(${i + 1 + count}) { --progress: ${level}; --ring-duration: 0s; --ring-delay: 0s; }`
    );
  });
  writeStyles("skill-levels", rules.join("\n"));

  if (!("IntersectionObserver" in window)) {
    root.classList.add("is-filled");
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        root.classList.add("is-filled");
        observer.disconnect();
      }
    },
    { threshold: 0.5 }
  );
  observer.observe(root);
}

/* ----------------------------------------------------------------- reveals */

/**
 * Entrance animations. Each element gets .is-revealed exactly once (the CSS in
 * animations.css plays from that class) and is never watched again.
 *
 * - [data-reveal] / [data-reveal-lines]: normal page flow, revealed when they
 *   scroll into view.
 * - Curtain layers can't use that: they're pinned underneath the layer above
 *   from the start, so they always count as "on screen". They're revealed
 *   instead once the layer covering them has slid half way off the screen.
 */
const canObserve = "IntersectionObserver" in window;
const reveal = (node) => node.classList.add("is-revealed");

/** Wrap each line of [data-reveal-lines] in a clipping box so it can rise into view. */
function prepareLines(root = document) {
  for (const paragraph of $$("[data-reveal-lines]", root)) {
    for (const line of [...paragraph.children]) {
      line.classList.add("line");
      line.replaceChildren(el("span", { className: "line__inner" }, [...line.childNodes]));
    }
    paragraph.classList.add("stagger");
  }
}

function revealOnScroll(nodes) {
  if (!canObserve) return nodes.forEach(reveal);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" }
  );
  nodes.forEach((node) => observer.observe(node));
}

/** Reveal `target` once `cover` (the layer on top of it) is half way off screen. */
function revealWhenUncovered(target, cover) {
  if (!target || target.classList.contains("is-revealed")) return;
  if (!cover || !canObserve) return reveal(target);
  // The root is the bottom half of the screen; the cover leaves it upwards.
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting || entry.boundingClientRect.bottom > entry.rootBounds.top) return;
      reveal(target);
      observer.disconnect();
    },
    { rootMargin: "-50% 0px 0px 0px" }
  );
  observer.observe(cover);
}

function initCurtainReveals() {
  const layers = $$("[data-curtain] > .curtain__layer");
  layers.forEach((layer, k) => k > 0 && revealWhenUncovered(layer, layers[k - 1]));
  revealWhenUncovered($(".curtain-reveal__panel[data-reveal]"), layers.at(-1));
}

/* ------------------------------------------------------------- hero name */

/**
 * Desktop only: stretches the hero names sideways so their tightly spaced
 * letters fill their space (see hero.css): "savion" up to the short text
 * beside it, "nadar" across the whole row. Re-measured on resize and once
 * fonts load. Scaling starts from each word's left edge, which never moves.
 */
function initHeroStretch() {
  const first = $(".intro .firstName .cont");
  const last = $(".intro .lastName .cont");
  const desc = $(".intro .desc");
  if (!first || !last || !desc) return;
  const desktop = window.matchMedia("(min-width: 731px)");

  // Current font-size factor of "savion", so its full-size width can be worked out.
  let fit = 1;

  const measure = () => {
    if (!desktop.matches) {
      fit = 1;
      return writeStyles("hero-stretch", "");
    }
    const gutter = parseFloat(getComputedStyle(last).marginLeft) || 0;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // Clear space kept between "savion" and the short text beside it.
    const gap = Math.max(gutter, 2.5 * rem);

    // "savion": stretch to the text if there's room; otherwise shrink to fit.
    const firstSpace = desc.getBoundingClientRect().left - gap - first.getBoundingClientRect().left;
    const firstNatural = first.offsetWidth / fit;
    fit = Math.min(1, firstSpace / firstNatural);
    const savion = Math.max(1, firstSpace / (firstNatural * fit));

    // "nadar": stretch across the whole row.
    const lastSpace = last.parentElement.getBoundingClientRect().right - gutter - last.getBoundingClientRect().left;
    const nadar = Math.max(1, lastSpace / last.offsetWidth);

    writeStyles(
      "hero-stretch",
      `.intro .firstName .cont { --fit: ${fit.toFixed(4)}; --stretch: ${savion.toFixed(4)}; }\n` +
        `.intro .lastName .cont { --stretch: ${nadar.toFixed(4)}; }`
    );
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      measure();
    });
  };

  measure();
  document.fonts?.ready.then(measure);
  window.addEventListener("resize", queue);
}

/* -------------------------------------------------------------------- boot */

async function init() {
  initScrollbar(); // first: hiding the native scrollbar changes the page width
  setGreeting();
  splitAll();
  prepareLines();
  initHeroStretch();
  revealOnScroll($$("#about[data-reveal], [data-reveal-lines]"));

  initCursor();
  initMagneticLinks();
  initSkills();
  applyCurtainGeometry(0);

  const [highlights, projects] = await Promise.allSettled([fetchVisible(DATA.highlights), fetchVisible(DATA.projects)]);

  if (highlights.status === "fulfilled") {
    renderHighlights(highlights.value);
  } else {
    console.error(highlights.reason);
    showStatus("[data-highlights-status]", loadErrorMessage("highlights"));
  }

  if (projects.status === "fulfilled") {
    renderProjects(projects.value);
  } else {
    console.error(projects.reason);
    showStatus("[data-projects-status]", loadErrorMessage("projects"));
  }

  initCurtainReveals();

  // Re-apply a deep link (e.g. index.html#projects) now the stack has its final height.
  if (location.hash) {
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: "instant" });
  }
}

init();
