from pathlib import Path


def replace(path, old, new, count=1):
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:100]}")
    file.write_text(text.replace(old, new, count))


replace(
    "site/app.js",
    '  const main = document.querySelector("#main");\n  const esc =',
    '  const main = document.querySelector("#main");\n  const catalogPromise = globalThis.FronteraEvalCatalogPromise ||= fetch("/data/catalog.json")\n    .then((response) => response.ok ? response.json() : null)\n    .catch(() => null);\n  const esc =',
)

replace(
    "site/app.js",
    '''  async function load() {
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
''',
    '''  async function load() {
    state.catalog = await catalogPromise;
    if (!state.catalog) throw new Error("Catalogue unavailable");
    state.records = [...state.catalog.records];
    route();

    fetch("/api/weekly-status", { signal: AbortSignal.timeout(12000) })
      .then((liveResponse) => liveResponse.ok ? liveResponse.json() : null)
      .then((live) => {
        if (!live) return;
        state.live = live;
        const previousCount = state.records.length;
        if (live?.inspect?.entries?.length) mergeLive(live.inspect.entries);
        if (state.records.length !== previousCount) route({ preserveScroll: true });
        else hydrateLiveStatus();
      })
      .catch(() => {});
  }
''',
)

replace(
    "site/app.js",
    '  function route(options = {}) {\n',
    '''  function notifyRendered(path = parseHash().path) {
    queueMicrotask(() => document.dispatchEvent(new CustomEvent("fronteraeval:rendered", { detail: { path } })));
  }

  function route(options = {}) {
''',
)

replace(
    "site/app.js",
    '''    else renderNotFound();
    setTimeout(() => main.focus(), 0);
  }
''',
    '''    else renderNotFound();
    notifyRendered(path);
    setTimeout(() => main.focus(), 0);
  }
''',
)

replace(
    "site/app.js",
    '''  function freshnessText() {
    if (state.live?.status === "current" && state.live?.checked_at) {
      const checked = new Date(state.live.checked_at).toLocaleString("en-GB", {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
      });
      return `<span class="status-dot live"></span>Sources checked ${esc(checked)} UTC`;
    }
    return `<span class="status-dot"></span>Build snapshot ${esc(formatDate(state.catalog.generated_at))}`;
  }
''',
    '''  function freshnessText() {
    if (state.live?.status === "current" && state.live?.checked_at) {
      const checked = new Date(state.live.checked_at).toLocaleString("en-GB", {
        dateStyle: "medium", timeStyle: "short", timeZone: "UTC"
      });
      return `<span class="status-dot live"></span>Sources checked ${esc(checked)} UTC`;
    }
    return `<span class="status-dot"></span>Build snapshot ${esc(formatDate(state.catalog.generated_at))}`;
  }

  function hydrateLiveStatus() {
    document.querySelectorAll("[data-live-freshness]").forEach((node) => {
      node.innerHTML = freshnessText();
    });
  }
''',
)

replace(
    "site/app.js",
    '<div class="catalogue-meta">${freshnessText()}<span>${state.records.length} catalogue records</span>',
    '<div class="catalogue-meta"><span data-live-freshness>${freshnessText()}</span><span>${state.records.length} catalogue records</span>',
)

replace(
    "site/app.js",
    '''    renderPagination(pages, records.length);
  }
''',
    '''    renderPagination(pages, records.length);
    notifyRendered("/evals");
  }
''',
)

for path in [
    "site/enhancements.js",
    "site/ui-controls.js",
    "site/methodological-reviews.js",
    "site/seo-runtime.js",
]:
    file = Path(path)
    text = file.read_text()
    text = text.replace(
        'const catalogPromise = fetch("/data/catalog.json")\n    .then((response) => response.ok ? response.json() : null)\n    .catch(() => null);',
        'const catalogPromise = globalThis.FronteraEvalCatalogPromise ||= fetch("/data/catalog.json")\n    .then((response) => response.ok ? response.json() : null)\n    .catch(() => null);',
    )
    text = text.replace(
        "fetch('/data/catalog.json').then((r)=>r.ok?r.json():null).then((data)=>{catalog=data;update()}).catch(()=>{});",
        "(globalThis.FronteraEvalCatalogPromise ||= fetch('/data/catalog.json').then((r)=>r.ok?r.json():null).catch(()=>null)).then((data)=>{catalog=data;update()});",
    )
    file.write_text(text)

replace(
    "site/enhancements.js",
    '''  window.addEventListener("hashchange", scheduleEnhancement);
  new MutationObserver(scheduleEnhancement).observe(main, { childList: true, subtree: true });
  scheduleEnhancement();
''',
    '''  document.addEventListener("fronteraeval:rendered", scheduleEnhancement);
  window.addEventListener("hashchange", scheduleEnhancement);
  scheduleEnhancement();
''',
)

replace(
    "site/methodological-reviews.js",
    '''  const schedule = () => window.setTimeout(render, 0);
  window.addEventListener("hashchange", schedule);
  new MutationObserver(schedule).observe(main, { childList: true, subtree: true });
  schedule();
''',
    '''  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  };
  document.addEventListener("fronteraeval:rendered", schedule);
  window.addEventListener("hashchange", schedule);
  schedule();
''',
)

file = Path("site/attribution.js")
text = file.read_text()
start = text.index("  const observer = new MutationObserver")
end = text.index("})();", start)
replacement = '''  function schedule() {
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
'''
file.write_text(text[:start] + replacement + text[end:])

replace(
    "site/seo-runtime.js",
    "  addEventListener('hashchange',update);new MutationObserver(()=>{if(location.hash.includes('/eval/'))update()}).observe(document.querySelector('#main'),{childList:true,subtree:true});update();",
    "  addEventListener('hashchange',update);document.addEventListener('fronteraeval:rendered',update);update();",
)

print("Runtime batching patch applied.")
