# FronteraEval

**Find the right evaluation. Know what it proves.**

FronteraEval is a public decision-support catalogue for frontier AI evaluation. It is designed for researchers, policy analysts, assurance teams, and technically informed general analysts.

It is not a universal leaderboard. It separates source discovery, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.netlify.app](https://fronteraeval.netlify.app/)

## What it does

- Imports the current internal task registry and distributed register from the official `UKGovernmentBEIS/inspect_evals` repository.
- Adds a curated set of canonical evaluation suites from other primary sources.
- Distinguishes imported metadata, catalogued sources, and independently reviewed records.
- Makes explicit what an evaluation can support and what it cannot establish.
- Publishes machine-readable JSON and CSV exports.
- Runs a weekly source sweep through Netlify Functions and Netlify Blobs.

## Record states

- `imported`: official metadata; discovery only.
- `catalogued`: a primary source or registered implementation has been identified.
- `reviewed`: FronteraEval has added a bounded interpretation with an explicit inference ceiling.

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

Netlify publishes `site/` and deploys functions from `netlify/functions/`.

## Weekly freshness

The scheduled function runs Sundays at 02:17 UTC. It:

1. fetches the official Inspect registry and repository tree;
2. detects new, missing, or renamed tasks and register entries;
3. checks selected canonical sources;
4. stores live status in Netlify Blobs;
5. exposes the result at `/api/weekly-status`.

Automation does not author substantive editorial fields such as `measures`, `does_not_measure`, evidence reach, comparability, or policy relevance.

## Data

Generated outputs:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`

Stable IDs use source prefixes such as `inspect:`, `register:`, and `canonical:`.

## Current limitation

The first release is strongest as a discovery and interpretation layer. It does not yet normalise every protocol version, implementation, model-system configuration, run, and result. Imported records must not be represented as independently validated by FronteraEval.
