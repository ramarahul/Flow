# Security policy

## Reporting a vulnerability

Do not post exploit details, credentials, browsing information, or exported Flow
data in public issues.

Use [GitHub private vulnerability reporting](https://github.com/ramarahul/Flow/security/advisories/new)
when it is available. If the reporting form is unavailable, use the publisher's
contact details on Flow's Chrome Web Store listing. If neither channel is
available, open an issue asking for a private security contact without describing
the vulnerability or including sensitive material.

Include the affected extension version, Chrome version, reproduction steps,
expected versus actual behavior, and potential impact. Use synthetic tasks and
test domains. Please allow time to investigate and coordinate a fix before
publishing technical details. No response-time or bounty commitment is made here.

## Scope and updates

Reports about the current release and the `main` branch are welcome, especially
message authorization, imported data, website blocking and injection, local data
handling, and the release pipeline. Reports about older versions are useful when
the issue also affects the current implementation.

Install updates from the official Chrome Web Store listing or review the source
you build locally. Keep Chrome updated. Never share publishing credentials,
private signing keys, or personal exports in bug reports.

## Automated checks

CI runs dependency auditing, package/permission validation, regression tests,
browser tests, and CodeQL analysis of the application and release scripts. These
checks reduce risk but do not guarantee that every vulnerability will be detected.

For data-handling details, see [the privacy policy](PRIVACY_POLICY.md).
