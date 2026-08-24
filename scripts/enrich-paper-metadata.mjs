import { readFile, writeFile } from "node:fs/promises";

const REGISTRY_PATH = "data/source-registry.json";
const USER_AGENT = "FronteraEval/0.7 (+https://fronteraeval.org; paper-metadata)";
const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dedupe(values) {
  const seen = new Set();
  return values.map(clean).filter(Boolean).filter(value => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function arxivID(value) {
  const raw = clean(value);
  if (!raw) return null;
  const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([^/?#]+?)(?:\.pdf)?(?:[?#].*)?$/i);
  const candidate = urlMatch?.[1] || (/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(raw) ? raw : null);
  return candidate ? candidate.replace(/v\d+$/i, "") : null;
}

function decodeXML(value) {
  return clean(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAtom(xml) {
  const output = new Map();
  for (const block of String(xml).split("<entry>").slice(1)) {
    const id = arxivID(block.match(/<id>([^<]+)<\/id>/)?.[1]);
    if (!id) continue;
    const title = decodeXML(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const authors = [...block.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
      .map(match => decodeXML(match[1]));
    output.set(id, { title: title || null, authors: dedupe(authors) });
  }
  return output;
}

async function fetchChunk(ids) {
  const query = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(ids.join(","))}&max_results=${ids.length}`;
  const response = await fetch(query, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`${response.status} ${query}`);
  return parseAtom(await response.text());
}

const papers = [];
for (const [sourceKey, entry] of Object.entries(registry.entries || {})) {
  for (const paper of entry.papers || []) {
    const id = paper.arxiv_id || arxivID(paper.url);
    if (!id) continue;
    paper.arxiv_id = id;
    papers.push({ sourceKey, paper, id });
  }
}

const missingIDs = dedupe(
  papers
    .filter(({ paper }) => !clean(paper.title) || !Array.isArray(paper.authors) || paper.authors.length === 0)
    .map(({ id }) => id)
);

const resolved = new Map();
const failures = [];
for (let index = 0; index < missingIDs.length; index += 20) {
  const chunk = missingIDs.slice(index, index + 20);
  try {
    const metadata = await fetchChunk(chunk);
    for (const [id, value] of metadata) resolved.set(id, value);
  } catch (error) {
    failures.push({ ids: chunk, error: error instanceof Error ? error.message : String(error) });
  }
  if (index + 20 < missingIDs.length) await new Promise(resolve => setTimeout(resolve, 1100));
}

for (const { paper, id } of papers) {
  const metadata = resolved.get(id);
  if (metadata?.title && !clean(paper.title)) paper.title = metadata.title;
  if (metadata?.authors?.length && (!Array.isArray(paper.authors) || paper.authors.length === 0)) paper.authors = metadata.authors;
  paper.authors = dedupe(paper.authors || []);
  paper.organizations = dedupe(paper.organizations || []);
  paper.metadata_status = clean(paper.title) && paper.authors.length ? "resolved" : "pending";
  if (metadata && !paper.source) paper.source = "arxiv-api";
}

const uniquePapers = new Map();
for (const { sourceKey, paper, id } of papers) {
  if (!uniquePapers.has(id)) uniquePapers.set(id, { id, sourceKeys: new Set(), paper });
  uniquePapers.get(id).sourceKeys.add(sourceKey);
}
const pending = [...uniquePapers.values()]
  .filter(({ paper }) => paper.metadata_status !== "resolved")
  .map(({ id, sourceKeys, paper }) => ({
    arxiv_id: id,
    source_keys: [...sourceKeys].sort(),
    has_title: Boolean(clean(paper.title)),
    author_count: paper.authors?.length || 0
  }));

registry.stats = {
  ...(registry.stats || {}),
  arxiv_papers: uniquePapers.size,
  arxiv_metadata_resolved: uniquePapers.size - pending.length,
  arxiv_metadata_pending: pending.length,
  arxiv_metadata_failures: failures.length
};
registry.paper_metadata = {
  refreshed_at: new Date().toISOString(),
  pending,
  failures
};

await writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
console.log(JSON.stringify({
  arxiv_papers: uniquePapers.size,
  resolved: uniquePapers.size - pending.length,
  pending: pending.length,
  request_failures: failures.length
}));
