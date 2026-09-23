import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBrief, snapshot, addSelection, manifest, parseBrief, toMarkdown,
  filterRecords, assertBriefSize, byteLength, MAX_BRIEF_BYTES} from '../site/brief/core.js';
const catalog=JSON.parse(await readFile(new URL('../site/data/catalog.json',import.meta.url),'utf8'));
function largePlan(character='a', count=50){
  const b=createBrief(snapshot(catalog));
  for(const r of catalog.records.slice(0,count)){
    addSelection(b,r,snapshot(catalog));
    Object.assign(b.selections.at(-1),{rationale:character.repeat(16000),gap:character.repeat(16000),next_action:character.repeat(16000)});
  }
  return b;
}
test('date comments cannot inject HTML into an exported Markdown document',()=>{
  const b=createBrief(); b.updated_at='2026-09-23 (<img src=x onerror=alert(1)>)';
  assert.ok(Number.isFinite(Date.parse(b.updated_at)), 'reproduce the permissive Date.parse case');
  assert.throws(()=>parseBrief(JSON.stringify(b)),/dates/);
  assert.ok(!toMarkdown(b).includes('<img'), 'export also escapes unvalidated dates defensively');
});
test('date timestamps must be canonical and valid, not permissive date expressions',()=>{
  for(const value of ['September 23 2026','2026-02-30T12:00:00.000Z','2026-09-23 (<b>x</b>)']){
    const b=createBrief();b.created_at=value;assert.throws(()=>parseBrief(JSON.stringify(b)),/dates/);
  }
  const b=createBrief();assert.deepEqual(parseBrief(JSON.stringify(b)),b);
});
test('large briefs using legal field lengths can reopen their own JSON exports',()=>{
  const b=largePlan();const raw=JSON.stringify(manifest(b),null,2);
  assert.ok(byteLength(raw)>2_000_000);assert.ok(byteLength(raw)<MAX_BRIEF_BYTES);
  assertBriefSize(b);assert.deepEqual(parseBrief(raw),b);
});
test('the same byte limit applies to multibyte imports and exported manifests',()=>{
  assert.equal(byteLength('漢'),3);
  assert.throws(()=>parseBrief('漢'.repeat(Math.ceil(MAX_BRIEF_BYTES/3))),/8 MB/);
  assert.throws(()=>assertBriefSize(largePlan('漢',100)),/previous draft is preserved/);
});
test('Japanese queries do not become an empty filter matching the whole catalogue',()=>{
  assert.equal(filterRecords(catalog.records,'日本語','').length,0);
  const records=[{id:'jp',name:'日本語 test',topics:[]},{id:'en',name:'Different test',topics:[]}];
  assert.deepEqual(filterRecords(records,'日本語','').map(r=>r.id),['jp']);
});
test('Arabic and Cyrillic remain searchable rather than disappearing in normalization',()=>{
  const records=[{id:'ar',name:'اختبار agents',topics:[]},{id:'ru',name:'проверка agents',topics:[]},{id:'en',name:'Other',topics:[]}];
  assert.deepEqual(filterRecords(records,'اختبار','').map(r=>r.id),['ar']);
  assert.deepEqual(filterRecords(records,'проверка','').map(r=>r.id),['ru']);
});
test('Spanish diacritics still normalize and mixed-script queries keep every term',()=>{
  const records=[{id:'es',name:'Evaluación de agentes',topics:[]}];
  assert.equal(filterRecords(records,'evaluacion','').length,1);
  assert.equal(filterRecords(records,'agentes 日本語','').length,0);
});
test('punctuation or symbols alone do not return unrelated records',()=>{
  for(const query of ['!!!','🔍'])assert.equal(filterRecords(catalog.records,query,'').length,0);
  assert.equal(filterRecords(catalog.records,'','').length,catalog.records.length);
});
test('supporting method page links to a file that actually exists in the repository',async()=>{
  const script=await readFile(new URL('./generate-discovery.mjs',import.meta.url),'utf8');
  assert.ok(!script.includes('SOURCE_METHODOLOGY.md'));
  assert.ok(script.includes('blob/main/ATTRIBUTION.md'));
  assert.ok((await readFile(new URL('../ATTRIBUTION.md',import.meta.url),'utf8')).length>100);
});
