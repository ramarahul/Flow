# Releasing Flow

## When to release

Release when a useful change is tested and ready for users, rather than after every
commit. Fixes to broken functionality or security deserve a prompt patch release.
Feature work can accumulate on branches until it is ready. Documentation, CI, and
repository-only changes normally do not require a new extension package.

The first `1.0.0` submission is under review. Keep its ZIP and commit unchanged as
the submitted release record. Continue development on branches. Wait for the
review outcome before submitting the next build; if a critical issue requires
replacing the pending submission, use the Developer Dashboard deliberately.

Google reviews updates too. A successful upload or GitHub Actions run does not
mean the update is approved or publicly available. Existing users continue using
the published version while an update is reviewed.

## Choose the next version

Flow uses three numeric components, with no `v` prefix or prerelease suffix in the
manifest. Choose a version higher than the current source and the store version.

| Change                                  | Example from 1.0.0 | Command                            |
| --------------------------------------- | ------------------ | ---------------------------------- |
| Bug fix or small UI improvement         | 1.0.1              | `npm run release:prepare -- patch` |
| New backward-compatible feature         | 1.1.0              | `npm run release:prepare -- minor` |
| Breaking behavior or data compatibility | 2.0.0              | `npm run release:prepare -- major` |

These are project conventions. A major bump is not a substitute for a safe data
migration. Chrome version components must stay within its numeric bounds; the
preparation command rejects unsupported versions. An explicit higher version is
also supported: `npm run release:prepare -- 1.2.3`.

## Prepare the release PR

1. Add accurate user-facing release notes under `## [Unreleased]` in
   [CHANGELOG.md](../CHANGELOG.md). Do not call a prepared version published.
2. Run the appropriate `release:prepare` command. It synchronizes `package.json`,
   both root versions in `package-lock.json`, and `public/manifest.json`, and moves
   the notes into a versioned changelog section. It makes no Git commits, tags,
   pushes, or network requests.
3. Run `npm run format` and the checks in [TESTING.md](TESTING.md). Review the diff
   and open a PR. Other normal feature PRs do not need to bump the extension version.
4. Test the PR's CI package in Chrome, including updating an existing unpacked
   installation without removing its data. Check that tasks, history, preferences,
   active timers, and completion windows survive. Review any permission changes.
5. Ensure all checks pass, review security findings and release notes, and merge
   the version PR to `main`.

## Enable automation once

After the first store release is published, follow [.github/RELEASING.md](../.github/RELEASING.md)
to configure the protected `chrome-web-store` environment, its three OAuth secrets,
and its publisher/extension ID variables. Enable the repository's CodeQL advanced
setup as described there.

Set the repository variable **`CWS_AUTO_RELEASE=true`**. There is no automatic
submission until that opt-in exists. Branch restrictions remain main-only; no tag
deployment permission or repository-write token is needed.

After a higher version reaches main, automation plans the release, reruns all CI
checks, and waits for your configured environment approval. Approve the deployment
after confirming the version, notes, and manual checks. It uploads the tested ZIP
and submits it to Google. The environment approval remains an intentional human
step; merging alone does not bypass it.

## Manual release and recovery

You can keep automation off and use **Actions → Chrome Web Store release → Run
workflow** on main. Enter the exact prepared version and choose `upload` for a draft
or `submit` for review. Both paths use full CI and the protected environment.

- **CI fails:** fix the failure through a PR. No package should be uploaded.
- **Store review is already active or staged:** wait, or resolve it in the dashboard.
  The upload script refuses to replace it automatically.
- **Upload or submission fails:** inspect the dashboard before retrying. An upload
  might have succeeded even if a later step or network response failed. Submit an
  existing draft in the dashboard, or prepare a higher version for a new package.
- **Google rejects the update:** address the stated issue, update disclosures if
  needed, test again, and prepare a higher version when changing the package.
- **A published update has a serious bug:** prepare a higher patch version with the
  fix. Do not lower the version number or reuse a published version. Consider the
  dashboard's rollback option if available for your release, and test data
  compatibility before using it.

After publication, install or update Flow from the store in a separate profile,
verify the actual installed version, and smoke-test timers and blocking. Then add
the real publication date to the changelog if desired and announce the store link.

Official reference: [Update a Chrome Web Store item](https://developer.chrome.com/docs/webstore/update).
