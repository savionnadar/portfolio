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
  skills: "data/skills.json",
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

/* ------------------------------------------------------------ personality */

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Hidden verse: "Philippians 4:13" unfolds the verse beneath it (hero.css).
 * Mouse: opens while hovered; a click pins it open (click again to close).
 * Touch and keyboard: tap / Enter / Space toggles it.
 */
function initVerse() {
  const block = $("[data-verse]");
  const ref = block && $(".verse-ref", block);
  if (!ref) return;
  let pinned = false;

  const set = (open) => {
    block.classList.toggle("is-open", open);
    ref.setAttribute("aria-expanded", String(open));
  };

  block.addEventListener("pointerenter", (event) => event.pointerType === "mouse" && set(true));
  block.addEventListener("pointerleave", (event) => event.pointerType === "mouse" && !pinned && set(false));
  ref.addEventListener("click", () => {
    pinned = !pinned;
    set(pinned);
  });
  ref.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    pinned = !pinned;
    set(pinned);
  });
}

/**
 * Footer name shuffle: hovering (or tapping) "SAVION NADAR" scrambles the
 * letters into a short phrase, holds it for a moment, then scrambles back.
 * Each phrase is [top word, bottom word], like the first and last name.
 * Words can be any length: letters are added or removed as the scramble
 * starts (hidden by the scramble itself), and the row re-spaces to fill the
 * width just like the name does.
 */
function initNameShuffle() {
  const name = $(".foot .name");
  const rows = [$(".foot .firstName .cont"), $(".foot .lastName .cont")];
  if (!name || !rows[0] || !rows[1] || prefersReducedMotion()) return;

  const PHRASES = [
    ["see ya", "later"],
    ["glad u", "came!"],
    ["take", "care!"],
    ["catch ya", "later!"],
    ["until", "next time"],
  ];
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const TICK = 40; // ms per scramble frame
  const HOLD = 1600; // ms the phrase stays
  const NBSP = String.fromCharCode(160); // keeps a space as a visible gap
  const letters = (row) => [...row.children];
  const original = rows.map((row) => letters(row).map((span) => span.textContent).join(""));
  let running = false;
  let lastPhrase = -1;

  const show = (char) => (char === " " ? NBSP : char);
  const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  /** Give a row exactly `count` letter spans (copies of its first one). */
  const resize = (row, count) => {
    const spans = letters(row);
    for (let i = spans.length; i < count; i += 1) {
      const span = spans[0].cloneNode(false);
      span.className = "";
      span.textContent = randomGlyph();
      row.append(span);
    }
    letters(row)
      .slice(count)
      .forEach((span) => span.remove());
  };

  /** Condense any row whose letters are wider than the row (--fit-x). */
  const fitRows = () => {
    for (const row of rows) {
      const fit = Math.min(1, row.clientWidth / Math.max(1, row.scrollWidth));
      if (fit < 1) row.style.setProperty("--fit-x", fit.toFixed(3));
      else row.style.removeProperty("--fit-x");
    }
  };

  /** Scramble every letter, settling them left to right onto `target`. */
  const scrambleTo = (target) =>
    new Promise((resolve) => {
      rows.forEach((row, r) => {
        const count = [...target[r]].length;
        resize(row, count);
        // Each word gets width in proportion to its letters, so a short top
        // word and a long bottom word stay evenly spaced. Back to the name's
        // own layout (footer.css) once it returns.
        if (target === original) row.parentElement.style.removeProperty("flex-grow");
        else row.parentElement.style.flexGrow = String(count);
      });
      const all = rows.flatMap((row, r) => letters(row).map((span, i) => ({ span, char: [...target[r]][i] })));
      let frame = 0;
      const timer = setInterval(() => {
        all.forEach(({ span, char }, index) => {
          span.textContent = frame >= 4 + index * 1.5 ? show(char) : randomGlyph();
        });
        fitRows();
        frame += 1;
        if (frame > 4 + all.length * 1.5) {
          clearInterval(timer);
          resolve();
        }
      }, TICK);
    });

  const play = async () => {
    if (running) return;
    running = true;
    let pick;
    do pick = Math.floor(Math.random() * PHRASES.length);
    while (pick === lastPhrase && PHRASES.length > 1);
    lastPhrase = pick;
    await scrambleTo(PHRASES[pick]);
    await new Promise((resolve) => setTimeout(resolve, HOLD));
    await scrambleTo(original);
    running = false;
  };

  name.addEventListener("pointerenter", play);
  name.addEventListener("click", play);
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
 * Loads data/skills.json: [{ "name": "HTML", "level": 95, "visible": true }].
 * Entries without a name are skipped, as are ones with "visible": false
 * (visible may be left out). "level" is clamped to 0–100.
 */
async function fetchSkills(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${url} must contain a JSON array`);
  return data
    .filter((skill) => skill && typeof skill.name === "string" && skill.name.trim() && skill.visible !== false)
    .map((skill) => ({ name: skill.name.trim(), level: Math.max(0, Math.min(100, Number(skill.level) || 0)) }));
}

/**
 * Builds the skills marquee from data/skills.json: one ring per skill,
 * a cloned set for a seamless loop, and each ring's fill level, fill
 * duration and start delay written into a generated stylesheet.
 */
function initSkills(skills) {
  const root = $("[data-skills]");
  const list = root && $(".inner", root);
  if (!list) return;
  if (!skills.length) {
    root.hidden = true;
    return;
  }

  const items = skills.map(({ name, level }) =>
    el("li", { className: "skill-ring", attrs: { "data-level": level } }, [
      el("span", {}, name.split(/\s+/).map((word) => el("span", { text: word }))),
    ])
  );
  list.replaceChildren(...items);
  const count = items.length;

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
  initSkillsPause(root);

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

/**
 * Hovering the skills strip glides it to a stop so the rings can be read,
 * and leaving eases it back up to speed. Rather than freezing it instantly,
 * the marquee animation's playback rate is eased from its current speed to
 * the target over a short moment. Mouse devices only.
 */
function initSkillsPause(root) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  const DURATION = 700; // ms to slow down or speed up
  const easeOut = (t) => 1 - (1 - t) ** 3;
  let rate = 1;
  let frame = 0;

  /** The looping marquee animations (not the rings' fill transitions). */
  const marquee = () =>
    root.getAnimations({ subtree: true }).filter((a) => a.animationName === "infScroll");

  const glideTo = (target) => {
    cancelAnimationFrame(frame);
    const from = rate;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      rate = from + (target - from) * easeOut(t);
      for (const animation of marquee()) animation.playbackRate = rate;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  root.addEventListener("pointerenter", (event) => event.pointerType === "mouse" && glideTo(0));
  root.addEventListener("pointerleave", (event) => event.pointerType === "mouse" && glideTo(1));
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
  setGreeting();
  splitAll();
  prepareLines();
  initHeroStretch();
  revealOnScroll($$("#about[data-reveal], [data-reveal-lines]"));

  initCursor();
  initVerse();
  initNameShuffle();
  applyCurtainGeometry(0);

  const [highlights, projects, skills] = await Promise.allSettled([
    fetchVisible(DATA.highlights),
    fetchVisible(DATA.projects),
    fetchSkills(DATA.skills),
  ]);

  if (skills.status === "fulfilled") {
    initSkills(skills.value);
  } else {
    console.error(skills.reason);
    initSkills([]); // hides the marquee rather than showing an empty strip
  }

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
