# Flow visual design guide

This is the baseline for Flow's interface. Use it before changing UI components.
It records the existing violet-and-ivory identity; it is not a new palette proposal.
The matching color tokens are in `src/style.css`.

## Direction

Calm, compact, and easy to understand. The timer is the main action. Supporting
screens should help people choose a task or understand their time without adding
dashboard clutter. Use typography, spacing, and consistent states instead of
decorative illustrations, rewards, or gamification.

Keep the popup 300px wide. Do not enlarge it to accommodate controls. Use words for
unfamiliar management actions. The task-edit pencil is an intentional icon-only
control, with a hover tooltip and accessible name explaining its purpose.

## Voice and wording

Flow sounds calm, natural, and direct. Use short sentences and everyday words.
Use the name sparingly: “In flow” can label the running timer, but keep actions
literal, such as “Take a break”, “Repeat session”, and “Delete task”. Never turn
task names, statistics, or destructive actions into metaphors.

Prefer helpful context over slogans. Explain what happens next, especially when
time stops, a session ends, or data is deleted. Avoid pressure, praise, rewards,
technical terms such as “focus target”, and decorative dashes in headings.
Keep labels consistent across the popup, notifications, and blocked websites.
Show the installed version in the Settings footer using
`chrome.runtime.getManifest().version`; never hardcode it.
The timer invitation says “Get Flowing”; its action says “Start timer”.
Settings labels say “Default focus duration” and “Default break duration” so
people understand these values apply to future sessions.
The default task is “General”. Its supporting text shows time recorded today. Use “Add task”
for creation. Do not add instructions about editing tasks; the pencil's tooltip
and accessible name explain its action.

Use one labeled Menu disclosure for Timer, Tasks, Statistics, and Settings.
Keep it closed initially and close it on selection, Escape, and outside clicks.
Show the Flow wordmark only on the timer. Secondary pages use their title in
the same header position: Your Tasks, Your Focus, and Your Flow (Settings).
Do not stack a page title beneath the wordmark or introduce a large back bar.
Both task entry points open the same screen. The task editor alone has a compact
Back to tasks control and a secondary heading. Empty statistics describe the
missing data; direct people to Timer in the menu rather than saying a session
starts on the statistics page.

## Color roles

Use colors by role, not by choosing a new shade for each screen.

| Role             | CSS token                               | Light appearance      | Usage                                      |
| ---------------- | --------------------------------------- | --------------------- | ------------------------------------------ |
| Canvas           | `--bg`                                  | `#e4dcfa`             | Overall lavender background                |
| Surface          | `--surface`                             | `#f7f2ff`             | Unselected cards and controls              |
| Text             | `--ink`                                 | `#3b2e56`             | Headings and readable body text            |
| Secondary text   | `--muted`                               | `#65587d`             | Supporting labels and metadata             |
| Divider          | `--line`                                | `#c5b5e1`             | Borders and separation                     |
| Accent           | `--accent`                              | `#7052b5`             | Focus outlines, progress, and text actions |
| Soft accent      | `--soft`                                | `#d6c9ef`             | Existing subtle highlights                 |
| Destructive      | `--danger`                              | `#a13d5d`             | Delete actions and errors                  |
| Selection        | `--selection-start` / `--selection-end` | `#7656b2` → `#60418f` | Selected task only                         |
| Selected text    | `--selection-ink` / `--selection-muted` | `#ffffff` / `#f1e9ff` | Text on a selected task                    |
| Timer surface    | `--timer-top` / `--timer-bottom`        | `#fffefa` → `#f3edf7` | Large ivory start button                   |
| Timer text       | `--timer-ink` / `--timer-muted`         | `#49375f` / `#6d5a80` | Timer digits and labels                    |
| Warm action      | `--action-bg` / `--action-hover`        | `#ffd6b1` / `#ffe4ca` | Existing primary save/session controls     |
| Warm action text | `--action-ink`                          | `#49345d`             | Text on those warm controls                |

The warm accent is already part of existing save/session controls. Do not spread it
to every card, task action, or chart. The light-theme timer stays ivory. Ordinary Add task and
Edit task actions use the surface/accent roles, not a new dominant color.

Only the timer, selected task, and existing Today summary use subtle gradients.
Keep graphs within the violet family. Do not add blue, green, gold, or another
palette as an isolated visual experiment.

### Dark appearance

The same roles are overridden in the explicit dark theme and the system-dark
media query. Keep these two overrides synchronized.

| Token       | Dark appearance |
| ----------- | --------------- |
| `--bg`      | `#28203c`       |
| `--surface` | `#382e4d`       |
| `--ink`     | `#f7efff`       |
| `--muted`   | `#d2c2e6`       |
| `--line`    | `#5a496f`       |
| `--accent`  | `#e5baff`       |
| `--soft`    | `#4c3b64`       |
| `--danger`  | `#ffc4b7`       |

In dark appearance, the timer and Today summary use deep plum gradients
(`#453657` to `#382c4b`) with pale text (`#f7efff`) and muted lavender captions
(`#d2c2e6`). Hover uses `#514064` to `#443355`; borders use `#6a527e` and the
inset highlight stays faint. Warm actions use muted rose-plum (`#68465b`, hover
`#78546a`) with pale warm text. The canvas wash is a faint violet, not peach.
Apply these roles to explicit dark and system-dark equally, including hover and
press states. Never leave large white or ivory cards in dark mode. Selected
violet surfaces retain white text. Light appearance keeps its existing palette.

## Typography and spacing

- Keep the existing local font stack: Trebuchet MS, Segoe UI, Arial, sans-serif.
  No downloaded fonts.
- Timer digits are the dominant type. Page headings are approximately 23–24px,
  card titles 12–13px, and supporting text 10–12px.
- Use tabular digits for time and statistics. Wrap long task names rather than
  hiding important information or widening the popup.
- Use the established 4, 8, 12, 16, and 24px spacing rhythm. Preserve the existing
  18px task-list gaps and 24px horizontal popup padding.
- Standard cards have 16px corners; small controls use 8–10px; larger summaries
  use 24px; the timer uses 28px. Do not invent a new radius for every control.
- Give text actions usable targets of at least 36px high, normally 40–44px for
  prominent actions. Avoid tiny unlabeled arrows or icon-only management toggles.
- Use the solid, fluid interaction style: opaque surfaces, soft elevation, and
  brief 180ms ease-out transitions using the shared motion tokens. The timer uses
  a stronger soft compression and rounded corners on press, with a 420ms spring
  release. Screens and countdowns appear immediately, without entrance animation,
  translation, scaling, or bouncing. The navigation menu opens without an entrance
  animation, and switch knobs stretch briefly while pressed.
  Avoid hard pedestal shadows, glass, and backdrop blur.
  Reduced-motion mode removes transitions, stretching,
  compression, and corner changes.

## Component rules

### Pointer response

Mouse movement pushes a damped surface field that changes light and violet shading
across the background and inside controls. Preserve the original vigorous wave
response: direct pointer pressure and lively outward propagation. Do not replace
it with heavy damping, directional transport, or a smoothed trailing current.
Use one faint, pointer-transparent
canvas above the surfaces. Boxes, text, and hit targets remain stationary; never
translate them, distort glyphs, blur content, or emit rings/particles. Keep the
existing button press feedback separate. Use a coarse bounded simulation, no
React updates per movement, and stop rendering once the surface settles (at most
180 frames after movement). Settings includes **Liquid surface effect**, enabled
by default and saved locally. Turning it off removes the canvas and its listeners
immediately. Reduced motion and touch disable and clear the effect too. This
belongs to the popup only, never the website blocking overlay.

### Home

The task selector sits above one large ivory timer button. Starting focus happens
by clicking the time itself. The optional duration selector stays below it. Do not
add a second competing start action or decorative progress metaphor.

Show task on home is enabled by default. Turning it off removes the task selector
and its goal progress without reserving empty space or changing the selected task.
The Menu > Tasks action remains available. Reuse the existing Settings
toggle style and explain that hiding a task does not stop its time attribution.

### Running countdown

Keep the running countdown compact on the existing canvas: a label, large remaining
time, a quiet elapsed-time caption, and a thin linear progress bar. Do not add a
large enclosing card, circular dial, or separate timing-detail panels.

The countdown is not a button. Do not add pause, finish, extension, or break controls
during the protected countdown. No blinking, pulsing, rotating decoration, or
continuous attention-seeking animation. Progress transitions follow the existing
reduced-motion rule.

### Tasks

Keep selection lightweight: Add task above the list, an Archived tasks text link,
and General as the permanent default. No full-width management toolbar, filter
tabs with counters, or repeated Rename/Archive/Delete action bars.

Each custom row has one visible **pencil icon**, separate from its task selection
button, in a 36px target. It has an **Edit task: [name]** native hover tooltip and
matching accessible name. Choosing a task selects it; the pencil opens its details. Never
nest buttons. Show the selected task with the established violet fill and a check,
not only a check on an unchanged surface.

The editor contains the task name, goal settings, and labeled **Archive task** and
**Delete task** actions. Deletion needs a separate confirmation that explains what
happens to history and a running timer. General has no edit or delete action.
Do not replace clear labels with an unexplained sliders icon or ellipsis menu.

### Statistics

Use an ivory Today card, a violet
graph, and compact supporting totals. Keep the graph ahead of secondary metrics.
Use one Day / Week / Month / Year dropdown and explicit date ranges. Day bars
represent local hours, including 23/25-hour daylight-saving days. Weeks start Monday;
week/month bars represent days, and year bars represent months. Graph totals and
Focus by task use the same period and navigation. Previous remains available for
empty earlier periods; Next returns toward the current period and is disabled
only at the current period. Do not add a separate date picker
or independent period selector to the task breakdown. Mark future buckets as
upcoming with dashed tracks and text, rather than treating them as missed focus.
Keep Today and clearly labeled all-time summaries separate from the selected
period. All sessions remains an all-history list with years included in dates.
Keep All sessions collapsed by default with a native, keyboard-accessible summary.
Show at most five sessions at a time inside it, with Newer / Older pagination.
Collapsing hides the records, and reopening starts at the newest page. Do not append
an ever-growing list or introduce competing chart colors.

### Website blocking overlay

Use a neutral opacity-only backdrop (`rgba(0,0,0,.45)`) and a solid surface panel
matching `--surface`, with the existing text and border colors. Keep the underlying
website sharp. No backdrop filters, blur, foggy shadows, movement, or fades. The
modal must lock document scrolling and intercept wheel/touch gestures outside the
warning, including gestures over nested feeds. Contain scrolling inside the
warning on small screens; stop page keyboard handlers while it is open. Restore
the page's original inline scroll styles and remove input guards when it closes.
This requires no additional extension permissions. The
overlay's isolated stylesheet uses literal matching colors because Chrome injects
the function without the popup stylesheet. Preserve modal blocking, keyboard
protection, partial-time interruption, and automatic removal at the focus target.

### States and feedback

Give icon-only controls native hover titles and accessible names; do not rely on
the icon alone. Native titles avoid clipping tooltips inside scroll containers.
Keep vertical scrollbars thin, with rounded thumbs using the existing divider and
accent colors. Reserve a stable scrollbar gutter and a content gap in Stats and
Settings; avoid horizontal scrolling and overlapping form controls.

Selection must change both appearance and accessible state. Keyboard focus must
remain visible. Disabled controls must not look actionable. Errors use the danger
role plus explanatory text. Never use color alone to communicate an error or
selection. Preserve meaningful labels and confirmation behavior.

## How to change the design

1. Identify the user problem and the existing component/role that should solve it.
2. Make the smallest coherent change. A task usability fix should not recolor the
   timer or redesign statistics.
3. Reuse CSS tokens. If a new role is truly needed, document it here and add its
   token before using it; avoid isolated hexadecimal choices in feature CSS.
4. Check the actual 300px popup, long task names, empty/selected/archived states,
   keyboard use, and both themes. Compare before/after screenshots.
5. Verify the affected interactions in tests and update this guide when the design
   contract changes. Do not overwrite unrelated user work to revert a UI experiment.

Product behavior is documented separately in [README.md](../README.md). Release
checks are in [TESTING.md](TESTING.md).
