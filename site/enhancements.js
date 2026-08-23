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
      documentation: "Documentation", dataset: "Dataset", framework: "Framework",
      repository: "Repository", official: "Official source"
    })[link?.kind] || "Source";
  }

  function currentRecordID() {
    const raw = (location.hash || "").slice(1).split("?")[0];
    return raw.startsWith("/eval/") ? decodeURIComponent(raw.slice(6)) : null;
  }

  function protocolItems(record) {
    const items = [];
    if (record.paper_title) items.push(["Paper", record.paper_title]);
    if (record.tasks?.length) items.push(["Tasks", record.tasks.map((task) => task.name).join(", ")]);
    if (record.protocol?.implementation_commit) items.push(["Implementation commit", record.protocol.implementation_commit]);
    if (record.protocol?.report_timestamp) items.push(["Results reported", record.protocol.report_timestamp]);
    if (record.models_reported?.length) items.push(["Models reported", String(record.models_reported.length)]);
    if (record.contributors?.length) items.push(["Register contributors", record.contributors.join(", ")]);
    return items;
  }

  function renderMetrics(metrics) {
    if (!Array.isArray(metrics) || metrics.length === 0) return "—";
    return metrics.map((metric) => `<span><strong>${esc(metric.key)}</strong> ${esc(formatValue(metric.value))}</span>`).join("");
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
      assurance.innerHTML = record.metadata_enriched
        ? "Metadata extracted from the versioned Inspect register entry. Editorial interpretation remains separate."
        : "Discovery metadata only. Read the upstream source before relying on this record.";
      sourcePanel.querySelector(".copy-link")?.before(assurance);
    }

    const items = protocolItems(record);
    const results = Array.isArray(record.reported_results) ? record.reported_results : [];
    const hasProtocol = items.length || record.protocol?.command || record.protocol?.source_comment || record.tasks?.length;
    const hasResults = results.length > 0;
    if (!hasProtocol && !hasResults && links.length <= 1) return;

    const related = content.querySelector(".related-section");
    const section = document.createElement("section");
    section.className = "record-section upstream-section";
    section.dataset.enrichment = "upstream";
    section.innerHTML = `
      <div class="section-heading compact">
        <div><h2>Upstream evidence</h2><p>Versioned metadata from the evaluation’s own registry, paper, code, or report.</p></div>
        ${record.registry_url ? `<a href="${esc(record.registry_url)}" target="_blank" rel="noopener">Inspect metadata ↗</a>` : ""}
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

  function scheduleEnhancement() {
    window.setTimeout(enhanceDetail, 0);
    window.setTimeout(enhanceDetail, 120);
  }

  window.addEventListener("hashchange", scheduleEnhancement);
  new MutationObserver(scheduleEnhancement).observe(main, { childList: true, subtree: true });
  scheduleEnhancement();
})();
