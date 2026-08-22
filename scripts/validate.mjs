import { readFile } from "node:fs/promises";
const catalog=JSON.parse(await readFile("site/data/catalog.json","utf8"));
const required=["id","name","source_type","source_url","topics","review_status","measures","does_not_measure","best_for","not_sufficient_for"];
const errors=[], ids=new Set();
for(const [i,r] of catalog.records.entries()){
  for(const key of required) if(!(key in r)) errors.push(`record ${i} missing ${key}`);
  if(ids.has(r.id)) errors.push(`duplicate ${r.id}`); ids.add(r.id);
  if(!["imported","catalogued","reviewed"].includes(r.review_status)) errors.push(`invalid status ${r.id}`);
  if(!String(r.source_url).startsWith("https://")) errors.push(`invalid source ${r.id}`);
  for(const topic of r.topics) if(!catalog.topics[topic]) errors.push(`unknown topic ${topic} in ${r.id}`);
}
if(catalog.stats.records!==catalog.records.length) errors.push("stats mismatch");
if(catalog.records.length<250) errors.push(`catalog too small: ${catalog.records.length}`);
if(errors.length){ console.error(errors.join("\n")); process.exit(1); }
console.log(`Validated ${catalog.records.length} records; ${catalog.stats.review_status.reviewed||0} editorially reviewed.`);
