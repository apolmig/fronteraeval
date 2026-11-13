(() => {
  "use strict";

  const THEME_KEY = "fronteraeval-theme";
  const main = document.querySelector("#main");
  const searchTrigger = document.querySelector("#command-search-trigger");
  const themeToggle = document.querySelector("#theme-toggle");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

  let dialog;
  let paletteInput;
  let paletteResults;
  let paletteContext;
  let resultItems = [];
  let activeIndex = 0;
  let lastFocused = null;
  let renderingAbout = false;

  const catalogPromise = globalThis.FronteraEvalCatalogPromise ||= fetch("/data/catalog.json")
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  function currentPath() {
    return (location.hash || "#/").slice(1).split("?")[0] || "/";
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function updateThemeControl() {
    if (!themeToggle) return;
    const dark = currentTheme() === "dark";
    const target = dark ? "light" : "dark";
    const icon = themeToggle.querySelector("[data-theme-icon]");
    const label = themeToggle.querySelector("[data-theme-label]");
    if (icon) icon.textContent = dark ? "☀" : "☾";
    if (label) label.textContent = dark ? "Light" : "Dark";
    themeToggle.setAttribute("aria-label", `Switch to ${target} theme`);
    themeToggle.setAttribute("title", `Switch to ${target} theme`);
    themeToggle.setAttribute("aria-pressed", String(dark));
    if (themeMeta) themeMeta.setAttribute("content", dark ? "#151513" : "#f7f5ef");
  }

  function applyTheme(theme, persist = true) {
    const next = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    if (persist) localStorage.setItem(THEME_KEY, next);
    updateThemeControl();
  }

  function installTheme() {
    updateThemeControl();
    themeToggle?.addEventListener("click", () => {
      applyTheme(currentTheme() === "dark" ? "light" : "dark");
    });

    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", (event) => {
      if (!localStorage.getItem(THEME_KEY)) applyTheme(event.matches ? "dark" : "light", false);
    });
  }

  function createPalette() {
    if (document.querySelector("#command-palette")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <dialog class="command-palette" id="command-palette" aria-labelledby="command-palette-title">
        <div class="command-palette-shell">
          <div class="command-search-row">
            <span class="command-search-icon" aria-hidden="true">⌕</span>
            <label class="sr-only" for="command-palette-input" id="command-palette-title">Search FronteraEval</label>
            <input id="command-palette-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search evaluations, risks, methods, or pages…" aria-controls="command-palette-results">
            <kbd>Esc</kbd>
          </div>
          <div class="command-context" id="command-palette-context">Search the catalogue semantically, or open a section.</div>
          <div class="command-results" id="command-palette-results" role="listbox" aria-label="Search results"></div>
          <footer class="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span>${isMac ? "⌘ K" : "Ctrl K"}</span></footer>
        </div>
      </dialog>`);

    dialog = document.querySelector("#command-palette");
    paletteInput = document.querySelector("#command-palette-input");
    paletteResults = document.querySelector("#command-palette-results");
    paletteContext = document.querySelector("#command-palette-context");

    paletteInput.addEventListener("input", () => renderPalette(paletteInput.value));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closePalette();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closePalette();
    });
    paletteResults.addEventListener("mousemove", (event) => {
      const option = event.target.closest("[data-command-index]");
      if (!option) return;
      setActive(Number(option.dataset.commandIndex));
    });
    paletteResults.addEventListener("click", (event) => {
      if (event.target.closest("[data-command-index]")) closePalette();
    });
  }

  function pageItems() {
    return [
      { title: "Browse evaluations", meta: "Search and filter the full catalogue", href: "#/evals", kind: "Page" },
      { title: "Topics", meta: "Browse by risk and capability area", href: "#/topics", kind: "Page" },
      { title: "Method", meta: "How records, evidence states, and inference limits work", href: "#/methodology", kind: "Page" },
      { title: "About FronteraEval", meta: "Why the project exists", href: "#/about", kind: "Page" }
    ];
  }

  function topicLabels(catalog) {
    return Object.fromEntries(Object.entries(catalog?.topics || {}).map(([id, topic]) => [id, topic.label]));
  }

  function fallbackResults(catalog, query) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return catalog.records
      .map((record) => {
        const haystack = [
          record.name, record.description, record.organisation, record.measures,
          record.paper?.title, record.paper_title, ...(record.topics || [])
        ].join(" ").toLowerCase();
        const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
        return { record, score, reasons: [] };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 9);
  }

  async function paletteSearch(query) {
    const catalog = await catalogPromise;
    if (!catalog) return { items: [], context: "Catalogue unavailable." };
    const text = query.trim();
    if (!text) return { items: pageItems(), context: "Jump to a section, or type to search the catalogue." };

    const engine = globalThis.FronteraSearch;
    const search = engine?.search
      ? engine.search(catalog.records, text, { topicLabels: topicLabels(catalog), filters: {} })
      : { results: fallbackResults(catalog, text), interpretation: null };

    const items = search.results.slice(0, 9).map((entry) => {
      const record = entry.record;
      return {
        title: record.name,
        meta: [record.organisation, String(record.record_type || "catalogue record").replaceAll("-", " "), ...(record.topics || []).slice(0, 2).map((id) => catalog.topics?.[id]?.label || id)].filter(Boolean).join(" · "),
        detail: (entry.reasons || []).slice(0, 2).join(" · "),
        badge: record.review_status === "reviewed" ? "Reviewed" : record.review_status === "catalogued" ? "Catalogued" : "Imported",
        href: `#/eval/${encodeURIComponent(record.id)}`,
        kind: "Evaluation"
      };
    });

    const interpretation = search.interpretation?.labels?.length
      ? `Interpreted as ${search.interpretation.labels.join(" + ")}.`
      : `Semantic matches for “${text}”.`;
    return { items, context: `${interpretation} Related results are not necessarily equivalent measures.` };
  }

  function optionMarkup(item, index) {
    return `<a class="command-option${index === activeIndex ? " active" : ""}" href="${esc(item.href)}" role="option" aria-selected="${index === activeIndex}" id="command-option-${index}" data-command-index="${index}">
      <span class="command-option-main"><strong>${esc(item.title)}</strong><small>${esc(item.meta || "")}</small>${item.detail ? `<small class="command-match">${esc(item.detail)}</small>` : ""}</span>
      <span class="command-option-side">${item.badge ? `<em>${esc(item.badge)}</em>` : `<em>${esc(item.kind || "")}</em>`}<b aria-hidden="true">↵</b></span>
    </a>`;
  }

  async function renderPalette(query = "") {
    if (!paletteResults) return;
    const request = query;
    paletteResults.innerHTML = `<div class="command-loading">Searching…</div>`;
    const result = await paletteSearch(request);
    if (paletteInput.value !== request) return;
    resultItems = result.items;
    activeIndex = 0;
    paletteContext.textContent = result.context;
    paletteResults.innerHTML = resultItems.length
      ? resultItems.map(optionMarkup).join("")
      : `<div class="command-empty"><strong>No confident match</strong><span>Try a broader risk, capability, or evaluation name.</span></div>`;
    updateActiveOption();
  }

  function updateActiveOption() {
    const options = [...paletteResults.querySelectorAll("[data-command-index]")];
    options.forEach((option, index) => {
      const active = index === activeIndex;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", String(active));
    });
    const active = options[activeIndex];
    if (active) {
      paletteInput.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      paletteInput.removeAttribute("aria-activedescendant");
    }
  }

  function setActive(index) {
    if (!resultItems.length) return;
    activeIndex = Math.max(0, Math.min(index, resultItems.length - 1));
    updateActiveOption();
  }

  function openPalette(initialQuery = "") {
    createPalette();
    lastFocused = document.activeElement;
    paletteInput.value = initialQuery;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    document.body.classList.add("command-open");
    renderPalette(initialQuery);
    window.setTimeout(() => paletteInput.focus(), 0);
  }

  function closePalette() {
    if (!dialog?.open && !dialog?.hasAttribute("open")) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("command-open");
    lastFocused?.focus?.();
  }

  function installPalette() {
    createPalette();
    const shortcut = searchTrigger?.querySelector("kbd");
    if (shortcut) shortcut.textContent = isMac ? "⌘ K" : "Ctrl K";
    searchTrigger?.addEventListener("click", () => openPalette());

    document.addEventListener("keydown", (event) => {
      const commandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (commandK) {
        event.preventDefault();
        if (dialog?.open) closePalette();
        else openPalette();
        return;
      }
      if (!dialog?.open) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((activeIndex + 1) % Math.max(resultItems.length, 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((activeIndex - 1 + Math.max(resultItems.length, 1)) % Math.max(resultItems.length, 1));
      } else if (event.key === "Enter" && resultItems.length) {
        event.preventDefault();
        paletteResults.querySelector(`[data-command-index="${activeIndex}"]`)?.click();
      }
    });
  }

  function aboutMarkup(catalog) {
    const total = catalog?.records?.length || 0;
    const reviewed = catalog?.stats?.review_status?.reviewed || 0;
    const discovery = Math.max(0, total - reviewed);
    return `
      <header class="page-head about-head"><div class="wide page-head-inner">
        <div><div class="eyebrow">About</div><h1>Why FronteraEval exists</h1></div>
        <p>A practical, incomplete attempt to make a fragmented field easier to navigate.</p>
      </div></header>
      <article class="prose about-page" data-ui-about>
        <p class="about-lede">FronteraEval began during my Cambridge ERA research fellowship. I kept losing time trying to locate relevant evaluations across papers, system cards, repositories, registries, and lab reports. I could not find one place that was simultaneously current, broad, careful about what each result actually supports, and simple enough to use outside a narrow technical audience.</p>
        <p>This site is my attempt to reduce that friction—not a claim to have solved evaluation discovery. It links records back to primary sources and, for a limited reviewed subset, adds a bounded interpretation of what the evidence can and cannot establish.</p>
        <p>The catalogue is not exhaustive and will contain omissions, judgement calls, and occasional errors. Coverage depends on public information and on a taxonomy that will need revision. A listing is not an endorsement. A reviewed record is a documented reading of the available sources, not an independent replication. Weekly refreshes improve freshness; they do not guarantee completeness or correctness.</p>
        <div class="about-coverage" aria-label="Current coverage boundary">
          <div><strong>${total}</strong><span>catalogue records</span></div>
          <div><strong>${reviewed}</strong><span>documentary reviews</span></div>
          <div><strong>${discovery}</strong><span>discovery-only records</span></div>
        </div>
        <p class="about-boundary"><strong>These counts describe current public coverage, not completeness, validity, or quality.</strong> Use FronteraEval as a starting point: follow the paper, inspect the implementation, check the exact protocol and model-system conditions, and treat comparisons cautiously.</p>
        <div class="about-principles" aria-label="Project principles">
          <div><strong>Updated, not exhaustive</strong><span>Sources are refreshed regularly, but important work may still be missing.</span></div>
          <div><strong>Source-first</strong><span>Papers, code, datasets, and provenance should remain visible and contestable.</span></div>
          <div><strong>Explicit uncertainty</strong><span>Related records are not necessarily comparable, and capability evidence is not downstream harm.</span></div>
        </div>
        <p class="about-credit">Built and maintained by <a href="https://miguelguerrero.eu" target="_blank" rel="me noopener">Miguel Guerrero ↗</a> · <a href="https://github.com/apolmig/fronteraeval/issues" target="_blank" rel="noopener">Report a correction ↗</a></p>
      </article>`;
  }

  async function renderAbout() {
    if (currentPath() !== "/about" || renderingAbout) return;
    if (main.querySelector("[data-ui-about]")) return;
    renderingAbout = true;
    document.title = "About — FronteraEval";
    document.querySelectorAll("[data-nav]").forEach((link) => link.removeAttribute("aria-current"));
    document.querySelector('[data-nav="about"]')?.setAttribute("aria-current", "page");
    const catalog = await catalogPromise;
    if (currentPath() !== "/about") { renderingAbout = false; return; }
    main.innerHTML = aboutMarkup(catalog);
    main.focus();
    renderingAbout = false;
  }

  function installAboutRoute() {
    const sync = () => window.setTimeout(renderAbout, 0);
    window.addEventListener("hashchange", sync);
    new MutationObserver(() => {
      if (currentPath() === "/about" && !main.querySelector("[data-ui-about]")) sync();
    }).observe(main, { childList: true, subtree: false });
    sync();
  }

  installTheme();
  installPalette();
  installAboutRoute();
})();
