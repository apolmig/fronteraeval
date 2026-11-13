import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { classifyCandidate, classifyTopics, collectSources, identityKeys, isKnownCandidate, mergeCandidates, normaliseTitle, normaliseURL, scoreCandidate } from './discover-external-evals.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/external-discovery.json',import.meta.url),'utf8'));
const now='2026-11-13T12:00:00Z';
const candidate=fixture.raw_candidates[1];
const catalogue={records:[]};

test('normalises repository, DOI and versioned arXiv identities without changing arbitrary paths',()=>{
  assert.equal(normaliseURL('http://export.arxiv.org/pdf/2601.00001v3.pdf?utm_source=x#section'),'https://arxiv.org/abs/2601.00001');
  assert.equal(normaliseURL('http://dx.doi.org/10.123/AbC'),'https://doi.org/10.123/abc');
  assert.equal(normaliseURL('https://github.com/METR/Example.git'),'https://github.com/metr/example');
  assert.equal(normaliseURL('https://example.com/a/?utm_source=x#section'),'https://example.com/a');
  assert.equal(normaliseURL('javascript:alert(1)'),null);
  assert.equal(normaliseTitle('Agent Safety Benchmark: Evaluation Suite'),'agent safety');
  assert.ok(identityKeys({doi:'10.123/AbC'}).includes('https://doi.org/10.123/abc'));
});
test('scores relevance, never stars or hosting as quality evidence',()=>{
  assert.deepEqual(scoreCandidate({...candidate,stars:0}),scoreCandidate({...candidate,stars:1000000}));
  assert.equal(scoreCandidate({title:'Awesome LLM Courses',summary:'tutorial course',owner:'openai'}).score,0);
  assert.equal(scoreCandidate({title:'An unrelated repository',owner:'openai',stars:1000000}).score,0);
  assert.ok(classifyTopics('persuasion and social engineering').includes('human-influence'));
});
test('retains only relevant unknown candidates and unresolved editorial status',()=>{
  const result=mergeCandidates(fixture.raw_candidates,fixture.catalog,{},now);
  assert.equal(result.length,2);
  assert.ok(result.every(item=>item.review_status==='candidate' && item.origin_status==='unresolved'));
  assert.ok(result.every(item=>!('organisation' in item)));
});
test('accepted and dismissed decisions survive repeated scans and title changes',()=>{
  for(const status of ['accepted','dismissed']) {
    let queue=mergeCandidates([candidate],catalogue,{},now);
    queue[0].review_status=status; queue[0].review_note='Human decision retained';
    for(let i=0;i<3;i++) queue=mergeCandidates([{...candidate,title:'Renamed LLM Safety Benchmark'}],catalogue,{candidates:queue},now);
    assert.equal(queue.length,1);
    assert.equal(queue[0].review_status,status);
    assert.equal(queue[0].review_note,'Human decision retained');
  }
});
test('deduplicates paper versions, DOI aliases, repository aliases and title aliases',()=>{
  const base={...candidate,paper_url:'https://arxiv.org/abs/2601.00001v1',doi:'10.123/Test'};
  const variations=[base,{...candidate,title:'Different name',canonical_url:'https://arxiv.org/pdf/2601.00001v2.pdf'},
    {...candidate,title:'Another name',canonical_url:'https://doi.org/10.123/test'},
    {...candidate,title:'Alias name',canonical_url:'https://example.com/alias',aliases:[candidate.title]}];
  const result=mergeCandidates(variations,catalogue,{},now);
  assert.equal(result.length,1);
  assert.ok(result[0].observed_urls.some(url=>url.includes('v2.pdf')));
});
test('preserves historical decisions beyond a page size and marks newly catalogued candidates',()=>{
  const history=Array.from({length:100},(_,i)=>({...candidate,id:String(i),title:`Item ${i}`,canonical_url:`https://example.com/${i}`,review_status:'dismissed'}));
  assert.equal(mergeCandidates([],catalogue,{candidates:history},now).length,100);
  const queue=mergeCandidates([candidate],catalogue,{},now);
  const result=mergeCandidates([],{records:[{name:candidate.title,source_url:candidate.canonical_url}]},{candidates:queue},now);
  assert.equal(result[0].review_status,'already-catalogued');
});
test('does not confuse new implementation, version, usage paper and new evaluation',()=>{
  assert.equal(classifyCandidate({summary:'We use existing benchmarks to evaluate language models.'}),'benchmark-usage-paper');
  assert.equal(classifyCandidate({summary:'We introduce a new benchmark for language models.'}),'possible-new-evaluation');
  assert.equal(classifyCandidate({summary:'New version of the benchmark.'}),'possible-new-version');
  assert.equal(classifyCandidate({summary:'A reimplementation of the LLM benchmark.'}),'possible-implementation');
  assert.equal(mergeCandidates([{...candidate,summary:'We use existing benchmarks to evaluate language models.'}],catalogue,{},now).length,0);
});
test('matches catalogue families and aliases without loose title similarity hiding distinct benchmarks',()=>{
  const known={urls:new Set(),titles:['Known Benchmark','FASB']};
  assert.ok(isKnownCandidate({title:'FASB'},known));
  assert.equal(isKnownCandidate({title:'Known Benchmark Extended'},known),false);
  const result=mergeCandidates([{...candidate,family:'Existing family'}],{records:[{id:'family:old',family_title:'Existing family',name:'Original task'}]}, {},now);
  assert.deepEqual(result[0].related_catalogue_ids,['family:old']);
});
test('reports errors per source, keeps successful results and exposes result caps',async()=>{
  const {sources,raw}=await collectSources([
    ['owner-a',async()=>({items:[candidate],truncated:false,limit:100})],
    ['owner-b',async()=>{throw new Error('HTTP 503')}],
    ['search',async()=>({items:[],truncated:true,limit:50})]
  ],now);
  assert.equal(raw.length,1);
  assert.deepEqual(sources.map(source=>source.status),['ok','error','partial']);
  assert.equal(sources[1].error,'HTTP 503');
  assert.ok(sources.every(source=>source.checked_at===now));
});
