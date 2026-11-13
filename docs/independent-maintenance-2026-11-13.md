# Independent maintenance and catalogue freshness

The website remains on Netlify. Maintenance can run on a Linux VPS through ordinary Git and systemd, independently of GitHub Actions. No billing, Actions configuration, hosting plan, DNS or server access has been changed. The user confirmed that a VPS exists; connection details and installation remain pending.

## Product changes

The homepage now reports the validated catalogue date using the deployment-specific public verification receipt. It no longer presents the separate source sweep as catalogue validation. Missing, expired, future or mismatched observations cannot produce a green current state. An open tab re-evaluates freshness and periodically rechecks status without replacing the page or losing search focus.

The Updates page distinguishes source observation, page generation, catalogue validation and publication verification. Missing sweep counts are unknown, not zero; an older sweep is labelled as describing an earlier snapshot. The endpoint only reads stored status and never starts a crawl.

Three documentary reviews were reassessed against their changed implementations. Their evidence and limitations are in [the reassessment report](reassessment-2026-11-13.md). The catalogue contains 333 records, 213 source groups and 30 applicable documentary reviews, with no independent replications. The other 27 review dates remain unchanged.

## Maintenance boundaries

See [the installation and operations guide](../ops/README.md). Prepare is the default and never publishes. Explicit publish uses an isolated clone, a limited set of persistent files, full checks, a normal push and exact production verification. Discovery is separate and cannot admit candidates. Failed or partial outcomes remain visible in private reports. No VPS timer is active merely because these files are committed.

## Validation

- Node 22 build and all repository checks pass: 30 Brief unit tests and 40 recovery/maintenance tests, alongside source, search, catalogue and metadata checks.
- Desktop and mobile runtime checks pass, including search focus during delayed status arrival, four freshness clocks, unknown counters and one shared catalogue request; no local page or console errors.
- Brief browser, resilience and Chromium accessibility/release suites pass 40/40 on the working tree.
- The source-link audit covers 605 URLs: 599 reachable, two restricted, three network errors and one transient response. No critical or reviewed source is missing. Restricted/network results are not described as successful requests.
- The source observation remains the real 2026-11-13T19:16:09.308Z observation. Revalidation after documentary changes does not renew that clock.
- Eight runner tests use local Git fixtures to verify preparation, failure gates, concurrent publication rejection, exact commit verification, IndexNow warnings and discovery dates. These are not evidence of a VPS installation.

The earlier production audit identified CSP errors from Netlify's injected public HUD. The application CSP is unchanged; local zero-console results do not establish zero platform console errors in production. Publication acceptance is recorded on the pull request after deployment.
