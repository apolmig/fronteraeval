# FronteraEval

**Find the right evaluation. Follow the source. Read its limits.**

FronteraEval is a public decision-support catalogue for frontier AI evaluation. It is designed for researchers, policy analysts, assurance teams, and technically informed general analysts.

It is not a universal leaderboard or a benchmark card wall. It separates source discovery, evaluation origin, implementation provenance, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.org](https://fronteraeval.org/)

## What it does

- Imports the current internal task registry and distributed register from the official `UKGovernmentBEIS/inspect_evals` repository.
- Parses versioned Inspect metadata for titles, descriptions, papers, code, tasks, protocol commits, run commands, notes, and reported results.
- Adds a curated set of canonical evaluation suites from other primary sources.
- Distinguishes imported metadata, catalogued sources, upstream-reported results, and independently reviewed records.
- Separates the evaluation developer, original paper, reference implementation, Inspect implementation, registry host, and dataset provider.
- Makes explicit what an evaluation can support and what it cannot establish.
- Links every catalogue record directly to one or more upstream resources.
- Publishes machine-readable JSON and CSV exports.
- Rebuilds and validates the catalogue weekly through GitHub and deploys the result from `main` through Netlify.

## Attribution is role-based

A registry host is not automatically an evaluation author. An implementation maintainer is not automatically the paper author. FronteraEval therefore records explicit roles rather than assigning every Inspect-hosted evaluation to the UK AI Security Institute.

For example, APE is attributed to **FAR AI** as the evaluation developer; its paper and FAR AI reference implementation are separate resources; Inspect Evals is shown only as the maintained Inspect implementation and catalogue host.

See [ATTRIBUTION.md](ATTRIBUTION.md) for the schema, confidence states, and correction policy.

## Record states

- `imported`: official metadata; discovery only.
- `catalogued`: a primary source or registered implementation has been identified.
- `reviewed`: FronteraEval has added a bounded interpretation with an explicit inference ceiling.

Attribution has a separate state:

- `verified`: supported by an official source or reviewed override;
- `source-derived`: derived from an upstream paper, repository, or dataset with a narrow role;
- `host-only`: only the implementation or registry host is verified;
- `unresolved`: no defensible attribution source was found.

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

The build has five stages:

1. generate the base catalogue from Inspect and curated canonical sources;
2. enrich distributed-register entries from their versioned `eval.yaml` metadata;
3. enrich internal Inspect tasks from versioned evaluation metadata;
4. assign explicit attribution and provenance roles;
5. validate attribution, construct boundaries, semantic-search regressions, and source integrity.

Netlify publishes `site/` and deploys functions from `netlify/functions/`.

## Weekly freshness

Two complementary jobs run each Sunday:

- **02:17 UTC — Netlify source sweep:** detects new, missing, or renamed Inspect entries and writes live freshness status to Netlify Blobs.
- **02:23 UTC — GitHub catalogue refresh:** regenerates and validates the complete catalogue, commits a refresh marker, and triggers a Git-linked Netlify production build.

Automation does not author substantive editorial fields such as `measures`, `does_not_measure`, evidence reach, comparability, policy relevance, or evaluation authorship.

Editorial-review dates are fixed. Weekly builds update source-check dates, not the date of the last human review.

## Data

Generated outputs:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`
- `/data/attribution-audit.json`

Stable IDs use source prefixes such as `inspect:`, `register:`, and `canonical:`. Versioned upstream links and the exact Inspect commit are retained in record provenance.

## Current limitation

The catalogue is strongest as a discovery and interpretation layer. It does not yet normalise every evaluation family, protocol version, implementation, model-system configuration, run, and result into separate first-class entities. Imported, source-derived, and upstream-reported records must not be represented as independently validated by FronteraEval.

## Interface principles

- Search is the primary action.
- Reviewed evidence appears before imported metadata.
- Every catalogue row exposes a preferred upstream source.
- Evaluation pages expose evaluation origin, papers, reference code, Inspect implementation, registry metadata, protocol information, and reported results where available.
- Every reviewed record leads with what the evidence supports and what it does not establish.
- Typography remains editorial but tool-sized; the interface avoids dashboard density and poster-scale headings.
- Agency Transfer is one research collection inside a broader evaluation map.
