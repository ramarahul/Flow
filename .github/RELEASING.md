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
Workflow defaults and the publishing job have only `contents: read`; PRs receive
no store secrets. Only the CodeQL job receives `security-events: write` to upload
findings and `actions: read` for analysis metadata. The reusable CI caller grants
these permissions to verification, not to the credential-bearing publishing job.
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

1. Register the developer account, enable two-step verification, create the listing,
   and complete store listing/privacy details in the Developer Dashboard. Prepare
   actual screenshots, artwork, permission explanations, and a public privacy policy.
   The initial listing and account setup require dashboard work.
2. Follow the [official Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api/)
   to enable API access and obtain an OAuth client ID, client secret, and refresh
   token authorized for `https://www.googleapis.com/auth/chromewebstore` with the
   account that can manage this item. Use durable production OAuth configuration;
   a testing-mode consent setup can cause refresh tokens to expire.
3. In GitHub Settings → Environments → `chrome-web-store`, add:

   | Kind     | Name                | Value                                   |
   | -------- | ------------------- | --------------------------------------- |
   | Secret   | `CWS_CLIENT_ID`     | OAuth client ID                         |
   | Secret   | `CWS_CLIENT_SECRET` | OAuth client secret                     |
   | Secret   | `CWS_REFRESH_TOKEN` | Authorized refresh token                |
   | Variable | `CWS_PUBLISHER_ID`  | Publisher ID from the developer account |
   | Variable | `CWS_EXTENSION_ID`  | Existing 32-character extension ID      |

Keep these at environment scope, not repository scope. Credentials are supplied
only to the final upload step after approval; that job installs no npm dependencies.
Do not paste credentials in issues, logs, workflow inputs, or PRs. Revoke and rotate
them in Google/GitHub if exposed.

## Release a version

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

For a manual release, use Actions → **Chrome Web Store release** → Run workflow,
choose **main**, enter its exact version, and select `upload` for a draft or `submit`
for review. This runs the same validation and protected publishing job regardless
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
are ignored by Git. Publishing tests use fake credentials and mocked HTTP requests;
they never contact the live store.
