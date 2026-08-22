import { readFile } from "node:fs/promises";

const catalog=JSON.parse(await readFile("site/data/catalog.json","utf8"));
const required=["id","name","source_type","source_url","source_label","links","topics","review_status","measures","does_not_measure","best_for","not_sufficient_for"];
const errors=[], ids=new Set();

for(const [index,record] of catalog.records.entries()){
  for(const key of required) if(!(key in record)) errors.push(`record ${index} missing ${key}`);
  if(ids.has(record.id)) errors.push(`duplicate ${record.id}`);
  ids.add(record.id);
  if(!["imported","catalogued","reviewed"].includes(record.review_status)) errors.push(`invalid status ${record.id}`);
  if(!String(record.source_url).startsWith("https://")) errors.push(`invalid source ${record.id}`);
  if(!Array.isArray(record.links)||record.links.length===0) errors.push(`missing links ${record.id}`);
  for(const link of record.links||[]){
    if(!link.label||!link.type||!String(link.url||"").startsWith("https://")) errors.push(`invalid link ${record.id}`);
  }
  if(new Set((record.links||[]).map((link)=>link.url)).size!==(record.links||[]).length) errors.push(`duplicate links ${record.id}`);
  for(const topic of record.topics) if(!catalog.topics[topic]) errors.push(`unknown topic ${topic} in ${record.id}`);
}

if(catalog.stats.records!==catalog.records.length) errors.push("stats mismatch");
if(catalog.records.length<250) errors.push(`catalog too small: ${catalog.records.length}`);
if(errors.length){console.error(errors.join("\n"));process.exit(1);}
console.log(`Validated ${catalog.records.length} records; ${catalog.stats.review_status.reviewed||0} editorially reviewed; every record has a source link.`);
