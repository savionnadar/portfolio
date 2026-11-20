/**
 * js/tab-title.js — a kind note in the tab title while the visitor is away
 *
 * When the page's tab is hidden (they switched to another tab), its title
 * becomes a short, wholesome message. The real title comes back as soon as
 * they return. Shared by index.html and detail.html.
 */
"use strict";

(() => {
  const MESSAGES = ["HAVE A GREAT DAY!", "KEEP AT IT!", "YOU'VE GOT THIS!", "STAY AWESOME!"];

  let saved = null;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saved = document.title;
      document.title = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    } else if (saved !== null) {
      document.title = saved;
      saved = null;
    }
  });
})();
