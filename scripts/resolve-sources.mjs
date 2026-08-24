import { readFile, writeFile } from "node:fs/promises";

const CATALOG_PATH = "site/data/catalog.json";
const REGISTRY_PATH = "data/source-registry.json";
const OVERRIDES_PATH = "data/source-overrides.json";
const ALIASES_PATH = "data/entity-aliases.json";
const USER_AGENT = "FronteraEval/0.7 (+https://fronteraeval.org; source-resolution)";

const [catalog, overrides, aliases, previousRegistry] = await Promise.all([
  readFile(CATALOG_PATH, "utf8").then(JSON.parse),
  readFile(OVERRIDES_PATH, "utf8").then(JSON.parse),
  readFile(ALIASES_PATH, "utf8").then(JSON.parse),
  readFile(REGISTRY_PATH, "utf8").then(JSON.parse).catch(() => ({ entries: {} }))
]);

const generatedAt = new Date().toISOString();
const previousEntries = previousRegistry.entries || {};
const githubAliases = aliases.github_owners || {};
const huggingFaceAliases = aliases.huggingface_namespaces || {};
const domainAliases = aliases.domains || {};
const ignoredRepositories = new Set(aliases.ignored_repositories || []);
const ignoredOwners = new Set(aliases.ignored_owners || []);
const manualEntries = overrides.entries || {};

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function safeURL(value) {
  const raw = clean(value).replace(/[?#]$/, "");
  if (!raw || /\{[^}]+\}/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function dedupeStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  return values.filter(value => {
    const key = keyFn(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function githubCoordinates(value) {
  const raw = clean(value);
  const patterns = [
    /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/i,
    /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/#?]+)/i,
    /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/#?]+)/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
  }
  return null;
}

function huggingFaceCoordinates(value) {
  const match = clean(value).match(/^https:\/\/huggingface\.co\/(?:datasets\/|models\/)?([^/]+)\/([^/#?]+)/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function humanise(value) {
  return clean(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase()) || "Unknown source";
}

function entityFromURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  const github = githubCoordinates(url);
  if (github) {
    const repository = `${github.owner}/${github.repo}`;
    if (ignoredRepositories.has(repository) || ignoredOwners.has(github.owner)) return null;
    return {
      name: githubAliases[github.owner] || humanise(github.owner),
      organization: githubAliases[github.owner] || humanise(github.owner),
      owner: github.owner,
      repository,
      url: `https://github.com/${repository}`
    };
  }
  const hf = huggingFaceCoordinates(url);
  if (hf) {
    return {
      name: huggingFaceAliases[hf.owner] || humanise(hf.owner),
      organization: huggingFaceAliases[hf.owner] || humanise(hf.owner),
      owner: hf.owner,
      repository: `${hf.owner}/${hf.repo}`,
      url
    };
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const matched = Object.entries(domainAliases).find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    return {
      name: matched?.[1] || hostname,
      organization: matched?.[1] || hostname,
      url
    };
  } catch {
    return null;
  }
}

function sourceKey(record) {
  if (record.source_type === "inspect-internal") {
    const source = clean(record.metadata_url || record.source_url);
    const module = source.match(/\/src\/inspect_evals\/([^/?#]+)/)?.[1];
    return `inspect-family:${module || record.id.split(":").slice(1).join(":")}`;
  }
  return record.id;
}

function recordType(records) {
  const first = records[0];
  if (first.source_type === "inspect-internal") return records.length > 1 ? "evaluation-family" : "evaluation-task";
  if (first.source_type === "inspect-register") return "evaluation-package";
  const canonicalTypes = {
    "canonical:openai-evals": "evaluation-framework",
    "canonical:lm-evaluation-harness": "evaluation-framework",
    "canonical:inspect-ai": "evaluation-framework",
    "canonical:webarena": "evaluation-environment",
    "canonical:visualwebarena": "evaluation-environment",
    "canonical:workarena": "evaluation-environment",
    "canonical:agentdojo": "evaluation-environment",
    "canonical:agentboard": "evaluation-suite",
    "canonical:helm-safety": "evaluation-suite",
    "canonical:ailuminate": "evaluation-suite",
    "canonical:metr-time-horizons": "evaluation-methodology",
    "canonical:deepmind-dangerous-capabilities": "evaluation-suite"
  };
  return canonicalTypes[first.id] || "evaluation-resource";
}

function isPaperOptional(type) {
  return ["evaluation-framework", "evaluation-environment", "evaluation-suite", "evaluation-methodology"].includes(type);
}

function arxivID(value) {
  const url = safeURL(value);
  if (!url) return null;
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?$/i);
  return match ? match[1].replace(/v\d+$/i, "") : null;
}

function normalisePaperURL(value) {
  const url = safeURL(value);
  const id = arxivID(url);
  return id ? `https://arxiv.org/abs/${id}` : url;
}

function collectURLs(records, kinds = []) {
  const accepted = new Set(kinds);
  const urls = [];
  for (const record of records) {
    for (const link of record.links || []) {
      if (accepted.size && !accepted.has(clean(link.kind).toLowerCase())) continue;
      const url = safeURL(link.url);
      if (url) urls.push(url);
    }
  }
  return dedupeStrings(urls);
}

function collectPaperURLs(records, override) {
  return dedupeStrings([
    ...asArray(override?.papers).map(item => normalisePaperURL(item?.url)),
    ...records.map(record => normalisePaperURL(record.paper_url)),
    ...collectURLs(records, ["paper"]),
    ...records.map(record => normalisePaperURL(record.arxiv))
  ].filter(Boolean));
}

function collectImplementationURLs(records, override) {
  const candidates = [
    safeURL(override?.implementation?.url),
    ...records.map(record => safeURL(record.code_url)),
    ...collectURLs(records, ["code", "implementation", "repository"]),
    ...records.flatMap(record => asArray(record.external_assets).map(asset => {
      const github = githubCoordinates(asset?.source);
      return github ? `https://github.com/${github.owner}/${github.repo}` : safeURL(asset?.source);
    }))
  ].filter(Boolean);
  return dedupeStrings(candidates).filter(url => {
    const github = githubCoordinates(url);
    return !github || (!ignoredOwners.has(github.owner) && !ignoredRepositories.has(`${github.owner}/${github.repo}`));
  });
}

function collectDatasets(records) {
  const candidates = [];
  for (const record of records) {
    if (safeURL(record.dataset_url)) candidates.push(record.dataset_url);
    for (const link of record.links || []) if (clean(link.kind).toLowerCase() === "dataset" && safeURL(link.url)) candidates.push(link.url);
    for (const asset of record.external_assets || []) {
      const source = clean(asset?.source);
      if (/^https:\/\/huggingface\.co\//i.test(source) && safeURL(source)) candidates.push(source);
      if (clean(asset?.type) === "huggingface" && source && !source.startsWith("http")) candidates.push(`https://huggingface.co/datasets/${source}`);
    }
  }
  return dedupeStrings(candidates).map(url => ({
    url,
    provider: entityFromURL(url)?.name || null
  }));
}

function inspectProvenance(records) {
  const first = records[0];
  if (first.source_type === "inspect-internal") {
    return {
      role: "maintained_implementation",
      role_label: "Inspect implementation",
      steward: "UK AI Security Institute",
      url: safeURL(first.metadata_url || first.source_url)
    };
  }
  if (first.source_type === "inspect-register") {
    return {
      role: "registry_entry",
      role_label: "Inspect Evals Register entry",
      steward: "UK AI Security Institute",
      url: safeURL(first.registry_url || first.source_url)
    };
  }
  return null;
}

function decodeXML(value) {
  return clean(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseArxivAtom(xml) {
  const results = new Map();
  for (const block of String(xml).split("<entry>").slice(1)) {
    const idURL = block.match(/<id>([^<]+)<\/id>/)?.[1];
    const id = arxivID(idURL);
    if (!id) continue;
    const title = decodeXML(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const authors = [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
      .map(match => decodeXML(match[1]))
      .filter(Boolean);
    results.set(id, { title: title || null, authors: dedupeStrings(authors), organizations: [], source: "arxiv-api" });
  }
  return results;
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function semanticScholarMetadata(ids) {
  const output = new Map();
  const chunks = [];
  for (let index = 0; index < ids.length; index += 100) chunks.push(ids.slice(index, index + 100));
  for (const chunk of chunks) {
    try {
      const data = await fetchJSON(
        "https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,authors,authors.affiliations,externalIds,url",
        {
          method: "POST",
          headers: { "content-type": "application/json", ...(process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : {}) },
          body: JSON.stringify({ ids: chunk.map(id => `ARXIV:${id}`) })
        }
      );
      data.forEach((paper, index) => {
        if (!paper) return;
        const authors = asArray(paper.authors).map(author => clean(author?.name)).filter(Boolean);
        const organizations = dedupeStrings(asArray(paper.authors).flatMap(author => asArray(author?.affiliations)));
        output.set(chunk[index], {
          title: clean(paper.title) || null,
          authors,
          organizations,
          source: "semantic-scholar"
        });
      });
    } catch (error) {
      console.warn(`Semantic Scholar metadata unavailable: ${error.message}`);
      break;
    }
  }
  return output;
}

async function arxivMetadata(ids) {
  const output = new Map();
  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20);
    try {
      const xml = await fetchText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(chunk.join(","))}&max_results=${chunk.length}`);
      for (const [id, value] of parseArxivAtom(xml)) output.set(id, value);
    } catch (error) {
      console.warn(`arXiv metadata unavailable for ${chunk.join(",")}: ${error.message}`);
    }
    if (index + 20 < ids.length) await new Promise(resolve => setTimeout(resolve, 1100));
  }
  return output;
}

const groups = new Map();
for (const record of catalog.records) {
  const key = sourceKey(record);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(record);
}

const paperURLsByGroup = new Map();
const allArxivIDs = new Set();
for (const [key, records] of groups) {
  const urls = collectPaperURLs(records, manualEntries[key]);
  paperURLsByGroup.set(key, urls);
  for (const url of urls) {
    const id = arxivID(url);
    if (id) allArxivIDs.add(id);
  }
}

const ids = [...allArxivIDs];
const previousPaperMetadata = new Map();
for (const entry of Object.values(previousEntries)) {
  for (const paper of entry.papers || []) {
    if (paper.arxiv_id && (paper.title || paper.authors?.length)) previousPaperMetadata.set(paper.arxiv_id, paper);
  }
}

const missingIDs = ids.filter(id => !previousPaperMetadata.has(id));
const semanticMetadata = await semanticScholarMetadata(missingIDs);
const remainingIDs = missingIDs.filter(id => !semanticMetadata.has(id));
const arxivMetadataMap = await arxivMetadata(remainingIDs);

function paperMetadata(url, overridePaper = {}) {
  const normalizedURL = normalisePaperURL(url);
  const id = arxivID(normalizedURL);
  const cached = id ? previousPaperMetadata.get(id) : null;
  const resolved = id ? semanticMetadata.get(id) || arxivMetadataMap.get(id) || cached : null;
  return {
    status: "present",
    url: normalizedURL,
    arxiv_id: id,
    title: clean(overridePaper.title || resolved?.title) || null,
    authors: dedupeStrings(asArray(overridePaper.authors).length ? overridePaper.authors : asArray(resolved?.authors)),
    organizations: dedupeStrings(asArray(overridePaper.organizations).length ? overridePaper.organizations : asArray(resolved?.organizations)),
    source: clean(overridePaper.source || resolved?.source || (id ? "associated-arxiv-record" : "upstream-metadata")),
    metadata_status: resolved || overridePaper.title || overridePaper.authors?.length ? "resolved" : "pending"
  };
}

function originRoleLabel(role) {
  return ({
    evaluation_developer: "Evaluation developed by",
    original_research: "Original research by",
    original_benchmark_source: "Original benchmark source",
    paper_authors: "Original paper authors",
    implementation_maintainer: "Reference implementation by",
    framework_developer: "Framework developed by",
    suite_developer: "Suite developed by",
    environment_developer: "Environment developed by",
    methodology_developer: "Methodology developed by",
    unknown: "Origin not verified"
  })[role] || "Source attribution";
}

function canonicalRole(type) {
  if (type === "evaluation-framework") return "framework_developer";
  if (type === "evaluation-suite") return "suite_developer";
  if (type === "evaluation-environment") return "environment_developer";
  if (type === "evaluation-methodology") return "methodology_developer";
  return "evaluation_developer";
}

function originFromPaper(paper) {
  const authorLabel = paper.authors.length
    ? `${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}`
    : "Associated paper authors";
  return {
    name: authorLabel,
    organization: paper.organizations.length ? paper.organizations.join("; ") : null,
    organizations: paper.organizations,
    entity_type: "authors",
    role: "paper_authors",
    role_label: originRoleLabel("paper_authors"),
    confidence: paper.metadata_status === "resolved" ? "paper-metadata" : "paper-linked",
    evidence_url: paper.url
  };
}

const entries = {};
const statusCounts = { verified: 0, "source-derived": 0, "paper-only": 0, "host-only": 0, unresolved: 0 };
const paperCounts = { present: 0, "not-found": 0, "not-applicable": 0 };
let papersResolved = 0;
let papersPending = 0;

for (const [key, records] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const first = records[0];
  const override = manualEntries[key] || {};
  const type = clean(override.record_type) || recordType(records);
  const paperURLs = paperURLsByGroup.get(key) || [];
  const papers = paperURLs.map(url => {
    const supplied = asArray(override.papers).find(item => normalisePaperURL(item?.url) === normalisePaperURL(url)) || {};
    return paperMetadata(url, supplied);
  });
  const implementations = collectImplementationURLs(records, override);
  const implementationURL = safeURL(override?.implementation?.url) || implementations[0] || null;
  const implementationEntity = entityFromURL(implementationURL);
  const inspect = inspectProvenance(records);
  const datasets = collectDatasets(records);
  const officialPages = dedupeStrings([
    ...asArray(override.official_pages).map(safeURL),
    ...records.filter(record => record.source_type === "canonical-source").map(record => safeURL(record.source_url)),
    safeURL(override?.origin?.evidence_url)
  ].filter(Boolean));

  let origin;
  let status;
  let method;

  if (override.origin?.name) {
    origin = {
      ...override.origin,
      name: clean(override.origin.name),
      organization: clean(override.origin.organization) || null,
      organizations: dedupeStrings(asArray(override.origin.organizations || override.origin.organization)),
      role: clean(override.origin.role) || "evaluation_developer",
      role_label: clean(override.origin.role_label) || originRoleLabel(override.origin.role || "evaluation_developer"),
      evidence_url: safeURL(override.origin.evidence_url) || papers[0]?.url || implementationURL || inspect?.url,
      confidence: clean(override.origin.confidence) || "verified"
    };
    status = origin.confidence === "verified" ? "verified" : "source-derived";
    method = "curated-primary-sources";
  } else if (first.source_type === "canonical-source") {
    const role = canonicalRole(type);
    const name = clean(first.organisation) || entityFromURL(first.source_url)?.name || "Canonical source owner";
    origin = {
      name,
      organization: name,
      organizations: [name],
      entity_type: "organization",
      role,
      role_label: originRoleLabel(role),
      confidence: "curated",
      evidence_url: safeURL(first.source_url)
    };
    status = "verified";
    method = "curated-canonical-source";
  } else if (papers.length) {
    origin = originFromPaper(papers[0]);
    status = "paper-only";
    method = "associated-paper-metadata";
  } else if (implementationEntity) {
    origin = {
      name: implementationEntity.name,
      organization: implementationEntity.organization,
      organizations: [implementationEntity.organization],
      entity_type: "organization-or-maintainer",
      role: "implementation_maintainer",
      role_label: originRoleLabel("implementation_maintainer"),
      confidence: "source-derived",
      evidence_url: implementationEntity.url
    };
    status = "source-derived";
    method = "upstream-implementation-owner";
  } else if (inspect?.url) {
    origin = {
      name: "Origin not verified",
      organization: null,
      organizations: [],
      entity_type: "unknown",
      role: "unknown",
      role_label: originRoleLabel("unknown"),
      confidence: "host-only",
      evidence_url: inspect.url
    };
    status = "host-only";
    method = "inspect-provenance-only";
  } else {
    origin = {
      name: "Origin not verified",
      organization: null,
      organizations: [],
      entity_type: "unknown",
      role: "unknown",
      role_label: originRoleLabel("unknown"),
      confidence: "unresolved",
      evidence_url: safeURL(first.source_url)
    };
    status = "unresolved";
    method = "unresolved";
  }

  const paperStatus = papers.length ? "present" : clean(override.paper_status) || (isPaperOptional(type) ? "not-applicable" : "not-found");
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  paperCounts[paperStatus] = (paperCounts[paperStatus] || 0) + 1;
  for (const paper of papers) paper.metadata_status === "resolved" ? papersResolved++ : papersPending++;

  entries[key] = {
    source_key: key,
    record_ids: records.map(record => record.id).sort(),
    family_title: clean(first.family_title || first.name) || key,
    record_type: type,
    status,
    resolution_method: method,
    origin,
    paper_status: paperStatus,
    papers,
    implementation: implementationURL ? {
      url: implementationURL,
      owner: clean(override?.implementation?.owner) || implementationEntity?.name || null,
      relation: clean(override?.implementation?.relation) || "reference_or_upstream_implementation",
      confidence: clean(override?.implementation?.confidence) || (implementationEntity ? "source-derived" : "linked")
    } : null,
    inspect,
    datasets,
    official_pages: officialPages,
    note: clean(override.note) || null,
    source_inputs: {
      paper_urls: paperURLs,
      implementation_candidates: implementations,
      inspect_source: inspect?.url || null
    }
  };
}

const registry = {
  schema_version: "2.1.0",
  generated_at: generatedAt,
  inspect_source_commit: catalog.inspect_source_commit,
  policy: "Hosting and registry stewardship are provenance, not authorship. Paper affiliations are reported separately from evaluation-developer attribution. Unknown origin remains explicit.",
  stats: {
    source_groups: Object.keys(entries).length,
    records: catalog.records.length,
    status: statusCounts,
    paper_status: paperCounts,
    papers_resolved: papersResolved,
    papers_metadata_pending: papersPending
  },
  entries
};

await writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify(registry.stats));
