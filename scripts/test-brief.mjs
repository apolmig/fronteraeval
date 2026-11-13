import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SCHEMA, createBrief, snapshot, addSelection, captureRecord, filterRecords,
  sourceChanged, reviewIssues, manifest, toMarkdown, parseBrief, safeURL} from '../site/brief/core.js';
const raw = await readFile(new URL('../site/data/catalog.json', import.meta.url), 'utf8');
const catalog = JSON.parse(raw);
const hash = createHash('sha256').update(raw).digest('hex');
const source = snapshot(catalog, hash);
const agent = catalog.records.find(r => r.id === 'canonical:agentdojo');
assert.ok(agent, 'AgentDojo is required for the catalogue-backed regression');
function plan() { const value=createBrief(source); addSelection(value,agent,source); return value; }

test('new plans are explicit drafts with no generated judgements', () => {
  const b=createBrief(source); assert.equal(b.schema,SCHEMA); assert.equal(b.kind,'planning-manifest');
  assert.equal(b.selections.length,0); assert.ok(reviewIssues(b).length>=6);
});
test('selection is manual, unique and initially unassessed', () => {
  const b=plan(); assert.equal(b.selections[0].fit,'unassessed'); assert.equal(b.selections[0].rationale,'');
  assert.equal(addSelection(b,agent,source),false); assert.equal(b.selections.length,1);
});
test('selection captures independent copies of source data', () => {
  const b=plan(); const before=JSON.stringify(b.selections[0]);
  const original=agent.measures; agent.measures='Changed upstream';
  assert.equal(JSON.stringify(b.selections[0]),before); agent.measures=original;
  const mutable={...source}; const other=createBrief();addSelection(other,agent,mutable);mutable.catalog_sha256='changed';
  assert.equal(other.selections[0].catalogue_snapshot.catalog_sha256,hash);
});
test('captures primary and documentary-review source URLs', () => {
  const r=captureRecord(agent); assert.ok(r.sources.some(s=>s.url.includes('arxiv.org/abs/2406.13352')));
  assert.ok(r.sources.every(s=>safeURL(s.url))); assert.ok(r.limit.includes('production agent'));
});
test('published snapshot hash and commit remain in JSON and Markdown', () => {
  const b=plan(); assert.equal(manifest(b).selections[0].catalogue_snapshot.catalog_sha256,hash);
  assert.ok(toMarkdown(b).includes(hash)); assert.ok(toMarkdown(b).includes(catalog.inspect_source_commit));
});
test('prompt injection search retrieves a direct construct, not merely a caveat', () => {
  const matches=filterRecords(catalog.records,'prompt injection','');assert.ok(matches.some(r=>r.id===agent.id));
  assert.equal(filterRecords([{id:'x',name:'Other',does_not_measure:'needlequartz',topics:[]}],'needlequartz','').length,0);
});
test('topic filter respects selected topic and does not infer suitability', () => {
  assert.ok(filterRecords(catalog.records,'','safeguards').every(r=>r.topics.includes('safeguards')));
  assert.equal(plan().selections[0].fit,'unassessed');
});
test('unknown language and deployment transfer remain explicit in exports', () => {
  assert.match(manifest(plan()).applicability,/require verification/);
  assert.ok(reviewIssues(plan()).some(s=>s.includes('language')));
});
test('adjacent evidence requires an explicit gap', () => {
  const b=plan();b.selections[0].fit='adjacent';assert.ok(reviewIssues(b).some(s=>s.includes('leaves untested')));
});
test('unreviewed source records are not silently upgraded', () => {
  const b=createBrief(source);addSelection(b,{...agent,review_status:'imported'},source);
  assert.ok(reviewIssues(b).some(s=>s.includes('no FronteraEval documentary assessment')));
});
test('pending reassessment excludes historical conclusions from selection and exports while preserving provenance', () => {
  const pending = {...agent, review_status: 'catalogued',
    measures: 'Current protocol needs reassessment.', does_not_measure: 'No current assessment.',
    best_for: 'Source navigation.', not_sufficient_for: 'Claims about this version.',
    methodological_review: {...agent.methodological_review, status: 'needs-reevaluation',
      construct: 'OLD_CONSTRUCT', unit_of_analysis: 'OLD_UNIT', target_outcome: 'OLD_OUTCOME',
      scoring: 'OLD_SCORING', comparability: 'OLD_COMPARABILITY', decision_relevance: 'OLD_RELEVANCE',
      source_basis: [{kind: 'paper', url: 'https://example.org/historical-protocol'}]}};
  const b=createBrief(source); addSelection(b,pending,source);
  const r=b.selections[0].record;
  assert.equal(r.construct,pending.measures);
  for(const field of ['unit','outcome','scoring','comparability']) assert.equal(r[field],'');
  assert.equal(r.decision_relevance,pending.best_for);
  assert.equal(r.review_date,pending.editorial_reviewed_at);
  assert.equal(r.review_status,'catalogued');
  assert.ok(r.sources.some(s=>s.url==='https://example.org/historical-protocol' && s.label.startsWith('Historical review source:')));
  assert.ok(r.sources.some(s=>s.url===agent.preferred_source.url));
  assert.doesNotMatch(JSON.stringify(manifest(b)),/OLD/);
  assert.doesNotMatch(toMarkdown(b),/OLD/);
  assert.deepEqual(parseBrief(JSON.stringify(manifest(b))),b);
  assert.equal(filterRecords([pending],'OLD_CONSTRUCT','').length,0);
  assert.ok(reviewIssues(b).some(s=>s.includes('no FronteraEval documentary assessment')));
});
test('completion is not a safety approval', () => {
  const b=plan();for(const key of ['question','system','context','constraints','gaps','next_steps'])b[key]='Explicit user entry';
  Object.assign(b.selections[0],{fit:'direct',rationale:'Test the identified threat surface',next_action:'Verify protocol and permissions'});
  assert.equal(reviewIssues(b).length,0);assert.match(toMarkdown(b),/not a safety judgement/);
});
test('valid JSON export reopens without losing evidence or notes', () => {
  const b=plan();b.question='Should we test this?';b.selections[0].gap='Unknown language transfer';
  const reopened=parseBrief(JSON.stringify(manifest(b)));assert.deepEqual(reopened,b);
});
test('different or unavailable snapshots are not silently treated as identical', () => {
  assert.equal(sourceChanged(source,{...source,catalog_sha256:'different'}),true);
  assert.equal(sourceChanged(source,{...source}),false);assert.equal(sourceChanged(source,null),false);
});
test('source links reject executable schemes and embedded credentials', () => {
  for(const value of ['javascript:alert(1)','data:text/html,<script>','https://user:secret@example.org/','/relative'])assert.equal(safeURL(value),'');
  assert.equal(safeURL('https://example.org/'),'https://example.org/');
});
test('Markdown escapes hostile HTML, injected headings and links', () => {
  const b=plan();b.title='<img src=x onerror=alert(1)>';b.question='\n# Forged heading\n[x](javascript:alert(1))';
  const md=toMarkdown(b);assert.ok(!md.includes('<img'));assert.ok(md.includes('\\# Forged'));assert.ok(md.includes('\\[x\\]'));
});
test('invalid, future or oversized imports fail before modifying a draft', () => {
  for(const raw of ['{}','null','[1]','{broken','x'.repeat(2000001)])assert.throws(()=>parseBrief(raw));
  const b=plan();b.schema='future';assert.throws(()=>parseBrief(JSON.stringify(b)));
});
test('duplicate selections and invalid types are rejected', () => {
  const b=plan();b.selections.push(b.selections[0]);assert.throws(()=>parseBrief(JSON.stringify(b)),/unique/);
  const c=plan();c.selections[0].rationale={text:'bad'};assert.throws(()=>parseBrief(JSON.stringify(c)),/Invalid/);
});
test('unsafe imported links cannot enter the DOM through a manifest', () => {
  const b=plan();b.selections[0].record.sources=[{label:'Click',url:'javascript:alert(1)'}];
  assert.throws(()=>parseBrief(JSON.stringify(b)),/unsafe/);
});
test('unknown properties are not merged into prototypes', () => {
  const b=plan();const raw=JSON.stringify(b).replace('"title":""','"__proto__":{"polluted":true},"title":""');
  const restored=parseBrief(raw);assert.equal({}.polluted,undefined);assert.equal(Object.hasOwn(restored,'__proto__'),false);
});
test('invalid dates and too many imported sources are rejected', () => {
  const b=plan();b.created_at='not a date';assert.throws(()=>parseBrief(JSON.stringify(b)),/dates/);
  const c=plan();c.selections[0].record.sources=Array(13).fill({label:'x',url:'https://example.org'});
  assert.throws(()=>parseBrief(JSON.stringify(c)),/source list/);
});
