# Source resolution and attribution

FronteraEval separates benchmark origin, paper authorship, reference implementation, dataset provenance, and Inspect hosting. These roles are not interchangeable.

## Source model

Every catalogue record belongs to a source group: an Inspect evaluation family, an external Inspect-register package, or a curated canonical resource. Each group records:

- **Origin** — the organisation, research collaboration, or paper authors that introduced the evaluation.
- **Paper** — title, authors, URL, arXiv identifier, and publication date where available.
- **Reference implementation** — upstream codebase, owner, and relation to the evaluation.
- **Inspect provenance** — maintained Inspect implementation or distributed registry entry.
- **Datasets and official pages** — supporting resources that must not be mistaken for authorship.

## Resolution states

- **Verified** — supported by an official project page, manually checked source, or canonical developer page.
- **Source-derived** — derived narrowly from an upstream organisation-owned repository or official source metadata.
- **Paper-only** — the paper and its authors are identified, but FronteraEval does not assert a single institutional owner.
- **Host-only** — the Inspect host is known, but the evaluation origin has not been established.
- **Unresolved** — no defensible origin, paper, or upstream implementation could be established.

Unknown is a valid result. FronteraEval must not manufacture an institution from a repository host, implementation contributor, or dataset namespace.

## Paper states

Each record explicitly reports one of:

- `present`
- `not-found`
- `not-applicable`

For arXiv papers, the weekly source refresh retrieves the canonical title and author list. A paper URL is evidence for the paper; it is not by itself evidence that one particular institution owns the evaluation.

## APE example

The Attempt to Persuade Eval is resolved as:

- **Evaluation developer:** FAR AI
- **Paper:** *It's the Thought that Counts: Evaluating the Attempts of Frontier LLMs to Persuade on Harmful Topics*
- **Reference implementation:** `AlignmentResearch/AttemptPersuadeEval`
- **Inspect provenance:** maintained implementation in Inspect Evals, stewarded by the UK AI Security Institute

The Inspect role is implementation provenance, not APE authorship.

## Machine-readable fields

```json
{
  "source_key": "inspect-family:ape",
  "record_type": "evaluation-family",
  "attribution_status": "verified",
  "origin": {
    "name": "FAR AI",
    "organization": "FAR AI",
    "role": "evaluation_developer",
    "role_label": "Evaluation developed by",
    "confidence": "verified",
    "evidence_url": "https://www.far.ai/blog/attempt-to-persuade-eval"
  },
  "paper_status": "present",
  "paper": {
    "url": "https://arxiv.org/abs/2506.02873",
    "title": "...",
    "authors": ["..."]
  },
  "reference_implementation": {
    "url": "https://github.com/AlignmentResearch/AttemptPersuadeEval"
  },
  "inspect_provenance": {
    "role": "maintained_implementation",
    "steward": "UK AI Security Institute"
  }
}
```

The legacy `organisation` field is retained for compatibility, but its meaning is defined by `organisation_role` and `attribution_status`.

## Refresh and review boundary

The weekly workflow may update source metadata, papers, repository ownership, and freshness. It may not automatically change FronteraEval's substantive claims about construct validity, evidence reach, comparability, or policy relevance.

Editorial review dates are fixed. Source-refresh dates are separate.
