# CI, merge protection, and Chrome Web Store releases

## What runs

Every PR targeting `main`, push to `main`, and merge-queue entry runs formatting,
TypeScript checking, timer/background/overlay regression tests, release-tooling tests,
and a high/critical dependency audit. It then builds and checks the extension's
version, permission allowlist, CSP, entry points, icons, and packaged files.

Playwright installs the packaged extension into an isolated Chromium profile and
checks preferences and popup persistence, task and recurring-goal management, task
switching, timer expiry, repeat, breaks, and statistics. Tests move fixture timestamps
to exercise expiry without waiting minutes. Native notification button delivery,
Chrome's optional-permission prompts, real website redirects and overlay rendering
still require the [manual Chrome checklist](../docs/TESTING.md). Unit tests cover their logic.

`PR gate` fails if any preceding stage fails or is skipped. There are no path filters.
CI and release workflows have only `contents: read`; PRs receive no store secrets.
Runners are pinned to Ubuntu 24.04 to match the locked Playwright browser tooling;
review browser support before changing the runner OS.
Actions are pinned to commit hashes; Dependabot proposes updates. No extension
permission was added for this pipeline.

## One-time repository setup

Workflow files alone cannot prevent merges. Push these files to GitHub and let CI
run once, then configure server-side protection. Nothing in this checkout has yet
changed GitHub repository settings.

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

1. Update `package.json`, `package-lock.json` (use `npm install --package-lock-only`),
   and `public/manifest.json` to the same new version. Chrome updates require a higher
   manifest version. Open a PR, wait for `PR gate`, then merge.
2. Complete the [manual Chrome checklist](../docs/TESTING.md) using the CI package. CI artifacts
   contain `flow-VERSION.zip`, its SHA-256 file, and `release.json`. The manifest is
   at the ZIP root. Test with the actual Chrome/browser/OS versions you support.
3. In Actions → **Chrome Web Store release** → Run workflow, choose **main**, enter
   the exact version, and choose `upload` (default) for a draft or `submit` to upload
   and request store review. Review and approve the environment deployment.
4. The workflow reruns all CI stages, then uploads the exact checksum-verified
   package tested by Chromium in that run. It verifies the commit and version,
   waits for asynchronous upload, and fails on errors before publication.
   `submit` requests normal review with warning checks enabled; it does not bypass
   review or guarantee immediate publication. Monitor the Developer Dashboard.

There is no automatic publication on PRs, pushes, or dependency updates, and no
GitHub release or tag is created. Do not rerun an upload for an already-used store
version; inspect the dashboard first and bump the version for the next update.

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
