# Flow

A compact, typography-led Chrome focus timer. A 300px popup pairs friendly lavender surfaces with a warm champagne-and-copper time button and subtle press feedback. Click the large time display to start; there is no separate Start button. One duration selector reveals custom input only when needed. Focus defaults to 10 minutes, with presets of 10, 20, 30, 60, 90, and 180 minutes. All data stays on your device.

The authoritative product specification is [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md). It supersedes the original visual brief throughout the product and data model.

## Develop and install

Use Node 24 and npm, matching `.node-version` and GitHub Actions.

```sh
npm ci
npm test
npm run typecheck
npm run build
```

Production output is `dist/`. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`. Pin Flow in the toolbar. `npm run dev` watches and rebuilds the extension; reload it on the extensions page after background or manifest changes, then reopen the popup. On PowerShell installations with script execution disabled, use `npm.cmd` for these commands.

## Code formatting

Run `npm run format` to format source, tests, the manifest, and project configuration with Prettier. Run `npm run format:check` to verify formatting without changing files. Shared rules live in `.prettierrc.json`; generated output, dependencies, and the lockfile are excluded in `.prettierignore`. Editors with the Prettier extension can use the same configuration when formatting on save.

## Tasks and recurring daily goals

Click the compact task selector above the timer to choose an active task or **Quick Focus**. The selector shows today's recorded focus and, when enabled, the task's daily target. The header's **Today's goals** button opens the task list, including tasks with disabled goals. The selected task is highlighted, and New task appears above every task row. Use **New task** or **Manage tasks** there (or in the selector) to create, rename, edit goals, archive, and restore tasks. An optional short emoji/icon can identify a task. Task names are case-insensitively unique, including archived tasks; Quick Focus is reserved.

Goals use whole-minute targets from 1 to 1440, with 30/60/120-minute presets and every-day or selected-weekday schedules. Disable a goal to keep the task without a target. Session duration remains independent: two 40- and 50-minute sessions contribute 90 minutes to the same daily goal. Completion is a quiet label with a bar capped at 100%; actual time keeps increasing. Excluded weekdays show Not scheduled today, while voluntary work still counts in history.

Selecting another task while a session exists requires **Switch and continue** or **Cancel**. Confirming closes the current task's focus interval and attributes only future focused time to the new task, retaining session ID, target, and countdown. During a break, selecting a task changes the next selection without assigning break time as focus. Ending the break still returns home, as before. Archiving hides a task and clears it as the next selection; an already-running session retains its existing attribution. Restoring brings back the same task ID, goal, and history.

Statistics includes **Focus by task** with Daily/Weekly period controls and previous/next navigation. It shows actual recorded time, including Quick Focus and archived tasks. Renaming or editing a goal changes labels/configuration, never past intervals. Historical goal-target snapshots are not stored; history intentionally reports actual focus separately from today's configured target.

Storage schema v2 adds tasks, goals, selected task, and task IDs on focused intervals. Schema v1 history and active timers migrate locally without starting another timer; unassigned old work remains Quick Focus. A running session has a current task, but historical attribution comes from each persisted segment. Live progress derives from the current timestamp anchor plus those segments, never from an incremented goal counter. Local calendar boundaries use `Date.setDate`, including 23/25-hour DST days. Day attribution follows the current local timezone. Migration/import validate records; malformed data is reported without overwriting the stored value. The task limit is 1000; the existing local-storage quota still applies.

This feature adds no permissions, packages, account, server, tracking, or network requests. It preserves the established interruption behavior (end and save partial focus), one-control breaks, automatic overlay release and stopped focus accounting at the target. It does not reintroduce focus pause/resume or break extension controls.

### Task-goal manual check

1. Run `npm install`, `npm run format:check`, `npm run typecheck`, `npm test`, and `npm run build`.
2. Open `chrome://extensions`. Enable Developer mode. Reload the existing Flow extension, or choose **Load unpacked** and select this repository's `dist` directory. Reopen the pinned popup.
3. Open the task selector, create Reading with a 30-minute daily target and Coding with a weekday-only target, then select Reading. Set a custom one-minute session to exercise the UI quickly; verify the session target does not alter the daily target.
4. While focus runs, select Coding: Cancel must preserve Reading; Switch and continue must preserve the timer while attributing subsequent time to Coding. Close/reopen the popup and restart Chrome; the selection and totals must persist.
5. At the target, verify focused time stops. Use Take a break from the notification; break time must not add to either goal. End the break and start another Reading session. Reading's total must accumulate across sessions.
6. Test Repeat session from another target notification: the old time must be saved once, a new session must use the same task/planned duration, and daily goal progress must remain. Try an old notification after switching sessions; it must do nothing.
7. In Today's goals, edit a target below its actual total: show Goal reached without a modal or stopping focus. Check an excluded weekday and a disabled goal. Rename, archive, and restore the task; compare Daily/Weekly history to ensure recorded time remains.
8. Select Quick Focus and verify it requires no task or goal. Test a duplicate task name, empty weekday schedule, export/import, and a version-1 data migration with an active timer. Confirm the existing blocking, keyboard, notification-expiry, and End break checks below still pass.

The automated suite covers interval accounting and mocked Chrome integration; live Chrome rendering, content overlays, notification presentation, and permission UI remain manual checks.

## Timer behavior

In Settings, **Show duration on home** is enabled by default. Turn it off to hide both the duration selector and custom input, leaving one large Start timer. This mode always uses your saved default focus duration; change that value in Settings. The visibility preference persists locally and is included in export/import, while older data defaults to showing the selector.

Statistics now has a full-width **Back to timer** button, a Today card, clear totals, a seven-day chart, and session history with precise durations and early-ended labels. Partial time counts toward focus totals without increasing finished-session counts.

Choose a preset (10, 20, 30, 60, 90, or 180 minutes) or custom duration. During the focus countdown, the popup has no extension, pause, break, or finish controls. To interrupt focus, visit a blocked website and choose **End session and save partial time**. This clears the active session, saves only actual accumulated focus time, and unblocks websites. It cannot be resumed. Partial entries appear in history and total/daily focus, but do not count as finished sessions. After reaching the target, repeat and break actions are available for 30 seconds; otherwise Flow saves the finished record and returns home. Manual breaks save focus progress until the break is ended or expires, then save the session and return to the home timer for a fresh start.

The previous 20-minute default upgrades to 10 once; other custom defaults are retained. Previously paused focus sessions are converted to interrupted history entries using only their already accumulated focus time.

At the target, focused time stops exactly at the planned duration. The popup and notification offer **Repeat session** or **Take a break** for 30 seconds. If neither is chosen, a persistent alarm saves the session once and returns the popup to the home timer. Closing the popup, disabling notifications, or dismissing the notification does not extend focus. After sleep or browser restart, elapsed action windows are completed without adding idle time. Repeat starts the original duration again for the same task. Breaks start only when requested and expose only End break; ending or completing a break returns home.

When a focus target is reached, its desktop notification offers **Take a break** and **Repeat session**. Take a break uses your saved default break duration. Repeat saves the current focus record, at the target, then starts a new session for the same task and the originally selected session duration. Goal progress is retained. The two operations run through the same serialized background queue; stale or repeated clicks cannot restart another session. For older sessions without an original-duration field, repeat uses the stored target, capped at 12 hours. If the task was archived, restore it before repeating. Notification buttons can require expanding the notification and depend on Chrome/OS support. Break notifications have no action buttons.

Notifications are no longer pinned: Chrome can dismiss the toast normally, and a persistent alarm clears each notification after approximately 30 seconds. Clicking a notification action clears it immediately. Cleanup can be delayed while Chrome or the computer is asleep. Updating/reloading the extension also removes pinned notifications created by older versions.

At countdown zero, the dimmed website overlay disappears automatically and website blocking stops. Focused time stops at the target; unanswered completion prompts save and return home after 30 seconds. The overlay has its own deadline timeout plus visibility/wake checks, so it does not depend solely on background alarm delivery. Extending the session reactivates blocking for the new countdown. After a break, start a fresh focus session from home to begin blocking again.

The blocklist, blocking toggle, data reset, and import remain locked until the session is finished or interrupted, including during breaks. The background worker enforces these restrictions and checks the sender page for interruptions. Other preferences remain editable. Chrome itself still allows users to revoke permissions or disable/uninstall an extension; Flow is not an administrative access-control system.

Statistics show total focus, daily focus, finished sessions, consecutive focus days, actual break time, and session history. The weekly chart uses your current local timezone and calendar boundaries. No decorative progression or reward models are stored.

Settings include default durations, notifications, operating-system notification sound preference, light/dark/system appearance, domain blocking, JSON export/import, and confirmed reset. Export contains finished history and preferences; finish an active session to include it. Import replaces existing finished history/preferences and is disabled while a session is active. JSON files are capped at 10 MB, and unsupported fields are discarded. Reset permanently removes all Flow data. Custom duration additions are limited to 1–720 minutes per action.

## Architecture

- `src/domain.ts`: pure state transitions, validation, time accounting, daily aggregation.
- `src/tasks.ts`: task/goal types, catalog validation, and task mutations.
- `src/goals.ts`: local-day/weekly aggregation, recurring schedules, and derived task progress.
- `src/TaskViews.tsx`: compact home selector, selection confirmation, Today's Goals, task/goal editing, and archive/restore.
- `src/TaskHistory.tsx`: lightweight daily/weekly actual-time history by stable task ID.
- `src/background.ts`: serialized operations, authoritative persistence, alarms, notifications, blocking rules.
- `src/blocking.ts`: current-tab domain matching and immediate overlay injection on already-open distracting websites. No tabs permission is required; current tab URLs are neither stored nor transmitted.
- `src/overlay.ts`: isolated in-page modal warning with a translucent dimmed backdrop; the loaded website stays in place. Escape cannot dismiss it. Switching tabs keeps focus running; ending the session saves partial time. Storage changes remove the warning during breaks or after finishing/interruption. New page loads still use the local blocked-page redirect.
- `src/policy.ts`: protected countdown, blocked-page interruption authorization, and session-long settings/data locks.
- `src/main.tsx`: popup, statistics, preferences; a foreground display interval only.
- `src/StatsView.tsx`: redesigned statistics screen and its factual summaries, chart, and history.
- `src/SessionActions.tsx`: progressive disclosure of extension/break options and session controls.
- `src/blocked.tsx`: local website blocking screen.
- `src/style.css`: shared identity, light/dark appearance, reduced motion.
- `assets/branding/`: original generated lavender-and-vanilla clock icon and regeneration documentation; `scripts/generate-icons.ps1` exports the Chrome icon sizes in `public/icons/`.
- `tests/domain.test.ts`: timer transitions and accounting regression coverage.
- `tests/background.test.ts`: mocked Chrome API coverage for serialization, alarms, notifications, blocking, storage failure, and preference updates.
- `tests/overlay.test.ts`: lightweight DOM/timer harness for overlay expiry, idempotent installation, extension, and wake checks; this does not replace Chrome rendering tests.
- `tests/goals.test.ts`: task attribution, switching, daily completion, schedules, midnight/DST, restart idempotency, schema migration, and repeat-session accounting.
- `tests/actions.test.ts`: rendered control-layout checks for protected countdowns, completion choices, and the single End break control and return-to-home behavior.

The background writes state before notification delivery to prevent duplicate attempts after restart. This means an operating-system failure after persistence can omit a notification rather than repeat it. Timers continue from timestamps on wake; a break caps at its scheduled end and never resumes focus automatically. With Chrome fully closed, notification delivery waits until Chrome runs again. Focus time assumes the session continues through sleep and browser closure until the user pauses or finishes. Wall-clock changes affect timestamp-based durations.

## Permissions and privacy

- `storage`: timer state, preferences, and history in `chrome.storage.local` (never sync or a server).
- `alarms`: wake the service worker when a target is reached.
- `notifications`: optional focus/break alerts. Sound is controlled by Chrome and the operating system; Flow does not play custom audio.
- `declarativeNetRequestWithHostAccess`: redirect listed domains only while focus is running.
- `scripting`: inject the dimming warning into listed websites that are already loaded, after optional website access has been granted. Reload the extension after updating its manifest. Chrome may require you to re-enable it or approve its updated permissions. The injected code runs in Chrome's isolated world and does not inspect website content.
- Optional HTTP/HTTPS host access: requested when you first enable blocking. Chrome asks for website access because the user can add arbitrary domains. Rules target only listed domains and subdomains, never collect history, and are removed on pauses, breaks, finish, or disabling blocking. Access can be revoked in Chrome extension settings.

No downloads permission, analytics, remote executable code, external requests, account, or embedded secrets. Imports are validated and whitelisted. No open-source license is included; this repository is proprietary.

## Verification and manual Chrome checklist

Automated tests cover partial-time interruption without resume, default migration, partial-history import/export, target completion windows, countdown extension rejection, automatic completion without extra time, break expiry and early ending, rejection of break pause/extension, persistence/restart recovery, repeated actions, single completion, exact accumulated focus, midnight statistics, and import/domain validation. Background tests use mocked Chrome APIs to check persistence failures, command serialization, rules, alarms, and notification deduplication. They do not exercise a real worker or permission UI.

Run these integration checks in Chrome 120+ with the unpacked build:

1. Start a session, close/reopen the popup, and restart Chrome. Confirm time persists. Sleep/wake across a target; verify one notification and no additional focused time.
   Start by clicking the timer itself, then repeat with keyboard Tab and Enter/Space. At the target, keep the popup closed and use the Take a break and Repeat session notification actions. Verify the saved break starts, or a fresh session begins with the same task and planned duration; goal totals must remain intact. Try an old notification after interrupting and starting another session; it must not affect the new session.
2. At the target, verify focus stays fixed. Ignore the notification and confirm a single history record and the home timer after 30 seconds. Repeat with notifications disabled, and after closing/reopening the popup.
3. Verify the initial duration is 10 minutes and presets are 10, 20, 30, 60, 90, and 180 minutes. During the countdown, verify there are no focus pause, extension, break, or finish controls. Interrupt from a blocked website; verify the session clears, websites unblock, partial time is saved once, finished-session count stays unchanged, and Resume is unavailable. Start again and verify a new session begins.
4. Configure blocking before starting. During focus and breaks, verify domain changes, the blocking toggle, import, and reset remain locked. Repeat from the completion prompt and verify a new protected countdown starts. Let the completion window expire or interrupt from the blocked page; verify settings unlock. Confirm breaks expose only End break; ending early or waiting for expiry must save one record and return home with a fresh timer. Starting again must create a new session.
   Keep a listed website and one of its subdomains open before starting focus. Both must display a dimmed warning overlay without refreshing or navigating away; unrelated tabs must remain untouched. The warning must block clicks and keyboard access to the underlying page and resist Escape dismissal. End the session from the overlay and verify partial focus is saved once and the original page becomes usable. Repeat when resuming after a break and when restoring tabs after Chrome restarts. Verify the overlay disappears during a break. Newly navigated blocked URLs still show Flow's local blocked page. Check actual rendering and keyboard behavior in Chrome; mocked tests do not validate browser top-layer rendering.
5. Disable notifications; check no alerts. Try OS-level notification restrictions. Test sound preferences subject to OS support.
   Let a target notification sit untouched: it must not be pinned and should clear within approximately 30 seconds while Chrome is awake. Check both focus and break alerts. Check that Take a break and Repeat session work during that window and that extension-update cleanup removes old pinned alerts.
   With an already-open website covered, let the focus countdown reach zero without opening the popup: its overlay must disappear and the original page must become usable while the completion prompt is displayed. Repeat from the notification and verify the warning reappears for the new session. Repeat after sleep/wake.
6. Inspect daily focus around midnight, export/import finished sessions, reject malformed JSON, and confirm reset. Check light/dark/system modes, keyboard controls, focus visibility, reduced motion, and the actual popup at normal and increased text scaling.
   Turn off Show duration on home and confirm both preset/custom fields disappear. Change the default duration in Settings and verify the single timer button uses it. Reload Flow and confirm the preference persists; enable it again to restore duration selection. Open statistics and check the full-width Back to timer control, Today card, weekly values, and partial-session labels.

Playwright additionally loads the packaged extension into isolated Chromium and exercises preferences, tasks, goals, timer transitions, and statistics. Run `npx playwright install chromium` and `npm run test:e2e` after building. Native notification delivery, permission prompts, real website blocking, and visual inspection still require the manual checklist before store submission. Flow surfaces operation errors; an active session is never silently reset on read failure. Very long histories are limited by Chrome local storage quota; export periodically.

## Chrome Web Store preparation

See [CI, merge protection, and store releases](.github/RELEASING.md) for the complete setup and release procedure. PRs run quality checks, a dependency audit, validated packaging, and Chromium E2E tests, summarized by `PR gate`. Apply the included repository ruleset to make that check mandatory before merging to `main`; workflow files alone do not enforce it.

`npm run package:extension` creates a store-ready ZIP and checksum in `release/`. The manual **Chrome Web Store release** workflow reruns CI, uses the tested package, and uploads a draft or explicitly submits it for review from `main`. Configure the protected environment, store listing, and credentials first. Nothing has been published by adding these workflows.
