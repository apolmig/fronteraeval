# Attribution and provenance

FronteraEval separates roles that conventional benchmark lists often collapse into a single organisation field.

## Roles

- **Evaluation developer** — organisation or research group that created the evaluation.
- **Original research** — paper authors or research project that introduced the construct or protocol.
- **Original benchmark source** — source registry in which a benchmark first appeared when no separate paper or developer is established.
- **Reference implementation** — upstream codebase implementing the evaluation.
- **Inspect implementation** — implementation maintained or hosted in Inspect Evals.
- **Inspect Evals Register** — distributed catalogue entry pointing to an upstream repository.
- **Paper** — publication describing the evaluation or its methodology.
- **Dataset provider** — provider of an external dataset used by the implementation.
- **Implementation contributors** — contributors recorded by implementation metadata. They are not automatically treated as paper authors.

These roles are not interchangeable. Hosting an implementation does not establish authorship. Maintaining a registry entry does not make the registry owner the evaluation developer.

## Attribution states

- **Verified** — supported by an official project page, publication, canonical source, or a manually reviewed override.
- **Source-derived** — derived from an upstream repository owner, paper, dataset, or implementation metadata. The role is explicit and narrower than authorship.
- **Host-only** — FronteraEval can verify the Inspect implementation or registry role, but has not verified the original developer.
- **Unresolved** — no defensible attribution source was found. FronteraEval displays this rather than guessing.

## APE example

The Attempt to Persuade Eval is attributed to **FAR AI** as the evaluation developer. Its associated paper is linked separately, and the FAR AI / `AlignmentResearch` repository is listed as the reference implementation. Inspect Evals is shown only as the maintained Inspect implementation and catalogue host.

- FAR AI project page: <https://www.far.ai/news/attempt-to-persuade-eval>
- Paper: <https://arxiv.org/abs/2506.02873>
- Reference implementation: <https://github.com/AlignmentResearch/AttemptPersuadeEval>
- Inspect implementation metadata: <https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/ape>

## Editorial dates

`editorial_reviewed_at` is a fixed review date. It must not be replaced with the current build date during weekly refreshes. Source-check dates and editorial-review dates are separate fields.

## Machine-readable fields

Each catalogue record includes:

```json
{
  "organisation": "FAR AI",
  "organisation_role": "Evaluation developed by",
  "attribution_status": "verified",
  "preferred_source": {
    "label": "Evaluation developed by",
    "kind": "evaluation_developer",
    "url": "https://www.far.ai/news/attempt-to-persuade-eval"
  },
  "attribution": {
    "schema_version": "1.0.0",
    "status": "verified",
    "primary": {},
    "roles": []
  }
}
```

The legacy `organisation` field is retained for compatibility, but must always be read together with `organisation_role`.

## Corrections

Corrections should identify the record, disputed role, preferred source, and evidence. FronteraEval prefers an explicit unknown over a plausible but unsupported institutional attribution.
