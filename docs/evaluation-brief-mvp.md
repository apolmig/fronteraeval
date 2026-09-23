# Evaluation brief MVP

## Purpose

Turn evaluation discovery into a justified, editable plan. The first release is a local-first planning tool, not an automated safety judgement, universal leaderboard, or evaluation runner.

## Scope

- Define the decision question, system configuration and practical constraints.
- Select catalogue evaluations manually and compare methods, not incompatible scores.
- Record why each evaluation is included, applicability, missing evidence and next actions.
- Preserve the published catalogue snapshot and selected record metadata in the draft.
- Export a versioned JSON planning manifest and readable Markdown; provide a printable view.
- Keep drafts on the current device, with an explicit clear action and honest storage-error handling.
- Fix the attribution observer feedback loop and add regression coverage.

## Boundaries

No model API calls, paid execution, account requirement, cloud draft storage, invented language coverage, automatic deployment approval, or production deployment from this branch. A planning manifest is not an executable Inspect configuration. Human review remains required before publication.

## Acceptance criteria

A user can complete question -> shortlist -> comparison -> evidence gaps -> export, reload the draft without losing work, and clear it. Exports retain the selected source snapshot and distinguish catalogue interpretation from user judgement. Missing fit remains unknown. Empty, unavailable and changed-catalogue states are handled explicitly. Desktop, narrow-screen, keyboard, local-storage failure and malicious-text cases are tested. The attribution module settles after rendering and continues to process actual changes.

## Review

Implementation and test results will be recorded in the pull request. The existing catalogue, source provenance, refresh pipeline, light/dark theme and public routes remain available.
