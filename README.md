# FronteraEval

**Find the right evaluation. Follow the source. Read its limits.**

FronteraEval is a public decision-support catalogue for frontier AI evaluation. It is designed for researchers, policy analysts, assurance teams, and technically informed general analysts.

It is not a universal leaderboard or a benchmark card wall. It separates source discovery, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.org](https://fronteraeval.org/)

## What it does

- Imports the current internal task registry and distributed register from the official `UKGovernmentBEIS/inspect_evals` repository.
- Parses versioned Inspect register metadata for titles, descriptions, papers, code, tasks, protocol commits, run commands, notes, and reported results.
- Adds a curated set of canonical evaluation suites from other primary sources.
- Distinguishes imported metadata, catalogued sources, upstream-reported results, and independently reviewed records.
- Makes explicit what an evaluation can support and what it cannot establish.
- Links every catalogue record directly to one or more upstream resources.
- Publishes machine-readable JSON and CSV exports.
- Rebuilds and validates the catalogue weekly through GitHub and deploys the result from `main` through Netlify.

## Record states

- `imported`: official metadata; discovery only.
- `catalogued`: a primary source or registered implementation has been identified.
- `reviewed`: FronteraEval has added a bounded interpretation with an explicit inference ceiling.

Upstream-reported result tables are labelled as such. They are not represented as independently reproduced by FronteraEval.

## Agency Transfer

Agency Transfer is the first editorial collection. It maps evaluations relevant to persuasion, manipulation, deception, social influence, and human agency against the chain:

`capability → deployment → individual effect → aggregate consequence`

Adjacent evaluations are not treated as interchangeable and are not aggregated into a universal manipulation score.

## Build

```bash
npm install
npm run build
npm run check
```

The build has two stages:

1. generate the base catalogue from Inspect and curated canonical sources;
2. enrich distributed-register entries from their versioned `eval.yaml` metadata.

Netlify publishes `site/` and deploys functions from `netlify/functions/`.

## Weekly freshness

Two complementary jobs run each Sunday:

- **02:17 UTC — Netlify source sweep:** detects new, missing, or renamed Inspect entries and writes live freshness status to Netlify Blobs.
- **02:23 UTC — GitHub catalogue refresh:** regenerates and validates the complete catalogue, commits a refresh marker, and triggers a Git-linked Netlify production build.

Automation does not author substantive editorial fields such as `measures`, `does_not_measure`, evidence reach, comparability, or policy relevance.

## Data

Generated outputs:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`

Stable IDs use source prefixes such as `inspect:`, `register:`, and `canonical:`. Versioned upstream links and the exact Inspect commit are retained in record provenance.

## Current limitation

The first release is strongest as a discovery and interpretation layer. It does not yet normalise every evaluation family, protocol version, implementation, model-system configuration, run, and result into separate first-class entities. Imported and upstream-reported records must not be represented as independently validated by FronteraEval.

## Interface principles

- Search is the primary action.
- Reviewed evidence appears before imported metadata.
- Every catalogue row exposes its upstream source.
- Evaluation pages expose papers, code, registry metadata, protocol information, and reported results where available.
- Every reviewed record leads with what the evidence supports and what it does not establish.
- Typography remains editorial but tool-sized; the interface avoids dashboard density and poster-scale headings.
- Agency Transfer is one research collection inside a broader evaluation map.
