(() => {
  "use strict";

  const PAGE_SIZE = 40;
  const state = {
    catalog: null,
    records: [],
    live: null,
    filters: { q: "", topic: "", status: "", source: "", sort: "relevance" },
    visible: PAGE_SIZE
  };

  const main = document.querySelector("#main");
  const announcer = document.querySelector("#announcer");
  const menuToggle = document.querySelector(".menu-toggle");
  const primaryNav = document.querySelector("#primary-nav");

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const topicLabel = (id) => state.catalog?.topics?.[id]?.label || String(id).replaceAll("-", " ");
  const sourceLabel = (id) => ({
    "inspect-internal": "Inspect implementation",
    "inspect-register": "Inspect register",
    "canonical-source": "Canonical source"
  })[id] || id;
  const statusLabel = (id) => ({ reviewed: "Reviewed", catalogued: "Catalogued", imported: "Imported" })[id] || id;
  const statusExplanation = (id) => ({
    reviewed: "FronteraEval has added a bounded interpretation.",
    catalogued: "A primary source is identified; the protocol is not independently assessed.",
    imported: "Official metadata for discovery only."
  })[id] || "";
  const formatDate = (value) => {
    if (!value) return "Not reviewed";
    const raw = String(value).slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${raw}T12:00:00Z`));
  };
  const routeParts = () => {
    const raw = (location.hash || "#/").slice(1);
    const [path, query = ""] = raw.split("?");
    return { path: path || "/", params: new URLSearchParams(query) };
  };

  function normaliseLinks(record) {
    const links = Array.isArray(record.links) ? record.links : [];
    const result = links
      .filter((link) => link?.url && String(link.url).startsWith("https://"))
      .map((link) => ({ type: link.type || "source", label: link.label || "Source", url: link.url }));
    if (record.source_url && !result.some((link) => link.url === record.source_url)) {
      result.unshift({
        type: record.source_type === "inspect-internal" ? "implementation" : record.source_type === "inspect-register" ? "registry" : "primary",
        label: record.source_label || (record.source_type === "inspect-internal" ? "Inspect implementation" : record.source_type === "inspect-register" ? "Registry record" : "Primary source"),
        url: record.source_url
      });
    }
    return result.filter((link, index, list) => list.findIndex((item) => item.url === link.url) === index);
  }

  function primaryLink(record) {
    return normaliseLinks(record)[0] || { label: "Primary source", url: record.source_url };
  }

  function liveDate() {
    return state.live?.checked_at ? String(state.live.checked_at).slice(0, 10) : null;
  }

  function inferTopics(name) {
    const text = String(name).toLowerCase();
    const topics = [];
    const rules = [
      ["human-influence", ["persua", "influence", "coerc", "sycoph", "machiav", "deception"]],
      ["deception-misalignment", ["misalign", "stealth", "sandbag", "alignment"]],
      ["autonomy-agents", ["agent", "osworld", "gaia", "web", "terminal"]],
      ["cyber", ["cyber", "cve", "ctf", "exploit", "phish"]],
      ["bio-cbrn", ["bio", "chem", "cbrn"]],
      ["safeguards", ["safety", "jailbreak", "reject", "harm"]],
      ["evaluation-integrity", ["judge", "monitor", "eval"]]
    ];
    for (const [topic, needles] of rules) if (needles.some((needle) => text.includes(needle))) topics.push(topic);
    return topics.length ? topics : ["general-capability"];
  }

  function mergeLive(entries) {
    const existing = new Set(state.records.map((record) => record.id));
    for (const entry of entries) {
      if (existing.has(entry.id)) continue;
      state.records.push({
        id: entry.id,
        name: entry.name,
        organisation: "UK AI Security Institute / upstream authors",
        source_type: entry.source_type,
        source_url: entry.source_url,
        source_label: entry.source_type === "inspect-internal" ? "Inspect implementation" : "Registry record",
        links: [
          { type: entry.source_type === "inspect-internal" ? "implementation" : "registry", label: entry.source_type === "inspect-internal" ? "Inspect implementation" : "Registry record", url: entry.source_url },
          { type: "documentation", label: "Inspect documentation", url: "https://inspect.aisi.org.uk/" }
        ],
        topics: inferTopics(entry.name),
        description: "New Inspect entry detected by the weekly source sweep.",
        review_status: "imported",
        code_available: true,
        inspect_compatible: true,
        last_source_check: liveDate(),
        editorial_reviewed_at: null,
        measures: "Not independently assessed by FronteraEval yet.",
        does_not_measure: "No inference beyond the upstream source should be made until the protocol is reviewed.",
        best_for: "Discovery and source navigation.",
        not_sufficient_for: "Substantive capability, safety, or policy claims without reading the underlying protocol.",
        evidence_reach: [],
        collections: [],
        provenance: { source_sha: state.live?.inspect?.sha, method: "live weekly import" }
      });
    }
  }

  async function load() {
    const catalogResponse = await fetch("/data/catalog.json");
    if (!catalogResponse.ok) throw new Error("Catalogue unavailable");
    state.catalog = await catalogResponse.json();
    state.records = [...state.catalog.records];
    route();

    fetch("/api/weekly-status", { signal: AbortSignal.timeout(12000) })
      .then((response) => response.ok ? response.json() : null)
      .then((live) => {
        if (!live) return;
        state.live = live;
        if (live?.inspect?.entries?.length) mergeLive(live.inspect.entries);
        const { path } = routeParts();
        if (["/", "/updates"].includes(path)) route(false);
      })
      .catch(() => null);
  }

  function closeMenu() {
    primaryNav?.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }

  function updateNavigation(path) {
    document.querySelectorAll("[data-nav]").forEach((link) => link.removeAttribute("aria-current"));
    const key = path.startsWith("/eval") ? "evals"
      : path.startsWith("/topic") ? "topics"
      : path.startsWith("/collection/agency-transfer") ? "agency-transfer"
      : path.startsWith("/methodology") ? "methodology"
      : path.startsWith("/data") ? "data"
      : null;
    if (key) document.querySelector(`[data-nav="${key}"]`)?.setAttribute("aria-current", "page");
  }

  function setDocumentTitle(title) {
    document.title = title ? `${title} — FronteraEval` : "FronteraEval — Frontier AI evaluations, mapped";
  }

  function route(shouldScroll = true) {
    if (shouldScroll) window.scrollTo(0, 0);
    closeMenu();
    const { path, params } = routeParts();
    updateNavigation(path);

    if (path === "/") renderHome();
    else if (path === "/evals") renderBrowse(params);
    else if (path.startsWith("/eval/")) renderDetail(decodeURIComponent(path.slice(6)));
    else if (path === "/topics") renderTopics();
    else if (path.startsWith("/topic/")) renderTopic(path.slice(7));
    else if (path === "/collection/agency-transfer") renderAgencyTransfer();
    else if (path === "/methodology") renderMethodology();
    else if (path === "/updates") renderUpdates();
    else if (path === "/data") renderData();
    else renderNotFound();
    setTimeout(() => main.focus(), 0);
  }

  function freshnessText() {
    if (state.live?.status === "current" && state.live?.checked_at) {
      const checked = new Date(state.live.checked_at).toLocaleString("en-GB", {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
      });
      return `<span class="status-dot live"></span><span>Sources checked ${esc(checked)} UTC</span>`;
    }
    return `<span class="status-dot"></span><span>Build snapshot from ${esc(formatDate(state.catalog.generated_at))}</span>`;
  }

  function topicCounts() {
    const counts = {};
    for (const record of state.records) for (const topic of record.topics) counts[topic] = (counts[topic] || 0) + 1;
    return counts;
  }

  function reviewedRecords() {
    return state.records
      .filter((record) => record.review_status === "reviewed")
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderHome() {
    setDocumentTitle("");
    const reviewed = reviewedRecords();
    const counts = topicCounts();
    const homeTopics = ["autonomy-agents", "cyber", "bio-cbrn", "deception-misalignment", "human-influence", "safeguards"];

    main.innerHTML = `
      <section class="home-hero">
        <div class="wide home-hero-grid">
          <div>
            <div class="eyebrow">Frontier AI evaluations, mapped</div>
            <h1>Find the right evaluation.</h1>
            <p class="lede">Search by risk, capability, construct, or method. Every record leads back to its source; reviewed records also state what the evidence can—and cannot—support.</p>
            <div class="search-panel">
              <form class="search-shell" id="home-search">
                <input id="home-query" type="search" autocomplete="off" aria-label="Search evaluations" placeholder="e.g. scheming, autonomous AI R&D, jailbreak robustness">
                <button type="submit">Search</button>
              </form>
              <div class="quick-topics" aria-label="Popular topics">
                ${homeTopics.map((topic) => `<button type="button" data-topic="${esc(topic)}">${esc(topicLabel(topic))}</button>`).join("")}
              </div>
            </div>
          </div>
          <aside class="catalogue-card" aria-label="Catalogue status">
            <h2>Catalogue</h2>
            <div class="catalogue-stats">
              <div class="catalogue-stat"><strong>${state.records.length}</strong><span>evaluation records</span></div>
              <div class="catalogue-stat"><strong>${reviewed.length}</strong><span>editorially reviewed</span></div>
              <div class="catalogue-stat"><strong>${Object.keys(state.catalog.topics).length}</strong><span>risk and capability topics</span></div>
              <div class="catalogue-stat"><strong>${state.catalog.stats.sources["canonical-source"] || 0}</strong><span>external canonical sources</span></div>
            </div>
            <div class="freshness-line">${freshnessText()}</div>
            <p class="small" style="margin-top:.8rem">Imported metadata supports discovery. It is not independent validation.</p>
          </aside>
        </div>
      </section>

      <section class="home-section">
        <div class="wide section-heading">
          <div><div class="eyebrow">Reviewed first</div><h2>Evaluations with an explicit claim boundary</h2></div>
          <a class="text-link" href="#/evals?status=reviewed">View all reviewed records →</a>
        </div>
        <div class="wide home-dashboard">
          <div class="review-list">
            ${reviewed.slice(0, 7).map((record) => {
              const source = primaryLink(record);
              return `<article class="review-row">
                <div><a class="review-name" href="#/eval/${encodeURIComponent(record.id)}">${esc(record.name)}</a><p class="review-description">${esc(record.measures)}</p></div>
                <span class="review-topic">${esc(record.topics.slice(0, 2).map(topicLabel).join(" · "))}</span>
                <a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener">Source ↗</a>
              </article>`;
            }).join("")}
          </div>
          <aside>
            <div class="eyebrow" style="margin-bottom:.55rem">Browse by topic</div>
            <div class="topic-mini-list">
              ${homeTopics.map((topic) => `<a class="topic-mini-row" href="#/topic/${esc(topic)}"><strong>${esc(topicLabel(topic))}</strong><span>${counts[topic] || 0}</span></a>`).join("")}
            </div>
            <p style="margin-top:1rem"><a class="text-link" href="#/topics">All topics →</a></p>
          </aside>
        </div>
      </section>

      <section class="home-section">
        <div class="wide boundary-block">
          <div class="boundary-copy">
            <div class="eyebrow">How to read a result</div>
            <h2>Evidence stops somewhere.</h2>
            <p>FronteraEval makes that stopping point visible. A controlled result can support a claim about model behaviour without establishing deployment, human effect, or societal outcome.</p>
            <a class="text-link" href="#/methodology">Read the method →</a>
          </div>
          <div class="boundary-cards">
            <div class="boundary-card"><small>May be supported</small><strong>Under this protocol, this model system produced this behaviour.</strong></div>
            <div class="boundary-card"><small>Not established by itself</small><strong>The system will cause the corresponding harm in real deployment.</strong></div>
          </div>
        </div>
      </section>

      <section class="home-section">
        <div class="wide collection-feature">
          <div>
            <div class="eyebrow">Flagship collection</div>
            <h2>Agency Transfer</h2>
            <p>A curated map of persuasion, manipulation, deception, and human-agency evaluations across the capability–deployment–effect gap.</p>
            <a class="text-link" href="#/collection/agency-transfer">Open the collection →</a>
          </div>
          <div class="chain" aria-label="Agency Transfer evidence chain">
            <div>Capability</div><div>Deployment at scale</div><div>Individual effect</div><div>Aggregate consequence</div>
          </div>
        </div>
      </section>`;

    document.querySelector("#home-search").addEventListener("submit", (event) => {
      event.preventDefault();
      const q = document.querySelector("#home-query").value.trim();
      location.hash = `#/evals${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    });
    document.querySelectorAll("[data-topic]").forEach((button) => {
      button.addEventListener("click", () => { location.hash = `#/evals?topic=${encodeURIComponent(button.dataset.topic)}`; });
    });
  }

  function readFilters(params) {
    state.filters.q = params.get("q") || "";
    state.filters.topic = params.get("topic") || "";
    state.filters.status = params.get("status") || "";
    state.filters.source = params.get("source") || "";
    state.filters.sort = params.get("sort") || (state.filters.q ? "relevance" : "reviewed");
    state.visible = PAGE_SIZE;
  }

  function syncFiltersToHash(replace = true) {
    const params = new URLSearchParams();
    for (const key of ["q", "topic", "status", "source", "sort"]) {
      const value = state.filters[key];
      if (value && !(key === "sort" && value === (state.filters.q ? "relevance" : "reviewed"))) params.set(key, value);
    }
    const next = `#/evals${params.toString() ? `?${params.toString()}` : ""}`;
    if (replace) history.replaceState(null, "", next); else location.hash = next;
  }

  function renderBrowse(params) {
    setDocumentTitle("Explore evaluations");
    readFilters(params);
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Evaluation catalogue</div>
        <h1>Explore evaluations</h1>
        <p class="lede">Find the protocol, read its evidence state, and go directly to the underlying source.</p>
      </div></header>
      <section class="browse"><div class="wide">
        <div class="filter-bar-wrap"><div class="filter-bar" id="filter-bar"></div></div>
        <div class="results-tools"><div><span class="results-count" id="result-count"></span> <button class="clear-button" id="clear-filters" type="button" hidden>Clear filters</button></div><span class="results-help">Reviewed = interpreted. Imported = discovery only.</span></div>
        <div id="results"></div>
      </div></section>`;
    renderFilterBar();
    renderResults();
  }

  function renderFilterBar() {
    const topicOptions = Object.entries(state.catalog.topics)
      .map(([id, topic]) => `<option value="${esc(id)}" ${state.filters.topic === id ? "selected" : ""}>${esc(topic.label)}</option>`).join("");
    const bar = document.querySelector("#filter-bar");
    bar.innerHTML = `
      <div class="control"><label for="filter-q">Search</label><input id="filter-q" type="search" value="${esc(state.filters.q)}" placeholder="Name, construct, method, organisation"></div>
      <div class="control"><label for="filter-topic">Topic</label><select id="filter-topic"><option value="">All topics</option>${topicOptions}</select></div>
      <div class="control"><label for="filter-status">Evidence state</label><select id="filter-status"><option value="">All states</option><option value="reviewed" ${state.filters.status === "reviewed" ? "selected" : ""}>Reviewed</option><option value="catalogued" ${state.filters.status === "catalogued" ? "selected" : ""}>Catalogued</option><option value="imported" ${state.filters.status === "imported" ? "selected" : ""}>Imported</option></select></div>
      <div class="control"><label for="filter-source">Source layer</label><select id="filter-source"><option value="">All sources</option><option value="inspect-internal" ${state.filters.source === "inspect-internal" ? "selected" : ""}>Inspect implementation</option><option value="inspect-register" ${state.filters.source === "inspect-register" ? "selected" : ""}>Inspect register</option><option value="canonical-source" ${state.filters.source === "canonical-source" ? "selected" : ""}>Other canonical</option></select></div>
      <div class="control"><label for="filter-sort">Sort</label><select id="filter-sort"><option value="relevance" ${state.filters.sort === "relevance" ? "selected" : ""}>Relevance</option><option value="reviewed" ${state.filters.sort === "reviewed" ? "selected" : ""}>Reviewed first</option><option value="name" ${state.filters.sort === "name" ? "selected" : ""}>Name A–Z</option><option value="recent" ${state.filters.sort === "recent" ? "selected" : ""}>Recently checked</option></select></div>`;

    const bindings = [
      ["#filter-q", "q", "input"], ["#filter-topic", "topic", "change"], ["#filter-status", "status", "change"],
      ["#filter-source", "source", "change"], ["#filter-sort", "sort", "change"]
    ];
    for (const [selector, key, event] of bindings) {
      document.querySelector(selector).addEventListener(event, (change) => {
        state.filters[key] = change.target.value;
        if (key === "q" && !state.filters.q && state.filters.sort === "relevance") state.filters.sort = "reviewed";
        if (key === "q" && state.filters.q && state.filters.sort === "reviewed") state.filters.sort = "relevance";
        state.visible = PAGE_SIZE;
        syncFiltersToHash();
        renderResults();
      });
    }
    document.querySelector("#clear-filters").addEventListener("click", () => {
      state.filters = { q: "", topic: "", status: "", source: "", sort: "reviewed" };
      state.visible = PAGE_SIZE;
      syncFiltersToHash();
      renderFilterBar();
      renderResults();
    });
  }

  function searchableText(record) {
    return [record.name, record.description, record.organisation, record.id, record.measures, record.does_not_measure, ...record.topics.map(topicLabel)].join(" ").toLowerCase();
  }

  function relevanceScore(record, needle) {
    if (!needle) return 0;
    const name = record.name.toLowerCase();
    const description = String(record.description || "").toLowerCase();
    const organisation = String(record.organisation || "").toLowerCase();
    const topics = record.topics.map(topicLabel).join(" ").toLowerCase();
    const tokens = needle.split(/\s+/).filter(Boolean);
    let score = 0;
    if (name === needle) score += 120;
    if (name.startsWith(needle)) score += 70;
    if (name.includes(needle)) score += 45;
    for (const token of tokens) {
      if (name.includes(token)) score += 16;
      if (topics.includes(token)) score += 8;
      if (description.includes(token)) score += 4;
      if (organisation.includes(token)) score += 2;
    }
    if (record.review_status === "reviewed") score += 3;
    return score;
  }

  function filteredRecords() {
    const { q, topic, status, source, sort } = state.filters;
    const needle = q.trim().toLowerCase();
    const statusOrder = { reviewed: 0, catalogued: 1, imported: 2 };
    const records = state.records.filter((record) => {
      const matchesQuery = !needle || needle.split(/\s+/).every((token) => searchableText(record).includes(token));
      return matchesQuery && (!topic || record.topics.includes(topic)) && (!status || record.review_status === status) && (!source || record.source_type === source);
    });
    return records.sort((a, b) => {
      if (sort === "relevance" && needle) return relevanceScore(b, needle) - relevanceScore(a, needle) || a.name.localeCompare(b.name);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return String(b.last_source_check || "").localeCompare(String(a.last_source_check || "")) || a.name.localeCompare(b.name);
      return (statusOrder[a.review_status] ?? 3) - (statusOrder[b.review_status] ?? 3) || a.name.localeCompare(b.name);
    });
  }

  function statusMarkup(record) {
    return `<span class="eval-status ${esc(record.review_status)}" title="${esc(statusExplanation(record.review_status))}">${esc(statusLabel(record.review_status))}</span>`;
  }

  function renderRow(record) {
    const source = primaryLink(record);
    return `<article class="eval-row">
      <div class="eval-main">
        <a class="eval-title" href="#/eval/${encodeURIComponent(record.id)}">${esc(record.name)}</a>
        <p class="eval-description">${esc(record.description)}</p>
      </div>
      <div class="eval-meta">${esc(record.organisation)}<div class="eval-topic-links">${record.topics.slice(0, 2).map((topic) => `<a href="#/topic/${esc(topic)}">${esc(topicLabel(topic))}</a>`).join(" · ")}</div></div>
      <div>${statusMarkup(record)}</div>
      <div class="eval-actions"><a href="#/eval/${encodeURIComponent(record.id)}">Details</a><a class="primary" href="${esc(source.url)}" target="_blank" rel="noopener">Source ↗</a></div>
    </article>`;
  }

  function renderResults() {
    const records = filteredRecords();
    const visible = records.slice(0, state.visible);
    const active = Boolean(state.filters.q || state.filters.topic || state.filters.status || state.filters.source);
    document.querySelector("#clear-filters").hidden = !active;
    document.querySelector("#result-count").textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
    document.querySelector("#results").innerHTML = records.length
      ? `<div class="eval-list">${visible.map(renderRow).join("")}</div>${visible.length < records.length ? `<button class="load-more" id="load-more" type="button">Show ${Math.min(PAGE_SIZE, records.length - visible.length)} more</button>` : ""}`
      : `<div class="empty"><h2>No matching evaluation.</h2><p>Try a broader construct, remove a filter, or search the source organisation.</p></div>`;
    announcer.textContent = `${records.length} evaluation records found`;
    document.querySelector("#load-more")?.addEventListener("click", () => { state.visible += PAGE_SIZE; renderResults(); });
  }

  function renderDetail(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return renderNotFound();
    setDocumentTitle(record.name);
    const links = normaliseLinks(record);
    const source = links[0];
    const evidenceSteps = [
      ["artifact-production", "Artifact"], ["controlled-model-behaviour", "Model behaviour"], ["controlled-human-effect", "Human effect"],
      ["deployment-readiness", "Deployment readiness"], ["observed-deployment", "Observed deployment"], ["aggregate-outcome", "Aggregate outcome"]
    ];
    const related = state.records
      .filter((item) => item.id !== record.id && item.topics.some((topic) => record.topics.includes(topic)))
      .sort((a, b) => (a.review_status === "reviewed" ? -1 : 0) - (b.review_status === "reviewed" ? -1 : 0) || a.name.localeCompare(b.name))
      .slice(0, 3);

    main.innerHTML = `
      <header class="detail-hero"><div class="wide">
        <div class="breadcrumbs"><a href="#/evals">Evaluations</a> / ${esc(record.name)}</div>
        ${statusMarkup(record)}
        <h1>${esc(record.name)}</h1>
        <p class="lede">${esc(record.description)}</p>
        <div class="detail-subline"><span>${esc(record.organisation)}</span><span>${esc(record.topics.map(topicLabel).join(" · "))}</span><span>Checked ${esc(formatDate(record.last_source_check))}</span></div>
        <div class="action-bar">
          <a class="action-link primary" href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} ↗</a>
          ${links.slice(1, 4).map((link) => `<a class="action-link" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a>`).join("")}
          <button class="copy-button" id="copy-record-link" type="button">Copy record link</button>
        </div>
      </div></header>

      <div class="wide detail-layout">
        <article class="detail-main">
          ${record.review_status !== "reviewed" ? `<div class="notice"><strong>Discovery record, not an independent assessment.</strong>Use the source links below to inspect the protocol. FronteraEval has not yet reviewed this record's construct validity or inference boundary.</div>` : ""}
          <section class="claims" aria-label="Inference boundary">
            <article class="claim-box"><h2>Can support</h2><p>${esc(record.measures)}</p></article>
            <article class="claim-box negative"><h2>Cannot support by itself</h2><p>${esc(record.does_not_measure)}</p></article>
          </section>

          <section class="detail-section"><h2>Decision use</h2><div class="use-grid">
            <div class="use-card"><span>Use this for</span><p>${esc(record.best_for)}</p></div>
            <div class="use-card"><span>Do not use this alone for</span><p>${esc(record.not_sufficient_for)}</p></div>
          </div></section>

          <section class="detail-section"><h2>Evidence reach</h2><p class="evidence-legend">Dark steps are directly covered by the current FronteraEval assessment. This is an inference boundary, not a quality score.</p><div class="evidence-chain">
            ${evidenceSteps.map(([step, label], index) => `${index ? '<span class="evidence-arrow">→</span>' : ""}<span class="evidence-step ${record.evidence_reach.includes(step) ? "direct" : ""}">${esc(label)}</span>`).join("")}
          </div></section>

          <section class="detail-section"><h2>Sources and further reading</h2><div class="links-list">
            ${links.map((link, index) => `<div class="resource-row"><span class="resource-type">${esc(index === 0 ? "Primary" : link.type)}</span><strong>${esc(link.label)}</strong><a href="${esc(link.url)}" target="_blank" rel="noopener">Open ↗</a></div>`).join("")}
          </div></section>

          <section class="detail-section"><h2>How to cite the result</h2><p>Attribute any result to the exact protocol version, model system, access route, elicitation method, and evaluation date. A familiar benchmark name is not enough to establish comparability.</p></section>

          ${related.length ? `<section class="detail-section"><h2>Related evaluations</h2><div class="related-list">${related.map((item) => `<a class="related-card" href="#/eval/${encodeURIComponent(item.id)}"><strong>${esc(item.name)}</strong><span>${esc(item.topics.slice(0, 2).map(topicLabel).join(" · "))}</span></a>`).join("")}</div></section>` : ""}
        </article>

        <aside class="meta-rail" aria-label="Record metadata"><div class="meta-card"><dl>
          <dt>Evidence state</dt><dd>${esc(statusLabel(record.review_status))}<br><span class="small">${esc(statusExplanation(record.review_status))}</span></dd>
          <dt>Organisation</dt><dd>${esc(record.organisation)}</dd>
          <dt>Source layer</dt><dd>${esc(sourceLabel(record.source_type))}</dd>
          <dt>Topics</dt><dd>${record.topics.map((topic) => `<a href="#/topic/${esc(topic)}">${esc(topicLabel(topic))}</a>`).join(", ")}</dd>
          <dt>Editorial review</dt><dd>${esc(formatDate(record.editorial_reviewed_at))}</dd>
          <dt>Inspect compatible</dt><dd>${record.inspect_compatible ? "Yes" : "Not recorded"}</dd>
          <dt>Open implementation</dt><dd>${record.code_available ? "Recorded" : "Not recorded"}</dd>
          <dt>Stable ID</dt><dd><code>${esc(record.id)}</code></dd>
        </dl></div></aside>
      </div>`;

    document.querySelector("#copy-record-link").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(location.href);
        event.currentTarget.textContent = "Copied";
        setTimeout(() => { event.currentTarget.textContent = "Copy record link"; }, 1400);
      } catch {
        event.currentTarget.textContent = "Copy failed";
      }
    });
  }

  function renderTopics() {
    setDocumentTitle("Topics");
    const counts = topicCounts();
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="eyebrow">Risk and capability map</div><h1>Topics</h1><p class="lede">Browse the catalogue by decision area. Topic membership supports discovery, not construct equivalence.</p></div></header>
      <section class="topic-index"><div class="wide topic-grid">
        ${Object.entries(state.catalog.topics).map(([id, topic]) => `<a class="topic-card" href="#/topic/${esc(id)}"><span class="topic-count">${counts[id] || 0}</span><div><strong>${esc(topic.label)}</strong><p>${esc(topic.definition)}</p></div></a>`).join("")}
      </div></section>`;
  }

  function renderTopic(id) {
    const topic = state.catalog.topics[id];
    if (!topic) return renderNotFound();
    setDocumentTitle(topic.label);
    const records = state.records.filter((record) => record.topics.includes(id)).sort((a, b) => (a.review_status === "reviewed" ? -1 : 0) - (b.review_status === "reviewed" ? -1 : 0) || a.name.localeCompare(b.name));
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="breadcrumbs"><a href="#/topics">Topics</a> / ${esc(topic.label)}</div><h1>${esc(topic.label)}</h1><p class="lede">${esc(topic.definition)}</p></div></header>
      <section class="browse"><div class="wide"><p class="inline-warning"><strong>${records.length} records are tagged here.</strong> Inclusion does not establish construct equivalence, field completeness, or score comparability.</p><div class="eval-list">${records.map(renderRow).join("")}</div></div></section>`;
  }

  function renderAgencyTransfer() {
    setDocumentTitle("Agency Transfer");
    const collection = state.catalog.collections["agency-transfer"];
    const records = state.records.filter((record) => record.collections?.includes("agency-transfer")).sort((a, b) => (a.review_status === "reviewed" ? -1 : 0) - (b.review_status === "reviewed" ? -1 : 0) || a.name.localeCompare(b.name));
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="eyebrow">Research collection</div><h1>Agency Transfer</h1><p class="lede">Harmful manipulation, persuasion, and the gap between model capability and political consequence.</p></div></header>
      <section class="wide agency-intro"><div><h2>The capability–deployment–effect gap</h2><p>${esc(collection.thesis)}</p><p class="small">${esc(collection.limitations)}</p></div><div class="chain"><div>AI capability</div><div>Deployment at scale</div><div>Individual behavioural effect</div><div>Aggregate agency transfer</div><div>Political consequence</div></div></section>
      <section class="home-section"><div class="wide gap-grid"><div class="gap-card"><h3>Current evaluations cover</h3><ul><li>persuasive content and dialogue</li><li>strategic influence and social behaviour</li><li>deception, sycophancy, and agentic misconduct</li></ul></div><div class="gap-card"><h3>They rarely establish</h3><ul><li>covert distribution and population exposure</li><li>durable human behavioural change</li><li>aggregate electoral or societal outcomes</li></ul></div></div></section>
      <section class="browse"><div class="wide"><div class="results-tools"><span class="results-count">${records.length} relevant records</span><span class="results-help">Adjacent constructs. No aggregate score.</span></div><div class="eval-list">${records.map(renderRow).join("")}</div></div></section>`;
  }

  function renderMethodology() {
    setDocumentTitle("Method");
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="eyebrow">Editorial standard</div><h1>Method</h1><p class="lede">Source discovery is automated. Interpretation is review-gated.</p></div></header>
      <article class="prose">
        <h2>Three evidence states</h2>
        <table><tr><th>State</th><th>Meaning</th><th>Permitted use</th></tr><tr><td>Imported</td><td>Name and implementation location imported from an official registry.</td><td>Discovery only.</td></tr><tr><td>Catalogued</td><td>A primary source or registered implementation has been identified.</td><td>Describe the source, not its validity.</td></tr><tr><td>Reviewed</td><td>A bounded FronteraEval interpretation with an explicit inference ceiling.</td><td>Use the stated interpretation with source attribution.</td></tr></table>
        <h2>The unit problem</h2><p>An evaluation family is not an implementation. An implementation is not a run. A run is not a result. A familiar model name is not a fully specified model system.</p>
        <h2>Evidence reach</h2><p>A controlled result may support a claim about model behaviour while leaving deployment, human effect, and aggregate outcome unmeasured. Evidence reach is an inference boundary, not a grade.</p>
        <h2>Comparability</h2><p>Scores should only be compared when construct, protocol, model-system configuration, elicitation, and outcome metric align. Topic proximity is not statistical comparability.</p>
        <h2>Sources</h2><p>Every public record must expose at least one primary source or implementation link. Additional links are labelled as documentation, code, paper, data, or results. Upstream sources retain their own licences and claims.</p>
        <h2>Automation boundary</h2><p>The weekly pipeline detects source changes, parses stable identifiers, and checks freshness. It cannot author claims about what an evaluation measures, what it excludes, or how it should inform policy.</p>
      </article>`;
  }

  function renderUpdates() {
    setDocumentTitle("Freshness");
    const changes = state.live?.changes || {};
    const checks = state.live?.source_checks || [];
    const failing = checks.filter((check) => !check.ok);
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="eyebrow">Freshness</div><h1>Source status</h1><p class="lede">The catalogue watches official sources. Editorial claims remain review-gated.</p><div class="freshness-line" style="max-width:520px">${freshnessText()}</div></div></header>
      <article class="prose"><h2>Latest source sweep</h2><table><tr><th>Signal</th><th>Count</th></tr><tr><td>New Inspect tasks</td><td>${changes.new_internal || 0}</td></tr><tr><td>New register entries</td><td>${changes.new_register || 0}</td></tr><tr><td>Missing or renamed entries</td><td>${changes.missing_internal || 0}</td></tr><tr><td>Canonical sources failing checks</td><td>${failing.length}</td></tr></table><h2>What happens automatically</h2><p>FronteraEval fetches the official Inspect registry and repository tree, compares stable IDs with the published snapshot, checks selected canonical sources, and publishes a live freshness record.</p><p class="inline-warning"><strong>What does not happen automatically:</strong> no model writes the fields “measures”, “does not measure”, evidence reach, comparability, or policy relevance directly into the public catalogue.</p></article>`;
  }

  function renderData() {
    setDocumentTitle("Open data");
    main.innerHTML = `
      <header class="page-head"><div class="wide"><div class="eyebrow">Open metadata</div><h1>Data</h1><p class="lede">Reuse the catalogue. Preserve its evidence state, source attribution, and inference limits.</p></div></header>
      <article class="prose"><div class="data-links"><a class="data-link" href="/data/catalog.json" download><strong>JSON</strong><span>Complete structured catalogue</span></a><a class="data-link" href="/data/catalog.csv" download><strong>CSV</strong><span>Flat tabular export</span></a><a class="data-link" href="/data/freshness.json"><strong>Freshness</strong><span>Build provenance and source snapshot</span></a></div><h2>Current snapshot</h2><table><tr><th>Records</th><td>${state.catalog.stats.records}</td></tr><tr><th>Inspect commit</th><td><code>${esc(state.catalog.inspect_source_sha)}</code></td></tr><tr><th>Generated</th><td>${esc(formatDate(state.catalog.generated_at))}</td></tr><tr><th>Schema</th><td>${esc(state.catalog.schema_version)}</td></tr></table><h2>Reuse rule</h2><p>Do not remove or collapse the <code>review_status</code> field. Imported metadata is not an independent FronteraEval assessment.</p></article>`;
  }

  function renderNotFound() {
    setDocumentTitle("Not found");
    main.innerHTML = `<article class="prose"><h1>Not found.</h1><p>The requested record or view does not exist.</p><p><a href="#/">Return home</a></p></article>`;
  }

  menuToggle?.addEventListener("click", () => {
    const open = primaryNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
  window.addEventListener("hashchange", () => route());
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      const input = document.querySelector("#filter-q, #home-query");
      if (input) { event.preventDefault(); input.focus(); }
    }
  });

  load().catch((error) => {
    main.innerHTML = `<article class="prose"><h1>Catalogue unavailable.</h1><p>${esc(error.message)}</p><p><a href="/data/catalog.json">Open raw data</a></p></article>`;
  });
})();
