// ==UserScript==
// @name         X Clean Feed (Productivity Mode)
// @namespace    https://tampermonkey.net/
// @version      1.0.2
// @description  Removes distracting X sections, defaults to Following, and keeps a cleaner/wider timeline.
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const STYLE_ID = "tm-x-clean-feed-style";
  const HEADER_SEARCH_ID = "tm-x-header-search";
  const OBSERVER_CONFIG = { childList: true, subtree: true };

  const LEFT_NAV_HREF_PREFIXES = [
    "/explore",
    "/i/grok",
    "/i/premium_sign_up",
    "/bookmarks",
    "/compose/articles",
    "/i/lists",
    "/i/communities",
    "/i/verified-orgs-signup",
    "/i/ads",
    "/i/spaces/start",
  ];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Right sidebar and its modules */
      [data-testid="sidebarColumn"] {
        display: none !important;
      }

      /* Widen the main timeline area */
      [data-testid="primaryColumn"] {
        max-width: none !important;
        width: min(980px, calc(100vw - 360px)) !important;
        min-width: 0 !important;
        margin-right: auto !important;
      }

      /* Remove inner center constraints inside the timeline column */
      [data-testid="primaryColumn"] section[role="region"],
      [data-testid="primaryColumn"] section[role="region"] > div,
      [data-testid="primaryColumn"] [aria-label^="Timeline:"] {
        max-width: 100% !important;
        width: 100% !important;
      }

      /* X uses utility classes with auto side margins and fixed max widths */
      [data-testid="primaryColumn"] .r-f8sm7e {
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      [data-testid="primaryColumn"] .r-1ye8kvj {
        max-width: none !important;
      }

      /* Ensure media/cards never overflow the viewport inside wide feed */
      [data-testid="primaryColumn"] img,
      [data-testid="primaryColumn"] video,
      [data-testid="primaryColumn"] [data-testid="tweetPhoto"],
      [data-testid="primaryColumn"] [data-testid="card.wrapper"] {
        max-width: 100% !important;
      }

      /* Header search we inject */
      #${HEADER_SEARCH_ID} {
        display: flex;
        align-items: center;
        margin: 8px 12px 10px;
      }
      #${HEADER_SEARCH_ID} input {
        width: 100%;
        height: 40px;
        border-radius: 9999px;
        border: 1px solid rgb(83, 100, 113);
        background: rgba(0, 0, 0, 0);
        color: rgb(231, 233, 234);
        padding: 0 14px;
        outline: none;
      }
      #${HEADER_SEARCH_ID} input:focus {
        border-color: rgb(29, 155, 240);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function textIncludes(el, expected) {
    return (el.textContent || "").trim().toLowerCase().includes(expected.toLowerCase());
  }

  function hideTabsByText() {
    const tabs = document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]');
    for (const tab of tabs) {
      if (textIncludes(tab, "for you") || textIncludes(tab, "ink club")) {
        if (tab instanceof HTMLElement) tab.style.display = "none";
      }
    }
  }

  function clickFollowingIfNeeded() {
    const tabs = Array.from(
      document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"] [role="tab"]')
    );
    const followingTab = tabs.find((tab) => textIncludes(tab, "following"));
    if (!followingTab) return;
    const isSelected = followingTab.getAttribute("aria-selected") === "true";
    if (!isSelected && followingTab instanceof HTMLElement) {
      followingTab.click();
    }
  }

  function hideLinksByHrefPrefixes(prefixes) {
    const links = document.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (!prefixes.some((prefix) => href.startsWith(prefix))) continue;
      const row =
        link.closest("a") ||
        link.closest('[role="menuitem"]') ||
        link.closest('[role="link"]') ||
        link.closest("div");
      if (row && row instanceof HTMLElement) row.style.display = "none";
    }
  }

  function hideLeftNavItemsByText() {
    const targets = [
      "explore",
      "grok",
      "premium",
      "bookmarks",
      "creator studio",
      "articles",
      "lists",
      "communities",
      "business",
      "ads",
      "create your space",
    ];

    const nav = document.querySelector('header nav[aria-label="Primary"]');
    if (!nav) return;
    const links = nav.querySelectorAll("a, button");
    for (const node of links) {
      const text = (node.textContent || "").trim().toLowerCase();
      if (!text) continue;
      if (!targets.some((t) => text.includes(t))) continue;
      if (node instanceof HTMLElement) node.style.display = "none";
    }
  }

  function hideRightSidebarModulesByText() {
    const phrases = [
      "live on x",
      "today's news",
      "today’s news",
      "what's happening",
      "what’s happening",
      "who to follow",
    ];
    const nodes = document.querySelectorAll('[data-testid="sidebarColumn"] section, [data-testid="sidebarColumn"] div');
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const text = (node.textContent || "").toLowerCase();
      if (phrases.some((p) => text.includes(p))) {
        node.style.display = "none";
      }
    }
  }

  function ensureHeaderSearch() {
    const primaryCol = document.querySelector('[data-testid="primaryColumn"]');
    if (!primaryCol) return;

    const topNav = primaryCol.querySelector('[role="tablist"]');
    if (!topNav || !topNav.parentElement) return;

    let wrapper = document.getElementById(HEADER_SEARCH_ID);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = HEADER_SEARCH_ID;
      const input = document.createElement("input");
      input.type = "search";
      input.placeholder = "Search";
      input.setAttribute("aria-label", "Search");
      input.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        const q = input.value.trim();
        if (!q) return;
        window.location.href = `/search?q=${encodeURIComponent(q)}&src=typed_query`;
      });
      wrapper.appendChild(input);
      topNav.parentElement.insertAdjacentElement("afterend", wrapper);
    }

    const srcInput = document.querySelector(
      'input[data-testid="SearchBox_Search_Input"], input[aria-label="Search query"]'
    );
    const dstInput = wrapper.querySelector("input");
    if (srcInput instanceof HTMLInputElement && dstInput instanceof HTMLInputElement) {
      if (document.activeElement !== dstInput) dstInput.value = srcInput.value || "";
    }
  }

  function widenLayoutAncestors() {
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (!primary || !(primary instanceof HTMLElement)) return;
    let el = primary.parentElement;
    let hops = 0;
    while (el && hops < 6) {
      el.style.maxWidth = "none";
      hops += 1;
      el = el.parentElement;
    }
  }

  function apply() {
    ensureStyle();
    hideTabsByText();
    clickFollowingIfNeeded();

    hideLinksByHrefPrefixes(LEFT_NAV_HREF_PREFIXES);
    hideLeftNavItemsByText();

    hideRightSidebarModulesByText();
    ensureHeaderSearch();
    widenLayoutAncestors();
  }

  let observer = null;
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
  observer = new MutationObserver(() => {
    scheduleApply();
  });
  observer.observe(document.documentElement, OBSERVER_CONFIG);
  window.addEventListener("popstate", scheduleApply, { passive: true });
  window.addEventListener("hashchange", scheduleApply, { passive: true });
  window.setInterval(scheduleApply, 2000);
})();
