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
const THEMES = ["violet", "slate", "forest"];

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

/* -------------------------------------------------------------------- boot */

async function init() {
  splitAll();
  prepareLines();
  revealOnScroll($$("#about[data-reveal], [data-reveal-lines]"));

  initCursor();
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
