# FronteraEval

[![FronteraEval social card](https://fronteraeval.org/social-card.png)](https://fronteraeval.org/)

**Find the right evaluation. Follow the original source. Read its limits.**

FronteraEval is a public, evolving decision-support catalogue for frontier AI evaluation. It is designed for researchers, policy analysts, assurance teams, and technically informed general analysts. It aims to reduce discovery friction, not to provide an exhaustive or authoritative map of the field.

It is not a universal leaderboard or a benchmark card wall. It separates evaluation origin, associated paper, reference implementation, Inspect implementation or registry provenance, protocol interpretation, evidence reach, model-system results, deployment claims, and downstream-effect claims.

**Application:** [fronteraeval.org](https://fronteraeval.org/)  
**Indexable catalogue:** [fronteraeval.org/evaluations/](https://fronteraeval.org/evaluations/)  
**Open data:** [fronteraeval.org/data-info/](https://fronteraeval.org/data-info/)

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

Hosting is not authorship. A registry maintainer is not automatically the evaluation developer. For example, APE is attributed to FAR.AI, its paper and original implementation are separate resources, and Inspect Evals appears only as implementation provenance.

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
2. enriches distributed-register and internal Inspect metadata;
3. resolves source papers, organisations, implementations, and provenance;
4. applies bounded documentary methodological reviews;
5. generates indexable evaluation and topic pages, structured metadata, sitemap, Atom feed, OpenSearch, and machine-readable discovery files;
6. validates source coverage, reviewed-record claims, semantic-search regressions, social metadata, sitemap coverage, and catalogue integrity.

## Search and discovery

The interactive application remains the fastest way to search and filter the catalogue. Search engines and link-preview crawlers also receive stable, non-hash URLs:

- one canonical HTML page per catalogue record under `/evaluations/<slug>/`;
- indexable topic pages under `/topics/<topic>/`;
- Open Graph and Twitter Card metadata with a 1200×630 social card;
- Schema.org microdata on the catalogue and record pages;
- a generated XML sitemap and Atom feed;
- OpenSearch metadata;
- `llms.txt` and `llms-full.txt` for machine discovery;
- a public IndexNow key and optional post-deploy submission.

The social card and discovery pages use stable wording rather than embedding catalogue counts that may change between weekly refreshes.

## Weekly operation

Three complementary safeguards run each Sunday:

- **02:17 UTC — Netlify source sweep:** detects new, removed, or renamed Inspect entries and updates live freshness status.
- **02:23 UTC — GitHub catalogue refresh:** rebuilds source metadata and the source registry, validates the complete catalogue, writes a refresh marker, and triggers the Git-linked Netlify production build.
- **08:23 UTC — backup refresh:** runs only when the primary refresh has not been verified in production.

The workflow retries transient dependency and source failures, audits critical links, verifies that the exact refresh marker reached production, checks public discovery surfaces, and opens a GitHub issue if the autonomous refresh fails. Production remains on the last validated deployment.

A separate **03:41 UTC external-discovery job** searches recent GitHub repositories, known evaluation organisations, arXiv, and Hugging Face. New Inspect entries can be imported automatically after validation; external results enter a private-to-repository candidate queue and GitHub review issue instead of being published without human source and construct checks.

Automation may extract source metadata, but it does not silently invent evaluation authorship or substantive FronteraEval judgments. Editorial-review dates remain fixed; weekly jobs update source-check dates separately.

## Open data

Generated outputs include:

- `/data/catalog.json`
- `/data/catalog.csv`
- `/data/freshness.json`
- `/data/source-audit.json`
- `/data/source-link-audit.json`
- `/data/weekly-refresh.json`

The source registry and curated overrides are versioned in the repository so attribution changes are reviewable.

## Epistemic limits

A paper does not always exist, and author affiliations do not always establish an institutional evaluation developer. FronteraEval preserves those distinctions. The catalogue will contain omissions, classification choices, and occasional errors. A source-resolved record is not automatically an independently validated evaluation; a reviewed record is a bounded documentary assessment, not an experimental replication; and upstream-reported results are not represented as reproduced by FronteraEval. Corrections and missing evaluations are welcome through GitHub issues.
