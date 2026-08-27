import { mkdir, writeFile } from "node:fs/promises";

const REPO = "UKGovernmentBEIS/inspect_evals";
const registryURL = `https://raw.githubusercontent.com/${REPO}/main/src/inspect_evals/_registry.py`;
const treeURL = `https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`;
const checkedAt = new Date().toISOString();

const topics = {
  "autonomy-agents": { label: "Autonomy & agents", definition: "Tool use, long-horizon task completion, self-directed work and operation in external environments." },
  "ai-rd": { label: "AI R&D", definition: "Research engineering, model development and capabilities that may accelerate AI progress." },
  cyber: { label: "Cyber", definition: "Cybersecurity knowledge, vulnerability discovery, exploitation, defence and autonomous operations." },
  "bio-cbrn": { label: "Bio / CBRN", definition: "Hazardous biological, chemical, radiological or nuclear knowledge and operational assistance." },
  "deception-misalignment": { label: "Deception & misalignment", definition: "Scheming, covert action, strategic deception, sandbagging and misaligned agent behaviour." },
  "human-influence": { label: "Human influence & agency", definition: "Persuasion, manipulation, social engineering, trust formation and effects on human agency." },
  safeguards: { label: "Safeguards", definition: "Refusal, jailbreak robustness, harmful-response prevention, monitoring and defensive controls." },
  "evaluation-integrity": { label: "Evaluation integrity", definition: "Validity, contamination, elicitation, judge reliability, eval awareness and protocol integrity." },
  "general-capability": { label: "General capability", definition: "Reasoning, knowledge, coding, mathematics and broad task performance used as capability context." },
  multimodal: { label: "Multimodal", definition: "Evaluations requiring or assessing combinations of text, images, audio or other modalities." }
};

const canonical = [
  ["metr-time-horizons","METR Time Horizons","METR","https://metr.org/time-horizons/",["autonomy-agents","ai-rd"],"Measures the length of software tasks frontier systems can complete with a given success probability."],
  ["re-bench","RE-Bench","METR","https://github.com/METR/RE-Bench",["autonomy-agents","ai-rd"],"Evaluates AI agents on machine-learning research engineering tasks under controlled resource budgets."],
  ["arc-agi-2","ARC-AGI-2","ARC Prize Foundation","https://arcprize.org/arc-agi/2/",["general-capability","evaluation-integrity"],"Tests novel abstract reasoning and skill acquisition on tasks designed to resist memorised solutions."],
  ["terminal-bench","Terminal-Bench","Stanford / Laude Institute","https://www.tbench.ai/",["autonomy-agents","cyber"],"Evaluates agents completing real tasks in terminal environments."],
  ["frontiermath","FrontierMath","Epoch AI","https://epoch.ai/frontiermath",["general-capability","ai-rd"],"Expert-written advanced mathematics benchmark intended to remain difficult for frontier models."],
  ["ailuminate","AILuminate","MLCommons","https://mlcommons.org/ailuminate/",["safeguards"],"Standardised safety benchmark suite for hazardous and policy-relevant model responses."],
  ["harmbench","HarmBench","Center for AI Safety","https://www.harmbench.org/",["safeguards"],"Framework for automated red teaming and harmful-behaviour robustness."],
  ["jailbreakbench","JailbreakBench","JailbreakBench","https://jailbreakbench.github.io/",["safeguards","evaluation-integrity"],"Open benchmark for evaluating jailbreak attacks and model defences."],
  ["helm-safety","HELM Safety","Stanford CRFM","https://crfm.stanford.edu/helm/",["safeguards","evaluation-integrity"],"Scenario-based safety evaluation within the HELM framework."],
  ["safetybench","SafetyBench","THU-COAI","https://github.com/thu-coai/SafetyBench",["safeguards"],"Benchmark covering diverse safety-relevant knowledge and behaviour categories."],
  ["mm-safetybench","MM-SafetyBench","Research collaboration","https://github.com/isXinLiu/MM-SafetyBench",["safeguards","multimodal"],"Evaluates multimodal model safety under image-text attack settings."],
  ["webarena","WebArena","Carnegie Mellon University","https://webarena.dev/",["autonomy-agents"],"Evaluates autonomous agents on realistic tasks across self-hosted web environments."],
  ["visualwebarena","VisualWebArena","Carnegie Mellon University","https://jykoh.com/vwa",["autonomy-agents","multimodal"],"Extends web-agent evaluation to visually grounded tasks."],
  ["workarena","WorkArena","ServiceNow Research","https://github.com/ServiceNow/WorkArena",["autonomy-agents"],"Evaluates web agents on enterprise knowledge-work tasks."],
  ["agentboard","AgentBoard","HKUST NLP","https://github.com/hkust-nlp/AgentBoard",["autonomy-agents","evaluation-integrity"],"Multi-environment benchmark and analysis toolkit for language-model agents."],
  ["openai-evals","OpenAI Evals","OpenAI","https://github.com/openai/evals",["evaluation-integrity","general-capability"],"Framework and registry for evaluating language models and model systems."],
  ["lm-evaluation-harness","lm-evaluation-harness","EleutherAI","https://github.com/EleutherAI/lm-evaluation-harness",["evaluation-integrity","general-capability"],"Widely used evaluation harness covering a broad collection of language-model tasks."],
  ["inspect-ai","Inspect AI","UK AI Security Institute","https://inspect.aisi.org.uk/",["evaluation-integrity"],"Open-source framework for model evaluations including agents, tools and sandboxes."],
  ["wmdp","WMDP","Center for AI Safety","https://www.wmdp.ai/",["bio-cbrn","cyber"],"Measures hazardous knowledge in biosecurity, chemical security and cybersecurity."],
  ["anthropic-sabotage","Sabotage Evaluations","Anthropic","https://www.anthropic.com/research/sabotage-evaluations",["deception-misalignment","ai-rd"],"Evaluations for capabilities relevant to sabotaging oversight or research workflows."],
  ["deepmind-dangerous-capabilities","Dangerous Capability Evaluations","Google DeepMind","https://deepmind.google/frontier-safety/",["bio-cbrn","cyber","autonomy-agents"],"Evaluation suite spanning dangerous capabilities including autonomy, cyber and CBRN-related domains."],
  ["cyberseceval","CyberSecEval","Meta","https://github.com/meta-llama/PurpleLlama/tree/main/CybersecurityBenchmarks",["cyber","safeguards"],"Cybersecurity suite covering insecure code, exploitation, prompt injection and related risks."],
  ["agentdojo","AgentDojo","ETH Zurich","https://agentdojo.spylab.ai/",["autonomy-agents","safeguards"],"Dynamic environment for evaluating attacks and defences for tool-using agents."],
  ["agentharm","AgentHarm","Gray Swan AI + UK AI Security Institute","https://arxiv.org/abs/2410.09024",["autonomy-agents","safeguards"],"Evaluates whether language-model agents can execute harmful multi-step tasks."],
  ["tau-bench","τ-bench","Sierra Research","https://github.com/sierra-research/tau-bench",["autonomy-agents"],"Evaluates tool-using agents in realistic user-facing service domains."]
];

const reviewed = {
  "inspect:ape_eval": ["APE","Whether the evaluated model attempts persuasion across harmful, controversial, and benign topics in a simulated model-to-model interaction.","Persuasion effectiveness, human belief change, durable behaviour, covert deployment, campaign-scale targeting, or electoral outcomes.","Testing willingness to attempt persuasion and related safeguard behaviour under the APE protocol.","Claims that a model is effective at persuading people or can independently manipulate an electorate.",["controlled-model-behaviour"]],
  "inspect:mask": ["MASK","Behaviour related to honesty, belief expression and motivated reasoning in controlled scenarios.","Persuasion of external audiences or downstream behavioural effects.","Studying belief-reporting and honesty-related model behaviour.","Estimating manipulation effectiveness in deployment.",["controlled-model-behaviour"]],
  "inspect:makemesay": ["MakeMeSay","Ability to steer an interlocutor toward a hidden target phrase in a bounded dialogue game.","Real-world deception, durable belief change or harm at scale.","Studying strategic influence in controlled multi-turn interaction.","Claims about political persuasion or campaign effectiveness.",["controlled-model-behaviour"]],
  "inspect:make_me_pay": ["Make Me Pay","Instrumental social influence and task success in a synthetic payment interaction.","Human susceptibility, fraud prevalence or real-world financial harm.","Testing goal-directed influence strategies in agent interactions.","Estimating real human victimisation.",["controlled-model-behaviour"]],
  "inspect:sycophancy": ["Sycophancy","Sycophantic response tendencies under specified prompts.","Strategic manipulation, user belief change or autonomous targeting.","Assessing user-pleasing bias and epistemic reliability.","Claims about deliberate manipulation.",["controlled-model-behaviour"]],
  "inspect:agentic_misalignment": ["Agentic Misalignment","Specified harmful goal-directed actions under constructed incentives and access.","Base rates in ordinary deployment or long-run autonomous operation.","Stress-testing agentic systems under explicit conflict and opportunity.","Estimating real-world incident probability without deployment assumptions.",["controlled-model-behaviour","deployment-readiness"]],
  "inspect:sad_influence": ["SAD Influence","Model responses to cues about evaluation, oversight or influence.","Human persuasion or societal effects.","Probing situational awareness relevant to oversight and influence.","Claims of autonomous manipulation.",["controlled-model-behaviour"]],
  "register:machiavelli": ["MACHIAVELLI","Reward-seeking, power-related and ethically problematic choices in simulated games.","Real-world political manipulation or stable model preferences.","Comparing social decision-making and harmful strategy selection in simulations.","Inferring deployment intent or electoral impact.",["controlled-model-behaviour"]],
  "register:deceptionbench": ["DeceptionBench","Behaviour defined by the published deception protocol.","All forms of deception, real-world prevalence or downstream harm.","Protocol-specific comparison after checking the exact version.","A general deception score across model systems.",["controlled-model-behaviour"]],
  "register:manager_coercion_benchmark": ["Manager Coercion Benchmark","Protocol-specific coercive choices and communication.","Human behavioural effects or organisational incident rates.","Stress-testing influence behaviours in role-based scenarios.","Claims about real-world coercion prevalence.",["controlled-model-behaviour"]],
  "canonical:metr-time-horizons": ["METR Time Horizons","Task duration at specified success probabilities under METR's task distribution and elicitation.","General autonomy, open-ended replication or performance in every deployment environment.","Longitudinally tracking a defined slice of autonomous task capability.","A universal autonomy threshold without task-distribution qualifications.",["controlled-model-behaviour","deployment-readiness"]],
  "canonical:re-bench": ["RE-Bench","Performance on bounded machine-learning research engineering tasks under resource constraints.","Unbounded AI research autonomy or recursive self-improvement.","Assessing AI R&D task capability in a controlled environment.","Forecasting aggregate AI progress acceleration by itself.",["controlled-model-behaviour","deployment-readiness"]],
  "canonical:ailuminate": ["AILuminate","Response safety under the suite's prompts, taxonomy and scoring protocol.","All jailbreaks, agentic misuse or real-world incident probability.","Repeatable baseline safety assessment across models.","A complete safety case.",["controlled-model-behaviour"]],
  "canonical:wmdp": ["WMDP","Multiple-choice knowledge performance in designated hazardous domains.","Operational ability, intent, tool use or end-to-end harm creation.","Measuring hazardous knowledge and evaluating unlearning methods.","Claims that a model can execute a CBRN or cyber operation.",["artifact-production"]],
  "canonical:frontiermath": ["FrontierMath","Performance on difficult mathematics problems under a specified setup.","General intelligence, research autonomy or safety.","Tracking high-end mathematical reasoning with protocol qualifications.","Safety or dangerous-capability claims.",["artifact-production"]]
};

function prettify(value) {
  const fixed = { ape_eval:"APE", mask:"MASK", hle:"Humanity's Last Exam", gpqa_diamond:"GPQA Diamond", wmdp_bio:"WMDP Bio", wmdp_chem:"WMDP Chem", wmdp_cyber:"WMDP Cyber", osworld:"OSWorld", xstest:"XSTest", bfcl:"BFCL" };
  if (fixed[value]) return fixed[value];
  return value.split(/[-_]/).map(w => ["ai","gdm","cti","cve","qa","vqa","mmlu","arc","agi","mcp","ctf"].includes(w) ? w.toUpperCase() : w.slice(0,1).toUpperCase()+w.slice(1)).join(" ");
}

function classify(name) {
  const s=name.toLowerCase(), out=[];
  const rules=[
    ["human-influence",["ape","mask","makemesay","make_me_pay","sycoph","influence","persu","coercion","machiavelli","deceptionbench"]],
    ["deception-misalignment",["misalignment","stealth","self_reasoning","alignment_faking","deception","sandbag","instrumental","cover_your_tracks","strategic_rule","oversight_pattern"]],
    ["autonomy-agents",["agent","osworld","gaia","paperbench","theagentcompany","tau2","browse_comp","assistant_bench","mind2web","appworld","workarena","webarena","manta","wildclaw"]],
    ["ai-rd",["paperbench","mle_bench","mlrc","frontier_cs_research"]],
    ["cyber",["cyber","cve","cti","cybench","ctf","exploit","ipi_coding","mitre","malware","phishing"]],
    ["bio-cbrn",["wmdp_bio","wmdp_chem","lab_bench","chembench","bixbench"]],
    ["safeguards",["strong_reject","xstest","do_not_answer","salad","jailbreak","harm","ailuminate","safety","air_bench","coconot","fortress","mcptox","narcbench"]],
    ["evaluation-integrity",["pre_flight","judge","livebench","zerobench","arxivroll","monitorbench","abstention","truthfulqa"]],
    ["multimodal",["visual","mmmu","mathvista","docvqa","vqa","image","multimodal"]]
  ];
  for (const [topic, needles] of rules) if (needles.some(n=>s.includes(n))) out.push(topic);
  return out.length ? [...new Set(out)] : ["general-capability"];
}

function parseRegistry(text, sha) {
  const entries=[]; let module="", collecting=false;
  for (const raw of text.split(/\r?\n/)) {
    const line=raw.trim();
    const multi=line.match(/^from inspect_evals\.([A-Za-z0-9_]+) import \($/);
    const single=line.match(/^from inspect_evals\.([A-Za-z0-9_]+) import (.+)$/);
    if (multi) { module=multi[1]; collecting=true; continue; }
    if (single) { for (const task of single[2].split(",").map(x=>x.trim()).filter(Boolean)) entries.push([task,single[1]]); continue; }
    if (collecting && line===")") { collecting=false; module=""; continue; }
    if (collecting && /^[A-Za-z0-9_]+,?$/.test(line)) entries.push([line.replace(/,$/,""),module]);
  }
  return entries.map(([task,module])=>record(`inspect:${task}`,prettify(task),"Origin pending source resolution","inspect-internal",`https://github.com/${REPO}/tree/${sha}/src/inspect_evals/${module}`,classify(task),`Inspect task imported from the ${module} implementation package.`,"imported",sha));
}

function record(id,name,organisation,source_type,source_url,topicList,description,review_status,sha=null) {
  const r={id,name,slug:id.replace(":","--").replaceAll("_","-"),organisation,source_type,source_url,topics:topicList,description,review_status,code_available:source_type!=="canonical-source",inspect_compatible:source_type.startsWith("inspect-"),last_source_check:checkedAt.slice(0,10),editorial_reviewed_at:null,measures:"Not independently assessed by FronteraEval yet.",does_not_measure:"No inference beyond the upstream source should be made until the protocol is reviewed.",best_for:"Discovery and source navigation.",not_sufficient_for:"Substantive capability, safety or policy claims without reading the underlying protocol.",evidence_reach:[],provenance:{source_sha:sha,method:"official-source import"}};
  const ed=reviewed[id];
  if (ed) { r.name=ed[0]; r.measures=ed[1]; r.does_not_measure=ed[2]; r.best_for=ed[3]; r.not_sufficient_for=ed[4]; r.evidence_reach=ed[5]; r.review_status="reviewed"; r.editorial_reviewed_at=checkedAt.slice(0,10); }
  return r;
}

async function fetchText(url) { const r=await fetch(url,{headers:{"user-agent":"FronteraEval/0.1"}}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }
async function fetchJSON(url) { const r=await fetch(url,{headers:{accept:"application/vnd.github+json","user-agent":"FronteraEval/0.1"}}); if(!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }

const [registryText, tree] = await Promise.all([fetchText(registryURL), fetchJSON(treeURL)]);
const sha=String(tree.sha);
const internal=parseRegistry(registryText,sha);
const registerNames=(tree.tree||[]).map(x=>String(x.path||"").match(/^register\/([^/]+)\/eval\.yaml$/)?.[1]).filter(Boolean).filter(x=>x!=="example_eval").sort();
const registerRecords=registerNames.map(name=>record(`register:${name}`,prettify(name),"Upstream authors / Inspect Evals Register","inspect-register",`https://github.com/${REPO}/blob/${sha}/register/${name}/eval.yaml`,classify(name),"Externally maintained evaluation registered for discovery and execution through Inspect.","catalogued",sha));
const canonicalRecords=canonical.map(([slug,name,org,url,t,description])=>record(`canonical:${slug}`,name,org,"canonical-source",url,t,description,"catalogued"));
const records=[...internal,...registerRecords,...canonicalRecords].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
if (new Set(records.map(r=>r.id)).size!==records.length) throw new Error("Duplicate stable IDs");
const sourceCounts={}, statusCounts={}; for(const r of records){sourceCounts[r.source_type]=(sourceCounts[r.source_type]||0)+1;statusCounts[r.review_status]=(statusCounts[r.review_status]||0)+1;}
const catalog={schema_version:"0.1.0",generated_at:checkedAt,inspect_source_sha:sha,title:"FronteraEval evaluation catalogue",scope_note:"Discovery metadata is not independent validation. Only records marked reviewed contain a bounded FronteraEval assessment.",topics,stats:{records:records.length,sources:sourceCounts,review_status:statusCounts},records};
await mkdir("site/data",{recursive:true});
await writeFile("site/data/catalog.json",JSON.stringify(catalog,null,2)+"\n");
const quote=v=>`"${String(v??"").replaceAll('"','""')}"`;
const header=["id","name","organisation","source_type","topics","review_status","code_available","inspect_compatible","source_url","last_source_check"];
const csv=[header,...records.map(r=>[r.id,r.name,r.organisation,r.source_type,r.topics.join("|"),r.review_status,r.code_available,r.inspect_compatible,r.source_url,r.last_source_check])].map(row=>row.map(quote).join(",")).join("\n")+"\n";
await writeFile("site/data/catalog.csv",csv);
await writeFile("site/data/freshness.json",JSON.stringify({status:"current-build",checked_at:checkedAt,inspect_source_sha:sha,internal_tasks:internal.length,external_register_entries:registerRecords.length,canonical_sources:canonicalRecords.length},null,2)+"\n");
console.log(JSON.stringify(catalog.stats));
