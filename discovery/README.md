# External evaluation discovery

This queue surfaces possible evaluations outside the Inspect import. It does not add catalogue records, establish authorship, endorse quality, or create methodological reviews.

Run `node scripts/discover-external-evals.mjs` after building a current catalogue, and `node --test scripts/test-external-discovery.mjs` to check the review boundary and deduplication. Optional `DISCOVERY_CATALOG_PATH`, `DISCOVERY_OUTPUT_JSON`, and `DISCOVERY_OUTPUT_MD` paths support isolated audits. The default observation window is 21 days, bounded to 7–60 days through `DISCOVERY_WINDOW_DAYS`.

The scanner checks GitHub searches, selected organisation repositories, arXiv, and Hugging Face. Each search/organisation has its own result, timestamp, error and result cap. `coverage: partial` includes truncated result lists; a successful request is not proof of exhaustive coverage. Any source error produces exit code 2 after saving available results and previous candidates. Failed or capped sources must remain visible in automation reports.

Relevance requires both an evaluation signal and an AI-system signal. Stars and likes are not inputs. Classification hints distinguish possible new evaluations, implementations, versions, and papers that merely use benchmarks; unknown cases remain unclassified. These are heuristic hints, not editorial findings. Generic resources are filtered, but false positives remain possible.

Deduplication uses canonical repository identities, DOI, arXiv versions, exact normalised titles and declared aliases. Family matches are retained as links to related catalogue entries. Shared hosting does not establish authorship. Source-owner names are discovery metadata only; origin remains unresolved until checked. Different evaluations sharing a repository or paper may require manual separation, and new versions without distinct source metadata can be missed.

Never delete accepted or dismissed records. Set `review_status` to `accepted` or `dismissed`, and add a `review_note` explaining the decision. Those decisions survive subsequent scans and title changes. `filtered` records retain evidence of automated relevance filtering; `already-catalogued` records no longer need initial admission. A failed source does not erase previously discovered candidates. The Markdown report shows up to 50 active candidates; the JSON retains the entire queue and decision history.

Admission requires checking original authors, primary paper/project/code, scope and unit of analysis, version and implementation relationships, protocol/scoring, and limits of inference. Acceptance in this queue does not automatically publish anything. Independently replicated results require separate evidence.

Automation must update one stable review artifact or issue, not create identical issues each week. The scheduled workflow and its last successful execution are separate claims.
