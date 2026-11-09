# Flow Privacy Policy

Last updated: November 9, 2026

This policy describes how the Flow Chrome extension handles information. Flow
provides focus timers, optional website blocking, tasks, recurring goals, and focus
statistics. Flow does not require an account or operate a backend service.

## Information handled by Flow

Flow stores the following information locally on your device using
`chrome.storage.local`:

- Preferences, including timer durations, appearance, notification settings, and
  whether website blocking is enabled.
- Website domains you enter in your blocklist.
- Task names, optional task icons, recurring goal targets, and schedules.
- Active timer state and session history, including timestamps, focused time,
  break time, task attribution, and whether a session finished or ended early.

Flow uses this information to provide its timer, blocking, task, and statistics
features. Focus records are not keyboard, mouse, or website-interaction logs.

## Website access and browsing information

When you enable blocking and grant website access, Flow processes open-tab URLs
locally to compare their hostnames with your blocklist. Chrome also applies local
redirect rules to listed domains during focus countdowns. Flow does not save a
list of visited URLs, page titles, or browsing history.

On a listed website that is already open, Flow injects its own blocking overlay
in Chrome's isolated execution environment. It checks the page hostname and
interacts with the page to display the overlay and restrict interaction during
focus. It does not scrape, record, or transmit the page's text, images, form
entries, passwords, or other website content.

Website access is optional. You can revoke it in Chrome's extension settings.

## Permissions

- **Storage:** saves local preferences, timer state, tasks, goals, and history.
- **Alarms:** schedules session deadlines, the completion action window, and
  notification cleanup while the popup is closed.
- **Notifications:** displays focus and break alerts and lets you choose a break
  or repeat a session. Notifications can be disabled in Flow.
- **Declarative network request with host access:** redirects listed distracting
  websites to Flow's local blocking page while a focus countdown is active.
- **Scripting:** displays Flow's blocking overlay on listed websites that are
  already open, after website access has been granted.
- **Optional HTTP/HTTPS host access:** supports blocking domains chosen by you.

## Transmission, sharing, and sale

Flow does not send your tasks, preferences, session records, blocklist, or browsing
information to the developer or a remote server. It does not use analytics,
advertising services, tracking services, or cloud synchronization, and it does not
sell or share your extension data with third parties.

Flow's use of information received through Chrome APIs adheres to the Chrome Web
Store User Data Policy, including its Limited Use requirements. Information is used
only for the extension's disclosed focus, task, blocking, and statistics features.

Chrome, your operating system, GitHub, and the Chrome Web Store are separate
products governed by their own privacy policies. For example, your operating
system may display Flow's notifications. Visiting this policy on GitHub or
contacting the developer through GitHub is separate from using the extension.

## Retention and deletion

Flow has no automatic age-based deletion schedule for saved history. Local data
remains until you reset it in Flow's Settings, remove the extension, or clear its
stored data through browser or device controls. Renaming or archiving a task does
not delete its historical focus records.

Deleting a task removes its name, icon, and goal from the task catalog. Previously
recorded focus intervals retain their task identifier for accurate accounting and
are displayed as "Deleted task". If that task is running, future focused time is
assigned to Quick Focus without restarting the timer. To remove the retained
session records as well, reset Flow's data. Earlier exported backups remain
separate and may still contain the deleted task's name.

You can delete individual blocklist domains in Settings when no session is active.
To delete all information stored by Flow, end the active session and use the reset
control in Settings. Removing Flow also removes its extension-local storage.
Browser storage limits and device or browser actions can affect availability.

## Exports and imports

Exporting creates a JSON file containing your saved information on your device.
Flow does not upload that file. You control where it is stored and whether it is
shared. Exported files may contain task names, blocklist domains, and focus history;
keep them private if they contain sensitive information.

Importing reads and validates a file you select to restore saved information
locally. Resetting or removing Flow does not delete exported files or copies you
have made elsewhere; delete those separately if desired.

## Security

Flow uses Chrome's extension storage and permission mechanisms. It does not add
application-level encryption to stored data or exported JSON files. People or
software with access to your device, browser profile, or exported backups may be
able to access that information. Protect your device and backups accordingly.

## Changes to this policy

This document will be updated when Flow's information-handling practices change.
The date above identifies the latest revision. Changes that require additional
permissions or disclosures will be presented through the applicable extension and
Chrome Web Store processes.

## Contact

For privacy questions or requests, contact the publisher using the contact details
on Flow's Chrome Web Store listing, or open an issue at
[the Flow GitHub repository](https://github.com/ramarahul/Flow/issues).
GitHub issues are public: do not include private task names, browsing information,
exported backups, credentials, or other sensitive information.
