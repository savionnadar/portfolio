/**
 * js/detail.js — shared detail page router
 * Reads ?type=highlight|project&id=slug, fetches the matching JSON file,
 * finds the visible entry and renders it into detail.html.
 */
"use strict";

const COLLECTIONS = {
  highlight: { url: "data/highlights.json", label: "highlight", back: "index.html#highlights" },
  project: { url: "data/projects.json", label: "project", back: "index.html#projects" },
};
const THEMES = ["violet", "slate", "forest"];

const $ = (selector, root = document) => root.querySelector(selector);
const field = (name) => $(`[data-field="${name}"]`);
const pad = (n) => String(n).padStart(2, "0");
const entryId = (entry) => entry.id ?? entry.slug;

function el(tag, { className, text, attrs } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children.filter(Boolean));
  return node;
}

const isRenderable = (entry) =>
  entry !== null && typeof entry === "object" && entry.visible === true && typeof entryId(entry) === "string" && typeof entry.title === "string";

/** Title as letter <span>s grouped per word (same treatment as the home page). */
function splitInto(node, text) {
  const size = text.length <= 7 ? "name--s" : text.length <= 13 ? "name--m" : "name--l";
  node.classList.add("split", size);
  node.replaceChildren(
    ...text
      .trim()
      .split(/\s+/)
      .map((word) => el("span", { className: "split__word", attrs: { "aria-hidden": "true" } }, [...word].map((char) => el("span", { text: char }))))
  );
  node.setAttribute("aria-label", text);
}

function finish() {
  $("[data-detail]").setAttribute("aria-busy", "false");
}

function showState(title, message) {
  $("[data-detail-state]").replaceChildren(
    el("h1", { text: title }),
    el("p", { text: message }),
    el("a", { text: "← back to portfolio", attrs: { href: "index.html" } })
  );
  $("[data-detail-article]").hidden = true;
  document.title = `${title} | savion nadar`;
  finish();
}

function renderImage(entry) {
  const frame = field("media");
  const img = field("image");
  const src = typeof entry.image === "string" ? entry.image.trim() : "";
  if (!src) return; // no image: container stays hidden
  img.alt = entry.alt?.trim() || `Preview of ${entry.title}`;
  img.addEventListener("error", () => (frame.hidden = true), { once: true });
  img.src = src;
  frame.hidden = false;
}

function renderPager(entries, index, type) {
  const pager = field("pager");
  const link = (entry, label, className) =>
    el("a", { className, text: label, attrs: { href: `detail.html?${new URLSearchParams({ type, id: entryId(entry) })}` } });
  const links = [
    index > 0 ? link(entries[index - 1], `← ${entries[index - 1].title}`, "is-prev") : null,
    index < entries.length - 1 ? link(entries[index + 1], `${entries[index + 1].title} →`, "is-next") : null,
  ].filter(Boolean);
  pager.replaceChildren(...links);
  pager.hidden = links.length === 0;
}

function render(entry, entries, index, type) {
  const theme = THEMES.includes(entry.theme) ? entry.theme : THEMES[index % THEMES.length];
  document.body.classList.add(`theme-${theme}`);

  field("count").textContent = pad(index + 1);
  field("info").textContent = entry.info || "";
  field("info").hidden = !entry.info;
  splitInto(field("title"), entry.title);
  field("description").textContent = entry.description || "";

  const raw = entry.details ?? "";
  const paragraphs = (Array.isArray(raw) ? raw : String(raw).split(/\n{2,}/)).map((t) => String(t).trim()).filter(Boolean);
  field("details").replaceChildren(...paragraphs.map((text) => el("p", { text })));

  const link = field("link");
  if (typeof entry.link === "string" && entry.link.trim()) {
    link.href = entry.link.trim();
    link.setAttribute("aria-label", `visit ${entry.title} (opens in a new tab)`);
    link.hidden = false;
  }

  renderImage(entry);
  renderPager(entries, index, type);

  document.title = `${entry.title} | savion nadar`;
  if (entry.description) $('meta[name="description"]').setAttribute("content", entry.description);

  $("[data-detail-state]").hidden = true;
  $("[data-detail-article]").hidden = false;
  finish();
}

async function init() {
  const params = new URLSearchParams(location.search);
  const type = params.get("type");
  const id = params.get("id");
  const collection = COLLECTIONS[type];

  if (collection) {
    $("[data-back-link]").href = collection.back;
    $("[data-back-label]").textContent = `back to ${collection.label}s`;
    field("type").textContent = collection.label;
  }

  if (!collection || !id) {
    showState("not found", "this link is missing a valid type or id.");
    return;
  }

  try {
    const response = await fetch(collection.url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data.filter(isRenderable) : [];
    const index = entries.findIndex((entry) => entryId(entry) === id);
    if (index === -1) {
      showState("not found", `that ${collection.label} doesn't exist or is hidden.`);
      return;
    }
    render(entries[index], entries, index, type);
  } catch (error) {
    console.error(error);
    showState(
      "oops",
      location.protocol === "file:"
        ? "browsers block reading JSON files on pages opened straight from disk (file://). run the site from a local server instead."
        : "something went wrong loading this page. please refresh."
    );
  }
}

init();
