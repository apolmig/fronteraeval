(() => {
  "use strict";

  const main = document.querySelector("#main");
  const catalogPromise = fetch("/data/catalog.json")
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  const SHORT_LABELS = {
    evaluation_developer: "Official page",
    original_research: "Paper",
    original_authors: "Paper",
    original_benchmark_source: "Original source",
    reference_implementation: "Reference code",
    implementation_maintainer: "Implementation",
    inspect_implementation: "Inspect implementation",
    inspect_registry: "Registry entry",
    paper: "Paper",
    dataset: "Dataset",
    dataset_provider: "Dataset",
    official_source: "Official source"
  };

  function currentRecordID() {
    const path = (location.hash || "#/").slice(1).split("?")[0];
    return path.startsWith("/eval/") ? decodeURIComponent(path.slice(6)) : null;
  }

  function rowRecordID(row) {
    const href = row.querySelector(".eval-main")?.getAttribute("href") || "";
    const marker = "#/eval/";
    const index = href.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(href.slice(index + marker.length));
  }

  function attributionText(record) {
    const primary = record.attribution?.primary;
    if (!primary) return record.organisation || "Attribution pending";
    return `${primary.role_label}: ${primary.name}`;
  }

  function candidateSources(record) {
    const candidates = [];
    const seen = new Set();

    function add(label, url, kind) {
      if (!url || seen.has(url)) return;
      seen.add(url);
      candidates.push({ label, url, kind });
    }

    if (record.preferred_source) {
      add(
        SHORT_LABELS[record.preferred_source.kind] || record.preferred_source.label || "Source",
        record.preferred_source.url,
        record.preferred_source.kind
      );
    }

    for (const item of record.attribution?.roles || []) {
      if (!item.url || ["implementation_contributors"].includes(item.role)) continue;
      add(SHORT_LABELS[item.role] || item.role_label, item.url, item.role);
    }

    for (const link of record.links || []) {
      add(link.label || "Source", link.url, link.kind);
    }

    return candidates;
  }

  function enhanceRows(catalog) {
    const records = new Map(catalog.records.map(record => [record.id, record]));
    document.querySelectorAll(".eval-row").forEach(row => {
      const id = rowRecordID(row);
      const record = records.get(id);
      if (!record) return;

      const context = row.querySelector(".eval-context");
      const first = context?.querySelector("span:first-child");
      if (first) {
        first.classList.add("attribution-context");
        first.innerHTML = `<small>${esc(record.organisation_role || "Attribution")}</small>${esc(record.organisation)}`;
      }

      const preferred = record.preferred_source;
      const source = row.querySelector(".source-link");
      if (source && preferred?.url) {
        source.href = preferred.url;
        source.textContent = `${SHORT_LABELS[preferred.kind] || "Source"} ↗`;
        source.setAttribute("aria-label", `${SHORT_LABELS[preferred.kind] || "Open source"} for ${record.name}`);
      }
    });
  }

  function renderRole(item, isPrimary) {
    const steward = item.steward ? `<small>Steward: ${esc(item.steward)}</small>` : "";
    const note = item.note ? `<small>${esc(item.note)}</small>` : "";
    const body = `<span>${esc(item.role_label)}</span><strong>${esc(item.name)}</strong>${steward}${note}`;
    if (item.url) {
      return `<a class="attribution-role${isPrimary ? " primary" : ""}" href="${esc(item.url)}" target="_blank" rel="noopener">${body}<b aria-hidden="true">↗</b></a>`;
    }
    return `<div class="attribution-role${isPrimary ? " primary" : ""}">${body}</div>`;
  }

  function enhanceDetail(catalog) {
    const id = currentRecordID();
    if (!id) return;
    const record = catalog.records.find(item => item.id === id);
    if (!record) return;

    const primary = record.attribution?.primary;
    const recordMeta = document.querySelector(".record-meta");
    const firstMeta = recordMeta?.querySelector("span:first-child");
    if (firstMeta && primary) {
      firstMeta.textContent = `${primary.role_label}: ${primary.name}`;
    }

    const actionPanel = document.querySelector(".record-actions");
    if (actionPanel && actionPanel.dataset.attributionFor !== id) {
      actionPanel.dataset.attributionFor = id;
      const sources = candidateSources(record).slice(0, 3);
      if (sources.length) {
        actionPanel.innerHTML = sources.map((source, index) => `
          <a class="button${index === 0 ? " primary" : ""}" href="${esc(source.url)}" target="_blank" rel="noopener">
            ${esc(source.label)} ↗
          </a>`).join("");
      }
    }

    const sourcePanel = document.querySelector(".source-panel");
    if (!sourcePanel) return;

    const heading = sourcePanel.querySelector("h2");
    if (heading) heading.textContent = "Sources, roles, and record";

    const terms = [...sourcePanel.querySelectorAll("dt")];
    const organisationTerm = terms.find(term => term.textContent.trim() === "Organisation");
    if (organisationTerm && primary) {
      organisationTerm.textContent = "Primary attribution";
      const definition = organisationTerm.nextElementSibling;
      if (definition) definition.innerHTML = `<strong>${esc(primary.name)}</strong><br><small>${esc(primary.role_label)}</small>`;
    }

    const contributorTerms = [...document.querySelectorAll(".protocol-grid dt")];
    for (const term of contributorTerms) {
      if (term.textContent.trim() !== "Register contributors") continue;
      term.textContent = record.source_type === "inspect-internal"
        ? "Inspect implementation contributors"
        : "Register contributors";
    }

    let rolesBlock = sourcePanel.querySelector(".attribution-block");
    if (!rolesBlock) {
      rolesBlock = document.createElement("section");
      rolesBlock.className = "attribution-block";
      const roles = (record.attribution?.roles || [])
        .filter(item => item.role !== "implementation_contributors")
        .slice(0, 7);
      rolesBlock.innerHTML = `
        <h3>Attribution roles</h3>
        <p class="attribution-status ${esc(record.attribution_status)}">${esc(record.attribution_status || "unresolved").replaceAll("-", " ")}</p>
        <div class="attribution-role-list">
          ${roles.map(item => renderRole(item, item.role === primary?.role && item.name === primary?.name)).join("")}
        </div>
        ${record.attribution?.note ? `<p class="attribution-note">${esc(record.attribution.note)}</p>` : ""}
      `;
      const sourceLinks = sourcePanel.querySelector(".source-links");
      sourceLinks?.after(rolesBlock);
    }
  }

  async function enhance() {
    const catalog = await catalogPromise;
    if (!catalog) return;
    enhanceRows(catalog);
    enhanceDetail(catalog);
  }

  function schedule() {
    window.setTimeout(enhance, 0);
    window.setTimeout(enhance, 160);
  }

  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  schedule();
})();
