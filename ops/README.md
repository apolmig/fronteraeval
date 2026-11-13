# Maintenance without GitHub Actions

The website remains on Netlify. This worker runs the existing catalogue pipeline on a Linux machine, commits only validated persistent data, and lets Netlify's existing Git integration deploy it. It uses ordinary Git, not the Actions service or a self-hosted Actions runner. No VPS has been provisioned, connected or scheduled by adding these files.

A VPS is useful if one is already maintained, or if a durable scheduler and independent monitoring justify operating another machine. Serving this static website from a VPS is unnecessary. Full refreshes perform many network requests and can take several minutes; placing the complete pipeline inside a short scheduled serverless invocation would be fragile.

## Try it without publication

Requirements: Node 22, npm, Git, outbound HTTPS and sufficient disk for isolated checkouts. On Linux, systemd and `flock` are used by the optional service templates. Use a dedicated non-root account.

```sh
node scripts/run-maintenance.mjs --prepare --state-dir /path/to/private/state
```

Every execution creates its own checkout of current main and a private directory containing `result.json`, stage logs and the resulting local commit. Prepare mode never pushes or submits to IndexNow. It performs a real source refresh, so it makes network requests. The runner retains the checkout on failure and does not reset, clean, or remove another working copy. Remove old run directories selectively after reviewing their reports; retention is an operator task, not an unscoped automatic deletion.

The refresh order is:

1. Locked dependency installation in a new clone.
2. Real source refresh with `REFRESH_INSPECT=1`, existing checks, and critical source-link audit.
3. Write the validated marker, stage only `data/source-registry.json`, `refresh/last-run.json`, and `refresh/source-link-audit.json`, then create a local commit.
4. Reproduce the ordinary pinned Netlify build and all checks on that exact commit.
5. Only in explicit publish mode, perform a normal push and verify the exact commit, public hashes and health. A concurrent update rejects the push. There is no rebase, force push, or bypass of branch protection.
6. Submit IndexNow only after successful public verification. An unsuccessful or unverifiable submission yields a warning result and exit code 2, even if the site published successfully.

To publish once after reviewing a successful prepare run and installing scoped Git credentials:

```sh
node scripts/run-maintenance.mjs --publish --state-dir /path/to/private/state
```

This starts a new isolated run rather than publishing an old prepared directory. `published_commit` means Git accepted the commit; only `publication_verified_at` means the public deployment was verified. Exit 0 means prepared or published successfully, 2 means retained partial results/warnings, and 1 means failure. If publication verification times out, inspect the retained commit and Netlify deployment. Do not assume production changed merely because Git accepted a push.

## Optional VPS installation

Install a reviewed copy of the application at `/opt/fronteraeval` and Node 22 at `/opt/node22`. Keep application code read-only to the service account. The service clones current main for each run, so data and pipeline scripts come from the current repository. Updates to the launcher or unit templates require an operator to update the reviewed installation.

Create a dedicated `fronteraeval` system user/group and private `/var/lib/fronteraeval` state directory. Configure authentication through a narrowly scoped repository deploy key or existing approved Git credential helper. A GitHub SSH deploy key with write permission is sufficient for this one repository; it is not an Actions runner credential. Creating or granting such access is an explicit setup step, not something the worker does. Do not put tokens in remote URLs, command lines, the repository, or logs.

The unit's `ProtectHome=true` deliberately excludes personal SSH configuration. For SSH, keep a dedicated key and verified GitHub known-hosts file under `/etc/fronteraeval`, readable only by the service account where needed. Check the host-key fingerprint through GitHub's official documentation before installing it; do not disable host-key checking. A dedicated SSH config can contain:

```sshconfig
Host github.com
  User git
  IdentityFile /etc/fronteraeval/id_ed25519
  UserKnownHostsFile /etc/fronteraeval/known_hosts
  IdentitiesOnly yes
  BatchMode yes
  StrictHostKeyChecking yes
```

Optional `/etc/fronteraeval/maintenance.env`, owned by root with mode 0600 (systemd reads it before dropping privileges):

```ini
FRONTERAEVAL_REPOSITORY=git@github.com:apolmig/fronteraeval.git
GIT_SSH_COMMAND="/usr/bin/ssh -F /etc/fronteraeval/ssh_config"
```

The application does not need a Netlify token: the existing Git integration builds normal pushes. An API token is not needed for the worker's public production verification. GitHub API authentication, if added for upstream discovery rate limits, should be separately scoped and kept in the protected environment file. Never reuse a personal broad token merely to simplify deployment.

After the VPS owner has chosen the machine, installed credentials, reviewed the units, and passed a manual run, the operator can install and activate the timer:

```sh
sudo install -m 0644 ops/fronteraeval-maintenance.service ops/fronteraeval-maintenance.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start fronteraeval-maintenance.service
sudo journalctl -u fronteraeval-maintenance.service --since today
sudo systemctl enable --now fronteraeval-maintenance.timer
systemctl list-timers fronteraeval-maintenance.timer
```

The refresh is Sunday 02:23 UTC, currently 03:23 in Madrid in November. The UTC time stays fixed across daylight-saving changes. `Persistent=true` catches one missed run after downtime, not an entire backlog. A failed service may retry after 30 minutes, with at most two starts in six hours. Warning exit 2 does not trigger an automatic rerun. `flock` prevents overlapping refresh/discovery workers, and the service kills its complete process group after 90 minutes. A lost VPS cannot run its own failure handler, so retain the independent Netlify health watchdog or an external uptime checker.

Journald and `result.json` are operational evidence, **not delivered email or paging alerts**. Connect a chosen monitoring service to systemd failures and `https://fronteraeval.org/api/health` before calling notifications operational. This installation does not change billing, DNS, hosting, or GitHub Actions configuration.

## Separate external discovery

```sh
node scripts/run-maintenance.mjs --prepare --job discovery --state-dir /path/to/private/state
```

This builds the admitted catalogue for deduplication, tests candidate identity, runs discovery, and stages only the JSON/Markdown editorial queue. Source-error observations are retained with a warning outcome; candidates are never admitted to the catalogue. `--publish --job discovery` requires the same explicit Git write setup. Optional `fronteraeval-discovery.service` and `.timer` templates schedule it Sunday 04:23 UTC, independently of the refresh result. They share the same lock; do not schedule them to overlap. The main refresh does not call discovery, so one inaccessible candidate source cannot prevent a validated catalogue refresh.
