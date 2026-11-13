(() => {
  "use strict";

  const main = document.querySelector("#main");
  if (!main) return;

  const catalogPromise = globalThis.FronteraEvalCatalogPromise ||= fetch("/data/catalog.json")
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  const SHORT_LABELS = {
    evaluation_developer: "Official source",
    original_research: "Research source",
    original_benchmark_source: "Original source",
    paper_authors: "Paper",
    implementation_maintainer: "Implementation",
    framework_developer: "Framework",
    suite_developer: "Suite",
    environment_developer: "Environment",
    methodology_developer: "Methodology",
    implementation: "Reference code",
    "inspect-implementation": "Inspect implementation",
    "inspect-registry": "Inspect registry",
    paper: "Paper",
    dataset: "Dataset",
    official: "Official page"
  };

  let recordsById = null;
  let scheduled = false;
  let observerActive = false;

  function currentRecordID() {
    const path = (location.hash || "#/").slice(1).split("?")[0];
    return path.startsWith("/eval/") ? decodeURIComponent(path.slice(6)) : null;
  }

  function rowRecordID(row) {
    const href = row.querySelector(".eval-main")?.getAttribute("href") || "";
    const marker = "#/eval/";
    const index = href.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(href.slice(index + marker.length));
  }

  function addCandidate(list, seen, label, url, kind) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    list.push({ label: SHORT_LABELS[kind] || label || "Source", url, kind });
  }

  function candidateSources(record) {
    const candidates = [];
    const seen = new Set();
    addCandidate(candidates, seen, record.preferred_source?.label, record.preferred_source?.url, record.preferred_source?.kind);
    addCandidate(candidates, seen, "Paper", record.paper?.url, "paper");
    addCandidate(candidates, seen, "Reference code", record.reference_implementation?.url, "implementation");
    addCandidate(
      candidates,
      seen,
      record.inspect_provenance?.role_label,
      record.inspect_provenance?.url,
      record.inspect_provenance?.role === "registry_entry" ? "inspect-registry" : "inspect-implementation"
    );
    for (const link of record.links || []) addCandidate(candidates, seen, link.label, link.url, link.kind);
    return candidates;
  }

  function enhanceRows() {
    document.querySelectorAll(".eval-row").forEach((row) => {
      const id = rowRecordID(row);
      if (!id || row.dataset.attributionFor === id) return;
      const record = recordsById.get(id);
      if (!record) return;

      const context = row.querySelector(".eval-context");
      const first = context?.querySelector("span:first-child");
      if (first) {
        first.classList.add("attribution-context");
        first.innerHTML = `<small>${esc(record.organisation_role || "Source")}</small>${esc(record.organisation || "Origin not verified")}`;
      }

      const source = row.querySelector(".source-link");
      if (source && record.preferred_source?.url) {
        const label = SHORT_LABELS[record.preferred_source.kind] || record.preferred_source.label || "Source";
        source.href = record.preferred_source.url;
        source.textContent = `${label} ↗`;
        source.setAttribute("aria-label", `${label} for ${record.name}`);
      }

      row.dataset.attributionFor = id;
    });
  }

  function resourceCard({ label, name, detail, url, status, primary = false }) {
    const body = `
      <span>${esc(label)}</span>
      <strong>${esc(name || "Not verified")}</strong>
      ${detail ? `<small>${esc(detail)}</small>` : ""}
      ${status ? `<em>${esc(status)}</em>` : ""}`;
    return url
      ? `<a class="source-role${primary ? " primary" : ""}" href="${esc(url)}" target="_blank" rel="noopener">${body}<b aria-hidden="true">↗</b></a>`
      : `<div class="source-role${primary ? " primary" : ""}">${body}</div>`;
  }

  function paperDetail(paper) {
    const details = [];
    if (paper?.authors?.length) details.push(paper.authors.slice(0, 6).join(", ") + (paper.authors.length > 6 ? " et al." : ""));
    if (paper?.organizations?.length) details.push(`Affiliations: ${paper.organizations.slice(0, 5).join("; ")}`);
    return details.join(" · ");
  }

  function enhanceDetail() {
    const id = currentRecordID();
    if (!id) return;
    const record = recordsById.get(id);
    if (!record) return;

    const recordMeta = document.querySelector(".record-meta");
    if (recordMeta?.dataset.attributionFor !== id) {
      const firstMeta = recordMeta?.querySelector("span:first-child");
      if (firstMeta) firstMeta.textContent = `${record.organisation_role || "Source"}: ${record.organisation || "Origin not verified"}`;
      if (recordMeta) recordMeta.dataset.attributionFor = id;
    }

    const actionPanel = document.querySelector(".record-actions");
    if (actionPanel && actionPanel.dataset.sourceResolutionFor !== id) {
      actionPanel.dataset.sourceResolutionFor = id;
      const sources = candidateSources(record).slice(0, 4);
      if (sources.length) {
        actionPanel.innerHTML = sources.map((source, index) => `
          <a class="button${index === 0 ? " primary" : ""}" href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} ↗</a>
        `).join("");
      }
    }

    const sourcePanel = document.querySelector(".source-panel");
    if (!sourcePanel || sourcePanel.dataset.sourceResolutionFor === id) return;
    sourcePanel.dataset.sourceResolutionFor = id;

    const heading = sourcePanel.querySelector("h2");
    if (heading) heading.textContent = "Origin, paper, and implementation";

    const organisationTerm = [...sourcePanel.querySelectorAll("dt")]
      .find((term) => term.textContent.trim() === "Organisation");
    if (organisationTerm) {
      organisationTerm.textContent = "Primary source attribution";
      const definition = organisationTerm.nextElementSibling;
      if (definition) definition.innerHTML = `<strong>${esc(record.organisation || "Origin not verified")}</strong><br><small>${esc(record.organisation_role || "Unresolved")}</small>`;
    }

    const origin = record.origin || {};
    const paper = record.paper || {};
    const implementation = record.reference_implementation || {};
    const inspect = record.inspect_provenance || {};
    const roleBlock = document.createElement("section");
    roleBlock.className = "source-resolution-block";
    roleBlock.innerHTML = `
      <div class="source-resolution-heading">
        <h3>Source resolution</h3>
        <span class="source-resolution-status ${esc(record.attribution_status || "unresolved")}">${esc(record.attribution_status || "unresolved").replaceAll("-", " ")}</span>
      </div>
      <div class="source-role-list">
        ${resourceCard({
          label: origin.role_label || "Origin",
          name: origin.name || "Origin not verified",
          detail: origin.organization || (origin.organizations || []).join("; "),
          url: origin.evidence_url,
          status: origin.confidence,
          primary: true
        })}
        ${record.paper_status === "present" ? resourceCard({
          label: "Associated paper",
          name: paper.title || record.paper_title || "Paper metadata pending",
          detail: paperDetail(paper),
          url: paper.url,
          status: paper.metadata_status
        }) : resourceCard({
          label: "Associated paper",
          name: record.paper_status === "not-applicable" ? "Not applicable to this resource type" : "No paper identified",
          detail: "Absence is recorded explicitly; a blog post is not relabelled as a paper.",
          status: record.paper_status
        })}
        ${implementation.url ? resourceCard({
          label: "Reference implementation",
          name: implementation.owner || "Upstream implementation",
          detail: implementation.relation,
          url: implementation.url,
          status: implementation.confidence
        }) : ""}
        ${inspect.url ? resourceCard({
          label: inspect.role_label || "Inspect provenance",
          name: inspect.steward || "Inspect Evals",
          detail: "Implementation or registry provenance; not automatically the evaluation origin.",
          url: inspect.url,
          status: inspect.role
        }) : ""}
      </div>
      ${record.source_resolution?.note ? `<p class="source-resolution-note">${esc(record.source_resolution.note)}</p>` : ""}
      <p class="source-resolution-policy">Hosting, implementation maintenance, paper authorship, and evaluation development are reported as distinct roles.</p>
    `;
    sourcePanel.querySelector(".source-links")?.after(roleBlock);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(async () => {
      scheduled = false;
      const catalog = await catalogPromise;
      if (!catalog) return;
      recordsById ||= new Map(catalog.records.map((record) => [record.id, record]));
      enhanceRows();
      enhanceDetail();
    });
  }

  document.addEventListener("fronteraeval:rendered", schedule);
  window.addEventListener("hashchange", schedule);
  schedule();
})();
