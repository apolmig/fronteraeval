(() => {
  "use strict";

  const main = document.querySelector("#main");
  const catalogPromise = fetch("/data/catalog.json")
    .then((response) => response.ok ? response.json() : null)
    .catch(() => null);

  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  function currentRecordId() {
    const path = (location.hash || "#/").slice(1).split("?")[0];
    return path.startsWith("/eval/") ? decodeURIComponent(path.slice(6)) : null;
  }

  function markup(review) {
    const limitations = (review.limitations || []).map((item) => `<li>${esc(item)}</li>`).join("");
    const sources = (review.source_basis || []).map((source) =>
      `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.kind || "Source")} ↗</a>`
    ).join("");

    return `<section class="record-section methodological-assessment" data-methodological-assessment>
      <div class="methodological-heading">
        <div><div class="eyebrow">FronteraEval assessment</div><h2>Methodological assessment</h2></div>
        <span class="review-boundary">${esc(review.review_type || "documentary")} review · ${esc(review.replication_status || "not-replicated")}</span>
      </div>
      <div class="methodological-notice"><strong>Documentary review, not an independent replication.</strong> This assessment interprets public methods and sources. It does not verify the reported results by rerunning the evaluation.</div>
      <dl class="methodological-grid">
        <div><dt>Construct</dt><dd>${esc(review.construct)}</dd></div>
        <div><dt>Unit of analysis</dt><dd>${esc(review.unit_of_analysis)}</dd></div>
        <div><dt>Interaction</dt><dd>${esc(review.interaction_type)}</dd></div>
        <div><dt>Outcome</dt><dd>${esc(review.target_outcome)}</dd></div>
        <div><dt>Elicitation</dt><dd>${esc(review.elicitation)}</dd></div>
        <div><dt>Scoring</dt><dd>${esc(review.scoring)}</dd></div>
      </dl>
      <div class="methodological-columns">
        <div><h3>Protocol dependence</h3><p>${esc(review.protocol_dependence)}</p></div>
        <div><h3>Implementation dependence</h3><p>${esc(review.implementation_dependence)}</p></div>
      </div>
      <div class="methodological-columns">
        <div><h3>Comparability</h3><p>${esc(review.comparability)}</p></div>
        <div><h3>Decision relevance</h3><p>${esc(review.decision_relevance)}</p></div>
      </div>
      <div class="methodological-limitations"><h3>Principal limitations</h3><ul>${limitations}</ul></div>
      <div class="methodological-sources"><span>Review basis</span>${sources}</div>
    </section>`;
  }

  async function render() {
    const id = currentRecordId();
    if (!id || main.querySelector("[data-methodological-assessment]")) return;
    const catalog = await catalogPromise;
    const record = catalog?.records?.find((item) => item.id === id);
    const review = record?.methodological_review;
    if (!review || currentRecordId() !== id) return;

    const content = main.querySelector(".record-content");
    if (!content) return;
    const evidence = content.querySelector("[data-evidence-section]");
    const upstream = content.querySelector("[data-upstream-evidence]");
    if (evidence) evidence.insertAdjacentHTML("afterend", markup(review));
    else if (upstream) upstream.insertAdjacentHTML("beforebegin", markup(review));
    else content.insertAdjacentHTML("afterbegin", markup(review));
  }

  const schedule = () => window.setTimeout(render, 0);
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  schedule();
})();
