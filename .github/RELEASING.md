# CI, merge protection, and Chrome Web Store releases

## What runs

Every PR targeting `main`, push to `main`, and merge-queue entry runs formatting,
TypeScript checking, timer/background/overlay regression tests, release-tooling tests,
and a high/critical dependency audit. A parallel CodeQL job scans application and
release-tooling JavaScript/TypeScript using the security-extended queries. CI then builds and checks the extension's
version, permission allowlist, CSP, entry points, icons, and packaged files.

Playwright installs the packaged extension into an isolated Chromium profile and
checks preferences and popup persistence, task and recurring-goal management, task
switching, timer expiry, repeat, breaks, and statistics. Tests move fixture timestamps
to exercise expiry without waiting minutes. Native notification button delivery,
Chrome's optional-permission prompts, real website redirects and overlay rendering
still require the [manual Chrome checklist](../docs/TESTING.md). Unit tests cover their logic.

`PR gate` fails if any preceding stage fails or is skipped. There are no path filters.
Workflow defaults have only `contents: read`. Only the protected publishing job
adds `id-token: write` for Google Workload Identity Federation; PRs cannot run it.
PRs receive no publishing credentials. Only the CodeQL job receives `security-events: write` to upload
findings and `actions: read` for analysis metadata. The reusable CI caller grants
these scanning permissions to verification, not to the credential-bearing
publishing job.
Runners are pinned to Ubuntu 24.04 to match the locked Playwright browser tooling;
review browser support before changing the runner OS.
Actions are pinned to commit hashes; Dependabot proposes updates. No extension
permission was added for this pipeline.

## One-time repository setup

Workflow files alone cannot prevent merges. Push these files to GitHub and let CI
run once, then configure server-side protection. Nothing in this checkout has yet
changed GitHub repository settings.

CodeQL uses advanced setup through this workflow. If GitHub's CodeQL default
setup is already enabled, switch to advanced setup to avoid conflicting analyses.
Code scanning must be available and enabled for the repository; public repositories
are supported, while private repositories require an eligible GitHub Code Security
plan. A setup or upload failure fails `PR gate` rather than skipping the scan.
See [GitHub's CodeQL setup guide](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning).

Successful analysis is not a clean security audit. Review findings under Security
and quality → Code scanning. To block merges based on alert severity, configure
GitHub's code-scanning merge protection separately; the workflow gate checks that
analysis completed successfully.

Enable private vulnerability reporting in repository Settings → Advanced Security
so [SECURITY.md](../SECURITY.md) provides a usable private reporting form. Adding
the policy file does not enable that GitHub setting. No server settings are changed
automatically by adding these files.

1. Use Node 24 (`.node-version`) and `npm ci`. Preview with
   `npm run configure:github`.
2. Set `GH_TOKEN` in your local process to a fine-grained token restricted to this
   repository with **Administration: write**. Never put it in a file or commit it.
   Run `npm run configure:github -- --apply`, then remove the token from the process.
   The script configures its own ruleset without deleting unrelated rulesets.
   It validates the JSON against the reviewed policy in `scripts/github-ruleset.mjs`
   and sends only that fixed payload to GitHub. Unexpected fields or policy changes
   stop setup before any request. Intentional policy changes require reviewing
   both files together. Authenticated API requests reject redirects.
   Alternatively, import `.github/main-ruleset.json` in GitHub Settings → Rules →
   Rulesets and configure the environment described below manually.
3. Confirm the active `main requires verified PRs` ruleset requires a PR and the
   GitHub Actions `PR gate` check, requires the branch to be up to date, resolves
   review threads, and blocks deletion and force pushes, with no bypass actors.
   Baseline required human approvals are **zero** so a sole maintainer can merge
   after passing checks. CODEOWNERS requests review of sensitive files; teams
   should raise required approvals and enable code-owner review if desired.
4. Confirm environment `chrome-web-store` allows only the `main` branch, requires
   repository-owner approval, and disables administrator bypass. The script
   preserves existing reviewers and self-review settings. For a solo owner,
   self-review is allowed so releases remain possible. Organization repositories
   need a reviewer/team configured manually. GitHub plan and repository visibility
   can limit environment reviewers and rulesets; the script fails rather than
   removing protections. If an API call fails, inspect settings because earlier
   successful calls may already have applied.

An authenticated repository administrator must perform this setup. A GitHub app
connection does not necessarily grant the Administration permission needed here.
See [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
and [deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## One-time store setup

Flow now uses GitHub OIDC with Google Cloud Workload Identity Federation (WIF)
and service account impersonation. It does not exchange OAuth refresh tokens,
read legacy `CWS_CLIENT_ID` / `CWS_CLIENT_SECRET` / `CWS_REFRESH_TOKEN` secrets,
or use service account JSON keys.

1. Enable the Chrome Web Store API and IAM Service Account Credentials API. Verify
   the Security Token Service API needed by the existing pool is available.
2. Confirm the intended service account is authorized in Chrome Web Store
   Publisher Settings for the existing publisher. Cloud IAM roles alone do not
   grant Chrome Web Store access. See Google's [service account guide](https://developer.chrome.com/docs/webstore/service-accounts).
3. Confirm the existing `github-actions` pool / `github` provider and the service
   account's `roles/iam.workloadIdentityUser` binding enforce the boundaries in
   [the OIDC trust review](../docs/PUBLISHING_OIDC.md). Owner-only provider trust
   plus a repository binding does not also restrict environment or workflow.
4. In GitHub Settings ? Environments ? **chrome-web-store**, confirm required
   reviewer approval, main-only deployment branches, and no administrator bypass.
   Keep the existing environment name and reviewer settings.
5. Set these environment-scoped **variables** (no new secrets):

   | Name                             | Value                                                                                            |
   | -------------------------------- | ------------------------------------------------------------------------------------------------ |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github` |
   | `GCP_SERVICE_ACCOUNT`            | Authorized service account email                                                                 |
   | `CWS_PUBLISHER_ID`               | Existing publisher ID                                                                            |
   | `CWS_EXTENSION_ID`               | Existing 32-character extension ID                                                               |

The pinned `google-github-actions/auth` action runs after approval and artifact
download, immediately before the publisher. It impersonates that service account
and requests a 900-second access token scoped only to
`https://www.googleapis.com/auth/chromewebstore`. It writes no credential file and
exports no general Google credential environment. No dependency installation or
build runs in this job.

The upstream auth action necessarily creates **masked internal step outputs**;
the access token is handed only to the next step's `CWS_ACCESS_TOKEN` environment.
There are no token-bearing job/workflow outputs, artifacts, or explicit logs, and
no token is written to `GITHUB_ENV`. If ?no outputs? means even the auth action's
internal outputs, that is incompatible with this action's implementation; this
workflow does not claim otherwise. Never print action outputs or enable verbose
HTTP/token debugging. `.gitignore` excludes `gha-creds-*.json` as defense in depth.

Legacy OAuth secrets are deliberately left untouched in GitHub. After a successful
OIDC `check` run and a separately approved real draft upload/submission confirm
that no other workflow uses them, delete those three legacy secrets manually.
Revoke the old refresh-token authorization if it is not used by any other app.

## Verify OIDC without changing the Store

After reviewing and merging this migration through the normal protected PR process:

1. Keep `CWS_AUTO_RELEASE` unset or `false` until you intend to use the existing
   opt-in automatic release path. This migration does not enable it or bump versions.
2. Run **Actions → Publish — automatic → Run workflow**, choose **main**,
   its exact current version, and mode **check**. Approve the same protected
   environment deployment after CI passes.
3. The publisher verifies artifact commit/version/checksum and issues only a V2
   `GET ...:fetchStatus`. It never uploads a ZIP or submits/publishes an item in
   check mode. An already-published version is allowed because this is read-only.
4. Review the job outcome and Cloud audit logs without logging tokens. A successful
   check confirms token minting and item-status access, not that an upload or
   submission will be accepted. Validate those only in a later intentional release.

No live authentication, Store status call, upload, publish, deployment, or release
was executed as part of the local migration validation; tests use fake tokens and
mocked HTTP requests.

## Release a version

The easiest path is **Actions → Release Flow → Run workflow → main**.
Choose **bug-fix** or **feature**, optionally add a short summary, and follow the
generated release PR. Version synchronization, formatting, and CI dispatch are
automatic. Merge after checks pass, then approve the existing publishing job
if `CWS_AUTO_RELEASE=true` is enabled. Otherwise use the manual release path below.

Enable **Settings → Actions → General → Workflow permissions → Allow GitHub
Actions to create and approve pull requests** once. Preparation creates a PR but
does not approve/merge it or publish anything. Its main-only job has GitHub
contents/PR write permissions plus Actions write for explicit CI dispatch, and
has no OIDC permission or publishing credentials. No extra secrets are needed.
See [the recommended GitHub-button flow](../docs/RELEASES.md#recommended-use-the-github-button).

Start with [the release guide](../docs/RELEASES.md), which explains when to release,
which version to choose, and the preparation command. Do not upload another build
over the first submission while it is under review.

For opt-in automation, create the **repository variable** `CWS_AUTO_RELEASE` with
the exact value `true` under Settings → Secrets and variables → Actions → Variables.
Only enable it after the first release is published and the main-only protected
environment, required reviewers, API credentials, and CodeQL setup are working.
This variable contains no credential. Keeping it unset or `false` disables
automatic submissions without disabling manual releases.

When a higher version is merged to `main`, the release workflow compares it with
the previous main commit, checks all version files and changelog notes, reruns the
full CI workflow, and waits for the `chrome-web-store` environment approval. It
then uploads the exact tested package and submits it for normal store review.
Ordinary feature merges and dependency updates with no Flow version change do not
submit anything. Initial branch pushes do not automatically publish.

For a manual release, use Actions → **Publish — automatic** → Run workflow,
choose **main**, enter its exact version, and select `upload` for a draft or `submit`
for review, or `check` for read-only access verification. This runs the same validation and protected publishing job regardless
of the automation variable. A draft is not a publication. Use the dashboard to
submit an already-uploaded draft rather than uploading the same version again.

The publisher checks store status before upload and refuses an active review,
staged submission, unknown submission state, or a version that is not higher than
the published channels. It does not cancel reviews, override approvals, retry
uploads automatically, or bypass Google's review. Check the Developer Dashboard
after a failed or interrupted release before retrying.

No tags or GitHub Releases are created. Automatic store submission happens only
after an intentional version increase on main with automation enabled and all
configured checks and approvals satisfied. Keep the tested artifact and workflow
commit as the release record. See [Google's update process](https://developer.chrome.com/docs/webstore/update).

## Local verification

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run test:tooling
npm audit --audit-level=high
npm run build
npm run verify:extension
npm run package:extension
npx playwright install chromium
node scripts/package-extension.mjs unpack
npm run test:e2e
```

Linux browser dependencies can be installed with
`npx playwright install --with-deps chromium`. Reports and failure traces are in
`playwright-report/` and `test-results/` (also uploaded by CI). Packages and reports
are ignored by Git. Publishing tests use fake temporary access tokens and mocked HTTP requests;
they never contact the live store.
