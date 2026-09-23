// Pure planning functions. No network access, model calls or automatic fit judgements.
export const SCHEMA = 'fronteraeval.evaluation-brief/v1';
export const STORAGE_KEY = 'fronteraeval-brief-v1';
// Apply the same UTF-8 limit to local drafts, imported files and exported manifests.
export const MAX_BRIEF_BYTES = 8_000_000;
export const byteLength = value => new TextEncoder().encode(value).byteLength;
export const FIT_LABELS = Object.freeze({
  unassessed: 'Not assessed',
  direct: 'Direct methodological fit (your judgement)',
  adjacent: 'Adjacent evidence only (your judgement)'
});
const clean = (value, limit = 16000) => typeof value === 'string' ? value.slice(0, limit) : '';
const copy = value => JSON.parse(JSON.stringify(value));
export function safeURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function snapshot(catalogue, hash = null) {
  return {
    generated_at: catalogue?.generated_at || null,
    inspect_source_commit: catalogue?.inspect_source_commit || null,
    catalog_sha256: hash,
    source_url: 'https://fronteraeval.org/data/catalog.json'
  };
}
export function createBrief(source = null, now = new Date().toISOString()) {
  return {
    schema: SCHEMA, kind: 'planning-manifest', revision: 1,
    created_at: now, updated_at: now, catalogue_snapshot: source ? copy(source) : null,
    title: '', question: '', system: '', context: '', constraints: '',
    gaps: '', next_steps: '', selections: []
  };
}
export function captureRecord(record) {
  const review = record.methodological_review || {};
  const refs = [
    {label: 'Original source', url: record.preferred_source?.url},
    {label: 'Paper', url: record.paper?.url},
    {label: 'Reference implementation', url: record.reference_implementation?.url},
    ...(record.links || []), ...(review.source_basis || [])
  ];
  const seen = new Set();
  const sources = refs.filter(ref => {
    const url = safeURL(ref.url);
    if (!url || seen.has(url)) return false;
    seen.add(url); return true;
  }).slice(0, 12).map(ref => ({label: clean(ref.label || ref.kind || 'Source', 120), url: safeURL(ref.url)}));
  return {
    id: clean(record.id, 300), name: clean(record.name, 500),
    family: clean(record.family_title || record.group || record.source_key || record.name, 500),
    review_status: clean(record.review_status, 100),
    review_date: clean(record.editorial_reviewed_at, 100),
    construct: clean(review.construct || record.measures || record.description),
    unit: clean(review.unit_of_analysis), outcome: clean(review.target_outcome),
    scoring: clean(review.scoring), measures: clean(record.measures || review.measures || record.description),
    limit: clean([...new Set([record.does_not_measure || review.does_not_measure, record.not_sufficient_for].filter(Boolean))].join(' ')),
    comparability: clean(review.comparability),
    decision_relevance: clean(review.decision_relevance || record.best_for),
    version: clean(String(record.version || record.protocol?.version || 'Not recorded')),
    implementation_commit: clean(record.protocol?.implementation_commit),
    published_command: clean(record.protocol?.command), sources
  };
}
export function addSelection(brief, record, source) {
  if (brief.selections.some(item => item.record.id === record.id)) return false;
  brief.selections.push({record: captureRecord(record), catalogue_snapshot: copy(source),
    fit: 'unassessed', rationale: '', gap: '', next_action: ''});
  if (!brief.catalogue_snapshot) brief.catalogue_snapshot = copy(source);
  return true;
}
export function reviewIssues(brief) {
  const issues = [];
  if (!brief.question.trim()) issues.push('Define the decision question.');
  if (!brief.system.trim()) issues.push('Describe the model and system configuration.');
  if (!brief.context.trim()) issues.push('Record the language, users and deployment context.');
  if (!brief.constraints.trim()) issues.push('Record the evaluation constraints, or explicitly state none.');
  if (!brief.selections.length) issues.push('Select at least one evaluation.');
  for (const item of brief.selections) {
    const name = item.record.name;
    if (!item.rationale.trim()) issues.push(`${name}: explain why this test is included.`);
    if (item.fit === 'unassessed') issues.push(`${name}: methodological fit is not assessed.`);
    if (item.fit === 'adjacent' && !item.gap.trim()) issues.push(`${name}: identify what this adjacent evidence leaves untested.`);
    if (item.record.review_status !== 'reviewed') issues.push(`${name}: no FronteraEval documentary assessment in this snapshot. Review the original protocol.`);
    if (!item.next_action.trim()) issues.push(`${name}: record the next verification or execution step.`);
  }
  if (!brief.gaps.trim()) issues.push('Record the remaining evidence gaps, even if your assessment is that none remain.');
  if (!brief.next_steps.trim()) issues.push('Record the overall next action and decision owner.');
  return issues;
}
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function filterRecords(records, query, topic, topicLabels = {}) {
  const tokens = norm(query).split(' ').filter(Boolean);
  if (String(query || '').trim() && !tokens.length) return [];
  return records.filter(record => {
    if (topic && !(record.topics || []).includes(topic)) return false;
    // Only positive descriptive fields count. A mention in a limitation is not a match.
    const text = norm([record.name, record.family_title, record.description, record.measures,
      record.methodological_review?.construct, ...(record.topics || []).map(id => topicLabels[id] || id)].join(' '));
    return tokens.every(token => text.includes(token));
  }).sort((a, b) => Number(b.review_status === 'reviewed') - Number(a.review_status === 'reviewed') || a.name.localeCompare(b.name));
}
export function sourceChanged(saved, current) {
  if (!saved || !current) return false;
  if (saved.catalog_sha256 && current.catalog_sha256) return saved.catalog_sha256 !== current.catalog_sha256;
  return saved.generated_at !== current.generated_at || saved.inspect_source_commit !== current.inspect_source_commit;
}
export function manifest(brief) {
  return {...copy(brief), exported_at: new Date().toISOString(),
    boundary: 'A draft evaluation plan, not a safety approval, independent replication or executable Inspect configuration.',
    applicability: 'Fit labels and notes are user judgements. Language, population and deployment transfer require verification.',
    unresolved_items: reviewIssues(brief)};
}
const md = value => clean(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1');
const field = (label, value) => `**${label}:** ${md(value || 'Not recorded')}\n`;
export function toMarkdown(brief) {
  const doc = manifest(brief);
  const out = [`# ${md(brief.title || 'Evaluation brief')}`, '',
    `Draft planning document. Revision ${brief.revision}. Updated ${md(brief.updated_at)}.`, '', doc.boundary, '',
    '## Decision and system', '', field('Question', brief.question), field('System', brief.system),
    field('Language, users and context', brief.context), field('Constraints', brief.constraints),
    '## Selected evaluations', '', doc.applicability, ''];
  for (const item of brief.selections) {
    const r = item.record;
    out.push(`### ${md(r.name)}`, '', field('Catalogue ID', r.id), field('Fit', FIT_LABELS[item.fit]),
      field('Why included', item.rationale), field('Construct', r.construct), field('Unit', r.unit),
      field('Outcome', r.outcome), field('Scoring', r.scoring), field('Can support', r.measures),
      field('Cannot establish by itself', r.limit), field('Comparability', r.comparability),
      field('Record state', r.review_status === 'reviewed' ? 'Documentary assessment, not replication' : r.review_status),
      field('Protocol version', r.version), field('Implementation commit', r.implementation_commit),
      field('Remaining gap', item.gap), field('Next action', item.next_action),
      field('Selection snapshot date', item.catalogue_snapshot?.generated_at),
      field('Catalogue SHA-256', item.catalogue_snapshot?.catalog_sha256),
      field('Inspect source commit', item.catalogue_snapshot?.inspect_source_commit), 'Sources:');
    for (const source of r.sources) out.push(`- ${md(source.label)}: <${safeURL(source.url)}>`);
    out.push('');
  }
  out.push('## Remaining evidence and next steps', '', field('Evidence gaps', brief.gaps), field('Next steps and owner', brief.next_steps),
    '## Open planning items', '', ...(doc.unresolved_items.length ? doc.unresolved_items.map(item => `- ${md(item)}`)
      : ['No missing planning fields detected. This is a completeness check, not a safety judgement.']), '',
    '## Provenance', '', field('Initial snapshot date', brief.catalogue_snapshot?.generated_at),
    field('Initial catalogue SHA-256', brief.catalogue_snapshot?.catalog_sha256),
    'Selected record metadata is captured when added and is not silently replaced by subsequent catalogue updates.', '');
  return out.join('\n');
}
export function assertBriefSize(brief) {
  // Pretty-printed exports include additional boundaries and open-item descriptions.
  const bytes = byteLength(JSON.stringify(manifest(brief), null, 2));
  if (bytes > MAX_BRIEF_BYTES) throw new Error('This change exceeds the 8 MB brief limit. Keep it in a separate brief. The previous draft is preserved.');
  return bytes;
}
export function parseBrief(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_BRIEF_BYTES || byteLength(raw) > MAX_BRIEF_BYTES) throw new Error('Use a FronteraEval JSON brief no larger than 8 MB.');
  let input;
  try { input = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (input?.schema !== SCHEMA || input?.kind !== 'planning-manifest' || !Array.isArray(input.selections)) {
    throw new Error('This is not a supported FronteraEval brief. Existing work was not changed.');
  }
  if (input.selections.length > 100) throw new Error('This brief contains too many selections.');
  const base = createBrief();
  for (const key of ['title','question','system','context','constraints','gaps','next_steps','created_at','updated_at']) {
    if (typeof input[key] !== 'string' || input[key].length > 16000) throw new Error(`Invalid brief field: ${key}.`);
    base[key] = input[key];
  }
  const isISODate = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  if (![base.created_at, base.updated_at].every(isISODate)) throw new Error('Invalid brief dates. Use ISO timestamps from a FronteraEval export.');
  base.revision = Number.isSafeInteger(input.revision) && input.revision > 0 ? input.revision : 1;
  const readSnapshot = source => {
    if (source == null) return null;
    if (typeof source !== 'object' || Array.isArray(source)) throw new Error('Invalid catalogue snapshot.');
    return {generated_at: clean(source.generated_at, 100) || null,
      inspect_source_commit: clean(source.inspect_source_commit, 100) || null,
      catalog_sha256: clean(source.catalog_sha256, 100) || null,
      source_url: safeURL(source.source_url) || 'https://fronteraeval.org/data/catalog.json'};
  };
  base.catalogue_snapshot = readSnapshot(input.catalogue_snapshot);
  const seen = new Set();
  const fields = ['id','name','family','review_status','review_date','construct','unit','outcome','scoring','measures','limit','comparability','decision_relevance','version','implementation_commit','published_command'];
  base.selections = input.selections.map(item => {
    if (!item || !item.record || !Object.hasOwn(FIT_LABELS, item.fit)) throw new Error('Invalid evaluation selection.');
    const r = {};
    for (const key of fields) {
      if (typeof item.record[key] !== 'string' || item.record[key].length > 16000) throw new Error(`Invalid evaluation field: ${key}.`);
      r[key] = item.record[key];
    }
    if (!r.id || !r.name || seen.has(r.id)) throw new Error('Evaluation IDs must be present and unique.');
    seen.add(r.id);
    if (!Array.isArray(item.record.sources) || item.record.sources.length > 12) throw new Error('Invalid source list.');
    r.sources = item.record.sources.map(source => {
      if (!safeURL(source?.url)) throw new Error('A source has an unsafe URL.');
      return {label: clean(source.label, 120), url: safeURL(source.url)};
    });
    const result = {record:r, catalogue_snapshot:readSnapshot(item.catalogue_snapshot), fit:item.fit};
    for (const key of ['rationale','gap','next_action']) {
      if (typeof item[key] !== 'string' || item[key].length > 16000) throw new Error(`Invalid selection field: ${key}.`);
      result[key] = item[key];
    }
    return result;
  });
  assertBriefSize(base);
  return base;
}
