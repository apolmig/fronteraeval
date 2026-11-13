# Data and external discovery audit, 13 November 2026

## Published baseline and new imports

The public `/data/catalog.json` returned 330 records, generated `2026-11-01T09:26:10.527Z`, Inspect commit `969e4b2078292a2429274bd3524c64c27f9e0c72`. It had 73 verified, 3 source-derived and 254 paper-only records, with 306 papers present, 15 not found and 9 not applicable. Thirty documentary reviews and zero independent replications were recorded. IDs were unique. Those observations do not establish institutional authorship for paper-only records.

The real refresh against `a68dade7efb803ef50c8442d3f16264b293d1414` adds three distributed-register records. Author lists below were read from primary arXiv `citation_author` metadata on 13 November, not inferred from GitHub maintainers or affiliations:

- [CASE-Bench](https://arxiv.org/abs/2501.14940): Guangzhi Sun, Xiao Zhan, Shutong Feng, Philip C. Woodland, Jose Such. The [Inspect port README](https://github.com/barlowa124/inspect-case-bench) explicitly identifies [BriansIDP/CASEBench](https://github.com/BriansIDP/CASEBench) as its original reference implementation.
- [Collaborative Intelligence](https://arxiv.org/abs/2611.02633): Sean Wu, Aneesh Pappu, Jiaru Zou, Yubin Kim, Yuncong Mao, Hongjian Zhou, Junchi Yu, Jieneng Chen, James Zou. The [project repository](https://github.com/zou-group/collaborative-intelligence) links that paper. The paper distinguishes 240 total tasks from 160 public tasks and 80 held-out tasks; the imported description describes the public implementation.
- [MT-Bench](https://arxiv.org/abs/2306.05685): Lianmin Zheng, Wei-Lin Chiang, Ying Sheng, Siyuan Zhuang, Zhanghao Wu, Yonghao Zhuang, Zi Lin, Zhuohan Li, Dacheng Li, Eric P. Xing, Hao Zhang, Joseph E. Gonzalez, Ion Stoica. The paper links the original [FastChat evaluation code](https://github.com/lm-sys/FastChat/tree/main/fastchat/llm_judge); `jurayh/inspect-mt-bench` is the Inspect port.

Targeted source overrides record these authors and references, without institutional authorship claims or new documentary-review dates. Three pending arXiv metadata records were resolved from these pages; the earlier failed arXiv API request remains logged. Explicit empty affiliation overrides are now respected instead of restoring cached affiliations.

## Documentary-review applicability

The old pipeline reapplied a documentary review unconditionally. The new source baseline captures version, protocol, tasks, paper URLs and reference implementation from the previously published catalogue. It intentionally excludes fetch timestamps and the global repository SHA. This baseline detects changes after 1 November; it cannot retroactively prove that every revision between the original August review and 1 November was assessed.

Three reviewed implementations have real version increments:

| Record | Previous | Current |
| --- | --- | --- |
| AgentHarm | 8-B | 9-B |
| Agentic Misalignment | 4-A | 5-A |
| PaperBench | 7-C | 8-C |

Their historical reviews remain documented, but current records are catalogued with `methodological_review.status: needs-reevaluation`, explicit reasons, and no inherited current evidence-reach claims. There are 30 historical documentary reviews, 27 currently applicable under this metadata check, and 3 requiring reassessment. No reassessment was fabricated to pass the build.

The audit also found that reapplying the source registry could replace review dates with the global override date of 24 August. Methodological application now preserves the per-record historical review date. PaperBench retains 27 August, for example.

## External queue recovery

Only the scanner concept from PR #29 was recovered. Its generated website pages, unsafe broad workspace cleanup, and duplicate weekly comments were not imported. Repairs include durable accepted/dismissed decisions, DOI/arXiv/repository/title-alias deduplication, no stars-based scoring, source-specific error reporting, observation persistence even without new candidates, and explicit result caps. The old implementation discarded terminal decisions from its output, allowing dismissed candidates to reappear after a second run.

The live scan successfully queried all 28 configured source endpoints. Six returned capped result sets, so overall coverage remains partial. Counts and exact observation times are persisted in `discovery/external-candidates.json`. Candidates remain outside the public catalogue. The first attempt without the environment's proxy support failed all sources; the successful run used Node 22 with `NODE_OPTIONS=--use-env-proxy`. That local transport failure must not be interpreted as upstream unavailability.

Two current candidate sources were also read directly: [SCONE-bench](https://github.com/anthropics/scone-bench), whose README describes 417 historical smart-contract tasks and explicitly says it is not maintained, and the [Political Even-handedness Evaluation](https://github.com/anthropics/political-neutrality-eval), whose report describes paired political prompts and grading criteria. Neither was admitted or represented as independently reviewed. No benchmark code, paid inference or exploit reproduction was run.

## Reproduction

```sh
node --test scripts/test-external-discovery.mjs scripts/test-review-validity.mjs
node scripts/test-methodological-reviews.mjs
node scripts/discover-external-evals.mjs
```

The unit checks cover repeated terminal decisions, aliases and versioned identifiers, retention beyond the Markdown page size, partial failures and caps, protocol invalidation, and immunity to timestamp/global-SHA noise. The catalogue checks require review applicability and preserved dates to agree with the recorded baseline. A future change to the baseline requires actual reassessment; refreshing data must not rewrite it automatically.
