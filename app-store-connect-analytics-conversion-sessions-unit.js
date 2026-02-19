// ==UserScript==
// @name         App Store Connect Analytics: Conversion + Sessions/Unit
// @namespace    https://tampermonkey.net/
// @version      1.1.3
// @description  Adds Impressions→Downloads conversion rate and Sessions per Unit to the Apps table.
// @match        https://appstoreconnect.apple.com/analytics/apps/d30*
// @updateURL    https://raw.githubusercontent.com/eitjuh/tampermonkey-scripts/main/app-store-connect-analytics-conversion-sessions-unit.js
// @downloadURL  https://raw.githubusercontent.com/eitjuh/tampermonkey-scripts/main/app-store-connect-analytics-conversion-sessions-unit.js
// @grant        none
// ==/UserScript==

(function () {
    "use strict";
  
    const COL_CONV = "Conv (Imp→Dl)";
    const COL_SPU = "Sessions/Unit";
    const MARK = "data-tm-extra-cols";
    const HEADER_MARK = "data-tm-extra-cols-header";
    const SORT_HEADER = "data-tm-sort-header";
    const SORT_KEY = "data-tm-sort-key";
    const SORT_STATE_KEY = "tmSortKey";
    const SORT_STATE_DIR = "tmSortDir";
    const DIR_ASC = "asc";
    const DIR_DESC = "desc";
    const OBSERVER_CONFIG = { childList: true, subtree: true };
  
    function parseMetricFromTitleOrText(el) {
      if (!el) return NaN;
  
      // Prefer exact numeric title if present (ASC uses title="8508" etc)
      const title = (el.getAttribute?.("title") || "").trim();
      if (title && /^-?\d+(\.\d+)?$/.test(title)) return Number(title);
  
      const text = (el.textContent || "").trim();
      if (!text) return NaN;
  
      // Take only the first token-like number (avoid including % change lines)
      // Examples: "8.51K", "451", "$53"
      const first = text.split(/\s+/)[0] || text;
  
      const cleaned = first.replace(/\$/g, "").replace(/,/g, "").trim().toUpperCase();
      if (cleaned === "-" || cleaned === "–") return NaN;
  
      const m = cleaned.match(/^(-?\d+(\.\d+)?)([KMB])?$/);
      if (!m) return NaN;
  
      let n = Number(m[1]);
      const suf = m[3];
      if (suf === "K") n *= 1e3;
      if (suf === "M") n *= 1e6;
      if (suf === "B") n *= 1e9;
      return n;
    }
  
    function getPrimaryMetricFromCell(td) {
      if (!td) return NaN;
  
      // The primary metric is typically inside p[title] > a, with p[title] having the exact value.
      const pTitle = td.querySelector("p[title]");
      if (pTitle) return parseMetricFromTitleOrText(pTitle);
  
      const a = td.querySelector("a");
      if (a) return parseMetricFromTitleOrText(a);
  
      // Fallback: first text-like element
      return parseMetricFromTitleOrText(td);
    }
  
    function fmtPercent(x) {
      if (!Number.isFinite(x)) return "–";
      return (x * 100).toFixed(2) + "%";
    }
  
    function fmtNumber(x) {
      if (!Number.isFinite(x)) return "–";
      const abs = Math.abs(x);
      if (abs < 0.1) return x.toFixed(4);
      if (abs < 1) return x.toFixed(3);
      return x.toFixed(2);
    }

    function computeDerived(impressions, units, sessions) {
      const conv =
        Number.isFinite(units) && Number.isFinite(impressions) && impressions !== 0
          ? units / impressions
          : NaN;
      const spu =
        Number.isFinite(sessions) && Number.isFinite(units) && units !== 0
          ? sessions / units
          : NaN;
      return { conv, spu };
    }
  
    function findAppsTable() {
      const tables = Array.from(document.querySelectorAll("table"));
      for (const table of tables) {
        const ths = Array.from(table.querySelectorAll("thead th"));
        const labels = ths.map((th) => (th.textContent || "").trim().toLowerCase());
        if (
          labels.some((s) => s.startsWith("impressions")) &&
          labels.some((s) => s.startsWith("units")) &&
          labels.some((s) => s.startsWith("sessions"))
        ) {
          return table;
        }
      }
      return null;
    }
  
    function headerIndexMap(table) {
      const ths = Array.from(table.querySelectorAll("thead th"));
      const baseThs = [];
      const map = new Map();
      ths.forEach((th) => {
        if (th.getAttribute(HEADER_MARK) === "1") return;
        const idx = baseThs.length;
        baseThs.push(th);
        const key = (th.textContent || "").trim().toLowerCase();
        if (key.startsWith("impressions")) map.set("impressions", idx);
        else if (key.startsWith("units")) map.set("units", idx);
        else if (key.startsWith("sessions")) map.set("sessions", idx);
      });
      return { baseThs, map };
    }
  
    function setHeaderLabel(th, baseLabel, dir) {
      const div = th.querySelector("div") || document.createElement("div");
      const suffix = dir === DIR_ASC ? " ▲" : dir === DIR_DESC ? " ▼" : "";
      div.textContent = baseLabel + suffix;
      div.style.whiteSpace = "nowrap";
      if (!div.parentElement) th.appendChild(div);
    }

    function cloneHeaderLike(th, label, sortKey) {
      const th2 = th.cloneNode(true);
  
      // Remove sort icon if present and reset content to match style
      th2.querySelectorAll("svg").forEach((s) => s.remove());
  
      // Clear and rebuild
      th2.textContent = "";
      setHeaderLabel(th2, label, null);
  
      // Mark so we can detect duplicates
      th2.setAttribute(HEADER_MARK, "1");
      th2.setAttribute(SORT_HEADER, "1");
      th2.setAttribute(SORT_KEY, sortKey);
      th2.setAttribute("role", "button");
      th2.setAttribute("tabindex", "0");
      th2.style.cursor = "pointer";
  
      // Keep headers accessible and exposed as sortable columns
      th2.setAttribute("aria-sort", "none");
  
      return th2;
    }

    function getSortState(table) {
      const key = table.dataset[SORT_STATE_KEY] || "";
      const dir = table.dataset[SORT_STATE_DIR] || "";
      return { key, dir };
    }

    function setSortState(table, key, dir) {
      table.dataset[SORT_STATE_KEY] = key || "";
      table.dataset[SORT_STATE_DIR] = dir || "";
    }

    function refreshSortHeaderUi(table) {
      const { key: activeKey, dir: activeDir } = getSortState(table);
      const sortHeaders = Array.from(table.querySelectorAll(`thead th[${SORT_HEADER}="1"]`));
      for (const th of sortHeaders) {
        const key = th.getAttribute(SORT_KEY);
        const baseLabel = key === "conv" ? COL_CONV : COL_SPU;
        const isActive = key === activeKey && (activeDir === DIR_ASC || activeDir === DIR_DESC);
        setHeaderLabel(th, baseLabel, isActive ? activeDir : null);
        th.setAttribute(
          "aria-sort",
          isActive ? (activeDir === DIR_ASC ? "ascending" : "descending") : "none"
        );
      }
    }

    function rowSortValue(row, key) {
      // Sort using our already rendered derived cells to avoid index drift
      // after injected columns shift the original table positions.
      const extras = row.querySelectorAll(`td[${MARK}="1"]`);
      const idx = key === "conv" ? 0 : 1;
      const td = extras[idx];
      if (!td) return NaN;

      const raw = (td.textContent || "").replace(/,/g, "").trim();
      if (!raw) return NaN;
      if (key === "conv") {
        const n = Number(raw.replace("%", ""));
        return Number.isFinite(n) ? n / 100 : NaN;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : NaN;
    }

    function applySort(table, idxMap) {
      const tbody = table.querySelector("tbody");
      if (!tbody) return;

      const { key, dir } = getSortState(table);
      if (!key || (dir !== DIR_ASC && dir !== DIR_DESC)) {
        refreshSortHeaderUi(table);
        return;
      }

      const rows = Array.from(tbody.querySelectorAll("tr")).map((row, index) => ({
        row,
        index,
        value: rowSortValue(row, key),
      }));

      rows.sort((a, b) => {
        const aOk = Number.isFinite(a.value);
        const bOk = Number.isFinite(b.value);
        if (!aOk && !bOk) return a.index - b.index;
        if (!aOk) return 1;
        if (!bOk) return -1;
        const d = a.value - b.value;
        if (d === 0) return a.index - b.index;
        return dir === DIR_ASC ? d : -d;
      });

      const frag = document.createDocumentFragment();
      for (const { row } of rows) frag.appendChild(row);
      tbody.appendChild(frag);
      refreshSortHeaderUi(table);
    }

    function wireSortHeaders(table, idxMap) {
      const headers = Array.from(table.querySelectorAll(`thead th[${SORT_HEADER}="1"]`));
      for (const th of headers) {
        if (th.dataset.tmSortBound === "1") continue;
        th.dataset.tmSortBound = "1";

        const onToggle = () => {
          const key = th.getAttribute(SORT_KEY);
          if (!key) return;
          const current = getSortState(table);
          const nextDir =
            current.key === key && current.dir === DIR_ASC ? DIR_DESC : DIR_ASC;
          setSortState(table, key, nextDir);
          applySort(table, idxMap);
        };

        th.addEventListener("click", onToggle);
        th.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onToggle();
          }
        });
      }
    }
  
    function ensureHeader(table, baseThs, idxUnits) {
      const tr = table.querySelector("thead tr");
      if (!tr) return;
  
      if (tr.querySelector(`th[${HEADER_MARK}="1"]`)) return;
  
      const unitsTh = baseThs[idxUnits] || tr.querySelector("th:last-child");
      if (!unitsTh) return;
  
      const thConv = cloneHeaderLike(unitsTh, COL_CONV, "conv");
      const thSpu = cloneHeaderLike(unitsTh, COL_SPU, "spu");
  
      const allThs = Array.from(tr.querySelectorAll("th"));
      const anchor = allThs[idxUnits] || allThs[allThs.length - 1];
      anchor.insertAdjacentElement("afterend", thConv);
      thConv.insertAdjacentElement("afterend", thSpu);
    }
  
    function makeValueTdLike(exampleTd, valueText, titleText) {
      const td = exampleTd.cloneNode(true);
  
      // Clean out any existing content
      td.innerHTML = "";
      td.setAttribute(MARK, "1");
      td.style.whiteSpace = "nowrap";
  
      // Reuse the same <p> style if possible
      const pExample = exampleTd.querySelector("p") || null;
      const p = pExample ? pExample.cloneNode(false) : document.createElement("p");
      if (titleText) p.setAttribute("title", titleText);
  
      // Make it look like the primary metric line (no link)
      p.textContent = valueText;
  
      td.appendChild(p);
  
      // No % change span for derived metrics
      return td;
    }
  
    function ensureRows(table, idxMap) {
      const tbody = table.querySelector("tbody");
      if (!tbody) return 0;
  
      const rows = Array.from(tbody.querySelectorAll("tr"));
      let addedCount = 0;
      for (const row of rows) {
        if (row.querySelector(`td[${MARK}="1"]`)) continue;
  
        const tds = Array.from(row.querySelectorAll("td"));
        const baseTds = tds.filter((td) => td.getAttribute(MARK) !== "1");
        const iImp = idxMap.get("impressions");
        const iUnits = idxMap.get("units");
        const iSessions = idxMap.get("sessions");
        if (iImp == null || iUnits == null || iSessions == null) continue;
        if (!baseTds[iImp] || !baseTds[iUnits] || !baseTds[iSessions]) continue;
  
        const impressions = getPrimaryMetricFromCell(baseTds[iImp]);
        const units = getPrimaryMetricFromCell(baseTds[iUnits]);
        const sessions = getPrimaryMetricFromCell(baseTds[iSessions]);
  
        const { conv, spu } = computeDerived(impressions, units, sessions);
  
        const convTitle = `Units ${Number.isFinite(units) ? units : "–"} / Impressions ${Number.isFinite(impressions) ? impressions : "–"}`;
        const spuTitle = `Sessions ${Number.isFinite(sessions) ? sessions : "–"} / Units ${Number.isFinite(units) ? units : "–"}`;
  
        const tdConv = makeValueTdLike(baseTds[iUnits], fmtPercent(conv), convTitle);
        const tdSpu = makeValueTdLike(baseTds[iUnits], fmtNumber(spu), spuTitle);
  
        baseTds[iUnits].insertAdjacentElement("afterend", tdConv);
        tdConv.insertAdjacentElement("afterend", tdSpu);
        addedCount += 1;
      }
      return addedCount;
    }
  
    function apply() {
      const table = findAppsTable();
      if (!table) return;
  
      const { baseThs, map } = headerIndexMap(table);
      const iUnits = map.get("units");
      if (iUnits == null) return;
      const { key, dir } = getSortState(table);
      const hasActiveSort = !!key && (dir === DIR_ASC || dir === DIR_DESC);
  
      ensureHeader(table, baseThs, iUnits);
      const addedRows = ensureRows(table, map);
      wireSortHeaders(table, map);
      if (hasActiveSort && addedRows > 0) applySort(table, map);
      else refreshSortHeaderUi(table);
    }
  
    let observer = null;
    let applyScheduled = false;
    let applyRunning = false;

    function runApplyCycle() {
      if (applyRunning) return;
      applyRunning = true;
      if (observer) observer.disconnect();
      try {
        apply();
      } finally {
        if (observer) observer.observe(document.documentElement, OBSERVER_CONFIG);
        applyRunning = false;
      }
    }

    function scheduleApply() {
      if (applyScheduled) return;
      applyScheduled = true;
      requestAnimationFrame(() => {
        applyScheduled = false;
        runApplyCycle();
      });
    }

    runApplyCycle();

    // Re-apply on SPA rerenders (throttled to one run per frame).
    observer = new MutationObserver(() => {
      if (applyRunning) return;
      scheduleApply();
    });
    observer.observe(document.documentElement, OBSERVER_CONFIG);
  })();
  