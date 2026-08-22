(() => {
  "use strict";

  const PAGE_SIZE = 30;
  const STATUS_ORDER = { reviewed: 0, catalogued: 1, imported: 2 };
  const state = {
    catalog: null,
    records: [],
    live: null,
    filters: { q: "", topic: "", status: "", source: "", sort: "review" },
    page: 1
  };

  const main = document.querySelector("#main");
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const topicLabel = (id) => state.catalog?.topics?.[id]?.label || String(id).replaceAll("-", " ");
  const statusLabel = (id) => ({ reviewed: "Reviewed", catalogued: "Catalogued", imported: "Imported" })[id] || id;
  const sourceLabel = (id) => ({
    "inspect-internal": "Inspect implementation",
    "inspect-register": "Inspect register",
    "canonical-source": "Canonical source"
  })[id] || id;
  const sourceActionLabel = (record) => ({
    "inspect-internal": "Implementation",
    "inspect-register": "Registry entry",
    "canonical-source": "Official source"
  })[record.source_type] || "Source";
  const formatDate = (value) => {
    if (!value) return "Not recorded";
    const raw = String(value).slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${raw}T12:00:00Z`));
  };

  async function load() {
    const response = await fetch("/data/catalog.json");
    if (!response.ok) throw new Error("Catalogue unavailable");
    state.catalog = await response.json();
    state.records = [...state.catalog.records];
    route();

    fetch("/api/weekly-status", { signal: AbortSignal.timeout(12000) })
      .then((liveResponse) => liveResponse.ok ? liveResponse.json() : null)
      .then((live) => {
        if (!live) return;
        state.live = live;
        if (live?.inspect?.entries?.length) mergeLive(live.inspect.entries);
        route({ preserveScroll: true });
      })
      .catch(() => {});
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
        topics: inferTopics(entry.name),
        description: "New Inspect entry detected by the weekly source sweep.",
        review_status: "imported",
        code_available: true,
        inspect_compatible: true,
        last_source_check: state.live?.checked_at ? String(state.live.checked_at).slice(0, 10) : null,
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

  function parseHash() {
    const raw = (location.hash || "#/").slice(1) || "/";
    const [path, query = ""] = raw.split("?");
    return { path, params: new URLSearchParams(query) };
  }

  function route(options = {}) {
    const { path, params } = parseHash();
    if (!options.preserveScroll) window.scrollTo(0, 0);
    updateNavigation(path);
    if (path === "/") renderHome();
    else if (path === "/evals") {
      readFilters(params);
      renderBrowse();
    }
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

  function updateNavigation(path) {
    document.querySelectorAll("[data-nav]").forEach((link) => link.removeAttribute("aria-current"));
    const key = path.startsWith("/eval") ? "evals"
      : path.startsWith("/topic") ? "topics"
      : path.startsWith("/collection") ? "collection"
      : path.startsWith("/methodology") ? "methodology" : null;
    if (key) document.querySelector(`[data-nav="${key}"]`)?.setAttribute("aria-current", "page");
  }

  function readFilters(params) {
    state.filters = {
      q: params.get("q") || "",
      topic: params.get("topic") || "",
      status: params.get("status") || "",
      source: params.get("source") || "",
      sort: params.get("sort") || "review"
    };
    state.page = Math.max(1, Number(params.get("page") || 1));
  }

  function writeFilters({ replace = true } = {}) {
    const params = new URLSearchParams();
    for (const key of ["q", "topic", "status", "source"]) if (state.filters[key]) params.set(key, state.filters[key]);
    if (state.filters.sort && state.filters.sort !== "review") params.set("sort", state.filters.sort);
    if (state.page > 1) params.set("page", String(state.page));
    const hash = `#/evals${params.toString() ? `?${params}` : ""}`;
    if (replace) history.replaceState(null, "", hash);
    else location.hash = hash.slice(1);
  }

  function freshnessText() {
    if (state.live?.status === "current" && state.live?.checked_at) {
      const checked = new Date(state.live.checked_at).toLocaleString("en-GB", {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
      });
      return `<span class="status-dot live"></span>Sources checked ${esc(checked)} UTC`;
    }
    return `<span class="status-dot"></span>Build snapshot ${esc(formatDate(state.catalog.generated_at))}`;
  }

  function topicCounts() {
    const counts = {};
    for (const record of state.records) for (const topic of record.topics) counts[topic] = (counts[topic] || 0) + 1;
    return counts;
  }

  function sortedRecords(records) {
    const copy = [...records];
    if (state.filters.sort === "az") return copy.sort((a, b) => a.name.localeCompare(b.name));
    if (state.filters.sort === "source") return copy.sort((a, b) => a.organisation.localeCompare(b.organisation) || a.name.localeCompare(b.name));
    return copy.sort((a, b) =>
      (STATUS_ORDER[a.review_status] ?? 3) - (STATUS_ORDER[b.review_status] ?? 3)
      || a.name.localeCompare(b.name)
    );
  }

  function filteredRecords() {
    const { q, topic, status, source } = state.filters;
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return state.records.filter((record) => {
      const searchable = [
        record.name, record.description, record.organisation, record.id,
        record.measures, record.does_not_measure, ...record.topics.map(topicLabel)
      ].join(" ").toLowerCase();
      return tokens.every((token) => searchable.includes(token))
        && (!topic || record.topics.includes(topic))
        && (!status || record.review_status === status)
        && (!source || record.source_type === source);
    });
  }

  function sourceLink(record, className = "source-link") {
    if (!record.source_url) return "";
    return `<a class="${className}" href="${esc(record.source_url)}" target="_blank" rel="noopener" aria-label="Open source for ${esc(record.name)}">Source ↗</a>`;
  }

  function recordLinks(record) {
    const links = [{ label: sourceActionLabel(record), url: record.source_url }];
    if (record.inspect_compatible) {
      links.push({ label: "Inspect documentation", url: "https://inspect.aisi.org.uk/" });
      links.push({ label: "Inspect Evals repository", url: "https://github.com/UKGovernmentBEIS/inspect_evals" });
    }
    const unique = [];
    const seen = new Set();
    for (const link of links) {
      if (!link.url || seen.has(link.url)) continue;
      seen.add(link.url);
      unique.push(link);
    }
    return unique;
  }

  function renderHome() {
    document.title = "FronteraEval — Frontier AI evaluations, mapped";
    const reviewedCount = state.records.filter((record) => record.review_status === "reviewed").length;
    const reviewed = sortedRecords(state.records.filter((record) => record.review_status === "reviewed")).slice(0, 8);
    const counts = topicCounts();
    const topTopics = ["autonomy-agents", "deception-misalignment", "human-influence", "cyber", "bio-cbrn", "safeguards"];

    main.innerHTML = `
      <section class="home-hero">
        <div class="wide hero-content">
          <div class="eyebrow">Frontier AI evaluation index</div>
          <h1>Find the right evaluation.</h1>
          <p class="lede">Search frontier-AI evaluations by risk, capability, construct, or method. Every record leads back to its source; reviewed records also state what the evidence cannot establish.</p>
          <form class="global-search" id="home-search">
            <span aria-hidden="true">⌕</span>
            <input id="home-query" type="search" autocomplete="off" aria-label="Search evaluations" placeholder="Search autonomy, persuasion, cyber, scheming, safeguards…">
            <button type="submit">Search</button>
          </form>
          <div class="quick-links" aria-label="Example searches">
            <button type="button" data-query="harmful manipulation">Harmful manipulation</button>
            <button type="button" data-query="autonomous AI R&D">Autonomous AI R&amp;D</button>
            <button type="button" data-query="jailbreak robustness">Jailbreak robustness</button>
          </div>
          <div class="catalogue-meta">${freshnessText()}<span>${state.records.length} evaluations</span><span>${reviewedCount} reviewed</span></div>
        </div>
      </section>

      <section class="home-catalogue">
        <div class="wide home-grid">
          <div class="home-main">
            <div class="section-heading compact">
              <div><div class="eyebrow">Interpreted records</div><h2>Reviewed evaluations</h2></div>
              <a href="#/evals?status=reviewed">View all reviewed →</a>
            </div>
            <div class="eval-list featured-list">${reviewed.map(renderRow).join("")}</div>
          </div>
          <aside class="topic-panel">
            <div class="panel-heading"><span>Browse by topic</span><a href="#/topics">All topics →</a></div>
            <div class="topic-shortlist">
              ${topTopics.map((id) => `<a href="#/topic/${esc(id)}"><span>${esc(topicLabel(id))}</span><strong>${counts[id] || 0}</strong></a>`).join("")}
            </div>
            <a class="all-evals" href="#/evals"><strong>Browse all ${state.records.length}</strong><span>Search and filter the complete catalogue →</span></a>
          </aside>
        </div>
      </section>

      <section class="principle-section">
        <div class="wide principle-grid">
          <div>
            <div class="eyebrow">How to read a result</div>
            <h2>Capability is not consequence.</h2>
            <p>A laboratory result supports a bounded claim about a protocol and model system. It rarely establishes deployment, durable human effect, or aggregate harm.</p>
          </div>
          <div class="boundary-card">
            <div><small>Can support</small><strong>Under this protocol, the model produced this behaviour.</strong></div>
            <div><small>Cannot support by itself</small><strong>The system will cause the corresponding harm in deployment.</strong></div>
          </div>
        </div>
      </section>

      <section class="collection-strip">
        <div class="wide collection-row">
          <div><div class="eyebrow">Research collection</div><h2>Agency Transfer</h2></div>
          <p>Persuasion, manipulation, deception, and the missing links between capability, deployment, human effect, and political consequence.</p>
          <a href="#/collection/agency-transfer">Open collection →</a>
        </div>
      </section>`;

    document.querySelector("#home-search").addEventListener("submit", (event) => {
      event.preventDefault();
      const q = document.querySelector("#home-query").value.trim();
      state.filters = { q, topic: "", status: "", source: "", sort: "review" };
      state.page = 1;
      writeFilters({ replace: false });
    });
    document.querySelectorAll("[data-query]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filters = { q: button.dataset.query, topic: "", status: "", source: "", sort: "review" };
        state.page = 1;
        writeFilters({ replace: false });
      });
    });
  }

  function renderBrowse() {
    document.title = "Evaluations — FronteraEval";
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner">
        <div><div class="eyebrow">Catalogue</div><h1>Evaluations</h1></div>
        <p>Search the full catalogue. Reviewed records include an independent inference boundary; imported records are discovery metadata.</p>
      </div></header>
      <section class="browse"><div class="wide">
        <div class="filter-shell" id="filter-shell"></div>
        <div class="results-summary"><strong id="result-count" aria-live="polite"></strong><button id="clear-filters" type="button">Clear filters</button></div>
        <div id="results"></div>
        <div id="pagination"></div>
      </div></section>`;
    renderFilters();
    renderResults();
  }

  function renderFilters() {
    const topicOptions = Object.entries(state.catalog.topics)
      .map(([id, topic]) => `<option value="${esc(id)}" ${state.filters.topic === id ? "selected" : ""}>${esc(topic.label)}</option>`)
      .join("");
    document.querySelector("#filter-shell").innerHTML = `
      <div class="filter-search"><span aria-hidden="true">⌕</span><input id="filter-q" type="search" value="${esc(state.filters.q)}" placeholder="Search evaluations" aria-label="Search evaluations"></div>
      <label><span>Topic</span><select id="filter-topic"><option value="">All topics</option>${topicOptions}</select></label>
      <label><span>Evidence state</span><select id="filter-status"><option value="">All states</option><option value="reviewed" ${state.filters.status === "reviewed" ? "selected" : ""}>Reviewed</option><option value="catalogued" ${state.filters.status === "catalogued" ? "selected" : ""}>Catalogued</option><option value="imported" ${state.filters.status === "imported" ? "selected" : ""}>Imported</option></select></label>
      <label><span>Source</span><select id="filter-source"><option value="">All sources</option><option value="inspect-internal" ${state.filters.source === "inspect-internal" ? "selected" : ""}>Inspect implementation</option><option value="inspect-register" ${state.filters.source === "inspect-register" ? "selected" : ""}>Inspect register</option><option value="canonical-source" ${state.filters.source === "canonical-source" ? "selected" : ""}>Other canonical</option></select></label>
      <label><span>Sort</span><select id="filter-sort"><option value="review" ${state.filters.sort === "review" ? "selected" : ""}>Reviewed first</option><option value="az" ${state.filters.sort === "az" ? "selected" : ""}>A–Z</option><option value="source" ${state.filters.sort === "source" ? "selected" : ""}>Organisation</option></select></label>`;

    const bindings = [
      ["#filter-q", "q", "input"], ["#filter-topic", "topic", "change"],
      ["#filter-status", "status", "change"], ["#filter-source", "source", "change"],
      ["#filter-sort", "sort", "change"]
    ];
    for (const [selector, key, event] of bindings) {
      document.querySelector(selector).addEventListener(event, (change) => {
        state.filters[key] = change.target.value;
        state.page = 1;
        writeFilters();
        renderResults();
      });
    }
    document.querySelector("#clear-filters").addEventListener("click", () => {
      state.filters = { q: "", topic: "", status: "", source: "", sort: "review" };
      state.page = 1;
      writeFilters();
      renderBrowse();
    });
  }

  function renderResults() {
    const records = sortedRecords(filteredRecords());
    const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = records.slice(start, start + PAGE_SIZE);
    document.querySelector("#result-count").textContent = `${records.length} evaluation${records.length === 1 ? "" : "s"}`;
    document.querySelector("#results").innerHTML = records.length
      ? `<div class="eval-list catalogue-list">${visible.map(renderRow).join("")}</div>`
      : `<div class="empty"><h2>No matching evaluation</h2><p>Try a broader construct or clear a filter.</p></div>`;
    renderPagination(pages, records.length);
  }

  function renderPagination(pages, total) {
    const node = document.querySelector("#pagination");
    if (!node || pages <= 1) { if (node) node.innerHTML = ""; return; }
    node.innerHTML = `<nav class="pagination" aria-label="Catalogue pagination">
      <button type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>← Previous</button>
      <span>Page ${state.page} of ${pages} · ${total} records</span>
      <button type="button" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""}>Next →</button>
    </nav>`;
    node.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      writeFilters();
      renderResults();
      document.querySelector("#result-count")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderRow(record) {
    return `<article class="eval-row">
      <a class="eval-main" href="#/eval/${encodeURIComponent(record.id)}">
        <span class="eval-title">${esc(record.name)}</span>
        <span class="eval-description">${esc(record.description)}</span>
      </a>
      <div class="eval-context">
        <span>${esc(record.organisation)}</span>
        <span>${esc(record.topics.slice(0, 2).map(topicLabel).join(" · "))}</span>
      </div>
      <div class="eval-actions">
        <span class="eval-status ${esc(record.review_status)}">${esc(statusLabel(record.review_status))}</span>
        <a class="open-record" href="#/eval/${encodeURIComponent(record.id)}">Open</a>
        ${sourceLink(record)}
      </div>
    </article>`;
  }

  function renderDetail(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return renderNotFound();
    document.title = `${record.name} — FronteraEval`;
    const evidenceSteps = [
      ["artifact-production", "Artifact"], ["controlled-model-behaviour", "Model behaviour"],
      ["controlled-human-effect", "Human effect"], ["deployment-readiness", "Deployment readiness"],
      ["observed-deployment", "Observed deployment"], ["aggregate-outcome", "Aggregate outcome"]
    ];
    const links = recordLinks(record);
    const related = sortedRecords(state.records.filter((item) =>
      item.id !== record.id && item.topics.some((topic) => record.topics.includes(topic))
    )).slice(0, 5);

    main.innerHTML = `
      <header class="record-head"><div class="wide">
        <div class="breadcrumbs"><a href="#/evals">Evaluations</a><span>/</span><span>${esc(record.name)}</span></div>
        <div class="record-title-row">
          <div>
            <div class="record-kicker"><span class="eval-status ${esc(record.review_status)}">${esc(statusLabel(record.review_status))}</span><span>${esc(record.topics.map(topicLabel).join(" · "))}</span></div>
            <h1>${esc(record.name)}</h1>
            <p>${esc(record.description)}</p>
          </div>
          <div class="record-actions">${links.map((link, index) => `<a class="${index === 0 ? "button primary" : "button"}" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a>`).join("")}</div>
        </div>
        <div class="record-meta"><span>${esc(record.organisation)}</span><span>${esc(sourceLabel(record.source_type))}</span><span>Checked ${esc(formatDate(record.last_source_check))}</span></div>
      </div></header>

      <div class="wide record-layout">
        <article class="record-content">
          ${record.review_status !== "reviewed" ? `<div class="notice"><strong>Discovery record.</strong> FronteraEval has not independently reviewed this evaluation’s construct, protocol, or inference boundary. Use the source link before drawing substantive conclusions.</div>` : ""}
          <section class="inference-grid" aria-label="Inference boundary">
            <div><span>Can support</span><p>${esc(record.measures)}</p></div>
            <div><span>Cannot support by itself</span><p>${esc(record.does_not_measure)}</p></div>
          </section>
          <section class="record-section">
            <h2>Decision use</h2>
            <div class="use-grid"><div><span>Best used for</span><p>${esc(record.best_for)}</p></div><div><span>Not enough for</span><p>${esc(record.not_sufficient_for)}</p></div></div>
          </section>
          <section class="record-section">
            <h2>Evidence reach</h2>
            <p class="section-note">This shows the furthest layer directly assessed by the record. It is not a quality score.</p>
            <div class="evidence-track">
              ${evidenceSteps.map(([step, label]) => `<div class="${record.evidence_reach.includes(step) ? "reached" : ""}"><span></span><strong>${esc(label)}</strong></div>`).join("")}
            </div>
          </section>
          <section class="record-section">
            <h2>Interpretation rule</h2>
            <p>Attribute any result to the exact protocol, implementation, model-system configuration, access route, elicitation method, and evaluation date. A shared topic is not evidence of comparability.</p>
          </section>
          <section class="record-section related-section">
            <div class="section-heading compact"><div><h2>Related evaluations</h2><p>Same topic, not necessarily the same construct.</p></div><a href="#/topic/${encodeURIComponent(record.topics[0] || "general-capability")}">View topic →</a></div>
            <div class="eval-list">${related.map(renderRow).join("")}</div>
          </section>
        </article>

        <aside class="source-panel">
          <h2>Source and record</h2>
          <div class="source-links">${links.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noopener"><span>${esc(link.label)}</span><strong>↗</strong></a>`).join("")}</div>
          <dl>
            <dt>Organisation</dt><dd>${esc(record.organisation)}</dd>
            <dt>Source layer</dt><dd>${esc(sourceLabel(record.source_type))}</dd>
            <dt>Review state</dt><dd>${esc(statusLabel(record.review_status))}</dd>
            <dt>Editorial review</dt><dd>${esc(formatDate(record.editorial_reviewed_at))}</dd>
            <dt>Inspect compatible</dt><dd>${record.inspect_compatible ? "Yes" : "Not recorded"}</dd>
            <dt>Stable ID</dt><dd><code>${esc(record.id)}</code></dd>
          </dl>
          <button class="copy-link" id="copy-record-link" type="button">Copy record link</button>
        </aside>
      </div>`;

    document.querySelector("#copy-record-link").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(location.href);
        event.currentTarget.textContent = "Copied";
        setTimeout(() => { event.currentTarget.textContent = "Copy record link"; }, 1800);
      } catch { event.currentTarget.textContent = "Copy failed"; }
    });
  }

  function renderTopics() {
    document.title = "Topics — FronteraEval";
    const counts = topicCounts();
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner"><div><div class="eyebrow">Risk and capability map</div><h1>Topics</h1></div><p>Topics are entry points into the catalogue. They do not imply that all included evaluations measure the same construct.</p></div></header>
      <section class="topics-section"><div class="wide topic-grid">
        ${Object.entries(state.catalog.topics).map(([id, topic]) => {
          const examples = sortedRecords(state.records.filter((record) => record.topics.includes(id))).slice(0, 3);
          return `<a class="topic-card" href="#/topic/${esc(id)}"><div><span>${counts[id] || 0} evaluations</span><h2>${esc(topic.label)}</h2><p>${esc(topic.definition)}</p></div><small>${examples.map((record) => esc(record.name)).join(" · ")}</small></a>`;
        }).join("")}
      </div></section>`;
  }

  function renderTopic(id) {
    const topic = state.catalog.topics[id];
    if (!topic) return renderNotFound();
    document.title = `${topic.label} — FronteraEval`;
    const records = sortedRecords(state.records.filter((record) => record.topics.includes(id)));
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner"><div><div class="breadcrumbs"><a href="#/topics">Topics</a><span>/</span>${esc(topic.label)}</div><h1>${esc(topic.label)}</h1></div><p>${esc(topic.definition)}</p></div></header>
      <section class="browse"><div class="wide"><div class="topic-warning"><strong>${records.length} records.</strong> Inclusion does not establish construct equivalence, completeness, or comparability.</div><div class="eval-list catalogue-list">${records.map(renderRow).join("")}</div></div></section>`;
  }

  function renderAgencyTransfer() {
    document.title = "Agency Transfer — FronteraEval";
    const collection = state.catalog.collections["agency-transfer"];
    const records = sortedRecords(state.records.filter((record) => record.collections?.includes("agency-transfer")));
    main.innerHTML = `
      <header class="collection-head"><div class="wide"><div class="eyebrow">Research collection</div><h1>Agency Transfer</h1><p>Harmful manipulation, persuasion, deception, and the gap between model capability and political consequence.</p></div></header>
      <section class="collection-overview"><div class="wide collection-overview-grid"><div><h2>The causal chain is the point.</h2><p>${esc(collection.thesis)}</p><p class="section-note">${esc(collection.limitations)}</p></div><div class="causal-chain"><span>Capability</span><span>Deployment</span><span>Human effect</span><span>Aggregate consequence</span></div></div></section>
      <section class="browse"><div class="wide"><div class="section-heading compact"><div><div class="eyebrow">Evidence map</div><h2>${records.length} relevant evaluations</h2></div><p>Adjacent constructs; no aggregate score.</p></div><div class="eval-list catalogue-list">${records.map(renderRow).join("")}</div></div></section>`;
  }

  function renderMethodology() {
    document.title = "Method — FronteraEval";
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner"><div><div class="eyebrow">Editorial standard</div><h1>Method</h1></div><p>Source discovery is automated. Interpretation is review-gated.</p></div></header>
      <article class="prose">
        <h2>Three evidence states</h2>
        <div class="state-list"><div><strong>Reviewed</strong><p>A bounded FronteraEval interpretation with an explicit inference ceiling.</p></div><div><strong>Catalogued</strong><p>A primary source or registered implementation has been identified.</p></div><div><strong>Imported</strong><p>Official metadata for discovery only; no independent interpretation.</p></div></div>
        <h2>Units are not interchangeable</h2><p>An evaluation family is not an implementation. An implementation is not a run. A run is not a result. A familiar model name is not a fully specified model system.</p>
        <h2>Evidence reach</h2><p>A controlled result may support a claim about model behaviour while leaving deployment, human effect, and aggregate outcome unmeasured. Evidence reach is an inference boundary, not a grade.</p>
        <h2>Comparability</h2><p>Scores should only be compared when construct, protocol, model-system configuration, elicitation, and outcome metric align. Topic proximity is not statistical comparability.</p>
        <h2>Automation boundary</h2><p>The weekly pipeline detects source changes, parses stable identifiers, and checks freshness. It does not author claims about what an evaluation measures, excludes, or implies for policy.</p>
      </article>`;
  }

  function renderUpdates() {
    document.title = "Freshness — FronteraEval";
    const changes = state.live?.changes || {};
    const failing = state.live?.source_checks?.filter((check) => !check.ok) || [];
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner"><div><div class="eyebrow">Freshness</div><h1>Updates</h1></div><p>The catalogue watches official sources. Editorial judgments remain human-reviewed.</p></div></header>
      <article class="prose"><div class="freshness-line">${freshnessText()}</div><h2>Latest sweep</h2><div class="metric-list"><div><strong>${changes.new_internal || 0}</strong><span>New Inspect tasks</span></div><div><strong>${changes.new_register || 0}</strong><span>New register entries</span></div><div><strong>${changes.missing_internal || 0}</strong><span>Missing or renamed</span></div><div><strong>${failing.length}</strong><span>Source checks failing</span></div></div><h2>What changes automatically</h2><p>FronteraEval fetches the official Inspect registry and repository tree, compares stable IDs with the published snapshot, checks selected canonical sources, and publishes a live freshness record.</p><div class="notice"><strong>Editorial boundary.</strong> Automation does not write “measures”, “does not measure”, evidence reach, comparability, or policy relevance into the public catalogue.</div></article>`;
  }

  function renderData() {
    document.title = "Open data — FronteraEval";
    main.innerHTML = `
      <header class="page-head"><div class="wide page-head-inner"><div><div class="eyebrow">Open metadata</div><h1>Data</h1></div><p>Reuse the catalogue, but preserve record state, provenance, and inference limits.</p></div></header>
      <article class="prose"><div class="download-list"><a href="/data/catalog.json" download><strong>JSON catalogue</strong><span>Complete structured records ↓</span></a><a href="/data/catalog.csv" download><strong>CSV catalogue</strong><span>Tabular metadata ↓</span></a><a href="/data/freshness.json"><strong>Build freshness</strong><span>Source snapshot ↗</span></a></div><h2>Snapshot</h2><dl class="data-dl"><dt>Records</dt><dd>${state.catalog.stats.records}</dd><dt>Inspect commit</dt><dd><code>${esc(state.catalog.inspect_source_sha)}</code></dd><dt>Generated</dt><dd>${esc(formatDate(state.catalog.generated_at))}</dd><dt>Schema</dt><dd>${esc(state.catalog.schema_version)}</dd></dl></article>`;
  }

  function renderNotFound() {
    document.title = "Not found — FronteraEval";
    main.innerHTML = `<article class="prose"><h1>Not found</h1><p>The requested record or view does not exist.</p><p><a href="#/">Return home</a></p></article>`;
  }

  window.addEventListener("hashchange", () => route());
  window.addEventListener("keydown", (event) => {
    if (event.key === "/" && !/input|select|textarea/i.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      document.querySelector("#home-query, #filter-q")?.focus();
    }
  });

  load().catch((error) => {
    main.innerHTML = `<article class="prose"><h1>Catalogue unavailable</h1><p>${esc(error.message)}</p><p><a href="/data/catalog.json">Open raw data</a></p></article>`;
  });
})();
