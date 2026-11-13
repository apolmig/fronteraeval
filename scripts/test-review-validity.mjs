import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessReviewValidity, reviewSourceSnapshot } from '../lib/review-validity.mjs';
const record={version:'7-C',protocol:{version:'7-C',dataset_samples:23,sandbox:['solver','scorer']},paper:{url:'https://arxiv.org/abs/2504.01848'},reference_implementation:{url:'https://github.com/openai/preparedness/tree/main/project/paperbench'},tasks:[{name:'paperbench',dataset_samples:23}],source_url:'https://github.com/UKGovernmentBEIS/inspect_evals/tree/old/src/inspect_evals/paperbench',last_source_check:'2026-11-01'};
const baseline=reviewSourceSnapshot(record);
test('new observation timestamps and whole-repository SHA do not invalidate unchanged protocol',()=>{
 const result=assessReviewValidity({...record,last_source_check:'2026-11-13',source_url:record.source_url.replace('/old/','/new/'),editorial_reviewed_at:'2026-08-27'},baseline);
 assert.equal(result.status,'reviewed');assert.deepEqual(result.reassessment_reasons,[]);
});
test('version, protocol, task, paper and reference changes require reassessment',()=>{
 for (const change of [{version:'8-C'},{protocol:{...record.protocol,dataset_samples:24}},{tasks:[{name:'new-task'}]},{paper:{url:'https://arxiv.org/abs/2504.01848v2'}},{reference_implementation:{url:'https://example.com/new'}}]) {
  const result=assessReviewValidity({...record,...change},baseline);
  assert.equal(result.status,'needs-reevaluation');assert.ok(result.reassessment_reasons.length);
 }
});
test('absent baseline never silently grants review status',()=>{
 assert.equal(assessReviewValidity(record).status,'needs-reevaluation');
});
test('object key ordering and duplicate paper links do not imply a protocol change',()=>{
 const duplicate={...record,protocol:{sandbox:['solver','scorer'],dataset_samples:23,version:'7-C'},paper_url:record.paper.url,papers:[record.paper,record.paper]};
 assert.equal(assessReviewValidity(duplicate,baseline).status,'reviewed');
});
