import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const SITE = 'site';
const BASE = 'https://fronteraeval.org';
const CARD = `${BASE}/social-card.png`;
const catalog = JSON.parse(await readFile(`${SITE}/data/catalog.json`, 'utf8'));
const generatedAt = catalog.generated_at || new Date().toISOString();
const records = Array.isArray(catalog.records) ? catalog.records : [];
const topics = catalog.topics || {};

const esc = (value='') => String(value).replace(/[&<>"']/g, (char) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
const xml = esc;
const trim = (value, max=160) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};
const validDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0,10) : generatedAt.slice(0,10);
const safeSlug = (record) => String(record.slug || record.id || record.name)
  .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100) || 'evaluation';
const topicLabel = (id) => topics[id]?.label || String(id).replaceAll('-', ' ');
const recordUrl = (record) => `${BASE}/evaluations/${safeSlug(record)}/`;
const appUrl = (record) => `${BASE}/#/eval/${encodeURIComponent(record.id)}`;
const preferredSource = (record) => record.preferred_source?.url || record.source_url || record.links?.[0]?.url || null;
const paperUrl = (record) => record.paper?.url || record.paper_url || record.links?.find((link) => link.kind === 'paper')?.url || null;
const implementationUrl = (record) => record.reference_implementation?.url || record.code_url || record.links?.find((link) => ['code','implementation','repository'].includes(link.kind))?.url || null;
const sourceLinks = (record) => {
  const candidates = [
    preferredSource(record) && {label:'Primary source', url:preferredSource(record)},
    paperUrl(record) && {label:'Paper', url:paperUrl(record)},
    implementationUrl(record) && {label:'Implementation', url:implementationUrl(record)},
    ...(record.links || []).map((link) => ({label:link.label || link.kind || 'Source', url:link.url}))
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((item) => {
    if (!/^https:\/\//.test(item.url || '') || seen.has(item.url)) return false;
    seen.add(item.url); return true;
  }).slice(0, 8);
};

function head({title, description, canonical, type='website', modified=generatedAt.slice(0,10)}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(trim(description, 165))}">
  <meta name="author" content="Miguel Guerrero">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f7f5ef" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#171715" media="(prefers-color-scheme: dark)">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" type="application/atom+xml" title="FronteraEval updates" href="${BASE}/feed.xml">
  <link rel="search" type="application/opensearchdescription+xml" title="FronteraEval" href="${BASE}/opensearch.xml">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:site_name" content="FronteraEval">
  <meta property="og:type" content="${esc(type)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(trim(description, 200))}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${CARD}">
  <meta property="og:image:secure_url" content="${CARD}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="FronteraEval — a source-linked map of frontier AI evaluations">
  <meta property="og:locale" content="en_GB">
  <meta property="article:modified_time" content="${esc(modified)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(trim(description, 200))}">
  <meta name="twitter:image" content="${CARD}">
  <meta name="twitter:image:alt" content="FronteraEval — a source-linked map of frontier AI evaluations">
  <meta name="twitter:creator" content="@apolmig">
  <script src="/theme-init.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/ui-controls.css">
  <link rel="stylesheet" href="/discovery.css">
  <script defer src="/discovery.js"></script>
</head>`;
}

function chrome(content) {
  return `<body>
  <a class="skip-link" href="#content">Skip to content</a>
  <header class="site-header"><div class="header-inner">
    <a class="wordmark" href="/">Frontera<span>Eval</span></a>
    <nav aria-label="Primary navigation"><a href="/evaluations/">Evaluations</a><a href="/topics/">Topics</a><a href="/method/">Method</a><a href="/about/">About</a></nav>
    <div class="header-tools"><a class="static-search" href="/#/evals">Search <kbd>Ctrl K</kbd></a><button class="theme-toggle" data-static-theme type="button" aria-label="Switch theme"><span data-theme-label>Dark</span></button></div>
  </div></header>
  <main id="content" class="discovery-main">${content}</main>
  <footer class="site-footer"><div class="footer-inner"><div><strong>FronteraEval</strong><span>Find the evaluation. Read the evidence. Follow the source.</span></div><div><a href="/data-info/">Open data</a><a href="/feed.xml">Updates</a><a href="https://github.com/apolmig/fronteraeval" rel="noopener">GitHub ↗</a></div></div></footer>
</body></html>`;
}

function sourceList(record) {
  const links = sourceLinks(record);
  if (!links.length) return '<p>No upstream link is currently resolved. Treat this record as discovery metadata only.</p>';
  return `<ul class="source-list">${links.map((link) => `<li><a href="${esc(link.url)}" rel="noopener">${esc(link.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>`;
}

await Promise.all(['evaluations','topics','about','method','data-info'].map((dir) => rm(`${SITE}/${dir}`, {recursive:true, force:true})));
await mkdir(`${SITE}/evaluations`, {recursive:true});
await mkdir(`${SITE}/topics`, {recursive:true});

const recordItems = [];
for (const record of records) {
  const slug = safeSlug(record);
  const canonical = recordUrl(record);
  const description = record.measures && !/^Not independently assessed/.test(record.measures)
    ? `${record.measures} ${record.does_not_measure ? `It does not by itself establish ${record.does_not_measure.toLowerCase()}` : ''}`
    : record.description || `Source-linked catalogue record for ${record.name}.`;
  const reviewed = record.review_status === 'reviewed';
  const modified = validDate(record.editorial_reviewed_at || record.last_source_check || generatedAt);
  const body = `<article class="discovery-record" itemscope itemtype="https://schema.org/CreativeWork">
    <meta itemprop="url" content="${esc(canonical)}"><meta itemprop="dateModified" content="${esc(modified)}">
    <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/evaluations/">Evaluations</a><span>/</span><span>${esc(record.name)}</span></nav>
    <header class="discovery-record-head"><div><p class="eyebrow">${esc(record.record_type || 'Evaluation record')} · ${reviewed ? 'Documentary review' : 'Source-linked discovery'}</p><h1 itemprop="name">${esc(record.name)}</h1><p class="lede" itemprop="description">${esc(record.description || description)}</p></div><a class="primary-cta" href="${esc(appUrl(record))}">Open interactive record →</a></header>
    <div class="record-facts"><span><strong>Origin</strong>${esc(record.developer?.name || record.organisation || 'Not resolved')}</span><span><strong>Topics</strong>${esc((record.topics || []).map(topicLabel).join(' · ') || 'Unclassified')}</span><span><strong>Status</strong>${esc(reviewed ? 'Reviewed' : record.review_status || 'Imported')}</span></div>
    <section class="claim-grid"><div><h2>Can support</h2><p>${esc(record.measures || 'Discovery of the upstream evaluation and its implementation.')}</p></div><div><h2>Cannot support by itself</h2><p>${esc(record.does_not_measure || 'Substantive capability, safety, deployment, or harm claims without reading and checking the underlying protocol.')}</p></div></section>
    ${reviewed ? `<section><h2>Decision use</h2><div class="claim-grid"><div><h3>Best used for</h3><p>${esc(record.best_for)}</p></div><div><h3>Not enough for</h3><p>${esc(record.not_sufficient_for)}</p></div></div></section>` : `<aside class="discovery-notice"><strong>Discovery record.</strong> FronteraEval has not independently reviewed this record’s construct, protocol, or inference boundary.</aside>`}
    <section><h2>Original sources</h2>${sourceList(record)}</section>
    <section class="share-row"><button type="button" data-share-url="${esc(canonical)}" data-share-title="${esc(record.name)}">Share this record</button><a href="${esc(appUrl(record))}">Search related evaluations</a></section>
  </article>`;
  const html = `${head({title:`${record.name} — FronteraEval`, description, canonical, type:'article', modified})}${chrome(body)}`;
  await mkdir(`${SITE}/evaluations/${slug}`, {recursive:true});
  await writeFile(`${SITE}/evaluations/${slug}/index.html`, html);
  recordItems.push(`<li><a href="/evaluations/${slug}/"><strong>${esc(record.name)}</strong><span>${esc(record.developer?.name || record.organisation || '')}</span><small>${esc((record.topics || []).map(topicLabel).join(' · '))}</small></a></li>`);
}

const catalogueDescription = `A source-linked, evolving catalogue of ${records.length} frontier AI evaluation records, with papers, implementations, provenance, evidence limits, and documentary methodological reviews.`;
await writeFile(`${SITE}/evaluations/index.html`, `${head({title:'Frontier AI evaluations — FronteraEval', description:catalogueDescription, canonical:`${BASE}/evaluations/`})}${chrome(`<section class="discovery-index" itemscope itemtype="https://schema.org/CollectionPage"><p class="eyebrow">Source-linked catalogue</p><h1 itemprop="name">Frontier AI evaluations</h1><p class="lede" itemprop="description">${esc(catalogueDescription)}</p><p><a class="primary-cta" href="/#/evals">Open semantic search and filters →</a></p><ul class="record-index">${recordItems.join('')}</ul></section>`)}`);

const sitemapUrls = [
  {url:`${BASE}/`, modified:generatedAt.slice(0,10), priority:'1.0'},
  {url:`${BASE}/evaluations/`, modified:generatedAt.slice(0,10), priority:'0.9'},
  {url:`${BASE}/topics/`, modified:generatedAt.slice(0,10), priority:'0.8'},
  {url:`${BASE}/about/`, modified:generatedAt.slice(0,10), priority:'0.6'},
  {url:`${BASE}/method/`, modified:generatedAt.slice(0,10), priority:'0.7'},
  {url:`${BASE}/data-info/`, modified:generatedAt.slice(0,10), priority:'0.6'}
];

const topicItems = [];
for (const [id, topic] of Object.entries(topics)) {
  const topicRecords = records.filter((record) => (record.topics || []).includes(id));
  const canonical = `${BASE}/topics/${id}/`;
  const description = `${topic.definition || topic.label}. Browse ${topicRecords.length} source-linked frontier AI evaluation records and their evidence limits.`;
  const list = topicRecords.map((record) => `<li><a href="/evaluations/${safeSlug(record)}/"><strong>${esc(record.name)}</strong><span>${esc(record.developer?.name || record.organisation || '')}</span></a></li>`).join('');
  await mkdir(`${SITE}/topics/${id}`, {recursive:true});
  await writeFile(`${SITE}/topics/${id}/index.html`, `${head({title:`${topic.label} evaluations — FronteraEval`, description, canonical})}${chrome(`<section class="discovery-index"><nav class="breadcrumbs"><a href="/topics/">Topics</a><span>/</span><span>${esc(topic.label)}</span></nav><p class="eyebrow">Evaluation topic</p><h1>${esc(topic.label)}</h1><p class="lede">${esc(topic.definition || '')}</p><p class="scope-note">${topicRecords.length} records are tagged here. Inclusion does not establish construct equivalence, completeness, or comparability.</p><ul class="record-index">${list}</ul></section>`)}`);
  topicItems.push(`<li><a href="/topics/${esc(id)}/"><strong>${esc(topic.label)}</strong><span>${topicRecords.length} records</span><small>${esc(topic.definition || '')}</small></a></li>`);
  sitemapUrls.push({url:canonical, modified:generatedAt.slice(0,10), priority:'0.7'});
}
await writeFile(`${SITE}/topics/index.html`, `${head({title:'Frontier AI evaluation topics — FronteraEval', description:'Browse frontier AI evaluations by capability, risk, safeguard, and evaluation-integrity topic.', canonical:`${BASE}/topics/`})}${chrome(`<section class="discovery-index"><p class="eyebrow">Risk and capability map</p><h1>Evaluation topics</h1><p class="lede">Topics help with discovery. They do not imply that the included evaluations measure the same construct.</p><ul class="record-index topic-index">${topicItems.join('')}</ul></section>`)}`);

const reviewedCount = records.filter((record) => record.review_status === 'reviewed').length;
await Promise.all([
  mkdir(`${SITE}/about`, {recursive:true}), mkdir(`${SITE}/method`, {recursive:true}), mkdir(`${SITE}/data-info`, {recursive:true})
]);
await writeFile(`${SITE}/about/index.html`, `${head({title:'About FronteraEval', description:'Why FronteraEval exists, what it tries to make easier, and the limits of its source-linked catalogue and documentary reviews.', canonical:`${BASE}/about/`})}${chrome(`<article class="discovery-prose"><p class="eyebrow">About</p><h1>A practical map, not a final authority.</h1><p>FronteraEval began during <a href="https://miguelguerrero.eu/" rel="me">Miguel Guerrero’s</a> Cambridge ERA research fellowship. Finding a current, comprehensive, methodologically careful, and simple point of entry into frontier-AI evaluations was harder than it should have been.</p><p>FronteraEval is an attempt to reduce that friction. It does not claim to be complete, neutral, or definitive. Upstream metadata changes; classifications involve judgement; and most of the ${records.length} catalogue records are source-linked discovery entries rather than independent reviews.</p><p>${reviewedCount} records currently contain bounded documentary methodological assessments. These are not experimental replications. Important claims should still be checked against the original paper, code, task version, model-system configuration, scaffold, and evaluation date.</p><p>Corrections and missing evaluations are welcome through <a href="https://github.com/apolmig/fronteraeval/issues">GitHub issues</a>.</p></article>`)}`);
await writeFile(`${SITE}/method/index.html`, `${head({title:'Method and evidence boundaries — FronteraEval', description:'How FronteraEval separates source discovery, documentary review, evidence reach, comparability, and independent replication.', canonical:`${BASE}/method/`})}${chrome(`<article class="discovery-prose"><p class="eyebrow">Method</p><h1>What an evaluation result can—and cannot—establish.</h1><h2>Three record states</h2><p><strong>Imported</strong> records support discovery. <strong>Catalogued</strong> records have resolved primary sources. <strong>Reviewed</strong> records add a bounded documentary interpretation.</p><h2>Documentary review is not replication</h2><p>FronteraEval does not represent upstream results as independently reproduced. A result remains conditional on the exact protocol, task distribution, implementation, model-system configuration, elicitation, scaffold, tools, budget, and scoring method.</p><h2>Comparability is gated</h2><p>Shared topics do not imply shared constructs. Scores should only be compared when the target construct, protocol, model system, elicitation, and outcome metric align.</p><h2>Evidence reach</h2><p>Controlled model behaviour does not by itself establish deployment, human effects, or aggregate societal outcomes.</p><p><a href="https://github.com/apolmig/fronteraeval/blob/main/SOURCE_METHODOLOGY.md">Read the source methodology ↗</a></p></article>`)}`);
await writeFile(`${SITE}/data-info/index.html`, `${head({title:'Open data — FronteraEval', description:'Download FronteraEval catalogue metadata, source-resolution audits, freshness markers, and machine-readable evaluation records.', canonical:`${BASE}/data-info/`})}${chrome(`<article class="discovery-prose"><p class="eyebrow">Open data</p><h1>Reuse the catalogue with its limits intact.</h1><p>FronteraEval publishes machine-readable data for research and analysis. Preserve provenance, record state, and inference limits when reusing it.</p><ul class="download-list"><li><a href="/data/catalog.json">JSON catalogue</a></li><li><a href="/data/catalog.csv">CSV catalogue</a></li><li><a href="/data/source-audit.json">Source-resolution audit</a></li><li><a href="/data/source-link-audit.json">Source-link health</a></li><li><a href="/data/weekly-refresh.json">Latest refresh marker</a></li></ul><p>${records.length} records · ${reviewedCount} documentary reviews · 0 independent replications claimed.</p></article>`)}`);

for (const record of records) sitemapUrls.push({url:recordUrl(record), modified:validDate(record.editorial_reviewed_at || record.last_source_check || generatedAt), priority:record.review_status === 'reviewed' ? '0.8' : '0.6'});
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((item) => `  <url><loc>${xml(item.url)}</loc><lastmod>${xml(item.modified)}</lastmod><changefreq>weekly</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>\n`;
await writeFile(`${SITE}/sitemap.xml`, sitemap);

const feedRecords = [...records].sort((a,b) => validDate(b.editorial_reviewed_at || b.last_source_check).localeCompare(validDate(a.editorial_reviewed_at || a.last_source_check))).slice(0,50);
const feed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>FronteraEval updates</title><id>${BASE}/</id><link href="${BASE}/feed.xml" rel="self"/><link href="${BASE}/"/><updated>${xml(generatedAt)}</updated><subtitle>New and updated frontier AI evaluation records.</subtitle>${feedRecords.map((record) => `<entry><title>${xml(record.name)}</title><id>${xml(recordUrl(record))}</id><link href="${xml(recordUrl(record))}"/><updated>${xml(validDate(record.editorial_reviewed_at || record.last_source_check || generatedAt))}T00:00:00Z</updated><summary>${xml(trim(record.description || record.measures, 500))}</summary></entry>`).join('')}</feed>\n`;
await writeFile(`${SITE}/feed.xml`, feed);

await writeFile(`${SITE}/opensearch.xml`, `<?xml version="1.0" encoding="UTF-8"?><OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/"><ShortName>FronteraEval</ShortName><Description>Search frontier AI evaluations</Description><InputEncoding>UTF-8</InputEncoding><Image height="64" width="64" type="image/png">${BASE}/icon-192.png</Image><Url type="text/html" template="${BASE}/#/evals?q={searchTerms}"/><Url type="application/opensearchdescription+xml" rel="self" template="${BASE}/opensearch.xml"/></OpenSearchDescription>\n`);

const reviewed = records.filter((record) => record.review_status === 'reviewed');
await writeFile(`${SITE}/llms.txt`, `# FronteraEval\n\n> A source-linked, evolving catalogue of frontier AI evaluations, designed to clarify what each evaluation can and cannot establish.\n\n- Website: ${BASE}/\n- Indexable catalogue: ${BASE}/evaluations/\n- Topics: ${BASE}/topics/\n- Method: ${BASE}/method/\n- About and epistemic limits: ${BASE}/about/\n- JSON data: ${BASE}/data/catalog.json\n- Source code: https://github.com/apolmig/fronteraeval\n\nThe catalogue contains ${records.length} records and ${reviewedCount} documentary methodological reviews. Documentary review is not independent experimental replication.\n`);
await writeFile(`${SITE}/llms-full.txt`, `# FronteraEval catalogue\n\nGenerated: ${generatedAt}\nRecords: ${records.length}\nDocumentary reviews: ${reviewedCount}\nIndependent replications: 0\n\n## Reviewed records\n\n${reviewed.map((record) => `### ${record.name}\n- URL: ${recordUrl(record)}\n- Origin: ${record.developer?.name || record.organisation || 'Not resolved'}\n- Can support: ${record.measures}\n- Cannot support by itself: ${record.does_not_measure}\n- Primary source: ${preferredSource(record) || 'Not resolved'}\n`).join('\n')}\n## Complete index\n\n${records.map((record) => `- [${record.name}](${recordUrl(record)}) — ${(record.topics || []).map(topicLabel).join(', ')}`).join('\n')}\n`);

await writeFile(`${SITE}/site.webmanifest`, JSON.stringify({name:'FronteraEval',short_name:'FronteraEval',description:'A source-linked map of frontier AI evaluations and their evidence limits.',start_url:'/',display:'standalone',background_color:'#f7f5ef',theme_color:'#a13427',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}]}, null, 2));
await writeFile(`${SITE}/indexnow-urls.json`, JSON.stringify({host:'fronteraeval.org',key:'8fc7bf2d9e114784bc660d4092ef8f35',keyLocation:`${BASE}/8fc7bf2d9e114784bc660d4092ef8f35.txt`,urlList:sitemapUrls.map((item) => item.url)}, null, 2));

console.log(JSON.stringify({records:records.length, reviewed:reviewedCount, topics:Object.keys(topics).length, sitemap_urls:sitemapUrls.length}));
