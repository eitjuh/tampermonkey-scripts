// ==UserScript==
// @name         YouTube Clean Feed (Productivity Mode)
// @namespace    https://tampermonkey.net/
// @version      1.2.1
// @description  Removes homepage recommendations, distracting nav links, and tags/chips on YouTube.
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "tm-youtube-clean-feed-style";
  const OBSERVER_CONFIG = { childList: true, subtree: true };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Hide all recommendation content on homepage */
      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents,
      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer ytd-rich-item-renderer,
      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer ytd-rich-section-renderer,
      ytd-browse[page-subtype="home"] ytd-rich-grid-renderer ytd-continuation-item-renderer {
        display: none !important;
      }

      /* Hide home feed chips/tags ("All", "Podcasts", etc.) */
      ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer,
      ytd-browse[page-subtype="home"] #chips-wrapper,
      ytd-browse[page-subtype="home"] #chips {
        display: none !important;
      }

      /* Hide shorts shelves / shorts cards where they appear */
      ytd-rich-shelf-renderer[is-shorts],
      ytd-reel-shelf-renderer,
      ytd-rich-item-renderer:has(a[href^="/shorts/"]) {
        display: none !important;
      }

      /* Hide sidebar entries by route (more robust than title text) */
      ytd-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[href^="/shorts"]),
      ytd-guide-entry-renderer:has(a[href^="/feed/subscriptions"]),
      ytd-mini-guide-entry-renderer:has(a[href^="/feed/subscriptions"]),
      ytd-guide-entry-renderer:has(a[href^="/feed/explore"]),
      ytd-mini-guide-entry-renderer:has(a[href^="/feed/explore"]) {
        display: none !important;
      }

      /* Hide whole sections via stable links they contain */
      ytd-guide-section-renderer:has(ytd-guide-collapsible-section-entry-renderer a[href^="/feed/subscriptions"]),
      ytd-guide-section-renderer:has(a[href^="/feed/explore"]),
      ytd-guide-section-renderer:has(a[href^="/premium"]) {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function hideEntriesByHref(prefixes) {
    const selector = prefixes
      .map((prefix) => `a[href^="${prefix}"]`)
      .join(",");
    const candidates = document.querySelectorAll(selector);
    for (const link of candidates) {
      const container =
        link.closest("ytd-guide-collapsible-section-entry-renderer") ||
        link.closest("ytd-guide-entry-renderer") ||
        link.closest("ytd-mini-guide-entry-renderer") ||
        link.closest("ytd-guide-collapsible-entry-renderer") ||
        link;
      if (container && container instanceof HTMLElement) {
        container.style.display = "none";
      }
    }
  }

  function hideShortsNavLinks() {
    hideEntriesByHref(["/shorts"]);

    const candidates = document.querySelectorAll(
      [
        'ytd-guide-entry-renderer a[title="Shorts"]',
        'ytd-mini-guide-entry-renderer a[title="Shorts"]',
        'ytd-guide-entry-renderer a[aria-label="Shorts"]',
        'ytd-mini-guide-entry-renderer a[aria-label="Shorts"]',
      ].join(",")
    );

    for (const link of candidates) {
      const container =
        link.closest("ytd-guide-entry-renderer") ||
        link.closest("ytd-mini-guide-entry-renderer") ||
        link.closest("ytd-guide-collapsible-entry-renderer") ||
        link;
      if (container && container instanceof HTMLElement) {
        container.style.display = "none";
      }
    }
  }

  function hideDistractingNavSections() {
    hideEntriesByHref(["/feed/explore"]);

    // Subscriptions can be a collapsible block with channel rows under it (e.g. TEDx),
    // so hide the whole section that owns that block.
    const subscriptionSections = document.querySelectorAll(
      'ytd-guide-section-renderer:has(ytd-guide-collapsible-section-entry-renderer a[href^="/feed/subscriptions"])'
    );
    for (const section of subscriptionSections) {
      if (section && section instanceof HTMLElement) {
        section.style.display = "none";
      }
    }

    const sectionTitles = document.querySelectorAll(
      "ytd-guide-section-renderer #guide-section-title"
    );

    for (const title of sectionTitles) {
      const text = (title.textContent || "").trim().toLowerCase();
      if (text !== "explore" && text !== "more from youtube") continue;
      const section = title.closest("ytd-guide-section-renderer");
      if (section && section instanceof HTMLElement) {
        section.style.display = "none";
      }
    }

    // Non-text fallback: "More from YouTube" usually contains Premium and does
    // not contain the "You" root link.
    const moreFromYouTubeIndicators = document.querySelectorAll(
      [
        'ytd-guide-section-renderer a[href^="/premium"]',
      ].join(",")
    );
    for (const link of moreFromYouTubeIndicators) {
      const section = link.closest("ytd-guide-section-renderer");
      if (section && section instanceof HTMLElement) {
        if (section.querySelector('a[href^="/feed/you"]')) continue;
        section.style.display = "none";
      }
    }
  }

  function clean() {
    ensureStyle();
    hideShortsNavLinks();
    hideDistractingNavSections();
  }

  let observer = null;
  let cleanScheduled = false;

  function scheduleClean() {
    if (cleanScheduled) return;
    cleanScheduled = true;
    requestAnimationFrame(() => {
      cleanScheduled = false;
      clean();
    });
  }

  clean();

  observer = new MutationObserver(() => {
    scheduleClean();
  });
  observer.observe(document.documentElement, OBSERVER_CONFIG);

  // Re-run after YouTube's internal SPA route changes.
  window.addEventListener("yt-navigate-finish", scheduleClean, { passive: true });

  // Timed fallback for delayed/lazy sidebar injections.
  window.setInterval(scheduleClean, 2000);
})();
