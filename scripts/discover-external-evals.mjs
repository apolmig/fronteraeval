import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const OUTPUT_JSON = 'discovery/external-candidates.json';
const OUTPUT_MD = 'discovery/external-candidates.md';
const WINDOW_DAYS = Math.max(7, Math.min(60, Number(process.env.DISCOVERY_WINDOW_DAYS || 21)));
const MIN_SCORE = Math.max(4, Number(process.env.DISCOVERY_MIN_SCORE || 6));
const MAX_CANDIDATES = 80;
const USER_AGENT = 'FronteraEval/0.9 (+https://fronteraeval.org; external-eval-discovery)';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const TRUSTED_GITHUB_OWNERS = new Set([
  'ukgovernmentbeis','metr','openai','anthropics','google-deepmind','mlcommons',
  'centerforaisafety','stanford-crfm','sierra-research','laude-institute',
  'servicenow','epoch-research','arcprize','grayswanai','meta-llama','eleutherai',
  'alignmentresearch','far-ai','farama-foundation','thu-coai','hkust-nlp'
]);

const PRIMARY_TERMS = [
  'benchmark','evaluation',' eval ','evals','red team','red-team','assessment','test suite','safety suite'
];
const AI_TERMS = [
  'llm','language model','foundation model','frontier model','ai agent','agentic ai',
  'multimodal model','generative ai','artificial intelligence','model safety','model capability'
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
    url.searchParams.delete('utm_source'); url.searchParams.delete('utm_medium'); url.searchParams.delete('utm_campaign');
    return url.toString().replace(/\/$/,'');
  } catch { return null; }
}
export function classifyTopics(text='') {
  const haystack=collapse(text).toLowerCase();
  const result=[];
  for (const [topic,terms] of Object.entries(TOPIC_RULES)) if (terms.some((term)=>haystack.includes(term))) result.push(topic);
  return result.length ? result : ['general-capability'];
}
function titleSimilarity(a,b) {
  const left=new Set(normaliseTitle(a).split(' ').filter(Boolean));
  const right=new Set(normaliseTitle(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection=[...left].filter((token)=>right.has(token)).length;
  return intersection / Math.max(left.size,right.size);
}
export function scoreCandidate({title='', summary='', owner='', stars=0, sourceType=''}) {
  const text=` ${title} ${summary} `.toLowerCase();
  if (EXCLUDE_TERMS.some((term)=>text.includes(term))) return {score:0,reasons:['excluded generic resource']};
  const reasons=[]; let score=0;
  const primary=PRIMARY_TERMS.filter((term)=>text.includes(term.trim()));
  const ai=AI_TERMS.filter((term)=>text.includes(term));
  if (primary.length) { score+=3; reasons.push(`evaluation signal: ${primary.slice(0,2).join(', ')}`); }
  if (ai.length) { score+=2; reasons.push(`AI-system signal: ${ai.slice(0,2).join(', ')}`); }
  const topics=classifyTopics(text);
  if (topics.some((topic)=>topic!=='general-capability')) { score+=2; reasons.push(`risk/capability topic: ${topics.filter((t)=>t!=='general-capability').slice(0,3).join(', ')}`); }
  if (TRUSTED_GITHUB_OWNERS.has(String(owner).toLowerCase())) { score+=3; reasons.push('known evaluation organisation'); }
  if (Number(stars)>=10) { score+=2; reasons.push('public adoption signal'); }
  else if (Number(stars)>=2) { score+=1; reasons.push('initial public adoption signal'); }
  if (sourceType==='arxiv') { score+=1; reasons.push('research-paper source'); }
  if (sourceType==='official-github') { score+=1; reasons.push('official organisation repository'); }
  return {score,reasons,topics};
}
function candidateId(url,title) {
  return createHash('sha256').update(`${normaliseURL(url)||''}|${normaliseTitle(title)}`).digest('hex').slice(0,16);
}
function knownIndex(catalog) {
  const urls=new Set(), titles=[];
  for (const record of catalog.records || []) {
    titles.push(record.name,record.family_title,record.paper_title,record.paper?.title);
    const links=[record.source_url,record.preferred_source?.url,record.paper_url,record.paper?.url,record.code_url,record.reference_implementation?.url,...(record.links||[]).map((link)=>link.url)];
    for (const link of links) { const value=normaliseURL(link); if(value) urls.add(value); }
  }
  return {urls,titles:titles.filter(Boolean)};
}
export function isKnownCandidate(candidate,known) {
  const url=normaliseURL(candidate.canonical_url);
  if (url && known.urls.has(url)) return true;
  const title=normaliseTitle(candidate.title);
  if (!title) return false;
  return known.titles.some((existing)=>{
    const norm=normaliseTitle(existing);
    return norm===title || (Math.min(norm.length,title.length)>10 && titleSimilarity(norm,title)>=0.84);
  });
}
function canonicalCandidate(raw) {
  const canonical_url=normaliseURL(raw.canonical_url || raw.repository_url || raw.paper_url || raw.url);
  if (!canonical_url || !raw.title) return null;
  const scored=scoreCandidate({title:raw.title,summary:raw.summary,owner:raw.owner,stars:raw.stars,sourceType:raw.source_type});
  return {
    id:candidateId(canonical_url,raw.title),
    title:collapse(raw.title),
    canonical_url,
    source_type:raw.source_type,
    source_name:raw.source_name || raw.owner || raw.source_type,
    owner:raw.owner || null,
    summary:collapse(raw.summary).slice(0,700),
    repository_url:normaliseURL(raw.repository_url),
    paper_url:normaliseURL(raw.paper_url),
    published_at:raw.published_at || null,
    updated_at:raw.updated_at || raw.published_at || null,
    stars:Number(raw.stars || 0),
    score:scored.score,
    reasons:scored.reasons,
    topics:scored.topics || classifyTopics(`${raw.title} ${raw.summary}`),
    review_status:'candidate'
  };
}
export function mergeCandidates(rawCandidates,catalog,previous={}) {
  const known=knownIndex(catalog);
  const previousMap=new Map((previous.candidates||[]).map((candidate)=>[candidate.id,candidate]));
  const merged=new Map();
  for (const raw of rawCandidates) {
    const candidate=canonicalCandidate(raw);
    if (!candidate || candidate.score<MIN_SCORE || isKnownCandidate(candidate,known)) continue;
    const old=previousMap.get(candidate.id);
    const combined={...old,...candidate,review_status:old?.review_status || 'candidate',first_seen_at:old?.first_seen_at || new Date().toISOString(),last_seen_at:new Date().toISOString()};
    if (combined.review_status==='dismissed' || combined.review_status==='accepted') continue;
    const existing=merged.get(candidate.id);
    if (!existing || candidate.score>existing.score) merged.set(candidate.id,combined);
  }
  for (const old of previous.candidates||[]) {
    if (!merged.has(old.id) && old.review_status==='candidate') merged.set(old.id,old);
  }
  return [...merged.values()].sort((a,b)=>b.score-a.score || String(b.updated_at||'').localeCompare(String(a.updated_at||'')) || a.title.localeCompare(b.title)).slice(0,MAX_CANDIDATES);
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
async function discoverGitHub(since) {
  const queries=[
    `"llm benchmark" in:name,description,readme created:>=${since}`,
    `"ai agent benchmark" in:name,description,readme created:>=${since}`,
    `"ai safety benchmark" in:name,description,readme created:>=${since}`,
    `"frontier model evaluation" in:name,description,readme created:>=${since}`,
    `"language model evaluation" in:name,description created:>=${since}`
  ];
  const raw=[];
  for (const query of queries) {
    const data=await githubJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=50`);
    for (const repo of data.items||[]) if (!repo.fork && !repo.archived) raw.push({title:repo.name,summary:repo.description||'',canonical_url:repo.html_url,repository_url:repo.html_url,source_type:'github-search',source_name:'GitHub repository search',owner:repo.owner?.login,stars:repo.stargazers_count,published_at:repo.created_at,updated_at:repo.updated_at});
  }
  return raw;
}
async function discoverOfficialGitHub(since) {
  const raw=[];
  for (const owner of TRUSTED_GITHUB_OWNERS) {
    try {
      const data=await githubJSON(`https://api.github.com/users/${encodeURIComponent(owner)}/repos?sort=updated&direction=desc&per_page=100&type=public`);
      for (const repo of data||[]) {
        if (repo.fork || repo.archived || String(repo.updated_at||'').slice(0,10)<since) continue;
        raw.push({title:repo.name,summary:repo.description||'',canonical_url:repo.html_url,repository_url:repo.html_url,source_type:'official-github',source_name:`GitHub: ${repo.owner?.login}`,owner:repo.owner?.login,stars:repo.stargazers_count,published_at:repo.created_at,updated_at:repo.updated_at});
      }
    } catch { /* one unavailable organisation must not abort discovery */ }
  }
  return raw;
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
  return raw;
}
async function discoverHuggingFace(since) {
  const data=await fetchWithRetry('https://huggingface.co/api/datasets?search=benchmark&sort=lastModified&direction=-1&limit=100').then((response)=>response.json());
  const raw=[];
  for (const item of data||[]) {
    const updated=String(item.lastModified||item.last_modified||'');
    if (updated.slice(0,10)<since) continue;
    raw.push({title:item.id||item.name,summary:[item.description,item.cardData?.pretty_name,(item.tags||[]).join(' ')].filter(Boolean).join(' '),canonical_url:`https://huggingface.co/datasets/${item.id}`,source_type:'huggingface',source_name:'Hugging Face datasets',owner:String(item.id||'').split('/')[0],stars:item.likes||0,published_at:item.createdAt||null,updated_at:updated});
  }
  return raw;
}

function markdown(state,newIds) {
  const active=state.candidates.filter((candidate)=>candidate.review_status==='candidate');
  return `# External evaluation candidates\n\nAutomated discovery queue checked ${state.checked_at}. Candidates are **not** catalogue entries and are not endorsed by FronteraEval. They require source, construct, implementation, and duplication review.\n\n- Active candidates: ${active.length}\n- New this run: ${newIds.length}\n- Sources completed: ${state.sources.filter((source)=>source.status==='ok').length}/${state.sources.length}\n\n${active.slice(0,50).map((candidate,index)=>`## ${index+1}. ${candidate.title}\n\n- Score: ${candidate.score}\n- Source: ${candidate.source_type}\n- Topics: ${candidate.topics.join(', ')}\n- URL: ${candidate.canonical_url}\n- Why surfaced: ${candidate.reasons.join('; ')}\n- First seen: ${candidate.first_seen_at}\n\n${candidate.summary || ''}\n`).join('\n')}\n`;
}

async function main() {
  const catalog=JSON.parse(await readFile('site/data/catalog.json','utf8'));
  const previous=JSON.parse(await readFile(OUTPUT_JSON,'utf8').catch(()=>'{"schema_version":"1.0.0","candidates":[]}'));
  const since=new Date(Date.now()-WINDOW_DAYS*86400000).toISOString().slice(0,10);
  const sources=[]; const raw=[];
  for (const [name,fn] of [['github-search',()=>discoverGitHub(since)],['official-github',()=>discoverOfficialGitHub(since)],['arxiv',()=>discoverArxiv(since)],['huggingface',()=>discoverHuggingFace(since)]]) {
    try { const items=await fn(); raw.push(...items); sources.push({name,status:'ok',items:items.length}); }
    catch (error) { sources.push({name,status:'error',items:0,error:error instanceof Error?error.message:String(error)}); }
  }
  if (!sources.some((source)=>source.status==='ok')) throw new Error('All external discovery sources failed');
  const candidates=mergeCandidates(raw,catalog,previous);
  const previousIds=new Set((previous.candidates||[]).map((candidate)=>candidate.id));
  const newIds=candidates.filter((candidate)=>!previousIds.has(candidate.id)).map((candidate)=>candidate.id);
  const meaningfulPrevious=JSON.stringify((previous.candidates||[]).map(({last_seen_at,...candidate})=>candidate));
  const meaningfulNext=JSON.stringify(candidates.map(({last_seen_at,...candidate})=>candidate));
  const checked_at=new Date().toISOString();
  const state={schema_version:'1.0.0',checked_at:meaningfulPrevious===meaningfulNext?(previous.checked_at||checked_at):checked_at,window_days:WINDOW_DAYS,min_score:MIN_SCORE,sources,candidates,new_candidate_ids:newIds};
  await mkdir('discovery',{recursive:true});
  if (meaningfulPrevious!==meaningfulNext || !previous.schema_version) {
    await writeFile(OUTPUT_JSON,`${JSON.stringify(state,null,2)}\n`);
    await writeFile(OUTPUT_MD,markdown(state,newIds));
  }
  console.log(JSON.stringify({checked_at,raw_candidates:raw.length,active_candidates:candidates.length,new_candidates:newIds.length,sources}));
}

const isMain=process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if (isMain) main().catch((error)=>{console.error(error);process.exit(1)});
