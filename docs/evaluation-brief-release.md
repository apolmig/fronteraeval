# Evaluation brief MVP release

## User workflow

Open `/brief/`, or choose **Build a brief** in the catalogue header. Define the decision, system, languages and constraints. Add evaluations manually, compare their methods, justify each selection, and record evidence gaps and the next action. Read the brief on the page, then export Markdown or JSON. JSON preserves the captured metadata and can reopen the plan in another browser.

There is one active draft per browser origin. Save separate JSON files to retain multiple briefs. A draft made on a preview domain does not automatically appear on the production domain. Export it from the preview and open that JSON on production. Neither domain uploads the draft. Browser storage is not encrypted; use non-sensitive content only.

The JSON file is a planning manifest, not an executable evaluation configuration. Fit labels are the user's judgement. A completeness check is not a safety approval. Source metadata is captured when a record is selected and is not silently replaced by catalogue updates. Imported metadata is not independently revalidated.

## Release gates

Keep the existing catalogue and source-validation checks, the 29 planning tests, and the 32 Chromium acceptance/resilience checks. The separate release workflow exercises Chromium, Firefox and WebKit, including real file downloads and imports, reloads, keyboard controls, print markup, Unicode input, responsive layout and integration with the original catalogue. It also runs axe-core against empty and selected briefs in light, dark and mobile layouts. Reports include browser versions, source commit and accessibility findings requiring manual review.

The accessibility engine is a test-only dependency and is not shipped to users. Tests use isolated browser contexts with synthetic data and block external requests and all non-GET requests. Reports and screenshots do not contain user drafts or account credentials.

## Verification and rollback

Before merging, verify required workflows against the current PR head. Do not bypass failures. After merging, confirm the deployed planner's JavaScript and CSS match the reviewed source, then run the release workflow with `base_url` set to `https://fronteraeval.org` to test the deployed product. Confirm the main catalogue still works.

For a regression, revert the release merge commit in a new pull request or restore the previous validated Netlify deployment. Retain local draft storage and its schema. Never clear users' drafts during rollback. A reverted site may temporarily lack the brief editor; existing JSON exports remain user-owned.

## Human pilot

Technical checks are not a substitute for user validation. Ask a small initial group to create a plan from a real but non-sensitive evaluation question. Observe whether they can distinguish direct from adjacent evidence, identify remaining gaps, preserve a draft and hand the exported plan to a colleague. Record task completion, substantive selection errors and unclear claims, not just satisfaction or page views.

Branded Safari, assistive-technology users, an independent security review and real-user outcomes are not certified by Playwright or axe. Keep these distinctions in release communications.
