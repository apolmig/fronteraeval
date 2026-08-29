import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyTopics, isKnownCandidate, mergeCandidates, normaliseTitle, normaliseURL, scoreCandidate } from './discover-external-evals.mjs';

const fixture=JSON.parse(await readFile('scripts/fixtures/external-discovery.json','utf8'));
assert.equal(normaliseURL('https://example.com/path/?utm_source=x#section'),'https://example.com/path');
assert.equal(normaliseTitle('Agent Safety Benchmark: Evaluation Suite'),'agent safety');
assert.ok(classifyTopics('autonomous browser agent tool use').includes('autonomy-agents'));
assert.ok(classifyTopics('persuasion and social engineering').includes('human-influence'));
assert.equal(scoreCandidate({title:'Awesome LLM Courses',summary:'tutorial course',stars:500}).score,0);

const known={urls:new Set(['https://github.com/example/known-agent-benchmark']),titles:['Known Agent Benchmark']};
assert.equal(isKnownCandidate({title:'Known Agent Benchmark',canonical_url:'https://github.com/example/known-agent-benchmark'},known),true);

const candidates=mergeCandidates(fixture.raw_candidates,fixture.catalog,{schema_version:'1.0.0',candidates:[]});
assert.equal(candidates.length,2,'expected one GitHub and one arXiv candidate');
assert.ok(candidates.some((candidate)=>candidate.title==='Frontier Agent Safety Benchmark'));
assert.ok(candidates.some((candidate)=>candidate.title==='Evaluating Manipulative Behaviour in Language Models'));
assert.ok(!candidates.some((candidate)=>candidate.title==='Known Agent Benchmark'),'known catalogue record was not excluded');
assert.ok(!candidates.some((candidate)=>candidate.title==='Awesome LLM Courses'),'generic resource was not excluded');
assert.ok(candidates.every((candidate)=>candidate.score>=6));
assert.ok(candidates.find((candidate)=>candidate.title.includes('Manipulative'))?.topics.includes('human-influence'));

const dismissed={...candidates[0],review_status:'dismissed'};
const rerun=mergeCandidates(fixture.raw_candidates,fixture.catalog,{schema_version:'1.0.0',candidates:[dismissed]});
assert.ok(!rerun.some((candidate)=>candidate.id===dismissed.id),'dismissed candidate resurfaced');
console.log(`Validated external-evaluation discovery: ${candidates.length} relevant candidates, known and generic resources excluded.`);
