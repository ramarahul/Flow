# Changelog

Version entries describe prepared changes. The Chrome Web Store listing determines
which version is currently published; a changelog entry does not mean approval.

## [Unreleased]

- Simplify navigation with a collapsible Menu and consistent page headings.
- Unify task selection, rename the default task to General, and clarify timer,
  settings, notification, and empty-state wording.
- Show the installed extension version in Settings.
- Validate the reviewed GitHub setup policy before sending it to GitHub and reject
  authenticated API redirects.

## [1.1.0]

- Remove blur from the blocking overlay; use neutral dimming and a solid panel.

- Keep the active countdown compact with a thin progress bar, and make session
  history collapsible with five records per page.

- Refine Stats and Settings scrollbars, explain icon controls on hover, and use a
  labeled pencil icon for editing tasks.

- Use calendar Week, Month, and Year statistics with a shared task breakdown,
  correct month lengths, and future dates marked as upcoming.

- Add a Show task on home setting that hides the selector and goal progress
  without changing task selection or time tracking.

- Delete custom tasks with confirmation while preserving recorded focus time;
  Quick Focus remains the permanent default.
- Keep task selection lightweight, with one visible Edit task action per custom
  task and archive/delete controls in its editor.
- Document the visual design system and centralize timer and selection colors.

- Add CodeQL analysis to CI and security-reporting guidance.
- Add public bug-report and feature-request forms.
- Add version preparation and opt-in automated store submissions.

## [1.0.0]

Initial version submitted for Chrome Web Store review:

- Focus timers, manual breaks, and repeat-session actions.
- Optional website blocking, including already-open websites.
- Tasks, recurring goals, local statistics, and backup export/import.
