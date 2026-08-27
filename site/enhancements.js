(() => {
  "use strict";

  const main = document.querySelector("#main");
  const catalogPromise = fetch("/data/catalog.json")
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);

  function formatValue(value) {
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
    if (typeof value === "string") return value;
    if (value == null) return "—";
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function resourceLabel(link) {
    if (link?.label) return link.label;
    return ({
      paper: "Paper", code: "Implementation", registry: "Registry entry",
      metadata: "Evaluation metadata", documentation: "Documentation", dataset: "Dataset",
      framework: "Framework", repository: "Repository", official: "Official source"
    })[link?.kind] || "Source";
  }

  function currentPath() {
    return (location.hash || "#/").slice(1).split("?")[0];
  }

  function currentRecordID() {
    const raw = currentPath();
    return raw.startsWith("/eval/") ? decodeURIComponent(raw.slice(6)) : null;
  }

  function taskSummary(record) {
    if (!record.tasks?.length) return null;
    return record.tasks.map((task) => {
      const count = task.dataset_samples ?? null;
      return `${task.name}${count != null ? ` (${count} samples)` : ""}`;
    }).join(", ");
  }

  function protocolItems(record) {
    const items = [];
    if (record.paper_title) items.push(["Paper", record.paper_title]);
    if (record.family_title && record.family_title !== record.name) items.push(["Evaluation family", record.family_title]);
    if (record.group) items.push(["Inspect group", record.group]);
    if (record.version || record.protocol?.version) items.push(["Version", record.version || record.protocol.version]);
    if (record.task?.dataset_samples != null) items.push(["Task samples", String(record.task.dataset_samples)]);
    const tasks = taskSummary(record);
    if (tasks) items.push(["Tasks", tasks]);
    if (record.protocol?.implementation_commit) items.push(["Implementation commit", record.protocol.implementation_commit]);
    if (record.protocol?.report_timestamp) items.push(["Results reported", record.protocol.report_timestamp]);
    if (record.models_reported?.length) items.push(["Models reported", String(record.models_reported.length)]);
    if (record.contributors?.length) items.push(["Contributors", record.contributors.join(", ")]);
    return items;
  }

  function renderMetrics(metrics) {
    if (!Array.isArray(metrics) || metrics.length === 0) return "—";
    return metrics.map((metric) => `<span><strong>${esc(metric.key)}</strong> ${esc(formatValue(metric.value))}</span>`).join("");
  }

  function metadataDescription(record) {
    if (record.metadata_source === "Inspect internal eval.yaml") {
      return "Metadata extracted from versioned Inspect evaluation metadata. Editorial interpretation remains separate.";
    }
    if (record.metadata_enriched) {
      return "Metadata extracted from the versioned Inspect register entry. Editorial interpretation remains separate.";
    }
    return "Discovery metadata only. Read the upstream source before relying on this record.";
  }

  function metadataLink(record) {
    const url = record.registry_url || record.metadata_url;
    if (!url) return "";
    const label = record.registry_url ? "Inspect register metadata" : "Inspect evaluation metadata";
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`;
  }

  async function enhanceDetail() {
    const id = currentRecordID();
    if (!id) return;

    const catalog = await catalogPromise;
    const record = catalog?.records?.find((item) => item.id === id);
    const content = document.querySelector(".record-content");
    const sourcePanel = document.querySelector(".source-panel");
    if (!record || !content || !sourcePanel) return;
    if (content.dataset.enrichedFor === id) return;
    content.dataset.enrichedFor = id;

    const links = Array.isArray(record.links) ? record.links : [];
    const sourceLinks = sourcePanel.querySelector(".source-links");
    if (sourceLinks && links.length) {
      sourceLinks.innerHTML = links.map((link) => `
        <a href="${esc(link.url)}" target="_blank" rel="noopener">
          <span>${esc(resourceLabel(link))}</span><strong>↗</strong>
        </a>`).join("");
    }

    const sourceHeading = sourcePanel.querySelector("h2");
    if (sourceHeading) sourceHeading.textContent = links.length > 1 ? "Sources and record" : "Source and record";

    if (!sourcePanel.querySelector(".source-assurance")) {
      const assurance = document.createElement("p");
      assurance.className = "source-assurance";
      assurance.textContent = metadataDescription(record);
      sourcePanel.querySelector(".copy-link")?.before(assurance);
    }

    const items = protocolItems(record);
    const results = Array.isArray(record.reported_results) ? record.reported_results : [];
    const hasProtocol = items.length || record.protocol?.command || record.protocol?.source_comment || record.external_assets?.length;
    const hasResults = results.length > 0;
    if (!hasProtocol && !hasResults && links.length <= 1) return;

    const related = content.querySelector(".related-section");
    const section = document.createElement("section");
    section.className = "record-section upstream-section";
    section.dataset.enrichment = "upstream";
    section.innerHTML = `
      <div class="section-heading compact">
        <div><h2>Upstream evidence</h2><p>Versioned metadata from the evaluation’s own registry, paper, implementation, or report.</p></div>
        ${metadataLink(record)}
      </div>
      ${items.length ? `<dl class="protocol-grid">${items.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>` : ""}
      ${record.protocol?.command ? `<div class="run-command"><span>Published run command</span><code>${esc(record.protocol.command)}</code></div>` : ""}
      ${record.protocol?.source_comment ? `<p class="source-comment"><strong>Source note.</strong> ${esc(record.protocol.source_comment)}</p>` : ""}
      ${hasResults ? `
        <div class="reported-results">
          <div class="results-heading"><h3>Reported results</h3><span>${esc(record.protocol?.report_timestamp || "Upstream report")}${record.reported_results_truncated ? " · partial display" : ""}</span></div>
          <div class="results-table-wrap"><table class="results-table">
            <thead><tr><th>Model</th><th>Provider</th><th>Metrics</th></tr></thead>
            <tbody>${results.map((result) => `<tr><td>${esc(result.model)}</td><td>${esc(result.provider || "—")}</td><td><div class="metric-values">${renderMetrics(result.metrics)}</div></td></tr>`).join("")}</tbody>
          </table></div>
          ${record.report_notes?.length ? `<ul class="report-notes">${record.report_notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul>` : ""}
          <p class="results-caveat">These are upstream-reported results, not independently reproduced by FronteraEval.</p>
        </div>` : ""}
    `;

    if (related) related.before(section);
    else content.append(section);
  }

  async function enhanceDataPage() {
    if (currentPath() !== "/data") return;
    const catalog = await catalogPromise;
    const definitionList = document.querySelector(".data-dl");
    if (!catalog || !definitionList || definitionList.dataset.enriched === "true") return;
    definitionList.dataset.enriched = "true";

    const terms = [...definitionList.querySelectorAll("dt")];
    const inspectTerm = terms.find((term) => term.textContent.trim() === "Inspect commit");
    if (inspectTerm?.nextElementSibling && catalog.inspect_source_commit) {
      inspectTerm.nextElementSibling.innerHTML = `<code>${esc(catalog.inspect_source_commit)}</code>`;
    }

    const enrichment = catalog.stats?.enrichment || {};
    const review = catalog.stats?.review_status || {};
    const sourceResolution = catalog.stats?.source_resolution || {};
    const sourceStatus = sourceResolution.status || {};
    definitionList.insertAdjacentHTML("beforeend", `
      <dt>Independent reviews</dt><dd>${esc(review.reviewed ?? 0)} of ${esc(catalog.records.length)} records</dd>
      <dt>Discovery-only records</dt><dd>${esc((review.imported ?? 0) + (review.catalogued ?? 0))} records</dd>
      <dt>Source resolution</dt><dd>${esc(sourceStatus.verified ?? 0)} verified · ${esc(sourceStatus["source-derived"] ?? 0)} source-derived · ${esc(sourceStatus["paper-only"] ?? 0)} paper-only · ${esc(sourceStatus["host-only"] ?? 0)} host-only</dd>
      <dt>Internal metadata</dt><dd>${esc(enrichment.internal_entries_enriched ?? 0)} tasks enriched</dd>
      <dt>Register metadata</dt><dd>${esc(enrichment.register_entries_enriched ?? 0)} entries enriched</dd>
      <dt>Paper links</dt><dd>${esc(enrichment.entries_with_paper ?? 0)} records</dd>
      <dt>Source links</dt><dd>${esc(enrichment.linked_resources ?? 0)} versioned resources</dd>
      <dt>Reported results</dt><dd>${esc(enrichment.entries_with_reported_results ?? 0)} entries with upstream result tables</dd>
    `);
    definitionList.insertAdjacentHTML("afterend", `<p class="results-caveat"><strong>Coverage note.</strong> Catalogue size is not review depth. Most records support discovery and provenance; only records marked Reviewed contain a FronteraEval methodological interpretation, and none should be treated as an independent experimental replication unless explicitly stated.</p>`);
  }

  async function enhanceUpdatesPage() {
    if (currentPath() !== "/updates") return;
    const [catalog, weekly, linkAudit] = await Promise.all([
      catalogPromise,
      fetch("/data/weekly-refresh.json").then((response) => response.ok ? response.json() : null).catch(() => null),
      fetch("/data/source-link-audit.json").then((response) => response.ok ? response.json() : null).catch(() => null)
    ]);
    const article = document.querySelector("article.prose");
    if (!catalog || !article || article.dataset.enriched === "true") return;
    article.dataset.enriched = "true";
    const enrichment = catalog.stats?.enrichment || {};
    const review = catalog.stats?.review_status || {};
    const links = linkAudit?.totals || {};
    article.insertAdjacentHTML("beforeend", `
      <h2>Validated catalogue build</h2>
      <div class="metric-list enrichment-metrics">
        <div><strong>${esc(catalog.records.length)}</strong><span>Public catalogue records</span></div>
        <div><strong>${esc(review.reviewed ?? 0)}</strong><span>Documentary reviews</span></div>
        <div><strong>${esc(enrichment.support_tasks_excluded ?? 0)}</strong><span>Unscored support tasks excluded</span></div>
        <div><strong>${esc(enrichment.linked_resources ?? 0)}</strong><span>Versioned resources</span></div>
      </div>
      <h2>Primary-source health</h2>
      <div class="metric-list enrichment-metrics">
        <div><strong>${esc(links.unique_urls ?? 0)}</strong><span>Unique URLs audited</span></div>
        <div><strong>${esc(links.reachable ?? 0)}</strong><span>Reachable</span></div>
        <div><strong>${esc(links.restricted ?? 0)}</strong><span>Restricted or rate-limited</span></div>
        <div><strong>${esc(links.critical_missing ?? 0)}</strong><span>Critical confirmed missing</span></div>
      </div>
      <p class="results-caveat">Last full refresh: ${esc(weekly?.refreshed_at || catalog.generated_at || "not recorded")}. A successful refresh checks structure, provenance, source resolution, search regressions, and primary-source availability. It improves freshness; it does not make the catalogue exhaustive, validate upstream results, or convert discovery records into independent reviews.</p>
    `);
  }

  function scheduleEnhancement() {
    window.setTimeout(() => {
      enhanceDetail();
      enhanceDataPage();
      enhanceUpdatesPage();
    }, 0);
    window.setTimeout(() => {
      enhanceDetail();
      enhanceDataPage();
      enhanceUpdatesPage();
    }, 120);
  }

  window.addEventListener("hashchange", scheduleEnhancement);
  new MutationObserver(scheduleEnhancement).observe(main, { childList: true, subtree: true });
  scheduleEnhancement();
})();
