import { readFile, writeFile } from "node:fs/promises";

const catalogPath = "site/data/catalog.json";
const csvPath = "site/data/catalog.csv";
const freshnessPath = "site/data/freshness.json";
const overridesPath = "data/attribution-overrides.json";

const [catalog, overrides] = await Promise.all([
  readFile(catalogPath, "utf8").then(JSON.parse),
  readFile(overridesPath, "utf8").then(JSON.parse)
]);

const ROLE_LABELS = {
  evaluation_developer: "Evaluation developed by",
  original_research: "Original research by",
  original_authors: "Original authors",
  original_benchmark_source: "Original benchmark source",
  reference_implementation: "Reference implementation by",
  implementation_maintainer: "Implementation maintained by",
  inspect_implementation: "Inspect implementation hosted by",
  inspect_registry: "Listed in",
  paper: "Paper",
  dataset: "Dataset",
  dataset_provider: "Dataset provided by",
  official_source: "Official source",
  implementation_contributors: "Implementation contributors"
};

const OWNER_LABELS = {
  AlignmentResearch: "FAR AI",
  farai: "FAR AI",
  FARAI: "FAR AI",
  METR: "METR",
  openai: "OpenAI",
  anthropics: "Anthropic",
  Anthropic: "Anthropic",
  centerforaisafety: "Center for AI Safety",
  cais: "Center for AI Safety",
  "cais-research": "Center for AI Safety",
  EpochAI: "Epoch AI",
  epochai: "Epoch AI",
  "stanford-crfm": "Stanford CRFM",
  EleutherAI: "EleutherAI",
  ServiceNow: "ServiceNow Research",
  "ServiceNow-Research": "ServiceNow Research",
  "meta-llama": "Meta",
  google: "Google",
  googledeepmind: "Google DeepMind",
  "google-deepmind": "Google DeepMind",
  UKGovernmentBEIS: "Inspect Evals",
  "laude-institute": "Laude Institute",
  "arcprize": "ARC Prize Foundation",
  "thu-coai": "THU-COAI",
  "PKU-Alignment": "PKU-Alignment",
  SierraResearch: "Sierra Research"
};

const DOMAIN_LABELS = [
  [/far\.ai$/i, "FAR AI"],
  [/metr\.org$/i, "METR"],
  [/anthropic\.com$/i, "Anthropic"],
  [/openai\.com$/i, "OpenAI"],
  [/epoch\.ai$/i, "Epoch AI"],
  [/mlcommons\.org$/i, "MLCommons"],
  [/deepmind\.google$/i, "Google DeepMind"],
  [/wmdp\.ai$/i, "Center for AI Safety"],
  [/inspect\.aisi\.org\.uk$/i, "Inspect AI"],
  [/aisi\.org\.uk$/i, "UK AI Security Institute"]
];

const PRIMARY_ROLE_ORDER = [
  "evaluation_developer",
  "original_research",
  "original_benchmark_source",
  "original_authors",
  "reference_implementation",
  "implementation_maintainer",
  "paper",
  "official_source",
  "inspect_implementation",
  "inspect_registry"
];

function clean(value) {
  return String(value ?? "").trim();
}

function normaliseURL(value) {
  const raw = clean(value).replace(/\?$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function githubCoordinates(value) {
  const raw = clean(value);
  if (!raw) return null;
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
  const raw = clean(value);
  const match = raw.match(/^https:\/\/huggingface\.co\/(?:datasets\/|models\/)?([^/]+)\/([^/#?]+)/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function humanise(value) {
  const source = clean(value).replace(/[-_]+/g, " ");
  if (!source) return "Unknown source";
  return source.replace(/\b\w/g, character => character.toUpperCase());
}

function entityFromURL(value) {
  const url = normaliseURL(value);
  if (!url) return null;

  const github = githubCoordinates(url);
  if (github) {
    return {
      name: OWNER_LABELS[github.owner] || humanise(github.owner),
      repository: `${github.owner}/${github.repo}`,
      url: `https://github.com/${github.owner}/${github.repo}`
    };
  }

  const huggingFace = huggingFaceCoordinates(url);
  if (huggingFace) {
    return {
      name: OWNER_LABELS[huggingFace.owner] || humanise(huggingFace.owner),
      repository: `${huggingFace.owner}/${huggingFace.repo}`,
      url
    };
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const [pattern, label] of DOMAIN_LABELS) {
      if (pattern.test(hostname)) return { name: label, url };
    }
    return { name: hostname, url };
  } catch {
    return null;
  }
}

function role({ name, role: roleName, url = null, confidence = "source-derived", note = null, steward = null }) {
  const cleanName = clean(name);
  if (!cleanName || !ROLE_LABELS[roleName]) return null;
  return {
    role: roleName,
    role_label: ROLE_LABELS[roleName],
    name: cleanName,
    url: normaliseURL(url),
    confidence,
    ...(note ? { note: clean(note) } : {}),
    ...(steward ? { steward: clean(steward) } : {})
  };
}

function addRole(roles, candidate) {
  if (!candidate) return;
  const key = [candidate.role, candidate.name.toLowerCase(), candidate.url || ""].join("|");
  if (roles.some(item => [item.role, item.name.toLowerCase(), item.url || ""].join("|") === key)) return;
  roles.push(candidate);
}

function linkKind(link) {
  return clean(link?.kind).toLowerCase();
}

function findLinks(record, kinds) {
  const accepted = new Set(kinds);
  return (record.links || []).filter(link => accepted.has(linkKind(link)) && normaliseURL(link?.url));
}

function paperURL(record) {
  const paper = findLinks(record, ["paper"])[0];
  return normaliseURL(paper?.url || record.arxiv || record.paper_url);
}

function preferredImplementationLink(record) {
  return findLinks(record, ["implementation", "code", "repository"])
    .find(link => !normaliseURL(link.url)?.includes("UKGovernmentBEIS/inspect_evals")) || null;
}

function addSourceDerivedRoles(record, roles) {
  const paper = paperURL(record);
  if (paper) {
    addRole(roles, role({
      name: record.paper_title || record.full_title || record.name || "Associated paper",
      role: "paper",
      url: paper,
      confidence: "verified-source"
    }));
  }

  for (const link of findLinks(record, ["implementation", "code", "repository"])) {
    const entity = entityFromURL(link.url);
    if (!entity) continue;
    addRole(roles, role({
      name: entity.name,
      role: "reference_implementation",
      url: entity.url || link.url,
      confidence: "source-derived",
      note: entity.repository ? `Repository: ${entity.repository}` : null
    }));
  }

  for (const link of findLinks(record, ["dataset"])) {
    const entity = entityFromURL(link.url);
    addRole(roles, role({
      name: entity?.name || link.label || "Dataset provider",
      role: "dataset_provider",
      url: entity?.url || link.url,
      confidence: "source-derived"
    }));
  }

  if (record.source_type === "inspect-internal") {
    addRole(roles, role({
      name: "Inspect Evals",
      role: "inspect_implementation",
      url: record.source_url,
      confidence: "verified",
      steward: "UK AI Security Institute",
      note: "Maintained implementation and catalogue entry; not automatically the evaluation originator."
    }));
  }

  if (record.source_type === "inspect-register") {
    addRole(roles, role({
      name: "Inspect Evals Register",
      role: "inspect_registry",
      url: record.registry_url || record.source_url,
      confidence: "verified",
      steward: "UK AI Security Institute",
      note: "Distributed registry entry; the upstream repository remains the implementation source."
    }));
  }

  if (record.source_type === "canonical-source") {
    addRole(roles, role({
      name: record.organisation || entityFromURL(record.source_url)?.name || "Official source",
      role: "evaluation_developer",
      url: record.source_url,
      confidence: "curated"
    }));
    addRole(roles, role({
      name: record.organisation || entityFromURL(record.source_url)?.name || "Official source",
      role: "official_source",
      url: record.source_url,
      confidence: "curated"
    }));
  }

  if (Array.isArray(record.contributors) && record.contributors.length) {
    addRole(roles, role({
      name: record.contributors.join(", "),
      role: "implementation_contributors",
      url: record.source_url,
      confidence: "source-derived",
      note: "Contributors recorded by the implementation metadata; not assumed to be paper authors."
    }));
  }
}

function selectPrimary(record, roles, override) {
  if (override?.primary) {
    return role(override.primary);
  }

  if (record.source_type === "canonical-source") {
    const canonical = roles.find(item => item.role === "evaluation_developer");
    if (canonical) return canonical;
  }

  for (const roleName of PRIMARY_ROLE_ORDER) {
    const candidate = roles.find(item => item.role === roleName);
    if (!candidate) continue;
    if (roleName === "paper") {
      return role({
        name: entityFromURL(candidate.url)?.name || "Original paper authors",
        role: "original_authors",
        url: candidate.url,
        confidence: "source-derived",
        note: candidate.name
      });
    }
    return candidate;
  }

  return role({
    name: "Attribution pending",
    role: "original_authors",
    url: record.source_url,
    confidence: "unresolved"
  });
}

function preferredSource(record, primary, roles) {
  const priorities = [
    "evaluation_developer",
    "original_research",
    "original_benchmark_source",
    "paper",
    "reference_implementation",
    "official_source",
    "inspect_implementation",
    "inspect_registry"
  ];

  if (primary?.url) {
    return {
      label: primary.role_label,
      kind: primary.role,
      url: primary.url
    };
  }

  for (const roleName of priorities) {
    const candidate = roles.find(item => item.role === roleName && item.url);
    if (candidate) return { label: candidate.role_label, kind: candidate.role, url: candidate.url };
  }

  return {
    label: "Source record",
    kind: "source_record",
    url: record.source_url
  };
}

function attributionStatus(primary) {
  if (!primary) return "unresolved";
  if (["verified", "curated", "verified-source"].includes(primary.confidence)) return "verified";
  if (["source-derived"].includes(primary.confidence)) return "source-derived";
  if (["inspect_implementation", "inspect_registry"].includes(primary.role)) return "host-only";
  return "unresolved";
}

function quote(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const recordOverrides = overrides.records || {};
const roleCounts = {};
const statusCounts = { verified: 0, "source-derived": 0, "host-only": 0, unresolved: 0 };
let inspectHostRoles = 0;
let reviewedWithVerifiedAttribution = 0;
let reviewedWithFixedDate = 0;

for (const record of catalog.records) {
  const override = recordOverrides[record.id] || null;
  const roles = [];

  for (const supplied of override?.roles || []) addRole(roles, role(supplied));
  addSourceDerivedRoles(record, roles);

  const primary = selectPrimary(record, roles, override);
  addRole(roles, primary);

  roles.sort((left, right) => {
    const a = PRIMARY_ROLE_ORDER.indexOf(left.role);
    const b = PRIMARY_ROLE_ORDER.indexOf(right.role);
    return (a < 0 ? 99 : a) - (b < 0 ? 99 : b) || left.name.localeCompare(right.name);
  });

  const status = attributionStatus(primary);
  const preferred = preferredSource(record, primary, roles);

  record.attribution = {
    schema_version: "1.0.0",
    status,
    primary,
    roles,
    ...(override?.note ? { note: override.note } : {})
  };
  record.attribution_status = status;
  record.organisation = primary.name;
  record.organisation_role = primary.role_label;
  record.preferred_source = preferred;
  record.metadata = {
    ...(record.metadata || {}),
    attribution_search: roles.flatMap(item => [item.name, item.role_label, item.steward, item.note]).filter(Boolean).join(" ")
  };

  if (record.review_status === "reviewed") {
    record.editorial_reviewed_at = overrides.reviewed_at;
    record.editorial_review = {
      reviewer: "FronteraEval",
      reviewed_at: overrides.reviewed_at,
      scope: "construct, inference boundary, source attribution and provenance"
    };
    reviewedWithFixedDate += 1;
    if (["verified", "source-derived"].includes(status)) reviewedWithVerifiedAttribution += 1;
  }

  statusCounts[status] += 1;
  for (const item of roles) {
    roleCounts[item.role] = (roleCounts[item.role] || 0) + 1;
    if (["inspect_implementation", "inspect_registry"].includes(item.role)) inspectHostRoles += 1;
  }
}

catalog.attribution_schema_version = "1.0.0";
catalog.stats.attribution = {
  status: statusCounts,
  roles: roleCounts,
  inspect_host_roles: inspectHostRoles,
  reviewed_with_verified_or_source_derived_attribution: reviewedWithVerifiedAttribution,
  reviewed_with_fixed_review_date: reviewedWithFixedDate
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

const header = [
  "id", "name", "organisation", "organisation_role", "attribution_status",
  "source_type", "topics", "review_status", "preferred_source_label",
  "preferred_source_url", "paper_url", "reference_implementation",
  "inspect_host", "last_source_check", "editorial_reviewed_at"
];

const rows = catalog.records.map(record => {
  const roles = record.attribution?.roles || [];
  const paper = roles.find(item => item.role === "paper");
  const implementation = roles.find(item => item.role === "reference_implementation");
  const inspect = roles.find(item => ["inspect_implementation", "inspect_registry"].includes(item.role));
  return [
    record.id,
    record.name,
    record.organisation,
    record.organisation_role,
    record.attribution_status,
    record.source_type,
    (record.topics || []).join("|"),
    record.review_status,
    record.preferred_source?.label,
    record.preferred_source?.url,
    paper?.url,
    implementation?.url,
    inspect?.name,
    record.last_source_check,
    record.editorial_reviewed_at
  ];
});

await writeFile(csvPath, [header, ...rows].map(row => row.map(quote).join(",")).join("\n") + "\n");

let freshness = {};
try {
  freshness = JSON.parse(await readFile(freshnessPath, "utf8"));
} catch {
  freshness = {};
}
freshness.attribution = catalog.stats.attribution;
freshness.attribution_schema_version = catalog.attribution_schema_version;
await writeFile(freshnessPath, `${JSON.stringify(freshness, null, 2)}\n`);

console.log(JSON.stringify({
  attribution_status: statusCounts,
  reviewed_with_verified_or_source_derived_attribution: reviewedWithVerifiedAttribution,
  inspect_host_roles: inspectHostRoles
}));
