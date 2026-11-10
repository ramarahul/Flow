# Publishing identity and trust review

## What was and was not verified

The repository workflow was inspected. No authenticated Google Cloud or GitHub
administration connection is available in this workspace, so the live provider
condition, attribute mapping, service account IAM policy, environment reviewers,
deployment branch rules, and variable values were **not independently verified**.
No cloud or GitHub configuration was changed. The assessment below combines the
checked-in workflow with the configuration supplied by the maintainer.

| Boundary     | Evidence and conclusion                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository   | The supplied repository-specific `roles/iam.workloadIdentityUser` binding restricts impersonation to Flow if its mapped principal really matches only Flow and no broader binding grants access. The owner-ID provider condition alone does not do this. Verify the live member, mappings, and other bindings/providers. |
| Environment  | The workflow uses the existing `chrome-web-store` environment. Required reviewer approval is supplied configuration and must be confirmed in GitHub. No environment condition was supplied for Google Cloud, so a cloud-side environment restriction is not established.                                                 |
| Workflow     | The release workflow grants OIDC only to its main-only publish job. No provider/IAM restriction to this workflow was supplied, so a cloud-side workflow restriction is not established. Another workflow in the same repository could otherwise request impersonation.                                                   |
| Branch/event | Local release planning rejects PRs and non-main refs. Provider conditions must independently require `refs/heads/main` and allowed release events to enforce this at Google Cloud.                                                                                                                                       |

Workflow conditions are not a substitute for cloud-side trust conditions. Protect
main and changes to `.github/workflows/publish.yml` and `scripts/` with review.
An administrator who can change cloud trust, protected environments, or approved
main code remains inside the trusted administrative boundary.

## Read-only configuration audit

An administrator can inspect these without requesting a token or releasing:

```sh
gcloud iam workload-identity-pools providers describe github \
  --workload-identity-pool=github-actions --location=global --project=POOL_PROJECT_ID
gcloud iam workload-identity-pools providers list \
  --workload-identity-pool=github-actions --location=global --project=POOL_PROJECT_ID
gcloud iam service-accounts get-iam-policy SERVICE_ACCOUNT_EMAIL \
  --project=SERVICE_ACCOUNT_PROJECT_ID
gcloud projects get-iam-policy SERVICE_ACCOUNT_PROJECT_ID
gh api repos/ramarahul/Flow --jq '{repository_id: .id, owner_id: .owner.id}'
gh api repos/ramarahul/Flow/environments/chrome-web-store
gh api repos/ramarahul/Flow/environments/chrome-web-store/deployment-branch-policies
```

Replace uppercase placeholders; confirm `ramarahul/Flow` is the intended repository.
Also inspect inherited IAM roles and any other principals that can impersonate the
service account. A narrow binding does not cancel a broader grant. Principals are
pool-scoped, so inspect other providers that could produce matching attributes.

## Recommended Google Cloud restrictions

For a provider dedicated to this release identity, retain the owner-ID restriction
and extend it to the immutable repository ID, environment, exact workflow ref,
main branch, and release events. Obtain the numeric IDs from GitHub rather than
guessing them. A suitable attribute mapping is:

```text
google.subject=assertion.sub
attribute.repository_owner_id=assertion.repository_owner_id
attribute.repository_id=assertion.repository_id
attribute.environment=has(assertion.environment) ? assertion.environment : ''
attribute.workflow_ref=assertion.workflow_ref
attribute.ref=assertion.ref
attribute.event_name=assertion.event_name
```

Use this CEL attribute condition after replacing `OWNER_ID` and `REPOSITORY_ID`:

```text
attribute.repository_owner_id == 'OWNER_ID' &&
attribute.repository_id == 'REPOSITORY_ID' &&
attribute.environment == 'chrome-web-store' &&
attribute.workflow_ref == 'ramarahul/Flow/.github/workflows/publish.yml@refs/heads/main' &&
attribute.ref == 'refs/heads/main' &&
attribute.event_name in ['push', 'workflow_dispatch']
```

Apply these through the provider's **Edit provider → Attribute mapping/conditions**
or `gcloud iam workload-identity-pools providers update-oidc github` with
`--workload-identity-pool=github-actions --location=global --project=POOL_PROJECT_ID`,
`--attribute-mapping`, and `--attribute-condition`. Updating mappings replaces the
mapping set: preserve other required mappings and review the whole diff first.

On the target service account, the repository-ID member should be:

```text
principalSet://iam.googleapis.com/projects/POOL_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/attribute.repository_id/REPOSITORY_ID
```

Grant it **roles/iam.workloadIdentityUser on that service account**, and remove or
narrow superseded owner-wide, pool-wide, name-only, or other broad impersonation
bindings after reviewing their consumers. Do not grant Owner/Editor or create a
service account key. This WIF flow uses `generateAccessToken`; it does not require
domain-wide delegation or an additional broad Token Creator role for the GitHub
principal when Workload Identity User already grants the necessary permission.

If this provider/pool is shared with other extension repositories, do not replace
its condition with a Flow-only policy without assessing those consumers. Use an
isolated release provider/pool with these restrictions, or an equivalent
claim-constrained mapped principal for this service account, and update
`GCP_WORKLOAD_IDENTITY_PROVIDER` deliberately. The example repository-ID binding
alone does **not** enforce environment/workflow when the provider remains
owner-only. Review every other provider/binding in the trust path as well.

The publish job is a normal job in `publish.yml`, so match **workflow_ref**, not
`job_workflow_ref` (which describes a reusable workflow). Do not assume a
branch-based `sub` when the job references an environment. GitHub supports custom
and immutable subject formats; the recommended checks above use explicit claims
and numeric IDs rather than hardcoding the subject format. Keep the issuer
`https://token.actions.githubusercontent.com` and verify the provider accepts the
auth action's default audience; do not broaden audiences to work around failures.

## GitHub and token handling

- Keep environment **chrome-web-store**, its required reviewer approval, main-only
  deployment branch policy, and administrator bypass disabled. Confirm the account
  plan supports these controls. Do not enable `CWS_AUTO_RELEASE` as part of migration.
- Only the publish job has `contents: read` and `id-token: write`. Build/test/PR
  jobs have no publishing OIDC permission. There is no `pull_request_target` event.
- The auth action's official `v3` Git reference was resolved to commit
  `7c6bc770dae815cd3e89ee6cdf493a5fab2cc093` during implementation. It is pinned to
  that immutable commit, not a mutable tag. Other action pins remain unchanged.
- It requests a 900-second service account access token with only the
  `https://www.googleapis.com/auth/chromewebstore` scope. Credentials are minted
  after approval and after the verified build artifact is downloaded. No JSON
  credential file is generated and no general Google environment is exported.
- The upstream action masks tokens and sets internal step outputs. The workflow
  passes its masked access-token output to the immediately following Node
  process's environment. It does not publish token-bearing job/workflow outputs,
  log tokens, or upload credentials. A literal ban on even upstream internal step
  outputs is incompatible with this action; do not mistake these masked internal
  handoffs for public workflow outputs or print them for debugging.
- Never run untrusted dependency installation/build steps in the authenticated
  job. The publisher uses Node built-ins and the existing release-version helper.

## Chrome Web Store V2 contract

All requests carry `Authorization: Bearer <temporary service account access token>`:

| Operation      | Request                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status / check | `GET https://chromewebstore.googleapis.com/v2/publishers/PUBLISHER_ID/items/EXTENSION_ID:fetchStatus`, no request body                                   |
| Package        | `POST https://chromewebstore.googleapis.com/upload/v2/publishers/PUBLISHER_ID/items/EXTENSION_ID:upload`, ZIP bytes with `Content-Type: application/zip` |
| Submit         | `POST https://chromewebstore.googleapis.com/v2/publishers/PUBLISHER_ID/items/EXTENSION_ID:publish`, JSON body                                            |

The submission body remains:

```json
{ "publishType": "DEFAULT_PUBLISH", "skipReview": false, "blockOnWarnings": true }
```

`upload` only replaces the draft package. `submit` asks for normal review and
publication after approval, preserving the previous behavior. `check` only reads
status and validates the local tested artifact. It does not test upload/write
acceptance. No visibility, rollout, review-skip, cancellation, or staged-publish
operation is introduced.

For async uploads, poll `fetchStatus.lastAsyncUploadState` and require `SUCCEEDED`
before submission. The official enum lists `IN_PROGRESS`, while Google's upload
guide also refers to `UPLOAD_IN_PROGRESS`; the existing polling accepts both.
Undocumented success values such as `SUCCESS` now fail closed. No API V1 endpoints
or refresh-token fallback remain. HTTP response bodies are suppressed, and
redirects are rejected. Artifact hash/commit/version and active-review guards
remain in place.

## Safe verification and legacy removal

Local tests mock every HTTP request and never authenticate or call the live Store.
Build/package validation checks the ZIP layout without an upload. After merging
the reviewed migration, manually run the existing release workflow on main in
**check** mode, with its exact version, and approve the protected environment.
That future run verifies OIDC impersonation and V2 item-status access without a
Store mutation. It was not run during implementation. Test denied identities
through your cloud policy review/testing before relying on all trust boundaries.

Leave the three legacy OAuth secrets present but unused until the read-only check
and a separately authorized real draft upload/submission succeed. Then confirm no
other workflows/apps depend on them, delete the GitHub secrets manually, and revoke
the unused refresh-token grant. This migration neither deletes nor rotates them.

## Official references

- [Google auth action and inputs](https://github.com/google-github-actions/auth)
- [Google deployment federation and attribute conditions](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [GitHub OIDC claims and subject formats](https://docs.github.com/en/actions/reference/security/oidc)
- [Chrome Web Store service account access](https://developer.chrome.com/docs/webstore/service-accounts)
- [V2 ZIP upload](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/media/upload)
- [V2 status](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus)
- [V2 publishing](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish)
- [V2 upload states](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/UploadState)
- [Upload guide and async naming discrepancy](https://developer.chrome.com/docs/webstore/using-api)
