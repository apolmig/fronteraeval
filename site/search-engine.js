(() => {
  "use strict";

  const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what",
    "which", "with"
  ]);

  const TOKEN_ALIASES = {
    autonomous: "autonomy",
    autonomy: "autonomy",
    agentic: "agent",
    agents: "agent",
    persuasive: "persuasion",
    persuade: "persuasion",
    persuading: "persuasion",
    manipulative: "manipulation",
    manipulating: "manipulation",
    deceptive: "deception",
    deceiving: "deception",
    dishonest: "dishonesty",
    robust: "robustness",
    safeguards: "safeguard",
    safety: "safeguard",
    cybersecurity: "cyber",
    biological: "bio",
    chemical: "chem",
    evaluations: "evaluation",
    benchmarks: "benchmark"
  };

  const INTENTS = [
    {
      id: "harmful-manipulation",
      label: "Harmful manipulation and influence",
      triggers: [
        "harmful manipulation", "manipulation", "manipulative influence",
        "political manipulation", "covert persuasion", "influence operation",
        "social engineering", "targeted persuasion", "human influence"
      ],
      topics: { "human-influence": 14, "deception-misalignment": 5, safeguards: 2 },
      anchors: {
        "inspect:ape_eval": 15,
        "inspect:makemesay": 14,
        "inspect:make_me_pay": 14,
        "inspect:sycophancy": 8,
        "register:machiavelli": 9,
        "register:deceptionbench": 9,
        "register:manager_coercion_benchmark": 9
      },
      terms: {
        persuasion: 5,
        manipulation: 7,
        influence: 5,
        "social engineering": 7,
        coercion: 5,
        deception: 3,
        sycophancy: 3,
        trust: 2,
        targeting: 2,
        "make me say": 8,
        "make me pay": 8
      },
      note: "Expanded to adjacent constructs such as persuasion, social engineering, coercion, deception, and sycophancy. Related results are not equivalent measures."
    },
    {
      id: "autonomous-ai-rd",
      label: "Autonomous AI R&D",
      triggers: [
        "autonomous r&d", "autonomous rd", "autonomous ai r&d",
        "ai r&d", "ai research and development", "autonomous research",
        "automated ai research", "research automation", "research engineering agents"
      ],
      topics: { "ai-rd": 16, "autonomy-agents": 8 },
      anchors: {
        "canonical:re-bench": 16,
        "canonical:metr-time-horizons": 8,
        "inspect:paperbench": 14,
        "inspect:mle_bench": 12,
        "inspect:frontier_cs_research": 12,
        "inspect:mlrc": 10
      },
      terms: {
        "research engineering": 8,
        "machine learning research": 7,
        "software engineering": 5,
        "ai research": 7,
        "long horizon": 3,
        paperbench: 9,
        "re bench": 10,
        "mle bench": 9,
        agent: 2
      },
      note: "Expanded to AI-research engineering, autonomous agents, long-horizon work, and software or machine-learning research tasks."
    },
    {
      id: "jailbreak-robustness",
      label: "Jailbreak and safeguard robustness",
      triggers: [
        "jailbreak robustness", "jailbreak", "refusal robustness",
        "safeguard robustness", "safety bypass", "refusal bypass",
        "adversarial prompts", "prompt injection"
      ],
      topics: { safeguards: 14, "evaluation-integrity": 4, cyber: 1 },
      anchors: {
        "canonical:jailbreakbench": 16,
        "canonical:harmbench": 14,
        "inspect:strong_reject": 12,
        "inspect:xstest": 8,
        "canonical:agentdojo": 7
      },
      terms: {
        jailbreak: 8,
        refusal: 6,
        robustness: 5,
        safeguard: 5,
        "prompt injection": 7,
        adversarial: 4,
        "red teaming": 4,
        bypass: 5
      },
      note: "Expanded to jailbreak attacks, refusal behaviour, prompt injection, red teaming, and safeguard robustness."
    },
    {
      id: "scheming-deception",
      label: "Scheming and strategic deception",
      triggers: [
        "scheming", "strategic deception", "deceptive alignment", "alignment faking",
        "sandbagging", "covert action", "agentic misalignment", "oversight evasion"
      ],
      topics: { "deception-misalignment": 15, "evaluation-integrity": 2 },
      anchors: {
        "inspect:agentic_misalignment": 14,
        "register:deceptionbench": 12,
        "inspect:gdm_classifier_evasion": 10,
        "inspect:gdm_cover_your_tracks": 10,
        "inspect:gdm_oversight_pattern": 10,
        "inspect:gdm_strategic_rule_breaking": 10
      },
      terms: {
        scheming: 8,
        deception: 7,
        covert: 4,
        sandbagging: 6,
        "alignment faking": 7,
        oversight: 4,
        misalignment: 5
      },
      note: "Expanded to strategic deception, alignment faking, sandbagging, oversight evasion, and agentic misalignment."
    },
    {
      id: "autonomous-agents",
      label: "Autonomous agents and long-horizon tasks",
      triggers: [
        "autonomous agents", "agentic capability", "long horizon tasks",
        "computer use agents", "web agents", "tool using agents", "autonomy"
      ],
      topics: { "autonomy-agents": 15, "ai-rd": 4 },
      anchors: {
        "canonical:metr-time-horizons": 10,
        "canonical:webarena": 8,
        "canonical:workarena": 8,
        "canonical:terminal-bench": 8,
        "canonical:tau-bench": 8
      },
      terms: {
        autonomy: 7,
        agent: 6,
        "long horizon": 6,
        tools: 3,
        browser: 3,
        terminal: 4,
        web: 3
      },
      note: "Expanded to tool-using agents, web and terminal environments, and long-horizon task completion."
    },
    {
      id: "cyber-capability",
      label: "Cyber capability and security",
      triggers: [
        "cyber capability", "cybersecurity", "cyber exploitation",
        "vulnerability discovery", "offensive cyber", "cyber agents"
      ],
      topics: { cyber: 16, "autonomy-agents": 2, safeguards: 2 },
      anchors: {
        "canonical:cyberseceval": 12,
        "canonical:wmdp": 7,
        "canonical:terminal-bench": 5
      },
      terms: {
        cyber: 8,
        vulnerability: 6,
        exploit: 6,
        malware: 4,
        phishing: 4,
        ctf: 4,
        insecure: 3
      },
      note: "Expanded to vulnerability discovery, exploitation, malware, phishing, and autonomous cyber tasks."
    },
    {
      id: "bio-cbrn",
      label: "Biological and CBRN capability",
      triggers: [
        "bio capability", "biological risk", "cbrn", "chemical risk",
        "hazardous biology", "bioweapons", "biosecurity"
      ],
      topics: { "bio-cbrn": 16 },
      anchors: {
        "canonical:wmdp": 12,
        "canonical:deepmind-dangerous-capabilities": 8
      },
      terms: {
        bio: 8,
        biological: 7,
        cbrn: 8,
        chemical: 6,
        hazardous: 3,
        biosecurity: 6
      },
      note: "Expanded to hazardous biological or chemical knowledge, biosecurity, and CBRN-relevant assistance."
    }
  ];

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\bai\s*r\s*&\s*d\b/g, "ai research and development")
      .replace(/\br\s*&\s*d\b/g, "research and development")
      .replace(/&/g, " and ")
      .replace(/[_/–—-]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function canonicalToken(token) {
    const clean = normalize(token);
    if (!clean) return "";
    if (TOKEN_ALIASES[clean]) return TOKEN_ALIASES[clean];
    if (clean.length > 5 && clean.endsWith("ies")) return `${clean.slice(0, -3)}y`;
    if (clean.length > 5 && clean.endsWith("ing")) return clean.slice(0, -3);
    if (clean.length > 4 && clean.endsWith("ed")) return clean.slice(0, -2);
    if (clean.length > 4 && clean.endsWith("s") && !clean.endsWith("ss")) return clean.slice(0, -1);
    return clean;
  }

  function tokenize(value) {
    return normalize(value)
      .split(" ")
      .map(canonicalToken)
      .filter((token) => token && !STOPWORDS.has(token));
  }

  function trigrams(value) {
    const text = `  ${value} `;
    const grams = new Set();
    for (let index = 0; index < text.length - 2; index += 1) grams.add(text.slice(index, index + 3));
    return grams;
  }

  function diceSimilarity(left, right) {
    if (left === right) return 1;
    if (left.length < 4 || right.length < 4) return 0;
    const a = trigrams(left);
    const b = trigrams(right);
    let overlap = 0;
    for (const gram of a) if (b.has(gram)) overlap += 1;
    return (2 * overlap) / (a.size + b.size || 1);
  }

  function tokenSimilarity(queryToken, fieldToken) {
    const query = canonicalToken(queryToken);
    const field = canonicalToken(fieldToken);
    if (!query || !field) return 0;
    if (query === field) return 1;
    if (Math.min(query.length, field.length) >= 4 && (query.startsWith(field) || field.startsWith(query))) return 0.82;
    const fuzzy = diceSimilarity(query, field);
    return fuzzy >= 0.72 ? 0.48 + (fuzzy * 0.36) : 0;
  }

  function flatten(value) {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
    return value == null ? [] : [String(value)];
  }

  function topicName(id, topicLabels = {}) {
    return topicLabels[id] || String(id || "").replaceAll("-", " ");
  }

  function recordFields(record, topicLabels = {}) {
    const tasks = (record.tasks || []).flatMap((task) => [task?.name, task?.task_path, task?.dataset_samples]);
    const links = (record.links || []).flatMap((link) => [link?.label, link?.kind]);
    const aliases = [record.full_title, record.common_title, record.paper_title, record.title];
    const taxonomy = [
      ...(record.topics || []).map((topic) => topicName(topic, topicLabels)),
      record.group,
      record.record_type,
      record.family_title,
      ...(record.tags || []),
      record.dependency
    ];
    return [
      { key: "name", label: "title", weight: 12, text: record.name },
      { key: "aliases", label: "paper or alias", weight: 8, text: aliases.join(" ") },
      { key: "taxonomy", label: "topic", weight: 8, text: taxonomy.join(" ") },
      { key: "tasks", label: "task or implementation", weight: 6, text: tasks.join(" ") },
      { key: "description", label: "description", weight: 5, text: record.description },
      { key: "editorial", label: "reviewed interpretation", weight: 4, text: [record.measures, record.best_for].join(" ") },
      { key: "limits", label: "inference limit", weight: 1.8, text: [record.does_not_measure, record.not_sufficient_for].join(" ") },
      { key: "organisation", label: "organisation", weight: 1.4, text: record.organisation },
      { key: "resources", label: "source metadata", weight: 1.2, text: links.join(" ") },
      { key: "metadata", label: "metadata", weight: 1, text: flatten(record.metadata).join(" ") }
    ].map((field) => ({ ...field, normalized: normalize(field.text), tokens: tokenize(field.text) }));
  }

  function triggerSimilarity(query, trigger) {
    const queryText = normalize(query);
    const triggerText = normalize(trigger);
    if (!queryText || !triggerText) return 0;
    if (queryText === triggerText) return 1;
    if (queryText.includes(triggerText) || triggerText.includes(queryText)) return Math.min(queryText.length, triggerText.length) >= 6 ? 0.92 : 0.72;
    const queryTokens = new Set(tokenize(queryText));
    const triggerTokens = new Set(tokenize(triggerText));
    if (!queryTokens.size || !triggerTokens.size) return 0;
    let overlap = 0;
    for (const token of queryTokens) if (triggerTokens.has(token)) overlap += 1;
    const precision = overlap / queryTokens.size;
    const recall = overlap / triggerTokens.size;
    return precision && recall ? (2 * precision * recall) / (precision + recall) : 0;
  }

  function detectIntents(query) {
    return INTENTS
      .map((intent) => ({
        intent,
        confidence: Math.max(...intent.triggers.map((trigger) => triggerSimilarity(query, trigger)))
      }))
      .filter(({ confidence }) => confidence >= 0.72)
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 2);
  }

  function bestTokenMatch(queryToken, fields) {
    let best = { score: 0, reason: null };
    for (const field of fields) {
      for (const token of field.tokens) {
        const similarity = tokenSimilarity(queryToken, token);
        const score = similarity * field.weight;
        if (score > best.score) best = { score, reason: field.label };
      }
    }
    return best;
  }

  function lexicalScore(record, query, topicLabels) {
    const normalizedQuery = normalize(query);
    const queryTokens = tokenize(query);
    const fields = recordFields(record, topicLabels);
    let score = 0;
    let matched = 0;
    const reasons = [];

    for (const field of fields) {
      if (normalizedQuery.length >= 3 && field.normalized.includes(normalizedQuery)) {
        score += field.weight * (field.key === "name" ? 2.4 : 1.65);
        reasons.push(`Exact ${field.label} match`);
      }
    }

    for (const token of queryTokens) {
      const best = bestTokenMatch(token, fields);
      if (best.score > 0) {
        score += best.score;
        matched += 1;
        if (best.reason) reasons.push(`Matched ${best.reason}`);
      }
    }

    if (queryTokens.length) {
      const coverage = matched / queryTokens.length;
      score *= 0.55 + (0.45 * coverage);
      if (coverage === 1 && queryTokens.length > 1) score += 2.5;
    }

    return { score, reasons };
  }

  function intentScore(record, detectedIntents, topicLabels) {
    let score = 0;
    const reasons = [];
    const fields = recordFields(record, topicLabels);
    const allText = fields.map((field) => field.normalized).join(" ");

    for (const { intent, confidence } of detectedIntents) {
      const confidenceWeight = 0.75 + (0.25 * confidence);
      let intentContribution = 0;

      for (const topic of record.topics || []) {
        const boost = intent.topics?.[topic] || 0;
        if (boost) {
          intentContribution += boost;
          reasons.push(`${intent.label}: ${topicName(topic, topicLabels)}`);
        }
      }

      const anchorBoost = intent.anchors?.[record.id] || 0;
      if (anchorBoost) {
        intentContribution += anchorBoost;
        reasons.push(`${intent.label}: core evaluation`);
      }

      for (const [term, weight] of Object.entries(intent.terms || {})) {
        if (allText.includes(normalize(term))) intentContribution += weight;
      }

      score += intentContribution * confidenceWeight;
    }

    return { score, reasons };
  }

  function uniqueReasons(reasons) {
    const seen = new Set();
    return reasons.filter((reason) => {
      if (!reason || seen.has(reason)) return false;
      seen.add(reason);
      return true;
    }).slice(0, 3);
  }

  function passesFilters(record, filters = {}) {
    return (!filters.topic || record.topics?.includes(filters.topic))
      && (!filters.status || record.review_status === filters.status)
      && (!filters.source || record.source_type === filters.source);
  }

  function search(records, query, options = {}) {
    const topicLabels = options.topicLabels || {};
    const filters = options.filters || {};
    const normalizedQuery = normalize(query);
    const detectedIntents = normalizedQuery ? detectIntents(query) : [];
    const filtered = records.filter((record) => passesFilters(record, filters));

    if (!normalizedQuery) {
      return {
        results: filtered.map((record) => ({ record, score: 0, reasons: [] })),
        interpretation: null
      };
    }

    const scored = filtered.map((record) => {
      const lexical = lexicalScore(record, query, topicLabels);
      const semantic = intentScore(record, detectedIntents, topicLabels);
      const reviewBonus = record.review_status === "reviewed" ? 0.8 : record.review_status === "catalogued" ? 0.25 : 0;
      const sourceBonus = Math.min(0.5, ((record.links || []).length - 1) * 0.08);
      return {
        record,
        score: lexical.score + semantic.score + reviewBonus + sourceBonus,
        reasons: uniqueReasons([...semantic.reasons, ...lexical.reasons])
      };
    });

    const threshold = detectedIntents.length ? 4 : tokenize(query).length <= 1 ? 2.25 : 3;
    let results = scored.filter((entry) => entry.score >= threshold);
    if (!results.length) results = scored.filter((entry) => entry.score >= threshold * 0.55);

    results.sort((left, right) =>
      right.score - left.score
      || (left.record.review_status === "reviewed" ? -1 : 1)
      || left.record.name.localeCompare(right.record.name)
    );

    const interpretation = detectedIntents.length ? {
      labels: detectedIntents.map(({ intent }) => intent.label),
      notes: detectedIntents.map(({ intent }) => intent.note),
      confidence: detectedIntents[0].confidence
    } : null;

    return { results, interpretation };
  }

  globalThis.FronteraSearch = {
    INTENTS,
    normalize,
    tokenize,
    detectIntents,
    search
  };
})();
