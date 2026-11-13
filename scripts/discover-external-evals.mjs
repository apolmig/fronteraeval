import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const OUTPUT_JSON = process.env.DISCOVERY_OUTPUT_JSON || 'discovery/external-candidates.json';
const OUTPUT_MD = process.env.DISCOVERY_OUTPUT_MD || 'discovery/external-candidates.md';
const WINDOW_DAYS = Math.max(7, Math.min(60, Number(process.env.DISCOVERY_WINDOW_DAYS || 21)));
const MIN_SCORE = Math.max(4, Number(process.env.DISCOVERY_MIN_SCORE || 6));
const USER_AGENT = 'FronteraEval/0.9 (+https://fronteraeval.org; external-eval-discovery)';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const TRUSTED_GITHUB_OWNERS = new Set([
  'ukgovernmentbeis','metr','openai','anthropics','google-deepmind','mlcommons',
  'centerforaisafety','stanford-crfm','sierra-research','laude-institute',
  'servicenow','epoch-research','arcprize','grayswanai','meta-llama','eleutherai',
  'alignmentresearch','farai','farama-foundation','thu-coai','hkust-nlp'
]);

const PRIMARY_TERMS = [
  'benchmark','evaluation','evaluating',' eval ','evals','red team','red-team','assessment','test suite','safety suite'
];
const AI_TERMS = [
  'llm','language model','foundation model','frontier model','ai agent','agentic ai',
  'conversational agent','language-model','ai system','model evaluation','agent benchmark','multimodal model','generative ai','artificial intelligence','model safety','model capability'
];
const EXCLUDE_TERMS = [
  'course','tutorial','awesome list','newsletter','job board','interview preparation',
  'prompt collection','chatbot template','rag tutorial','leaderboard frontend'
];

const TOPIC_RULES = {
  'autonomy-agents':['agent','autonomous','computer use','browser','web task','terminal','long horizon','tool use'],
  'ai-rd':['research engineering','ai r&d','machine learning engineering','software engineering','research replication'],
  cyber:['cyber','vulnerability','exploit','ctf','malware','phishing','security operations'],
  'bio-cbrn':['biosecurity','biology','chemical','cbrn','pathogen','wet lab'],
  'deception-misalignment':['deception','scheming','misalignment','sandbagging','sabotage','covert','alignment faking'],
  'human-influence':['persuasion','manipulation','social engineering','coercion','sycophancy','influence'],
  safeguards:['jailbreak','refusal','guardrail','safety','harmful response','red team'],
  'evaluation-integrity':['contamination','evaluation awareness','judge','scoring','benchmark integrity','elicitation'],
  multimodal:['multimodal','vision-language','image-text','audio'],
  'general-capability':['reasoning','mathematics','knowledge','coding','general capability']
};

function collapse(value='') { return String(value).replace(/\s+/g, ' ').trim(); }
export function normaliseTitle(value='') {
  return collapse(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\b(benchmark|evaluation|eval|suite|framework|dataset)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
export function normaliseURL(value='') {
  try {
    const url = new URL(String(value).trim());
    if (!['http:','https:'].includes(url.protocol)) return null;
    url.hash='';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    if (/^(export\.)?arxiv\.org$/.test(url.hostname)) {
      url.hostname='arxiv.org'; url.protocol='https:';
      url.pathname=url.pathname.replace(/^\/pdf\//,'/abs/').replace(/\.pdf$/,'').replace(/v\d+$/,''); url.search='';
    }
    if (['doi.org','dx.doi.org'].includes(url.hostname)) {
      url.hostname='doi.org'; url.protocol='https:'; url.pathname=url.pathname.toLowerCase(); url.search='';
    }
    if (url.hostname==='github.com') {
      url.protocol='https:'; url.pathname=url.pathname.replace(/\.git$/,'').toLowerCase(); url.search='';
    }
    return url.toString().replace(/\/$/,'');
  } catch { return null; }
}
// Identity links do not turn hosting into authorship. They only collapse queue duplicates.
export function identityKeys(candidate) {
  const links=[...(candidate.observed_urls||[]),candidate.canonical_url,candidate.repository_url,candidate.paper_url,candidate.source_url,
    candidate.preferred_source?.url,candidate.paper?.url,candidate.code_url,candidate.reference_implementation?.url,
    ...(candidate.links||[]).map(link=>link.url),...(candidate.papers||[]).map(paper=>paper.url)];
  const keys=links.map(normaliseURL).filter(Boolean);
  if (candidate.doi) keys.push(normaliseURL(`https://doi.org/${String(candidate.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//,'')}`));
  if (candidate.arxiv_id || candidate.paper?.arxiv_id) keys.push(normaliseURL(`https://arxiv.org/abs/${candidate.arxiv_id || candidate.paper.arxiv_id}`));
  for (const key of [...keys]) {
    const match=key?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/);
    if(match) keys.push(`https://github.com/${match[1]}`);
  }
  return [...new Set(keys)];
}
export function classifyCandidate(raw) {
  const text=`${raw.title || ''} ${raw.summary || ''}`.toLowerCase();
  // These are discovery hints, never editorial conclusions.
  if (/\b(we (use|evaluate on)|using (the |existing )?benchmarks|evaluated on existing benchmarks)\b/.test(text) &&
      !/\b(we introduce|we propose|new benchmark|new evaluation)\b/.test(text)) return 'benchmark-usage-paper';
  if (/\b(new version|version \d|v\d+|updated benchmark|second edition)\b/.test(text)) return 'possible-new-version';
  if (/\b(implementation|reimplementation|port of)\b/.test(text)) return 'possible-implementation';
  if (/\b(we introduce|we propose|new benchmark|new evaluation)\b/.test(text)) return 'possible-new-evaluation';
  return 'unclassified';
}
export function classifyTopics(text='') {
  const haystack=collapse(text).toLowerCase();
  const result=[];
  for (const [topic,terms] of Object.entries(TOPIC_RULES)) if (terms.some((term)=>haystack.includes(term))) result.push(topic);
  return result.length ? result : ['general-capability'];
}
export function scoreCandidate({title='', summary='', owner='', stars=0, sourceType=''}) {
  const text=` ${title} ${summary} `.toLowerCase();
  if (EXCLUDE_TERMS.some((term)=>new RegExp(`\\b${term}\\b`).test(text))) return {score:0,reasons:['excluded generic resource']};
  const reasons=[]; let score=0;
  const primary=PRIMARY_TERMS.filter((term)=>new RegExp(`\\b${term.trim()}s?\\b`).test(text));
  const ai=AI_TERMS.filter((term)=>text.includes(term));
  if (primary.length) { score+=3; reasons.push(`evaluation signal: ${primary.slice(0,2).join(', ')}`); }
  if (ai.length) { score+=2; reasons.push(`AI-system signal: ${ai.slice(0,2).join(', ')}`); }
  if (!primary.length || !ai.length) return {score:0,reasons:['insufficient evaluation and AI-system signals'],topics:[]};
  const topics=classifyTopics(text);
  if (topics.some((topic)=>topic!=='general-capability')) { score+=2; reasons.push(`risk/capability topic: ${topics.filter((t)=>t!=='general-capability').slice(0,3).join(', ')}`); }
  if (TRUSTED_GITHUB_OWNERS.has(String(owner).toLowerCase())) { score+=3; reasons.push('known evaluation organisation'); }
  if (sourceType==='arxiv') { score+=1; reasons.push('research-paper source'); }
  if (sourceType==='official-github') { score+=1; reasons.push('official organisation repository'); }
  return {score,reasons,topics};
}
function candidateId(candidate) {
  return createHash('sha256').update(identityKeys(candidate).sort()[0] || normaliseTitle(candidate.title)).digest('hex').slice(0,16);
}
function knownIndex(catalog) {
  const urls=new Set(), titles=[];
  for (const record of catalog.records || []) {
    titles.push(record.name,record.family_title,...(record.aliases||[]));
    for (const link of identityKeys(record)) urls.add(link);
  }
  return {urls,titles:titles.filter(Boolean)};
}
export function isKnownCandidate(candidate,known) {
  if (identityKeys(candidate).some(url=>known.urls.has(url))) return true;
  const title=normaliseTitle(candidate.title);
  return Boolean(title) && known.titles.some(existing=>normaliseTitle(existing)===title);
}
function canonicalCandidate(raw) {
  const canonical_url=normaliseURL(raw.canonical_url || raw.repository_url || raw.paper_url || raw.url);
  if (!canonical_url || !raw.title) return null;
  const scored=scoreCandidate({title:raw.title,summary:raw.summary,owner:raw.owner,sourceType:raw.source_type});
  const candidate={
    title:collapse(raw.title),canonical_url,source_type:raw.source_type,source_name:raw.source_name || raw.owner || raw.source_type,
    source_owner:raw.owner || null, origin_status:'unresolved',
    summary:collapse(raw.summary).slice(0,700),repository_url:normaliseURL(raw.repository_url),paper_url:normaliseURL(raw.paper_url),
    doi:raw.doi || null, aliases:raw.aliases || [], family:raw.family || null,
    published_at:raw.published_at || null,updated_at:raw.updated_at || raw.published_at || null,
    score:scored.score,reasons:scored.reasons,topics:scored.topics || classifyTopics(`${raw.title} ${raw.summary}`),
    discovery_kind:classifyCandidate(raw),review_status:'candidate',
    observed_urls:[raw.canonical_url,raw.paper_url,raw.repository_url].filter(Boolean)
  };
  candidate.id=candidateId(candidate);
  return candidate;
}
function sameCandidate(left,right) {
  const identities=new Set(identityKeys(left));
  if (identityKeys(right).some(key=>identities.has(key))) return true;
  const names=item=>[item.title,...(item.aliases||[])].map(normaliseTitle).filter(Boolean);
  return names(left).some(title=>names(right).includes(title));
}
export function mergeCandidates(rawCandidates,catalog,previous={},now=new Date().toISOString()) {
  const known=knownIndex(catalog);
  // Keep decisions forever. Dropping accepted/dismissed entries resurrects them on the next scan.
  const merged=(previous.candidates||[]).map(candidate=>({...candidate}));
  for (const raw of rawCandidates) {
    const candidate=canonicalCandidate(raw);
    if (!candidate) continue;
    const index=merged.findIndex(old=>sameCandidate(old,candidate));
    if (candidate.score<MIN_SCORE || candidate.discovery_kind==='benchmark-usage-paper') {
      if(index>=0 && merged[index].review_status==='candidate') merged[index]={...merged[index],review_status:'filtered',filter_reason:'Current source metadata does not meet discovery relevance criteria.',last_seen_at:now};
      continue;
    }
    if (index>=0) {
      const old=merged[index];
      merged[index]={...old,...candidate,id:old.id,review_status:old.review_status==='filtered'?'candidate':old.review_status,first_seen_at:old.first_seen_at,last_seen_at:now,
        aliases:[...new Set([...(old.aliases||[]),old.title,...(candidate.aliases||[])])],
        observed_urls:[...new Set([...identityKeys(old),...(old.observed_urls||[]),...identityKeys(candidate),...candidate.observed_urls])],
        discovery_sources:[...new Set([...(old.discovery_sources||[old.source_name]),candidate.source_name].filter(Boolean))]};
      continue;
    }
    if (isKnownCandidate(candidate,known)) continue;
    const related=(catalog.records||[]).filter(record=>candidate.family && normaliseTitle(candidate.family)===normaliseTitle(record.family_title));
    merged.push({...candidate,related_catalogue_ids:related.map(record=>record.id),first_seen_at:now,last_seen_at:now});
  }
  // A candidate already admitted to the catalogue is retained as a decision record, never re-promoted.
  for (const candidate of merged) if (candidate.review_status==='candidate' && isKnownCandidate(candidate,known)) {
    candidate.review_status='already-catalogued';
  }
  return merged.sort((a,b)=>(b.score||0)-(a.score||0) || a.title.localeCompare(b.title));
}

async function fetchWithRetry(url,options={},attempts=3) {
  let lastError;
  for (let attempt=1;attempt<=attempts;attempt++) {
    try {
      const response=await fetch(url,{...options,headers:{'user-agent':USER_AGENT,accept:'application/json, application/atom+xml, text/xml;q=0.9, */*;q=0.5',...(options.headers||{})},signal:AbortSignal.timeout(20000)});
      if (response.ok) return response;
      if (![429,500,502,503,504].includes(response.status)) throw new Error(`${response.status} ${url}`);
      lastError=new Error(`${response.status} ${url}`);
    } catch (error) { lastError=error; }
    if (attempt<attempts) await new Promise((resolve)=>setTimeout(resolve,attempt*1500));
  }
  throw lastError;
}
async function githubJSON(url) {
  const headers={accept:'application/vnd.github+json'};
  if (GITHUB_TOKEN) headers.authorization=`Bearer ${GITHUB_TOKEN}`;
  return fetchWithRetry(url,{headers}).then((response)=>response.json());
}
const GITHUB_QUERIES=[
  '"llm benchmark" in:name,description,readme',
  '"ai agent benchmark" in:name,description,readme',
  '"ai safety benchmark" in:name,description,readme',
  '"frontier model evaluation" in:name,description,readme',
  '"language model evaluation" in:name,description'
];
function repositoryCandidate(repo,sourceType) {
  return {title:repo.name,summary:repo.description||'',canonical_url:repo.html_url,repository_url:repo.html_url,
    source_type:sourceType,source_name:`GitHub: ${repo.owner?.login}`,owner:repo.owner?.login,published_at:repo.created_at,updated_at:repo.updated_at};
}
async function discoverGitHubQuery(query,since) {
  const data=await githubJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(`${query} created:>=${since}`)}&sort=updated&order=desc&per_page=50`);
  return {items:(data.items||[]).filter(repo=>!repo.fork&&!repo.archived).map(repo=>repositoryCandidate(repo,'github-search')),
    truncated:Boolean(data.incomplete_results || data.total_count>50),limit:50};
}
async function discoverOfficialOwner(owner,since) {
  const data=await githubJSON(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=updated&direction=desc&per_page=100&type=public`);
  return {items:data.filter(repo=>!repo.fork&&!repo.archived&&String(repo.updated_at||'').slice(0,10)>=since).map(repo=>repositoryCandidate(repo,'official-github')),
    truncated:data.length===100&&String(data.at(-1)?.updated_at||'').slice(0,10)>=since,limit:100};
}
function decodeXML(value='') { return value.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function tag(entry,name) { return decodeXML(entry.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1] || '').trim(); }
async function discoverArxiv(since) {
  const query='all:"AI evaluation" OR all:"language model benchmark" OR all:"AI agent benchmark" OR all:"model safety benchmark"';
  const xmlText=await fetchWithRetry(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=100&sortBy=submittedDate&sortOrder=descending`,{headers:{accept:'application/atom+xml'}}).then((response)=>response.text());
  const raw=[];
  for (const entry of xmlText.match(/<entry>[\s\S]*?<\/entry>/gi)||[]) {
    const id=tag(entry,'id'), published=tag(entry,'published');
    if (!id || published.slice(0,10)<since) continue;
    raw.push({title:tag(entry,'title'),summary:tag(entry,'summary'),canonical_url:id,paper_url:id,source_type:'arxiv',source_name:'arXiv',owner:null,stars:0,published_at:published,updated_at:tag(entry,'updated')});
  }
  return {items:raw,truncated:(xmlText.match(/<entry>/g)||[]).length===100,limit:100};
}
async function discoverHuggingFace(since) {
  const data=await fetchWithRetry('https://huggingface.co/api/datasets?search=benchmark&sort=lastModified&direction=-1&limit=100').then((response)=>response.json());
  const raw=[];
  for (const item of data||[]) {
    const updated=String(item.lastModified||item.last_modified||'');
    if (updated.slice(0,10)<since) continue;
    raw.push({title:item.id||item.name,summary:[item.description,item.cardData?.pretty_name,(item.tags||[]).join(' ')].filter(Boolean).join(' '),canonical_url:`https://huggingface.co/datasets/${item.id}`,source_type:'huggingface',source_name:'Hugging Face datasets',owner:String(item.id||'').split('/')[0],stars:item.likes||0,published_at:item.createdAt||null,updated_at:updated});
  }
  return {items:raw,truncated:data.length===100,limit:100};
}

function markdown(state,newIds) {
  const active=state.candidates.filter((candidate)=>candidate.review_status==='candidate');
  return `# External evaluation candidates\n\nAutomated discovery queue checked ${state.checked_at}. Candidates are **not** catalogue entries and are not endorsed by FronteraEval. They require source, construct, implementation, and duplication review.\n\n- Active candidates: ${active.length}\n- New this run: ${newIds.length}\n- Sources completed: ${state.sources.filter((source)=>source.status==='ok').length}/${state.sources.length}\n\n${active.slice(0,50).map((candidate,index)=>`## ${index+1}. ${candidate.title}\n\n- Relevance score (not quality): ${candidate.score}\n- Classification hint: ${candidate.discovery_kind}\n- Origin: unresolved until editorial review\n- Source: ${candidate.source_type}\n- Topics: ${candidate.topics.join(', ')}\n- URL: ${candidate.canonical_url}\n- Why surfaced: ${candidate.reasons.join('; ')}\n- First seen: ${candidate.first_seen_at}\n\n${candidate.summary || ''}\n`).join('\n')}\n`;
}

export async function collectSources(tasks,now=new Date().toISOString()) {
  const sources=[],raw=[];
  for (const [name,fn] of tasks) {
    try {
      const result=await fn(); const items=Array.isArray(result)?result:result.items;
      raw.push(...items);
      sources.push({name,status:result.truncated?'partial':'ok',items:items.length,checked_at:now,
        ...(result.limit?{limit:result.limit}:{}),...(result.truncated?{note:'Results capped; source coverage is partial.'}:{})});
    } catch(error) { sources.push({name,status:'error',items:0,checked_at:now,error:error instanceof Error?error.message:String(error)}); }
  }
  return {sources,raw};
}
async function main() {
  const catalog=JSON.parse(await readFile(process.env.DISCOVERY_CATALOG_PATH || 'site/data/catalog.json','utf8'));
  let previous;
  try { previous=JSON.parse(await readFile(OUTPUT_JSON,'utf8')); }
  catch(error) { if(error.code!=='ENOENT') throw error; previous={candidates:[]}; }
  const checked_at=new Date().toISOString();
  const since=new Date(Date.now()-WINDOW_DAYS*86400000).toISOString().slice(0,10);
  const tasks=[
    ...GITHUB_QUERIES.map(query=>[`github-search:${query}`,()=>discoverGitHubQuery(query,since)]),
    ...[...TRUSTED_GITHUB_OWNERS].map(owner=>[`official-github:${owner}`,()=>discoverOfficialOwner(owner,since)]),
    ['arxiv',()=>discoverArxiv(since)],['huggingface',()=>discoverHuggingFace(since)]
  ];
  const {sources,raw}=await collectSources(tasks,checked_at);
  const candidates=mergeCandidates(raw,catalog,previous,checked_at);
  const previousIds=new Set((previous.candidates||[]).map(candidate=>candidate.id));
  const newIds=candidates.filter(candidate=>!previousIds.has(candidate.id)&&candidate.review_status==='candidate').map(candidate=>candidate.id);
  const state={schema_version:'2.0.0',checked_at,window_days:WINDOW_DAYS,min_score:MIN_SCORE,
    coverage:sources.every(source=>source.status==='ok')?'complete-within-configured-scope':'partial',
    catalogue_source_commit:catalog.inspect_source_commit || catalog.inspect_source_sha || null,
    sources,candidates,new_candidate_ids:newIds};
  await mkdir(dirname(OUTPUT_JSON),{recursive:true}); await mkdir(dirname(OUTPUT_MD),{recursive:true});
  // Persist every observation, including partial/total failures; never erase prior decisions or candidates.
  await writeFile(OUTPUT_JSON,`${JSON.stringify(state,null,2)}\n`);
  await writeFile(OUTPUT_MD,markdown(state,newIds));
  console.log(JSON.stringify({checked_at,raw_candidates:raw.length,active_candidates:candidates.filter(candidate=>candidate.review_status==='candidate').length,new_candidates:newIds.length,coverage:state.coverage,sources}));
  if (sources.some(source=>source.status==='error')) process.exitCode=2;
}

const isMain=process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if (isMain) main().catch((error)=>{console.error(error);process.exit(1)});
