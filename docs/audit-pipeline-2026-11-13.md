# Pipeline recovery audit, 13 November 2026

## Confirmed code defects

- `build.mjs` downloaded `_registry.py` and the recursive tree from moving `main` references independently. `enrich-register.mjs` then resolved `commits/main` again and relabelled records with that later commit. A catalogue could therefore mix source versions.
- Ordinary Netlify builds downloaded the latest upstream even while publishing an older validated refresh marker and source registry. The refreshed catalogue was not necessarily the catalogue that had passed validation.
- The weekly workflow rebased its validated state onto a potentially changed `main` and pushed without rerunning gates. Its `reset --hard` and unscoped `clean -fd` also discarded generated inputs indiscriminately.
- Production acceptance compared only `refreshed_at`, so an unrelated build retaining the same marker could satisfy it.
- The source sweep always persisted `current`, including partial source failures.

## Changes

Ordinary builds now use the marker's immutable Inspect commit. Only `REFRESH_INSPECT=1` resolves upstream `main`, once, and both the registry and tree are downloaded at that commit. Enrichment uses the same commit. A truncated tree is a failure. Builds retain the source-observation date, separately from generation. Writing a new validation marker requires a matching source registry, no partial enrichment failures, a recent source observation, and a subsequent completed link audit.

The validation workflow reproduces the same pinned build as Netlify. The weekly job uses a normal push and fails on concurrent changes instead of rebasing tested inputs. Generated files are not broadly removed. The one-time `verify-weekly-dispatch.yml` and `verify-external-discovery-dispatch.yml` bridges were removed after inspecting their triggers and purpose. `workflow_dispatch` remains available on the real workflows.

`site/data/deployment.json` is generated with deployment ID, code commit, catalogue/marker byte hashes, record count and the separate timestamps. A Netlify deploy event and daily 09:41 UTC watchdog fetch the public marker, catalogue and deployment manifest and persist a receipt only for the exact matching deployment and bytes. A mismatch/fetch error invalidates the current receipt. `/api/health` reads the receipt without starting a crawler and returns 503 unless the validated refresh is within eight days and the receipt is within 36 hours. It exposes observation, generation, validation and public verification as separate clocks. Preview and local builds have no production receipt and therefore remain unverified.

The watchdog uses the existing Netlify deployment and does not depend on a GitHub runner. Its error log is **not an external notification channel**. Actual deploy-event execution, scheduler execution, Blobs access and notification delivery still require deployed verification. A deploy event that runs before public propagation may fail closed; the next daily watchdog or the Netlify dashboard's Run now action can establish the receipt after propagation.

The external-discovery workflow runs Sundays 03:41 UTC, persists only its editorial queue, keeps source-error runs failed after retaining their evidence, and updates one review issue instead of creating repeated weekly issues/comments. It never promotes candidates to the catalogue. Like the refresh workflow, it remains subject to the account's GitHub Actions runner availability.

## Local evidence

Executed in this workspace:

```sh
node --test scripts/test-freshness.mjs scripts/test-publication.mjs scripts/test-upstream-pinning.mjs
node scripts/test-weekly-automation.mjs
```

Eleven tests passed under Node 22.23.5, including real subprocess executions of `build.mjs` with controlled upstream responses, default-build versus refresh commit selection, mismatched bytes/deploys, missing/failed/expired receipts, and stale refreshes despite recent verification. Workflow YAML was parsed with the locked `yaml` dependency. Build/enrichment/publishing/marker scripts passed Node syntax checks.

Netlify `zip-it-and-ship-it` also packaged all five functions under Node 22 into `/tmp/fronteraeval-pipeline-functions`. The manifest includes both API routes and the 09:41 daily and 02:17 Sunday schedules. The deploy-event handler packaged successfully and its type exists in the locked SDK, but the manifest does not list a separate event subscription; actual event delivery is unverified.

These tests do not prove hosted scheduling or delivery. Full clean Node 22 build, source refresh, source audit, browser checks and hosted acceptance are recorded by the integrating audit.
