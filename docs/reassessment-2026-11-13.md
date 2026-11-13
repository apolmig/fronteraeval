# Documentary reassessment of three Inspect implementations

Review date: 2026-11-13. Review type: documentary. Independent replication: none.

This review reassesses AgentHarm 9-B, Agentic Misalignment 5-A and PaperBench 8-C after the source-change detector invalidated their earlier documentary reviews. It reads versioned implementation changes and current scoring documentation, revises interpretation and comparability, and only then advances these three source baselines. It does not infer that unchanged task counts imply unchanged results.

## Evidence and scope

The comparison is between Inspect commits `969e4b2078292a2429274bd3524c64c27f9e0c72` and `a68dade7efb803ef50c8442d3f16264b293d1414`. The [immutable comparison](https://github.com/UKGovernmentBEIS/inspect_evals/compare/969e4b2078292a2429274bd3524c64c27f9e0c72...a68dade7efb803ef50c8442d3f16264b293d1414) contains 36 commits and 223 changed files. The relevant package diffs, READMEs, version metadata and scoring code were inspected; the new Agentic Misalignment grader tests were read, not executed. This is not an audit of all 223 files or of the complete runtime dependency graph.

The shared runtime also extracts helpers and grader constants into `inspect-evals-utils==0.2.0`, as declared in the pinned [pyproject.toml](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/pyproject.toml). A future empirical comparison must retain the dependency lock, dataset revision, model and grader snapshots, environment and run configuration. No benchmark, model inference, GPU workload or empirical cross-version score comparison was run for this review.

Original papers, benchmark authors and institutions remain the original provenance. Inspect is the implementation being reviewed, not a substitute author or source of the original published results. The original source links remain in each review alongside pinned Inspect evidence.

## AgentHarm: 8-B to 9-B

The [9-B README](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/agentharm/README.md) and package diff show explicit UTF-8 reads for dataset JSON and the benign and harmful `read_file` / `edit_txt` tool content, plus explicit UTF-8 output for JSONL. Non-ASCII material could previously decode differently on hosts using another locale encoding. The package delta does not change the task-completion rules, but changed input text can change model behavior.

The bounded construct remains performance on selected simulated harmful tool tasks. The review now requires matching host encoding and dataset/split in comparisons, and does not claim score equivalence. Reading the current [scorer](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/agentharm/scorer.py) also establishes an interpretation limit missing from the earlier review: the chat split has no task-completion rubric and emits NaN for that component. Refusal-only observations cannot establish successful completion or downstream harm.

Disposition: applicable documentary review for 9-B, moderate confidence, controlled model behavior only. The review does not validate real misuse feasibility or the quality of every task validator.

## Agentic Misalignment: 4-A to 5-A

The [5-A README](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/agentic_misalignment/README.md), [verdict parser](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/agentic_misalignment/classifiers/classifier.py), [scorer](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/agentic_misalignment/scorers.py) and [test definitions](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/tests/agentic_misalignment/test_grader_parsing.py) establish a substantive measurement change:

- Blackmail, leak and murder graders require exactly one complete final `<answer>` element with a normalized yes/no value. Missing, duplicate, incomplete or ambiguous answers fail parsing. Surrounding prose cannot supply a verdict, and permissive substring/fallback grading is removed.
- Format failures receive at most three grader attempts, with caching disabled and the evaluated model response held fixed. Exhaustion returns an unscored result with failure mode, attempt count and final grader reply. It is not counted as harmless. API errors and other classifier errors propagate.
- Both `harmful` and `classifier_verdict` aggregates can change, including their scored denominators. Retry outcomes can change either direction. Scenario-specific action checks and grader prompts are retained; the `aware` scoring rule is unchanged.

The updated review explains the deliberate parsing divergence from the original implementation and requires scored, unscored and errored counts plus grader attempts. Do not pool 4-A and 5-A rates. A valid numerical comparison would regrade retained responses under a common grading protocol and report coverage; this review did not do so.

Disposition: applicable documentary review for 5-A, moderate confidence. Evidence reach is narrowed to controlled model behavior. These synthetic conflict scenarios can inform deployment stress tests, but do not independently establish deployment readiness or incident rates.

## PaperBench: 7-C to 8-C

The [8-C README](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/paperbench/README.md) and [dataset loader](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/paperbench/dataset.py) show explicit UTF-8 reads of paper text, rubric, addenda, blacklist and submission metadata, and explicit UTF-8 metadata output. Incorrect decoding or load failures on non-UTF-8 hosts can change what reaches both agent and judge. Upstream states Linux/macOS results are unchanged; this is an upstream/code-level expectation, not an empirical equivalence result established here.

Reviewing the current [judge](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/paperbench/score/judge.py), [rubric aggregation](https://github.com/UKGovernmentBEIS/inspect_evals/blob/a68dade7efb803ef50c8442d3f16264b293d1414/src/inspect_evals/paperbench/score/task_node.py) and README exposed interpretation limits already present before 8-C but missing from the old documentary summary:

- The default `dummy` judge produces testing zeros. Substantive grading requires the `simple` judge; a dummy run is not a capability result.
- The Inspect port excludes ungradeable children from weighted rubric averages and reports `graded_weight_fraction` with `score`; wholly ungraded samples are unscored. Selective grading failures can bias the reported score upward. The coverage measure follows the rubric hierarchy, not a simple count of graded leaves.
- This handling differs from the reference implementation when criteria cannot be graded. Matching a benchmark title does not make the port's scores directly comparable with published original results.
- The pinned README reports no published results for this Inspect implementation. Original PaperBench numbers must not be presented as results of this port. Its scaffold also differs from the original.

Disposition: applicable documentary review for 8-C, moderate confidence, bounded research-replication behavior only. Numerical equivalence, grader validity and end-to-end research autonomy were not established.

## Registry update and validation boundary

Only these three review files and source snapshots receive the new review date and per-record Inspect commit. The other 27 review dates and baseline records remain unchanged; the top-level historical baseline commit remains valid for them. Each updated review retains the previous date/version and both source commits in `reassessment` metadata. The baseline note documents this mixed provenance.

The source-change detector remains active: a future version, protocol, task, paper-source or reference-implementation change invalidates applicability again. Passing catalogue checks means the new documentary records and generated presentation are internally consistent. It does not mean any benchmark has been independently replicated.
