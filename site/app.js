(() => {
  "use strict";

  const state = {
    catalog: null,
    records: [],
    live: null,
    filters: { q: "", topic: "", status: "", source: "" }
  };

  const main = document.querySelector("#main");
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
  const topicLabel = (id) => state.catalog?.topics?.[id]?.label || id.replaceAll("-", " ");
  const sourceLabel = (id) => ({
    "inspect-internal": "Inspect implementation",
    "inspect-register": "Inspect register",
    "canonical-source": "Canonical source"
  })[id] || id;
  const statusLabel = (id) => ({
    reviewed: "Editorially reviewed",
    catalogued: "Source catalogued",
    imported: "Metadata imported"
  })[id] || id;
  const formatDate = (value) => {
    if (!value) return "Not reviewed";
    const raw = String(value).slice(0, 10);
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" })
      .format(new Date(`${raw}T12:00:00Z`));
  };

  async function load() {
    const [catalog, live] = await Promise.all([
      fetch("/data/catalog.json").then((response) => {
        if (!response.ok) throw new Error("Catalogue unavailable");
        return response.json();
      }),
      fetch("/api/weekly-status", { signal: AbortSignal.timeout(14000) })
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null)
    ]);

    state.catalog = catalog;
    state.live = live;
    state.records = [...catalog.records];
    if (live?.inspect?.entries?.length) mergeLive(live.inspect.entries);
    route();
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
        last_source_check: liveDate(),
        editorial_reviewed_at: null,
        measures: "Not independently assessed by FronteraEval yet.",
        does_not_measure: "No inference beyond the upstream source should be made until the protocol is reviewed.",
        best_for: "Discovery and source navigation.",
        not_sufficient_for: "Substantive capability, safety or policy claims without reading the underlying protocol.",
        evidence_reach: [],
        collections: [],
        provenance: { source_sha: state.live?.inspect?.sha, method: "live weekly import" }
      });
    }
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
    for (const [topic, needles] of rules) {
      if (needles.some((needle) => text.includes(needle))) topics.push(topic);
    }
    return topics.length ? topics : ["general-capability"];
  }

  function route() {
    window.scrollTo(0, 0);
    const path = (location.hash || "#/").slice(1).split("?")[0];
    if (path === "/") renderHome();
    else if (path === "/evals") renderBrowse();
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
      return `<span class="status-dot live"></span>Sources checked ${esc(checked)} UTC`;
    }
    return `<span class="status-dot"></span>Build snapshot from ${esc(formatDate(state.catalog.generated_at))}`;
  }

  function renderHome() {
    const reviewed = state.records.filter((record) => record.review_status === "reviewed").length;
    const questions = [
      ["human-influence", "What measures persuasion or manipulation?", "Human influence & agency"],
      ["autonomy-agents", "What measures autonomous task capability?", "Autonomy & agents"],
      ["deception-misalignment", "What evidence exists for deception or scheming?", "Deception & misalignment"],
      ["cyber", "Which evaluations cover cyber capability?", "Cyber"]
    ];

    main.innerHTML = `
      <section class="hero">
        <div class="wide">
          <div class="eyebrow">Frontier AI evaluation</div>
          <h1>The evidence is growing. The map is not.</h1>
          <p class="lede">FronteraEval helps you find the right evaluation—and understand the claim it supports, the claim it cannot support, and the evidence still missing.</p>
          <form class="search-form" id="home-search">
            <input id="home-query" type="search" autocomplete="off" aria-label="Search evaluations" placeholder="What are you trying to evaluate?">
            <button type="submit">Search</button>
          </form>
          <div class="example-links" aria-label="Example searches">
            <span>Try</span>
            <button type="button" data-query="harmful manipulation">harmful manipulation</button>
            <button type="button" data-query="autonomous AI R&D">autonomous AI R&amp;D</button>
            <button type="button" data-query="jailbreak robustness">jailbreak robustness</button>
          </div>
          <div class="catalogue-note">${freshnessText()} · ${state.records.length} records · ${reviewed} independently interpreted</div>
        </div>
      </section>

      <section class="editorial-section">
        <div class="wide section-intro">
          <div>
            <div class="eyebrow">The central distinction</div>
            <h2>A result is not a conclusion.</h2>
          </div>
          <p>Evaluations are useful only when their inference boundary is visible. FronteraEval separates what a protocol directly tests from the larger claims people are tempted to make from it.</p>
        </div>
        <div class="wide claim-pair">
          <div class="claim">
            <small>The claim you may be able to make</small>
            <strong>Under this protocol, this model system produced this behaviour.</strong>
          </div>
          <div class="claim negative">
            <small>The claim you usually cannot make</small>
            <strong>The system will cause the corresponding harm in real deployment.</strong>
          </div>
        </div>
      </section>

      <section class="editorial-section">
        <div class="wide section-intro">
          <div>
            <div class="eyebrow">Start with a question</div>
            <h2>Browse by the decision you face.</h2>
          </div>
          <div class="question-list">
            ${questions.map(([topic, question, subtitle]) => `
              <a class="question-link" href="#/topic/${esc(topic)}">
                <strong>${esc(question)}</strong><span>${esc(subtitle)} →</span>
              </a>`).join("")}
          </div>
        </div>
      </section>

      <section class="editorial-section">
        <div class="wide feature">
          <div>
            <div class="eyebrow">Flagship collection</div>
            <h2>Agency Transfer</h2>
            <p>Persuasion, manipulation and deception evaluations cover fragments of a longer causal chain. None, by itself, establishes population-scale political consequence.</p>
            <a class="text-link" href="#/collection/agency-transfer">Read the collection</a>
          </div>
          <div class="chain" aria-label="Agency Transfer inference chain">
            <div>Capability</div><div>Deployment</div><div>Individual effect</div><div>Aggregate consequence</div>
          </div>
        </div>
      </section>`;

    document.querySelector("#home-search").addEventListener("submit", (event) => {
      event.preventDefault();
      state.filters.q = document.querySelector("#home-query").value.trim();
      location.hash = "#/evals";
    });
    document.querySelectorAll("[data-query]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filters.q = button.dataset.query;
        location.hash = "#/evals";
      });
    });
  }

  function renderBrowse() {
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Catalogue</div>
        <h1>Browse evaluations</h1>
        <p class="lede">Search widely. Interpret narrowly.</p>
      </div></header>
      <section class="browse"><div class="wide">
        <div class="search-toolbar" id="search-toolbar"></div>
        <div class="results-summary"><strong id="result-count"></strong><span>Review status is part of the evidence.</span></div>
        <div id="results"></div>
      </div></section>`;
    renderToolbar();
    renderResults();
  }

  function renderToolbar() {
    const topicOptions = Object.entries(state.catalog.topics)
      .map(([id, topic]) => `<option value="${esc(id)}" ${state.filters.topic === id ? "selected" : ""}>${esc(topic.label)}</option>`)
      .join("");
    const toolbar = document.querySelector("#search-toolbar");
    toolbar.innerHTML = `
      <div class="control"><label for="filter-q">Search</label><input id="filter-q" type="search" value="${esc(state.filters.q)}" placeholder="Name, construct or organisation"></div>
      <div class="control"><label for="filter-topic">Topic</label><select id="filter-topic"><option value="">All topics</option>${topicOptions}</select></div>
      <div class="control"><label for="filter-status">Evidence state</label><select id="filter-status"><option value="">All states</option><option value="reviewed" ${state.filters.status === "reviewed" ? "selected" : ""}>Editorially reviewed</option><option value="catalogued" ${state.filters.status === "catalogued" ? "selected" : ""}>Source catalogued</option><option value="imported" ${state.filters.status === "imported" ? "selected" : ""}>Metadata imported</option></select></div>
      <div class="control"><label for="filter-source">Source</label><select id="filter-source"><option value="">All sources</option><option value="inspect-internal" ${state.filters.source === "inspect-internal" ? "selected" : ""}>Inspect implementation</option><option value="inspect-register" ${state.filters.source === "inspect-register" ? "selected" : ""}>Inspect register</option><option value="canonical-source" ${state.filters.source === "canonical-source" ? "selected" : ""}>Other canonical</option></select></div>`;

    const bindings = [
      ["#filter-q", "q", "input"], ["#filter-topic", "topic", "change"],
      ["#filter-status", "status", "change"], ["#filter-source", "source", "change"]
    ];
    for (const [selector, key, event] of bindings) {
      document.querySelector(selector).addEventListener(event, (change) => {
        state.filters[key] = change.target.value;
        renderResults();
      });
    }
  }

  function filteredRecords() {
    const { q, topic, status, source } = state.filters;
    const needle = q.trim().toLowerCase();
    return state.records.filter((record) => {
      const searchable = [
        record.name, record.description, record.organisation, record.id,
        record.measures, record.does_not_measure, ...record.topics.map(topicLabel)
      ].join(" ").toLowerCase();
      return (!needle || searchable.includes(needle))
        && (!topic || record.topics.includes(topic))
        && (!status || record.review_status === status)
        && (!source || record.source_type === source);
    });
  }

  function renderResults() {
    const records = filteredRecords();
    document.querySelector("#result-count").textContent = `${records.length} record${records.length === 1 ? "" : "s"}`;
    document.querySelector("#results").innerHTML = records.length
      ? `<div class="eval-list">${records.map(renderRow).join("")}</div>`
      : `<div class="empty"><h2>No matching evaluation.</h2><p>Broaden the construct or remove a filter.</p></div>`;
  }

  function renderRow(record) {
    return `<article class="eval-row">
      <div>
        <a class="eval-title" href="#/eval/${encodeURIComponent(record.id)}">${esc(record.name)}</a>
        <p class="eval-description">${esc(record.description)}</p>
      </div>
      <div class="eval-meta">${esc(record.organisation)}<br>${esc(record.topics.slice(0, 2).map(topicLabel).join(" · "))}</div>
      <div class="eval-status ${esc(record.review_status)}">${esc(statusLabel(record.review_status))}</div>
    </article>`;
  }

  function renderDetail(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return renderNotFound();

    const evidenceSteps = [
      ["artifact-production", "Artifact"],
      ["controlled-model-behaviour", "Model behaviour"],
      ["controlled-human-effect", "Human effect"],
      ["deployment-readiness", "Deployment readiness"],
      ["observed-deployment", "Observed deployment"],
      ["aggregate-outcome", "Aggregate outcome"]
    ];

    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="breadcrumbs"><a href="#/evals">Browse</a> / ${esc(record.name)}</div>
        <div class="eval-status ${esc(record.review_status)}">${esc(statusLabel(record.review_status))}</div>
        <h1>${esc(record.name)}</h1>
        <p class="lede">${esc(record.description)}</p>
      </div></header>
      <div class="wide detail-layout">
        <article class="detail-main">
          ${record.review_status !== "reviewed" ? `<div class="notice"><strong>Discovery record, not an independent assessment.</strong> FronteraEval has not yet reviewed the construct, protocol or inference boundary.</div>` : ""}
          <section class="claims" aria-label="Inference boundary">
            <article><h2>What this can tell you</h2><p>${esc(record.measures)}</p></article>
            <article><h2>What it cannot tell you</h2><p>${esc(record.does_not_measure)}</p></article>
          </section>
          <section class="detail-section">
            <h2>Decision use</h2>
            <div class="use-pair">
              <div><span class="label">Best used for</span><p>${esc(record.best_for)}</p></div>
              <div><span class="label">Not enough for</span><p>${esc(record.not_sufficient_for)}</p></div>
            </div>
          </section>
          <section class="detail-section">
            <h2>How far the evidence reaches</h2>
            <p class="small-note">Direct coverage is an inference boundary, not a quality grade.</p>
            <div class="evidence-chain">
              ${evidenceSteps.map(([id, name], index) => `${index ? `<span class="evidence-arrow">→</span>` : ""}<span class="evidence-step ${record.evidence_reach.includes(id) ? "direct" : ""}">${esc(name)}</span>`).join("")}
            </div>
          </section>
          <section class="detail-section">
            <h2>Interpretation rule</h2>
            <p>Attribute any result to the exact protocol, model system, access route, elicitation method and evaluation date. A shared topic does not establish a shared construct.</p>
          </section>
        </article>
        <aside class="meta-rail" aria-label="Record metadata">
          <dl>
            <dt>Organisation</dt><dd>${esc(record.organisation)}</dd>
            <dt>Source layer</dt><dd>${esc(sourceLabel(record.source_type))}</dd>
            <dt>Topics</dt><dd>${esc(record.topics.map(topicLabel).join(", "))}</dd>
            <dt>Source checked</dt><dd>${esc(formatDate(record.last_source_check))}</dd>
            <dt>Editorial review</dt><dd>${esc(formatDate(record.editorial_reviewed_at))}</dd>
            <dt>Inspect compatible</dt><dd>${record.inspect_compatible ? "Yes" : "Not recorded"}</dd>
            <dt>Stable ID</dt><dd><code>${esc(record.id)}</code></dd>
          </dl>
          <a class="primary-source" href="${esc(record.source_url)}" target="_blank" rel="noopener">Open primary source ↗</a>
        </aside>
      </div>`;
  }

  function topicCounts() {
    const counts = {};
    for (const record of state.records) {
      for (const topic of record.topics) counts[topic] = (counts[topic] || 0) + 1;
    }
    return counts;
  }

  function renderTopics() {
    const counts = topicCounts();
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Risk and capability map</div>
        <h1>Topics</h1>
        <p class="lede">A way into the evidence. Not a claim that every evaluation inside a topic measures the same thing.</p>
      </div></header>
      <section class="topic-index"><div class="wide">
        ${Object.entries(state.catalog.topics).map(([id, topic]) => `
          <a class="topic-row" href="#/topic/${esc(id)}">
            <span class="count">${counts[id] || 0}</span>
            <strong>${esc(topic.label)}</strong>
            <p>${esc(topic.definition)}</p>
          </a>`).join("")}
      </div></section>`;
  }

  function renderTopic(id) {
    const topic = state.catalog.topics[id];
    if (!topic) return renderNotFound();
    const records = state.records.filter((record) => record.topics.includes(id));
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="breadcrumbs"><a href="#/topics">Topics</a> / ${esc(topic.label)}</div>
        <h1>${esc(topic.label)}</h1>
        <p class="lede">${esc(topic.definition)}</p>
      </div></header>
      <section class="browse"><div class="wide">
        <p class="inline-warning"><strong>${records.length} records are tagged here.</strong> Inclusion does not establish construct equivalence, completeness or comparability.</p>
        <div class="eval-list">${records.map(renderRow).join("")}</div>
      </div></section>`;
  }

  function renderAgencyTransfer() {
    const collection = state.catalog.collections["agency-transfer"];
    const records = state.records.filter((record) => record.collections?.includes("agency-transfer"));
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Research collection</div>
        <h1>Agency Transfer</h1>
        <p class="lede">Harmful manipulation, persuasion and the gap between model capability and political consequence.</p>
      </div></header>
      <section class="wide agency-intro">
        <div>
          <h2>The central gap</h2>
          <p>${esc(collection.thesis)}</p>
          <p class="small-note">${esc(collection.limitations)}</p>
        </div>
        <div class="chain"><div>AI capability</div><div>Deployment at scale</div><div>Individual behavioural effect</div><div>Aggregate agency transfer</div><div>Political consequence</div></div>
      </section>
      <section class="editorial-section"><div class="wide section-intro">
        <div><div class="eyebrow">What the current evidence covers</div><h2>Fragments, not the whole chain.</h2></div>
        <p>Existing evaluations probe persuasive content, strategic dialogue, sycophancy, deception and agentic misconduct. They rarely measure covert distribution, durable human behaviour or aggregate electoral outcomes.</p>
      </div></section>
      <section class="browse"><div class="wide">
        <div class="results-summary"><strong>${records.length} relevant records</strong><span>Adjacent constructs; no aggregate score.</span></div>
        <div class="eval-list">${records.map(renderRow).join("")}</div>
      </div></section>`;
  }

  function renderMethodology() {
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Editorial standard</div>
        <h1>Method</h1>
        <p class="lede">Source discovery is automated. Interpretation is not.</p>
      </div></header>
      <article class="measure prose">
        <h2>Three evidence states</h2>
        <table>
          <tr><th>State</th><th>What it means</th><th>Permitted use</th></tr>
          <tr><td>Metadata imported</td><td>Name and implementation location imported from an official registry.</td><td>Discovery only.</td></tr>
          <tr><td>Source catalogued</td><td>A primary source or registered implementation has been identified.</td><td>Describe the source, not its validity.</td></tr>
          <tr><td>Editorially reviewed</td><td>A bounded interpretation with an explicit inference ceiling.</td><td>Use the stated interpretation with source attribution.</td></tr>
        </table>
        <h2>The unit problem</h2>
        <p>An evaluation family is not an implementation. An implementation is not a run. A run is not a result. A familiar model name is not a fully specified model system. FronteraEval keeps these distinctions visible rather than compressing them into a universal safety score.</p>
        <h2>Evidence reach</h2>
        <p>A controlled result may support a claim about model behaviour while leaving deployment, human effect and aggregate outcome unmeasured. Evidence reach is therefore an inference boundary, not a grade.</p>
        <h2>Comparability</h2>
        <p>Scores should only be compared when construct, protocol, model-system configuration, elicitation and outcome metric align. Topic proximity is not statistical comparability.</p>
        <h2>Automation boundary</h2>
        <p>The weekly pipeline detects source changes, parses stable identifiers and checks freshness. It cannot author claims about what an evaluation measures, what it excludes or how it should inform policy.</p>
      </article>`;
  }

  function renderUpdates() {
    const changes = state.live?.changes || {};
    const failing = state.live?.source_checks?.filter((check) => !check.ok) || [];
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Freshness</div>
        <h1>What changed?</h1>
        <p class="lede">The catalogue watches official sources. Editorial claims remain review-gated.</p>
        <div class="catalogue-note">${freshnessText()}</div>
      </div></header>
      <article class="measure prose">
        <h2>Latest source sweep</h2>
        <table>
          <tr><th>Signal</th><th>Count</th></tr>
          <tr><td>New Inspect tasks</td><td>${changes.new_internal || 0}</td></tr>
          <tr><td>New register entries</td><td>${changes.new_register || 0}</td></tr>
          <tr><td>Missing or renamed entries</td><td>${changes.missing_internal || 0}</td></tr>
          <tr><td>Canonical sources failing checks</td><td>${failing.length}</td></tr>
        </table>
        <h2>What happens automatically</h2>
        <p>FronteraEval fetches the official Inspect registry and repository tree, compares stable IDs with the published snapshot, checks selected canonical sources and publishes a live freshness record.</p>
        <p class="inline-warning"><strong>What does not happen automatically:</strong> no model writes the fields “measures”, “does not measure”, evidence reach, comparability or policy relevance directly into the public catalogue.</p>
      </article>`;
  }

  function renderData() {
    main.innerHTML = `
      <header class="page-head"><div class="wide">
        <div class="eyebrow">Open metadata</div>
        <h1>Data</h1>
        <p class="lede">Reuse the catalogue. Preserve its evidence state and inference limits.</p>
      </div></header>
      <article class="measure prose">
        <h2>Downloads</h2>
        <p><a class="text-link" href="/data/catalog.json" download>Download JSON</a></p>
        <p><a class="text-link" href="/data/catalog.csv" download>Download CSV</a></p>
        <p><a class="text-link" href="/data/freshness.json">Open build freshness</a></p>
        <h2>Snapshot</h2>
        <table>
          <tr><th>Records</th><td>${state.catalog.stats.records}</td></tr>
          <tr><th>Inspect commit</th><td><code>${esc(state.catalog.inspect_source_sha)}</code></td></tr>
          <tr><th>Generated</th><td>${esc(formatDate(state.catalog.generated_at))}</td></tr>
          <tr><th>Schema</th><td>${esc(state.catalog.schema_version)}</td></tr>
        </table>
      </article>`;
  }

  function renderNotFound() {
    main.innerHTML = `<article class="measure prose"><h1>Not found.</h1><p>The requested record or view does not exist.</p><p><a href="#/">Return home</a></p></article>`;
  }

  window.addEventListener("hashchange", route);
  load().catch((error) => {
    main.innerHTML = `<article class="measure prose"><h1>Catalogue unavailable.</h1><p>${esc(error.message)}</p><p><a href="/data/catalog.json">Open raw data</a></p></article>`;
  });
})();
