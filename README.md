# FronteraEval

**Find the right evaluation. Follow the original source. Read its limits.**

FronteraEval is a public decision-support catalogue for frontier AI evaluation. It is designed for researchers, policy analysts, assurance teams, and technically informed general analysts.

It is not a universal leaderboard or a benchmark card wall. It separates evaluation origin, associated paper, reference implementation, Inspect implementation or registry provenance, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.org](https://fronteraeval.org/)

## Source resolution

Every catalogue record resolves through a versioned source registry. Records that share one evaluation family reuse one source entry, while each task keeps its own stable catalogue ID.

The registry records, separately:

- the evaluation developer or original research source;
- the associated paper and paper authors, where a paper exists;
- the reference implementation and maintainer;
- the Inspect implementation or distributed-register entry;
- datasets and official project pages;
- source-resolution method and confidence;
- an explicit `not-found` or `not-applicable` paper state rather than a fabricated citation.

Hosting is not authorship. A registry maintainer is not automatically the evaluation developer. For example, APE is attributed to FAR AI, its paper and original implementation are separate resources, and Inspect Evals appears only as implementation provenance.

See [ATTRIBUTION.md](ATTRIBUTION.md) for the role model and correction policy.

## Record and source states

Catalogue review state:

- `imported`: official metadata; discovery only;
- `catalogued`: primary sources have been identified;
- `reviewed`: FronteraEval has added a bounded construct and inference assessment.

Source-resolution state:

- `verified`: supported by an official project, paper, or primary repository;
- `source-derived`: supported by upstream metadata with a deliberately narrow claim;
- `paper-only`: paper and authors are identified, but an institutional developer is not asserted;
- `host-only`: implementation or registry host is known, but origin is unresolved;
- `unresolved`: no defensible original source has been established.

## Build and quality gates

```bash
npm ci
npm run build
npm run check
```

The build:

1. generates the base catalogue from Inspect and curated canonical sources;
2. enriches distributed-register metadata;
3. enriches internal Inspect metadata;
4. resolves source papers, organisations, implementations, and provenance through the source registry;
5. validates source coverage, reviewed-record claims, semantic-search regressions, and catalogue integrity.

## Weekly operation

Two complementary jobs run each Sunday:

- **02:17 UTC — Netlify source sweep:** detects new, removed, or renamed Inspect entries and updates live freshness status.
- **02:23 UTC — GitHub catalogue refresh:** rebuilds source metadata and the source registry, validates the complete catalogue, writes a refresh marker, and triggers the Git-linked Netlify production build.

Automation may extract source metadata, but it does not silently invent evaluation authorship or substantive FronteraEval judgments. Editorial-review dates remain fixed; weekly jobs update source-check dates separately.

## Open data

Generated outputs include:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`
- `/data/source-audit.json`

The source registry and curated overrides are versioned in the repository so attribution changes are reviewable.

## Current limitation

A paper does not always exist, and author affiliations do not always establish an institutional evaluation developer. FronteraEval preserves those distinctions. A source-resolved record is not automatically an independently validated evaluation, and upstream-reported results are not represented as reproduced by FronteraEval.
