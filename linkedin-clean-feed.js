// ==UserScript==
// @name         LinkedIn Clean Feed
// @namespace    https://tampermonkey.net/
// @version      1.0.0
// @description  Hides LinkedIn home feed and right column.
// @match        https://www.linkedin.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "tm-linkedin-clean-feed-style";
  const OBSERVER_CONFIG = { childList: true, subtree: true };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Primary ask: remove center feed + right rail */
      .scaffold-layout__main,
      .scaffold-layout__aside,
      .feed-container-theme .scaffold-layout__main,
      .feed-container-theme .scaffold-layout__aside {
        display: none !important;
      }

      /* Keep layout sane after hiding columns */
      .scaffold-layout,
      .feed-container-theme {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function hideBySemanticFallbacks() {
    const path = window.location.pathname || "";
    const onFeedPage =
      path === "/" ||
      path.startsWith("/feed") ||
      path.startsWith("/home");

    if (!onFeedPage) return;

    // Hide common right-rail candidates that may not use scaffold classes.
    const rightCandidates = document.querySelectorAll(
      [
        '[data-view-name*="right"]',
        '[data-view-name*="aside"]',
        '[data-test-id*="right"]',
        '[data-test-id*="aside"]',
        'aside[aria-label]',
      ].join(",")
    );
    for (const el of rightCandidates) {
      if (el instanceof HTMLElement) el.style.display = "none";
    }

    // Hide feed stream containers if classnames are different in experiments.
    const feedCandidates = document.querySelectorAll(
      [
        '[data-view-name*="feed"]',
        '[data-test-id*="feed"]',
        '[data-test-id*="main-feed"]',
        "main .scaffold-finite-scroll",
      ].join(",")
    );
    for (const el of feedCandidates) {
      if (el instanceof HTMLElement) el.style.display = "none";
    }
  }

  function apply() {
    ensureStyle();
    hideBySemanticFallbacks();
  }

  let applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => {
      applyScheduled = false;
      apply();
    });
  }

  apply();
  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(document.documentElement, OBSERVER_CONFIG);
  window.addEventListener("popstate", scheduleApply, { passive: true });
  window.addEventListener("hashchange", scheduleApply, { passive: true });
})();
