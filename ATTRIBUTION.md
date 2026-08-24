# Attribution and source resolution

FronteraEval separates roles that benchmark directories commonly collapse into one organisation field.

## Roles

- **Evaluation developer** — organisation or research group that created the evaluation.
- **Original research** — paper authors or research project that introduced the construct or protocol.
- **Original paper authors** — authors named by the associated publication when an institutional developer cannot be established.
- **Original benchmark source** — source registry in which a benchmark first appeared when no separate paper or developer is established.
- **Reference implementation** — upstream codebase implementing the evaluation.
- **Implementation maintainer** — organisation or maintainers responsible for that codebase.
- **Inspect implementation** — maintained implementation hosted in Inspect Evals.
- **Inspect Evals Register** — distributed catalogue entry pointing to an upstream repository.
- **Dataset provider** — provider of an external dataset used by the protocol.
- **Framework, suite, environment, or methodology developer** — used when the record is not a single evaluation task.

These roles are not interchangeable. Hosting an implementation does not establish authorship. Maintaining a register entry does not make the register steward the evaluation developer. Contributors listed by implementation metadata are not automatically paper authors.

## Resolution states

- **Verified** — supported by an official project page, associated paper, or canonical primary repository.
- **Source-derived** — narrowly derived from upstream metadata; the specific role is stated.
- **Paper-only** — the paper and authors are identified, but FronteraEval does not assert an institutional developer.
- **Host-only** — the implementation or registry host is verified, but the original developer is not.
- **Unresolved** — no defensible original source was found.

`unresolved`, `host-only`, and `paper-only` are valid outcomes. They are preferable to plausible but unsupported institutional attribution.

## Papers

Each source group has one explicit paper status:

- `present` — an associated paper or technical report was identified;
- `not-found` — no publication was found in the reviewed primary sources;
- `not-applicable` — the record is a framework, environment, suite, or other resource for which a single associated paper is not required.

A missing paper is never replaced with a blog post and a project page is never silently relabelled as a paper.

## APE example

The Attempt to Persuade Eval is attributed to **FAR AI** as the evaluation developer. Its publication and reference implementation are separate resources. Inspect Evals is shown only as implementation provenance.

- FAR AI project page: <https://www.far.ai/news/attempt-to-persuade-eval>
- Paper: <https://arxiv.org/abs/2506.02873>
- Reference implementation: <https://github.com/AlignmentResearch/AttemptPersuadeEval>
- Inspect implementation metadata: <https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/ape>

## Machine-readable model

Each record includes fields such as:

```json
{
  "origin": {
    "name": "FAR AI",
    "role": "evaluation_developer",
    "role_label": "Evaluation developed by",
    "evidence_url": "https://www.far.ai/news/attempt-to-persuade-eval"
  },
  "paper": {
    "status": "present",
    "url": "https://arxiv.org/abs/2506.02873",
    "title": "Attempt to Persuade Eval",
    "authors": []
  },
  "reference_implementation": {
    "url": "https://github.com/AlignmentResearch/AttemptPersuadeEval"
  },
  "inspect_provenance": {
    "role": "maintained_implementation"
  },
  "source_resolution": {
    "status": "verified",
    "method": "curated-primary-sources"
  }
}
```

The legacy `organisation` field remains for compatibility, but must always be read together with `organisation_role` and `source_resolution.status`.

## Dates

`editorial_reviewed_at` is a fixed review date. Weekly source refreshes update source-check and resolution dates; they do not rewrite the date of the last substantive review.

## Corrections

A correction should identify:

1. the catalogue record or source family;
2. the disputed role;
3. the preferred primary source;
4. the evidence supporting the change.

Source-resolution changes are versioned and must pass automated coverage and regression tests before publication.
