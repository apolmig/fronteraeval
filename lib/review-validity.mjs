// Compare source semantics, not fetch timestamps or the changing whole-repository SHA.
export function reviewSourceSnapshot(record) {
  const papers=[record.paper?.url,record.paper_url,...(record.papers||[]).map(paper=>paper.url)].filter(Boolean);
  return {
    version:record.version || null,
    protocol:record.protocol || null,
    tasks:record.tasks || (record.task?[record.task]:[]),
    paper_urls:[...new Set(papers)].sort(),
    reference_implementation:record.reference_implementation?.url || record.code_url || null
  };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
export function assessReviewValidity(record,baseline) {
  if(!baseline) return {status:'needs-reevaluation',reassessment_reasons:['No recorded source and protocol baseline for this documentary review.']};
  const current=reviewSourceSnapshot(record);
  const changed=Object.keys(current).filter(key=>JSON.stringify(stable(current[key]))!==JSON.stringify(stable(baseline[key])));
  return {status:changed.length?'needs-reevaluation':'reviewed',reassessment_reasons:changed.map(key=>`Changed ${key.replaceAll('_',' ')} since the recorded baseline.`)};
}
