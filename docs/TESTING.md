# Testing Flow

Use Node.js 24 and install dependencies with `npm ci`.

## Automated checks

```sh
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

On Linux, use `npx playwright install --with-deps chromium` to install browser
dependencies. `npm run format` applies the shared Prettier configuration.

Unit tests cover timer accounting, tasks, goals, validation, and mocked Chrome
APIs. Playwright loads the packaged extension in isolated Chromium and exercises
popup settings, task selection, timer transitions, historical graph navigation,
and session history at popup width. Failure traces and screenshots are saved in
`test-results/`; the HTML report is in `playwright-report/`.

GitHub Actions also runs CodeQL analysis, which must finish successfully for
`PR gate` to pass. Review its findings in GitHub's code-scanning view. CodeQL is
not executed by the local commands above. See [release setup](../.github/RELEASING.md)
for repository enablement and permissions.

## Manual release checklist

Load the exact packaged build in Chrome 120 or newer. Automated checks do not
replace testing real website access, overlay rendering, or native notifications.

1. **Timers:** start with the timer button and keyboard. Close/reopen the popup,
   restart Chrome, and sleep/wake across a deadline. Verify focused time stops at
   the target and the session saves once after the 30-second action window. Repeat
   with notifications disabled and dismissed. No extra idle time should be logged.
2. **Notification actions:** choose Take a break and Repeat session in separate
   runs. Verify the saved break duration or a fresh session with the same task and
   original duration. Test native notification delivery, expiry, and OS restrictions.
   Old notifications must not affect a newer session.
3. **Blocking:** grant website access and configure a domain before starting. Check
   new visits, already-open tabs, subdomains, and restored tabs. Unlisted websites
   should remain usable. Verify the overlay blocks mouse/keyboard interaction,
   cannot be dismissed with Escape, and disappears at the target. Test permission
   denial and revocation. End focus from the blocking screen and check partial time.
4. **Controls:** verify no pause, extension, break, or finish controls during the
   countdown. Blocklist changes, import, and reset must stay locked during active
   sessions. Breaks expose only End break and return home when ended or expired.
5. **Tasks and goals:** create, rename, select, switch, archive, and restore tasks.
   Verify selected styling, disabled goals, scheduled weekdays, Quick Focus, and
   confirmation before switching. Recorded time must retain its original task.
6. **Statistics:** check calendar week/month/year navigation, synchronized task totals,
   28–31 day months, 12 monthly year bars, upcoming dates, older session expansion,
   midnight boundaries, and partial-session labels. No future
   graph periods or periods before the earliest saved record should be selectable.
7. **Preferences and data:** test default durations, hidden duration selection,
   light/dark/system themes, keyboard focus, text scaling, and reduced motion.
   Export/import a backup, reject malformed imports, and verify confirmed reset.

See [release setup](../.github/RELEASING.md) for GitHub checks, repository protection,
package artifacts, credentials, and Chrome Web Store submission.
