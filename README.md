# FronteraEval

**Find the right evaluation. Follow the source. Read its limits.**

FronteraEval is a public decision-support catalogue for frontier AI evaluation, designed for researchers, policy analysts, assurance teams, and technically informed general analysts.

It is not a universal leaderboard. It separates evaluation origin, paper authorship, reference implementation, Inspect provenance, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.org](https://fronteraeval.org/)

## What it does

- Imports versioned internal tasks and distributed-register entries from Inspect Evals.
- Adds a curated set of canonical evaluation resources.
- Resolves papers, paper authors, upstream implementations, developer organisations, datasets, and Inspect hosting as separate roles.
- Retains an explicit `paper-only`, `host-only`, or `unresolved` state rather than guessing an institution.
- Distinguishes imported metadata, catalogued sources, upstream-reported results, and independently reviewed records.
- Makes explicit what a reviewed evaluation can support and what it cannot establish.
- Publishes JSON and CSV exports and a machine-readable source audit.
- Rebuilds and validates the catalogue weekly and deploys from `main` through Netlify.

## Source resolution is role-based

A registry host is not automatically an author. A maintained implementation is not automatically the original benchmark. A dataset namespace is not automatically the institution behind a paper.

For example, APE is attributed to **FAR AI** as evaluation developer; the APE paper and FAR AI reference implementation are separate resources; Inspect Evals appears only as maintained implementation provenance.

See [ATTRIBUTION.md](ATTRIBUTION.md).

## Evidence states

Catalogue review state:

- `imported` — source metadata for discovery only;
- `catalogued` — a primary source or implementation has been identified;
- `reviewed` — FronteraEval has added a bounded interpretation and inference ceiling.

Source-resolution state:

- `verified`
- `source-derived`
- `paper-only`
- `host-only`
- `unresolved`

Paper state:

- `present`
- `not-found`
- `not-applicable`

Upstream-reported result tables are labelled as such and are not represented as independently reproduced.

## Agency Transfer

Agency Transfer is the first editorial collection. It maps persuasion, manipulation, deception, social influence, and human-agency evaluations against:

`capability → deployment → individual effect → aggregate consequence`

Adjacent evaluations are not treated as interchangeable and are not aggregated into a universal manipulation score.

## Build

```bash
npm ci
npm run build
npm run check
```

Normal builds use the Inspect commit pinned in `data/source-registry.json`, so CI and Netlify remain reproducible.

A full source refresh uses:

```bash
REFRESH_INSPECT=1 GITHUB_TOKEN=... npm run refresh:sources
```

The pipeline:

1. generates the base catalogue from a pinned Inspect commit;
2. enriches distributed-register metadata;
3. enriches internal Inspect-family metadata;
4. applies the committed source registry;
5. validates provenance, paper metadata, source roles, construct boundaries, and semantic-search regressions.

## Weekly workflows

Two jobs run each Sunday:

- **02:17 UTC — Netlify source sweep:** detects new, removed, or renamed Inspect entries and writes live freshness status.
- **02:23 UTC — GitHub source refresh:** updates the pinned Inspect commit, papers, source organisations, and reference implementations; runs all quality gates; commits the source registry and refresh marker; and triggers a Git-linked Netlify production deployment.

Automation does not author substantive FronteraEval judgments such as `measures`, `does_not_measure`, evidence reach, comparability, or policy relevance.

## Data

Generated public outputs:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`
- `/data/source-audit.json`

Committed source inputs:

- `data/source-registry.json`
- `data/source-overrides.json`
- `data/entity-aliases.json`

## Current limitation

Source resolution can identify a paper without identifying a single institution behind it. In those cases FronteraEval reports the original paper authors and leaves the organisation unset. That is intentional. The catalogue remains strongest as a discovery and interpretation layer; it does not yet model every protocol version, implementation, model-system configuration, run, and result as separate first-class entities.
